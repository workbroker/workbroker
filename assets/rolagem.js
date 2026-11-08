// Troca de ativos (rolagem)
const $ = id => document.getElementById(id);

const TIPOS = [
  ['CDB', false], ['LCI', true], ['LCA', true], ['LCD', true], ['CRI', true], ['CRA', true],
  ['Debênture', false], ['Debênture incentivada', true], ['Tesouro Direto', false], ['LC', false], ['LF', false],
  ['Fundo de renda fixa', false], ['Outro tributado', false], ['Outro isento', true],
];
const ISENTO = Object.fromEntries(TIPOS);
const IDX = [['pre', 'Pré'], ['pctcdi', '% CDI'], ['cdimais', 'CDI +'], ['ipcamais', 'IPCA +']];
const IDX_CURTO = { pre: 'Pré', pctcdi: '% CDI', cdimais: 'CDI +', ipcamais: 'IPCA +' };

const FIELDS = ['a_tipo', 'a_idx', 'a_taxa', 'a_dtapl', 'a_aplicado', 'a_venc', 'a_venda', 'a_mtm', 'a_curva',
  'b_tipo', 'b_idx', 'b_taxa', 'b_venc', 'r_idx', 'r_taxa', 'r_isento', 'p_cdi', 'p_ipca', 'p_hoje'];

let modoVenda = 'valor';
let modoGrafico = 'liquido';

// ---------- Preenchimento dos selects ----------
['a_tipo', 'b_tipo'].forEach(id => $(id).innerHTML = TIPOS.map(([t]) => `<option>${t}</option>`).join(''));
['a_idx', 'b_idx', 'r_idx', 'a_mtm_idx'].forEach(id => $(id).innerHTML = IDX.map(([k, n]) => `<option value="${k}">${n}</option>`).join(''));

// ---------- Taxas ----------
function taxaAnual(idx, taxa, cdi, ipca) {
  taxa /= 100; cdi /= 100; ipca /= 100;
  switch (idx) {
    case 'pre': return taxa;
    case 'pctcdi': return Math.pow(1 + (Math.pow(1 + cdi, 1 / 252) - 1) * taxa, 252) - 1;
    case 'cdimais': return (1 + cdi) * (1 + taxa) - 1;
    case 'ipcamais': return (1 + ipca) * (1 + taxa) - 1;
  }
}
function taxaNoIndexador(idx, anual, cdi, ipca) {
  cdi /= 100; ipca /= 100;
  switch (idx) {
    case 'pre': return anual * 100;
    case 'pctcdi': return (Math.pow(1 + anual, 1 / 252) - 1) / (Math.pow(1 + cdi, 1 / 252) - 1) * 100;
    case 'cdimais': return ((1 + anual) / (1 + cdi) - 1) * 100;
    case 'ipcamais': return ((1 + anual) / (1 + ipca) - 1) * 100;
  }
}
function fmtTaxa(idx, x) {
  if (!Number.isFinite(x)) return '—';
  if (idx === 'pctcdi') return pct(x) + ' do CDI';
  if (idx === 'pre') return pct(x) + ' a.a.';
  return IDX_CURTO[idx] + ' ' + pct(x);
}
const brl0 = x => Number.isFinite(x) ? 'R$ ' + Math.round(x).toLocaleString('pt-BR') : '—';
const dias = (a, b) => daysBetween(a, b);
const ir = (isento, d, ganho) => isento ? 0 : aliquotaIR(d) * Math.max(ganho, 0);

// ---------- Leitura ----------
function ler() {
  const o = {};
  FIELDS.forEach(f => { const el = $(f); o[f] = el.type === 'checkbox' ? el.checked : el.value; });
  return o;
}

