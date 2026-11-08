// Análise de ações e FIIs
const $ = id => document.getElementById(id);
const RE_TICKER = /\b([A-Z]{4}\d{1,2}B?)\b/;
const ESTRUTURADA = /collar|financiamento|termo|op[cç][aã]o|box|coe|trava|fence/i;
const SETOR = {
  'Basic Materials': 'Materiais básicos', 'Communication Services': 'Comunicação', 'Consumer Cyclical': 'Consumo cíclico',
  'Consumer Defensive': 'Consumo não cíclico', 'Energy': 'Petróleo e energia', 'Financial Services': 'Financeiro',
  'Healthcare': 'Saúde', 'Industrials': 'Bens industriais', 'Real Estate': 'Imobiliário', 'Technology': 'Tecnologia', 'Utilities': 'Utilidade pública',
};
const CONSENSO = {
  strong_buy: ['Compra forte', 'good'], buy: ['Compra', 'good'], hold: ['Neutro', 'warn'],
  underperform: ['Abaixo do mercado', 'bad'], sell: ['Venda', 'bad'], strong_sell: ['Venda forte', 'bad'],
};

let D = { ativos: {} }, NOT = null;
let R = Object.assign({ nome: '', conta: '', email: '', dataRef: '', ativos: [], naoListados: [], coment: '' }, store.get('rw_rv_atual', {}));
const salvar = () => store.set('rw_rv_atual', R);
const pmKey = () => (R.conta || R.nome || 'sem-cliente').trim();
const PM = () => store.get('rw_pm', {});
function getPm(t) { return PM()[pmKey()]?.[t]; }
function setPm(t, v) { const all = PM(); all[pmKey()] = all[pmKey()] || {}; if (v) all[pmKey()][t] = v; else delete all[pmKey()][t]; store.set('rw_pm', all); }

const num2 = (x, d = 2) => Number.isFinite(x) ? x.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
const tipoFii = d => {
  const s = `${d.mandato || ''} ${d.seg || ''}`.toLowerCase();
  if (/h[ií]brido/.test(s)) return 'Híbrido';
  if (/t[ií]tulos|receb|cri/.test(s)) return 'Papel';
  if (/fundo de fundos|fof|cotas de fii/.test(s)) return 'Fundo de fundos';
  return 'Tijolo';
};

// ---------- Monta as linhas com indicadores ----------
function linhas() {
  return R.ativos.map(a => {
    const d = D.ativos[a.ticker] || {};
    const preco = d.p ?? (a.saldoPdf && a.qtd ? a.saldoPdf / a.qtd : null);
    const pos = preco && a.qtd ? preco * a.qtd : (a.saldoPdf || 0);
    const pm = parseNum(getPm(a.ticker));
    const res = pm > 0 && preco ? (preco / pm - 1) * 100 : null;
    const resR = pm > 0 && preco ? (preco - pm) * a.qtd : null;
    const zerar = res != null && res < 0 ? (pm / preco - 1) * 100 : null;
    const tipo = d.t || (/11$/.test(a.ticker) ? 'fii' : 'acao');
    const upside = d.alvo && preco ? (d.alvo / preco - 1) * 100 : null;
    return { ...a, d, preco, pos, pm, res, resR, zerar, tipo, upside, semCot: !d.p };
  });
}

// ---------- Renderização ----------
function renderInfo() {
  const carteira = store.get('rw_carteira_atual', null);
  $('btnUsar').hidden = !(carteira && carteira.ativos?.length);
  $('info').innerHTML = R.dataRef ? `<span class="pill good">✓ XPerformance importado</span> <span class="pill">Ref. ${esc(R.dataRef)}</span> <span class="pill">${R.ativos.length} ativos de RV listados</span>` : '';
  $('atual').textContent = D.atualizado ? 'cotações de ' + new Date(D.atualizado).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
}

