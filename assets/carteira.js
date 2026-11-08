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
  return { cliente: '', conta: '', dataRef: '', perfil: 'moderada', tol: '2', ativos: [], vendas: [], compras: [], saldoConta: '', aporte: '', considerar: 'todas', avisos: [] };
}
let S = Object.assign(estadoVazio(), store.get('rw_carteira_atual', {}));
const salvarAtual = () => store.set('rw_carteira_atual', S);
const v = x => { const n = parseNum(x); return Number.isFinite(n) ? n : 0; };

// ================= Cálculos =================
function calcular() {
  const atual = Object.fromEntries(CLASSES.map(c => [c.k, 0]));
  S.ativos.forEach(a => { atual[a.classe] = (atual[a.classe] || 0) + v(a.saldo); });
  const total = Object.values(atual).reduce((s, x) => s + x, 0);

  const conta = o => S.considerar === 'todas' || o.status === 'Concluído';
  const vendasCls = Object.fromEntries(CLASSES.map(c => [c.k, 0]));
  const comprasCls = Object.fromEntries(CLASSES.map(c => [c.k, 0]));
  const usado = {};
  let totVendas = 0, totCompras = 0, totVendasTodas = 0, totComprasTodas = 0;
  const avisos = [];
  S.vendas.forEach(o => {
    const a = S.ativos.find(x => x.id === o.ativoId);
    let val = v(o.valor);
    if (!a || val <= 0) return;
    const disp = v(a.saldo) - (usado[a.id] || 0);
    if (val > disp + 0.005) { avisos.push(`Venda de "${a.nome}" maior que o saldo disponível.`); val = Math.max(disp, 0); }
    usado[a.id] = (usado[a.id] || 0) + val;
    totVendasTodas += val;
    if (!conta(o)) return;
    vendasCls[a.classe] += val; totVendas += val;
  });
  S.compras.forEach(o => {
    const val = v(o.valor); if (val <= 0) return;
    totComprasTodas += val;
    if (!conta(o)) return;
    comprasCls[o.classe] += val; totCompras += val;
  });
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
      foraA: Math.abs(pa - pr) > tol, foraN: Math.abs(pn - pr) > tol,
    };
  });
  const somaRec = CLASSES.reduce((s, c) => s + v(rec[c.k]), 0);
  const desvio = key => linhas.reduce((s, l) => s + Math.abs(l[key]), 0) / 2;
  return {
    total, totalNovo, linhas, somaRec, tol, totVendas, totCompras, totVendasTodas, totComprasTodas,
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
  renderImportInfo();
}

function renderImportInfo() {
  const el = $('importInfo');
  if (!S.dataRef && !S.avisos?.length) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div class="imported">
      ${S.dataRef ? `<span class="pill good">✓ XPerformance importado</span><span class="pill">Ref. ${esc(S.dataRef)}</span>` : ''}
      ${S.patrimonioRelatorio ? `<span class="pill">Patrimônio bruto ${brl(S.patrimonioRelatorio)}</span>` : ''}
      <span class="pill">${S.ativos.length} ativos</span>
    </div>
    ${(S.avisos || []).map(a => `<p class="note" style="background:var(--warn-soft);color:#7a4c00;padding:8px 10px;border-radius:10px;margin:8px 0 0">⚠️ ${esc(a)}</p>`).join('')}`;
}

function renderAtivos() {
  const total = S.ativos.reduce((s, a) => s + v(a.saldo), 0);
  $('qtdAtivos').textContent = S.ativos.length ? `${S.ativos.length} · ${brl(total)}` : 'vazio';
  if (!S.ativos.length) {
    $('assets').innerHTML = '<p class="note" style="padding:10px 0">Importe o PDF do XPerformance ou adicione os ativos manualmente.</p>';
    return;
  }
  let html = '';
  CLASSES.forEach(c => {
    const lista = S.ativos.filter(a => a.classe === c.k);
    if (!lista.length) return;
    const sub = lista.reduce((s, a) => s + v(a.saldo), 0);
    html += `<div class="asset-group"><span>${c.n}</span><span class="muted" data-sub="${c.k}">${brl(sub)}</span></div>`;
    html += lista.map(a => `
      <div class="asset" data-id="${a.id}">
        <div class="nm"><input data-k="nome" value="${esc(a.nome)}" placeholder="Nome do ativo">
          ${a.estrategia ? `<div class="xp">XP: ${esc(a.estrategia)}${a.revisar ? ' · <span class="warn">confira a classe</span>' : ''}</div>` : ''}</div>
        <div class="cl"><select data-k="classe">${optsClasse(a.classe)}</select></div>
        <div class="vl"><input data-k="saldo" inputmode="decimal" value="${esc(fmtIn(a.saldo))}" style="text-align:right"></div>
        <div class="pc" data-pct>${total ? pct(v(a.saldo) / total * 100) : '—'}</div>
        <div class="dl"><button class="danger" data-del title="Remover">✕</button></div>
      </div>`).join('');
  });
  $('assets').innerHTML = html;
}

function fmtIn(x) {
  if (typeof x === 'number') return NUM2.format(x);
  return x ?? '';
}

function atualizarPctsAtivos() {
  const total = S.ativos.reduce((s, a) => s + v(a.saldo), 0);
  document.querySelectorAll('#assets .asset').forEach(el => {
    const a = S.ativos.find(x => x.id === el.dataset.id);
    if (a) el.querySelector('[data-pct]').textContent = total ? pct(v(a.saldo) / total * 100) : '—';
  });
  CLASSES.forEach(c => {
    const s = document.querySelector(`[data-sub="${c.k}"]`);
    if (s) s.textContent = brl(S.ativos.filter(a => a.classe === c.k).reduce((t, a) => t + v(a.saldo), 0));
  });
  $('qtdAtivos').textContent = S.ativos.length ? `${S.ativos.length} · ${brl(total)}` : 'vazio';
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
  $('totVendas').textContent = brl(R.totVendasTodas);
  $('totCompras').textContent = brl(R.totComprasTodas);
}

function optsAtivos(sel) {
  return '<option value="">Escolha o ativo…</option>' + CLASSES.map(c => {
    const lista = S.ativos.filter(a => a.classe === c.k);
    if (!lista.length) return '';
    return `<optgroup label="${c.n}">${lista.map(a => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${esc(a.nome || '(sem nome)')} · ${brl(v(a.saldo))}</option>`).join('')}</optgroup>`;
  }).join('');
}

