// Relatório mensal: monta uma apresentação a partir do XPerformance
const $ = id => document.getElementById(id);
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const SLIDES = [
  ['capa', 'Capa'], ['macro', 'Cenário macro'], ['noticias', 'Notícias'], ['rentab', 'Rentabilidade da carteira'],
  ['desempenho', 'Carteira × referências'], ['fluxo', 'Fluxo de caixa'], ['evolucao', 'Últimos 12 meses'], ['destaques', 'Destaques do mês'],
  ['alocacao', 'Alocação'], ['recado', 'Recado do assessor'], ['fim', 'Encerramento'],
];
const CURTO = { 'Pós Fixado': 'Pós', 'Pré Fixado': 'Pré', 'Renda Variável Brasil': 'RV Brasil', 'Renda Variável Internacional': 'RV global', 'Renda Variável Global': 'RV global', 'Renda Fixa Internacional': 'RF global', 'Renda Fixa Global': 'RF global', 'Alternativo': 'Alternativos', 'Carteira Administrada': 'Carteira administrada', 'Fundos Listados': 'Fundos listados', 'Multimercado': 'Multimercado', 'Inflação': 'Inflação' };
const CORES = ['#ff7a1a', '#8f7cff', '#3ee08f', '#ffd166', '#4cc9f0', '#f72585', '#b8b3cc', '#ff9f68', '#7bdff2', '#c77dff'];

let REL = Object.assign({ dados: null, cliente: '', email: '', usd: '', cot: '', news: [], coment: '', off: [] }, store.get('rw_relatorio', {}));
let MACRO = null, NOT = null, abaNews = 'ultimas';
const salvar = () => store.set('rw_relatorio', REL);

const n2 = (x, d = 2) => Number.isFinite(x) ? x.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
const p2 = (x, d = 2) => Number.isFinite(x) ? n2(x, d) + '%' : '—';
const ps = (x, d = 2) => Number.isFinite(x) ? (x > 0 ? '+' : '') + n2(x, d) + '%' : '—';
const cls = x => x > 0 ? 'up' : x < 0 ? 'dn' : '';
const brl0 = x => Number.isFinite(x) ? 'R$ ' + Math.round(x).toLocaleString('pt-BR') : '—';
const mesRef = d => { if (!d) return ''; const [, m, a] = d.split('/'); return `${MESES[+m - 1]} de ${a}`; };
const curto = n => CURTO[n] || n;

// ---------- Cálculos ----------
function calc() {
  const D = REL.dados; if (!D) return null;
  const r = D.resumo || {}, cdiMes = r.refs?.CDI?.mes;
  const pcdi = v => Number.isFinite(v) && cdiMes ? v / cdiMes * 100 : NaN;
  const est = (D.estrategias || []).filter(e => Number.isFinite(e.rentMes)).map(e => ({ ...e, curto: curto(e.nome), cdi: pcdi(e.rentMes) }));
  const ordenadas = est.slice().sort((a, b) => b.rentMes - a.rentMes);
  const ativos = (D.ativos || []).filter(a => Number.isFinite(a.rentMes) && a.saldo > 0 && !a.sintetico)
    .map(a => ({ ...a, cdi: Number.isFinite(a.cdiMes) ? a.cdiMes : pcdi(a.rentMes) }));
  const porRent = ativos.slice().sort((a, b) => b.rentMes - a.rentMes);
  const nacional = r.patrimonio || D.patrimonio || 0;
  const usd = parseNum(REL.usd) || 0, cot = parseNum(REL.cot) || 0;
  return {
    D, r, cdiMes, est, melhoresCat: ordenadas.slice(0, 3), pioresCat: ordenadas.length > 3 ? ordenadas.slice(-2).reverse() : [],
    melhores: porRent.slice(0, 5), piores: porRent.length > 5 ? porRent.slice(-3).reverse() : [],
    nacional, usd, cot, internacional: usd * cot, total: nacional + usd * cot,
    hist: (r.historico || []).slice().reverse(),
    liq: liquidos(r, D.dataRef),
    fluxo: fluxo(r),
  };
}

// Ganho financeiro líquido = ganho bruto − IR − IOF pagos (histórico mensal do relatório)
function liquidos(r, dataRef) {
  const H = r.historico || [];
  const soma = lista => {
    if (!lista.length) return null;
    const ganho = lista.reduce((s, h) => s + (h.ganho || 0), 0), ir = lista.reduce((s, h) => s + Math.abs(h.ir || 0) + Math.abs(h.iof || 0), 0);
    return { ganho, impostos: ir, liquido: ganho - ir };
  };
  const ano = (dataRef || '').slice(-2);
  return { mes: soma(H.slice(0, 1)), ano: soma(H.filter(h => h.mes.endsWith('/' + ano))), m12: soma(H.slice(0, 12)) };
}