function consensoHtml(d) {
  const c = CONSENSO[d.rec];
  if (!c) return '<span class="muted">—</span>';
  return `<span class="pill ${c[1]}">${c[0]}</span>${d.nAn ? `<div class="sub">${d.nAn} analistas</div>` : ''}`;
}
const varHtml = v => Number.isFinite(v) ? `<span class="${v >= 0 ? 'v-up' : 'v-down'}">${v >= 0 ? '▲' : '▼'} ${num2(Math.abs(v))}%</span>` : '';
const resHtml = l => l.res == null ? '<span class="muted">—</span>' : `<b class="${l.res >= 0 ? 'good' : 'bad'}">${l.res >= 0 ? '+' : ''}${num2(l.res)}%</b><div class="sub">${l.resR >= 0 ? '+' : ''}${brl(l.resR)}</div>`;
const pmInput = l => `<input class="pm" data-pm="${esc(l.ticker)}" inputmode="decimal" placeholder="PM" value="${esc(getPm(l.ticker) || '')}">`;
const delBtn = l => `<button class="danger no-print" data-del="${l.id}" title="Remover">✕</button>`;

function render() {
  const L = linhas(), acoes = L.filter(l => l.tipo !== 'fii'), fiis = L.filter(l => l.tipo === 'fii');
  const total = L.reduce((s, l) => s + l.pos, 0) + R.naoListados.reduce((s, n) => s + n.saldo, 0);
  const listados = L.reduce((s, l) => s + l.pos, 0);
  const renda = L.reduce((s, l) => s + (l.d.dy ? l.pos * l.d.dy / 100 : 0), 0);
  const comPm = L.filter(l => l.resR != null), resTot = comPm.reduce((s, l) => s + l.resR, 0), custo = comPm.reduce((s, l) => s + l.pm * l.qtd, 0);
  const maior = L.slice().sort((a, b) => b.pos - a.pos)[0];
  $('kpis').innerHTML = `
    <div class="kpi"><div class="l">Renda variável</div><div class="v">${brl(total)}</div><div class="s">${L.length} listados${R.naoListados.length ? ` + ${R.naoListados.length} sem cotação` : ''}</div></div>
    <div class="kpi ${comPm.length ? '' : ''}"><div class="l">Resultado (com PM informado)</div><div class="v ${resTot >= 0 ? 'good' : 'bad'}">${comPm.length ? (resTot >= 0 ? '+' : '') + brl(resTot) : '—'}</div><div class="s">${comPm.length ? `${pct(resTot / custo * 100)} sobre o custo · ${comPm.length} de ${L.length} ativos` : 'informe o preço médio na tabela'}</div></div>
    <div class="kpi orange"><div class="l">Renda estimada em 12 meses</div><div class="v">${brl(renda)}</div><div class="s">${listados ? `dividend yield médio ${pct(renda / listados * 100)}` : ''} · ${brl(renda / 12)}/mês</div></div>
    <div class="kpi"><div class="l">Maior posição</div><div class="v" style="font-size:17px">${maior ? esc(maior.ticker) : '—'}</div><div class="s">${maior && total ? pct(maior.pos / total * 100, 1) + ' da RV' : ''}</div></div>`;

  $('tAcoes').innerHTML = acoes.length ? `<thead><tr><th>Ativo</th><th class="n">Qtd</th><th class="n">Preço</th><th class="n">Posição</th><th class="n">Preço médio</th><th class="n">Resultado</th><th class="n">Alta p/ zerar</th><th class="n">DY 12m</th><th class="n">P/L</th><th class="n">P/VP</th><th>Consenso</th><th class="n">Preço-alvo</th><th></th></tr></thead>
    <tbody>${acoes.map(l => `<tr>
      <td><div class="tk">${esc(l.ticker)}</div><div class="sub">${esc(l.tipo === 'etf' ? 'ETF · ' + (l.d.n || '') : (SETOR[l.d.setor] || l.d.setor || '') + (l.d.ind ? ' · ' + l.d.ind : ''))}</div></td>
      <td class="n">${(l.qtd || 0).toLocaleString('pt-BR')}</td>
      <td class="n">${l.preco ? 'R$ ' + num2(l.preco) : '—'}<div>${l.semCot ? '<span class="sub">preço do relatório</span>' : varHtml(l.d.v)}</div></td>
      <td class="n">${brl(l.pos)}<div class="sub">${total ? pct(l.pos / total * 100, 1) : ''}</div></td>
      <td class="n">${pmInput(l)}</td>
      <td class="n">${resHtml(l)}</td>
      <td class="n">${l.zerar != null ? `<b class="warn">+${num2(l.zerar)}%</b>` : '<span class="muted">—</span>'}</td>
      <td class="n">${l.d.dy != null ? pct(l.d.dy) : '—'}</td>
      <td class="n">${l.d.pl > 0 ? num2(l.d.pl, 1) : '—'}</td>
      <td class="n">${l.d.pvp > 0 ? num2(l.d.pvp, 2) : '—'}</td>
      <td>${consensoHtml(l.d)}</td>
      <td class="n">${l.d.alvo ? 'R$ ' + num2(l.d.alvo) + `<div class="${l.upside >= 0 ? 'v-up' : 'v-down'}">${l.upside >= 0 ? '+' : ''}${num2(l.upside, 1)}%</div>` : '—'}</td>
      <td>${delBtn(l)}</td></tr>`).join('')}</tbody>` : '<tbody><tr><td class="note">Nenhuma ação ou ETF.</td></tr></tbody>';

  $('tFiis').innerHTML = fiis.length ? `<thead><tr><th>Fundo</th><th class="n">Qtd</th><th class="n">Preço</th><th class="n">Posição</th><th class="n">Preço médio</th><th class="n">Resultado</th><th class="n">Alta p/ zerar</th><th class="n">DY 12m</th><th class="n">P/VP</th><th class="n">Vacância</th><th>Tipo · segmento</th><th>Administrador</th><th></th></tr></thead>
    <tbody>${fiis.map(l => `<tr>
      <td><div class="tk">${esc(l.ticker)}</div><div class="sub">${esc(l.d.n || '')}</div></td>
      <td class="n">${(l.qtd || 0).toLocaleString('pt-BR')}</td>
      <td class="n">${l.preco ? 'R$ ' + num2(l.preco) : '—'}<div>${l.semCot ? '<span class="sub">preço do relatório</span>' : varHtml(l.d.v)}</div></td>
      <td class="n">${brl(l.pos)}<div class="sub">${total ? pct(l.pos / total * 100, 1) : ''}</div></td>
      <td class="n">${pmInput(l)}</td>
      <td class="n">${resHtml(l)}</td>
      <td class="n">${l.zerar != null ? `<b class="warn">+${num2(l.zerar)}%</b>` : '<span class="muted">—</span>'}</td>
      <td class="n">${l.d.dy != null ? pct(l.d.dy) + (l.d.dyEst ? '<div class="sub">estimado</div>' : '') : '—'}</td>
      <td class="n">${l.d.pvp > 0 ? `<b class="${l.d.pvp > 1.1 ? 'bad' : l.d.pvp < 0.9 ? 'good' : ''}">${num2(l.d.pvp)}</b>` : '—'}</td>
      <td class="n">${l.d.vac != null ? `<span class="${l.d.vac > 15 ? 'bad' : ''}">${pct(l.d.vac, 1)}</span>` : '<span class="muted">—</span>'}</td>
      <td><span class="pill">${l.d.t === 'fii' ? tipoFii(l.d) : '—'}</span><div class="sub">${esc(l.d.seg || '')}</div></td>
      <td><div class="sub">${esc(l.d.adm || '')}</div><div class="sub">${esc(l.d.gestao ? 'Gestão ' + l.d.gestao.toLowerCase() : '')}</div></td>
      <td>${delBtn(l)}</td></tr>`).join('')}</tbody>` : '<tbody><tr><td class="note">Nenhum FII listado.</td></tr></tbody>';

  $('cardNL').hidden = !R.naoListados.length;
  $('tNL').innerHTML = `<thead><tr><th>Ativo</th><th>Estratégia</th><th class="n">Saldo</th><th class="n">Rent. no ano</th></tr></thead><tbody>${R.naoListados.map(nl => `<tr><td>${esc(nl.nome)}</td><td><span class="pill">${esc(nl.estrategia)}</span></td><td class="n">${brl(nl.saldo)}</td><td class="n">${Number.isFinite(nl.rentAno) ? pct(nl.rentAno) : '—'}</td></tr>`).join('')}</tbody>`;

  renderAlertas(L, total);
  renderNoticias(L);
}

