// Risco de crédito da renda fixa
const $ = id => document.getElementById(id);
const FGC_TIPOS = ['CDB', 'LCI', 'LCA', 'LC', 'RDB', 'LIG', 'LH', 'DPGE'];
const TIPOS = ['CDB', 'LCI', 'LCA', 'LCD', 'LC', 'LF', 'LFS', 'LFSN', 'LIG', 'LH', 'RDB', 'DPGE', 'CRI', 'CRA', 'DEB', 'DEBENTURE', 'CCB', 'CPR'];
const LIMITE_FGC = 250000;
const MESES = { JAN: 1, FEV: 2, MAR: 3, ABR: 4, MAI: 5, JUN: 6, JUL: 7, AGO: 8, SET: 9, OUT: 10, NOV: 11, DEZ: 12 };

let C = Object.assign({ nome: '', conta: '', email: '', dataRef: '', total: 0, ativos: [], coment: '' }, store.get('rw_credito_atual', {}));
const salvar = () => store.set('rw_credito_atual', C);
let RAT = store.get('rw_ratings', {});
const salvarRat = () => store.set('rw_ratings', RAT);

const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const STOP = new Set(['BANCO', 'BCO', 'S.A.', 'S/A', 'SA', 'S.A', 'FINANCEIRA', 'CREDITO', 'FINANCIAMENTO', 'INVESTIMENTO', 'INVESTIMENTOS', 'MULTIPLO', 'CONSIGNADO', 'DE', 'DO', 'DA', 'DOS', 'E', 'COOPERATIVO', 'CIA', 'COMPANHIA', 'HOLDING', 'PARTICIPACOES', '-']);

// Lê "CDB BANCO C6 S.A. - AGO/2028 - IPC-A + 8,10%"
function analisar(nome) {
  const partes = String(nome).split(/\s+-\s+/).map(s => s.trim());
  const p0 = partes[0], tok = semAcento(p0.split(/\s+/)[0]);
  let tipo, emissor, venc = null, taxa = '';
  const iv = partes.findIndex(p => /^[A-Z]{3}\/\d{4}$/i.test(p));
  if (iv >= 0) { const [m, a] = partes[iv].toUpperCase().split('/'); venc = { ano: +a, mes: MESES[m] || 6 }; taxa = partes.slice(iv + 1).join(' - '); }
  if (/^(NTN|LTN|LFT|TESOURO)/i.test(p0)) {
    tipo = 'Tesouro'; emissor = 'Tesouro Nacional';
    const a = String(nome).match(/\b(20\d{2})\b/); if (!venc && a) venc = { ano: +a[1], mes: null };
  } else if (TIPOS.includes(tok)) {
    tipo = tok === 'DEBENTURE' ? 'DEB' : tok; emissor = p0.slice(p0.indexOf(' ') + 1).trim() || p0;
  } else if (/\bFII\b|FIAGRO|IMOBILI/i.test(nome)) {
    tipo = 'FII/Fiagro'; emissor = p0;
  } else {
    tipo = 'Fundo/outros'; emissor = p0;
    const a = String(nome).match(/\b(20\d{2})\b/); if (!venc && a) venc = { ano: +a[1], mes: null };
  }
  return { tipo, emissor, venc, taxa };
}
function chave(emissor, tipo) {
  if (tipo === 'Tesouro') return 'TESOURO NACIONAL';
  if (tipo === 'FII/Fiagro' || tipo === 'Fundo/outros') return semAcento(emissor);
  const w = semAcento(emissor).replace(/[.,]/g, ' ').split(/\s+/).filter(x => x && !STOP.has(x));
  return w[0] || semAcento(emissor);
}
function classeRating(r) {
  const s = String(r || '').toUpperCase().replace(/\(.*\)|BR|\.BR/g, '').trim();
  if (!s) return '';
  if (/^AAA|^AA[+-]?$|^AA\d/.test(s)) return 'r-good';
  if (/^A[+-]?$|^A\d$/.test(s)) return 'r-ok';
  if (/^BBB|^BAA/.test(s)) return 'r-warn';
  return 'r-bad';
}