// ---------- Motor de cálculo ----------
function montar(i) {
  const n = {
    aTaxa: parseNum(i.a_taxa), bTaxa: parseNum(i.b_taxa), aplicado: parseNum(i.a_aplicado),
    venda: parseNum(i.a_venda), mtm: parseNum(i.a_mtm), curva: parseNum(i.a_curva),
    rTaxa: parseNum(i.r_taxa), cdi: parseNum(i.p_cdi), ipca: parseNum(i.p_ipca),
  };
  if (!Number.isFinite(n.cdi)) n.cdi = 0;
  if (!Number.isFinite(n.ipca)) n.ipca = 0;
  const hoje = i.p_hoje || todayISO();
  const falta = [];
  if (!Number.isFinite(n.aTaxa)) falta.push('taxa do ativo atual');
  if (!i.a_dtapl) falta.push('data da aplicação');
  if (!Number.isFinite(n.aplicado)) falta.push('valor aplicado');
  if (!i.a_venc) falta.push('vencimento do atual');
  if (modoVenda === 'valor' ? !Number.isFinite(n.venda) : !Number.isFinite(n.mtm)) falta.push(modoVenda === 'valor' ? 'valor de venda' : 'taxa de venda');
  if (!Number.isFinite(n.bTaxa)) falta.push('taxa da sugestão');
  if (!i.b_venc) falta.push('vencimento da sugestão');
  if (falta.length) return { erro: 'Falta preencher: ' + falta.join(', ') + '.' };
  if (!(dias(i.a_dtapl, hoje) >= 0)) return { erro: 'A data da aplicação precisa ser anterior à data da simulação.' };
  if (!(dias(hoje, i.a_venc) > 0)) return { erro: 'O vencimento do ativo atual precisa ser depois da data da simulação.' };
  if (!(dias(hoje, i.b_venc) > 0)) return { erro: 'O vencimento da sugestão precisa ser depois da data da simulação.' };

  const aIsento = ISENTO[i.a_tipo], bIsento = ISENTO[i.b_tipo], rIsento = i.r_isento;
  const rA = taxaAnual(i.a_idx, n.aTaxa, n.cdi, n.ipca);
  const rB = taxaAnual(i.b_idx, n.bTaxa, n.cdi, n.ipca);
  const rTaxaUsada = Number.isFinite(n.rTaxa) ? n.rTaxa : (i.r_idx === i.a_idx ? n.aTaxa : NaN);
  const rR = Number.isFinite(rTaxaUsada) ? taxaAnual(i.r_idx, rTaxaUsada, n.cdi, n.ipca) : rA;

  const dAplHoje = dias(i.a_dtapl, hoje);
  const curvaEstimada = n.aplicado * Math.pow(1 + rA, dAplHoje / 365);
  const curva = Number.isFinite(n.curva) ? n.curva : curvaEstimada;
  const tRestA = dias(hoje, i.a_venc) / 365;
  const venda = modoVenda === 'valor' ? n.venda
    : curva * Math.pow((1 + rA) / (1 + taxaAnual(i.a_idx, n.mtm, n.cdi, n.ipca)), tRestA);
  const taxaVendaImplicita = taxaNoIndexador(i.a_idx, (1 + rA) / Math.pow(venda / curva, 1 / tRestA) - 1, n.cdi, n.ipca);

  const H = dias(i.a_venc, i.b_venc) >= 0 ? i.b_venc : i.a_venc;
  const P = { i, n, hoje, H, aIsento, bIsento, rIsento, rA, rB, rR, rTaxaUsada, curva, curvaEstimada, venda, taxaVendaImplicita };

  // Valor bruto do título atual na curva em uma data
  P.brutoA = d => {
    if (dias(d, hoje) >= 0) { // passado: interpola entre o aplicado e a curva de hoje
      const tot = dAplHoje || 1;
      return n.aplicado * Math.pow(curva / n.aplicado, Math.max(dias(i.a_dtapl, d), 0) / tot);
    }
    return curva * Math.pow(1 + rA, dias(hoje, d) / 365);
  };
  const VA = P.brutoA(i.a_venc);
  P.VA = VA;
  P.irA = ir(aIsento, dias(i.a_dtapl, i.a_venc), VA - n.aplicado);
  P.liqVA = VA - P.irA;
  P.irVenda = ir(aIsento, dAplHoje, venda - n.aplicado);
  P.liqVenda = venda - P.irVenda;

  // Caminho 1: manter (+ reinvestir depois do vencimento)
  P.manter = (d, liquido = true) => {
    if (dias(d, i.a_venc) >= 0) {
      const g = P.brutoA(d);
      return liquido ? g - ir(aIsento, dias(i.a_dtapl, d), g - n.aplicado) : g;
    }
    const t = dias(i.a_venc, d) / 365;
    if (!liquido) return VA * Math.pow(1 + rR, t);
    const g = P.liqVA * Math.pow(1 + rR, t);
    return g - ir(rIsento, dias(i.a_venc, d), g - P.liqVA);
  };
  // Caminho 2: trocar (+ reinvestir se o novo vencer antes)
  P.trocar = (d, liquido = true, rBx = rB) => {
    const base = liquido ? P.liqVenda : venda;
    if (dias(d, i.b_venc) >= 0) {
      const g = base * Math.pow(1 + rBx, dias(hoje, d) / 365);
      return liquido ? g - ir(bIsento, dias(hoje, d), g - base) : g;
    }
    const gB = base * Math.pow(1 + rBx, dias(hoje, i.b_venc) / 365);
    const VB = liquido ? gB - ir(bIsento, dias(hoje, i.b_venc), gB - base) : gB;
    const g = VB * Math.pow(1 + rR, dias(i.b_venc, d) / 365);
    return liquido ? g - ir(rIsento, dias(i.b_venc, d), g - VB) : g;
  };

  P.fim1 = P.manter(H); P.fim2 = P.trocar(H);
  P.dif = P.fim2 - P.fim1; P.difPct = (P.fim2 / P.fim1 - 1) * 100;

  // Taxa mínima de empate (bisseção)
  let lo = -0.5, hi = 3;
  for (let k = 0; k < 80; k++) { const mid = (lo + hi) / 2; if (P.trocar(H, true, mid) < P.fim1) lo = mid; else hi = mid; }
  P.taxaEmpate = taxaNoIndexador(i.b_idx, (lo + hi) / 2, n.cdi, n.ipca);

  // Cruzamento das curvas líquidas
  P.cruza = null;
  const total = dias(hoje, H);
  if (P.trocar(hoje) >= P.manter(hoje)) P.cruza = hoje;
  else for (let d = 5; d <= total; d += 5) {
    const dt = addDays(hoje, d);
    if (P.trocar(dt) >= P.manter(dt)) { P.cruza = dt; break; }
  }
  P.desagio = curva - venda; P.desagioPct = P.desagio / curva * 100;
  P.anos = total / 365;
  return P;
}