function alertas(L, total) {
  const out = [];
  L.forEach(l => {
    const peso = total ? l.pos / total * 100 : 0;
    if (peso > 25) out.push(['warn', `Concentração alta em <b>${l.ticker}</b>: ${pct(peso, 1)} da renda variável.`]);
    if (l.res != null && l.res < -15) out.push(['bad', `<b>${l.ticker}</b> com prejuízo de ${num2(Math.abs(l.res))}%; precisa subir ${num2(l.zerar)}% para voltar ao preço médio. Vale reavaliar a tese ou simular uma troca.`]);
    const c = l.d.rec;
    if (c === 'underperform' || c === 'sell' || c === 'strong_sell') out.push(['bad', `<b>${l.ticker}</b>: consenso de analistas "${CONSENSO[c][0].toLowerCase()}".`]);
    if ((c === 'buy' || c === 'strong_buy') && l.upside > 25) out.push(['good', `<b>${l.ticker}</b>: consenso de compra e preço-alvo médio ${num2(l.upside, 1)}% acima do preço atual.`]);
    if (l.tipo === 'fii' && l.d.pvp > 1.1) out.push(['warn', `<b>${l.ticker}</b> negocia ${num2((l.d.pvp - 1) * 100, 0)}% acima do valor patrimonial (P/VP ${num2(l.d.pvp)}).`]);
    if (l.tipo === 'fii' && l.d.pvp > 0 && l.d.pvp < 0.85) out.push(['info', `<b>${l.ticker}</b> negocia com desconto de ${num2((1 - l.d.pvp) * 100, 0)}% sobre o valor patrimonial.`]);
    if (l.tipo === 'fii' && l.d.vac > 15) out.push(['warn', `<b>${l.ticker}</b> com vacância de ${pct(l.d.vac, 1)} no último informe trimestral.`]);
    if (l.d.max52 && l.preco && l.preco >= l.d.max52 * 0.97) out.push(['info', `<b>${l.ticker}</b> está perto da máxima de 52 semanas (R$ ${num2(l.d.max52)}).`]);
  });
  const acoes = L.filter(l => l.tipo === 'acao'), tA = acoes.reduce((s, l) => s + l.pos, 0), setores = {};
  acoes.forEach(l => { const s = SETOR[l.d.setor] || l.d.setor; if (s) setores[s] = (setores[s] || 0) + l.pos; });
  Object.entries(setores).forEach(([s, v]) => { if (tA && v / tA > 0.4 && acoes.length > 1) out.push(['warn', `${pct(v / tA * 100, 0)} das ações estão no setor <b>${esc(s)}</b>.`]); });
  if (L.length && !L.some(l => l.tipo === 'fii')) out.push(['info', 'A carteira de RV não tem FIIs listados: podem ajudar a gerar renda mensal.']);
  if (L.some(l => l.semCot)) out.push(['info', `Sem cotação atual para ${L.filter(l => l.semCot).map(l => l.ticker).join(', ')}; usei o preço do relatório.`]);
  return out;
}
function renderAlertas(L, total) {
  const a = alertas(L, total);
  $('alertas').innerHTML = a.length ? a.map(([c, t]) => `<li class="${c}">${t}</li>`).join('') : '<li class="info">Nenhum ponto de atenção pelos critérios atuais.</li>';
}

