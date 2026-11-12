// Carteira e rebalanceamento
const $ = id => document.getElementById(id);

const CLASSES = [
  { k: 'pos', n: 'RF Pós-fixado' },
  { k: 'inflacao', n: 'RF Inflação' },
  { k: 'pre', n: 'RF Prefixado' },
  { k: 'rfint', n: 'RF Internacional' },
  { k: 'rvbr', n: 'Renda Variável Brasil' },
  { k: 'rvint', n: 'Renda Variável Internacional' },
  { k: 'mm', n: 'Multimercado' },
  { k: 'fl', n: 'Fundos Listados' },
  { k: 'alt', n: 'Alternativos' },
];
const NOME = Object.fromEntries(CLASSES.map(c => [c.k, c.n]));
const PERFIS = { conservadora: 'Conservadora', moderada: 'Moderada', sofisticada: 'Sofisticada', personalizada: 'Personalizada' };
const REC_PADRAO = {
  conservadora: { pos: 63, inflacao: 12.5, pre: 12, rfint: 2.5, rvbr: 0, rvint: 2.5, mm: 2.5, fl: 5, alt: 0 },
  moderada: { pos: 26, inflacao: 22.5, pre: 15, rfint: 2.5, rvbr: 8.5, rvint: 4.5, mm: 13, fl: 5, alt: 3 },
  sofisticada: { pos: 10, inflacao: 27.5, pre: 15, rfint: 2.5, rvbr: 20, rvint: 7, mm: 8, fl: 5, alt: 5 },
  personalizada: { pos: 45, inflacao: 27.5, pre: 13.5, rfint: 0, rvbr: 0, rvint: 2.5, mm: 11.5, fl: 0, alt: 0 },
};
const STATUS = ['Pendente', 'Reservado', 'Concluído'];

let REC = store.get('rw_recomendadas', null) || JSON.parse(JSON.stringify(REC_PADRAO));

function estadoVazio() {
  return { cliente: '', conta: '', perfil: 'moderada', tol: '2', patrimonio: '', pct: {}, vendas: [], compras: [], saldoConta: '', aporte: '', considerar: 'todas' };
}
const v = x => { const n = parseNum(x); return Number.isFinite(n) ? n : 0; };
// carteiras salvas no formato antigo (ativo por ativo) viram percentuais por classe
function migrar(x) {
  x = Object.assign(estadoVazio(), x || {});
  if ((x.ativos || []).length && !Object.keys(x.pct || {}).length) {
    const tot = x.ativos.reduce((s, a) => s + v(a.saldo), 0), por = {};
    x.ativos.forEach(a => { por[a.classe] = (por[a.classe] || 0) + v(a.saldo); });
    x.patrimonio = tot ? NUM2.format(tot) : '';
    x.pct = Object.fromEntries(Object.entries(por).map(([k, s]) => [k, tot ? String(Math.round(s / tot * 10000) / 100).replace('.', ',') : '']));
    const at = id => x.ativos.find(a => a.id === id);
    x.vendas = (x.vendas || []).map(o => at(o.ativoId) ? { id: o.id, classe: at(o.ativoId).classe, nome: at(o.ativoId).nome, valor: o.valor, status: o.status || 'Pendente' } : null).filter(Boolean);
    x.compras = (x.compras || []).map(o => ({ id: o.id, classe: (o.ativoId && at(o.ativoId)?.classe) || o.classe || 'pos', nome: (o.ativoId && at(o.ativoId)?.nome) || o.nome || '', valor: o.valor, status: o.status || 'Pendente' }));
  }
  delete x.ativos; delete x.avisos; delete x.dataRef; delete x.patrimonioRelatorio;
  x.pct = x.pct || {};
  return x;
}
let S = migrar(store.get('rw_carteira_atual', {}));
const salvarAtual = () => store.set('rw_carteira_atual', S);

