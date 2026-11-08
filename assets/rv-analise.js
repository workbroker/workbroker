// Análise de ações e FIIs
const $ = id => document.getElementById(id);
const RE_TICKER = /\b([A-Z]{4}\d{1,2}B?)\b/;
// Operações estruturadas de RV da XP (https://conteudos.xpi.com.br/produtos-estruturados/)
const ESTRUTURAS = [
  [/collar/i, 'Collar', 'Protege o ativo contra quedas e limita o ganho máximo.'],
  [/fence/i, 'Fence', 'Proteção parcial contra quedas, normalmente sem custo, com ganho limitado.'],
  [/booster/i, 'Booster', 'Dobra a participação na alta até um teto; a queda é integral.'],
  [/step.?up/i, 'Step-up', 'Proteção parcial e ganho mínimo se o ativo não subir, com teto de ganho.'],
  [/seagull/i, 'Seagull', 'Participa da alta até um limite, com perdas só abaixo de um ponto.'],
  [/risk\s*reversal/i, 'Risk Reversal', 'Captura a alta sem comprar o ativo, assumindo a queda.'],
  [/call\s*spread|trava de alta/i, 'Call Spread', 'Participa da alta com perda máxima conhecida.'],
  [/put\s*spread|trava de baixa/i, 'Put Spread', 'Ganha com queda moderada, com perda máxima limitada.'],
  [/condor/i, 'Condor', 'Ganha um prêmio se o ativo ficar dentro de um intervalo.'],
  [/borboleta|\bfly\b/i, 'Borboleta', 'Ganha um prêmio se o ativo terminar num intervalo de preço.'],
  [/straddle/i, 'Straddle', 'Estrutura sobre a intensidade do movimento do ativo.'],
  [/strangle/i, 'Strangle', 'Estrutura sobre movimentos fortes ou laterais do ativo.'],
  [/up and (in|out)|down and (in|out)|barreira/i, 'Opção com barreira', 'Opção mais barata que só paga se a barreira for (ou não) atingida.'],
  [/financiamento|venda coberta/i, 'Financiamento', 'Venda coberta de call para rentabilizar a carteira, com proteção parcial.'],
  [/swap/i, 'Swap', 'Troca a rentabilidade de um indexador por outro.'],
  [/\bndf\b/i, 'NDF', 'Trava a taxa de câmbio para uma data futura.'],
  [/\bcall\b|\bput\b|op[cç][aã]o|op[cç][oõ]es/i, 'Opções', 'Compra ou venda de opções.'],
  [/termo/i, 'Termo', 'Compra ou venda do ativo para liquidação futura.'],
];
const estruturaDe = nome => ESTRUTURAS.find(([re]) => re.test(nome));
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
let R = Object.assign({ nome: '', conta: '', email: '', dataRef: '', ativos: [], estruturadas: [], naoListados: [], coment: '' }, store.get('rw_rv_atual', {}));
R.estruturadas = R.estruturadas || [];
const salvar = () => store.set('rw_rv_atual', R);

const num2 = (x, d = 2) => Number.isFinite(x) ? x.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
const tipoFii = d => {
  const s = `${d.mandato || ''} ${d.seg || ''}`.toLowerCase();
  if (/h[ií]brido/.test(s)) return 'Híbrido';
  if (/t[ií]tulos|receb|cri/.test(s)) return 'Papel';
  if (/fundo de fundos|fof|cotas de fii/.test(s)) return 'Fundo de fundos';
  return 'Tijolo';
};
// Nome curto e legível da empresa/fundo
function nomeCurto(n) {
  if (!n) return '';
  let s = String(n)
    .replace(/\s*-\s*RESPONSABILIDADE LIMITADA|\s*RESPONSABILIDADE LIMITADA|\s*-\s*RESP\.? LIMITADA|\bRESP\.? LIMITADA/gi, '')
    .replace(/CLASSE DE [ÍI]NDICE( INVESTIMENTO NO EXTERIOR)?/gi, '')
    .replace(/FUNDO DE INVESTIMENTO IMOBILI[ÁA]RIO|FUNDO DE [ÍI]NDICE|\bFII\b|\bRL\b/gi, '')
    .replace(/\bS\.?\s?A\.?$|\bS\/A\b|\bHolding\b/gi, '')
    .replace(/\s*-\s*$/, '').replace(/\s{2,}/g, ' ').trim();
  if (s === s.toUpperCase()) s = s.toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase()).replace(/\b(Etf|Fii|Ibovespa|Lbma|Bdr|Btg|Xp|Brl|Usd|Sp|S&p)\b/gi, w => w.toUpperCase());
  return s.length > 48 ? s.slice(0, 46) + '…' : s;
}

