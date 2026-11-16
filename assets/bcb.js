// Página Banco Central: lê bcb.json (GitHub Actions: séries do SGS, Boletim Focus e comunicado do Copom).
const $ = id => document.getElementById(id);
let B = null;
const n2 = (v, d = 2) => Number.isFinite(v) ? v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotM = ym => ym ? `${MESES[+ym.slice(5, 7) - 1]}/${ym.slice(2, 4)}` : '';
const dataBR = d => d ? new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('pt-BR') : '';
// gráfico da série no SGS (site do Banco Central): o mesmo link que o catálogo de dados abertos do BC usa
const linkSGS = cod => `https://www3.bcb.gov.br/sgspub/consultarvalores/consultarValoresSeries.do?method=consultarGraficoPorId&hdOidSeriesSelecionadas=${cod}`;
const TEMP = { otimo: 'Ótimo', bom: 'Bom', ok: 'OK', ruim: 'Ruim' };
const faixa = (v, lim) => { for (const [nivel, f] of lim) if (f(v)) return nivel; return 'ruim'; };

// configuração de cada indicador: significado em uma linha, temperatura (para a economia) e referência
const IND = {
  selic: {
    sig: 'Taxa básica de juros, referência para todos os juros do país. Alta segura a inflação, mas encarece o crédito e freia a economia.',
    temp: (v) => { const r = juroReal(v); return !Number.isFinite(r) ? null : faixa(r, [['otimo', x => x >= 3 && x <= 5], ['ok', x => x < 3 || x <= 7]]); },
    ref: v => { const r = juroReal(v); return `Juro real (Selic descontado o IPCA que o mercado espera para o próximo ano) de ${n2(r, 1)}%: perto de 4% é neutro; acima de 7% é muito restritivo para a economia. Para a renda fixa, juro alto é bom.`; },
    bc: /taxa b[aá]sica|taxa selic|decidiu|ciclo/i, d: 2,
  },
  ipca12: {
    sig: 'Inflação oficial: quanto os preços ao consumidor subiram em 12 meses. A meta do BC é 3%, com tolerância de 1,5% a 4,5%.',
    temp: v => faixa(v, [['otimo', x => x >= 2.5 && x <= 3.5], ['bom', x => x >= 1.5 && x <= 4.5], ['ok', x => x > 4.5 && x <= 5.5]]),
    ref: () => 'Ótimo perto da meta de 3%; bom dentro da tolerância (1,5% a 4,5%); acima do teto é preocupante.',
    bc: /infla[cç][aã]o (cheia|corrente|ao consumidor)|medidas (de infla[cç][aã]o )?subjacentes|n[uú]cleos|infla[cç][aã]o/i, banda: [1.5, 4.5], d: 2,
  },
  igpm12: {
    sig: 'Inflação medida pela FGV, sensível ao atacado e ao dólar. É o índice que reajusta muitos aluguéis e contratos.',
    temp: v => faixa(v, [['otimo', x => x >= 2 && x <= 4], ['bom', x => x >= 0 && x <= 5], ['ok', x => x >= -2 && x <= 7.5]]),
    ref: () => 'Ótimo entre 2% e 4%; acima de 7,5% pesa nos aluguéis e contratos; muito negativo indica preços no atacado em queda forte.',
    bc: /atacado|commodit|pre[cç]os? (no atacado|ao produtor)/i, d: 2,
  },
  ibcbr: {
    sig: 'Prévia mensal do PIB calculada pelo BC: mostra se a economia está crescendo (variação em 12 meses).',
    temp: v => faixa(v, [['otimo', x => x > 2.5], ['bom', x => x > 1], ['ok', x => x >= 0]]),
    ref: () => 'Acima de 2,5% é crescimento forte; entre 1% e 2,5%, moderado; abaixo de zero, a economia encolheu.',
    bc: /atividade econ[oô]mica|atividade|crescimento|desacelera|PIB/i, d: 1,
  },
  desemprego: {
    sig: 'Parcela das pessoas que procuram trabalho e não encontram (PNAD Contínua, IBGE).',
    temp: v => faixa(v, [['otimo', x => x < 6.5], ['bom', x => x < 8], ['ok', x => x <= 10]]),
    ref: () => 'Abaixo de 6,5% é mercado de trabalho apertado (bom para renda, mas pode pressionar a inflação); acima de 10% é desemprego alto.',
    bc: /mercado de trabalho|emprego|desocupa/i, d: 1,
  },
  dolar: {
    sig: 'Cotação oficial do dólar (PTAX). Dólar mais caro encarece importados e pressiona a inflação.',
    temp: (v, s) => { const x = var12(s); return Number.isFinite(x) ? faixa(x, [['otimo', y => y <= -5], ['bom', y => y <= 5], ['ok', y => y <= 15]]) : null; },
    ref: (v, s) => { const x = var12(s); return `${Number.isFinite(x) ? `Em 12 meses o dólar ${x >= 0 ? 'subiu' : 'caiu'} ${n2(Math.abs(x), 1)}%. ` : ''}Real se valorizando é ótimo para a inflação; alta acima de 15% em 12 meses é ruim.`; },
    bc: /c[aâ]mbio|cambial|d[oó]lar|moeda/i, d: 2, pre: 'R$ ',
  },
  reservas: {
    sig: 'Dólares guardados pelo BC: o colchão do país contra crises e fugas de capital.',
    temp: v => faixa(v, [['otimo', x => x > 350], ['bom', x => x > 300], ['ok', x => x > 250]]),
    ref: () => 'Acima de US$ 350 bi é colchão confortável; abaixo de US$ 250 bi deixa o país mais vulnerável.',
    bc: /ambiente externo|cen[aá]rio externo|exterior|externo/i, d: 0, pre: 'US$ ', suf: ' bi',
  },
  tc: {
    sig: 'Saldo das trocas do Brasil com o exterior (comércio, serviços e rendas) em 12 meses. Negativo: o país gasta lá fora mais do que recebe.',
    temp: v => faixa(v, [['otimo', x => x > -1.5], ['bom', x => x > -3], ['ok', x => x > -4.5]]),
    ref: () => 'Déficit até 1,5% do PIB é tranquilo; acima de 4,5% depende muito de dinheiro de fora.',
    bc: /ambiente externo|cen[aá]rio externo|externo/i, d: 2,
  },
  primario: {
    sig: 'Receitas menos despesas do setor público em 12 meses, sem contar juros. Positivo: sobra (superávit); negativo: falta (déficit).',
    temp: v => faixa(v, [['otimo', x => x > 1], ['bom', x => x >= 0], ['ok', x => x >= -1]]),
    ref: () => 'Superávit acima de 1% do PIB ajuda a estabilizar a dívida; déficit acima de 1% preocupa.',
    bc: /fiscal|contas p[uú]blicas/i, d: 2,
  },
  divida: {
    sig: 'Quanto governo federal, estados e municípios devem, em relação ao tamanho da economia.',
    temp: v => faixa(v, [['otimo', x => x < 65], ['bom', x => x < 75], ['ok', x => x <= 85]]),
    ref: () => 'Abaixo de 65% do PIB é confortável para um emergente; acima de 85% é alto e encarece o financiamento do governo.',
    bc: /fiscal|d[ií]vida|contas p[uú]blicas/i, d: 1,
  },
  credito: {
    sig: 'Quanto o total de empréstimos na economia cresceu em 12 meses.',
    temp: v => faixa(v, [['otimo', x => x >= 6 && x <= 12], ['bom', x => x >= 3 && x <= 16], ['ok', x => x >= 0 && x <= 22]]),
    ref: () => 'Entre 6% e 12% é crescimento saudável; abaixo de zero, crédito travado; acima de 22%, expansão acelerada demais.',
    bc: /cr[eé]dito/i, d: 1,
  },
  juros_credito: {
    sig: 'Juro médio cobrado nos empréstimos a famílias e empresas.',
    temp: v => faixa(v, [['otimo', x => x < 20], ['bom', x => x < 28], ['ok', x => x <= 35]]),
    ref: () => 'Quanto menor, mais barato o crédito: abaixo de 20% ao ano seria baixo para o padrão brasileiro; acima de 35% é caro.',
    bc: /cr[eé]dito|condi[cç][oõ]es financeiras/i, d: 1,
  },
  inadimplencia: {
    sig: 'Parcela dos empréstimos com atraso acima de 90 dias.',
    temp: v => faixa(v, [['otimo', x => x < 3], ['bom', x => x < 3.5], ['ok', x => x <= 4.5]]),
    ref: () => 'Abaixo de 3% é baixa; acima de 4,5% indica famílias e empresas com dificuldade para pagar.',
    bc: /inadimpl|endividamento|cr[eé]dito/i, d: 2,
  },
};
const SECOES = [
  ['💰 Juros e inflação', ['selic', 'ipca12', 'igpm12']],
  ['🏭 Atividade e emprego', ['ibcbr', 'desemprego']],
  ['🌎 Câmbio e setor externo', ['dolar', 'reservas', 'tc']],
  ['🏛️ Contas públicas', ['primario', 'divida']],
  ['💳 Crédito', ['credito', 'juros_credito', 'inadimplencia']],
];