// Fluxo de caixa: classifica o extrato do mês e usa as movimentações líquidas do histórico
const semAc = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
function tipoMov(m) {
  const h = semAc(m.hist);
  if (/RENDIMENTO|DIVIDEND|JUROS S\/? ?CAP|\bJCP\b|AMORTIZ|CRED DIST|PROVENTO|BONIFICA|FRACAO/.test(h)) return 'proventos';
  if (/TAXA|CUSTODIA|CORRETAGEM|EMOLUMENT|TARIFA|IRRF|\bIR\b|\bIOF\b|PERMANENCIA|MULTA/.test(h)) return 'custos';
  if (/\bTED\b|\bPIX\b|\bDOC\b|TRANSF|DEPOSITO|RETIRADA|SAQUE|RECEBIMENTO DE RECURSOS|ENVIO DE RECURSOS/.test(h)) return m.valor >= 0 ? 'aportes' : 'resgates';
  return 'operacoes';
}
function fluxo(r) {
  const M = r.movimentacoes || [], soma = t => M.filter(m => tipoMov(m) === t).reduce((s, m) => s + m.valor, 0);
  const f = { aportes: soma('aportes'), resgates: soma('resgates'), proventos: soma('proventos'), custos: soma('custos'), itens: M.length };
  const mov = r.historico?.[0]?.mov;
  // sem transferências identificadas no extrato, usa a movimentação líquida do mês informada no relatório
  if (!f.aportes && !f.resgates && Number.isFinite(mov) && mov !== 0) { if (mov > 0) f.aportes = mov; else f.resgates = mov; f.estimado = true; }
  const porAtivo = {};
  M.filter(m => tipoMov(m) === 'proventos').forEach(m => {
    const tk = (m.hist.match(/\b([A-Z]{4}\d{1,2})\b/) || [])[1];
    const nome = tk || m.hist.replace(/^(RENDIMENTOS? (DE CLIENTES|FUNDO FECHADO BALC[ÃA]O)|CRED DIST DE RENDIMENTO CARTEIRA ADM|DIVIDENDOS?( DE CLIENTES)?|JUROS S\/ CAPITAL( DE CLIENTES)?)\s*/i, '').replace(/\s+\d{5,}.*$|\s+S\/\s*\d+.*$/, '').trim();
    porAtivo[nome] = (porAtivo[nome] || 0) + m.valor;
  });
  f.proventosPorAtivo = Object.entries(porAtivo).sort((a, b) => b[1] - a[1]);
  return f;
}

// ---------- Slides ----------
const foot = C => `<div class="foot"><span>${esc(REL.cliente || 'Cliente')} · ${esc(mesRef(C.D.dataRef))}</span><span>${esc(C.D.assessor || '')}</span></div>`;

function sCapa(C) {
  return `<div style="position:absolute;left:64px;bottom:90px;right:64px">
    <div class="lbl">Relatório mensal de investimentos</div>
    <div class="cover-name">${esc(REL.cliente || 'Cliente')}</div>
    <div style="font-size:30px;color:rgba(255,255,255,.8);font-weight:700">${esc(mesRef(C.D.dataRef))}</div>
    <div style="margin-top:46px;font-size:18px;color:rgba(255,255,255,.6)">${esc(C.D.assessor || '')}${C.D.assessor ? ' · Assessor de investimentos' : ''}${C.D.conta ? ' · Conta ' + esc(C.D.conta) : ''}</div>
  </div>`;
}

function sMacro(C) {
  const it = id => MACRO?.itens?.find(i => i.id === id);
  const tile = (id, nome) => {
    const i = it(id); if (!i) return '';
    const v = i.var != null ? `<span class="${cls(i.var)}" style="font-weight:800">${i.var >= 0 ? '▲' : '▼'} ${n2(Math.abs(i.var))}% no dia</span>` : '';
    return `<div class="tile"><div class="n">${nome || esc(i.nome)}</div><div class="v">${fmtMacro(i)}</div><div class="s">${v}${v && i.sub ? ' · ' : ''}${esc(i.sub || '')}</div></div>`;
  };
  const refs = C.r.refs || {};
  const ref = (k, nome) => refs[k] ? `<div class="row-l" style="font-size:19px"><span>${nome}</span><b class="${cls(refs[k].mes)}">${ps(refs[k].mes)}</b></div>` : '';
  return `<div class="st">Cenário macro Brasil</div><div class="ss">Indicadores atualizados em ${new Date(MACRO?.atualizado || Date.now()).toLocaleDateString('pt-BR')}</div>
    <div style="display:grid;grid-template-columns:2.1fr 1fr;gap:26px">
      <div class="tiles">${tile('selic', 'Selic (meta)')}${tile('cdi', 'CDI')}${tile('ipca_12m', 'IPCA 12 meses')}${tile('ipca_mes', 'IPCA do mês')}${tile('dolar', 'Dólar')}${tile('ibov', 'Ibovespa')}${tile('incc', 'INCC-M')}${tile('brent', 'Petróleo Brent')}${tile('ouro', 'Ouro')}</div>
      <div class="box"><div class="lbl">Como foi ${esc(MESES[+(C.D.dataRef || '0/1/0').split('/')[1] - 1] || 'o mês').toLowerCase()}</div>
        ${ref('CDI', 'CDI')}${ref('Ibovespa', 'Ibovespa')}${ref('IPCA', 'IPCA')}${ref('Dolar', 'Dólar')}
        <div style="font-size:13px;color:rgba(255,255,255,.5);margin-top:12px">Variação no mês de referência do relatório</div></div>
    </div>${foot(C)}`;
}

