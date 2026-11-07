// Leitor do PDF "XPerformance - Relatório de Investimentos" (XP / Rico).
// Tudo roda no navegador: o arquivo nunca sai do computador do usuário.

const XPParser = (() => {
  const PDFJS_SRC = 'assets/vendor/pdfjs/pdf.js';
  const WORKER_SRC = 'assets/vendor/pdfjs/pdf.worker.js';
  let loading = null;

  function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = PDFJS_SRC;
      s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_SRC; resolve(window.pdfjsLib); };
      s.onerror = () => reject(new Error('Não foi possível carregar o leitor de PDF.'));
      document.head.appendChild(s);
    });
    return loading;
  }

  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const brlFmt = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const num = s => {
    if (s == null) return NaN;
    s = String(s).replace(/R\$|\s|%/g, '');
    if (s === '-' || s === '') return NaN;
    return parseFloat(s.replace(/\./g, '').replace(',', '.'));
  };

  // Agrupa os pedaços de texto de uma página em linhas (mesmo y), ordenadas de cima para baixo
  async function pageLines(page) {
    const tc = await page.getTextContent();
    const items = tc.items
      .filter(it => it.str && it.str.trim())
      .map(it => ({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width }));
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const lines = [];
    for (const it of items) {
      let ln = lines.find(l => Math.abs(l.y - it.y) <= 2.5);
      if (!ln) { ln = { y: it.y, items: [] }; lines.push(ln); }
      ln.items.push(it);
    }
    lines.forEach(l => {
      l.items.sort((a, b) => a.x - b.x);
      l.text = joinItems(l.items);
    });
    lines.sort((a, b) => b.y - a.y);
    return lines;
  }

  // Junta pedaços de texto: só põe espaço quando há distância real entre eles
  // (evita "In fl ação" quando o PDF usa ligaduras fi/fl)
  function joinItems(items) {
    let out = '', prev = null;
    for (const it of items) {
      if (prev) {
        const gap = it.x - (prev.x + (prev.w || 0));
        if (gap > 1.2 && !/\s$/.test(out) && !/^\s/.test(it.str)) out += ' ';
      }
      out += it.str; prev = it;
    }
    return out.replace(/\s+/g, ' ').trim();
  }

  // Classe sugerida a partir da estratégia do XPerformance
  function classeDe(estrategia, nomeAtivo) {
    const e = norm(estrategia), n = norm(nomeAtivo);
    if (/caixa|provento|saldo/.test(e)) return 'pos';
    if (/pos.?fix/.test(e)) return 'pos';
    if (/infla/.test(e)) return 'inflacao';
    if (/pre.?fix/.test(e)) return 'pre';
    if (/renda fixa (global|internacional|exterior)/.test(e)) return 'rfint';
    if (/renda variavel (global|internacional|exterior)|acoes (global|internacional)/.test(e)) return 'rvint';
    if (/renda variavel|acoes/.test(e)) return 'rvbr';
    if (/multimercado/.test(e)) return 'mm';
    if (/fundos listados|imobiliario|fii/.test(e)) return 'fl';
    if (/alternativ/.test(e)) return 'alt';
    if (/administrad/.test(e)) {
      if (/fii|imobili|renda imob/.test(n)) return 'fl';
      if (/acao|acoes|dividend|bolsa/.test(n)) return 'rvbr';
      return 'mm';
    }
    if (/internacional|global|exterior/.test(e)) return 'rvint';
    return 'pos';
  }

  async function parse(arrayBuffer, fileName = '') {
    const pdfjsLib = await loadPdfJs();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) pages.push(await pageLines(await pdf.getPage(i)));
    const allText = pages.map(p => p.map(l => l.text).join('\n')).join('\n');

    if (!/XPerformance|Relat[oó]rio de Investimentos/i.test(allText)) {
      throw new Error('Este PDF não parece ser um relatório XPerformance.');
    }

    const out = { conta: '', assessor: '', dataRef: '', cliente: '', patrimonio: NaN, estrategias: [], ativos: [], avisos: [] };

    // Cabeçalho: conta, assessor, data
    const cab = pages[0].map(l => l.text).join('\n').match(/(\d{5,})\s+(.+?)\s+(\d{2}\/\d{2}\/\d{4})/);
    if (cab) { out.conta = cab[1]; out.assessor = cab[2].trim(); out.dataRef = cab[3]; }
    const dr = allText.match(/Data de refer[eê]ncia:\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (dr) out.dataRef = dr[1];
    // Nome do cliente pelo nome do arquivo: "XPerformance - 16835562 Sabrina - Ref..."
    const fn = fileName.replace(/_/g, ' ').match(/XPerformance\s*-\s*\d+\s+(.+?)\s*-\s*Ref/i);
    if (fn) out.cliente = fn[1].trim();

    const pt = allText.match(/PATRIM[OÔ]NIO TOTAL BRUTO:?[\s\S]{0,200}?R\$\s*(-?[\d.]+,\d{2})/i);
    if (pt) out.patrimonio = num(pt[1]);

    // Composição por estratégia: "Pós Fixado (20,22%) R$ 87.079,07"
    const reComp = /([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .\-]*?)\s*\((\d{1,3},\d{2})%\)\s*R\$\s*(-?[\d.]+,\d{2})/g;
    const vistos = new Set();
    for (const p of pages) for (const l of p) {
      let m; reComp.lastIndex = 0;
      while ((m = reComp.exec(l.text))) {
        const nome = m[1].replace(/^\d[\d,%\s]*/, '').trim();
        if (vistos.has(norm(nome))) continue;
        vistos.add(norm(nome));
        out.estrategias.push({ nome, pct: num(m[2]), saldo: num(m[3]) });
      }
    }
    const nomesEstr = new Set(out.estrategias.map(e => norm(e.nome)));

    // Posição detalhada dos ativos
    const ROTULOS = /^(investimentos administrados|estrategias|legenda|posicao detalhada|m e s a t u a l|ano|24 meses)$/;
    let estrAtual = '';
    for (const p of pages) {
      const hi = p.findIndex(l => /Saldo Bruto/.test(l.text) && /Qtd/.test(l.text));
      if (hi < 0) continue;
      const hdr = p[hi];
      const saldoItem = hdr.items.find(i => /Saldo/.test(i.str));
      const corte = saldoItem ? saldoItem.x - 20 : 300;
      const rows = [], frags = [];
      for (let i = hi + 1; i < p.length; i++) {
        const l = p[i];
        if (/XPerformance|Legenda|Os dados dos ativos/i.test(l.text)) break;
        const nome = joinItems(l.items.filter(it => it.x < corte));
        const resto = joinItems(l.items.filter(it => it.x >= corte));
        const m = resto.match(/^R\$\s*(-?[\d.]+,\d{2})\s+(\S+)\s+(-?[\d.,]+%)\s+(-?[\d.,]+%|-)\s+(-?[\d.,]+%|-)\s+(-?[\d.,]+%|-)/);
        if (m) {
          const ehEstrategia = m[2] === '-' && nomesEstr.has(norm(nome));
          rows.push({ y: l.y, nome, estrategia: ehEstrategia, saldo: num(m[1]), qtd: m[2], pct: num(m[3]), rentMes: num(m[4]), rentAno: num(m[6]) });
        } else if (nome && !resto && !ROTULOS.test(norm(nome))) {
          frags.push({ y: l.y, text: nome });
        }
      }
      // Nomes quebrados em mais de uma linha: junta cada pedaço ao ativo mais próximo na vertical
      const ativosPag = rows.filter(r => !r.estrategia);
      ativosPag.forEach(r => { r.antes = []; r.depois = []; });
      for (const f of frags) {
        let best = null, dist = Infinity;
        for (const r of ativosPag) { const d = Math.abs(r.y - f.y); if (d < dist) { dist = d; best = r; } }
        if (best && dist < 25) (f.y > best.y ? best.antes : best.depois).push(f);
      }
      for (const r of rows) {
        if (r.estrategia) { estrAtual = r.nome; continue; }
        const partes = [...r.antes.sort((a, b) => b.y - a.y).map(f => f.text), r.nome, ...r.depois.sort((a, b) => b.y - a.y).map(f => f.text)];
        const nome = partes.filter(Boolean).join(' ').replace(/\s+-\s*$/, '').replace(/\s+/g, ' ').trim();
        out.ativos.push({ nome, estrategia: estrAtual, saldo: r.saldo, pct: r.pct, rentMes: r.rentMes, rentAno: r.rentAno });
      }
    }

    // Estratégias sem ativos detalhados (Caixa, Proventos...) entram como uma linha só
    for (const e of out.estrategias) {
      const soma = out.ativos.filter(a => norm(a.estrategia) === norm(e.nome)).reduce((s, a) => s + a.saldo, 0);
      if (soma === 0) {
        const nome = /caixa/i.test(e.nome) ? 'Saldo em conta (Caixa)' : /provento/i.test(e.nome) ? 'Proventos a receber' : e.nome;
        out.ativos.push({ nome, estrategia: e.nome, saldo: e.saldo, pct: e.pct, sintetico: true });
      } else if (Math.abs(soma - e.saldo) > 1) {
        out.avisos.push(`${e.nome}: a soma dos ativos (${soma.toFixed(2)}) difere do total da estratégia (${e.saldo.toFixed(2)}).`);
      }
    }
    out.ativos.forEach(a => { a.classe = classeDe(a.estrategia, a.nome); a.revisar = /administrad/i.test(a.estrategia); });

    const total = out.ativos.reduce((s, a) => s + a.saldo, 0);
    const totalEstr = out.estrategias.reduce((s, e) => s + e.saldo, 0);
    out.totalEstrategias = totalEstr;
    if (!Number.isFinite(out.patrimonio)) out.patrimonio = total;
    if (Math.abs(total - totalEstr) > 1) out.avisos.push(`A soma dos ativos lidos difere da soma das estratégias do relatório. Confira a lista.`);
    else if (Math.abs(total - out.patrimonio) > 1) out.avisos.push(`O relatório informa patrimônio bruto de ${brlFmt(out.patrimonio)}, mas a composição por estratégia soma ${brlFmt(totalEstr)} (diferença de ${brlFmt(totalEstr - out.patrimonio)}). Isso costuma acontecer com estruturas como Collar, que aparecem em duas linhas. Os percentuais aqui seguem a composição do relatório; remova a linha duplicada se preferir.`);
    if (!out.ativos.length) throw new Error('Não encontrei a "Posição detalhada dos ativos" neste PDF.');
    return out;
  }

  return { parse, classeDe };
})();