function var12(s) {
  if (!s || s.length < 13) return NaN;
  const u = s[s.length - 1], a = s.find(p => p[0] === `${+u[0].slice(0, 4) - 1}${u[0].slice(4)}`);
  return a && a[1] ? (u[1] / a[1] - 1) * 100 : NaN;
}
function juroReal(selic) {
  const f = B?.focus?.IPCA?.anos || {};
  const ipcaEsp = f[String(new Date().getFullYear() + 1)] ?? f[String(new Date().getFullYear())];
  const ipca = Number.isFinite(ipcaEsp) ? ipcaEsp : B?.ind?.ipca12?.ult?.[1];
  return Number.isFinite(ipca) ? ((1 + selic / 100) / (1 + ipca / 100) - 1) * 100 : NaN;
}

// frase do comunicado do Copom que mais fala do tema
let FRASES = [];
function prepararCopom() {
  const t = (B?.copom?.texto || '').replace(/[\u200b\u00a0]/g, ' ');
  FRASES = t.split(/(?<=[.;])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ])/).map(s => s.replace(/\s+([.,;])/g, '$1').trim())
    .filter(s => s.length > 40 && s.length < 520 && !/Tabela|\d+,\d+\s+\d+,\d+|procedimento usual|cen[aá]rio de refer[eê]ncia|obtid[oa] pel/i.test(s)); // fora as tabelas e notas de projeção
}
function fraseBC(rx) {
  if (!FRASES.length) return '';
  let best = '', bs = 0;
  FRASES.forEach(f => { const m = f.match(new RegExp(rx.source, 'gi')); const n = m ? m.length : 0; if (n > bs) { bs = n; best = f; } });
  return best;
}