function sNoticias(C) {
  const todas = todasNoticias(), sel = REL.news.map(l => todas.find(n => n.link === l)).filter(Boolean).slice(0, 5);
  if (!sel.length) return null;
  return `<div class="st">O que movimentou o mercado</div><div class="ss">Notícias selecionadas</div>
    <div class="news">${sel.map(n => `<div class="it"><div class="bar"></div><div><div class="cat">${esc(n.categoria || 'Mercado')} · ${n.data ? new Date(n.data).toLocaleDateString('pt-BR') : ''}</div><div class="tt">${esc(n.titulo)}</div></div></div>`).join('')}</div>
    <div class="foot"><span>Fonte: InfoMoney</span><span>${esc(REL.cliente || '')} · ${esc(mesRef(C.D.dataRef))}</span></div>`;
}

function sRentab(C) {
  const r = C.r, m = r.periodos?.['MÊS'] || {};
  const cdiM = Number.isFinite(m.cdi) ? m.cdi : (C.cdiMes ? r.rentMes / C.cdiMes * 100 : NaN);
  return `<div class="st">Rentabilidade da carteira</div><div class="ss">${esc(mesRef(C.D.dataRef))}</div>
    <div class="two" style="grid-template-columns:1fr 1.15fr">
      <div><div class="lbl">Resumo</div><div class="box" style="height:452px;display:flex;flex-direction:column;justify-content:space-between;padding:14px 26px">
        <div class="row-l"><span>Patrimônio nacional</span><b class="or">${brl(C.nacional)}</b></div>
        <div class="row-l"><span>Rentabilidade no mês</span><b class="${cls(r.rentMes)}">${ps(r.rentMes)} <span style="font-size:16px;font-weight:700">(${p2(cdiM)} do CDI)</span></b></div>
        <div class="row-l"><span>Resultado financeiro <span style="font-size:15px;color:rgba(255,255,255,.55)">bruto</span></span><b class="${cls(r.ganhoMes)}">${brl(r.ganhoMes)}</b></div>
        ${C.liq.mes ? `<div class="row-l"><span>Ganho financeiro líquido</span><b class="${cls(C.liq.mes.liquido)}">${brl(C.liq.mes.liquido)}<div style="font-size:14px;color:rgba(255,255,255,.55);text-align:right;font-weight:600">${C.liq.mes.impostos ? `após ${brl(C.liq.mes.impostos)} de IR/IOF` : 'sem IR/IOF no mês'}</div></b></div>` : ''}
        <div class="row-l"><span>Patrimônio internacional</span><b class="or">${C.usd ? 'US$ ' + n2(C.usd) : 'US$ —'}${C.usd ? `<div style="font-size:14px;color:rgba(255,255,255,.55);text-align:right">${brl(C.internacional)} · câmbio ${n2(C.cot, 3)}</div>` : ''}</b></div>
        <div style="padding-top:6px"><div style="font-size:18px;color:rgba(255,255,255,.75)">Patrimônio total</div><div class="big or" style="font-size:54px">${brl(C.total)}</div></div>
      </div></div>
      <div><div class="lbl">Rentabilidade por estratégia</div><div class="box" style="height:452px;display:flex;flex-direction:column;justify-content:space-around">
        ${C.est.map(e => `<div class="row-l" style="font-size:20px;padding:6px 0"><span><span style="color:rgba(255,255,255,.6);display:inline-block;width:82px">${p2(e.pct)}</span>${esc(e.curto)}</span><b class="${cls(e.rentMes)}">${ps(e.rentMes)} <span style="font-size:15px;font-weight:700;opacity:.85">(${p2(e.cdi, 0)} CDI)</span></b></div>`).join('')}
      </div></div>
    </div>${foot(C)}`;
}

function sDesempenho(C) {
  const P = C.r.periodos || {}, R = C.r.refs || {};
  const LQ = { 'MÊS': C.liq.mes, 'ANO': C.liq.ano, '12M': C.liq.m12 };
  const card = (k, nome) => { const x = P[k]; if (!x || !Number.isFinite(x.rent)) return ''; const l = LQ[k];
    return `<div class="tile" style="text-align:center"><div class="n">${nome}</div><div class="v ${cls(x.rent)}" style="font-size:44px">${ps(x.rent)}</div><div class="s" style="font-size:16px">${p2(x.cdi)} do CDI</div>
      <div style="font-size:16px;margin-top:8px">Ganho bruto <b>${brl0(x.ganho)}</b></div>${l ? `<div style="font-size:16px">Ganho líquido <b class="or">${brl0(l.liquido)}</b></div>` : ''}</div>`; };
  const linha = (k, nome, hl) => R[k] ? `<tr class="${hl ? 'hl' : ''}"><td>${nome}</td><td class="${cls(R[k].mes)}">${ps(R[k].mes)}</td><td class="${cls(R[k].ano)}">${ps(R[k].ano)}</td><td class="${cls(R[k].m12)}">${ps(R[k].m12)}</td></tr>` : '';
  return `<div class="st">Carteira × referências</div><div class="ss">Rentabilidade e resultado financeiro por período · ganho líquido = ganho bruto menos IR e IOF pagos</div>
    <div class="tiles" style="margin-bottom:18px">${card('MÊS', 'No mês')}${card('ANO', 'No ano')}${card('12M', 'Em 12 meses')}</div>
    <div class="box" style="padding:6px 22px"><table style="font-size:17px" class="compacta"><tr><th></th><th>Mês</th><th>Ano</th><th>12 meses</th></tr>
      ${linha('Portfolio', 'Sua carteira', true)}${linha('CDI', 'CDI')}${linha('Ibovespa', 'Ibovespa')}${linha('IPCA', 'IPCA (inflação)')}${linha('Dolar', 'Dólar')}</table></div>${foot(C)}`;
}