// ---------- Gráfico (SVG) ----------
function grafico(P) {
  const box = $('chartBox');
  const W = Math.max(320, Math.min(box.clientWidth || 700, 1100));
  const Hh = W < 520 ? 300 : 360;
  const pad = { l: 12, r: W < 520 ? 74 : 96, t: 34, b: 42 };
  const liq = modoGrafico === 'liquido';
  const { i, hoje, H } = P;
  const x0 = i.a_dtapl, span = dias(x0, H);
  const amostras = (a, b, f) => {
    const n = Math.max(2, Math.ceil(dias(a, b) / Math.max(span / 160, 3)));
    const pts = [];
    for (let k = 0; k <= n; k++) { const d = addDays(a, Math.round(dias(a, b) * k / n)); pts.push([d, f(d)]); }
    return pts;
  };
  const s1a = amostras(x0, i.a_venc, d => P.manter(d, liq));
  const s1b = dias(i.a_venc, H) > 0 ? amostras(i.a_venc, H, d => P.manter(d, liq)) : [];
  const fimB = dias(i.b_venc, H) > 0 ? i.b_venc : H;
  const s2a = amostras(hoje, fimB, d => P.trocar(d, liq));
  const s2b = dias(i.b_venc, H) > 0 ? amostras(i.b_venc, H, d => P.trocar(d, liq)) : [];
  const all = [...s1a, ...s1b, ...s2a, ...s2b].map(p => p[1]);
  let yMin = Math.min(...all), yMax = Math.max(...all);
  const yp = (yMax - yMin) * 0.12 || yMax * 0.1; yMin -= yp; yMax += yp;
  const X = d => pad.l + (dias(x0, d) / span) * (W - pad.l - pad.r);
  const Y = val => pad.t + (1 - (val - yMin) / (yMax - yMin)) * (Hh - pad.t - pad.b);
  const path = pts => pts.map((p, k) => `${k ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('');
  const IND = '#22105a', ORA = '#ff5a00';

  // rótulos com caixa
  const fs = W < 520 ? 10.5 : 12;
  const label = (x, y, txt, cor, pos = 'above', anchor = 'middle') => {
    const w = txt.length * fs * 0.58 + 10, h = fs + 8;
    let bx = anchor === 'middle' ? x - w / 2 : anchor === 'start' ? x + 6 : x - w - 6;
    bx = Math.max(2, Math.min(W - w - 2, bx));
    const by = pos === 'above' ? y - h - 7 : y + 7;
    return `<g><rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${w.toFixed(1)}" height="${h}" rx="5" fill="${cor}"/>
      <text x="${(bx + w / 2).toFixed(1)}" y="${(by + h / 2 + fs * 0.36).toFixed(1)}" text-anchor="middle" font-size="${fs}" font-weight="800" fill="#fff">${txt}</text></g>`;
  };
  const dot = (x, y, cor) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5" fill="#fff" stroke="${cor}" stroke-width="2.5"/>`;

  let svg = `<svg class="chart" viewBox="0 0 ${W} ${Hh}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Gráfico de comparação">`;
  // grade horizontal leve
  for (let k = 0; k <= 4; k++) {
    const y = pad.t + k * (Hh - pad.t - pad.b) / 4;
    svg += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y}" y2="${y}" stroke="#eeedf4"/>`;
  }
  // linha "hoje"
  const xh = X(hoje);
  svg += `<line x1="${xh}" x2="${xh}" y1="${pad.t - 10}" y2="${Hh - pad.b}" stroke="#b9b6c9" stroke-dasharray="3 4"/>`;
  svg += `<text x="${xh + 4}" y="${pad.t - 14}" font-size="${fs}" fill="#6d6a80" font-weight="700">HOJE</text>`;
  // venc. atual
  const xva = X(i.a_venc);
  if (dias(i.a_venc, H) > 0) {
    svg += `<line x1="${xva}" x2="${xva}" y1="${pad.t - 10}" y2="${Hh - pad.b}" stroke="#d9d6e6" stroke-dasharray="2 5"/>`;
    if (Math.abs(xva - xh) > 80) svg += `<text x="${xva - 4}" y="${pad.t - 14}" font-size="${fs - 1}" fill="#6d6a80" text-anchor="end">venc. atual</text>`;
  }
  // séries
  svg += `<path d="${path(s1a)}" fill="none" stroke="${IND}" stroke-width="3" stroke-linejoin="round"/>`;
  if (s1b.length) svg += `<path d="${path(s1b)}" fill="none" stroke="${IND}" stroke-width="2.5" stroke-dasharray="7 6"/>`;
  svg += `<path d="${path(s2a)}" fill="none" stroke="${ORA}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>`;
  if (s2b.length) svg += `<path d="${path(s2b)}" fill="none" stroke="${ORA}" stroke-width="3" stroke-dasharray="7 6"/>`;

  // pontos e rótulos
  const vIni = P.manter(x0, liq), vHoje1 = P.manter(hoje, liq), vHoje2 = P.trocar(hoje, liq);
  svg += dot(X(x0), Y(vIni), IND) + label(X(x0), Y(vIni), brl0(vIni), IND, 'below', 'start');
  svg += dot(xh, Y(vHoje2), ORA) + label(xh, Y(vHoje2), brl0(vHoje2), ORA, 'below');
  if (Math.abs(Y(vHoje1) - Y(vHoje2)) > 4) svg += dot(xh, Y(vHoje1), IND);
  if (dias(i.a_venc, H) > 0) {
    const v1 = P.manter(i.a_venc, liq), v2 = P.trocar(i.a_venc, liq);
    const cima1 = v1 >= v2;
    svg += dot(xva, Y(v1), IND) + label(xva, Y(v1), brl0(v1), IND, cima1 ? 'above' : 'below');
    svg += dot(xva, Y(v2), ORA) + label(xva, Y(v2), brl0(v2), ORA, cima1 ? 'below' : 'above');
  }
  const f1 = P.manter(H, liq), f2 = P.trocar(H, liq), xf = X(H);
  const cima2 = f2 >= f1;
  svg += dot(xf, Y(f1), IND) + dot(xf, Y(f2), ORA);
  svg += label(xf, Y(f1), brl0(f1), IND, cima2 ? 'below' : 'above', 'start');
  svg += label(xf, Y(f2), brl0(f2), ORA, cima2 ? 'above' : 'below', 'start');
  // cruzamento (no modo líquido)
  if (liq && P.cruza && P.cruza !== hoje && dias(P.cruza, H) > 0) {
    const xc = X(P.cruza), yc = Y(P.trocar(P.cruza, true));
    svg += `<circle cx="${xc}" cy="${yc}" r="9" fill="rgba(255,90,0,.15)" stroke="${ORA}" stroke-width="1.5"/>`;
    svg += `<text x="${xc}" y="${Hh - pad.b + 30}" font-size="${fs - 1}" text-anchor="middle" fill="${ORA}" font-weight="800">cruza ${fmtDate(P.cruza).slice(3)}</text>`;
    svg += `<line x1="${xc}" x2="${xc}" y1="${yc + 9}" y2="${Hh - pad.b + 18}" stroke="${ORA}" stroke-width="1" stroke-dasharray="2 3"/>`;
  }
  // eixo X
  const ticks = [[x0, 'start'], [hoje, 'middle'], [i.a_venc, 'middle'], [i.b_venc, 'end']];
  const usados = [];
  ticks.sort((a, b) => dias(b[0], a[0]));
  svg += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${Hh - pad.b}" y2="${Hh - pad.b}" stroke="#d9d6e6"/>`;
  ticks.forEach(([d]) => {
    const x = X(d);
    if (usados.some(u => Math.abs(u - x) < (W < 520 ? 58 : 70))) return;
    usados.push(x);
    const anc = x < pad.l + 30 ? 'start' : x > W - pad.r - 30 ? 'end' : 'middle';
    svg += `<text x="${x}" y="${Hh - pad.b + 16}" font-size="${fs - 1}" text-anchor="${anc}" fill="#6d6a80">${W < 520 ? fmtDate(d).slice(3) : fmtDate(d)}</text>`;
  });
  svg += '</svg>';
  box.innerHTML = svg;
}