function renderVendas() {
  if (!S.vendas.length) { $('vendas').innerHTML = '<p class="note">Nenhuma venda lançada.</p>'; return; }
  $('vendas').innerHTML = S.vendas.map((o, i) => {
    const a = S.ativos.find(x => x.id === o.ativoId);
    return `<div class="order" data-id="${o.id}">
      <label class="f full">Ativo <select data-k="ativoId">${optsAtivos(o.ativoId)}</select></label>
      <label class="f">Valor (R$)
        <div class="row" style="flex-wrap:nowrap;gap:4px"><input data-k="valor" inputmode="decimal" value="${esc(o.valor)}" placeholder="0,00"><button class="sm secondary" data-tudo type="button">Tudo</button></div></label>
      <label class="f">Status <select data-k="status" class="status-sel ${o.status}">${optsStatus(o.status)}</select></label>
      <div class="meta"><span>${a ? `<span class="pill">${NOME[a.classe]}</span>` : ''}</span><button class="danger sm" data-del type="button">Remover</button></div>
    </div>`;
  }).join('');
}

function renderCompras() {
  if (!S.compras.length) { $('compras').innerHTML = '<p class="note">Nenhuma compra lançada.</p>'; return; }
  $('compras').innerHTML = S.compras.map(o => `
    <div class="order" data-id="${o.id}">
      <label class="f full">Ativo <input data-k="nome" value="${esc(o.nome)}" placeholder="Ex.: LCD BNDES, CDB IPCA+, fundo…"></label>
      <label class="f">Classe <select data-k="classe">${optsClasse(o.classe)}</select></label>
      <label class="f">Valor (R$) <input data-k="valor" inputmode="decimal" value="${esc(o.valor)}" placeholder="0,00"></label>
      <div class="meta"><label class="f" style="flex-direction:row;align-items:center;gap:6px">Status <select data-k="status" class="status-sel ${o.status}" style="width:auto">${optsStatus(o.status)}</select></label><button class="danger sm" data-del type="button">Remover</button></div>
    </div>`).join('');
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
  renderCliente(); renderAtivos(); renderVendas(); renderCompras(); renderSalvas(); recalcular();
}