function grafico(s, cfg) {
  if (!s || s.length < 3) return '';
  const W = 360, H = 120, pl = 34, pr = 8, pt = 10, pb = 20;
  let vs = s.map(p => p[1]), lo = Math.min(...vs), hi = Math.max(...vs);
  if (cfg.banda) { lo = Math.min(lo, cfg.banda[0]); hi = Math.max(hi, cfg.banda[1]); }
  if (lo > 0 && lo / hi > 0.6 && !cfg.banda) lo = lo - (hi - lo) * 0.3; // não comprimir a curva
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
  const X = i => pl + i * (W - pl - pr) / (s.length - 1), Y = v => pt + (1 - (v - lo) / (hi - lo)) * (H - pt - pb);
  const pts = s.map((p, i) => `${X(i).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ');
  const ticks = [lo + pad, (lo + hi) / 2, hi - pad];
  const fmt = v => Math.abs(hi) >= 100 ? Math.round(v).toLocaleString('pt-BR') : n2(v, 1);
  const zero = lo < 0 && hi > 0 ? `<line x1="${pl}" x2="${W - pr}" y1="${Y(0)}" y2="${Y(0)}" stroke="#b9b5c9" stroke-dasharray="3 3"/>` : '';
  const banda = cfg.banda ? `<rect x="${pl}" width="${W - pl - pr}" y="${Y(cfg.banda[1])}" height="${Y(cfg.banda[0]) - Y(cfg.banda[1])}" fill="rgba(31,157,85,.10)"/><text x="${W - pr - 2}" y="${Y(cfg.banda[1]) + 10}" font-size="9" fill="#1f9d55" text-anchor="end">meta</text>` : '';
  const u = s.length - 1;
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${banda}
    ${ticks.map(t => `<line x1="${pl}" x2="${W - pr}" y1="${Y(t)}" y2="${Y(t)}" stroke="#eceaf2"/><text x="${pl - 4}" y="${Y(t) + 3}" font-size="9.5" fill="#8a87a0" text-anchor="end">${fmt(t)}</text>`).join('')}${zero}
    ${cfg.banda ? '' : `<polygon points="${X(0)},${H - pb} ${pts} ${X(u)},${H - pb}" fill="rgba(255,90,0,.08)"/>`}
    <polyline points="${pts}" fill="none" stroke="#ff5a00" stroke-width="2.2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    <circle cx="${X(u)}" cy="${Y(s[u][1])}" r="3.5" fill="#22105a"/>
    <text x="${pl}" y="${H - 5}" font-size="9.5" fill="#8a87a0">${rotM(s[0][0])}</text>
    <text x="${W - pr}" y="${H - 5}" font-size="9.5" fill="#8a87a0" text-anchor="end">${rotM(s[u][0])}</text></svg>`;
}
function valor(k, v, c) {
  if (!Number.isFinite(v)) return '—';
  const un = B.ind[k].un;
  if (c.pre || c.suf) return `${c.pre || ''}${n2(v, c.d)}${c.suf || ''}`;
  return `${n2(v, c.d)}<small>${un.replace('% em 12 meses', '% em 12m')}</small>`;
}
function cartao(k) {
  const x = B.ind[k], c = IND[k]; if (!x || !x.ult) return '';
  const v = x.ult[1], t = c.temp(v, x.serie), frase = fraseBC(c.bc);
  const extra = k === 'ipca12' && B.ind.ipca_mes?.ult ? ` · no mês: ${n2(B.ind.ipca_mes.ult[1])}% (${rotM(B.ind.ipca_mes.ult[0])})` : '';
  const dataTxt = x.dia && /fim_mes|selic|dolar|reservas/.test(k) ? new Date(x.dia + 'T12:00:00').toLocaleDateString('pt-BR') : rotM(x.ult[0]);
  return `<a class="ind" href="${linkSGS(x.cod)}" target="_blank" rel="noopener" title="Abrir a série ${x.cod} no site do Banco Central">
    <div class="hd"><div><div class="nm">${esc(x.nome)}</div><div class="dt">${dataTxt}${extra}</div></div>
      ${t ? `<span class="temp ${t}"><i></i>${TEMP[t]}</span>` : ''}</div>
    <div class="v">${valor(k, v, c)}</div>
    ${t ? `<div class="termo ${t}"><span></span><span></span><span></span><span></span></div>` : ''}
    <div class="sig">${esc(c.sig)}</div>
    ${grafico(x.serie, c)}
    <div class="ref">${esc(c.ref(v, x.serie))}</div>
    ${frase ? `<div class="bc"><b>O que o BC diz · Copom${B.copom?.data ? ' ' + dataBR(B.copom.data) : ''}</b>“${esc(frase)}”</div>` : ''}
    <div class="abrir">Analisar no site do Banco Central <span>série ${x.cod} ›</span></div>
  </a>`;
}
function copom() {
  const c = B.copom;
  if (!c) { $('copom').innerHTML = '<p class="note">Comunicado indisponível agora.</p>'; return; }
  const decisao = FRASES.find(f => /decidiu|taxa selic|taxa b[aá]sica/i.test(f)) || FRASES[0] || '';
  const s = B.ind.selic?.ult?.[1];
  $('copom').innerHTML = `<div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap"><span style="font-size:30px;font-weight:800">${n2(s)}%</span><span class="note">Selic ao ano${c.data ? ` · reunião de ${dataBR(c.data)}` : ''}${c.reuniao ? ` (${c.reuniao}ª)` : ''}</span></div>
    ${decisao ? `<p class="copom-t" style="margin:10px 0 0">“${esc(decisao)}”</p>` : ''}
    <p style="margin:10px 0 0"><a href="${esc(c.link || 'https://www.bcb.gov.br/publicacoes/comunicadoscopom')}" target="_blank" rel="noopener">Ler o comunicado completo no site do BC ›</a></p>`;
}
function focus() {
  const F = B.focus || {}, a0 = String(new Date().getFullYear()), a1 = String(new Date().getFullYear() + 1);
  const linhas = [['IPCA', 'IPCA (%)', 2], ['PIB Total', 'PIB (%)', 2], ['Câmbio', 'Dólar (R$)', 2], ['Selic', 'Selic no fim do ano (%)', 2]];
  const cel = (f, a, d) => {
    const v = f?.anos?.[a], p = f?.ant?.[a]; if (!Number.isFinite(v)) return '—';
    const s = Number.isFinite(p) && Math.abs(v - p) > 0.004 ? (v > p ? '<span class="seta up">▲</span>' : '<span class="seta dn">▼</span>') : '<span class="seta eq">=</span>';
    return `<b>${n2(v, d)}</b>${s}`;
  };
  const data = Object.values(F)[0]?.data;
  $('focus').innerHTML = Object.keys(F).length ? `<div class="table-wrap"><table class="focus"><thead><tr><th>Mediana do mercado</th><th class="n">${a0}</th><th class="n">${a1}</th></tr></thead><tbody>
    ${linhas.map(([k, n, d]) => `<tr><td>${n}</td><td class="n">${cel(F[k], a0, d)}</td><td class="n">${cel(F[k], a1, d)}</td></tr>`).join('')}</tbody></table></div>
    <p class="note" style="margin:6px 0 0">Projeções dos economistas consultados pelo BC${data ? `, pesquisa de ${new Date(data + 'T12:00:00').toLocaleDateString('pt-BR')}` : ''}. ▲▼ = mudança em relação à semana anterior. <a href="https://www.bcb.gov.br/publicacoes/focus" target="_blank" rel="noopener">Ver o Focus completo no site do BC ›</a></p>`
    : '<p class="note">Focus indisponível agora.</p>';
}

(async () => {
  try {
    B = await carregarDados('bcb.json');
  } catch {
    $('secoes').innerHTML = '<p class="note">Dados ainda não disponíveis. Tente de novo mais tarde.</p>'; return;
  }
  prepararCopom(); copom(); focus();
  $('legenda').innerHTML = `<span class="note" style="align-self:center">Temperatura para a economia:</span>${Object.entries(TEMP).map(([k, t]) => `<span class="temp ${k}"><i></i>${t}</span>`).join('')}`;
  $('secoes').innerHTML = SECOES.map(([t, ks]) => {
    const cards = ks.map(cartao).join('');
    return cards ? `<h2 class="sec-h">${t}</h2><div class="igrid">${cards}</div>` : '';
  }).join('');
  $('rodape').innerHTML = `Fontes: Banco Central do Brasil (SGS, Boletim Focus e comunicados do Copom); desemprego do IBGE (PNAD Contínua) e IGP-M da FGV, via SGS. Atualizado em ${new Date(B.atualizado).toLocaleDateString('pt-BR')}. A temperatura é uma referência do WorkBroker com faixas simples (explicadas em cada indicador), não uma avaliação do Banco Central.`;
})();