// ---------- Renderização ----------
function render() {
  const i = ler();
  store.set('rw_troca', { ...i, modoVenda });
  $('a_trib').textContent = ISENTO[i.a_tipo] ? 'Isento de IR' : 'Tributado';
  $('a_trib').className = 'pill ' + (ISENTO[i.a_tipo] ? 'good' : '');
  $('b_trib').textContent = ISENTO[i.b_tipo] ? 'Isento de IR' : 'Tributado';
  $('b_trib').className = 'pill ' + (ISENTO[i.b_tipo] ? 'good' : '');
  $('a_mtm_idx').value = i.a_idx;
  $('sumCdi').textContent = pct(parseNum(i.p_cdi));
  $('sumIpca').textContent = pct(parseNum(i.p_ipca));
  $('sumHoje').textContent = fmtDate(i.p_hoje || todayISO());

  // Reinvestimento só aparece quando os vencimentos são diferentes
  const difVenc = i.a_venc && i.b_venc && i.a_venc !== i.b_venc;
  $('reinvCard').hidden = !difVenc;
  if (difVenc) {
    const atualAntes = dias(i.a_venc, i.b_venc) > 0;
    $('r_quem').textContent = atualAntes ? `após o vencimento do atual` : `após o vencimento da sugestão`;
    $('r_hint').textContent = atualAntes ? `de ${fmtDate(i.a_venc)} até ${fmtDate(i.b_venc)}` : `de ${fmtDate(i.b_venc)} até ${fmtDate(i.a_venc)}`;
    $('r_taxa').placeholder = i.r_idx === i.a_idx && i.a_taxa ? `${i.a_taxa} (igual ao atual)` : 'taxa';
  }

  const P = montar(i);
  // dica da posição na curva
  if (!P.erro || (Number.isFinite(parseNum(i.a_aplicado)) && i.a_dtapl && Number.isFinite(parseNum(i.a_taxa)))) {
    const est = P.erro ? null : P;
    $('curvaHint').innerHTML = est
      ? `<span>Curva hoje: <b>${brl(est.curva)}</b>${Number.isFinite(parseNum(i.a_curva)) ? ' (informada)' : ' (estimada)'} · deságio <b>${pct(est.desagioPct)}</b>${modoVenda === 'valor' ? ` · taxa de venda ≈ <b>${fmtTaxa(i.a_idx, est.taxaVendaImplicita)}</b>` : ` · venda ≈ <b>${brl(est.venda)}</b>`}</span><button class="linkbtn" id="btnCurva" type="button">${$('curvaBox').hidden ? 'ajustar' : 'ocultar'}</button>`
      : '<span>Preencha os campos para estimar a posição na curva.</span>';
    const b = $('btnCurva'); if (b) b.onclick = () => { $('curvaBox').hidden = !$('curvaBox').hidden; render(); };
  } else $('curvaHint').innerHTML = '<span>Preencha os campos para estimar a posição na curva e o deságio.</span>';

  if (P.erro) { $('out').innerHTML = `<p class="note">${esc(P.erro)}</p>`; return; }

  let cls, titulo, sub;
  if (P.dif > 0.003 * P.fim1) {
    cls = 'good'; titulo = `Vale a pena trocar: +${brl(P.dif)} líquido (${pct(P.difPct)})`;
    sub = P.cruza && P.cruza !== P.hoje ? `A troca recupera o deságio e passa à frente em ${fmtDate(P.cruza)}.` : 'A troca já começa à frente.';
  } else if (P.dif < -0.003 * P.fim1) {
    cls = 'bad'; titulo = `Não compensa trocar: ${brl(P.dif)} líquido (${pct(P.difPct)})`;
    sub = `Para empatar, a sugestão precisaria pagar pelo menos ${fmtTaxa(P.i.b_idx, P.taxaEmpate).replace(/\.$/, "")}.`;
  } else {
    cls = 'neutral'; titulo = `Praticamente empate (${brl(P.dif)})`;
    sub = 'A diferença é pequena: pesam liquidez, risco do emissor, FGC e prazo.';
  }

  $('out').innerHTML = `
    <div class="verdict ${cls}">${esc(titulo)}<small>${esc(sub)}</small></div>
    <div class="chart-tools">
      <div class="legend" style="margin:0">
        <span><i style="background:#22105a"></i>Manter o atual</span>
        ${dias(P.i.a_venc, P.H) > 0 ? '<span><i style="background:repeating-linear-gradient(90deg,#22105a 0 5px,transparent 5px 9px)"></i>Reinvestido após vencimento</span>' : ''}
        <span><i style="background:#ff5a00;height:4px"></i>Trocar</span>
      </div>
      <div class="seg no-print" id="segGraf"><button data-v="liquido" class="${modoGrafico === 'liquido' ? 'on' : ''}">Líquido</button><button data-v="bruto" class="${modoGrafico === 'bruto' ? 'on' : ''}">Bruto</button></div>
    </div>
    <div id="chartBox"></div>

    <div class="kpis" style="margin-top:14px">
      <div class="kpi"><div class="l">Manter até ${fmtDate(P.H)}</div><div class="v">${brl(P.fim1)}</div><div class="s">líquido de IR</div></div>
      <div class="kpi orange"><div class="l">Trocar até ${fmtDate(P.H)}</div><div class="v">${brl(P.fim2)}</div><div class="s">líquido de IR</div></div>
      <div class="kpi"><div class="l">Diferença</div><div class="v ${P.dif >= 0 ? 'good' : 'bad'}">${P.dif >= 0 ? '+' : ''}${brl(P.dif)}</div><div class="s">${pct(P.difPct)} em ${P.anos.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} anos</div></div>
      <div class="kpi"><div class="l">Taxa mínima para empatar</div><div class="v" style="font-size:17px">${fmtTaxa(P.i.b_idx, P.taxaEmpate)}</div><div class="s">sugerido: ${fmtTaxa(P.i.b_idx, P.n.bTaxa)}</div></div>
      <div class="kpi"><div class="l">Deságio na venda</div><div class="v">${brl(P.desagio)}</div><div class="s">${pct(P.desagioPct)} da curva</div></div>
      <div class="kpi"><div class="l">IR pago na venda</div><div class="v">${brl(P.irVenda)}</div><div class="s">${P.aIsento ? 'isento' : pct(aliquotaIR(dias(P.i.a_dtapl, P.hoje)) * 100, 1) + ' sobre o ganho'}</div></div>
    </div>

    <div class="table-wrap" style="margin-top:14px">
      <table>
        <thead><tr><th></th><th class="n">Manter</th><th class="n">Trocar</th></tr></thead>
        <tbody>
          <tr><td>Hoje</td><td class="n">${brl(P.curva)} <span class="note">curva</span></td><td class="n">${brl(P.venda)} <span class="note">venda</span></td></tr>
          <tr><td>IR na venda</td><td class="n">—</td><td class="n">${brl(-P.irVenda)}</td></tr>
          <tr><td>Taxa efetiva</td><td class="n">${pct(P.rA * 100)} a.a.</td><td class="n">${pct(P.rB * 100)} a.a.</td></tr>
          <tr><td>No vencimento do atual (${fmtDate(P.i.a_venc)})</td><td class="n">${brl(P.liqVA)}</td><td class="n">${brl(P.trocar(P.i.a_venc))}</td></tr>
          ${P.i.a_venc !== P.i.b_venc ? `<tr><td>Reinvestimento</td><td colspan="2" class="n">${fmtTaxa(P.i.r_idx, P.rTaxaUsada)}${P.rIsento ? ' · isento' : ''}</td></tr>` : ''}
          <tr><td><b>Líquido em ${fmtDate(P.H)}</b></td><td class="n"><b>${brl(P.fim1)}</b></td><td class="n"><b>${brl(P.fim2)}</b></td></tr>
        </tbody>
      </table>
    </div>

    <div class="row no-print" style="margin-top:14px">
      <button id="btnEmail">✉️ Enviar por e-mail</button>
      <button class="secondary" id="btnCopiar">Copiar para WhatsApp</button>
      <button class="secondary" onclick="window.print()">Imprimir / PDF</button>
      <button class="ghost" id="btnLimpar">Limpar</button>
    </div>`;

  grafico(P);
  $('segGraf').onclick = e => { const b = e.target.closest('button'); if (!b) return; modoGrafico = b.dataset.v; render(); };
  $('btnCopiar').onclick = () => copyText(resumo(P));
  $('btnEmail').onclick = () => Email.abrir({
    assunto: `Simulação: troca de ${P.i.a_tipo} ${fmtTaxa(P.i.a_idx, P.n.aTaxa)} por ${P.i.b_tipo} ${fmtTaxa(P.i.b_idx, P.n.bTaxa)}`,
    texto: (nome, ass) => emailTexto(P, nome, ass),
    html: (nome, ass) => emailHtml(P, nome, ass),
    grafico: () => document.querySelector('#chartBox svg'),
  });
  $('btnLimpar').onclick = limpar;
  window._P = P;
}