function sFluxo(C) {
  const F = C.fluxo, P = C.r.periodos || {}, H = C.hist;
  const tile = (nome, v, cor, sub) => `<div class="tile"><div class="n">${nome}</div><div class="v" style="color:${cor}">${brl(v)}</div><div class="s">${sub || ''}</div></div>`;
  // gráfico de movimentações líquidas dos últimos 12 meses
  const W = 700, Hh = 270, pad = { l: 10, r: 10, t: 30, b: 36 };
  const vals = H.map(h => h.mov || 0), mx = Math.max(...vals.map(Math.abs), 1), bw = (W - pad.l - pad.r) / Math.max(H.length, 1);
  const zero = pad.t + (Hh - pad.t - pad.b) / 2, esc2 = (Hh - pad.t - pad.b) / 2 / mx;
  let svg = `<svg viewBox="0 0 ${W} ${Hh}" width="${W}" height="${Hh}"><line x1="${pad.l}" x2="${W - pad.r}" y1="${zero}" y2="${zero}" stroke="rgba(255,255,255,.35)"/>`;
  H.forEach((h, i) => {
    const v = h.mov || 0, x = pad.l + i * bw, hgt = Math.abs(v) * esc2;
    if (v) svg += `<rect x="${x + bw * .18}" y="${v > 0 ? zero - hgt : zero}" width="${bw * .64}" height="${Math.max(hgt, 2)}" rx="5" fill="${v > 0 ? '#3ee08f' : '#ff7d73'}"/>`;
    if (v) svg += `<text x="${x + bw / 2}" y="${v > 0 ? zero - hgt - 8 : zero + hgt + 18}" fill="#fff" font-size="12" font-weight="800" text-anchor="middle">${(v > 0 ? '+' : '−') + (Math.abs(v) >= 1000 ? n2(Math.abs(v) / 1000, 1) + 'k' : n2(Math.abs(v), 0))}</text>`;
    svg += `<text x="${x + bw / 2}" y="${Hh - 12}" fill="rgba(255,255,255,.6)" font-size="13" text-anchor="middle">${esc(h.mes.replace('.', ''))}</text>`;
  });
  svg += '</svg>';
  const per = (k, nome) => P[k] && Number.isFinite(P[k].mov) ? `<span style="margin-right:22px">${nome}: <b class="${cls(P[k].mov)}">${brl(P[k].mov)}</b></span>` : '';
  const prov = F.proventosPorAtivo.slice(0, 6);
  return `<div class="st">Fluxo de caixa</div><div class="ss">Aportes, resgates e proventos no mês</div>
    <div class="tiles" style="grid-template-columns:repeat(4,1fr);margin-bottom:18px">
      ${tile('Aportes (entradas)', F.aportes, '#3ee08f', F.estimado && F.aportes ? 'movimentação líquida do mês' : 'transferências recebidas')}
      ${tile('Resgates (saídas)', Math.abs(F.resgates), '#ff7d73', F.estimado && F.resgates ? 'movimentação líquida do mês' : 'transferências enviadas')}
      ${tile('Proventos recebidos', F.proventos, '#ff7a1a', 'dividendos, rendimentos e juros')}
      ${tile('Custos e taxas', Math.abs(F.custos), '#fff', 'tarifas e impostos no extrato')}
    </div>
    <div style="display:grid;grid-template-columns:740px 1fr;gap:24px">
      <div class="box" style="padding:12px 18px"><div class="lbl" style="margin-bottom:0">Aportes (+) e resgates (−) nos últimos 12 meses</div>${svg}</div>
      <div class="box" style="padding:14px 22px"><div class="lbl">Proventos do mês</div>
        ${prov.length ? prov.map(([n, v]) => `<div class="row-l" style="font-size:17px;padding:7px 0"><span style="max-width:250px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(n)}</span><b class="or">${brl(v)}</b></div>`).join('') : '<div style="font-size:17px;color:rgba(255,255,255,.6)">Nenhum provento no mês.</div>'}
      </div>
    </div>
    <div style="font-size:16px;color:rgba(255,255,255,.75);margin-top:12px">Movimentação líquida · ${per('MÊS', 'Mês')}${per('ANO', 'Ano')}${per('12M', '12 meses')}</div>${foot(C)}`;
}

function sEvolucao(C) {
  const H = C.hist; if (!H.length) return null;
  const W = 1150, Hh = 400, pad = { l: 50, r: 20, t: 30, b: 50 };
  const cdiM = H.map(h => Number.isFinite(h.cdi) && h.cdi !== 0 ? h.rent / (h.cdi / 100) : NaN);
  const vals = [...H.map(h => h.rent), ...cdiM.filter(Number.isFinite)];
  const max = Math.max(...vals, 0.5), min = Math.min(...vals, 0);
  const bw = (W - pad.l - pad.r) / H.length;
  const Y = v => pad.t + (1 - (v - min) / (max - min)) * (Hh - pad.t - pad.b);
  let svg = `<svg viewBox="0 0 ${W} ${Hh}" width="${W}" height="${Hh}">`;
  [...(min < -0.1 ? [min] : []), 0, max / 2, max].forEach(v => { svg += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="rgba(255,255,255,${v === 0 ? .35 : .1})"/><text x="${pad.l - 8}" y="${Y(v) + 5}" fill="rgba(255,255,255,.5)" font-size="14" text-anchor="end">${n2(v, 1)}%</text>`; });
  H.forEach((h, i) => {
    const x = pad.l + i * bw, y0 = Y(0), y = Y(h.rent);
    svg += `<rect x="${x + bw * .2}" y="${Math.min(y, y0)}" width="${bw * .6}" height="${Math.abs(y0 - y)}" rx="6" fill="${h.rent >= 0 ? '#ff7a1a' : '#ff7d73'}"/>`;
    svg += `<text x="${x + bw / 2}" y="${(h.rent >= 0 ? y - 8 : y + 20)}" fill="#fff" font-size="14" font-weight="800" text-anchor="middle">${n2(h.rent)}%</text>`;
    svg += `<text x="${x + bw / 2}" y="${Hh - 18}" fill="rgba(255,255,255,.6)" font-size="15" text-anchor="middle">${esc(h.mes.replace('.', ''))}</text>`;
  });
  const pts = cdiM.map((c, i) => Number.isFinite(c) ? `${pad.l + i * bw + bw / 2},${Y(c)}` : null).filter(Boolean);
  svg += `<polyline points="${pts.join(' ')}" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="7 6"/>`;
  cdiM.forEach((c, i) => { if (Number.isFinite(c)) svg += `<circle cx="${pad.l + i * bw + bw / 2}" cy="${Y(c)}" r="5" fill="#fff"/>`; });
  svg += '</svg>';
  const acima = H.filter(h => h.cdi >= 100).length;
  const ini = H[0]?.inicial, fim = H[H.length - 1]?.final;
  return `<div class="st">Últimos 12 meses</div><div class="ss">Rentabilidade mensal da carteira <span class="or">■</span> e do CDI <span style="color:#fff">- - ●</span> · ${acima} de ${H.length} meses acima do CDI · patrimônio de ${brl0(ini)} para ${brl0(fim)}</div>
    ${svg}${foot(C)}`;
}