// ================= Cálculos =================
function calcular() {
  const total = v(S.patrimonio);
  const somaPct = CLASSES.reduce((t, c) => t + v(S.pct[c.k]), 0);
  const atual = Object.fromEntries(CLASSES.map(c => [c.k, total * v(S.pct[c.k]) / 100]));
  const conta = o => S.considerar === 'todas' || o.status === 'Concluído';
  const vendasCls = Object.fromEntries(CLASSES.map(c => [c.k, 0]));
  const comprasCls = Object.fromEntries(CLASSES.map(c => [c.k, 0]));
  let totVendas = 0, totCompras = 0, totVendasTodas = 0, totComprasTodas = 0;
  const avisos = [];
  S.vendas.forEach(o => { const val = v(o.valor); if (val <= 0) return; totVendasTodas += val; if (!conta(o)) return; vendasCls[o.classe] += val; totVendas += val; });
  S.compras.forEach(o => { const val = v(o.valor); if (val <= 0) return; totComprasTodas += val; if (!conta(o)) return; comprasCls[o.classe] += val; totCompras += val; });
  CLASSES.forEach(c => { if (vendasCls[c.k] > atual[c.k] + 0.5) avisos.push(`Vendas em ${c.n} (${brl(vendasCls[c.k])}) maiores que a posição da classe (${brl(atual[c.k])}).`); });
  const saldoConta = v(S.saldoConta), aporte = v(S.aporte);
  const disponivel = totVendas + saldoConta + aporte;
  const diferenca = disponivel - totCompras;

  const novo = {};
  CLASSES.forEach(c => { novo[c.k] = atual[c.k] - vendasCls[c.k] + comprasCls[c.k]; });
  novo.pos += -saldoConta + Math.max(diferenca, 0); // saldo usado sai do caixa; sobra volta para o caixa
  const totalNovo = Object.values(novo).reduce((s, x) => s + x, 0);

  const rec = REC[S.perfil] || {};
  const tol = Math.abs(v(S.tol)) || 0;
  const linhas = CLASSES.map(c => {
    const pa = total ? atual[c.k] / total * 100 : 0;
    const pn = totalNovo ? novo[c.k] / totalNovo * 100 : 0;
    const pr = v(rec[c.k]);
    return {
      ...c, atual: atual[c.k], pa, pr, dif: pa - pr, bal: pr / 100 * total - atual[c.k],
      novo: novo[c.k], pn, difN: pn - pr, balN: pr / 100 * totalNovo - novo[c.k],
      vendas: vendasCls[c.k], compras: comprasCls[c.k],
      foraA: Math.abs(pa - pr) > tol, foraN: Math.abs(pn - pr) > tol,
    };
  });
  const somaRec = CLASSES.reduce((s, c) => s + v(rec[c.k]), 0);
  const desvio = key => linhas.reduce((s, l) => s + Math.abs(l[key]), 0) / 2;
  return {
    total, totalNovo, linhas, somaRec, somaPct, tol, totVendas, totCompras, totVendasTodas, totComprasTodas,
    saldoConta, aporte, disponivel, diferenca, avisos,
    desvioA: desvio('dif'), desvioN: desvio('difN'),
    foraA: linhas.filter(l => l.foraA).length, foraN: linhas.filter(l => l.foraN).length,
  };
}

// ================= Renderização =================
const optsClasse = sel => CLASSES.map(c => `<option value="${c.k}" ${c.k === sel ? 'selected' : ''}>${c.n}</option>`).join('');
const optsStatus = sel => STATUS.map(s => `<option ${s === sel ? 'selected' : ''}>${s}</option>`).join('');

function renderCliente() {
  $('cliente').value = S.cliente || '';
  $('conta').value = S.conta || '';
  $('perfil').value = S.perfil;
  $('tol').value = S.tol;
  document.querySelectorAll('#segConsiderar button').forEach(b => b.classList.toggle('on', b.dataset.v === S.considerar));
  $('saldoConta').value = S.saldoConta || '';
  $('aporte').value = S.aporte || '';
  $('patrimonio').value = S.patrimonio || '';
}

// passo 2: % atual de cada classe
function renderAlocacao() {
  const rec = REC[S.perfil] || {};
  $('aloc').querySelector('tbody').innerHTML = CLASSES.map(c => `<tr data-k="${c.k}">
    <td class="cls">${c.n}</td>
    <td class="n"><input data-pct="${c.k}" inputmode="decimal" placeholder="0" value="${esc(S.pct[c.k] ?? '')}"></td>
    <td class="n" data-rs></td>
    <td class="n note hide-sm">${pct(v(rec[c.k]), 1)}</td></tr>`).join('');
  atualizarAlocacao();
}
function atualizarAlocacao() {
  const total = v(S.patrimonio);
  let soma = 0;
  CLASSES.forEach(c => { const p = v(S.pct[c.k]); soma += p; const td = document.querySelector(`#aloc tr[data-k="${c.k}"] [data-rs]`); if (td) td.textContent = p && total ? brl(total * p / 100) : '—'; });
  const ok = Math.abs(soma - 100) < 0.05, falta = 100 - soma;
  $('aloc').querySelector('tfoot').innerHTML = `<tr><td>Total</td><td class="n ${ok ? 'good' : soma ? 'bad' : ''}">${pct(soma, 2)}</td><td class="n">${total ? brl(total * soma / 100) : '—'}</td><td class="n note hide-sm">${pct(CLASSES.reduce((t, c) => t + v((REC[S.perfil] || {})[c.k]), 0), 1)}</td></tr>`;
  $('alocAviso').innerHTML = !soma ? '' : ok ? '<span class="good">✓ Soma 100%</span>'
    : `<span class="bad">A soma está em ${pct(soma, 2)} — ${falta > 0 ? `faltam ${pct(falta, 2)}` : `passou ${pct(-falta, 2)}`}.</span>`;
  $('qtdAloc').textContent = total ? brl(total) : 'vazio';
}