// ================= Importar PDF =================
async function importarPDF(file) {
  if (!file) return;
  $('importInfo').innerHTML = '<p class="note">⏳ Lendo o PDF…</p>';
  try {
    const r = await XPParser.parse(await file.arrayBuffer(), file.name);
    const temDados = S.ativos.length || S.vendas.length || S.compras.length;
    if (temDados && !confirmar('Substituir a carteira atual pelos ativos deste PDF? As ordens lançadas serão apagadas.')) { renderImportInfo(); return; }
    const perfil = S.perfil;
    S = estadoVazio();
    S.perfil = perfil;
    S.cliente = r.cliente || '';
    S.conta = r.conta || '';
    S.dataRef = r.dataRef || '';
    S.patrimonioRelatorio = r.patrimonio;
    S.avisos = r.avisos;
    S.ativos = r.ativos.map(a => ({ id: uid(), nome: a.nome, estrategia: a.estrategia, classe: a.classe, saldo: a.saldo, qtd: a.qtd, revisar: a.revisar, rentMes: a.rentMes, rentAno: a.rentAno }));
    renderTudo();
    $('cardAtivos').open = false;
    toast(`${S.ativos.length} ativos importados`);
  } catch (e) {
    console.error(e);
    $('importInfo').innerHTML = `<p class="note bad">❌ ${esc(e.message || 'Não foi possível ler o PDF.')}</p>`;
  }
}
$('drop').onclick = () => $('pdfFile').click();
$('pdfFile').onchange = e => { importarPDF(e.target.files[0]); e.target.value = ''; };
['dragover', 'dragenter'].forEach(ev => $('drop').addEventListener(ev, e => { e.preventDefault(); $('drop').classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => $('drop').addEventListener(ev, e => { e.preventDefault(); $('drop').classList.remove('over'); }));
$('drop').addEventListener('drop', e => importarPDF(e.dataTransfer.files[0]));

// ================= Eventos =================
['cliente', 'conta'].forEach(k => $(k).addEventListener('input', e => { S[k] = e.target.value; salvarAtual(); }));
$('perfil').onchange = e => { S.perfil = e.target.value; recalcular(); };
$('tol').oninput = e => { S.tol = e.target.value; recalcular(); };
$('saldoConta').oninput = e => { S.saldoConta = e.target.value; recalcular(); };
$('aporte').oninput = e => { S.aporte = e.target.value; recalcular(); };
$('segConsiderar').onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  S.considerar = b.dataset.v;
  document.querySelectorAll('#segConsiderar button').forEach(x => x.classList.toggle('on', x === b));
  recalcular();
};

// Ativos
$('assets').addEventListener('input', e => {
  const el = e.target.closest('.asset'); if (!el || !e.target.dataset.k) return;
  const a = S.ativos.find(x => x.id === el.dataset.id);
  const k = e.target.dataset.k;
  if (k === 'classe') return;
  a[k] = e.target.value;
  if (k === 'saldo') atualizarPctsAtivos();
  recalcular();
});
$('assets').addEventListener('change', e => {
  if (e.target.dataset.k !== 'classe') return;
  const a = S.ativos.find(x => x.id === e.target.closest('.asset').dataset.id);
  a.classe = e.target.value; a.revisar = false;
  renderAtivos(); renderVendas(); recalcular();
});
$('assets').addEventListener('focusout', e => {
  if (e.target.dataset.k === 'nome') renderVendas();
});
$('assets').addEventListener('click', e => {
  if (!e.target.closest('[data-del]')) return;
  const id = e.target.closest('.asset').dataset.id;
  S.ativos = S.ativos.filter(a => a.id !== id);
  S.vendas = S.vendas.filter(o => o.ativoId !== id);
  renderAtivos(); renderVendas(); recalcular();
});
$('btnAddAtivo').onclick = () => {
  S.ativos.push({ id: uid(), nome: '', classe: 'pos', saldo: '' });
  renderAtivos(); recalcular();
  const inputs = document.querySelectorAll('#assets .asset input[data-k="nome"]');
  const last = [...inputs].find(i => !i.value); if (last) last.focus();
};

// Vendas
$('btnAddVenda').onclick = () => { S.vendas.push({ id: uid(), ativoId: '', valor: '', status: 'Pendente' }); renderVendas(); recalcular(); };
$('vendas').addEventListener('input', e => {
  const el = e.target.closest('.order'); if (!el || !e.target.dataset.k) return;
  const o = S.vendas.find(x => x.id === el.dataset.id);
  o[e.target.dataset.k] = e.target.value;
  if (e.target.dataset.k === 'ativoId') {
    const a = S.ativos.find(x => x.id === o.ativoId);
    if (a && !v(o.valor)) o.valor = NUM2.format(v(a.saldo));
    renderVendas();
  }
  if (e.target.dataset.k === 'status') e.target.className = 'status-sel ' + o.status;
  recalcular();
});
$('vendas').addEventListener('click', e => {
  const el = e.target.closest('.order'); if (!el) return;
  const o = S.vendas.find(x => x.id === el.dataset.id);
  if (e.target.closest('[data-del]')) { S.vendas = S.vendas.filter(x => x !== o); renderVendas(); recalcular(); }
  if (e.target.closest('[data-tudo]')) {
    const a = S.ativos.find(x => x.id === o.ativoId); if (!a) { toast('Escolha o ativo primeiro'); return; }
    const outras = S.vendas.filter(x => x !== o && x.ativoId === a.id).reduce((s, x) => s + v(x.valor), 0);
    o.valor = NUM2.format(Math.max(v(a.saldo) - outras, 0));
    renderVendas(); recalcular();
  }
});

// Compras
$('btnAddCompra').onclick = () => { S.compras.push({ id: uid(), nome: '', classe: 'pos', valor: '', status: 'Pendente' }); renderCompras(); recalcular(); };
$('compras').addEventListener('input', e => {
  const el = e.target.closest('.order'); if (!el || !e.target.dataset.k) return;
  const o = S.compras.find(x => x.id === el.dataset.id);
  o[e.target.dataset.k] = e.target.value;
  if (e.target.dataset.k === 'status') e.target.className = 'status-sel ' + o.status;
  recalcular();
});
$('compras').addEventListener('click', e => {
  const el = e.target.closest('.order'); if (!el || !e.target.closest('[data-del]')) return;
  S.compras = S.compras.filter(x => x.id !== el.dataset.id); renderCompras(); recalcular();
});
$('btnSugerir').onclick = () => {
  const R = calcular();
  // Usa o balanceamento depois das vendas já lançadas
  const faltas = R.linhas.filter(l => l.balN > 0.5 && !(l.k === 'pos' && false));
  if (!faltas.length) { toast('Nenhuma classe abaixo do recomendado'); return; }
  faltas.forEach(l => S.compras.push({ id: uid(), nome: '', classe: l.k, valor: NUM2.format(Math.round(l.balN * 100) / 100), status: 'Pendente' }));
  renderCompras(); recalcular();
  toast(`${faltas.length} compra(s) sugerida(s) — preencha os ativos`);
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
  S = Object.assign(estadoVazio(), JSON.parse(JSON.stringify(l[k]))); renderTudo(); toast('Carteira aberta');
};
$('btnNovo').onclick = () => {
  if ((S.ativos.length || S.vendas.length) && !confirmar('Começar uma carteira nova? O que não foi salvo será perdido.')) return;
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
$('btnImport').onclick = () => $('jsonFile').click();
$('jsonFile').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try { const d = JSON.parse(await f.text()); if (!Array.isArray(d.ativos)) throw 0; S = Object.assign(estadoVazio(), d); renderTudo(); toast('Carteira importada'); }
  catch { toast('Arquivo inválido'); }
  e.target.value = '';
};

$('btnCopiar').onclick = () => {
  const R = calcular();
  const temOrdens = S.vendas.length || S.compras.length;
  const L = [`*Carteira ${S.cliente || ''}* — perfil ${PERFIS[S.perfil]}${S.dataRef ? ` (ref. ${S.dataRef})` : ''}`, `Patrimônio: ${brl(R.total)}`, '', '*Alocação atual × recomendada*'];
  R.linhas.filter(l => l.atual || l.pr).forEach(l => {
    const tag = Math.abs(l.dif) <= R.tol ? '✅' : l.dif > 0 ? '🔺' : '🔻';
    L.push(`${tag} ${l.n}: ${pct(l.pa, 1)} (recom. ${pct(l.pr, 1)})`);
  });
  if (temOrdens) {
    const vendas = S.vendas.map(o => ({ o, a: S.ativos.find(x => x.id === o.ativoId) })).filter(x => x.a && v(x.o.valor));
    const compras = S.compras.filter(o => v(o.valor));
    if (vendas.length) { L.push('', '*Vendas*'); vendas.forEach(({ o, a }) => L.push(`• ${a.nome}: ${brl(v(o.valor))}`)); }
    if (compras.length) { L.push('', '*Compras*'); compras.forEach(o => L.push(`• ${o.nome || NOME[o.classe]} (${NOME[o.classe]}): ${brl(v(o.valor))}`)); }
    L.push('', '*Como fica*');
    R.linhas.filter(l => l.novo || l.pr).forEach(l => {
      const tag = Math.abs(l.difN) <= R.tol ? '✅' : l.difN > 0 ? '🔺' : '🔻';
      L.push(`${tag} ${l.n}: ${pct(l.pn, 1)} (recom. ${pct(l.pr, 1)})`);
    });
  }
  copyText(L.join('\n'));
};

// ---------- E-mail para o cliente ----------
const PERFIL_ADJ = { conservadora: 'Conservador', moderada: 'Moderado', sofisticada: 'Sofisticado', personalizada: 'personalizado' };
function dadosEmail() {
  const R = calcular();
  const temOrdens = S.vendas.some(o => v(o.valor)) || S.compras.some(o => v(o.valor));
  const linhas = R.linhas.filter(l => l.atual > 0.005 || l.pr > 0 || l.novo > 0.005);
  const vendas = S.vendas.map(o => ({ o, a: S.ativos.find(x => x.id === o.ativoId) })).filter(x => x.a && v(x.o.valor));
  const compras = S.compras.filter(o => v(o.valor));
  return { R, temOrdens, linhas, vendas, compras };
}
function emailTextoCarteira(nome, ass) {
  const { R, temOrdens, linhas, vendas, compras } = dadosEmail();
  const L = [Email.saudacaoTexto(nome), '',
    `Analisei a sua carteira${S.dataRef ? ` (posição de ${S.dataRef})` : ''} e comparei com a nossa carteira recomendada para o perfil ${PERFIL_ADJ[S.perfil]}.`, '',
    `Patrimônio considerado: ${brl(R.total)}`, '', 'ALOCAÇÃO ATUAL × RECOMENDADA'];
  linhas.forEach(l => L.push(`• ${l.n}: ${pct(l.pa, 1)} (recomendado ${pct(l.pr, 1)})`));
  if (temOrdens) {
    L.push('', 'PROPOSTA DE MOVIMENTAÇÕES');
    if (vendas.length) { L.push('Resgates/vendas:'); vendas.forEach(({ o, a }) => L.push(`• ${a.nome}: ${brl(v(o.valor))}`)); }
    if (compras.length) { L.push('Aplicações:'); compras.forEach(o => L.push(`• ${o.nome || NOME[o.classe]} (${NOME[o.classe]}): ${brl(v(o.valor))}`)); }
    if (R.aporte) L.push(`Aporte adicional: ${brl(R.aporte)}`);
    L.push('', 'COMO A CARTEIRA FICA');
    linhas.forEach(l => L.push(`• ${l.n}: ${pct(l.pn, 1)} (recomendado ${pct(l.pr, 1)})`));
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
    h.p(`Analisei a sua carteira${S.dataRef ? ` (posição de ${esc(S.dataRef)})` : ''} e comparei com a nossa carteira recomendada para o perfil <b>${PERFIL_ADJ[S.perfil]}</b>. Patrimônio considerado: <b>${brl(R.total)}</b>.`) +
    h.titulo(temOrdens ? 'Alocação atual, recomendada e proposta' : 'Alocação atual × recomendada') +
    h.tabela(cab, rows, temOrdens ? ['left', 'right', 'right', 'right', 'left'] : ['left', 'right', 'right', 'left']);
  if (temOrdens) {
    html += h.titulo('Proposta de movimentações');
    const ord = [
      ...vendas.map(({ o, a }) => [`<span style="color:${h.cor.ruim};font-weight:bold">Resgate</span>`, esc(a.nome), esc(NOME[a.classe]), brl(v(o.valor))]),
      ...compras.map(o => [`<span style="color:${h.cor.bom};font-weight:bold">Aplicação</span>`, esc(o.nome || NOME[o.classe]), esc(NOME[o.classe]), brl(v(o.valor))]),
    ];
    if (R.aporte) ord.push([`<span style="color:${h.cor.bom};font-weight:bold">Aporte</span>`, 'Dinheiro novo', '', brl(R.aporte)]);
    html += h.tabela(['', 'Ativo', 'Classe', 'Valor'], ord, ['left', 'left', 'left', 'right']);
    if (R.desvioN < R.desvioA - 0.05) html += h.destaque(`Com essas movimentações, a parte da carteira fora da alocação recomendada cai de ${pct(R.desvioA, 1)} para ${pct(R.desvioN, 1)}.`, 'bom');
  }
  html += h.p('Fico à disposição para conversarmos sobre a proposta.') + h.p('Abraço,') + h.assinatura(ass) +
    h.rodape('Percentuais calculados sobre a posição informada no relatório. As movimentações dependem de liquidez, prazos e condições de mercado no momento da execução.');
  return h.wrap(html);
}
$('btnEmail').onclick = () => {
  if (!S.ativos.length) { toast('Importe ou lance a carteira primeiro'); return; }
  const temOrdens = S.vendas.length || S.compras.length;
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
if (S.ativos.length) $('cardAtivos').open = false;