function sDestaques(C) {
  const cat = (e, bom) => `<div class="row-l" style="font-size:20px"><span>${esc(e.curto)}</span><b class="${cls(e.rentMes)}">${ps(e.rentMes)} <span style="font-size:15px;opacity:.85">(${p2(e.cdi, 0)} CDI)</span></b></div>`;
  const atv = a => `<div class="row-l" style="font-size:17px;padding:6px 0"><span style="max-width:380px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(a.nome)}</span><b class="${cls(a.rentMes)}">${ps(a.rentMes)}${Number.isFinite(a.cdi) && a.rentMes > 0 ? ` <span style="font-size:14px;opacity:.85">(${p2(a.cdi, 0)} CDI)</span>` : ''}</b></div>`;
  return `<div class="st">Destaques do mês</div><div class="ss">Rentabilidade no mês · CDI do mês: ${p2(C.cdiMes)}</div>
    <div class="two">
      <div>
        <div class="lbl">🏆 Melhores estratégias</div><div class="box" style="margin-bottom:16px">${C.melhoresCat.map(e => cat(e, true)).join('')}</div>
        ${C.pioresCat.length ? `<div class="lbl" style="color:#ff9f9a">Ficaram para trás</div><div class="box">${C.pioresCat.map(e => cat(e, false)).join('')}</div>` : ''}
      </div>
      <div>
        <div class="lbl">⭐ Melhores ativos</div><div class="box" style="margin-bottom:16px;padding:14px 24px">${C.melhores.map(atv).join('')}</div>
        ${C.piores.length ? `<div class="lbl" style="color:#ff9f9a">Menor rentabilidade</div><div class="box" style="padding:14px 24px">${C.piores.map(atv).join('')}</div>` : ''}
      </div>
    </div>${foot(C)}`;
}

