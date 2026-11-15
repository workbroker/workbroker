// Pesquisa de emissores: dados reais de crédito (Banco Central IF.data e CVM), atualizados todo dia
// pelo GitHub Actions em credito.json. Usado na página de risco de crédito.
let CRED = null, EMI_SEL = null, EMI_GRUPO = null;
const SIT = { A: '', LE: 'Liquidação extrajudicial', I: 'Inativa', IN: 'Intervenção', RA: 'Regime especial (RAET)', F: 'Falência', LO: 'Liquidação ordinária' };
const STOP_EMI = new Set(['banco', 'bco', 'sa', 's/a', 's', 'a', 'de', 'do', 'da', 'e', 'cia', 'companhia', 'financeira', 'credito', 'financiamento', 'investimento', 'investimentos', 'cfi', 'ltda', 'holding', 'participacoes', 'part', 'em', 'liquidacao', 'extrajudicial', 'multiplo', 'brasil', 'cdb', 'lca', 'lci', 'lc', 'deb', 'debenture', 'debentures', 'cri', 'cra', 'lf', 'rdb', 'lig']);
const normE = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9& ]+/g, ' ');
const tokens = s => normE(s).split(/\s+/).filter(t => t && !STOP_EMI.has(t));
const mi = v => Number.isFinite(v) ? (Math.abs(v) >= 1e9 ? 'R$ ' + (v / 1e9).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' bi' : Math.abs(v) >= 1e6 ? 'R$ ' + (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi' : brl(v)) : '—';
const varPct = (a, b) => Number.isFinite(a) && Number.isFinite(b) && b ? (a / Math.abs(b) - 1) * 100 : NaN;
const rotTri = am => am ? `${['', 'mar', '', '', 'jun', '', '', 'set', '', '', 'dez'][String(am).slice(4) - 2] || String(am).slice(4)}/${String(am).slice(2, 4)}` : '';
const dataBR = d => d ? d.split('-').reverse().join('/') : '';

function indexar() {
  CRED.emissores.forEach(e => {
    e._tx = normE([e.n, e.a, e.grupo, e.prud].filter(Boolean).join(' '));
    e._tk = new Set(tokens([e.n, e.a, e.grupo].filter(Boolean).join(' ')));
    e._peso = (e.ind?.ativo || e.fin?.ind?.ativo || 0) + (e.rt ? 1e15 : 0) + (e.sit && e.sit !== 'A' ? -1e16 : 0);
  });
}
function buscar(q, n = 8) {
  const qn = normE(q).trim(), dig = q.replace(/\D/g, '');
  if (!CRED || (qn.length < 2 && dig.length < 4)) return [];
  const qt = qn.split(/\s+/).filter(Boolean);
  return CRED.emissores.map(e => {
    let s = 0;
    if (dig.length >= 4 && (e.c || '').startsWith(dig)) s = 100;
    else if (qt.every(t => e._tx.includes(t))) s = 50 + (e._tx.startsWith(qt[0]) || e._tx.includes(' ' + qt[0]) ? 20 : 0);
    return [s, e];
  }).filter(x => x[0] > 0).sort((a, b) => b[0] - a[0] || b[1]._peso - a[1]._peso).slice(0, n).map(x => x[1]);
}
// melhor emissor para um nome digitado na carteira (ex.: "BANCO C6 S.A.")
function casar(nome) {
  if (!CRED) return null;
  const t = tokens(nome); if (!t.length) return null;
  let best = null, bs = 0;
  CRED.emissores.forEach(e => {
    const hit = t.filter(x => e._tk.has(x)).length; if (!hit) return;
    const s = hit / t.length + hit / Math.max(e._tk.size, 1) * 0.5 + (e.sit && e.sit !== 'A' ? -0.05 : 0) + (e.rt ? 0.05 : 0) + Math.max(0, Math.min(e._peso, 1e13)) / 1e15;
    if (s > bs) { bs = s; best = e; }
  });
  return bs >= 1 ? best : null;
}
const ultimoRating = e => (e?.rt || []).find(r => r.r) || null;
window.sugestaoRating = g => {
  const e = casar(g.nome); if (!e) return '';
  const r = ultimoRating(e);
  return `<button class="link-emi" type="button" data-emi="${esc(e.id)}" data-g="${esc(g.k)}">🔎 ${esc(e.n.length > 34 ? e.n.slice(0, 32) + '…' : e.n)}${r ? ` · <b>${esc(r.r)}</b>${r.ag ? ' ' + esc(r.ag) : ''}` : e.sit && e.sit !== 'A' ? ` · <b class="bad">${esc(SIT[e.sit] || e.sit)}</b>` : ''}</button>`;
};

// ---------- sinais (pontos críticos e bons) ----------
function sinais(e) {
  const crit = [], bom = [];
  if (e.sit && e.sit !== 'A') crit.push(`Situação no Banco Central: ${SIT[e.sit] || e.sit}.`);
  if (/RECUPERA|FAL[EÊ]NCIA|LIQUIDA/i.test(e.sitE || '')) crit.push(`Situação na CVM: ${e.sitE.toLowerCase()}.`);
  if ((e.dc || []).some(d => d.k === 'Recuperação judicial')) crit.push('Publicou informações de recuperação judicial ou extrajudicial no último ano.');
  const r = ultimoRating(e);
  if (r) {
    const c = classeRating(r.r);
    if (c === 'r-bad') crit.push(`Rating ${r.r} abaixo do grau de investimento.`);
    else if (c === 'r-warn') crit.push(`Rating ${r.r}: grau de investimento, mas no limite (BBB).`);
    else if (c === 'r-good') bom.push(`Rating ${r.r}${r.ag ? ' (' + r.ag + ')' : ''}: alta qualidade de crédito na escala nacional.`);
    if (/negativ/.test(r.p || '')) crit.push(`Perspectiva negativa no último relatório de rating (${dataBR(r.d)}).`);
    if (/positiv/.test(r.p || '')) bom.push('Perspectiva positiva no último relatório de rating.');
  }
  const i = e.ind || {}, a = e.ant || {};
  if (e.t === 'b' && Object.keys(i).length) {
    const bas = Number.isFinite(i.basileia) ? (i.basileia < 1 ? i.basileia * 100 : i.basileia) : NaN;
    if (Number.isFinite(bas)) {
      if (bas < 11) crit.push(`Índice de Basileia de ${pct(bas, 1)}: perto do mínimo regulatório (10,5% com adicional).`);
      else if (bas < 13) crit.push(`Índice de Basileia de ${pct(bas, 1)}: folga de capital pequena.`);
      else if (bas >= 15) bom.push(`Índice de Basileia de ${pct(bas, 1)}: boa folga de capital.`);
    }
    if (Number.isFinite(i.lucro) && i.lucro < 0) crit.push(`Prejuízo de ${mi(-i.lucro)} no período.`);
    else if (Number.isFinite(i.lucro) && i.lucro > 0 && Number.isFinite(a.lucro) && a.lucro > 0) bom.push('Lucro no período, como no mesmo período do ano anterior.');
    const vPL = varPct(i.pl, a.pl); if (vPL < -10) crit.push(`Patrimônio líquido caiu ${pct(-vPL, 0)} em 12 meses.`);
    const vCart = varPct(i.carteira, a.carteira); if (vCart > 50) crit.push(`Carteira de crédito cresceu ${pct(vCart, 0)} em 12 meses: crescimento acelerado pede atenção.`);
    if (Number.isFinite(i.captacoes) && i.pl > 0 && i.captacoes / i.pl > 15) crit.push(`Captações de ${(i.captacoes / i.pl).toFixed(1).replace('.', ',')}× o patrimônio: alavancagem alta.`);
    if (e.sr === 'S1') bom.push('Segmento S1 do Banco Central: maiores instituições do sistema, com regulação mais rigorosa.');
    else if (e.sr === 'S2') bom.push('Segmento S2 do Banco Central: instituição de grande porte.');
  }
  const f = e.fin?.ind, fa = e.fin?.ant;
  if (f) {
    const dl = (f.divida || 0) - (f.caixa || 0);
    if (Number.isFinite(f.pl) && f.pl < 0) crit.push('Patrimônio líquido negativo.');
    if (Number.isFinite(f.ebitda) && f.ebitda > 0) {
      const lev = dl / f.ebitda;
      if (lev > 4) crit.push(`Dívida líquida de ${lev.toFixed(1).replace('.', ',')}× o EBITDA: endividamento alto.`);
      else if (lev > 3) crit.push(`Dívida líquida de ${lev.toFixed(1).replace('.', ',')}× o EBITDA: endividamento moderado para alto.`);
      else if (lev < 2) bom.push(lev <= 0 ? 'Caixa maior que a dívida (dívida líquida negativa).' : `Dívida líquida de ${lev.toFixed(1).replace('.', ',')}× o EBITDA: endividamento confortável.`);
    } else if (Number.isFinite(f.ebitda) && f.ebitda <= 0) crit.push('EBITDA negativo no último ano.');
    if (Number.isFinite(f.lucro) && f.lucro < 0) crit.push(`Prejuízo de ${mi(-f.lucro)} no último ano.`);
    if (f.ac && f.pc && f.ac / f.pc < 1) crit.push(`Liquidez corrente de ${(f.ac / f.pc).toFixed(2).replace('.', ',')}: ativo circulante menor que o passivo circulante.`);
    const vr = varPct(f.receita, fa?.receita); if (vr < -15) crit.push(`Receita caiu ${pct(-vr, 0)} no ano.`); else if (vr > 10) bom.push(`Receita cresceu ${pct(vr, 0)} no ano.`);
  }
  return { crit, bom };
}

// ---------- tela ----------
function linhaInd(rot, v, ant, fmt = mi, dica = '') {
  const vv = varPct(v, ant);
  return `<tr><td>${rot}${dica ? `<div class="sub">${dica}</div>` : ''}</td><td class="n"><b>${fmt(v)}</b></td><td class="n ${vv > 0 ? 'good' : vv < 0 ? 'bad' : ''}">${Number.isFinite(vv) ? (vv > 0 ? '+' : '') + pct(vv, 0) : '—'}</td></tr>`;
}
function fichaBanco(e) {
  const i = e.ind || {}, a = e.ant || {};
  if (!Object.keys(i).length) return '<p class="note">Sem números do Banco Central no último trimestre.</p>';
  const p = v => Number.isFinite(v) ? pct(v < 1 ? v * 100 : v, 1) : '—';
  return `<div class="table-wrap"><table class="emi-t"><thead><tr><th>Banco Central · ${rotTri(CRED.ref_bcb)}${e.prud ? `<div class="sub" style="text-transform:none;letter-spacing:0">${esc(e.prud.replace(/ - PRUDENCIAL$/i, ''))} (conglomerado)</div>` : ''}</th><th class="n">Valor</th><th class="n">12 meses</th></tr></thead><tbody>
    ${linhaInd('Índice de Basileia', i.basileia, a.basileia, p, 'mínimo regulatório 10,5%')}
    ${linhaInd('Patrimônio líquido', i.pl, a.pl)}
    ${linhaInd('Lucro líquido', i.lucro, a.lucro, mi, 'acumulado no semestre')}
    ${linhaInd('Ativo total', i.ativo, a.ativo)}
    ${linhaInd('Carteira de crédito', i.carteira, a.carteira)}
    ${linhaInd('Captações', i.captacoes, a.captacoes, mi, Number.isFinite(i.captacoes) && i.pl > 0 ? `${(i.captacoes / i.pl).toFixed(1).replace('.', ',')}× o patrimônio` : '')}
    ${Number.isFinite(i.imobilizacao) ? linhaInd('Índice de imobilização', i.imobilizacao, a.imobilizacao, p, 'limite 50%') : ''}
  </tbody></table></div>`;
}
function fichaEmpresa(e) {
  const f = e.fin?.ind, a = e.fin?.ant || {};
  if (!f) return e.t === 'e' ? '<p class="note">Sem balanço anual padrão na CVM (instituição financeira, seguradora ou sem DFP recente).</p>' : '';
  const dl = (f.divida || 0) - (f.caixa || 0), dla = (a.divida || 0) - (a.caixa || 0);
  const x = (v, d = 1) => Number.isFinite(v) ? v.toFixed(d).replace('.', ',') + '×' : '—';
  return `<div class="table-wrap"><table class="emi-t"><thead><tr><th>Balanço ${CRED.ref_dfp} (CVM)</th><th class="n">Valor</th><th class="n">vs. ${CRED.ref_dfp - 1}</th></tr></thead><tbody>
    ${linhaInd('Receita líquida', f.receita, a.receita)}
    ${linhaInd('EBITDA', f.ebitda, a.ebitda, mi, 'lucro operacional + depreciação')}
    ${linhaInd('Lucro líquido', f.lucro, a.lucro)}
    ${linhaInd('Patrimônio líquido', f.pl, a.pl)}
    ${linhaInd('Dívida bruta', f.divida, a.divida, mi, 'empréstimos e financiamentos')}
    ${linhaInd('Caixa e aplicações', f.caixa, a.caixa)}
    ${linhaInd('Dívida líquida', dl, dla)}
    <tr><td>Dívida líquida / EBITDA</td><td class="n"><b>${f.ebitda > 0 ? x(dl / f.ebitda) : '—'}</b></td><td class="n">${a.ebitda > 0 ? x(dla / a.ebitda) : '—'}</td></tr>
    <tr><td>Dívida líquida / patrimônio</td><td class="n"><b>${f.pl > 0 ? x(dl / f.pl, 2) : '—'}</b></td><td class="n">${a.pl > 0 ? x(dla / a.pl, 2) : '—'}</td></tr>
    <tr><td>Liquidez corrente</td><td class="n"><b>${f.ac && f.pc ? (f.ac / f.pc).toFixed(2).replace('.', ',') : '—'}</b></td><td class="n">${a.ac && a.pc ? (a.ac / a.pc).toFixed(2).replace('.', ',') : '—'}</td></tr>
  </tbody></table></div>`;
}
function buscaAgencias(e) {
  const q = encodeURIComponent((e.a || e.n).replace(/\s+-\s+EM LIQUIDA.*$/i, '').replace(/\bS\.?\/?A\.?$/i, '').trim());
  return `<div class="row" style="margin-top:8px">${[['Fitch', 'fitchratings.com'], ['S&P', 'spglobal.com'], ["Moody's", 'moodyslocal.com']].map(([n, d]) =>
    `<a class="btn sm secondary" target="_blank" rel="noopener" href="https://www.google.com/search?q=${q}+rating+site%3A${d}">Buscar na ${n} ›</a>`).join('')}</div>`;
}
function renderEmissor(e) {
  EMI_SEL = e;
  const box = $('emiFicha');
  if (!e) { box.innerHTML = ''; return; }
  const { crit, bom } = sinais(e), r = ultimoRating(e);
  const tipo = e.t === 'b' ? (e.s || 'Instituição financeira') : `Companhia aberta${e.cat ? ' · categoria ' + e.cat : ''}`;
  const cn = e.c?.length === 14 ? e.c.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : e.c;
  const g = EMI_GRUPO && G_ATUAL().find(x => x.k === EMI_GRUPO);
  box.innerHTML = `<div class="emi-card">
    <div class="emi-hd"><div><div class="emi-n">${esc(e.n)}</div>
      <div class="sub">${esc(tipo)}${e.s && e.t === 'e' ? ' · ' + esc(e.s) : ''}${cn ? ' · CNPJ ' + esc(cn) : ''}${e.grupo ? ' · grupo ' + esc(e.grupo) : ''}</div></div>
      <div class="row">${e.sr ? `<span class="pill" title="Segmento prudencial do Banco Central (S1 = maiores)">${esc(e.sr)}</span>` : ''}${e.sit && e.sit !== 'A' ? `<span class="pill bad">${esc(SIT[e.sit] || e.sit)}</span>` : ''}
      ${r ? `<span class="rt-pill ${classeRating(r.r)}">${esc(r.r)}</span>` : ''}</div></div>
    ${crit.length || bom.length ? `<div class="pontos" style="margin-top:12px">${crit.map(s => `<div class="p crit"><span>⚠</span><span>${esc(s)}</span></div>`).join('')}${bom.map(s => `<div class="p bom"><span>✓</span><span>${esc(s)}</span></div>`).join('')}</div>` : ''}
    ${g && r ? `<div class="row no-print" style="margin-top:10px"><button class="sm" id="btnUsarNota" type="button">Usar ${esc(r.r)}${r.ag ? ' · ' + esc(r.ag) : ''} em ${esc(g.nome)}</button></div>` : ''}
    <h3 class="emi-h">Rating</h3>
    ${(e.rt || []).length ? `<div class="emi-docs">${e.rt.map(x => `<a href="${esc(x.l)}" target="_blank" rel="noopener" class="emi-doc"><span class="d">${dataBR(x.d)}</span><span>${x.r ? `<span class="rt-pill ${classeRating(x.r)}">${esc(x.r)}</span> ` : ''}${x.ag ? `<b>${esc(x.ag)}</b> · ` : ''}${x.p ? 'perspectiva ' + esc(x.p) + ' · ' : ''}${esc(x.a)}</span><b class="ab">Abrir ›</b></a>`).join('')}</div>
      <p class="note" style="margin:6px 0 0">Relatórios das agências publicados pela própria empresa na CVM${(e.rt || []).some(x => !x.r) ? '. Onde a nota não aparece, abra o relatório para conferir' : ''}.</p>`
      : `<p class="note" style="margin:0">Nenhum relatório de rating publicado na CVM nos últimos 18 meses${e.t === 'b' && !e.cvm ? ' (a instituição não tem registro de companhia aberta)' : ''}. Busque direto nas agências:</p>`}
    ${buscaAgencias(e)}
    <h3 class="emi-h">${e.t === 'b' ? 'Números da instituição' : 'Números da empresa'}</h3>
    ${e.t === 'b' ? fichaBanco(e) : fichaEmpresa(e)}
    ${(e.dc || []).length ? `<h3 class="emi-h">Últimos comunicados (CVM)</h3><div class="emi-docs">${e.dc.map(x => `<a href="${esc(x.l)}" target="_blank" rel="noopener" class="emi-doc"><span class="d">${dataBR(x.d)}</span><span><span class="pill ${x.k === 'Fato relevante' || x.k === 'Recuperação judicial' ? 'warn' : ''}">${esc(x.k)}</span> ${esc(x.a || '')}</span><b class="ab">Abrir ›</b></a>`).join('')}</div>` : ''}
    <p class="note" style="margin-top:12px">Fontes: ${e.t === 'b' ? `Banco Central (IF.data, ${rotTri(CRED.ref_bcb)})` : `CVM (balanço ${CRED.ref_dfp || '—'})`}${e.rt || e.dc ? ', CVM (documentos)' : ''}. Atualizado em ${new Date(CRED.atualizado).toLocaleDateString('pt-BR')}. Informação para apoio à análise; confira os documentos originais.</p>
  </div>`;
  const b = $('btnUsarNota');
  if (b) b.onclick = () => {
    RAT[g.k] = Object.assign(RAT[g.k] || {}, { rating: r.r, agencia: ['S&P', 'Fitch', "Moody's"].includes(r.ag) ? r.ag : (r.ag ? 'Outra' : ''), obs: [r.p ? 'perspectiva ' + r.p : '', dataBR(r.d)].filter(Boolean).join(' · ') });
    salvarRat(); render(); toast(`Rating de ${g.nome} preenchido`);
  };
}
const G_ATUAL = () => { try { return grupos(); } catch { return []; } };
function sugerir() {
  const q = $('emiBusca').value, L = buscar(q);
  $('emiSug').innerHTML = L.map(e => `<button type="button" data-emi="${esc(e.id)}"><span>${esc(e.n)}${e.a ? ` <small>${esc(e.a)}</small>` : ''}</span><small>${e.t === 'b' ? 'Banco Central' : 'CVM'}${ultimoRating(e) ? ' · ' + esc(ultimoRating(e).r) : ''}${e.sit && e.sit !== 'A' ? ' · ' + esc(SIT[e.sit] || e.sit) : ''}</small></button>`).join('')
    || (q.trim().length >= 2 && CRED ? '<div class="note" style="padding:8px">Nada encontrado. Tente outro nome ou o CNPJ.</div>' : '');
  $('emiSug').hidden = !$('emiSug').innerHTML;
}
function abrir(id, grupo) {
  const e = CRED?.emissores.find(x => x.id === id); if (!e) return;
  EMI_GRUPO = grupo || null;
  $('emiBusca').value = e.n; $('emiSug').hidden = true; renderEmissor(e);
  $('cardEmi').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
$('emiBusca').addEventListener('input', () => { EMI_GRUPO = null; sugerir(); });
$('emiBusca').addEventListener('focus', sugerir);
$('emiSug').addEventListener('click', e => { const b = e.target.closest('[data-emi]'); if (b) abrir(b.dataset.emi); });
document.addEventListener('click', e => {
  if (!e.target.closest('#cardEmi .busca-emi')) $('emiSug').hidden = true;
  const b = e.target.closest('.link-emi'); if (b) abrir(b.dataset.emi, b.dataset.g);
});

(async () => {
  try {
    CRED = await carregarDados('credito.json'); indexar();
    $('emiStatus').textContent = `${CRED.emissores.length.toLocaleString('pt-BR')} emissores · atualizado em ${new Date(CRED.atualizado).toLocaleDateString('pt-BR')}`;
    render(); // mostra as sugestões de rating na tabela da carteira
  } catch {
    $('emiStatus').textContent = 'Dados ainda não disponíveis. Tente de novo mais tarde.';
  }
})();