function resumo(P) {
  const i = P.i;
  const L = [
    '*Simulação de troca de ativo*',
    `Atual: ${i.a_tipo} ${fmtTaxa(i.a_idx, P.n.aTaxa)}, vence ${fmtDate(i.a_venc)}`,
    `Sugestão: ${i.b_tipo} ${fmtTaxa(i.b_idx, P.n.bTaxa)}, vence ${fmtDate(i.b_venc)}`,
    '',
    `Comparando até ${fmtDate(P.H)}, já descontado o IR:`,
    `• Manter: ${brl(P.fim1)}`,
    `• Trocar: ${brl(P.fim2)}`,
    `• Diferença: ${P.dif >= 0 ? '+' : ''}${brl(P.dif)} (${pct(P.difPct)})`,
  ];
  if (P.desagio > 0) L.push('', `Deságio na venda antecipada: ${brl(P.desagio)}${P.dif > 0 && P.cruza && P.cruza !== P.hoje ? `, recuperado em ${fmtDate(P.cruza)}` : ''}.`);
  L.push('', `_Premissas: CDI ${pct(P.n.cdi)} a.a., IPCA ${pct(P.n.ipca)} a.a. Simulação, não é garantia de rentabilidade._`);
  return L.join('\n');
}

// ---------- E-mail para o cliente ----------
function conclusao(P) {
  if (P.dif > 0.003 * P.fim1) return { tipo: 'bom', txt: `Nesse cenário, a troca compensa: o ganho adicional estimado é de ${brl(P.dif)} (${pct(P.difPct)})${P.cruza && P.cruza !== P.hoje ? `, e o deságio da venda é recuperado em ${fmtDate(P.cruza)}` : ''}.` };
  if (P.dif < -0.003 * P.fim1) return { tipo: 'ruim', txt: `Nesse cenário, a troca não compensa: o resultado seria ${brl(Math.abs(P.dif))} menor. Para empatar, a nova aplicação precisaria pagar pelo menos ${fmtTaxa(P.i.b_idx, P.taxaEmpate).replace(/\.$/, '')}.` };
  return { tipo: 'neutro', txt: 'Nesse cenário, as duas opções ficam praticamente empatadas; vale considerar liquidez, prazo e risco do emissor.' };
}
function linhasEmail(P) {
  const i = P.i, reinv = i.a_venc !== i.b_venc;
  const quemReinv = dias(i.a_venc, i.b_venc) > 0 ? 'manter' : 'trocar';
  return {
    atual: `${i.a_tipo} ${fmtTaxa(i.a_idx, P.n.aTaxa)}, vencimento ${fmtDate(i.a_venc)}${P.aIsento ? ' (isento de IR)' : ''}`,
    sugestao: `${i.b_tipo} ${fmtTaxa(i.b_idx, P.n.bTaxa)}, vencimento ${fmtDate(i.b_venc)}${P.bIsento ? ' (isento de IR)' : ''}`,
    reinvTxt: reinv ? `reinvestindo a ${fmtTaxa(i.r_idx, P.rTaxaUsada)} até ${fmtDate(P.H)}` : '',
    quemReinv,
  };
}
function emailTexto(P, nome, ass) {
  const L = linhasEmail(P), c = conclusao(P);
  return [
    Email.saudacaoTexto(nome), '',
    'Conforme conversamos, fiz uma simulação comparando manter o seu investimento atual com a troca por uma nova aplicação.', '',
    'INVESTIMENTO ATUAL', L.atual, `Valor de venda antecipada hoje: ${brl(P.venda)}`, '',
    'SUGESTÃO DE TROCA', L.sugestao, '',
    `RESULTADO ESTIMADO EM ${fmtDate(P.H)} (líquido de IR)`,
    `• Mantendo o atual${L.reinvTxt && L.quemReinv === 'manter' ? ` (e, após o vencimento, ${L.reinvTxt})` : ''}: ${brl(P.fim1)}`,
    `• Fazendo a troca${L.reinvTxt && L.quemReinv === 'trocar' ? ` (e, após o vencimento, ${L.reinvTxt})` : ''}: ${brl(P.fim2)}`,
    `• Diferença: ${P.dif >= 0 ? '+' : '−'}${brl(Math.abs(P.dif))} (${pct(P.difPct)})`, '',
    c.txt, '',
    `Premissas: CDI de ${pct(P.n.cdi)} a.a. e IPCA de ${pct(P.n.ipca)} a.a. no período. Trata-se de uma simulação com base nas condições de hoje, não de garantia de rentabilidade.`, '',
    'Fico à disposição para conversarmos.', '',
    'Abraço,', ass,
  ].join('\n');
}
function emailHtml(P, nome, ass) {
  const L = linhasEmail(P), c = conclusao(P), h = Email.h;
  return h.wrap(
    h.p(h.saudacao(nome)) +
    h.p('Conforme conversamos, fiz uma simulação comparando manter o seu investimento atual com a troca por uma nova aplicação.') +
    h.tabela(['', 'Investimento atual', 'Sugestão de troca'], [
      ['Ativo', esc(`${P.i.a_tipo} ${fmtTaxa(P.i.a_idx, P.n.aTaxa)}`), esc(`${P.i.b_tipo} ${fmtTaxa(P.i.b_idx, P.n.bTaxa)}`)],
      ['Vencimento', fmtDate(P.i.a_venc), fmtDate(P.i.b_venc)],
      ['Valor hoje', `${brl(P.curva)} <span style="color:#6d6a80">(curva)</span>`, `${brl(P.venda)} <span style="color:#6d6a80">(venda)</span>`],
      [`<b>Líquido em ${fmtDate(P.H)}</b>`, `<b>${brl(P.fim1)}</b>`, `<b style="color:${h.cor.ora}">${brl(P.fim2)}</b>`],
    ]) +
    h.destaque(esc(c.txt), c.tipo) +
    (L.reinvTxt ? h.p(`<span style="color:#6d6a80;font-size:13px">Para comparar no mesmo prazo, considerei, na opção "${L.quemReinv === 'manter' ? 'manter' : 'trocar'}", que após o vencimento o valor segue ${esc(L.reinvTxt)}.</span>`) : '') +
    h.p('Fico à disposição para conversarmos.') +
    h.p('Abraço,') + h.assinatura(ass) +
    h.rodape(`Premissas: CDI de ${pct(P.n.cdi)} a.a. e IPCA de ${pct(P.n.ipca)} a.a. Valores líquidos de IR pela tabela regressiva. Simulação com base nas condições de hoje, não constitui garantia de rentabilidade.`)
  );
}

