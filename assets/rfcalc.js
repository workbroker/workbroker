// Calculadoras de renda fixa: isento x tributado, fluxo de cupons, juros compostos
const $ = id => document.getElementById(id);
const brl0 = x => Number.isFinite(x) ? 'R$ ' + Math.round(x).toLocaleString('pt-BR') : '—';
const n = id => parseNum($(id).value);

['i_idx', 't_idx', 'c_idx', 'j_idx'].forEach(id => $(id).innerHTML = IDX_OPTS.map(([k, l]) => `<option value="${k}">${l}</option>`).join(''));
$('i_idx').value = 'pctcdi'; $('t_idx').value = 'pctcdi'; $('c_idx').value = 'ipcamais'; $('j_idx').value = 'pctcdi';

const CAMPOS = ['p_cdi', 'p_ipca', 'i_idx', 'i_taxa', 't_idx', 't_taxa', 'i_dias', 'i_valor', 'c_valor', 'c_idx', 'c_taxa', 'c_per', 'c_ini', 'c_venc', 'c_isento', 'j_ini', 'j_aporte', 'j_prazo', 'j_un', 'j_idx', 'j_taxa', 'j_isento', 'j_real'];
const prem = () => ({ cdi: n('p_cdi') || 0, ipca: n('p_ipca') || 0 });

// ---------- Gráficos SVG simples ----------
function svgBox(el) { const W = Math.max(300, Math.min(el.clientWidth || 640, 1100)); return { W, H: W < 520 ? 230 : 280 }; }
function barras(el, dados, cor = '#ff5a00') {
  const { W, H } = svgBox(el), pad = { l: 8, r: 8, t: 16, b: 26 };
  const max = Math.max(...dados.map(d => d.v), 1), bw = (W - pad.l - pad.r) / dados.length;
  const passo = Math.ceil(dados.length / (W < 520 ? 6 : 10));
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
  dados.forEach((d, i) => {
    const h = d.v / max * (H - pad.t - pad.b), x = pad.l + i * bw, y = H - pad.b - h;
    s += `<rect x="${(x + bw * 0.15).toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(bw * 0.7, 1).toFixed(1)}" height="${h.toFixed(1)}" rx="${Math.min(4, bw * 0.2).toFixed(1)}" fill="${d.cor || cor}"><title>${esc(d.l)}: ${brl(d.v)}</title></rect>`;
    if (i % passo === 0) s += `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 8}" font-size="10.5" text-anchor="middle" fill="#6d6a80">${esc(d.l)}</text>`;
  });
  el.innerHTML = s + '</svg>';
}
function linhas(el, rotulos, series) {
  const { W, H } = svgBox(el), pad = { l: 8, r: W < 520 ? 70 : 90, t: 16, b: 26 };
  const all = series.flatMap(s => s.v), max = Math.max(...all, 1);
  const X = i => pad.l + i / (rotulos.length - 1 || 1) * (W - pad.l - pad.r);
  const Y = v => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
  for (let k = 0; k <= 4; k++) { const y = pad.t + k * (H - pad.t - pad.b) / 4; s += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y}" y2="${y}" stroke="#eeedf4"/>`; }
  series.forEach(se => {
    const d = se.v.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
    if (se.area) s += `<path d="${d}L${X(se.v.length - 1).toFixed(1)},${H - pad.b}L${X(0)},${H - pad.b}Z" fill="${se.cor}" opacity=".14"/>`;
    s += `<path d="${d}" fill="none" stroke="${se.cor}" stroke-width="${se.w || 3}" ${se.dash ? 'stroke-dasharray="6 5"' : ''} stroke-linejoin="round"/>`;
    const last = se.v[se.v.length - 1];
    s += `<circle cx="${X(se.v.length - 1)}" cy="${Y(last)}" r="4" fill="#fff" stroke="${se.cor}" stroke-width="2.5"/>`;
    s += `<text x="${X(se.v.length - 1) + 8}" y="${Y(last) + 4}" font-size="11.5" font-weight="800" fill="${se.cor}">${brl0(last).replace('R$ ', 'R$')}</text>`;
  });
  const passo = Math.ceil(rotulos.length / (W < 520 ? 5 : 10));
  rotulos.forEach((r, i) => { if (i % passo === 0 || i === rotulos.length - 1) s += `<text x="${X(i)}" y="${H - 8}" font-size="10.5" text-anchor="middle" fill="#6d6a80">${esc(r)}</text>`; });
  el.innerHTML = s + '</svg>';
}