// ---------- Monta as linhas com indicadores ----------
function linhas() {
  return R.ativos.map(a => {
    const d = D.ativos[a.ticker] || {};
    const preco = d.p ?? (a.saldoPdf && a.qtd ? a.saldoPdf / a.qtd : null);
    const pos = preco && a.qtd ? preco * a.qtd : (a.saldoPdf || 0);
    const tipo = d.t || (/11$/.test(a.ticker) ? 'fii' : 'acao');
    const upside = d.alvo && preco ? (d.alvo / preco - 1) * 100 : null;
    return { ...a, d, preco, pos, tipo, upside, semCot: !d.p };
  });
}

// ---------- Renderização ----------
function renderInfo() {
  const carteira = store.get('rw_carteira_atual', null);
  $('btnUsar').hidden = !(carteira && carteira.ativos?.length);
  $('info').innerHTML = R.dataRef ? `<span class="pill good">✓ XPerformance importado</span> <span class="pill">Ref. ${esc(R.dataRef)}</span> <span class="pill">${R.ativos.length} ativos listados</span>${R.estruturadas.length ? ` <span class="pill">${R.estruturadas.length} estruturada(s)</span>` : ''}` : '';
  $('atual').textContent = D.atualizado ? 'cotações de ' + new Date(D.atualizado).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
}
function consensoHtml(d) {
  const c = CONSENSO[d.rec];
  if (!c) return '<span class="muted">—</span>';
  return `<span class="pill ${c[1]}">${c[0]}</span>${d.nAn ? `<div class="sub">${d.nAn} analistas</div>` : ''}`;
}
const varHtml = v => Number.isFinite(v) ? `<span class="${v >= 0 ? 'v-up' : 'v-down'}">${v >= 0 ? '▲' : '▼'} ${num2(Math.abs(v))}%</span>` : '';
const rentHtml = (r, cdi) => !Number.isFinite(r) ? '<span class="muted">—</span>'
  : `<b class="${r < 0 ? 'bad' : ''}">${r >= 0 ? '+' : ''}${num2(r)}%</b>${Number.isFinite(cdi) ? (r > 0 ? `<div class="sub ${cdi >= 100 ? 'good' : 'bad'}">${num2(cdi, 0)}% do CDI</div>` : '<div class="sub bad">abaixo do CDI</div>') : ''}`;
const acoesBtn = l => `<div class="acts no-print"><button class="b-c" data-comprar="${esc(l.ticker)}">Comprar</button><button class="b-v" data-vender="${esc(l.ticker)}" data-qtd="${l.qtd || ''}">Vender</button><button class="danger" data-del="${l.id}" title="Remover da análise">✕</button></div>`;