// ---------- Agrupamento ----------
function grupos() {
  const g = {};
  C.ativos.forEach(a => { if (!a.nome || !a.saldo) return;
    const info = analisar(a.nome), k = chave(info.emissor, info.tipo);
    g[k] = g[k] || { k, nomes: {}, tipos: new Set(), itens: [], total: 0, fgc: 0 };
    g[k].nomes[info.emissor] = (g[k].nomes[info.emissor] || 0) + a.saldo;
    g[k].tipos.add(info.tipo); g[k].itens.push({ ...a, ...info }); g[k].total += a.saldo;
    if (FGC_TIPOS.includes(info.tipo)) g[k].fgc += a.saldo;
  });
  return Object.values(g).map(x => ({ ...x, nome: x.k === 'TESOURO NACIONAL' ? 'Tesouro Nacional' : Object.entries(x.nomes).sort((a, b) => b[1] - a[1])[0][0], tipos: [...x.tipos] }))
    .sort((a, b) => b.total - a.total);
}
const soberano = g => g.k === 'TESOURO NACIONAL';
const semFgcCredito = g => !soberano(g) && g.total - g.fgc > 0.5;

// ---------- Renderização ----------
function render() {
  $('info').innerHTML = '';
  const G = grupos(), rf = G.reduce((s, g) => s + g.total, 0), base = C.total || rf;
  const sob = G.filter(soberano).reduce((s, g) => s + g.total, 0);
  const fgcCob = G.reduce((s, g) => s + Math.min(g.fgc, LIMITE_FGC), 0);
  const semFgc = G.filter(g => !soberano(g)).reduce((s, g) => s + (g.total - Math.min(g.fgc, LIMITE_FGC)), 0);
  const priv = G.filter(g => !soberano(g)), maior = priv[0];
  $('kpis').innerHTML = `
    <div class="kpi"><div class="l">Renda fixa analisada</div><div class="v">${brl(rf)}</div><div class="s">${G.length} emissores · ${base ? pct(rf / base * 100, 1) + ' do patrimônio' : ''}</div></div>
    <div class="kpi"><div class="l">Risco soberano</div><div class="v">${brl(sob)}</div><div class="s">${rf ? pct(sob / rf * 100, 1) : ''} da RF (Tesouro)</div></div>
    <div class="kpi" style="background:var(--good-soft)"><div class="l">Coberto pelo FGC</div><div class="v good">${brl(fgcCob)}</div><div class="s">${rf ? pct(fgcCob / rf * 100, 1) : ''} da RF</div></div>
    <div class="kpi orange"><div class="l">Crédito privado sem FGC</div><div class="v">${brl(semFgc)}</div><div class="s">${rf ? pct(semFgc / rf * 100, 1) : ''} da RF · inclui excedentes</div></div>
    <div class="kpi"><div class="l">Maior emissor privado</div><div class="v" style="font-size:17px">${maior ? esc(maior.nome) : '—'}</div><div class="s">${maior && base ? pct(maior.total / base * 100, 1) + ' do patrimônio' : ''}</div></div>`;

  $('tEm').innerHTML = G.length ? `<thead><tr><th>Emissor</th><th>Tipo</th><th class="n">Valor</th><th class="n">% patrim.</th><th>FGC</th><th>Rating</th><th>Agência</th><th>Observação</th></tr></thead>
    <tbody>${G.map(g => {
      const r = RAT[g.k] || {}, exc = g.fgc - LIMITE_FGC;
      const fgc = soberano(g) ? '<span class="pill">Soberano</span>'
        : g.fgc ? (exc > 0 ? `<span class="pill bad">Excede ${brl(exc)}</span>` : `<span class="pill good">Coberto</span>`) + (g.total - g.fgc > 0.5 ? `<div class="sub">${brl(g.total - g.fgc)} sem FGC</div>` : '')
        : '<span class="pill warn">Sem FGC</span>';
      return `<tr data-k="${esc(g.k)}">
        <td><div class="em">${esc(g.nome)}</div><div class="ativos-em">${g.itens.map(i => `${esc(i.tipo)}${i.venc ? ' ' + (i.venc.mes ? String(i.venc.mes).padStart(2, '0') + '/' : '') + i.venc.ano : ''}${i.taxa ? ' · ' + esc(i.taxa) : ''} · ${brl(i.saldo)}`).join('<br>')}</div></td>
        <td>${g.tipos.map(t => `<span class="pill">${esc(t)}</span>`).join(' ')}</td>
        <td class="n"><b>${brl(g.total)}</b></td>
        <td class="n ${!soberano(g) && base && g.total / base > 0.2 ? 'bad' : !soberano(g) && base && g.total / base > 0.1 ? 'warn' : ''}">${base ? pct(g.total / base * 100, 1) : '—'}</td>
        <td>${fgc}</td>
        <td>${soberano(g) ? '<span class="muted">—</span>' : `<input class="rt ${classeRating(r.rating)}" data-f="rating" list="escala" value="${esc(r.rating || '')}" placeholder="—">`}</td>
        <td>${soberano(g) ? '' : `<select class="ag" data-f="agencia">${['', 'S&P', 'Fitch', "Moody's", 'Outra'].map(a => `<option ${a === (r.agencia || '') ? 'selected' : ''}>${a}</option>`).join('')}</select>`}</td>
        <td>${soberano(g) ? '' : `<input class="ob" data-f="obs" value="${esc(r.obs || '')}" placeholder="perspectiva, data…">`}</td>
      </tr>`;
    }).join('')}</tbody>` : '<tbody><tr><td class="note">Adicione os ativos de renda fixa no passo 1 para ver os emissores.</td></tr></tbody>';

  const al = alertas(G, base);
  $('alertas').innerHTML = al.length ? al.map(([c, t]) => `<li class="${c}">${t}</li>`).join('') : '<li class="info">Nenhum ponto de atenção pelos critérios atuais.</li>';
  renderVenc(G);
}