// ---------- 1. Isento x tributado ----------
function calcIsento() {
  const out = $('out-isento');
  const iT = n('i_taxa'), tT = n('t_taxa'), dias = parseInt($('i_dias').value, 10), V = n('i_valor') || 100000;
  if (!Number.isFinite(iT) || !Number.isFinite(tT) || !(dias > 0)) { out.innerHTML = '<p class="note">Preencha as duas taxas e o prazo em dias.</p>'; return; }
  const { cdi, ipca } = prem(), iIdx = $('i_idx').value, tIdx = $('t_idx').value;
  const t = dias / 365, a = aliquotaIR(dias);
  const rI = taxaEfetiva(iIdx, iT, cdi, ipca), rT = taxaEfetiva(tIdx, tT, cdi, ipca);
  const liqI = Math.pow(1 + rI, t) - 1, liqT = (Math.pow(1 + rT, t) - 1) * (1 - a);
  const eqTrib = taxaNoIdx(tIdx, Math.pow(1 + liqI / (1 - a), 1 / t) - 1, cdi, ipca); // taxa que o tributado precisa
  const eqIsento = taxaNoIdx(iIdx, Math.pow(1 + liqT, 1 / t) - 1, cdi, ipca);       // isento equivalente ao tributado
  const vI = V * (1 + liqI), vT = V * (1 + liqT), dif = vI - vT;
  const ganha = Math.abs(dif) < V * 0.0005 ? null : dif > 0 ? 'isento' : 'tributado';
  const faixas = [[180, 'Até 180 dias', 0.225], [360, '181 a 360 dias', 0.20], [720, '361 a 720 dias', 0.175], [1080, 'Acima de 720 dias', 0.15]];
  out.innerHTML = `
    <div class="verdict ${ganha === 'isento' ? 'good' : ganha === 'tributado' ? 'neutral' : 'neutral'}">
      ${ganha ? `O ${ganha} rende mais: ${brl(Math.abs(dif))} a mais em ${dias} dias` : 'Praticamente empate'}
      <small>IR do tributado nesse prazo: ${pct(a * 100, 1)}. Para empatar com o isento, o tributado precisaria pagar ${fmtIdx(tIdx, eqTrib)}.</small></div>
    <div class="kpis">
      <div class="kpi"><div class="l">Isento · ${fmtIdx(iIdx, iT)}</div><div class="v">${brl(vI)}</div><div class="s">líquido · ${pct(liqI * 100)} no período</div></div>
      <div class="kpi"><div class="l">Tributado · ${fmtIdx(tIdx, tT)}</div><div class="v">${brl(vT)}</div><div class="s">líquido · ${pct(liqT * 100)} no período</div></div>
      <div class="kpi orange"><div class="l">Tributado equivalente ao isento</div><div class="v" style="font-size:17px">${fmtIdx(tIdx, eqTrib)}</div><div class="s">gross-up do isento</div></div>
      <div class="kpi"><div class="l">Isento equivalente ao tributado</div><div class="v" style="font-size:17px">${fmtIdx(iIdx, eqIsento)}</div><div class="s">líquido do tributado</div></div>
    </div>
    <h3 style="margin-top:16px">Equivalência por prazo</h3>
    <div class="table-wrap"><table>
      <thead><tr><th>Prazo</th><th class="n">IR</th><th class="n">Tributado equivalente a ${esc(fmtIdx(iIdx, iT))}</th></tr></thead>
      <tbody>${faixas.map(([d, l, aa]) => {
        const tt = d / 365, li = Math.pow(1 + rI, tt) - 1;
        const eq = taxaNoIdx(tIdx, Math.pow(1 + li / (1 - aa), 1 / tt) - 1, cdi, ipca);
        return `<tr ${aliquotaIR(dias) === aa ? 'style="background:var(--orange-soft);font-weight:700"' : ''}><td>${l}</td><td class="n">${pct(aa * 100, 1)}</td><td class="n">${fmtIdx(tIdx, eq)}</td></tr>`;
      }).join('')}</tbody></table></div>
    <p class="note">Considera o mesmo prazo e o mesmo risco de crédito. Taxas pós-fixadas e IPCA+ convertidas com as premissas de CDI e IPCA acima.</p>`;
}