function sAlocacao(C) {
  const E = (C.D.estrategias || []).filter(e => e.saldo > 0).sort((a, b) => b.saldo - a.saldo);
  const tot = E.reduce((s, e) => s + e.saldo, 0); if (!tot) return null;
  const R = 170, r0 = 105, cx = 200, cy = 200; let ang = -Math.PI / 2, arcs = '';
  E.forEach((e, i) => {
    const a = e.saldo / tot * Math.PI * 2, a2 = ang + a, large = a > Math.PI ? 1 : 0;
    const P = (rr, t) => `${cx + rr * Math.cos(t)},${cy + rr * Math.sin(t)}`;
    arcs += `<path d="M${P(R, ang)} A${R},${R} 0 ${large} 1 ${P(R, a2 - 0.0001)} L${P(r0, a2 - 0.0001)} A${r0},${r0} 0 ${large} 0 ${P(r0, ang)} Z" fill="${CORES[i % CORES.length]}"/>`;
    ang = a2;
  });
  return `<div class="st">Alocação da carteira</div><div class="ss">Distribuição por estratégia</div>
    <div style="display:grid;grid-template-columns:420px 1fr;gap:40px;align-items:center">
      <svg viewBox="0 0 400 400" width="400" height="400">${arcs}<text x="200" y="192" fill="rgba(255,255,255,.65)" font-size="18" text-anchor="middle">Patrimônio</text><text x="200" y="224" fill="#fff" font-size="26" font-weight="800" text-anchor="middle">${brl0(C.nacional)}</text></svg>
      <div class="box">${E.map((e, i) => `<div class="row-l" style="font-size:20px;padding:9px 0"><span><span style="display:inline-block;width:14px;height:14px;border-radius:4px;background:${CORES[i % CORES.length]};margin-right:12px"></span>${esc(curto(e.nome))}</span><b>${p2(e.saldo / tot * 100, 1)} <span style="font-size:15px;color:rgba(255,255,255,.55);font-weight:600">${brl0(e.saldo)}</span></b></div>`).join('')}</div>
    </div>${foot(C)}`;
}

function sRecado(C) {
  if (!REL.coment.trim()) return null;
  return `<div class="st">Recado do assessor</div><div class="ss">Próximos passos</div>
    <div class="box" style="font-size:26px;line-height:1.5;white-space:pre-wrap;max-height:470px;overflow:hidden">${esc(REL.coment)}</div>${foot(C)}`;
}
function sFim(C) {
  const ass = store.get('rw_assinatura', 'Italo Nunes\nAssessor de Investimentos');
  return `<div style="position:absolute;left:64px;top:50%;transform:translateY(-50%)">
    <div class="lbl">Obrigado!</div><div class="cover-name" style="font-size:56px">Fico à disposição</div>
    <div style="font-size:24px;color:rgba(255,255,255,.75);white-space:pre-wrap;margin-top:18px">${esc(ass)}</div></div>
    <div class="foot"><span>Rentabilidade passada não é garantia de rentabilidade futura. Dados do relatório XPerformance de ${esc(C.D.dataRef || '')}.</span><span></span></div>`;
}
const GERA = { capa: sCapa, macro: sMacro, noticias: sNoticias, rentab: sRentab, desempenho: sDesempenho, fluxo: sFluxo, evolucao: sEvolucao, destaques: sDestaques, alocacao: sAlocacao, recado: sRecado, fim: sFim };

function slidesHtml() {
  const C = calc(); if (!C) return [];
  return SLIDES.filter(([id]) => !REL.off.includes(id)).map(([id]) => { try { return GERA[id](C); } catch (e) { console.error(id, e); return null; } }).filter(Boolean);
}

// ---------- Renderização ----------
function escala() {
  document.querySelectorAll('#deck .sw').forEach(sw => {
    const s = sw.clientWidth / 1280; sw.style.height = 720 * s + 'px';
    sw.firstElementChild.style.transform = `scale(${s})`;
  });
}
function render() {
  const S = slidesHtml();
  $('deck').innerHTML = S.length ? S.map(h => `<div class="sw"><div class="slide">${h}</div></div>`).join('')
    : '<div class="card"><p class="note">Importe o XPerformance para montar a apresentação.</p></div>';
  escala();
  $('dica').textContent = S.length ? `${S.length} páginas` : '';
}
function renderInfo() {
  const D = REL.dados;
  $('info').innerHTML = D ? `<span class="pill good">✓ XPerformance importado</span> <span class="pill">Ref. ${esc(D.dataRef || '')}</span> <span class="pill">${esc(mesRef(D.dataRef))}</span>` : '';
}
function renderSlidesPick() {
  $('slidesPick').innerHTML = SLIDES.map(([id, nome]) => `<label><input type="checkbox" data-s="${id}" ${REL.off.includes(id) ? '' : 'checked'}> ${nome}</label>`).join('');
}