function alertas(G, base) {
  const out = [];
  G.forEach(g => {
    if (soberano(g)) return;
    const exc = g.fgc - LIMITE_FGC, peso = base ? g.total / base * 100 : 0, r = RAT[g.k]?.rating, cr = classeRating(r);
    if (exc > 0) out.push(['bad', `<b>${esc(g.nome)}</b>: ${brl(g.fgc)} em produtos com FGC, ${brl(exc)} acima do limite de R$ 250 mil por conglomerado.`]);
    if (peso > 20) out.push(['bad', `<b>${esc(g.nome)}</b> concentra ${pct(peso, 1)} do patrimônio.`]);
    else if (peso > 10) out.push(['warn', `<b>${esc(g.nome)}</b> representa ${pct(peso, 1)} do patrimônio.`]);
    if (cr === 'r-bad' || cr === 'r-warn') out.push([cr === 'r-bad' ? 'bad' : 'warn', `<b>${esc(g.nome)}</b> com rating ${esc(r)}${semFgcCredito(g) ? ', e sem cobertura do FGC em parte da posição' : ''}.`]);
    if (!r && semFgcCredito(g) && !/FII|Fundo/.test(g.tipos.join())) out.push(['info', `Preencha o rating de <b>${esc(g.nome)}</b>: ${brl(g.total - Math.min(g.fgc, LIMITE_FGC))} sem FGC.`]);
  });
  const fgcTot = G.reduce((s, g) => s + g.fgc, 0);
  if (fgcTot > 1000000) out.push(['info', `O cliente tem ${brl(fgcTot)} em produtos com FGC: lembre do teto global de R$ 1 milhão a cada 4 anos.`]);
  const ano = new Date().getFullYear();
  const prox = C.ativos.filter(a => a.nome && a.saldo).map(a => ({ a, i: analisar(a.nome) })).filter(x => x.i.venc && x.i.venc.ano <= ano + 1);
  if (prox.length) out.push(['info', `${prox.length} ativo(s) vencem até ${ano + 1} (${brl(prox.reduce((s, x) => s + x.a.saldo, 0))}): bom momento para planejar o reinvestimento.`]);
  return out;
}