// ---------- 2. Juros recebidos no tempo (cupons) ----------
function addMeses(iso, m) {
  const d = new Date(iso + 'T12:00:00'), dia = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + m);
  const ult = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(dia, ult));
  return d.toISOString().slice(0, 10);
}
function calcCupons() {
  const out = $('out-cupons');
  const V = n('c_valor'), tx = n('c_taxa'), per = parseInt($('c_per').value, 10), ini = $('c_ini').value, venc = $('c_venc').value;
  if (!(V > 0) || !Number.isFinite(tx) || !ini || !venc) { out.innerHTML = '<p class="note">Preencha valor, taxa, data da aplicação e vencimento.</p>'; return; }
  if (!(daysBetween(ini, venc) > 0)) { out.innerHTML = '<p class="note">O vencimento precisa ser depois da aplicação.</p>'; return; }
  const { cdi, ipca } = prem(), idx = $('c_idx').value, isento = $('c_isento').checked;
  // datas de pagamento: do vencimento para trás
  const datas = [];
  for (let k = 0; k < 600; k++) { const d = addMeses(venc, -per * k); if (daysBetween(ini, d) <= 0) break; datas.unshift(d); }
  const real = idx === 'ipcamais';
  const r = real ? tx / 100 : taxaEfetiva(idx, tx, cdi, ipca);
  const vna = d => real ? V * Math.pow(1 + ipca / 100, daysBetween(ini, d) / 365) : V;
  let ant = ini, totB = 0, totIR = 0;
  const linhasT = datas.map((d, k) => {
    const dt = daysBetween(ant, d) / 365;
    const bruto = vna(d) * (Math.pow(1 + r, dt) - 1);
    const irv = isento ? 0 : aliquotaIR(daysBetween(ini, d)) * bruto;
    totB += bruto; totIR += irv; ant = d;
    return { k: k + 1, d, bruto, ir: irv, liq: bruto - irv };
  });
  const princ = vna(venc), corr = princ - V, irCorr = isento ? 0 : aliquotaIR(daysBetween(ini, venc)) * Math.max(corr, 0);
  const meses = daysBetween(ini, venc) / 30.4375;
  const liqTot = totB - totIR;
  out.innerHTML = `
    <div class="kpis">
      <div class="kpi orange"><div class="l">Juros líquidos recebidos</div><div class="v">${brl(liqTot)}</div><div class="s">${linhasT.length} pagamento(s)</div></div>
      <div class="kpi"><div class="l">Média por mês</div><div class="v">${brl(liqTot / meses)}</div><div class="s">líquido de IR</div></div>
      <div class="kpi"><div class="l">Primeiro pagamento</div><div class="v" style="font-size:17px">${fmtDate(linhasT[0].d)}</div><div class="s">${brl(linhasT[0].liq)} líquido</div></div>
      <div class="kpi"><div class="l">Principal no vencimento</div><div class="v">${brl(princ - irCorr)}</div><div class="s">${real ? `corrigido pelo IPCA${irCorr ? `, após IR de ${brl(irCorr)}` : ''}` : 'valor aplicado'}</div></div>
    </div>
    <div class="legend" style="margin-top:14px"><span><i style="background:#ff5a00;height:8px;width:12px"></i>Juros líquidos por pagamento</span></div>
    <div class="chart-box" id="chCupons"></div>
    <div class="table-wrap" style="margin-top:12px"><table>
      <thead><tr><th>#</th><th>Data</th><th class="n">Juros bruto</th><th class="n">IR</th><th class="n">Juros líquido</th>${real ? '<th class="n hide-sm">Principal corrigido</th>' : ''}</tr></thead>
      <tbody>${linhasT.map(l => `<tr><td>${l.k}</td><td>${fmtDate(l.d)}</td><td class="n">${brl(l.bruto)}</td><td class="n">${l.ir ? '−' + brl(l.ir) : '—'}</td><td class="n"><b>${brl(l.liq)}</b></td>${real ? `<td class="n hide-sm">${brl(vna(l.d))}</td>` : ''}</tr>`).join('')}
        <tr class="group"><td></td><td>${fmtDate(venc)}</td><td colspan="2">Devolução do principal${irCorr ? ` (IR sobre a correção: −${brl(irCorr)})` : ''}</td><td class="n">${brl(princ - irCorr)}</td>${real ? '<td class="hide-sm"></td>' : ''}</tr></tbody>
      <tfoot><tr><td></td><td>Total</td><td class="n">${brl(totB)}</td><td class="n">${totIR ? '−' + brl(totIR) : '—'}</td><td class="n">${brl(liqTot)}</td>${real ? '<td class="hide-sm"></td>' : ''}</tr></tfoot>
    </table></div>
    <p class="note">IR de cada cupom pela tabela regressiva, contando o prazo desde a aplicação. Valores projetados com as premissas acima; não é garantia de rentabilidade.</p>`;
  barras($('chCupons'), linhasT.map(l => ({ l: fmtDate(l.d).slice(3), v: l.liq })));
}