function palavras(l) {
  const out = [l.ticker, l.ticker.replace(/\d+B?$/, '')];
  const n = (l.d.n || '').split(' - ').pop().replace(/S\.?A\.?|Holding|Participa[cç][oõ]es|Companhia|Cia\.?|Fundo de Investimento.*$/gi, '').trim();
  const p = n.split(/\s+/)[0];
  if (l.tipo === 'acao' && p && p.length >= 4 && !/^(banco|brasil|grupo|centrais|energias|cosan|ultrapar)$/i.test(p)) out.push(p);
  return [...new Set(out)];
}
async function renderNoticias(L) {
  if (!NOT) { try { NOT = await carregarDados('noticias.json'); } catch { NOT = { fontes: {} }; } }
  const todas = []; const vistos = new Set();
  Object.values(NOT.fontes || {}).flat().forEach(n => { if (!vistos.has(n.link)) { vistos.add(n.link); todas.push(n); } });
  const achadas = [];
  L.forEach(l => {
    const ps = palavras(l);
    todas.forEach(n => { if (ps.some(p => new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(n.titulo))) achadas.push({ t: l.ticker, n }); });
  });
  const uniq = []; const vs = new Set();
  achadas.sort((a, b) => (b.n.data || '').localeCompare(a.n.data || '')).forEach(x => { if (!vs.has(x.n.link)) { vs.add(x.n.link); uniq.push(x); } });
  window._noticiasRV = uniq;
  $('noticias').innerHTML = uniq.length ? uniq.slice(0, 12).map(x => `<a href="${esc(x.n.link)}" target="_blank" rel="noopener"><span class="tag">${esc(x.t)}</span>${esc(x.n.titulo)}</a>`).join('') + '<p class="note">Fonte: InfoMoney (manchetes recentes).</p>'
    : '<p class="note">Nenhuma manchete recente cita os ativos da carteira.</p>';
}