function ouBar(dif, max) {
  const w = Math.min(Math.abs(dif) / max * 50, 50);
  return `<div class="ou">${dif > 0.005 ? `<i class="over" style="width:${w}%"></i>` : dif < -0.005 ? `<i class="under" style="width:${w}%"></i>` : ''}</div>`;
}

function situacao(dif, tol) {
  if (Math.abs(dif) <= tol) return '<span class="pill good">✓ Dentro</span>';
  return dif > 0 ? '<span class="pill bad">▲ Acima</span>' : '<span class="pill warn">▼ Abaixo</span>';
}

function renderComparacao(R) {
  const max = Math.max(5, ...R.linhas.map(l => Math.abs(l.dif)), ...R.linhas.map(l => Math.abs(l.difN)));
  const mostrar = R.linhas.filter(l => l.atual || l.pr || l.novo);
  const temOrdens = Math.abs(R.totalNovo - R.total) > 0.005 || R.linhas.some(l => Math.abs(l.novo - l.atual) > 0.005);
  $('tComp').querySelector('tbody').innerHTML = mostrar.map(l => `
    <tr>
      <td class="cls">${l.n}</td>
      <td class="n">${brl(l.atual)}</td>
      <td class="n">${pct(l.pa, 1)}</td>
      <td class="n rec">${pct(l.pr, 1)}</td>
      <td><div class="row" style="flex-wrap:nowrap;gap:6px">${ouBar(l.dif, max)}<span class="pp ${Math.abs(l.dif) <= R.tol ? '' : l.dif > 0 ? 'bad' : 'good'}">${l.dif > 0 ? '+' : ''}${pct(l.dif, 1)}</span></div></td>
      <td class="n ${Math.abs(l.bal) < 0.5 ? '' : l.bal > 0 ? 'good' : 'bad'}">${Math.abs(l.bal) < 0.5 ? '—' : (l.bal > 0 ? '+' : '') + brl(l.bal)}</td>
      <td class="n novo">${brl(l.novo)}${Math.abs(l.novo - l.atual) > 0.005 ? `<br><span class="note ${l.novo > l.atual ? 'good' : 'bad'}">${l.novo > l.atual ? '+' : ''}${brl(l.novo - l.atual)}</span>` : ''}</td>
      <td class="n novo"><b>${pct(l.pn, 1)}</b><br><span class="note">${l.difN > 0 ? '+' : ''}${pct(l.difN, 1)}</span></td>
      <td class="c">${situacao(temOrdens ? l.difN : l.dif, R.tol)}</td>
    </tr>`).join('') || `<tr><td colspan="9" class="note">Sem dados ainda.</td></tr>`;
  $('compMobile').innerHTML = mostrar.map(l => {
    const d = temOrdens ? l.difN : l.dif;
    return `<div class="cm">
      <div class="t"><b>${l.n}</b>${situacao(d, R.tol)}</div>
      ${ouBar(d, max)}
      <div class="nums">
        <div>Atual<strong>${pct(l.pa, 1)}</strong>${brl(l.atual)}</div>
        <div>Recomendado<strong>${pct(l.pr, 1)}</strong>${Math.abs(l.bal) < 0.5 ? 'ok' : `<span class="${l.bal > 0 ? 'good' : 'bad'}">${l.bal > 0 ? 'comprar ' : 'vender '}${brl(Math.abs(l.bal))}</span>`}</div>
        <div>Depois<strong>${pct(l.pn, 1)}</strong>${brl(l.novo)}</div>
      </div></div>`;
  }).join('');
  $('tComp').querySelector('tfoot').innerHTML = `
    <tr><td>Total</td><td class="n">${brl(R.total)}</td><td class="n">100%</td>
      <td class="n ${Math.abs(R.somaRec - 100) < 0.05 ? '' : 'bad'}">${pct(R.somaRec, 1)}</td><td></td><td></td>
      <td class="n">${brl(R.totalNovo)}</td><td class="n">100%</td><td></td></tr>`;

  const melhora = R.desvioN < R.desvioA - 0.05, piora = R.desvioN > R.desvioA + 0.05;
  $('kpis').innerHTML = `
    <div class="kpi"><div class="l">Patrimônio considerado</div><div class="v">${brl(R.total)}</div><div class="s">perfil ${PERFIS[S.perfil]}</div></div>
    <div class="kpi"><div class="l">Fora do recomendado hoje</div><div class="v">${pct(R.desvioA, 1)}</div><div class="s">${R.foraA} de ${CLASSES.length} classes fora da tolerância</div></div>
    <div class="kpi ${temOrdens ? 'orange' : ''}"><div class="l">Depois das ordens</div><div class="v ${melhora ? 'good' : piora ? 'bad' : ''}">${temOrdens ? pct(R.desvioN, 1) : '—'}</div><div class="s">${temOrdens ? `${R.foraN} classes fora · ${melhora ? 'melhorou' : piora ? 'piorou' : 'sem mudança'}` : 'monte as ordens no passo 4'}</div></div>
    ${Math.abs(R.somaRec - 100) > 0.05 ? `<div class="kpi" style="grid-column:1/-1;background:var(--bad-soft)"><div class="s bad">A carteira recomendada "${PERFIS[S.perfil]}" soma ${pct(R.somaRec, 1)}. Ajuste em ⚙️ Carteiras recomendadas.</div></div>` : ''}`;
}