function renderVenc(G) {
  const anos = {};
  G.flatMap(g => g.itens).forEach(i => { const a = i.venc ? i.venc.ano : 'Sem data'; anos[a] = (anos[a] || 0) + i.saldo; });
  const lista = Object.entries(anos).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const max = Math.max(...lista.map(x => x[1]), 1);
  $('venc').innerHTML = lista.length ? lista.map(([a, v]) => `
    <div style="display:grid;grid-template-columns:72px 1fr 110px;gap:8px;align-items:center;margin-bottom:8px">
      <b style="color:var(--indigo)">${a}</b>
      <div style="background:#eceef0;border-radius:6px;height:14px;overflow:hidden"><div style="width:${(v / max * 100).toFixed(1)}%;height:100%;background:var(--orange);border-radius:6px"></div></div>
      <span class="n" style="text-align:right;font-size:13px">${brl(v)}</span></div>`).join('') : '<p class="note">Sem dados.</p>';
}

// ---------- Importação ----------
// ---------- Lista de ativos (digitada) ----------
function desenharLista() {
  $('lista').innerHTML = C.ativos.map((a, i) => `<div class="lin" data-i="${i}"><input data-f="nome" value="${esc(a.nome)}" placeholder="CDB BANCO X - JAN/2028 - 110% CDI"><input class="vl" data-f="saldo" inputmode="decimal" value="${a.saldo ? esc(NUM2.format(a.saldo)) : ''}" placeholder="R$"><button class="danger sm" data-del type="button" title="Remover">✕</button></div>`).join('')
    || '<p class="note">Nenhum ativo ainda.</p>';
}
let rr; const renderLogo = () => { clearTimeout(rr); rr = setTimeout(render, 350); };
$('lista').addEventListener('input', e => {
  const l = e.target.closest('.lin'); if (!l) return; const a = C.ativos[+l.dataset.i];
  if (e.target.dataset.f === 'nome') a.nome = e.target.value; else a.saldo = parseNum(e.target.value) || 0;
  salvar(); renderLogo();
});
$('lista').addEventListener('click', e => {
  if (!e.target.closest('[data-del]')) return;
  C.ativos.splice(+e.target.closest('.lin').dataset.i, 1); salvar(); desenharLista(); render();
});
$('btnAdd').onclick = () => { C.ativos.push({ nome: '', saldo: 0 }); salvar(); desenharLista(); const ins = $('lista').querySelectorAll('input[data-f="nome"]'); ins[ins.length - 1].focus(); };
$('btnLimpar').onclick = () => { if (!C.ativos.length || !confirm('Apagar a lista de ativos?')) return; C.ativos = []; salvar(); desenharLista(); render(); };
$('total').addEventListener('input', e => { C.total = parseNum(e.target.value) || 0; salvar(); renderLogo(); });

function deCarteira(ativos, meta) {
  const rf = ativos.filter(a => ['pos', 'inflacao', 'pre', 'rfint'].includes(a.classe) && !/caixa|provento/i.test(a.estrategia || '') && !/saldo em conta|proventos/i.test(a.nome));
  const total = ativos.reduce((s, a) => s + (parseNum(a.saldo) || 0), 0);
  C = { ...C, ...meta, total, ativos: rf.map(a => ({ nome: a.nome, saldo: parseNum(a.saldo) || 0, estrategia: a.estrategia })) };
  salvar(); preencher(); render();
  toast(`${C.ativos.length} ativos de renda fixa`);
}

// ---------- Ratings ----------
document.addEventListener('change', e => {
  const tr = e.target.closest('#tEm tr[data-k]'); if (!tr || !e.target.dataset.f) return;
  const k = tr.dataset.k; RAT[k] = RAT[k] || {};
  RAT[k][e.target.dataset.f] = e.target.value.trim(); RAT[k].atualizado = todayISO();
  salvarRat(); render();
});
$('btnExp').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(RAT, null, 2)], { type: 'application/json' }));
  a.download = 'ratings-emissores.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
function preencher() { $('total').value = C.total ? NUM2.format(C.total) : ''; desenharLista(); $('nome').value = C.nome || ''; $('conta').value = C.conta || ''; $('email').value = C.email || ''; $('coment').value = C.coment || ''; }
['nome', 'conta', 'email', 'coment'].forEach(k => $(k).addEventListener('input', e => { C[k] = e.target.value; salvar(); }));