// ---------- Importação ----------
function deAtivos(lista, meta = {}) {
  const ativos = [], nl = [];
  lista.forEach(a => {
    const m = String(a.nome).match(RE_TICKER);
    const rv = ['rvbr', 'rvint', 'fl', 'alt'].includes(a.classe) || (m && /11$|\d$/.test(m[1]) && !/^(NTNB|LTNS)/.test(m[1]));
    if (!rv) return;
    if (m && !ESTRUTURADA.test(a.nome) && !/\bRL\b|feeder/i.test(a.nome) && a.qtd > 0) {
      const ex = ativos.find(x => x.ticker === m[1]);
      if (ex) { ex.qtd += a.qtd; ex.saldoPdf += parseNum(a.saldo) || 0; }
      else ativos.push({ id: uid(), ticker: m[1], qtd: a.qtd, saldoPdf: parseNum(a.saldo) || 0, origem: 'pdf' });
    } else if (['rvbr', 'rvint', 'fl', 'alt'].includes(a.classe)) {
      nl.push({ nome: a.nome, estrategia: a.estrategia || '', saldo: parseNum(a.saldo) || 0, rentAno: a.rentAno });
    }
  });
  R = { ...R, ...meta, ativos, naoListados: nl };
  salvar(); preencher(); renderInfo(); render();
  toast(`${ativos.length} ativos listados encontrados`);
}
async function importar(file) {
  if (!file) return;
  $('info').innerHTML = '<p class="note">⏳ Lendo o PDF…</p>';
  try {
    const r = await XPParser.parse(await file.arrayBuffer(), file.name);
    deAtivos(r.ativos, { nome: r.cliente || R.nome, conta: r.conta || R.conta, dataRef: r.dataRef });
  } catch (e) { $('info').innerHTML = `<p class="note bad">❌ ${esc(e.message)}</p>`; }
}
$('drop').onclick = () => $('pdfFile').click();
$('pdfFile').onchange = e => { importar(e.target.files[0]); e.target.value = ''; };
['dragover', 'dragenter'].forEach(ev => $('drop').addEventListener(ev, e => { e.preventDefault(); $('drop').classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => $('drop').addEventListener(ev, e => { e.preventDefault(); $('drop').classList.remove('over'); }));
$('drop').addEventListener('drop', e => importar(e.dataTransfer.files[0]));
$('btnUsar').onclick = () => {
  const c = store.get('rw_carteira_atual', null); if (!c) return;
  deAtivos(c.ativos.map(a => ({ ...a, saldo: parseNum(a.saldo) })), { nome: c.cliente || '', conta: c.conta || '', email: c.email || R.email, dataRef: c.dataRef || '' });
};
$('btnNovo').onclick = () => { R = { nome: '', conta: '', email: '', dataRef: '', ativos: [], naoListados: [], coment: '' }; salvar(); preencher(); renderInfo(); render(); };
$('btnAdd').onclick = () => {
  const t = $('addTk').value.toUpperCase().trim(), q = parseInt($('addQt').value.replace(/\D/g, ''), 10);
  if (!RE_TICKER.test(t) || !(q > 0)) { toast('Informe ticker e quantidade'); return; }
  const ex = R.ativos.find(a => a.ticker === t);
  if (ex) ex.qtd += q; else R.ativos.push({ id: uid(), ticker: t, qtd: q, saldoPdf: 0, origem: 'manual' });
  if ($('addPm').value) setPm(t, $('addPm').value);
  if (!D.ativos[t]) toast(`${t} ainda não está na base de cotações; aparece com dados assim que entrar.`);
  $('addTk').value = $('addQt').value = $('addPm').value = '';
  salvar(); render();
};

// ---------- Eventos ----------
function preencher() { $('nome').value = R.nome || ''; $('conta').value = R.conta || ''; $('email').value = R.email || ''; $('coment').value = R.coment || ''; }
['nome', 'conta', 'email', 'coment'].forEach(k => $(k).addEventListener('input', e => { R[k] = e.target.value; salvar(); if (k === 'conta' || k === 'nome') render(); }));
document.addEventListener('change', e => { if (e.target.dataset.pm) { setPm(e.target.dataset.pm, e.target.value.trim()); render(); } });
document.addEventListener('click', e => { const b = e.target.closest('[data-del]'); if (b) { R.ativos = R.ativos.filter(a => a.id !== b.dataset.del); salvar(); render(); } });

// ---------- E-mail ----------
$('btnEmail').onclick = () => {
  if (!R.ativos.length && !R.naoListados.length) { toast('Importe a carteira primeiro'); return; }
  const L = linhas(), total = L.reduce((s, l) => s + l.pos, 0) + R.naoListados.reduce((s, n) => s + n.saldo, 0);
  const al = alertas(L, total).map(([c, t]) => [c, t.replace(/<[^>]+>/g, '')]);
  const renda = L.reduce((s, l) => s + (l.d.dy ? l.pos * l.d.dy / 100 : 0), 0);
  const h = Email.h;
  const linhaTxt = l => `• ${l.ticker}: ${brl(l.pos)}${l.res != null ? ` · resultado ${l.res >= 0 ? '+' : ''}${num2(l.res)}%` : ''}${l.d.dy != null ? ` · DY ${pct(l.d.dy)}` : ''}${CONSENSO[l.d.rec] ? ` · consenso ${CONSENSO[l.d.rec][0].toLowerCase()}` : ''}`;
  Email.abrir({
    assunto: 'Análise da sua carteira de ações e fundos imobiliários',
    nome: R.nome, para: R.email,
    texto: (nome, ass) => [
      Email.saudacaoTexto(nome), '',
      `Fiz uma análise da sua carteira de renda variável${R.dataRef ? ` (posição de ${R.dataRef}, com cotações atualizadas)` : ''}.`, '',
      `Total em renda variável: ${brl(total)}`, `Renda estimada em 12 meses com dividendos e rendimentos: ${brl(renda)} (cerca de ${brl(renda / 12)} por mês)`, '',
      'AÇÕES E ETFs', ...L.filter(l => l.tipo !== 'fii').map(linhaTxt), '',
      'FUNDOS IMOBILIÁRIOS', ...L.filter(l => l.tipo === 'fii').map(linhaTxt), '',
      ...(al.length ? ['PONTOS DE ATENÇÃO', ...al.map(([, t]) => '• ' + t), ''] : []),
      ...(R.coment ? ['MEUS COMENTÁRIOS', R.coment, ''] : []),
      'Indicadores de fontes públicas de mercado; o consenso de analistas não representa recomendação individual. Rentabilidade passada não é garantia de rentabilidade futura.', '',
      'Fico à disposição para conversarmos.', '', 'Abraço,', ass,
    ].join('\n'),
    html: (nome, ass) => {
      const tab = (lista, fii) => h.tabela(fii ? ['Fundo', 'Posição', 'Resultado', 'DY 12m', 'P/VP'] : ['Ativo', 'Posição', 'Resultado', 'DY 12m', 'Consenso'],
        lista.map(l => [`<b>${esc(l.ticker)}</b>`, brl(l.pos),
          l.res != null ? `<span style="color:${l.res >= 0 ? h.cor.bom : h.cor.ruim}">${l.res >= 0 ? '+' : ''}${num2(l.res)}%</span>` : '—',
          l.d.dy != null ? pct(l.d.dy) : '—', fii ? (l.d.pvp ? num2(l.d.pvp) : '—') : (CONSENSO[l.d.rec]?.[0] || '—')]), ['left', 'right', 'right', 'right', 'left']);
      const ac = L.filter(l => l.tipo !== 'fii'), fi = L.filter(l => l.tipo === 'fii');
      return h.wrap(
        h.p(h.saudacao(nome)) +
        h.p(`Fiz uma análise da sua carteira de renda variável${R.dataRef ? ` (posição de ${esc(R.dataRef)}, com cotações atualizadas)` : ''}. Total em renda variável: <b>${brl(total)}</b>. Renda estimada em 12 meses: <b>${brl(renda)}</b> (cerca de ${brl(renda / 12)} por mês).`) +
        (ac.length ? h.titulo('Ações e ETFs') + tab(ac, false) : '') +
        (fi.length ? h.titulo('Fundos imobiliários') + tab(fi, true) : '') +
        (al.length ? h.titulo('Pontos de atenção') + `<ul style="margin:0 0 12px;padding-left:18px">${al.map(([, t]) => `<li style="margin-bottom:4px">${esc(t)}</li>`).join('')}</ul>` : '') +
        (R.coment ? h.titulo('Meus comentários') + h.p(esc(R.coment).replace(/\n/g, '<br>')) : '') +
        h.p('Fico à disposição para conversarmos.') + h.p('Abraço,') + h.assinatura(ass) +
        h.rodape('Indicadores de fontes públicas (Yahoo Finance e CVM). O consenso de analistas é uma média de mercado e não representa recomendação individual. Rentabilidade passada não é garantia de rentabilidade futura.'));
    },
    aoSalvarCliente: (nome, para) => { R.nome = nome || R.nome; R.email = para; preencher(); salvar(); },
  });
};

// ---------- Início ----------
(async function init() {
  preencher(); renderInfo(); render();
  try { D = await carregarDados('rv.json'); } catch { D = { ativos: {} }; }
  renderInfo(); render();
  setInterval(async () => { try { D = await carregarDados('rv.json'); renderInfo(); render(); } catch {} }, 10 * 60 * 1000);
})();