function renderSummary(R) {
  const dif = R.diferenca;
  $('summary').innerHTML = `
    <div class="kpi"><div class="l">Total em vendas</div><div class="v bad">${brl(R.totVendas)}</div>${S.considerar === 'concluidas' ? `<div class="s">de ${brl(R.totVendasTodas)} lançadas</div>` : ''}</div>
    <div class="kpi"><div class="l">Total disponível</div><div class="v">${brl(R.disponivel)}</div><div class="s">vendas + saldo + aporte</div></div>
    <div class="kpi"><div class="l">Total em compras</div><div class="v good">${brl(R.totCompras)}</div>${S.considerar === 'concluidas' ? `<div class="s">de ${brl(R.totComprasTodas)} lançadas</div>` : ''}</div>
    <div class="kpi ${dif < -0.005 ? '' : 'orange'}" style="${dif < -0.005 ? 'background:var(--bad-soft)' : ''}"><div class="l">${dif < -0.005 ? 'Falta (necessidade)' : 'Sobra'}</div><div class="v ${dif < -0.005 ? 'bad' : ''}">${brl(Math.abs(dif))}</div><div class="s">${dif < -0.005 ? 'compras maiores que o disponível' : 'fica em caixa (Pós-fixado)'}</div></div>
    ${R.avisos.length ? `<div class="kpi" style="grid-column:1/-1;background:var(--warn-soft)"><div class="s warn">${R.avisos.map(esc).join('<br>')}</div></div>` : ''}`;
}

// ---------- Movimentações (layout de posição consolidada) ----------
const FECHADAS = new Set(store.get('rw_carteira_fechadas', []));
function donut(p, cor) {
  const r = 20, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, p / 100));
  return `<svg width="52" height="52" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="${r}" fill="none" stroke="#e6e8eb" stroke-width="5"/><circle cx="26" cy="26" r="${r}" fill="none" stroke="${cor}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 26 26)"/><text x="26" y="30" text-anchor="middle" font-size="11" font-weight="800" fill="#22105a">${pct(p, 1).replace('%', '')}%</text></svg>`;
}
function cabecalhoClasse(l, R) {
  const muda = Math.abs(l.novo - l.atual) > 0.005;
  const cor = Math.abs((muda ? l.difN : l.dif)) <= R.tol ? '#16a06a' : (muda ? l.difN : l.dif) > 0 ? '#e2403a' : '#e89a0c';
  return `<div>${donut(muda ? l.pn : l.pa, cor)}</div>
    <div><div class="nmc">${l.n}</div><div class="sub">Atual ${pct(l.pa, 1)} · Recomendado ${pct(l.pr, 1)}${muda ? ` · <b style="color:var(--orange)">Depois ${pct(l.pn, 1)}</b>` : ''}</div></div>
    <div class="pos"><small>Posição</small><b>${brl(l.atual)}</b>${muda ? `<div class="dlt ${l.novo > l.atual ? 'good' : 'bad'}">${l.novo > l.atual ? '+' : '−'}${brl(Math.abs(l.novo - l.atual))} → ${brl(l.novo)}</div>` : ''}</div>
    <div class="chev">⌄</div>`;
}
function linhaOrdem(tipo, o) {
  const st = `<select data-k="status" class="status-sel ${o.status}">${optsStatus(o.status)}</select>`;
  const del = `<button class="danger sm" data-del type="button" title="Remover">✕</button>`;
  return `<div class="mrow ${tipo === 'v' ? 'venda' : 'novo'}" data-${tipo}="${o.id}">
    <span class="tg ${tipo === 'v' ? 'venda' : 'novo'}">${tipo === 'v' ? 'Vender' : 'Comprar'}</span>
    <input class="nome" data-k="nome" value="${esc(o.nome)}" placeholder="${tipo === 'v' ? 'Ativo que vai vender' : 'Ativo que vai comprar'}">
    <span class="rs"><span class="lbl">R$</span><input data-k="valor" inputmode="decimal" value="${esc(o.valor)}" placeholder="0,00"></span>
    ${st}${del}</div>`;
}
function sugestao(l) {
  if (Math.abs(l.balN) < 0.5 || !l.pr && !l.atual) return '';
  return l.balN > 0
    ? `<div class="msug">Para chegar ao recomendado: <b class="good">comprar ${brl(l.balN)}</b> <button class="sm ghost" data-sug="c" data-cls="${l.k}" type="button">Lançar compra</button></div>`
    : `<div class="msug">Para chegar ao recomendado: <b class="bad">vender ${brl(-l.balN)}</b> <button class="sm ghost" data-sug="v" data-cls="${l.k}" type="button">Lançar venda</button></div>`;
}
const gruposMov = R => R.total ? R.linhas.filter(l => l.atual > 0.005 || l.pr > 0 || S.vendas.some(o => o.classe === l.k) || S.compras.some(o => o.classe === l.k)) : [];
// redesenha só se mudou o conjunto de classes; senão só os números (não perde o toque nos botões)
function atualizarMov() {
  const k = gruposMov(calcular()).map(l => l.k).join(), atual = [...document.querySelectorAll('#mov .mgrp')].map(g => g.dataset.cls).join();
  if (k !== atual) renderMov(); else atualizarMovNumeros();
}
function renderMov() {
  const R = calcular();
  if (!R.total) { $('mov').innerHTML = '<p class="note">Preencha o patrimônio e os percentuais no passo 2 para montar as ordens.</p>'; return; }
  const grupos = gruposMov(R);
  $('mov').innerHTML = grupos.map(l => {
    const vendas = S.vendas.filter(o => o.classe === l.k), compras = S.compras.filter(o => o.classe === l.k);
    const fechado = FECHADAS.has(l.k);
    return `<div class="mgrp ${fechado ? 'fechado' : ''}" data-cls="${l.k}">
      <div class="mhead" data-toggle="${l.k}">${cabecalhoClasse(l, R)}</div>
      <div class="mbody">
        ${vendas.map(o => linhaOrdem('v', o)).join('')}${compras.map(o => linhaOrdem('c', o)).join('')}
        <div data-sugbox="${l.k}">${sugestao(l)}</div>
        <div class="madd no-print"><button class="sm secondary vend" data-add="v" data-cls="${l.k}" type="button">− Ativo para vender</button><button class="sm secondary comp" data-add="c" data-cls="${l.k}" type="button">+ Ativo para comprar</button></div>
      </div></div>`;
  }).join('');
}
function atualizarMovNumeros() {
  // atualiza cabeçalhos e sugestões sem redesenhar os campos (mantém o foco)
  const R = calcular();
  R.linhas.forEach(l => {
    const h = document.querySelector(`.mhead[data-toggle="${l.k}"]`); if (h) h.innerHTML = cabecalhoClasse(l, R);
    const sb = document.querySelector(`[data-sugbox="${l.k}"]`); if (sb) sb.innerHTML = sugestao(l);
  });
}