// ---------- Notícias ----------
function todasNoticias() {
  const out = [], vistos = new Set();
  Object.entries(NOT?.fontes || {}).forEach(([k, l]) => l.forEach(n => { if (!vistos.has(n.link)) { vistos.add(n.link); out.push(n); } }));
  return out;
}
function renderNews() {
  const lista = (NOT?.fontes?.[abaNews] || []).slice().sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  $('newsPick').innerHTML = lista.length ? lista.map(n => `<label><input type="checkbox" data-link="${esc(n.link)}" ${REL.news.includes(n.link) ? 'checked' : ''}><span>${esc(n.titulo)}<small>${esc(n.categoria || '')} · ${n.data ? new Date(n.data).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</small></span></label>`).join('') : '<p class="note">Sem manchetes nesta editoria.</p>';
  $('qtdNews').textContent = `${REL.news.length} escolhida${REL.news.length === 1 ? '' : 's'}`;
}
$('newsTabs').onclick = e => { const b = e.target.closest('button'); if (!b) return; abaNews = b.dataset.k; document.querySelectorAll('#newsTabs button').forEach(x => x.classList.toggle('on', x === b)); renderNews(); };
$('newsPick').addEventListener('change', e => {
  const l = e.target.dataset.link; if (!l) return;
  if (e.target.checked) { if (REL.news.length >= 5) { e.target.checked = false; toast('Escolha no máximo 5 notícias'); return; } REL.news.push(l); }
  else REL.news = REL.news.filter(x => x !== l);
  salvar(); renderNews(); render();
});

// ---------- Importação ----------
async function importar(file) {
  if (!file) return;
  $('info').innerHTML = '<p class="note">⏳ Lendo o PDF…</p>';
  try {
    const r = await XPParser.parse(await file.arrayBuffer(), file.name);
    REL.dados = { cliente: r.cliente, conta: r.conta, assessor: r.assessor, dataRef: r.dataRef, patrimonio: r.patrimonio, resumo: r.resumo, estrategias: r.estrategias,
      ativos: r.ativos.map(a => ({ nome: a.nome, saldo: a.saldo, rentMes: a.rentMes, cdiMes: a.cdiMes, rentAno: a.rentAno, sintetico: a.sintetico })) };
    if (r.cliente) REL.cliente = r.cliente;
    salvar(); preencher(); renderInfo(); render();
    toast('Apresentação montada');
  } catch (e) { $('info').innerHTML = `<p class="note bad">❌ ${esc(e.message)}</p>`; }
}
$('drop').onclick = () => $('pdfFile').click();
$('pdfFile').onchange = e => { importar(e.target.files[0]); e.target.value = ''; };
['dragover', 'dragenter'].forEach(ev => $('drop').addEventListener(ev, e => { e.preventDefault(); $('drop').classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => $('drop').addEventListener(ev, e => { e.preventDefault(); $('drop').classList.remove('over'); }));
$('drop').addEventListener('drop', e => importar(e.dataTransfer.files[0]));

// ---------- Campos ----------
function preencher() { $('cliente').value = REL.cliente || ''; $('email').value = REL.email || ''; $('usd').value = REL.usd || ''; $('cot').value = REL.cot || ''; $('coment').value = REL.coment || ''; }
let rt;
['cliente', 'email', 'usd', 'cot', 'coment'].forEach(k => $(k).addEventListener('input', e => { REL[k] = e.target.value; if (k === 'cot') REL.cotManual = !!e.target.value; salvar(); clearTimeout(rt); rt = setTimeout(render, 250); }));
$('slidesPick').addEventListener('change', e => { const id = e.target.dataset.s; if (!id) return; REL.off = e.target.checked ? REL.off.filter(x => x !== id) : [...REL.off, id]; salvar(); render(); });
window.addEventListener('resize', () => { escala(); if ($('show').classList.contains('on')) mostrar(); });

// ---------- Apresentar ----------
let atual = 0;
function mostrar() {
  const S = slidesHtml(); if (!S.length) return;
  atual = Math.max(0, Math.min(atual, S.length - 1));
  const box = $('showBox'), s = Math.min(innerWidth / 1280, innerHeight / 720);
  box.style.width = 1280 * s + 'px'; box.style.height = 720 * s + 'px';
  box.innerHTML = `<div class="slide" style="transform:scale(${s})">${S[atual]}</div>`;
  $('pos').textContent = `${atual + 1} / ${S.length}`;
}
$('btnShow').onclick = () => {
  if (!REL.dados) { toast('Importe o XPerformance primeiro'); return; }
  atual = 0; $('show').classList.add('on'); mostrar();
  try { document.documentElement.requestFullscreen?.(); } catch {}
};
const sair = () => { $('show').classList.remove('on'); try { document.fullscreenElement && document.exitFullscreen(); } catch {} };
$('sair').onclick = sair;
$('prev').onclick = () => { atual--; mostrar(); };
$('next').onclick = () => { atual++; mostrar(); };
$('showBox').onclick = e => { const r = $('showBox').getBoundingClientRect(); atual += (e.clientX - r.left) > r.width / 3 ? 1 : -1; mostrar(); };
document.addEventListener('keydown', e => {
  if (!$('show').classList.contains('on')) return;
  if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(e.key)) { atual++; mostrar(); e.preventDefault(); }
  if (['ArrowLeft', 'PageUp', 'Backspace'].includes(e.key)) { atual--; mostrar(); e.preventDefault(); }
  if (e.key === 'Escape') sair();
});
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && $('show').classList.contains('on')) mostrar(); });
let tx = null;
$('show').addEventListener('touchstart', e => { tx = e.touches[0].clientX; }, { passive: true });
$('show').addEventListener('touchend', e => { if (tx == null) return; const dx = e.changedTouches[0].clientX - tx; if (Math.abs(dx) > 40) { atual += dx < 0 ? 1 : -1; mostrar(); } tx = null; });