function render() {
  const L = linhas(), acoes = L.filter(l => l.tipo !== 'fii'), fiis = L.filter(l => l.tipo === 'fii');
  const outros = R.estruturadas.reduce((s, n) => s + n.saldo, 0) + R.naoListados.reduce((s, n) => s + n.saldo, 0);
  const listados = L.reduce((s, l) => s + l.pos, 0), total = listados + outros;
  const renda = L.reduce((s, l) => s + (l.d.dy ? l.pos * l.d.dy / 100 : 0), 0);
  const comAno = [...L.map(l => ({ s: l.saldoPdf || l.pos, r: l.rentAno, c: l.cdiAno })), ...R.estruturadas.map(e => ({ s: e.saldo, r: e.rentAno, c: e.cdiAno }))].filter(x => Number.isFinite(x.r) && x.s > 0);
  const pesoAno = comAno.reduce((s, x) => s + x.s, 0);
  const rentAno = pesoAno ? comAno.reduce((s, x) => s + x.r * x.s, 0) / pesoAno : null;
  // CDI acumulado no ano, deduzido das próprias linhas do relatório (rent. / %CDI)
  const cdis = comAno.filter(x => Number.isFinite(x.c) && x.c > 0 && x.r > 0).map(x => x.r / (x.c / 100)).sort((a, b) => a - b);
  const cdiYtd = cdis.length ? cdis[Math.floor(cdis.length / 2)] : null;
  const cdiAno = cdiYtd && rentAno != null ? rentAno / cdiYtd * 100 : null;
  const abaixo = L.filter(l => Number.isFinite(l.cdiAno) && l.cdiAno < 100).length;
  const maior = L.slice().sort((a, b) => b.pos - a.pos)[0];
  $('kpis').innerHTML = `
    <div class="kpi"><div class="l">Renda variável</div><div class="v">${brl(total)}</div><div class="s">${L.length} listados${R.estruturadas.length ? ` · ${R.estruturadas.length} estruturadas` : ''}${R.naoListados.length ? ` · ${R.naoListados.length} outros` : ''}</div></div>
    <div class="kpi"><div class="l">Rentabilidade no ano</div><div class="v ${rentAno < 0 ? 'bad' : ''}">${rentAno != null ? (rentAno >= 0 ? '+' : '') + num2(rentAno) + '%' : '—'}</div><div class="s">${cdiAno != null ? `<span class="${cdiAno >= 100 ? 'good' : 'bad'}">${num2(cdiAno, 0)}% do CDI</span> · média ponderada` : 'importe o XPerformance'}</div></div>
    <div class="kpi"><div class="l">Abaixo do CDI no ano</div><div class="v ${abaixo ? 'warn' : 'good'}">${abaixo} de ${L.length}</div><div class="s">ativos listados</div></div>
    <div class="kpi orange"><div class="l">Renda estimada em 12 meses</div><div class="v">${brl(renda)}</div><div class="s">${listados ? `DY médio ${pct(renda / listados * 100)}` : ''} · ${brl(renda / 12)}/mês</div></div>
    <div class="kpi"><div class="l">Maior posição</div><div class="v" style="font-size:17px">${maior ? esc(maior.ticker) : '—'}</div><div class="s">${maior && total ? pct(maior.pos / total * 100, 1) + ' da RV' : ''}</div></div>`;

  $('tAcoes').innerHTML = acoes.length ? `<thead><tr><th>Ativo</th><th class="n">Qtd</th><th class="n">Preço</th><th class="n">Posição</th><th class="n">Rent. mês</th><th class="n">Rent. ano</th><th class="n">DY 12m</th><th class="n">P/L</th><th class="n">P/VP</th><th>Consenso</th><th class="n">Preço-alvo</th><th></th></tr></thead>
    <tbody>${acoes.map(l => `<tr>
      <td><div class="tkr">${esc(l.ticker)}</div><div class="emp">${esc(nomeCurto(l.d.n))}</div><div class="sub">${esc(l.tipo === 'etf' ? 'ETF' : (SETOR[l.d.setor] || l.d.setor || '') + (l.d.ind ? ' · ' + l.d.ind : ''))}</div></td>
      <td class="n">${(l.qtd || 0).toLocaleString('pt-BR')}</td>
      <td class="n">${l.preco ? 'R$ ' + num2(l.preco) : '—'}<div>${l.semCot ? '<span class="sub">preço do relatório</span>' : varHtml(l.d.v)}</div></td>
      <td class="n">${brl(l.pos)}<div class="sub">${total ? pct(l.pos / total * 100, 1) : ''}</div></td>
      <td class="n">${rentHtml(l.rentMes, l.cdiMes)}</td>
      <td class="n">${rentHtml(l.rentAno, l.cdiAno)}</td>
      <td class="n">${l.d.dy != null ? pct(l.d.dy) : '—'}</td>
      <td class="n">${l.d.pl > 0 ? num2(l.d.pl, 1) : '—'}</td>
      <td class="n">${l.d.pvp > 0 ? num2(l.d.pvp, 2) : '—'}</td>
      <td>${consensoHtml(l.d)}</td>
      <td class="n">${l.d.alvo ? 'R$ ' + num2(l.d.alvo) + `<div class="${l.upside >= 0 ? 'v-up' : 'v-down'}">${l.upside >= 0 ? '+' : ''}${num2(l.upside, 1)}%</div>` : '—'}</td>
      <td>${acoesBtn(l)}</td></tr>`).join('')}</tbody>` : '<tbody><tr><td class="note">Nenhuma ação ou ETF.</td></tr></tbody>';

  $('tFiis').innerHTML = fiis.length ? `<thead><tr><th>Fundo</th><th class="n">Qtd</th><th class="n">Preço</th><th class="n">Posição</th><th class="n">Rent. mês</th><th class="n">Rent. ano</th><th class="n">DY 12m</th><th class="n">P/VP</th><th class="n">Vacância</th><th>Tipo · segmento</th><th>Administrador</th><th></th></tr></thead>
    <tbody>${fiis.map(l => `<tr>
      <td><div class="tkr">${esc(l.ticker)}</div><div class="emp">${esc(nomeCurto(l.d.n))}</div></td>
      <td class="n">${(l.qtd || 0).toLocaleString('pt-BR')}</td>
      <td class="n">${l.preco ? 'R$ ' + num2(l.preco) : '—'}<div>${l.semCot ? '<span class="sub">preço do relatório</span>' : varHtml(l.d.v)}</div></td>
      <td class="n">${brl(l.pos)}<div class="sub">${total ? pct(l.pos / total * 100, 1) : ''}</div></td>
      <td class="n">${rentHtml(l.rentMes, l.cdiMes)}</td>
      <td class="n">${rentHtml(l.rentAno, l.cdiAno)}</td>
      <td class="n">${l.d.dy != null ? pct(l.d.dy) + (l.d.dyEst ? '<div class="sub">estimado</div>' : '') : '—'}</td>
      <td class="n">${l.d.pvp > 0 ? `<b class="${l.d.pvp > 1.1 ? 'bad' : l.d.pvp < 0.9 ? 'good' : ''}">${num2(l.d.pvp)}</b>` : '—'}</td>
      <td class="n">${l.d.vac != null ? `<span class="${l.d.vac > 15 ? 'bad' : ''}">${pct(l.d.vac, 1)}</span>` : '<span class="muted">—</span>'}</td>
      <td><span class="pill">${l.d.t === 'fii' ? tipoFii(l.d) : '—'}</span><div class="sub">${esc(l.d.seg || '')}</div></td>
      <td><div class="sub">${esc(l.d.adm || '')}</div><div class="sub">${esc(l.d.gestao ? 'Gestão ' + l.d.gestao.toLowerCase() : '')}</div></td>
      <td>${acoesBtn(l)}</td></tr>`).join('')}</tbody>` : '<tbody><tr><td class="note">Nenhum FII listado.</td></tr></tbody>';

  $('cardEst').hidden = !R.estruturadas.length;
  $('tEst').innerHTML = `<thead><tr><th>Estrutura</th><th>Ativo-objeto</th><th class="n">Saldo</th><th class="n">Rent. mês</th><th class="n">Rent. ano</th><th>Como funciona</th></tr></thead><tbody>${R.estruturadas.map(e => {
    const d = D.ativos[e.objeto] || {};
    return `<tr><td><b>${esc(e.estrutura)}</b><div class="sub">${esc(e.nome)}</div></td>
      <td>${e.objeto ? `<b class="tkr" style="font-size:14px">${esc(e.objeto)}</b>${d.p ? `<div class="sub">R$ ${num2(d.p)} ${varHtml(d.v)}</div>` : ''}` : '—'}</td>
      <td class="n">${brl(e.saldo)}</td><td class="n">${rentHtml(e.rentMes, e.cdiMes)}</td><td class="n">${rentHtml(e.rentAno, e.cdiAno)}</td>
      <td><div class="sub" style="max-width:280px">${esc(e.descricao)}</div></td></tr>`;
  }).join('')}</tbody>`;

  $('cardNL').hidden = !R.naoListados.length;
  $('tNL').innerHTML = `<thead><tr><th>Ativo</th><th>Estratégia</th><th class="n">Saldo</th><th class="n">Rent. mês</th><th class="n">Rent. ano</th></tr></thead><tbody>${R.naoListados.map(nl => `<tr><td>${esc(nl.nome)}</td><td><span class="pill">${esc(nl.estrategia)}</span></td><td class="n">${brl(nl.saldo)}</td><td class="n">${rentHtml(nl.rentMes, nl.cdiMes)}</td><td class="n">${rentHtml(nl.rentAno, nl.cdiAno)}</td></tr>`).join('')}</tbody>`;

  renderAlertas(L, total);
  renderNoticias(L);
}

