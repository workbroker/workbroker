// Risco de crédito · emissores em atenção: dados reais (Banco Central IF.data e CVM), atualizados todo dia
// pelo GitHub Actions em credito.json. Lista por nível de atenção, como a página de FIIs em atenção.
const $ = id => document.getElementById(id);
let CRED = null, LISTA = [], MOSTRAR = 60;
function classeRating(r) {
  const s = String(r || '').toUpperCase().replace(/\(.*\)|BR|\.BR/g, '').trim();
  if (!s) return '';
  const c = s.replace(/^ML\s*/, '');
  if (/^F1|^A-1/.test(c)) return 'r-good';   // curto prazo
  if (/^F2|^A-2/.test(c)) return 'r-ok';
  if (/^F3|^A-3/.test(c)) return 'r-warn';
  if (/^AAA|^AA[+-]?$|^AA\d/.test(s)) return 'r-good';
  if (/^A[+-]?$|^A\d$/.test(s)) return 'r-ok';
  if (/^BBB|^BAA/.test(s)) return 'r-warn';
  return 'r-bad';
}
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
    e._peso = (e.ind?.ativo || e.fin?.ind?.ativo || 0) + (e.lider ? 5e14 : 0) + (e.rt ? 1e15 : 0) + (e.sit && e.sit !== 'A' ? -1e16 : 0) - e.n.length;
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
const ultimoRating = e => (e?.rt || []).find(r => r.r) || null;
// ---------- sinais (pontos críticos e bons) ----------
function sinais(e) {
  const crit = [], bom = [];
  const F = (t, fin) => crit.push({ t, f: 1, fin }), M = t => crit.push({ t, f: 0 });
  if (e.sit && e.sit !== 'A') F(`Situação no Banco Central: ${SIT[e.sit] || e.sit}.`);
  if (/RECUPERA|FAL[EÊ]NCIA|LIQUIDA/i.test(e.sitE || '')) F(`Situação na CVM: ${e.sitE.toLowerCase()}.`);
  if ((e.dc || []).some(d => d.k === 'Recuperação judicial')) F('Publicou informações de recuperação judicial ou extrajudicial no último ano.');
  const r = ultimoRating(e);
  if (r) {
    const c = classeRating(r.r);
    if (c === 'r-bad') F(`Rating ${r.r} abaixo do grau de investimento.`);
    else if (c === 'r-warn') M(`Rating ${r.r}: grau de investimento, mas no limite (BBB).`);
    else if (c === 'r-good') bom.push(`Rating ${r.r}${r.ag ? ' (' + r.ag + ')' : ''}: alta qualidade de crédito na escala nacional.`);
    if (/negativ/.test(r.p || '')) M(`Perspectiva negativa no último relatório de rating (${dataBR(r.d)}).`);
    if (/positiv/.test(r.p || '')) bom.push('Perspectiva positiva no último relatório de rating.');
  }
  const i = e.ind || {}, a = e.ant || {};
  if (e.t === 'b' && Object.keys(i).length) {
    const bas = Number.isFinite(i.basileia) ? (i.basileia < 1 ? i.basileia * 100 : i.basileia) : NaN;
    if (Number.isFinite(bas)) {
      if (bas < 11) F(`Índice de Basileia de ${pct(bas, 1)}: perto do mínimo regulatório (10,5% com adicional).`, 1);
      else if (bas < 13) M(`Índice de Basileia de ${pct(bas, 1)}: folga de capital pequena.`);
      else if (bas >= 15) bom.push(`Índice de Basileia de ${pct(bas, 1)}: boa folga de capital.`);
    }
    if (Number.isFinite(i.lucro) && i.lucro < 0) M(`Prejuízo de ${mi(-i.lucro)} no período.`);
    else if (Number.isFinite(i.lucro) && i.lucro > 0 && Number.isFinite(a.lucro) && a.lucro > 0) bom.push('Lucro no período, como no mesmo período do ano anterior.');
    const vPL = varPct(i.pl, a.pl); if (vPL < -25) F(`Patrimônio líquido caiu ${pct(-vPL, 0)} em 12 meses.`, 1); else if (vPL < -10) M(`Patrimônio líquido caiu ${pct(-vPL, 0)} em 12 meses.`);
    const vCart = varPct(i.carteira, a.carteira); if (vCart > 50) M(`Carteira de crédito cresceu ${pct(vCart, 0)} em 12 meses: crescimento acelerado pede atenção.`);
    if (Number.isFinite(i.captacoes) && i.pl > 0 && i.captacoes / i.pl > 15) M(`Captações de ${(i.captacoes / i.pl).toFixed(1).replace('.', ',')}× o patrimônio: alavancagem acima do comum entre bancos (perto de 10×).`);
    if (e.sr === 'S1') bom.push('Segmento S1 do Banco Central: maiores instituições do sistema, com regulação mais rigorosa.');
    else if (e.sr === 'S2') bom.push('Segmento S2 do Banco Central: instituição de grande porte.');
  }
  const f = e.fin?.ind, fa = e.fin?.ant;
  if (f) {
    const dl = (f.divida || 0) - (f.caixa || 0);
    if (Number.isFinite(f.pl) && f.pl < 0) F('Patrimônio líquido negativo.', 1);
    if (Number.isFinite(f.ebitda) && f.ebitda > 0) {
      const lev = dl / f.ebitda;
      if (lev > 4.5) F(`Dívida líquida de ${lev.toFixed(1).replace('.', ',')}× o EBITDA: endividamento muito alto.`, 1); else if (lev > 3.5) M(`Dívida líquida de ${lev.toFixed(1).replace('.', ',')}× o EBITDA: endividamento alto.`);
      else if (lev > 3) M(`Dívida líquida de ${lev.toFixed(1).replace('.', ',')}× o EBITDA: endividamento moderado para alto.`);
      else if (lev < 2) bom.push(lev <= 0 ? 'Caixa maior que a dívida (dívida líquida negativa).' : `Dívida líquida de ${lev.toFixed(1).replace('.', ',')}× o EBITDA: endividamento confortável.`);
    } else if (Number.isFinite(f.ebitda) && f.ebitda <= 0) F('EBITDA negativo no último ano.', 1);
    if (Number.isFinite(f.lucro) && f.lucro < 0) M(`Prejuízo de ${mi(-f.lucro)} no último ano.`);
    if (f.ac && f.pc && f.ac / f.pc < 1) M(`Liquidez corrente de ${(f.ac / f.pc).toFixed(2).replace('.', ',')}: ativo circulante menor que o passivo circulante.`);
    const vr = varPct(f.receita, fa?.receita); if (vr < -15) M(`Receita caiu ${pct(-vr, 0)} no ano.`); else if (vr > 10) bom.push(`Receita cresceu ${pct(vr, 0)} no ano.`);
  }
  // com rating AA/AAA publicado, sinais de balanço contam como moderados (a nota da agência pesa mais)
  if (r && classeRating(r.r) === 'r-good') crit.forEach(x => { if (x.fin) x.f = 0; });
  crit.sort((x, y) => y.f - x.f);
  const fortes = crit.filter(x => x.f).length;
  const nivel = fortes || crit.length >= 3 ? 'elevada' : crit.length ? 'moderada' : 'ok';
  return { crit, bom, nivel };
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
const NIVEL = { elevada: 'Atenção elevada', moderada: 'Atenção moderada', ok: 'Sem alerta' };
const tipoDe = e => e.t === 'e' ? 'emp' : /banco|caixa/i.test(e.s || '') ? 'banco' : 'fin';
const nomeCurto = e => (e.a || e.n).replace(/\s*-\s*EM LIQUIDA.*$/i, '').replace(/\s+S\.?\/?A\.?$/i, '');
const porte = e => e.t === 'b' ? (e.ind?.ativo || 0) : (e.fin?.ind?.ativo || 0);
const pctBas = v => Number.isFinite(v) ? pct(v < 1 ? v * 100 : v, 1) : '—';
const xv = (v, d = 1) => Number.isFinite(v) ? v.toFixed(d).replace('.', ',') + '×' : '—';

function detalhe(e) {
  const { crit, bom, nivel } = e._s, r = ultimoRating(e);
  const tipo = e.t === 'b' ? (e.s || 'Instituição financeira') : `Companhia aberta${e.cat ? ' · categoria ' + e.cat : ''}`;
  const cn = e.c?.length === 14 ? e.c.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : e.c;
  return `<div class="sub" style="font-size:13px">${esc(tipo)}${e.s && e.t === 'e' ? ' · ' + esc(e.s) : ''}${cn ? ' · CNPJ ' + esc(cn) : ''}${e.grupo ? ' · grupo ' + esc(e.grupo) : ''}</div>
    <div class="row" style="margin-top:8px"><span class="lv ${nivel}">${NIVEL[nivel]}</span>${e.sr ? `<span class="pill" title="Segmento prudencial do Banco Central (S1 = maiores)">${esc(e.sr)}</span>` : ''}${e.sit && e.sit !== 'A' ? `<span class="pill bad">${esc(SIT[e.sit] || e.sit)}</span>` : ''}${r ? `<span class="rt-pill ${classeRating(r.r)}">${esc(r.r)}${r.ag ? ' · ' + esc(r.ag) : ''}</span>` : ''}</div>
    ${crit.length || bom.length ? `<div class="pontos" style="margin-top:12px">${crit.map(x => `<div class="p crit"><span>⚠</span><span>${esc(x.t)}</span></div>`).join('')}${bom.map(t => `<div class="p bom"><span>✓</span><span>${esc(t)}</span></div>`).join('')}</div>` : ''}
    <h3 class="emi-h">Rating</h3>
    ${(e.rt || []).length ? `<div class="emi-docs">${e.rt.map(x => `<a href="${esc(x.l)}" target="_blank" rel="noopener" class="emi-doc"><span class="d">${dataBR(x.d)}</span><span>${x.r ? `<span class="rt-pill ${classeRating(x.r)}">${esc(x.r)}</span> ` : ''}${x.ag ? `<b>${esc(x.ag)}</b> · ` : ''}${x.p ? 'perspectiva ' + esc(x.p) + ' · ' : ''}${esc(x.a)}</span><b class="ab">Abrir ›</b></a>`).join('')}</div>
      <p class="note" style="margin:6px 0 0">Relatórios das agências publicados pela própria empresa na CVM${(e.rt || []).some(x => !x.r) ? '. Onde a nota não aparece, abra o relatório para conferir' : ''}.</p>`
      : `<p class="note" style="margin:0">Nenhum relatório de rating publicado na CVM nos últimos 18 meses${e.t === 'b' && !e.cvm ? ' (a instituição não tem registro de companhia aberta)' : ''}. Busque direto nas agências:</p>`}
    ${buscaAgencias(e)}
    <h3 class="emi-h">${e.t === 'b' ? 'Números da instituição' : 'Números da empresa'}</h3>
    ${e.t === 'b' ? fichaBanco(e) : fichaEmpresa(e)}
    ${(e.dc || []).length ? `<h3 class="emi-h">Últimos comunicados (CVM)</h3><div class="emi-docs">${e.dc.map(x => `<a href="${esc(x.l)}" target="_blank" rel="noopener" class="emi-doc"><span class="d">${dataBR(x.d)}</span><span><span class="pill ${x.k === 'Fato relevante' || x.k === 'Recuperação judicial' ? 'warn' : ''}">${esc(x.k)}</span> ${esc(x.a || '')}</span><b class="ab">Abrir ›</b></a>`).join('')}</div>` : ''}
    <p class="note" style="margin-top:12px">Fontes: ${e.t === 'b' ? `Banco Central (IF.data, ${rotTri(CRED.ref_bcb)})` : `CVM (balanço ${CRED.ref_dfp || '—'})`}${e.rt || e.dc ? ', CVM (documentos)' : ''}. Atualizado em ${new Date(CRED.atualizado).toLocaleDateString('pt-BR')}. Informação para apoio à análise; confira os documentos originais.</p>`;
}
function abrir(id) {
  const e = CRED?.emissores.find(x => x.id === id); if (!e) return;
  $('emiSug').hidden = true;
  $('dlgT').textContent = e.n;
  $('dlgB').innerHTML = detalhe(e);
  $('dlgEmi').hidden = false; $('dlgEmi').querySelector('.modal').scrollTop = 0; document.body.style.overflow = 'hidden';
}
function fechar() { $('dlgEmi').hidden = true; document.body.style.overflow = ''; }
$('dlgX').onclick = fechar;
$('dlgEmi').addEventListener('click', e => { if (e.target.id === 'dlgEmi') fechar(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('dlgEmi').hidden) fechar(); });

function cartao(e) {
  const { crit, bom, nivel } = e._s, r = ultimoRating(e);
  let mm;
  if (e.t === 'b') {
    const i = e.ind || {};
    mm = [['Basileia', pctBas(i.basileia)], ['Patrimônio', mi(i.pl)], ['Lucro', mi(i.lucro)]];
  } else {
    const f = e.fin?.ind || {}, dl = (f.divida || 0) - (f.caixa || 0);
    mm = [['Dív. líq./EBITDA', f.ebitda > 0 ? xv(dl / f.ebitda) : '—'], ['Receita', mi(f.receita)], ['Lucro', mi(f.lucro)]];
  }
  const pts = crit.slice(0, 2).map(x => `<div class="p crit"><span>⚠</span><span>${esc(x.t)}</span></div>`).join('')
    + (!crit.length ? bom.slice(0, 1).map(t => `<div class="p bom"><span>✓</span><span>${esc(t)}</span></div>`).join('') : '');
  const mais = crit.length > 2 ? `<div class="nx">+ ${crit.length - 2} ${crit.length - 2 === 1 ? 'outro ponto' : 'outros pontos'} de atenção</div>` : '';
  return `<div class="fcard ${nivel}">
    <div class="topo"><div><div class="tk">${esc(nomeCurto(e))}</div><div class="nm">${esc(e.t === 'b' ? (e.s || '') + (e.sr ? ' · ' + e.sr : '') : (e.s || 'Companhia aberta'))}</div></div>
      <div style="text-align:right;display:grid;gap:4px;justify-items:end"><span class="lv ${nivel}">${NIVEL[nivel]}</span>${r ? `<span class="rt-pill ${classeRating(r.r)}">${esc(r.r)}</span>` : ''}</div></div>
    <div class="mm">${mm.map(([k, v]) => `<div>${k}<b>${v}</b></div>`).join('')}</div>
    ${pts ? `<div class="pontos">${pts}</div>` : ''}${mais}
    <button class="sm secondary" type="button" data-emi="${esc(e.id)}">Ver detalhes</button>
  </div>`;
}

// universo da lista: bancos e financeiras ativos (ou em liquidação extrajudicial) com captação relevante,
// e empresas abertas com dívida (relatório de rating, aviso aos debenturistas ou dívida acima de R$ 100 mi)
function relevante(e) {
  if (/PRUDENCIAL$/i.test(e.n)) return false;
  if (e.t === 'b') return e.sit === 'LE' || (e.sit === 'A' && ((e.ind?.captacoes || 0) >= 50e6 || e.rt));
  return !!(e.rt || (e.dc || []).some(d => d.k === 'Aviso aos debenturistas' || d.k === 'Recuperação judicial') || (e.fin?.ind?.divida || 0) >= 100e6);
}
function filtrar() {
  const nv = $('fNivel').value, tp = $('fTipo').value, rt = $('fRat').value, ord = $('fOrd').value;
  const ordem = { elevada: 0, moderada: 1, ok: 2 };
  let L = LISTA.filter(e => (nv === 'todos' || (!nv ? e._s.nivel !== 'ok' : e._s.nivel === nv)) && (!tp || tipoDe(e) === tp) && (!rt || ultimoRating(e)));
  L.sort(ord === 'nome' ? (a, b) => nomeCurto(a).localeCompare(nomeCurto(b), 'pt-BR')
    : ord === 'porte' ? (a, b) => porte(b) - porte(a)
    : (a, b) => ordem[a._s.nivel] - ordem[b._s.nivel] || porte(b) - porte(a));
  $('cont').textContent = `${L.length.toLocaleString('pt-BR')} ${L.length === 1 ? 'emissor' : 'emissores'} · dados de ${new Date(CRED.atualizado).toLocaleDateString('pt-BR')}`;
  $('res').innerHTML = L.length ? `<div class="fgrid">${L.slice(0, MOSTRAR).map(cartao).join('')}</div>${L.length > MOSTRAR ? `<div style="text-align:center;margin-top:14px"><button class="secondary" id="btnMais" type="button">Mostrar mais (${L.length - MOSTRAR})</button></div>` : ''}`
    : '<p class="note">Nenhum emissor com esses filtros.</p>';
  const bm = $('btnMais'); if (bm) bm.onclick = () => { MOSTRAR += 60; filtrar(); };
}
['fNivel', 'fTipo', 'fRat', 'fOrd'].forEach(id => $(id).addEventListener('change', () => { MOSTRAR = 60; filtrar(); }));
function kpis() {
  const n = k => LISTA.filter(e => e._s.nivel === k).length;
  $('kpis').innerHTML = [['elevada', 'Atenção elevada', 'bad'], ['moderada', 'Atenção moderada', 'warn'], ['ok', 'Sem alerta', 'good']].map(([k, t, c]) =>
    `<button class="kpi kbtn" type="button" data-nv="${k}"><div class="l">${t}</div><div class="v ${c}">${n(k).toLocaleString('pt-BR')}</div></button>`).join('')
    + `<div class="kpi"><div class="l">Com rating publicado</div><div class="v">${LISTA.filter(ultimoRating).length.toLocaleString('pt-BR')}</div></div>`;
}
$('kpis').addEventListener('click', e => { const b = e.target.closest('[data-nv]'); if (!b) return; $('fNivel').value = b.dataset.nv; MOSTRAR = 60; filtrar(); $('cont').scrollIntoView({ behavior: 'smooth' }); });
$('sobre').innerHTML = `<div class="pontos">
  <div class="p crit"><span>●</span><span><b>Atenção elevada:</b> pelo menos um sinal forte (liquidação ou falência, recuperação judicial, rating abaixo do grau de investimento, Basileia abaixo de 11%, patrimônio negativo, EBITDA negativo, dívida líquida acima de 4,5× o EBITDA, patrimônio caindo mais de 25% em 12 meses) ou três sinais moderados. Para quem tem rating AA ou AAA publicado, os sinais de balanço contam como moderados.</span></div>
  <div class="p" style="background:var(--warn-soft)"><span style="color:var(--warn)">●</span><span><b>Atenção moderada:</b> sinais como Basileia entre 11% e 13%, prejuízo, rating BBB, perspectiva negativa, dívida líquida entre 3× e 4,5× o EBITDA, liquidez corrente abaixo de 1, crescimento acelerado da carteira ou alavancagem alta.</span></div>
  <div class="p bom"><span>●</span><span><b>Sem alerta:</b> nenhum desses sinais nos dados públicos mais recentes.</span></div></div>
  <p class="note" style="margin-top:10px">Bancos e financeiras: números do Banco Central (IF.data, trimestral) do conglomerado prudencial, com captação acima de R$ 50 milhões. Empresas: balanço anual e documentos da CVM, para quem tem relatório de rating, aviso aos debenturistas ou dívida acima de R$ 100 milhões. Ratings: só os relatórios que a empresa publica na CVM; as agências não liberam as notas de graça. É um filtro para apoiar a análise, não uma recomendação.</p>`;

function sugerir() {
  const q = $('emiBusca').value, L = buscar(q);
  $('emiSug').innerHTML = L.map(e => `<button type="button" data-emi="${esc(e.id)}"><span>${esc(e.n)}${e.a ? ` <small>${esc(e.a)}</small>` : ''}</span><small><span class="lv ${e._s.nivel}">${NIVEL[e._s.nivel]}</span>${ultimoRating(e) ? ' · ' + esc(ultimoRating(e).r) : ''}</small></button>`).join('')
    || (q.trim().length >= 2 && CRED ? '<div class="note" style="padding:8px">Nada encontrado. Tente outro nome ou o CNPJ.</div>' : '');
  $('emiSug').hidden = !$('emiSug').innerHTML;
}
$('emiBusca').addEventListener('input', sugerir);
$('emiBusca').addEventListener('focus', sugerir);
document.addEventListener('click', e => {
  const b = e.target.closest('[data-emi]'); if (b) { abrir(b.dataset.emi); return; }
  if (!e.target.closest('.busca-emi')) $('emiSug').hidden = true;
});

(async () => {
  try {
    CRED = await carregarDados('credito.json'); indexar();
    CRED.emissores.forEach(e => { e._s = sinais(e); });
    // um cartão por conglomerado (as instituições do mesmo grupo têm os mesmos números): fica a líder
    const grupoDe = {}, pref = e => (e.lider ? 4 : 0) + (e.rt ? 2 : 0) + (e.cvm ? 1 : 0) - e.n.length / 1000;
    CRED.emissores.filter(relevante).forEach(e => {
      const k = e.t === 'b' && e.prud ? 'p:' + e.prud : e.id;
      if (!grupoDe[k] || pref(e) > pref(grupoDe[k])) grupoDe[k] = e;
    });
    LISTA = Object.values(grupoDe);
    kpis(); filtrar();
  } catch (err) {
    console.error(err);
    $('res').innerHTML = '<p class="note">Dados ainda não disponíveis. Tente de novo mais tarde.</p>';
  }
})();