function renderRec() {
  const perfis = Object.keys(PERFIS);
  $('tRec').querySelector('thead').innerHTML = `<tr><th>Classe</th>${perfis.map(p => `<th class="n">${PERFIS[p]}</th>`).join('')}</tr>`;
  $('tRec').querySelector('tbody').innerHTML = CLASSES.map(c => `<tr><td>${c.n}</td>${perfis.map(p => `<td class="n"><input data-p="${p}" data-c="${c.k}" inputmode="decimal" value="${esc(String(REC[p]?.[c.k] ?? 0).replace('.', ','))}"></td>`).join('')}</tr>`).join('');
  renderRecTotais();
}
function renderRecTotais() {
  const perfis = Object.keys(PERFIS);
  $('tRec').querySelector('tfoot').innerHTML = `<tr><td>Total</td>${perfis.map(p => { const s = CLASSES.reduce((t, c) => t + v(REC[p]?.[c.k]), 0); return `<td class="n ${Math.abs(s - 100) < 0.05 ? 'good' : 'bad'}">${pct(s, 1)}</td>`; }).join('')}</tr>`;
}

function recalcular() {
  const R = calcular();
  renderComparacao(R);
  renderSummary(R);
  salvarAtual();
  return R;
}

function renderTudo() {
  renderCliente(); renderAlocacao(); renderSalvas(); recalcular(); renderMov();
}

// ================= Eventos =================
['cliente', 'conta'].forEach(k => $(k).addEventListener('input', e => { S[k] = e.target.value; salvarAtual(); }));
$('perfil').onchange = e => { S.perfil = e.target.value; renderAlocacao(); recalcular(); renderMov(); };
$('tol').oninput = e => { S.tol = e.target.value; recalcular(); atualizarMovNumeros(); };
$('saldoConta').oninput = e => { S.saldoConta = e.target.value; recalcular(); atualizarMovNumeros(); };
$('aporte').oninput = e => { S.aporte = e.target.value; recalcular(); atualizarMovNumeros(); };
$('segConsiderar').onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  S.considerar = b.dataset.v;
  document.querySelectorAll('#segConsiderar button').forEach(x => x.classList.toggle('on', x === b));
  recalcular(); atualizarMovNumeros();
};