function alertas(L, total) {
  const out = [];
  L.forEach(l => {
    const peso = total ? l.pos / total * 100 : 0;
    if (peso > 25) out.push(['warn', `Concentração alta em <b>${l.ticker}</b>: ${pct(peso, 1)} da renda variável.`]);
    if (Number.isFinite(l.rentAno) && l.rentAno < 0) out.push(['bad', `<b>${l.ticker}</b> acumula ${num2(l.rentAno)}% no ano. Vale reavaliar a tese ou propor uma troca.`]);
    else if (Number.isFinite(l.cdiAno) && l.cdiAno < 100) out.push(['warn', `<b>${l.ticker}</b> rendeu ${num2(l.rentAno)}% no ano, ${num2(l.cdiAno, 0)}% do CDI.`]);
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
  R.estruturadas.forEach(e => { if (Number.isFinite(e.rentAno) && e.rentAno < 0) out.push(['warn', `Estruturada <b>${esc(e.estrutura)}${e.objeto ? ' em ' + esc(e.objeto) : ''}</b> com ${num2(e.rentAno)}% no ano.`]); });
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
  if (l.tipo === 'acao' && p && p.length >= 4 && !/^(banco|brasil|grupo|centrais|energias)$/i.test(p)) out.push(p);
  return [...new Set(out)];
}
async function renderNoticias(L) {
  if (!NOT) { try { NOT = await carregarDados('noticias.json'); } catch { NOT = { fontes: {} }; } }
  const todas = [], vistos = new Set();
  Object.values(NOT.fontes || {}).flat().forEach(n => { if (!vistos.has(n.link)) { vistos.add(n.link); todas.push(n); } });
  const objetos = R.estruturadas.map(e => e.objeto).filter(Boolean).map(t => ({ ticker: t, tipo: 'acao', d: D.ativos[t] || {} }));
  const achadas = [];
  [...L, ...objetos].forEach(l => {
    const ps = palavras(l);
    todas.forEach(n => { if (ps.some(p => new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(n.titulo))) achadas.push({ t: l.ticker, n }); });
  });
  const uniq = [], vs = new Set();
  achadas.sort((a, b) => (b.n.data || '').localeCompare(a.n.data || '')).forEach(x => { if (!vs.has(x.n.link)) { vs.add(x.n.link); uniq.push(x); } });
  $('noticias').innerHTML = uniq.length ? uniq.slice(0, 12).map(x => `<a href="${esc(x.n.link)}" target="_blank" rel="noopener"><span class="tag">${esc(x.t)}</span>${esc(x.n.titulo)}</a>`).join('') + '<p class="note">Fonte: InfoMoney (manchetes recentes).</p>'
    : '<p class="note">Nenhuma manchete recente cita os ativos da carteira.</p>';
}

// ---------- Importação ----------
const RV_CLASSES = ['rvbr', 'rvint', 'fl', 'alt'];
function deAtivos(lista, meta = {}) {
  const ativos = [], est = [], nl = [];
  lista.forEach(a => {
    const nome = String(a.nome), m = nome.match(RE_TICKER), saldo = parseNum(a.saldo) || 0;
    const rent = { rentMes: a.rentMes, cdiMes: a.cdiMes, rentAno: a.rentAno, cdiAno: a.cdiAno };
    const ehRV = RV_CLASSES.includes(a.classe) || (m && !/^(NTNB|LTNS)/.test(m[1]) && /11$|[3-8]$/.test(m[1]));
    if (!ehRV) return;
    const e = estruturaDe(nome);
    if (e) { est.push({ nome, estrutura: e[1], descricao: e[2], objeto: m ? m[1] : '', saldo, ...rent }); return; }
    if (m && !/\bRL\b|feeder/i.test(nome) && a.qtd > 0) {
      const ex = ativos.find(x => x.ticker === m[1]);
      if (ex) { ex.qtd += a.qtd; ex.saldoPdf += saldo; }
      else ativos.push({ id: uid(), ticker: m[1], qtd: a.qtd, saldoPdf: saldo, origem: 'pdf', ...rent });
    } else if (RV_CLASSES.includes(a.classe)) {
      nl.push({ nome, estrategia: a.estrategia || '', saldo, ...rent });
    }
  });
  R = { ...R, ...meta, ativos, estruturadas: est, naoListados: nl };
  salvar(); preencher(); renderInfo(); render();
  toast(`${ativos.length} ativos listados${est.length ? ` e ${est.length} estruturada(s)` : ''}`);
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
$('btnNovo').onclick = () => { R = { nome: '', conta: '', email: '', dataRef: '', ativos: [], estruturadas: [], naoListados: [], coment: '' }; salvar(); ordens.limpar(); preencher(); renderInfo(); render(); };
$('btnAdd').onclick = () => {
  const t = $('addTk').value.toUpperCase().trim(), q = parseInt($('addQt').value.replace(/\D/g, ''), 10);
  if (!RE_TICKER.test(t) || !(q > 0)) { toast('Informe ticker e quantidade'); return; }
  const ex = R.ativos.find(a => a.ticker === t);
  if (ex) ex.qtd += q; else R.ativos.push({ id: uid(), ticker: t, qtd: q, saldoPdf: 0, origem: 'manual' });
  if (!D.ativos[t]) toast(`${t} ainda não está na base de cotações.`);
  $('addTk').value = $('addQt').value = '';
  salvar(); render();
};

// ---------- Ordens (comprar / vender) ----------
const ordens = Ordens.criar({
  el: $('ordens'), chave: 'rw_rv_ordens',
  cliente: () => ({ nome: R.nome, codigo: R.conta, email: R.email }),
  salvarCliente: (nome, para) => { R.nome = nome || R.nome; R.email = para; preencher(); salvar(); },
});
document.addEventListener('click', e => {
  const c = e.target.closest('[data-comprar]'), v = e.target.closest('[data-vender]'), d = e.target.closest('[data-del]');
  if (c) { ordens.adicionar({ ticker: c.dataset.comprar, op: 'C' }); toast(`Compra de ${c.dataset.comprar}: informe a quantidade`); }
  if (v) { ordens.adicionar({ ticker: v.dataset.vender, op: 'V', qtd: v.dataset.qtd }); toast(`Venda de ${v.dataset.vender} adicionada`); }
  if (d && !d.closest('#ordens')) { R.ativos = R.ativos.filter(a => a.id !== d.dataset.del); salvar(); render(); }
});
$('btnOutro').onclick = () => ordens.adicionar({ op: 'C' });
$('btnLimparOrd').onclick = () => ordens.limpar();
$('btnEmailOrd').onclick = () => ordens.email();

// ---------- Campos do cliente ----------
function preencher() { $('nome').value = R.nome || ''; $('conta').value = R.conta || ''; $('email').value = R.email || ''; $('coment').value = R.coment || ''; }
['nome', 'conta', 'email', 'coment'].forEach(k => $(k).addEventListener('input', e => { R[k] = e.target.value; salvar(); }));

// ---------- E-mail da análise ----------
$('btnEmail').onclick = () => {
  if (!R.ativos.length && !R.estruturadas.length && !R.naoListados.length) { toast('Importe a carteira primeiro'); return; }
  const L = linhas(), total = L.reduce((s, l) => s + l.pos, 0) + R.estruturadas.reduce((s, n) => s + n.saldo, 0) + R.naoListados.reduce((s, n) => s + n.saldo, 0);
  const al = alertas(L, total).map(([c, t]) => [c, t.replace(/<[^>]+>/g, '')]);
  const renda = L.reduce((s, l) => s + (l.d.dy ? l.pos * l.d.dy / 100 : 0), 0);
  const h = Email.h;
  const rTxt = (r, c) => Number.isFinite(r) ? `${r >= 0 ? '+' : ''}${num2(r)}%${Number.isFinite(c) ? ` (${num2(c, 0)}% do CDI)` : ''}` : '—';
  const linhaTxt = l => `• ${l.ticker}${l.d.n ? ' (' + nomeCurto(l.d.n) + ')' : ''}: ${brl(l.pos)} · no ano ${rTxt(l.rentAno, l.cdiAno)}${l.d.dy != null ? ` · DY ${pct(l.d.dy)}` : ''}`;
  Email.abrir({
    assunto: 'Análise da sua carteira de ações e fundos imobiliários',
    nome: R.nome, para: R.email,
    texto: (nome, ass) => [
      Email.saudacaoTexto(nome), '',
      `Fiz uma análise da sua carteira de renda variável${R.dataRef ? ` (posição de ${R.dataRef}, com cotações atualizadas)` : ''}.`, '',
      `Total em renda variável: ${brl(total)}`, `Renda estimada em 12 meses com dividendos e rendimentos: ${brl(renda)} (cerca de ${brl(renda / 12)} por mês)`, '',
      ...(L.some(l => l.tipo !== 'fii') ? ['AÇÕES E ETFs', ...L.filter(l => l.tipo !== 'fii').map(linhaTxt), ''] : []),
      ...(L.some(l => l.tipo === 'fii') ? ['FUNDOS IMOBILIÁRIOS', ...L.filter(l => l.tipo === 'fii').map(linhaTxt), ''] : []),
      ...(R.estruturadas.length ? ['OPERAÇÕES ESTRUTURADAS', ...R.estruturadas.map(e => `• ${e.estrutura}${e.objeto ? ' em ' + e.objeto : ''}: ${brl(e.saldo)} · no ano ${rTxt(e.rentAno, e.cdiAno)}`), ''] : []),
      ...(al.length ? ['PONTOS DE ATENÇÃO', ...al.map(([, t]) => '• ' + t), ''] : []),
      ...(R.coment ? ['MEUS COMENTÁRIOS', R.coment, ''] : []),
      'Indicadores de fontes públicas de mercado; o consenso de analistas não representa recomendação individual. Rentabilidade passada não é garantia de rentabilidade futura.', '',
      'Fico à disposição para conversarmos.', '', 'Abraço,', ass,
    ].join('\n'),
    html: (nome, ass) => {
      const rH = (r, c) => Number.isFinite(r) ? `<span style="color:${r < 0 ? h.cor.ruim : '#26233a'}">${r >= 0 ? '+' : ''}${num2(r)}%</span>${Number.isFinite(c) ? `<br><span style="font-size:11px;color:${c >= 100 ? h.cor.bom : h.cor.ruim}">${num2(c, 0)}% do CDI</span>` : ''}` : '—';
      const tab = (lista, fii) => h.tabela(fii ? ['Fundo', 'Posição', 'No ano', 'DY 12m', 'P/VP'] : ['Ativo', 'Posição', 'No ano', 'DY 12m', 'Consenso'],
        lista.map(l => [`<b>${esc(l.ticker)}</b><br><span style="font-size:11px;color:#6d6a80">${esc(nomeCurto(l.d.n))}</span>`, brl(l.pos), rH(l.rentAno, l.cdiAno),
          l.d.dy != null ? pct(l.d.dy) : '—', fii ? (l.d.pvp ? num2(l.d.pvp) : '—') : (CONSENSO[l.d.rec]?.[0] || '—')]), ['left', 'right', 'right', 'right', 'left']);
      const ac = L.filter(l => l.tipo !== 'fii'), fi = L.filter(l => l.tipo === 'fii');
      return h.wrap(
        h.p(h.saudacao(nome)) +
        h.p(`Fiz uma análise da sua carteira de renda variável${R.dataRef ? ` (posição de ${esc(R.dataRef)}, com cotações atualizadas)` : ''}. Total em renda variável: <b>${brl(total)}</b>. Renda estimada em 12 meses: <b>${brl(renda)}</b> (cerca de ${brl(renda / 12)} por mês).`) +
        (ac.length ? h.titulo('Ações e ETFs') + tab(ac, false) : '') +
        (fi.length ? h.titulo('Fundos imobiliários') + tab(fi, true) : '') +
        (R.estruturadas.length ? h.titulo('Operações estruturadas') + h.tabela(['Estrutura', 'Ativo-objeto', 'Saldo', 'No ano'], R.estruturadas.map(e => [`<b>${esc(e.estrutura)}</b>`, esc(e.objeto || '—'), brl(e.saldo), rH(e.rentAno, e.cdiAno)]), ['left', 'left', 'right', 'right']) : '') +
        (al.length ? h.titulo('Pontos de atenção') + `<ul style="margin:0 0 12px;padding-left:18px">${al.map(([, t]) => `<li style="margin-bottom:4px">${esc(t)}</li>`).join('')}</ul>` : '') +
        (R.coment ? h.titulo('Meus comentários') + h.p(esc(R.coment).replace(/\n/g, '<br>')) : '') +
        h.p('Fico à disposição para conversarmos.') + h.p('Abraço,') + h.assinatura(ass) +
        h.rodape('Rentabilidades conforme o relatório XPerformance. Indicadores de fontes públicas (Yahoo Finance e CVM). O consenso de analistas é uma média de mercado e não representa recomendação individual. Rentabilidade passada não é garantia de rentabilidade futura.'));
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