// ---------- E-mail ----------
$('btnEmail').onclick = () => {
  if (!C.ativos.some(a => a.nome && a.saldo)) { toast('Adicione os ativos de renda fixa primeiro'); return; }
  const G = grupos(), base = C.total || G.reduce((s, g) => s + g.total, 0), h = Email.h;
  const al = alertas(G, base).map(([c, t]) => t.replace(/<[^>]+>/g, ''));
  const fgcTxt = g => soberano(g) ? 'Soberano' : !g.fgc ? 'Não' : (g.fgc > LIMITE_FGC || g.total - g.fgc > 0.5) ? 'Parcial' : 'Sim';
  Email.abrir({
    assunto: 'Análise de risco de crédito da sua renda fixa',
    nome: C.nome, para: C.email,
    texto: (nome, ass) => [
      Email.saudacaoTexto(nome), '',
      `Fiz uma análise dos emissores da sua renda fixa${C.dataRef ? ` (posição de ${C.dataRef})` : ''}: quanto você tem em cada um, a cobertura do FGC e o rating.`, '',
      ...G.map(g => `• ${g.nome} (${g.tipos.join(', ')}): ${brl(g.total)} · ${pct(g.total / base * 100, 1)} do patrimônio · FGC: ${fgcTxt(g)}${RAT[g.k]?.rating ? ` · rating ${RAT[g.k].rating}${RAT[g.k].agencia ? ' (' + RAT[g.k].agencia + ')' : ''}` : ''}`), '',
      ...(al.length ? ['PONTOS DE ATENÇÃO', ...al.map(t => '• ' + t), ''] : []),
      ...(C.coment ? ['MEUS COMENTÁRIOS', C.coment, ''] : []),
      'O FGC garante até R$ 250 mil por CPF em cada conglomerado financeiro (CDB, LCI, LCA, LC), com teto de R$ 1 milhão a cada 4 anos. Debêntures, CRI, CRA e fundos não têm essa garantia.', '',
      'Fico à disposição para conversarmos.', '', 'Abraço,', ass,
    ].join('\n'),
    html: (nome, ass) => h.wrap(
      h.p(h.saudacao(nome)) +
      h.p(`Fiz uma análise dos emissores da sua renda fixa${C.dataRef ? ` (posição de ${esc(C.dataRef)})` : ''}: quanto você tem em cada um, a cobertura do FGC e o rating.`) +
      h.tabela(['Emissor', 'Tipo', 'Valor', '% patrim.', 'FGC', 'Rating'], G.map(g => [`<b>${esc(g.nome)}</b>`, esc(g.tipos.join(', ')), brl(g.total), pct(g.total / base * 100, 1),
        `<span style="color:${soberano(g) ? h.cor.ind : g.fgc && g.fgc <= LIMITE_FGC && g.total - g.fgc < 0.5 ? h.cor.bom : '#c77800'}">${fgcTxt(g)}</span>`,
        esc(RAT[g.k]?.rating ? RAT[g.k].rating + (RAT[g.k].agencia ? ' · ' + RAT[g.k].agencia : '') : '—')]), ['left', 'left', 'right', 'right', 'left', 'left']) +
      (al.length ? h.titulo('Pontos de atenção') + `<ul style="margin:0 0 12px;padding-left:18px">${al.map(t => `<li style="margin-bottom:4px">${esc(t)}</li>`).join('')}</ul>` : '') +
      (C.coment ? h.titulo('Meus comentários') + h.p(esc(C.coment).replace(/\n/g, '<br>')) : '') +
      h.p('Fico à disposição para conversarmos.') + h.p('Abraço,') + h.assinatura(ass) +
      h.rodape('FGC: até R$ 250 mil por CPF por conglomerado financeiro (CDB, LCI, LCA, LC, RDB, LIG), teto de R$ 1 milhão a cada 4 anos. Debêntures, CRI, CRA, LF e fundos não contam com FGC. Ratings conforme agências de classificação de risco.')),
    aoSalvarCliente: (nome, para) => { C.nome = nome || C.nome; C.email = para; preencher(); salvar(); },
  });
};

preencher(); render();