// Alocação atual
$('patrimonio').addEventListener('input', e => { S.patrimonio = e.target.value; atualizarAlocacao(); recalcular(); atualizarMov(); });
$('aloc').addEventListener('input', e => {
  const k = e.target.dataset.pct; if (!k) return;
  S.pct[k] = e.target.value; atualizarAlocacao(); recalcular(); atualizarMov();
});
$('btnZerarAloc').onclick = () => {
  if (!confirmar('Apagar os percentuais da alocação atual?')) return;
  S.pct = {}; renderAlocacao(); recalcular(); renderMov();
};

// Movimentações
function focar(sel) { const el = document.querySelector(sel); if (el) { el.focus(); el.select && el.select(); } }
const ordemDe = el => el.dataset.v ? S.vendas.find(x => x.id === el.dataset.v) : S.compras.find(x => x.id === el.dataset.c);
$('mov').addEventListener('click', e => {
  const tg = e.target.closest('[data-toggle]');
  if (tg && !e.target.closest('button,input,select')) {
    const k = tg.dataset.toggle, g = tg.parentElement, fechar = !g.classList.contains('fechado');
    g.classList.toggle('fechado', fechar);
    if (fechar) FECHADAS.add(k); else FECHADAS.delete(k);
    store.set('rw_carteira_fechadas', [...FECHADAS]);
    return;
  }
  const add = e.target.closest('[data-add],[data-sug]');
  if (add) {
    const tipo = add.dataset.add || add.dataset.sug, k = add.dataset.cls, l = calcular().linhas.find(x => x.k === k);
    const valor = add.dataset.sug ? NUM2.format(Math.round(Math.abs(l.balN) * 100) / 100) : '';
    const o = { id: uid(), classe: k, nome: '', valor, status: 'Pendente' };
    (tipo === 'v' ? S.vendas : S.compras).push(o);
    recalcular(); renderMov(); focar(`.mrow[data-${tipo}="${o.id}"] input[data-k="nome"]`);
    return;
  }
  const row = e.target.closest('.mrow[data-v],.mrow[data-c]');
  if (row && e.target.closest('[data-del]')) {
    if (row.dataset.v) S.vendas = S.vendas.filter(x => x.id !== row.dataset.v); else S.compras = S.compras.filter(x => x.id !== row.dataset.c);
    recalcular(); renderMov();
  }
});
$('mov').addEventListener('input', e => {
  const row = e.target.closest('.mrow[data-v],.mrow[data-c]'), k = e.target.dataset.k; if (!row || !k) return;
  const o = ordemDe(row); o[k] = e.target.value;
  if (k === 'status') e.target.className = 'status-sel ' + o.status;
  recalcular(); atualizarMovNumeros();
});
$('btnAbrirTudo').onclick = () => {
  const grupos = [...document.querySelectorAll('#mov .mgrp')], abrir = grupos.some(g => g.classList.contains('fechado'));
  grupos.forEach(g => { const k = g.dataset.cls; g.classList.toggle('fechado', !abrir); if (abrir) FECHADAS.delete(k); else FECHADAS.add(k); });
  store.set('rw_carteira_fechadas', [...FECHADAS]);
};

// Carteiras recomendadas
$('tRec').addEventListener('input', e => {
  const i = e.target; if (!i.dataset.p) return;
  REC[i.dataset.p] = REC[i.dataset.p] || {};
  REC[i.dataset.p][i.dataset.c] = v(i.value);
  store.set('rw_recomendadas', REC);
  renderRecTotais(); recalcular();
});
$('btnRecPadrao').onclick = () => {
  if (!confirmar('Voltar as carteiras recomendadas para os valores padrão?')) return;
  REC = JSON.parse(JSON.stringify(REC_PADRAO)); store.set('rw_recomendadas', REC); renderRec(); recalcular();
};