function setVenda(m) {
  modoVenda = m;
  document.querySelectorAll('#segVenda button').forEach(b => b.classList.toggle('on', b.dataset.v === m));
  $('a_venda').hidden = m !== 'valor';
  $('a_mtm_box').hidden = m !== 'taxa';
}

function limpar() {
  FIELDS.forEach(f => {
    if (['p_cdi', 'p_ipca', 'a_tipo', 'b_tipo', 'a_idx', 'b_idx', 'r_idx'].includes(f)) return;
    const el = $(f); if (el.type === 'checkbox') el.checked = false; else el.value = '';
  });
  $('p_hoje').value = todayISO();
  render();
}

function exemplo() {
  const ex = {
    a_tipo: 'CDB', a_idx: 'pre', a_taxa: '13,6', a_dtapl: '2021-09-03', a_aplicado: '24.000', a_venc: '2026-09-02', a_venda: '34.819', a_mtm: '', a_curva: '',
    b_tipo: 'CDB', b_idx: 'pre', b_taxa: '16', b_venc: '2028-08-27', r_idx: 'pre', r_taxa: '14', r_isento: false, p_hoje: '2025-09-04',
  };
  Object.entries(ex).forEach(([k, val]) => { const el = $(k); if (el.type === 'checkbox') el.checked = val; else el.value = val; });
  setVenda('valor');
  render();
  toast('Exemplo carregado — troque pelos dados do cliente');
}

// ---------- Inicialização ----------
(function init() {
  const s = store.get('rw_troca', null);
  if (s) FIELDS.forEach(f => { if (s[f] === undefined) return; const el = $(f); if (el.type === 'checkbox') el.checked = s[f]; else el.value = s[f]; });
  if (!$('p_hoje').value) $('p_hoje').value = todayISO();
  setVenda(s?.modoVenda || 'valor');
  // ao trocar o indexador do atual, o reinvestimento acompanha
  $('a_idx').addEventListener('change', () => { if (!$('r_taxa').value) $('r_idx').value = $('a_idx').value; });
  $('segVenda').onclick = e => { const b = e.target.closest('button'); if (!b) return; setVenda(b.dataset.v); render(); };
  $('btnExemplo').onclick = exemplo;
  FIELDS.forEach(f => { $(f).addEventListener('input', render); $(f).addEventListener('change', render); });
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => window._P && grafico(window._P), 150); });
  render();
})();
