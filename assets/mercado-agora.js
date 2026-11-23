// Mercado agora: painéis no estilo "telão" (Brasil, EUA, moedas, juros americanos, índice do medo,
// commodities) e o catálogo de bolsas das maiores economias. Lê mercado.json (GitHub Actions, ~15 min).
(() => {
  const el = id => document.getElementById(id);
  const fmt = (v, d = 2) => Number.isFinite(v) ? v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
  const cls = v => v > 0 ? 'up' : v < 0 ? 'dn' : '';
  const pct = v => Number.isFinite(v) ? `<span class="${cls(v)}">${v > 0 ? '+' : ''}${fmt(v)}%</span>` : '<span class="mut">—</span>';
  const bps = v => Number.isFinite(v) ? `<span class="${cls(v)}">${v > 0 ? '+' : ''}${fmt(v, 1)} bps</span>` : '<span class="mut">—</span>';
  const bandeira = c => `<img class="flag" src="https://flagcdn.com/w40/${c}.png" alt="" loading="lazy" width="22" height="15">`;

  // formatos de valor: pontos, reais, dólares, rendimento
  const VAL = {
    pts: v => fmt(v), brl: v => 'R$ ' + fmt(v), brl4: v => 'R$ ' + fmt(v, 4), usd: v => 'US$ ' + fmt(v),
    usd0: v => 'US$ ' + fmt(v, 0), cents: v => 'US$ ' + fmt(v / 100), pt: v => fmt(v) + ' pt', fx: v => fmt(v, 4), yld: v => fmt(v, 2) + '%',
  };

  const PAINEIS = [
    { id: 'brasil', t: 'Brasil', flag: 'br', col: 'Valor', itens: [
      { s: '^BVSP', n: 'Ibovespa', d: 'principais ações da B3', f: 'pts' },
      { s: 'IFIX', n: 'IFIX', d: 'fundos imobiliários', f: 'pts' },
      { s: 'SMAL11.SA', n: 'Small caps', d: 'ETF SMAL11 · empresas menores', f: 'brl' },
      { s: 'EWZ', n: 'Brasil em Nova York', d: 'ETF EWZ, em dólar', f: 'usd' },
      { s: 'BRL=X', n: 'Dólar', d: 'comercial', f: 'brl4' },
      { s: 'EURBRL=X', n: 'Euro', d: 'em reais', f: 'brl4' },
      { s: 'selic', n: 'Selic', d: 'meta ao ano', f: 'juro' },
      { s: 'cdi', n: 'CDI', d: 'ao ano', f: 'juro' },
      { s: 'di', f: 'di' },
    ] },
    { id: 'eua', t: 'Estados Unidos', flag: 'us', col: 'Pontos', itens: [
      { s: '^GSPC', n: 'S&P 500', d: '500 maiores empresas', f: 'pts' },
      { s: '^IXIC', n: 'Nasdaq', d: 'tecnologia', f: 'pts' },
      { s: '^DJI', n: 'Dow Jones', d: '30 gigantes tradicionais', f: 'pts' },
      { s: '^RUT', n: 'Russell 2000', d: 'empresas menores', f: 'pts' },
    ] },
    { id: 'moedas', t: 'Moedas', ic: '💱', col: 'Valor', itens: [
      { s: 'BRL=X', n: 'Dólar', d: 'em reais', f: 'brl4' },
      { s: 'EURBRL=X', n: 'Euro', d: 'em reais', f: 'brl4' },
      { s: 'DX-Y.NYB', n: 'DXY', d: 'dólar contra 6 moedas fortes', f: 'pt' },
      { s: 'EURUSD=X', n: 'Euro / Dólar', d: 'quantos dólares vale 1 euro', f: 'fx' },
      { s: 'BTC-USD', n: 'Bitcoin', d: 'em dólar', f: 'usd' },
    ] },
    { id: 'juros', t: 'Rendimentos EUA', ic: '📈', col: 'Rendimento', yld: true, itens: [
      { s: '2YY=F', n: '2 anos', d: 'Treasury', f: 'yld', flag: 'us' },
      { s: '^TNX', n: '10 anos', d: 'Treasury · referência global', f: 'yld', flag: 'us' },
      { s: '^TYX', n: '30 anos', d: 'Treasury', f: 'yld', flag: 'us' },
    ] },
    { id: 'commodities', t: 'Commodities', ic: '🛢️', col: 'Preço', itens: [
      { s: 'BZ=F', n: 'Petróleo Brent', d: 'barril', f: 'usd' },
      { s: 'CL=F', n: 'Petróleo WTI', d: 'barril', f: 'usd' },
      { s: 'GC=F', n: 'Ouro', d: 'onça', f: 'usd' },
      { s: 'SI=F', n: 'Prata', d: 'onça', f: 'usd' },
      { s: 'HG=F', n: 'Cobre', d: 'libra-peso', f: 'usd' },
      { s: 'ZS=F', n: 'Soja', d: 'bushel (Chicago)', f: 'cents' },
      { s: 'ZC=F', n: 'Milho', d: 'bushel (Chicago)', f: 'cents' },
      { s: 'KC=F', n: 'Café arábica', d: 'libra-peso (Nova York)', f: 'cents' },
    ] },
  ];

  // bolsas das maiores economias (ordem aproximada pelo tamanho do PIB)
  const MUNDO = [
    { p: 'Estados Unidos', c: 'us', b: 'Nova York (NYSE e Nasdaq)', i: [
      ['^GSPC', 'S&P 500', 'as 500 maiores empresas americanas; o principal termômetro da bolsa dos EUA'],
      ['^IXIC', 'Nasdaq Composite', 'mais de 3 mil ações da Nasdaq, puxado pelas gigantes de tecnologia'],
      ['^DJI', 'Dow Jones', '30 empresas gigantes e tradicionais; o índice mais antigo'] ] },
    { p: 'China', c: 'cn', b: 'Xangai, Shenzhen e Hong Kong', i: [
      ['000001.SS', 'Shanghai Composite', 'todas as ações da Bolsa de Xangai'],
      ['000300.SS', 'CSI 300', 'as 300 maiores de Xangai e Shenzhen; o "S&P 500 chinês"'],
      ['^HSI', 'Hang Seng', 'maiores empresas da Bolsa de Hong Kong, onde estrangeiros mais operam China'] ] },
    { p: 'Alemanha', c: 'de', b: 'Frankfurt', i: [['^GDAXI', 'DAX', 'as 40 maiores empresas alemãs']] },
    { p: 'Japão', c: 'jp', b: 'Tóquio', i: [['^N225', 'Nikkei 225', '225 empresas da Bolsa de Tóquio']] },
    { p: 'Índia', c: 'in', b: 'Mumbai (NSE e BSE)', i: [
      ['^NSEI', 'Nifty 50', 'as 50 maiores da Bolsa Nacional da Índia (NSE)'],
      ['^BSESN', 'Sensex', 'as 30 maiores da Bolsa de Bombaim (BSE)'] ] },
    { p: 'Reino Unido', c: 'gb', b: 'Londres', i: [['^FTSE', 'FTSE 100', 'as 100 maiores da Bolsa de Londres']] },
    { p: 'França', c: 'fr', b: 'Paris (Euronext)', i: [['^FCHI', 'CAC 40', 'as 40 maiores da bolsa de Paris']] },
    { p: 'Itália', c: 'it', b: 'Milão', i: [['FTSEMIB.MI', 'FTSE MIB', 'as 40 maiores da Bolsa de Milão']] },
    { p: 'Canadá', c: 'ca', b: 'Toronto', i: [['^GSPTSE', 'S&P/TSX', 'principais ações da Bolsa de Toronto, com muito peso de bancos e mineração']] },
    { p: 'Brasil', c: 'br', b: 'São Paulo (B3)', i: [['^BVSP', 'Ibovespa', 'as ações mais negociadas da B3']] },
    { p: 'Espanha', c: 'es', b: 'Madri', i: [['^IBEX', 'IBEX 35', 'as 35 maiores da Bolsa de Madri']] },
    { p: 'Coreia do Sul', c: 'kr', b: 'Seul', i: [['^KS11', 'KOSPI', 'todas as ações da Bolsa da Coreia (Samsung pesa muito)']] },
    { p: 'Austrália', c: 'au', b: 'Sydney', i: [['^AXJO', 'S&P/ASX 200', 'as 200 maiores da Bolsa da Austrália']] },
    { p: 'México', c: 'mx', b: 'Cidade do México', i: [['^MXX', 'S&P/BMV IPC', 'as 35 maiores da Bolsa Mexicana']] },
    { p: 'Zona do euro', c: 'eu', b: 'vários países', i: [['^STOXX50E', 'Euro Stoxx 50', 'as 50 maiores empresas dos países do euro']] },
  ];

  let M = null;
  const hm = t => t ? new Date(t * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : '';
  function cot(s) {
    if (s === 'IFIX' && M.ifix) return { p: M.ifix.pts, var: M.ifix.var, t: M.ifix.t };
    return (M.q || {})[s];
  }

  function linha(it, pn) {
    if (it.f === 'di') {
      const nome = { curto: 'curto prazo', medio: 'médio prazo', longo: 'longo prazo' };
      return (M.di || []).filter(x => Number.isFinite(x.taxa)).map(x =>
        `<div class="ma-r"><span class="nm">DI jan/${x.venc.slice(2, 4)}<small>juros futuros · ${nome[x.prazo] || ''}</small></span><span class="vl">${fmt(x.taxa)}%</span><span class="vr">${bps(x.bps)}</span></div>`).join('');
    }
    if (it.f === 'juro') {
      const v = (M.macro || {})[it.s];
      if (!Number.isFinite(v)) return '';
      return `<div class="ma-r"><span class="nm">${it.n}<small>${it.d}</small></span><span class="vl">${fmt(v)}%</span><span class="vr mut">—</span></div>`;
    }
    const q = cot(it.s);
    if (!q || !Number.isFinite(q.p)) return '';
    if (Math.abs(q.var) > 25 && it.s !== 'BTC-USD') q.var = NaN;
    const vr = pn.yld ? bps(Number.isFinite(q.dif) ? q.dif * 100 : NaN) : pct(q.var);
    return `<div class="ma-r"><span class="nm">${it.flag ? bandeira(it.flag) : ''}${it.n}<small>${it.d}</small></span>
      <span class="vl">${VAL[it.f](q.p)}</span><span class="vr">${vr}</span></div>`;
  }

  // cabeçalho clicável: fechado mostra só um resumo com os 2 primeiros ativos
  const cab = (id, icone, titulo, resumo) => `<details class="ma-p" data-fold="ma-${id}"><summary class="ma-h">${icone}<span class="ma-t">${titulo}</span><span class="ma-prev">${resumo}</span><span class="chev">▾</span></summary>`;
  function resumo(pn) {
    return pn.itens.filter(it => it.f !== 'juro' && it.f !== 'di').map(it => {
      const q = cot(it.s); if (!q || !Number.isFinite(q.p)) return '';
      return `${it.n} <b>${VAL[it.f](q.p)}</b> ${pn.yld ? bps(Number.isFinite(q.dif) ? q.dif * 100 : NaN) : pct(Math.abs(q.var) > 25 && it.s !== 'BTC-USD' ? NaN : q.var)}`;
    }).filter(Boolean).slice(0, 2).join('<i> · </i>');
  }
  function painel(pn) {
    const corpo = pn.itens.map(it => linha(it, pn)).join('');
    if (!corpo) return '';
    return cab(pn.id, pn.flag ? bandeira(pn.flag) : `<span class="ic">${pn.ic}</span>`, pn.t, resumo(pn)) +
      `<div class="ma-c"><span>${pn.yld ? 'Títulos' : 'Ativo'}</span><span>${pn.col}</span><span>Variação</span></div>${corpo}</details>`;
  }

  function painelMedo() {
    const v = cot('^VIX'), c = M.cnn;
    if (!v && !c) return '';
    let h = '';
    if (v && Number.isFinite(v.p)) {
      const z = v.p < 15 ? ['Calmo', 'good'] : v.p < 20 ? ['Normal', 'ok'] : v.p < 30 ? ['Tenso', 'warn'] : ['Pânico', 'bad'];
      const pos = Math.min(Math.max((v.p - 10) / 30, 0), 1) * 100;
      h += `<div class="medo">
        <div class="medo-top"><span class="nm">VIX<small>índice do medo de Wall Street: quanto o mercado espera que o S&P 500 oscile</small></span>
          <span class="vl">${fmt(v.p)}</span><span class="vr">${pct(v.var)}</span></div>
        <div class="medo-bar vix"><i style="left:${pos}%"></i></div>
        <div class="medo-esc"><span>10 · calmo</span><span>20</span><span>30</span><span>40+ · pânico</span></div>
        <p class="medo-z ${z[1]}">${z[0]} <small>(abaixo de 15 calmo; 15 a 20 normal; 20 a 30 tenso; acima de 30 pânico)</small></p></div>`;
    }
    if (c && Number.isFinite(c.score)) {
      const R = { 'extreme fear': ['Medo extremo', 'bad'], fear: ['Medo', 'warn'], neutral: ['Neutro', 'ok'], greed: ['Ganância', 'good'], 'extreme greed': ['Ganância extrema', 'good'] };
      const r = R[(c.rating || '').toLowerCase()] || [c.rating || '', 'ok'];
      const dif = Number.isFinite(c.ant) ? c.score - c.ant : NaN;
      h += `<div class="medo">
        <div class="medo-top"><span class="nm">Medo e Ganância (CNN)<small>de 0 (medo extremo) a 100 (ganância extrema), com 7 sinais da bolsa americana</small></span>
          <span class="vl">${c.score}</span><span class="vr">${Number.isFinite(dif) ? `<span class="${cls(dif)}">${dif > 0 ? '+' : ''}${dif}</span>` : ''}</span></div>
        <div class="medo-bar cnn"><i style="left:${c.score}%"></i></div>
        <div class="medo-esc"><span>0 · medo</span><span>25</span><span>50</span><span>75</span><span>100 · ganância</span></div>
        <p class="medo-z ${r[1]}">${r[0]} <small>${[Number.isFinite(c.ant) && `ontem ${c.ant}`, Number.isFinite(c.semana) && `há 1 semana ${c.semana}`, Number.isFinite(c.mes) && `há 1 mês ${c.mes}`].filter(Boolean).join(' · ')}</small></p></div>`;
    }
    const rs = [v && Number.isFinite(v.p) && `VIX <b>${fmt(v.p)}</b> ${pct(v.var)}`, c && Number.isFinite(c.score) && `CNN <b>${c.score}</b>`].filter(Boolean).join('<i> · </i>');
    return cab('medo', '<span class="ic">😨</span>', 'Índice do medo', rs) + `${h}</details>`;
  }

  function mundo() {
    const linhas = MUNDO.map(g => {
      const rs = g.i.map(([s, n, d]) => {
        const q = cot(s);
        if (!q || !Number.isFinite(q.p)) return '';
        return `<div class="mu-r"><span class="nm">${n}<small>${d}</small></span><span class="vl">${fmt(q.p)}</span><span class="vr">${pct(q.var)}</span>
          <span class="st ${q.aberto ? 'on' : ''}" title="${q.aberto ? 'pregão aberto' : 'pregão fechado'}">${q.aberto ? 'aberta' : 'fechada'}<small>${hm(q.t)}</small></span></div>`;
      }).join('');
      if (!rs) return '';
      return `<div class="mu-g"><div class="mu-pais">${bandeira(g.c)}<b>${g.p}</b><span>bolsa de ${g.b}</span></div>${rs}</div>`;
    }).join('');
    el('maMundo').innerHTML = linhas;
    const Q = MUNDO.flatMap(g => g.i.map(([s]) => cot(s))).filter(q => q && Number.isFinite(q.var));
    el('muPrev').innerHTML = Q.length ? `${MUNDO.length} economias · <span class="up">${Q.filter(q => q.var > 0).length} sobem</span> · <span class="dn">${Q.filter(q => q.var < 0).length} caem</span> · ${Q.filter(q => q.aberto).length} abertas agora` : '';
  }

  function render() {
    el('maGrid').innerHTML = [painel(PAINEIS[0]), painel(PAINEIS[1]), painel(PAINEIS[2]), painel(PAINEIS[3]), painelMedo(), painel(PAINEIS[4])].join('');
    mundo();
    const d = new Date(M.atualizado), min = Math.round((Date.now() - d) / 60000);
    el('maQuando').textContent = `atualizado ${min < 1 ? 'agora' : min < 60 ? `há ${min} min` : 'às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    aplicarFold(el('mercadoAgora'));
    el('mercadoAgora').hidden = false;
  }

  el('maTodos').addEventListener('click', () => {
    const D = [...el('mercadoAgora').querySelectorAll('details[data-fold]')], abrir = D.some(d => !d.open);
    D.forEach(d => { d.open = abrir; });
    el('maTodos').textContent = abrir ? 'Recolher tudo' : 'Abrir tudo';
  });
  async function carregar() {
    try { M = await carregarDados('mercado.json'); if (M && M.q) render(); } catch {}
  }
  carregar();
  setInterval(carregar, 5 * 60 * 1000);
})();