// Salvar / abrir / exportar
const lista = () => store.get('rw_carteiras', {});
function renderSalvas() {
  const l = lista();
  $('salvas').innerHTML = '<option value="">Abrir carteira salva…</option>' +
    Object.keys(l).sort((a, b) => a.localeCompare(b, 'pt-BR')).map(k => `<option value="${esc(k)}">${esc(k)}</option>`).join('');
}
$('btnSalvar').onclick = () => {
  const nome = (S.cliente || '').trim() || (S.conta || '').trim();
  if (!nome) { toast('Digite o nome do cliente para salvar'); $('cliente').focus(); return; }
  const l = lista(); l[nome] = JSON.parse(JSON.stringify(S));
  if (store.set('rw_carteiras', l)) { renderSalvas(); toast('Carteira salva'); } else toast('Não foi possível salvar neste navegador');
};
$('salvas').onchange = e => {
  const l = lista(); const k = e.target.value; if (!k || !l[k]) return;
  S = migrar(JSON.parse(JSON.stringify(l[k]))); renderTudo(); toast('Carteira aberta');
};
$('btnNovo').onclick = () => {
  if ((v(S.patrimonio) || S.vendas.length || S.compras.length) && !confirmar('Começar uma carteira nova? O que não foi salvo será perdido.')) return;
  const perfil = S.perfil; S = estadoVazio(); S.perfil = perfil; renderTudo();
};
$('btnExcluir').onclick = () => {
  const nome = (S.cliente || '').trim() || (S.conta || '').trim();
  const l = lista();
  if (!nome || !l[nome]) { toast('Esta carteira não está salva'); return; }
  if (!confirmar(`Excluir a carteira salva "${nome}"?`)) return;
  delete l[nome]; store.set('rw_carteiras', l); renderSalvas(); toast('Excluída');
};
$('btnExport').onclick = () => {
  const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `carteira-${(S.cliente || S.conta || 'cliente').replace(/[^\w\-]+/g, '_')}.json`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

const ordensValidas = () => ({ vendas: S.vendas.filter(o => v(o.valor)), compras: S.compras.filter(o => v(o.valor)) });
$('btnCopiar').onclick = () => {
  const R = calcular(), { vendas, compras } = ordensValidas();
  const L = [`*Carteira ${S.cliente || ''}* — perfil ${PERFIS[S.perfil]}`, `Patrimônio: ${brl(R.total)}`, '', '*Alocação atual × recomendada*'];
  R.linhas.filter(l => l.atual || l.pr).forEach(l => {
    const tag = Math.abs(l.dif) <= R.tol ? '✅' : l.dif > 0 ? '🔺' : '🔻';
    L.push(`${tag} ${l.n}: ${pct(l.pa, 1)} (recom. ${pct(l.pr, 1)})`);
  });
  if (vendas.length || compras.length || R.aporte) {
    if (vendas.length) { L.push('', '*Vendas*'); vendas.forEach(o => L.push(`• ${o.nome || NOME[o.classe]} — ${NOME[o.classe]}: ${brl(v(o.valor))}`)); }
    if (compras.length) { L.push('', '*Compras*'); compras.forEach(o => L.push(`• ${o.nome || NOME[o.classe]} — ${NOME[o.classe]}: ${brl(v(o.valor))}`)); }
    if (R.aporte) L.push('', `Aporte: ${brl(R.aporte)}`);
    L.push('', '*Como fica*');
    R.linhas.filter(l => l.novo > 0.005 || l.pr).forEach(l => {
      const tag = Math.abs(l.difN) <= R.tol ? '✅' : l.difN > 0 ? '🔺' : '🔻';
      L.push(`${tag} ${l.n}: ${pct(l.pn, 1)} (recom. ${pct(l.pr, 1)})`);
    });
  }
  copyText(L.join('\n'));
};

// ---------- E-mail para o cliente ----------
const PERFIL_ADJ = { conservadora: 'Conservador', moderada: 'Moderado', sofisticada: 'Sofisticado', personalizada: 'personalizado' };
function dadosEmail() {
  const R = calcular(), { vendas, compras } = ordensValidas();
  const temOrdens = vendas.length || compras.length || R.aporte > 0;
  const linhas = R.linhas.filter(l => l.atual > 0.005 || l.pr > 0 || l.novo > 0.005);
  return { R, temOrdens, linhas, vendas, compras };
}
function emailTextoCarteira(nome, ass) {
  const { R, temOrdens, linhas, vendas, compras } = dadosEmail();
  const L = [Email.saudacaoTexto(nome), '',
    `Analisei a sua carteira e comparei com a nossa carteira recomendada para o perfil ${PERFIL_ADJ[S.perfil]}.`, '',
    `Patrimônio considerado: ${brl(R.total)}`, '', 'ALOCAÇÃO ATUAL × RECOMENDADA'];
  linhas.forEach(l => L.push(`• ${l.n}: ${pct(l.pa, 1)} (recomendado ${pct(l.pr, 1)})`));
  if (temOrdens) {
    L.push('', 'PROPOSTA DE MOVIMENTAÇÕES');
    if (vendas.length) { L.push('Resgates/vendas:'); vendas.forEach(o => L.push(`• ${o.nome || NOME[o.classe]} (${NOME[o.classe]}): ${brl(v(o.valor))}`)); }
    if (compras.length) { L.push('Aplicações:'); compras.forEach(o => L.push(`• ${o.nome || NOME[o.classe]} (${NOME[o.classe]}): ${brl(v(o.valor))}`)); }
    if (R.aporte) L.push(`Aporte adicional: ${brl(R.aporte)}`);
    L.push('', 'COMO A CARTEIRA FICA');
    linhas.forEach(l => L.push(`• ${l.n}: ${brl(l.atual)} → ${brl(l.novo)} · ${pct(l.pn, 1)} (recomendado ${pct(l.pr, 1)})`));
    if (R.desvioN < R.desvioA - 0.05) L.push('', `Com essas movimentações, a parte da carteira fora da alocação recomendada cai de ${pct(R.desvioA, 1)} para ${pct(R.desvioN, 1)}.`);
  }
  L.push('', 'Fico à disposição para conversarmos sobre a proposta.', '', 'Abraço,', ass);
  return L.join('\n');
}
function emailHtmlCarteira(nome, ass) {
  const { R, temOrdens, linhas, vendas, compras } = dadosEmail(), h = Email.h;
  const sit = d => Math.abs(d) <= R.tol ? `<span style="color:${h.cor.bom}">● dentro</span>` : d > 0 ? `<span style="color:${h.cor.ruim}">▲ acima</span>` : `<span style="color:#c77800">▼ abaixo</span>`;
  const cab = temOrdens ? ['Classe', 'Atual', 'Recomendado', 'Proposta', ''] : ['Classe', 'Atual', 'Recomendado', ''];
  const rows = linhas.map(l => temOrdens
    ? [esc(l.n), pct(l.pa, 1), `<b>${pct(l.pr, 1)}</b>`, `<b style="color:${h.cor.ora}">${pct(l.pn, 1)}</b>`, sit(l.difN)]
    : [esc(l.n), pct(l.pa, 1), `<b>${pct(l.pr, 1)}</b>`, sit(l.dif)]);
  let html = h.p(h.saudacao(nome)) +
    h.p(`Analisei a sua carteira e comparei com a nossa carteira recomendada para o perfil <b>${PERFIL_ADJ[S.perfil]}</b>. Patrimônio considerado: <b>${brl(R.total)}</b>.`) +
    h.titulo(temOrdens ? 'Alocação atual, recomendada e proposta' : 'Alocação atual × recomendada') +
    h.tabela(cab, rows, temOrdens ? ['left', 'right', 'right', 'right', 'left'] : ['left', 'right', 'right', 'left']);
  if (temOrdens) {
    html += h.titulo('Proposta de movimentações');
    const ord = [
      ...vendas.map(o => [`<span style="color:${h.cor.ruim};font-weight:bold">Resgate</span>`, esc(o.nome || NOME[o.classe]), esc(NOME[o.classe]), brl(v(o.valor))]),
      ...compras.map(o => [`<span style="color:${h.cor.bom};font-weight:bold">Aplicação</span>`, esc(o.nome || NOME[o.classe]), esc(NOME[o.classe]), brl(v(o.valor))]),
    ];
    if (R.aporte) ord.push([`<span style="color:${h.cor.bom};font-weight:bold">Aporte</span>`, 'Dinheiro novo', '', brl(R.aporte)]);
    html += h.tabela(['', 'Ativo', 'Classe', 'Valor'], ord, ['left', 'left', 'left', 'right']);
    html += h.titulo('Como cada classe fica');
    const rowsA = linhas.map(l => { const mv = l.novo - l.atual;
      return [`<b style="color:#22105a">${esc(l.n)}</b>`, l.atual > 0.005 ? brl(l.atual) : '—', Math.abs(mv) > 0.005 ? `<span style="color:${mv < 0 ? h.cor.ruim : h.cor.bom};font-weight:bold">${mv < 0 ? '−' : '+'}${brl(Math.abs(mv))}</span>` : '—', `<b>${l.novo > 0.005 ? brl(l.novo) : '—'}</b>`]; });
    html += h.tabela(['Classe', 'Hoje', 'Movimento', 'Depois'], rowsA, ['left', 'right', 'right', 'right']);
    if (R.desvioN < R.desvioA - 0.05) html += h.destaque(`Com essas movimentações, a parte da carteira fora da alocação recomendada cai de ${pct(R.desvioA, 1)} para ${pct(R.desvioN, 1)}.`, 'bom');
  }
  html += h.p('Fico à disposição para conversarmos sobre a proposta.') + h.p('Abraço,') + h.assinatura(ass) +
    h.rodape('Percentuais calculados sobre a posição informada. As movimentações dependem de liquidez, prazos e condições de mercado no momento da execução.');
  return h.wrap(html);
}
$('btnEmail').onclick = () => {
  if (!v(S.patrimonio)) { toast('Preencha o patrimônio e os percentuais primeiro'); $('patrimonio').focus(); return; }
  const temOrdens = dadosEmail().temOrdens;
  Email.abrir({
    assunto: temOrdens ? 'Proposta de rebalanceamento da sua carteira' : 'Análise da sua carteira de investimentos',
    nome: S.cliente || '', para: S.email || '',
    texto: emailTextoCarteira, html: emailHtmlCarteira,
    aoSalvarCliente: (nome, para) => { if (nome && !S.cliente) { S.cliente = nome; $('cliente').value = nome; } S.email = para; salvarAtual(); },
  });
};

function confirmar(msg) { try { return window.confirm(msg); } catch { return true; } }

renderRec();
renderTudo();