// ---------- 3. Juros compostos ----------
function calcCompostos() {
  const out = $('out-compostos');
  const V0 = n('j_ini') || 0, ap = n('j_aporte') || 0, prazo = parseInt($('j_prazo').value, 10), un = parseInt($('j_un').value, 10), tx = n('j_taxa');
  const N = prazo * un;
  if (!(N > 0) || !Number.isFinite(tx) || !(V0 + ap > 0)) { out.innerHTML = '<p class="note">Preencha valor inicial ou aporte, prazo e taxa.</p>'; return; }
  if (N > 720) { out.innerHTML = '<p class="note">Use um prazo de até 60 anos.</p>'; return; }
  const { cdi, ipca } = prem(), idx = $('j_idx').value, isento = $('j_isento').checked, realM = $('j_real').checked;
  const r = taxaEfetiva(idx, tx, cdi, ipca), rm = Math.pow(1 + r, 1 / 12) - 1;
  const defl = m => realM ? Math.pow(1 + ipca / 100, m / 12) : 1;
  // cada aporte é um "lote" com seu próprio prazo para a alíquota de IR
  const lotes = [{ m: 0, v: V0 }];
  for (let m = 1; m < N; m++) if (ap) lotes.push({ m, v: ap });
  const em = m => {
    let bruto = 0, inv = 0, ir = 0;
    lotes.forEach(l => {
      if (l.m > m || !l.v) return;
      const g = l.v * Math.pow(1 + rm, m - l.m);
      bruto += g; inv += l.v;
      if (!isento) ir += aliquotaIR(Math.round((m - l.m) * 30.4375)) * (g - l.v);
    });
    return { bruto, inv, liq: bruto - ir, ir };
  };
  const rot = [], sInv = [], sBru = [], sLiq = [], anos = [];
  const passo = N > 120 ? 12 : 1;
  for (let m = 0; m <= N; m += passo) {
    const e = em(m), f = defl(m);
    rot.push(N > 24 ? `${Math.round(m / 12)}a` : `${m}m`);
    sInv.push(e.inv / f); sBru.push(e.bruto / f); sLiq.push(e.liq / f);
  }
  if ((N % passo) !== 0) { const e = em(N), f = defl(N); rot.push(`${(N / 12).toFixed(1)}a`); sInv.push(e.inv / f); sBru.push(e.bruto / f); sLiq.push(e.liq / f); }
  for (let y = 1; y <= Math.ceil(N / 12); y++) {
    const m = Math.min(y * 12, N), e = em(m), e0 = em(Math.min((y - 1) * 12, N)), f = defl(m);
    anos.push({ y, inv: e.inv / f, bruto: e.bruto / f, liq: e.liq / f, juros: (e.bruto - e0.bruto - (e.inv - e0.inv)) / f });
  }
  const fim = em(N), f = defl(N);
  out.innerHTML = `
    <div class="kpis">
      <div class="kpi orange"><div class="l">Saldo líquido no fim</div><div class="v">${brl(fim.liq / f)}</div><div class="s">${realM ? 'em valores de hoje' : 'valor nominal'}</div></div>
      <div class="kpi"><div class="l">Total investido</div><div class="v">${brl(fim.inv / f)}</div><div class="s">${brl(V0)} + ${N - 1} aportes de ${brl(ap)}</div></div>
      <div class="kpi"><div class="l">Juros ganhos</div><div class="v good">${brl((fim.bruto - fim.inv) / f)}</div><div class="s">IR: ${isento ? 'isento' : brl(fim.ir / f)}</div></div>
      <div class="kpi"><div class="l">Renda mensal no fim</div><div class="v">${brl(fim.bruto * rm * (isento ? 1 : 0.85) / f)}</div><div class="s">juros de 1 mês sobre o saldo${isento ? '' : ', líquido a 15%'}</div></div>
    </div>
    <div class="legend" style="margin-top:14px"><span><i style="background:#22105a"></i>Total investido</span><span><i style="background:#ff5a00"></i>Saldo bruto</span><span><i style="background:repeating-linear-gradient(90deg,#129b5a 0 5px,transparent 5px 9px)"></i>Saldo líquido</span></div>
    <div class="chart-box" id="chComp"></div>
    <div class="table-wrap" style="margin-top:12px"><table>
      <thead><tr><th>Ano</th><th class="n">Investido</th><th class="n">Juros no ano</th><th class="n">Saldo bruto</th><th class="n">Saldo líquido</th></tr></thead>
      <tbody>${anos.map(a => `<tr><td>${a.y}</td><td class="n">${brl(a.inv)}</td><td class="n good">${brl(a.juros)}</td><td class="n">${brl(a.bruto)}</td><td class="n"><b>${brl(a.liq)}</b></td></tr>`).join('')}</tbody>
    </table></div>
    <p class="note">Taxa efetiva de ${pct(r * 100)} a.a. (${pct(rm * 100, 3)} a.m.). IR calculado por aporte, conforme o tempo de cada um. Aportes no fim de cada mês.</p>`;
  linhas($('chComp'), rot, [
    { v: sInv, cor: '#22105a', area: true, w: 2.5 },
    { v: sBru, cor: '#ff5a00' },
    { v: sLiq, cor: '#129b5a', dash: true, w: 2.5 },
  ]);
}

