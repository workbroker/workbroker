// Radar de ações: lê radar.json (GitHub Actions: carteira do Ibovespa pela B3, cotações do Yahoo,
// indicadores calculados com os balanços da CVM e calendário de resultados) + widget ao vivo da TradingView.
const $ = id => document.getElementById(id);
let RD = null, ORD = { k: 'peso', asc: false }, ABA_CAL = 'prox';
const n2 = (v, d = 2) => Number.isFinite(v) ? v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
const pv = v => Number.isFinite(v) ? `<span class="${v > 0 ? 'up' : v < 0 ? 'dn' : ''}">${v > 0 ? '+' : ''}${n2(v)}%</span>` : '—';
const bi = v => Number.isFinite(v) ? (v >= 1e9 ? 'R$ ' + n2(v / 1e9, 1) + ' bi' : 'R$ ' + n2(v / 1e6, 0) + ' mi') : '—';
const x = (v, d = 1) => Number.isFinite(v) ? n2(v, d) : '—';
const dBR = s => s ? s.slice(8, 10) + '/' + s.slice(5, 7) : '';
const triRot = ref => { if (!ref) return ''; const m = +ref.slice(5, 7), a = ref.slice(2, 4); return m === 12 ? `4T${a}` : `${m / 3}T${a}`; };
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
// "hoje" ou o dia do último pregão (fim de semana, feriado)
function quando() {
  const t = RD.acoes.reduce((m, a) => Math.max(m, a.t || 0), 0); if (!t) return 'hoje';
  const d = new Date(t * 1000), h = new Date();
  return d.toDateString() === h.toDateString() ? 'hoje' : `pregão de ${DIAS[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function kpis() {
  const A = RD.acoes, sobe = A.filter(a => a.var > 0).length, cai = A.filter(a => a.var < 0).length;
  const i = RD.ibov || {};
  const med = arr => { const v = arr.filter(Number.isFinite).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : NaN; };
  const ytd = A.reduce((s, a) => s + (Number.isFinite(a.ano) && a.peso ? a.ano * a.peso : 0), 0) / (A.reduce((s, a) => s + (Number.isFinite(a.ano) && a.peso ? a.peso : 0), 0) || 1);
  $('kpis').innerHTML = `
    <div class="kpi"><div class="l">Ibovespa</div><div class="v">${Number.isFinite(i.pts) ? Math.round(i.pts).toLocaleString('pt-BR') : '—'}</div><div class="s">${pv(i.var)} · ${quando()}</div></div>
    <div class="kpi"><div class="l">Sobem × caem</div><div class="v"><span class="up">${sobe}</span> × <span class="dn">${cai}</span></div><div class="s">de ${A.length} ações do índice</div></div>
    <div class="kpi"><div class="l">Variação mediana</div><div class="v ${med(A.map(a => a.var)) >= 0 ? 'up' : 'dn'}">${pv(med(A.map(a => a.var)))}</div><div class="s">metade das ações acima disso</div></div>
    <div class="kpi"><div class="l">No ano (média ponderada)</div><div class="v ${ytd >= 0 ? 'up' : 'dn'}">${pv(ytd)}</div><div class="s">ações do índice pelo peso</div></div>`;
}
function item(a, campo = 'var') {
  const mx = Math.max(...RD.acoes.map(b => Math.abs(b.var || 0)), 0.01);
  return `<button class="it" type="button" data-tk="${a.tk}" style="border:0;font:inherit;color:inherit;text-align:left;cursor:pointer">
    <span class="tk">${a.tk}</span><span><span class="nm">${esc(a.nome || '')}</span><div class="bar"><i style="width:${Math.abs(a.var || 0) / mx * 100}%;background:${a.var >= 0 ? 'var(--good)' : 'var(--bad)'}"></i></div></span>
    <span class="vv">${pv(a[campo])}<small>R$ ${n2(a.preco)}</small></span></button>`;
}
function altasQuedas() {
  const A = RD.acoes.filter(a => Number.isFinite(a.var));
  $('altas').innerHTML = [...A].sort((a, b) => b.var - a.var).slice(0, 6).map(a => item(a)).join('');
  $('quedas').innerHTML = [...A].sort((a, b) => a.var - b.var).slice(0, 6).map(a => item(a)).join('');
}
function gigantes() {
  const A = [...RD.acoes].sort((a, b) => (b.peso || b.mcap / 1e12 || 0) - (a.peso || a.mcap / 1e12 || 0)).slice(0, 12);
  $('gig').innerHTML = A.map(a => `<button class="g" type="button" data-tk="${a.tk}">
    <div style="display:flex;justify-content:space-between;align-items:baseline"><span class="tk">${a.tk}</span><span style="font-size:12px;color:var(--muted)">${a.peso ? n2(a.peso, 1) + '%' : ''}</span></div>
    <div class="pr">R$ ${n2(a.preco)}</div><div style="font-weight:800;font-size:14px">${pv(a.var)}</div>
    <div class="mt">P/L ${x(a.pl)} · P/VP ${x(a.pvp, 2)}<br>DY ${Number.isFinite(a.dy) ? n2(a.dy, 1) + '%' : '—'} · ano ${pv(a.ano)}</div></button>`).join('');
}
function calendario() {
  const hoje = new Date().toISOString().slice(0, 10), grande = new Set([...RD.acoes].sort((a, b) => (b.peso || 0) - (a.peso || 0)).slice(0, 15).map(a => a.tk));
  // uma linha por empresa (ON e PN da mesma empresa trazem a mesma data)
  const vistos = new Set(), L = [];
  [...RD.acoes].sort((a, b) => (b.peso || 0) - (a.peso || 0)).forEach(a => {
    const r = a.res?.[ABA_CAL]; if (!r) return;
    const k = a.tk.slice(0, 4); if (vistos.has(k)) return; vistos.add(k);
    if (ABA_CAL === 'prox' && r.d < hoje) return;
    L.push({ a, r });
  });
  L.sort((p, q) => ABA_CAL === 'prox' ? p.r.d.localeCompare(q.r.d) : q.r.d.localeCompare(p.r.d));
  const lim = ABA_CAL === 'prox' ? 40 : 30;
  $('cal').innerHTML = L.slice(0, lim).map(({ a, r }) => {
    const dt = new Date(r.d + 'T12:00:00');
    return `<button class="c ${grande.has(a.tk) ? 'big' : ''}" type="button" data-tk="${a.tk}" style="border:0;font:inherit;color:inherit;text-align:left;cursor:pointer">
      <span class="d">${dBR(r.d)}<small>${DIAS[dt.getDay()]}</small></span>
      <span><b>${a.tk}</b> <span style="color:var(--muted);font-size:12.5px">${esc(a.nome || '')}</span></span>
      <span style="font-size:12.5px;color:var(--muted);text-align:right">${triRot(r.ref)}${r.est ? '<br><i>previsão</i>' : ''}</span></button>`;
  }).join('') || `<p class="note">${ABA_CAL === 'prox' ? 'Nenhuma data prevista ainda.' : 'Sem datas.'}</p>`;
  $('calNota').innerHTML = ABA_CAL === 'prox'
    ? 'Previsão pela data em que cada empresa divulgou o mesmo trimestre no ano passado; a data oficial sai no calendário de eventos da empresa. Em destaque, as 15 maiores do índice.'
    : 'Data em que o ITR ou o balanço anual chegou à CVM (geralmente a noite da divulgação). Em destaque, as 15 maiores do índice.';
}
$('tabsCal').addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (!b) return; ABA_CAL = b.dataset.c; $('tabsCal').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); calendario(); });

const COLS = [
  ['tk', 'Ação'], ['preco', 'Preço'], ['var', 'Dia'], ['mes', 'Mês'], ['ano', 'Ano'], ['a12', '12 meses'],
  ['dy', 'DY'], ['pl', 'P/L'], ['pvp', 'P/VP'], ['roe', 'ROE'], ['mcap', 'Valor de mercado'], ['peso', 'Peso'],
];
function tabela() {
  const q = normE($('busca').value);
  let A = RD.acoes.filter(a => !q || normE(`${a.tk} ${a.nome} ${a.setor || ''}`).includes(q));
  const k = ORD.k;
  A.sort((a, b) => k === 'tk' ? a.tk.localeCompare(b.tk) * (ORD.asc ? 1 : -1)
    : ((Number.isFinite(a[k]) ? a[k] : -Infinity) - (Number.isFinite(b[k]) ? b[k] : -Infinity)) * (ORD.asc ? 1 : -1));
  $('tAcoes').querySelector('thead').innerHTML = `<tr>${COLS.map(([c, t]) => `<th data-k="${c}" class="${c === 'tk' ? '' : 'n'} ${ORD.k === c ? 'on' + (ORD.asc ? ' asc' : '') : ''}">${t}</th>`).join('')}</tr>`;
  $('tAcoes').querySelector('tbody').innerHTML = A.map(a => `<tr data-tk="${a.tk}" style="cursor:pointer">
    <td><div class="tk">${a.tk}</div><div class="nm">${esc(a.nome || '')}</div></td>
    <td class="n">${n2(a.preco)}</td><td class="n">${pv(a.var)}</td><td class="n">${pv(a.mes)}</td><td class="n">${pv(a.ano)}</td><td class="n">${pv(a.a12)}</td>
    <td class="n">${Number.isFinite(a.dy) ? n2(a.dy, 1) + '%' : '—'}</td><td class="n">${x(a.pl)}</td><td class="n">${x(a.pvp, 2)}</td>
    <td class="n">${Number.isFinite(a.roe) ? n2(a.roe, 1) + '%' : '—'}</td><td class="n">${bi(a.mcap)}</td><td class="n">${a.peso ? n2(a.peso, 2) + '%' : '—'}</td></tr>`).join('');
}
const normE = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
$('tAcoes').addEventListener('click', e => {
  const th = e.target.closest('th[data-k]');
  if (th) { const k = th.dataset.k; ORD = { k, asc: ORD.k === k ? !ORD.asc : k === 'tk' }; tabela(); return; }
});
$('busca').addEventListener('input', tabela);

function detalhe(tk) {
  const a = RD.acoes.find(b => b.tk === tk); if (!a) return;
  const pos = a.max52 > a.min52 ? (a.preco - a.min52) / (a.max52 - a.min52) * 100 : 50;
  $('dlgT').innerHTML = `${a.tk} <span style="font-weight:600;color:var(--muted);font-size:14px">${esc(a.nome || '')}</span>`;
  $('dlgB').innerHTML = `
    <div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap"><span style="font-size:28px;font-weight:800">R$ ${n2(a.preco)}</span><span style="font-size:18px;font-weight:800">${pv(a.var)}</span><span class="note">${a.setor ? esc(a.setor) : ''}</span></div>
    <div class="ind" style="margin-top:12px">
      <div>Mês<b>${pv(a.mes)}</b></div><div>Ano<b>${pv(a.ano)}</b></div><div>12 meses<b>${pv(a.a12)}</b></div>
      <div>Dividend yield<b>${Number.isFinite(a.dy) ? n2(a.dy, 1) + '%' : '—'}</b></div><div>P/L<b>${x(a.pl)}</b></div><div>P/VP<b>${x(a.pvp, 2)}</b></div>
      <div>ROE<b>${Number.isFinite(a.roe) ? n2(a.roe, 1) + '%' : '—'}</b></div><div>Valor de mercado<b>${bi(a.mcap)}</b></div><div>Peso no Ibovespa<b>${a.peso ? n2(a.peso, 2) + '%' : '—'}</b></div>
    </div>
    <div class="faixa"><i style="left:${Math.min(Math.max(pos, 0), 100)}%"></i></div>
    <div style="display:flex;justify-content:space-between;font-size:12.5px;color:var(--muted)"><span>mín. 12m R$ ${n2(a.min52)}</span><span>máx. 12m R$ ${n2(a.max52)}</span></div>
    ${a.res ? `<p style="margin:14px 0 0;font-size:14px">${a.res.ult ? `Último resultado: <b>${triRot(a.res.ult.ref)}</b> em ${a.res.ult.d.split('-').reverse().join('/')}` : ''}${a.res.prox ? `<br>Próximo: <b>${triRot(a.res.prox.ref)}</b> por volta de ${a.res.prox.d.split('-').reverse().join('/')} <span class="note">(previsão pelo ano passado)</span>` : ''}</p>` : ''}
    <div style="height:300px;margin-top:14px;border-radius:14px;overflow:hidden" id="tvMini"></div>
    <p class="note" style="margin-top:8px">DY: dividendos e JCP pagos nos últimos 12 meses ÷ preço. P/L e ROE: lucro dos últimos 12 meses dos controladores. P/VP: valor de mercado ÷ patrimônio dos controladores (último balanço na CVM).</p>`;
  $('dlg').hidden = false; $('dlg').querySelector('.modal').scrollTop = 0; document.body.style.overflow = 'hidden';
  tvWidget($('tvMini'), 'mini-symbol-overview', { symbol: `BMFBOVESPA:${a.tk}`, width: '100%', height: '100%', locale: 'br', dateRange: '12M', colorTheme: 'light', isTransparent: true, autosize: true, largeChartUrl: '' });
}
function fechar() { $('dlg').hidden = true; document.body.style.overflow = ''; }
$('dlgX').onclick = fechar;
$('dlg').addEventListener('click', e => { if (e.target.id === 'dlg') fechar(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('dlg').hidden) fechar(); });
document.addEventListener('click', e => {
  if (e.target.closest('#dlg')) return;
  const b = e.target.closest('[data-tk]'); if (b && !e.target.closest('th')) detalhe(b.dataset.tk);
});

tvWidget($('tv'), 'hotlists', {
  colorTheme: 'light', dateRange: '1D', exchange: 'BMFBOVESPA', showChart: true, locale: 'br', largeChartUrl: '',
  isTransparent: true, showSymbolLogo: true, showFloatingTooltip: false, width: '100%', height: '100%',
  plotLineColorGrowing: 'rgba(255, 90, 0, 1)', plotLineColorFalling: 'rgba(255, 90, 0, 1)',
  gridLineColor: 'rgba(240, 243, 250, 0)', scaleFontColor: 'rgba(109, 106, 128, 1)',
  belowLineFillColorGrowing: 'rgba(255, 90, 0, 0.12)', belowLineFillColorFalling: 'rgba(255, 90, 0, 0.12)',
  belowLineFillColorGrowingBottom: 'rgba(255, 90, 0, 0)', belowLineFillColorFallingBottom: 'rgba(255, 90, 0, 0)', symbolActiveColor: 'rgba(255, 90, 0, 0.10)',
});

async function carregar() {
  try {
    RD = await carregarDados('radar.json');
    kpis(); altasQuedas(); gigantes(); calendario(); tabela();
    document.querySelectorAll('.qd').forEach(el => { el.textContent = quando(); });
    const t = RD.acoes.reduce((m, a) => Math.max(m, a.t || 0), 0);
    $('rodape').innerHTML = `Cotações de ${t ? new Date(t * 1000).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'} (Yahoo Finance, atualizadas mais ou menos de hora em hora; ações da B3 com atraso). Carteira e pesos do Ibovespa: B3. Indicadores calculados com os balanços da CVM (atualizados uma vez por dia). O painel "Toda a bolsa ao vivo" é da TradingView, com 15 minutos de atraso. Informação para acompanhamento, não é recomendação.`;
  } catch (e) {
    console.error(e);
    $('kpis').innerHTML = '<p class="note">Dados ainda não disponíveis. Tente de novo mais tarde.</p>';
  }
}
carregar();
setInterval(carregar, 10 * 60 * 1000);