// ---------- PDF e e-mail ----------
$('btnPdf').onclick = () => {
  if (!REL.dados) { toast('Importe o XPerformance primeiro'); return; }
  toast('Na janela de impressão, escolha "Salvar como PDF"');
  setTimeout(() => window.print(), 400);
};
$('btnEmail').onclick = () => {
  const C = calc(); if (!C) { toast('Importe o XPerformance primeiro'); return; }
  const m = C.r.periodos?.['MÊS'] || {}, a = C.r.periodos?.ANO || {}, h = Email.h, mes = mesRef(C.D.dataRef);
  Email.abrir({
    assunto: `Relatório de investimentos · ${mes}`,
    nome: REL.cliente, para: REL.email,
    texto: (nome, ass) => [
      Email.saudacaoTexto(nome), '',
      `Segue o resumo da sua carteira em ${mes.toLowerCase()}. A apresentação completa vai em anexo.`, '',
      `• Patrimônio total: ${brl(C.total)}${C.usd ? ` (inclui US$ ${n2(C.usd)} no exterior)` : ''}`,
      `• Rentabilidade no mês: ${ps(C.r.rentMes)}${Number.isFinite(m.cdi) ? ` (${p2(m.cdi)} do CDI)` : ''}`,
      `• Resultado financeiro no mês: ${brl(C.r.ganhoMes)}${C.liq.mes ? ` (líquido de IR/IOF: ${brl(C.liq.mes.liquido)})` : ''}`,
      ...(Number.isFinite(a.rent) ? [`• No ano: ${ps(a.rent)} (${p2(a.cdi)} do CDI)`] : []),
      `• Aportes no mês: ${brl(C.fluxo.aportes)} · Resgates: ${brl(Math.abs(C.fluxo.resgates))} · Proventos recebidos: ${brl(C.fluxo.proventos)}`, '',
      ...(C.melhoresCat.length ? [`Destaques do mês: ${C.melhoresCat.map(e => `${e.curto} (${ps(e.rentMes)})`).join(', ')}.`, ''] : []),
      ...(REL.coment ? [REL.coment, ''] : []),
      'Fico à disposição para conversarmos.', '', 'Abraço,', ass,
    ].join('\n'),
    html: (nome, ass) => h.wrap(
      h.p(h.saudacao(nome)) + h.p(`Segue o resumo da sua carteira em ${esc(mes.toLowerCase())}. A apresentação completa vai em anexo.`) +
      h.tabela(['', 'Valor'], [
        ['Patrimônio total', `<b>${brl(C.total)}</b>`],
        ['Rentabilidade no mês', `<b style="color:${C.r.rentMes >= 0 ? h.cor.bom : h.cor.ruim}">${ps(C.r.rentMes)}</b>${Number.isFinite(m.cdi) ? ` (${p2(m.cdi)} do CDI)` : ''}`],
        ['Resultado financeiro no mês (bruto)', brl(C.r.ganhoMes)],
        ...(C.liq.mes ? [['Ganho financeiro líquido no mês', `<b>${brl(C.liq.mes.liquido)}</b>`]] : []),
        ...(Number.isFinite(a.rent) ? [['Rentabilidade no ano', `${ps(a.rent)} (${p2(a.cdi)} do CDI)`]] : []),
        ['Aportes no mês', brl(C.fluxo.aportes)], ['Resgates no mês', brl(Math.abs(C.fluxo.resgates))], ['Proventos recebidos no mês', brl(C.fluxo.proventos)],
      ], ['left', 'right']) +
      (C.melhoresCat.length ? h.p(`<b>Destaques do mês:</b> ${C.melhoresCat.map(e => `${esc(e.curto)} (${ps(e.rentMes)})`).join(', ')}.`) : '') +
      (REL.coment ? h.p(esc(REL.coment).replace(/\n/g, '<br>')) : '') +
      h.p('Fico à disposição para conversarmos.') + h.p('Abraço,') + h.assinatura(ass) +
      h.rodape('Rentabilidade passada não é garantia de rentabilidade futura. Dados do relatório XPerformance.')),
    aoSalvarCliente: (nome, para) => { REL.cliente = nome || REL.cliente; REL.email = para; preencher(); salvar(); },
  });
};

// ---------- Início ----------
(async function init() {
  preencher(); renderInfo(); renderSlidesPick(); render();
  try { MACRO = await carregarDados('macro.json'); } catch { MACRO = { itens: [] }; }
  const dol = MACRO.itens?.find(i => i.id === 'dolar');
  if (dol && !REL.cotManual) { $('cotNota').textContent = 'cotação de hoje'; REL.cot = n2(dol.valor, 4); $('cot').value = REL.cot; salvar(); }
  else if (REL.cotManual) $('cotNota').textContent = 'informada por você';
  try { NOT = await carregarDados('noticias.json'); } catch { NOT = { fontes: {} }; }
  if (!REL.news.length) REL.news = ['mercados', 'economia', 'politica'].map(k => (NOT.fontes?.[k] || [])[0]?.link).filter(Boolean);
  renderNews(); render();
})();