// ---------- Abas, premissas e persistência ----------
function aba() {
  const t = (location.hash || '#isento').slice(1);
  document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.t === t));
  ['isento', 'cupons', 'compostos'].forEach(k => $('pane-' + k).hidden = k !== t);
  calcular();
}
function calcular() {
  const s = {}; CAMPOS.forEach(c => { const el = $(c); s[c] = el.type === 'checkbox' ? el.checked : el.value; }); store.set('rw_rfcalc', s);
  const t = (location.hash || '#isento').slice(1);
  if (t === 'isento') calcIsento(); else if (t === 'cupons') calcCupons(); else calcCompostos();
}
(async function init() {
  const s = store.get('rw_rfcalc', null);
  if (s) CAMPOS.forEach(c => { if (s[c] === undefined) return; const el = $(c); if (el.type === 'checkbox') el.checked = s[c]; else el.value = s[c]; });
  if (!$('c_ini').value) $('c_ini').value = todayISO();
  if (!$('c_venc').value) $('c_venc').value = addMeses(todayISO(), 60);
  // premissas: usa CDI e IPCA 12m do Banco Central se o usuário não definiu
  if (!$('p_cdi').value || !$('p_ipca').value) {
    try {
      const d = await carregarDados('macro.json');
      const get = id => d.itens.find(i => i.id === id)?.valor;
      if (!$('p_cdi').value && get('cdi')) $('p_cdi').value = NUM2.format(get('cdi'));
      if (!$('p_ipca').value && get('ipca_12m')) $('p_ipca').value = NUM2.format(get('ipca_12m'));
      $('premNota').textContent = 'Preenchido com o CDI atual e o IPCA dos últimos 12 meses (Banco Central). Ajuste se quiser outra projeção.';
    } catch {
      if (!$('p_cdi').value) $('p_cdi').value = '13,40';
      if (!$('p_ipca').value) $('p_ipca').value = '4,50';
    }
  }
  CAMPOS.forEach(c => { $(c).addEventListener('input', calcular); $(c).addEventListener('change', calcular); });
  window.addEventListener('hashchange', aba);
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(calcular, 200); });
  aba();
})();
