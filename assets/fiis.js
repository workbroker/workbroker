// FIIs em atenção
// 1) Indicadores automáticos de todos os FIIs listados (fiis.json, gerado todo dia pelo GitHub Actions a partir de CVM e B3)
//    com sinais objetivos: pontos críticos e pontos bons.
// 2) Opcional: o "Manual de FIIs em atenção" (.html) importado pelo assessor acrescenta a análise escrita
//    (o que aconteceu, como explicar ao cliente etc.). O manual fica só no navegador, nunca no repositório.

const $ = id => document.getElementById(id);
const CHAVE = 'rw_fii_manual';

// ---------- formatos (frações: 0,123 = 12,3%) ----------
const okn = v => typeof v === 'number' && isFinite(v);
const nf = d => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const fp = (v, d = 1) => okn(v) ? (v < 0 ? '−' : '') + nf(d).format(Math.abs(v * 100)) + '%' : '—';
const fs = (v, d = 1) => okn(v) ? (Math.abs(v) < 0.5 / Math.pow(10, d + 2) ? '' : v >= 0 ? '+' : '−') + nf(d).format(Math.abs(v * 100)) + '%' : '—';
const fpp = v => okn(v) ? (v >= 0 ? '+' : '−') + nf(1).format(Math.abs(v * 100)) + ' p.p.' : '—';
const n0 = v => okn(v) ? nf(0).format(v) : '—';
const n2 = v => okn(v) ? nf(2).format(v) : '—';
const rs = v => okn(v) ? 'R$ ' + nf(v < 0.2 ? 3 : 2).format(v) : '—';
const mi = v => !okn(v) ? '—' : v >= 1e9 ? 'R$ ' + nf(2).format(v / 1e9) + ' bi' : v >= 1e6 ? 'R$ ' + nf(1).format(v / 1e6) + ' mi' : 'R$ ' + nf(0).format(v / 1e3) + ' mil';
const cl = v => okn(v) ? (v < 0 ? 'neg' : 'pos') : '';
const arr = v => Array.isArray(v) ? v : (v ? [v] : []);
const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mlab = s => { const p = String(s || '').split('-'); return p.length === 2 ? MES[+p[1] - 1] + '/' + p[0].slice(2) : String(s || ''); };
const li = a => arr(a).map(x => `<li>${esc(x)}</li>`).join('');
const semAc = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const NIVEL = { elevada: 'Atenção elevada', moderada: 'Atenção moderada', ok: 'Sem alerta' };
const NORD = { elevada: 0, moderada: 1, ok: 2 };
const MUD = { novo: 'Novo nesta edição', mantido: 'Mantido', piorou: 'Piorou', melhorou: 'Melhorou' };
const lv = k => `<span class="lv ${esc(k)}">${esc(NIVEL[k] || k)}</span>`;
const mud = k => k ? `<span class="mud">${esc(MUD[k] || k)}</span>` : '';

// ---------- estado ----------
let AUTO = {}, AUTO_META = null, IFIX = null;   // indicadores automáticos
let MAN = null;                                   // manual importado (opcional)
let byT = {}, UT = new Set(), FORA = {}, NLOC = new Set(), PEND = new Set(), DESC = {}, GL = new Map(), ED = '', REF = {}, FM = [];

// ---------- indicadores automáticos e sinais ----------
function calcAuto(t, a) {
  const f = { ticker: t, ...a };
  const r = arr(a.r).map(([m, v]) => ({ m, v: +v })).sort((x, y) => y.m.localeCompare(x.m));
  f._r = r;
  const hoje = new Date(), mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  const ANO = hoje.getFullYear();
  f.ult = r.length ? r[0].v : null; f.ultMes = r.length ? r[0].m : null;
  f.soma12 = r.slice(0, 12).reduce((s, x) => s + x.v, 0);
  f.div_ano = r.filter(x => +x.m.slice(0, 4) === ANO).reduce((s, x) => s + x.v, 0);
  const ant = r.slice(1, 7).map(x => x.v);
  f.med6 = ant.length >= 4 ? ant.reduce((s, x) => s + x, 0) / ant.length : null;
  f.varRend = okn(f.ult) && okn(f.med6) && f.med6 > 0 ? f.ult / f.med6 - 1 : null;
  const okp = okn(f.p) && f.p > 0;
  f.pvp = okp && okn(f.vp) && f.vp > 0 ? f.p / f.vp : null;
  f.dy12 = okp && r.length ? f.soma12 / f.p : null;
  f.var_ano = okp && okn(f.p_ano) ? f.p / f.p_ano - 1 : null;
  f.var12 = okp && okn(f.p12) ? f.p / f.p12 - 1 : null;
  f.tr12 = okp && okn(f.p12) ? (f.p + f.soma12) / f.p12 - 1 : null;
  f.tr_ano = okp && okn(f.p_ano) ? (f.p + f.div_ano) / f.p_ano - 1 : null;
  f.varVp = okn(f.vp) && okn(f.vp12) && f.vp12 > 0 ? f.vp / f.vp12 - 1 : null;
  // meses sem rendimento: o último pagamento foi há mais de 2 meses
  const mesesDesde = f.ultMes ? (ANO - +f.ultMes.slice(0, 4)) * 12 + (hoje.getMonth() + 1 - +f.ultMes.slice(5, 7)) : null;
  const forte = [], medio = [], info = [], bom = [];
  if (okn(f.varRend) && f.varRend <= -0.10) forte.push(`Rendimento caiu ${fp(-f.varRend, 0)}: ${rs(f.ult)} em ${mlab(f.ultMes)}, contra média de ${rs(f.med6)} nos 6 meses anteriores.`);
  if (r.length >= 3 && mesesDesde !== null && mesesDesde >= 3) forte.push(`Sem rendimento desde ${mlab(f.ultMes)}.`);
  if (okn(f.varVp) && f.varVp <= -0.05) forte.push(`Valor patrimonial por cota caiu ${fp(-f.varVp, 1)} em 12 meses (${rs(f.vp12)} → ${rs(f.vp)}, CVM).`);
  if (IFIX && okn(IFIX.r12) && okn(f.tr12) && f.tr12 - IFIX.r12 <= -0.15) medio.push(`Retorno de ${fs(f.tr12)} em 12 meses, ${fpp(f.tr12 - IFIX.r12).replace('−', '')} abaixo do IFIX: vale investigar o motivo.`);
  if (okn(f.pvp) && f.pvp < 0.7) medio.push(`Cota negocia com desconto alto (P/VP ${n2(f.pvp)}): o mercado vê risco no fundo.`);
  if (okn(f.vol) && f.vol < 100000) info.push(`Pouca liquidez: cerca de ${mi(f.vol)} negociados por dia.`);
  if (okn(f.varRend) && f.varRend > -0.03 && r.length >= 6) bom.push(f.varRend > 0.03 ? `Rendimento subiu: ${rs(f.ult)} contra média de ${rs(f.med6)} nos 6 meses anteriores.` : `Rendimento estável: ${rs(f.ult)} por cota, em linha com os 6 meses anteriores.`);
  if (okn(f.varVp) && f.varVp >= -0.01) bom.push(f.varVp > 0.01 ? `Valor patrimonial por cota subiu ${fp(f.varVp, 1)} em 12 meses.` : 'Valor patrimonial por cota estável em 12 meses.');
  if (IFIX && okn(IFIX.r12) && okn(f.tr12) && f.tr12 > IFIX.r12) bom.push(`Retorno de ${fs(f.tr12)} em 12 meses, acima do IFIX (${fs(IFIX.r12)}).`);
  if (okn(f.vol) && f.vol >= 3e6) bom.push(`Boa liquidez: cerca de ${mi(f.vol)} negociados por dia.`);
  if (okn(f.cot) && f.cot >= 100000) bom.push(`Base ampla, com ${n0(f.cot)} cotistas.`);
  // documentos do Fundos.NET
  f.docs = arr(a.docs).filter(d => !/Estruturado/.test(d[1])).map(([data, cat, tipo, esp, inf, id]) => ({ data, cat, tipo, esp, inf: /^FII .{0,20};$/.test(inf || '') ? '' : inf, id }));
  const diasAtras = d => (Date.now() - new Date(d + 'T12:00:00')) / 864e5;
  f.avisos = [];
  f.docs.filter(d => /fato relevante/i.test(d.cat) && diasAtras(d.data) <= 45).slice(0, 2)
    .forEach(d => f.avisos.push({ d, txt: `Fato relevante em ${fmtDate(d.data)}${d.inf ? ': ' + d.inf : ''}` }));
  const age = f.docs.find(d => /assembl/i.test(d.cat) && /AGE|extraordin/i.test(d.tipo + ' ' + d.esp) && /convoca|edital|proposta|consulta/i.test(d.esp + ' ' + d.tipo + ' ' + d.cat) && diasAtras(d.data) <= 60);
  if (age) f.avisos.push({ d: age, txt: `Assembleia extraordinária convocada (${fmtDate(age.data)})${age.inf ? ': ' + age.inf : ''}` });
  f.forte = forte; f.medio = medio; f.crit = [...forte, ...medio, ...info]; f.bom = bom;
  f.nivel = forte.length >= 2 || (forte.length && medio.length >= 2) ? 'elevada' : forte.length || medio.length >= 2 ? 'moderada' : 'ok';
  return f;
}
const A = t => AUTO[t] || null;

// ---------- manual (opcional) ----------
function extrair(texto) {
  const a = texto.indexOf('/*DADOS_INICIO*/'), b = texto.indexOf('/*DADOS_FIM*/');
  if (a < 0 || b < 0) throw new Error('Este arquivo não parece ser o Manual de FIIs em atenção.');
  const bruto = texto.slice(a + 16, b).trim().replace(/;$/, '');
  if (bruto === 'null') throw new Error('O manual está vazio (modelo sem dados).');
  const data = JSON.parse(bruto);
  if (!Array.isArray(data.fundos)) throw new Error('O manual não tem a lista de fundos.');
  let gloss = [];
  const g = texto.match(/const GLOSS_DEFAULT\s*=\s*(\[[\s\S]*?\]\]);/);
  if (g) try { gloss = JSON.parse(g[1]); } catch (e) {}
  return { data, gloss };
}
async function importar(file) {
  if (!file) return;
  try {
    const { data, gloss } = extrair(await file.text());
    const pacote = { data, gloss, arquivo: file.name, importado: new Date().toISOString() };
    try { localStorage.setItem(CHAVE, JSON.stringify(pacote)); } catch (e) { toast('Não deu para guardar no navegador; o manual vale só até fechar a página.'); }
    prepararManual(pacote); montar();
    toast(`Manual da edição ${data.edicao || ''} importado`);
  } catch (e) { toast('❌ ' + e.message); }
}
$('btnNova').onclick = () => $('fileMan').click();
$('fileMan').onchange = e => { importar(e.target.files[0]); e.target.value = ''; };

function prepararManual(pacote) {
  MAN = pacote; const D = pacote.data; ED = D.edicao || '';
  const ANO = +String(ED).split('/')[2];
  FM = arr(D.fundos).map(f0 => {
    const f = Object.assign({}, f0);
    f._r = arr(f.rendimentos).map(x => ({ m: String(x[0]), v: +x[1] }));
    f.ult = f._r.length ? f._r[0].v : null;
    f.soma12 = f._r.slice(0, 12).reduce((a, x) => a + x.v, 0);
    f.div_ano = f._r.filter(x => +x.m.slice(0, 4) === ANO).reduce((a, x) => a + x.v, 0);
    const okp = okn(f.preco) && f.preco > 0;
    f.pvp = okn(f.vp) && f.vp > 0 && okp ? f.preco / f.vp : null;
    f.dy12 = f._r.length && okp ? f.soma12 / f.preco : null;
    f.var_ano = okp && okn(f.preco_inicio_ano) ? f.preco / f.preco_inicio_ano - 1 : null;
    f.tr_ano = okp && okn(f.preco_inicio_ano) ? (f.preco + f.div_ano) / f.preco_inicio_ano - 1 : null;
    f.tr12 = okp && okn(f.preco_12m) ? (f.preco + f.soma12) / f.preco_12m - 1 : null;
    ['causas', 'acompanhar', 'sinais', 'impactos', 'fatores', 'ativos', 'eventos', 'perguntas', 'fontes'].forEach(k => f[k] = arr(f[k]));
    f.ticker = String(f.ticker || '').toUpperCase();
    return f;
  });
  byT = Object.fromEntries(FM.map(f => [f.ticker, f]));
  const U = D.universo || {};
  UT = new Set(arr(U.tickers).map(t => String(t).toUpperCase()));
  FORA = Object.fromEntries(arr(U.fora_escopo).map(x => [String(x.ticker).toUpperCase(), x.motivo]));
  NLOC = new Set(arr(U.nao_localizados).map(t => String(t).toUpperCase()));
  PEND = new Set(arr(U.pendentes).map(t => String(t).toUpperCase()));
  DESC = Object.fromEntries(arr(U.descartados).map(x => [String(x.ticker).toUpperCase(), x.motivo]));
  GL = new Map(arr(pacote.gloss)); arr(D.glossario_extra).forEach(([k, v]) => GL.set(k, v));
  REF = D.referenciais || {};
}
const R = k => { const r = REF[k] || {}; return { ano: okn(r.ano) ? r.ano / 100 : null, doze: okn(r.doze) ? r.doze / 100 : null, fonte: r.fonte }; };

// ---------- visão unificada de um ticker ----------
function base(t) { const m = /^([A-Z]{4})1[2-5]$/.exec(t); return m && !A(t) && !byT[t] ? m[1] + '11' : t; }
function info(t) {
  t = base(String(t).toUpperCase());
  const a = A(t), m = byT[t] || null;
  const nivel = m ? m.nivel : a ? a.nivel : null;
  return { t, a, m, nivel, nome: m ? m.nome : a ? a.nome : '', seg: m ? m.setor : a ? a.seg : '' };
}
const conhecido = t => { const i = info(t); return !!(i.a || i.m || UT.has(i.t) || FORA[i.t]); };

// ---------- documentos (Fundos.NET) ----------
const FNET = 'https://fnet.bmfbovespa.com.br/fnet/publico/';
const linkDoc = id => `${FNET}exibirDocumento?id=${encodeURIComponent(id)}&cvm=true`;
const linkFundo = cnpj => `${FNET}abrirGerenciadorDocumentosCVM?cnpjFundo=${encodeURIComponent(cnpj)}`;
const rotDoc = d => [d.cat, /Não Considerados Fatos/i.test(d.tipo) ? '' : d.tipo, d.esp].filter((x, i, l) => x && l.indexOf(x) === i && !(i && l[0].includes(x))).join(' · ');
function avisosHtml(a) {
  if (!a || !a.avisos.length) return '';
  return `<div class="pontos">${a.avisos.map(x => `<a class="p aviso" href="${linkDoc(x.d.id)}" target="_blank" rel="noopener"><span>📄</span><span>${esc(x.txt)} <b>Abrir ›</b></span></a>`).join('')}</div>`;
}
function docsHtml(a) {
  if (!a) return '';
  const L = a.docs;
  const todos = a.cnpj ? `<a href="${linkFundo(a.cnpj)}" target="_blank" rel="noopener">Ver todos os documentos no Fundos.NET ›</a>` : '';
  if (!L.length) return `<div><h4>📄 Comunicados e assembleias (Fundos.NET)</h4><p class="note" style="margin:0">Nenhum fato relevante, comunicado ou assembleia nos últimos 150 dias. ${todos}</p></div>`;
  return `<div><h4>📄 Comunicados e assembleias (Fundos.NET, últimos 150 dias)</h4>
    <div class="table-wrap"><table><tbody>${L.map(d => `<tr><td style="white-space:nowrap">${fmtDate(d.data)}</td><td><b>${esc(rotDoc(d))}</b>${d.inf ? `<div class="note" style="margin:0">${esc(d.inf)}</div>` : ''}</td><td class="n"><a href="${linkDoc(d.id)}" target="_blank" rel="noopener">abrir</a></td></tr>`).join('')}</tbody></table></div>
    <p class="note" style="margin:6px 0 0">${todos}</p></div>`;
}

// ---------- cartões ----------
function metricas(i) {
  const a = i.a, m = i.m, g = k => a && okn(a[k]) ? a[k] : m && okn(m[k]) ? m[k] : null;
  return `<div class="mm"><div>P/VP<b>${n2(g('pvp'))}</b></div><div>DY 12m<b>${fp(g('dy12'))}</b></div><div>Var. ano<b class="${cl(g('var_ano'))}">${fs(g('var_ano'))}</b></div><div>Últ. rend.<b>${rs(g('ult'))}</b></div></div>`;
}
function pontos(crit, bom, maxC = 3, maxB = 2) {
  return `<div class="pontos">${crit.slice(0, maxC).map(s => `<div class="p crit"><span>⚠</span><span>${esc(s)}</span></div>`).join('')}${bom.slice(0, maxB).map(s => `<div class="p bom"><span>✓</span><span>${esc(s)}</span></div>`).join('')}</div>`;
}
function cartao(t) {
  const i = info(t);
  if (!i.a && !i.m) return nota(i.t);
  let corpo;
  if (i.m) {
    const bom = [i.m.positivo, ...(i.a ? i.a.bom : [])].filter(Boolean);
    const extra = i.a && i.a.crit.length ? `<div class="nx">Sinais automáticos de hoje: ${i.a.crit.length} crítico(s), ${i.a.bom.length} bom(ns).</div>` : '';
    corpo = `<div class="rs">${esc(i.m.resumo)}</div>${pontos(i.m.sinais, bom)}${extra}`;
  } else corpo = (i.a.crit.length || i.a.bom.length ? pontos(i.a.crit, i.a.bom, 4, 3) : '<div class="nx">Sem sinais suficientes nos dados disponíveis.</div>') + notaManual(i.t);
  const nx = i.m ? i.m.eventos.slice().sort((a, b) => String(a.ordem || '9').localeCompare(String(b.ordem || '9')))[0] : null;
  return `<article class="fcard ${esc(i.nivel)}">
    <div class="topo"><div><span class="tk">${esc(i.t)}</span>${i.m ? `<span class="fonte man">Manual ${esc(ED)}</span>${mud(i.m.mudanca)}` : '<span class="fonte">Automático</span>'}</div>${lv(i.nivel)}</div>
    <div class="nm">${esc(i.nome)}${i.seg ? ' · ' + esc(i.seg) : ''}</div>
    ${corpo}
    ${avisosHtml(i.a)}
    ${metricas(i)}
    ${nx ? `<div class="nx"><b>Próximo evento:</b> ${esc(nx.prazo)} — ${esc(nx.evento)}</div>` : ''}
    <div><button class="sm" data-open="${esc(i.t)}">${i.m ? 'Ver análise completa' : 'Ver detalhes'}</button></div>
  </article>`;
}
function notaManual(t) {
  if (!MAN || byT[t]) return '';
  if (DESC[t]) return `<div class="nx">📘 <b>Manual (${esc(ED)}):</b> sinal verificado e descartado. ${esc(DESC[t])}</div>`;
  if (UT.has(t)) return `<div class="nx">📘 <b>Manual (${esc(ED)}):</b> analisado sem ponto de atenção relevante.</div>`;
  if (FORA[t]) return `<div class="nx">📘 <b>Manual:</b> fora do escopo (${esc(FORA[t])}).</div>`;
  return '';
}
function nota(t) {
  t = base(t);
  const msg = FORA[t] ? `fora do escopo do manual (${esc(FORA[t])}).`
    : NLOC.has(t) ? 'não foi localizado na B3 nem na CVM.'
    : 'não encontrado entre os FIIs listados com dados na CVM e cotação recente. Pode ser um Fiagro, um fundo não listado ou um ticker digitado errado.';
  return `<div class="nota cinza"><span class="tk" style="font-size:15px">${esc(t)}</span> — ${msg}</div>`;
}

// ---------- detalhes ----------
function blocoAuto(a) {
  const r = a._r.slice(0, 12).reverse(), max = Math.max(...r.map(x => x.v), 0.0001);
  const ri = IFIX || {};
  return `<div class="det">
    <div class="mg">
      <div>Cotação<b>${rs(a.p)}</b></div><div>VP/cota (${mlab(a.vp_ref)})<b>${rs(a.vp)}</b></div><div>P/VP<b>${n2(a.pvp)}</b></div>
      <div>DY 12m<b>${fp(a.dy12)}</b></div><div>Último rend.<b>${rs(a.ult)}</b></div><div>Média 6m ant.<b>${rs(a.med6)}</b></div>
      <div>Var. no ano<b class="${cl(a.var_ano)}">${fs(a.var_ano)}</b></div><div>Var. 12m<b class="${cl(a.var12)}">${fs(a.var12)}</b></div>
      <div>Retorno 12m<b class="${cl(a.tr12)}">${fs(a.tr12)}</b></div><div>VP 12m<b class="${cl(a.varVp)}">${fs(a.varVp)}</b></div>
      <div>Patrimônio<b>${mi(a.pl)}</b></div><div>Cotistas<b>${n0(a.cot)}</b></div><div>Liquidez/dia<b>${mi(a.vol)}</b></div>
    </div>
    ${r.length ? `<div><h4>Rendimentos por cota (mês da data-com)</h4><div class="rbar">${r.map(x => `<div class="${okn(a.med6) && x === r[r.length - 1] && a.varRend <= -0.1 ? 'corte' : ''}" style="height:${Math.max(2, x.v / max * 100)}%" title="${mlab(x.m)}: ${rs(x.v)}"></div>`).join('')}</div><div class="rlab">${r.map(x => `<span>${mlab(x.m).split('/')[0]}</span>`).join('')}</div></div>` : ''}
    <div class="table-wrap"><table><thead><tr><th>Período</th><th class="n">Fundo (aprox.)</th><th class="n">IFIX</th><th class="n">Diferença</th></tr></thead><tbody>
      <tr><td>No ano</td><td class="n">${fs(a.tr_ano)}</td><td class="n">${fs(ri.ano)}</td><td class="n">${okn(a.tr_ano) && okn(ri.ano) ? fpp(a.tr_ano - ri.ano) : '—'}</td></tr>
      <tr><td>12 meses</td><td class="n">${fs(a.tr12)}</td><td class="n">${fs(ri.r12)}</td><td class="n">${okn(a.tr12) && okn(ri.r12) ? fpp(a.tr12 - ri.r12) : '—'}</td></tr></tbody></table></div>
    <p class="note" style="margin:0">${esc(a.nome)} · Segmento (CVM): ${esc(a.seg || '—')} · Gestão: ${esc(a.gestao || '—')} · Administrador: ${esc((a.adm || '—').replace(/\.$/, ''))}. Retorno aproximado = (cotação + rendimentos) ÷ cotação inicial − 1, sem reinvestimento. Rendimentos podem incluir amortizações.</p>
  </div>`;
}
function completoManual(f) {
  const ri = R('ifix'), rc = R('cdi'), rp = R('poupanca');
  const dif = (a, b) => okn(a) && okn(b) ? fpp(a - b) : '—';
  const sec = (h, x) => x ? `<div><h4>${h}</h4><p>${esc(x)}</p></div>` : '';
  const bom = [];
  if (f.positivo) bom.push(f.positivo);
  if (f.cobertura_ok === true) bom.push('Último rendimento coberto pelo resultado: ' + (f.cobertura || ''));
  if (f.melhorar) bom.push('Pode melhorar com: ' + f.melhorar);
  const fat = f.fatores.map((x, i) => `<div class="fator"><div class="ev">${i + 1}. ${esc(x.evento)}</div><dl><dt>Ativos envolvidos</dt><dd>${esc(x.ativos)}</dd><dt>Impacto</dt><dd>${esc(x.impacto)}</dd><dt>Natureza</dt><dd>${esc(x.natureza)}</dd><dt>Continua presente?</dt><dd>${esc(x.presente)}</dd></dl></div>`).join('');
  const ativos = f.ativos.map(a => `<div class="ativo"><div class="an">${esc(a.nome)}</div><div class="ae">${esc(a.peso_txt || '—')}</div><div>${esc(a.situacao)}. <i>${esc(a.motivo)}.</i></div></div>`).join('');
  const evs = f.eventos.slice().sort((a, b) => String(a.ordem || '9').localeCompare(String(b.ordem || '9'))).map(e => `<li><div class="pz">${esc(e.prazo)}</div><div><b>${esc(e.evento)}</b></div>${e.melhora ? `<div class="up">▲ ${esc(e.melhora)}</div>` : ''}${e.piora ? `<div class="dn">▼ ${esc(e.piora)}</div>` : ''}</li>`).join('');
  const perf = `<div class="table-wrap"><table><thead><tr><th>Período</th><th class="n">Fundo (aprox.)</th><th class="n">IFIX</th><th class="n">CDI</th><th class="n">Poupança</th><th class="n">Dif. vs IFIX</th></tr></thead><tbody>
    <tr><td>No ano</td><td class="n">${fs(f.tr_ano)}</td><td class="n">${fs(ri.ano)}</td><td class="n">${fs(rc.ano)}</td><td class="n">${fs(rp.ano)}</td><td class="n">${dif(f.tr_ano, ri.ano)}</td></tr>
    <tr><td>12 meses</td><td class="n">${fs(f.tr12)}</td><td class="n">${fs(ri.doze)}</td><td class="n">${fs(rc.doze)}</td><td class="n">${fs(rp.doze)}</td><td class="n">${dif(f.tr12, ri.doze)}</td></tr></tbody></table></div>`;
  const fontes = `<div class="table-wrap"><table><thead><tr><th>Informação</th><th>Documento</th><th>Fonte</th><th>Data</th><th>Tipo</th><th></th></tr></thead><tbody>${f.fontes.map(s => `<tr><td>${esc(s.info)}</td><td>${esc(s.doc)}</td><td>${esc(s.fonte)}</td><td>${esc(s.data)}</td><td>${esc(s.tipo)}</td><td>${s.link && /^https?:/i.test(s.link) ? `<a href="${esc(s.link)}" target="_blank" rel="noopener">abrir</a>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
  return `<div class="det">
    <p class="note" style="margin:0">Análise do Manual de FIIs em atenção, edição ${esc(ED)} · Gestora: ${esc(f.gestor)} · Administradora: ${esc(f.administradora)} · Classificação: ${esc(f.classificacao)} · Taxa: ${esc(f.taxa_resumo || '—')} · Atualização: ${esc(f.atualizacao)}</p>
    <div class="dois">
      <div class="caixa crit"><h4>⚠ Pontos críticos</h4><ul>${li(f.sinais)}</ul></div>
      <div class="caixa bom"><h4>✓ Pontos bons</h4>${bom.length ? `<ul>${li(bom)}</ul>` : '<p>Nenhum ponto positivo destacado pela análise.</p>'}</div>
    </div>
    <div><h4>O que aconteceu</h4><p>${esc(f.acontecido)}</p></div>
    <div><h4>Por que aconteceu</h4><ol>${li(f.causas)}</ol></div>
    ${fat ? `<div><h4>O que explicou o resultado</h4><div style="display:grid;gap:8px">${fat}</div></div>` : ''}
    <div><h4>Ativos envolvidos</h4>${ativos || '<p>Abertura da carteira não divulgada com detalhe suficiente.</p>'}</div>
    <div class="dois"><div><h4>Como afetou o fundo</h4><ul>${li(f.impactos)}</ul></div><div><h4>Para quem tem o fundo</h4><p>${esc(f.para_quem_tem)}</p></div></div>
    <div><h4>O que acompanhar</h4><ul>${li(f.acompanhar)}</ul></div>
    ${evs ? `<div><h4>Próximos eventos</h4><ul class="evl">${evs}</ul></div>` : ''}
    <div class="caixa explica"><h4>Como explicar ao cliente</h4><p>${esc(f.explicar)}</p></div>
    <details><summary>Se o cliente perguntar</summary><ul class="qa" style="margin-top:10px">${f.perguntas.map(x => `<li><div class="q">${esc(x.q)}</div><div>${esc(x.a)}</div></li>`).join('')}</ul>${f.nao_dizer ? `<p class="note"><b>O que não dizer:</b> ${esc(f.nao_dizer)}</p>` : ''}</details>
    <details><summary>Detalhes técnicos do manual</summary><div class="det" style="margin-top:10px">
      ${sec('Cobertura do último rendimento', f.cobertura)}${sec('Leitura do P/VP', f.leitura_pvp)}${sec('Sustentabilidade do rendimento', f.sustentabilidade)}
      <div><h4>Classificação da causa</h4><p>Origem: ${esc(f.origem)} · Natureza: ${esc(f.natureza)} · Impacto: ${esc(f.refletido)}</p></div>
      ${sec('Taxas', f.taxa)}<div><h4>Retorno aproximado × referenciais (na data do manual)</h4>${perf}</div></div></details>
    ${f.fontes.length ? `<details><summary>Fontes do manual</summary><div style="margin-top:10px">${fontes}</div></details>` : ''}
  </div>`;
}
function abrirFundo(t) {
  const i = info(t); if (!i.a && !i.m) return;
  $('dlgT').innerHTML = `<span class="tk">${esc(i.t)}</span> <span style="font-weight:600;font-size:16px">· ${esc(i.nome)}</span> ${lv(i.nivel)}${i.m ? mud(i.m.mudanca) : ''}`;
  let html = '';
  if (i.a && (i.a.docs.length || i.a.cnpj)) html += `<div class="det" style="margin-bottom:14px">${avisosHtml(i.a)}${docsHtml(i.a)}</div>`;
  if (i.m) html += completoManual(i.m);
  if (i.a) {
    const caixas = `<div class="dois"><div class="caixa crit"><h4>⚠ Pontos críticos (automático)</h4>${i.a.crit.length ? `<ul>${li(i.a.crit)}</ul>` : '<p>Nenhum sinal crítico nos indicadores.</p>'}</div><div class="caixa bom"><h4>✓ Pontos bons (automático)</h4>${i.a.bom.length ? `<ul>${li(i.a.bom)}</ul>` : '<p>Nenhum ponto bom destacado nos indicadores.</p>'}</div></div>`;
    const cab = `<p class="note" style="margin:0 0 10px">Indicadores de hoje calculados automaticamente com dados da CVM (informe de ${mlab(i.a.vp_ref)}) e da B3. São sinais objetivos para investigar, não uma análise do fundo.</p>`;
    const nm = notaManual(i.t);
    html += i.m ? `<details style="margin-top:14px" open><summary>Indicadores automáticos de hoje</summary><div class="det" style="margin-top:10px">${cab}${caixas}${blocoAuto(i.a)}</div></details>` : `<div class="det">${cab}${nm}${caixas}${blocoAuto(i.a)}</div>`;
  }
  $('dlgB').innerHTML = html;
  $('dlgFii').hidden = false; $('dlgFii').querySelector('.modal').scrollTop = 0;
  document.body.style.overflow = 'hidden';
}
function fecharFundo() { $('dlgFii').hidden = true; document.body.style.overflow = ''; }
$('dlgX').onclick = fecharFundo;
$('dlgFii').addEventListener('click', e => { if (e.target.id === 'dlgFii') fecharFundo(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('dlgFii').hidden) fecharFundo(); });
document.addEventListener('click', e => { const b = e.target.closest('[data-open]'); if (b) abrirFundo(b.dataset.open); });

// ---------- abas ----------
let ABAS = [];
function mostrar(id) {
  if (!ABAS.some(a => a[0] === id)) id = 'busca';
  ['busca', 'carteira', 'temas', 'agenda', 'sobre'].forEach(a => $('p-' + a).classList.toggle('on', a === id));
  $('abas').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.a === id));
  history.replaceState(null, '', '#' + id);
}
$('abas').addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (b) mostrar(b.dataset.a); });

// ---------- 1. busca ----------
const escolhidos = [];
function todosTickers() { return [...new Set([...Object.keys(AUTO), ...Object.keys(byT)])]; }
function montarBusca() {
  const T = todosTickers(), I = T.map(info);
  const segs = [...new Set(I.map(i => i.seg).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const cont = k => I.filter(i => i.nivel === k).length;
  $('p-busca').innerHTML = `
    <div class="kpis" style="margin-bottom:14px">
      <div class="kpi"><div class="l">FIIs acompanhados</div><div class="v">${n0(T.length)}</div></div>
      <div class="kpi"><div class="l">Atenção elevada</div><div class="v neg">${cont('elevada')}</div></div>
      <div class="kpi"><div class="l">Atenção moderada</div><div class="v" style="color:var(--warn)">${cont('moderada')}</div></div>
      <div class="kpi"><div class="l">Sem alerta</div><div class="v pos">${cont('ok')}</div></div>
    </div>
    <div class="card">
      <div class="busca-f"><input id="q" type="search" autocomplete="off" placeholder="Digite o ticker ou o nome do FII (ex.: HGLG11) e tecle Enter. Dá para colar vários."><div class="sug" id="sug"></div></div>
      <div class="chips" id="chips"></div>
      <div class="filtros">
        <label class="f">Nível<select id="fNivel"><option value="">Com alerta (elevada e moderada)</option><option value="elevada">Atenção elevada</option><option value="moderada">Atenção moderada</option><option value="ok">Sem alerta</option><option value="todos">Todos</option></select></label>
        <label class="f">Segmento<select id="fSeg"><option value="">Todos</option>${segs.map(s => `<option>${esc(s)}</option>`).join('')}</select></label>
        <label class="f">Origem<select id="fOrig"><option value="">Todas</option><option value="man">Só os do manual</option><option value="auto">Só automáticos</option></select></label>
        <label class="f">Ordenar por<select id="fOrd"><option value="nivel">Nível de atenção</option><option value="vol">Liquidez</option><option value="dy">DY 12m</option><option value="pvp">P/VP (menor)</option><option value="t">Ticker</option></select></label>
      </div>
    </div>
    <p class="note" id="cont"></p>
    <div id="res"></div>`;
  const q = $('q'), sg = $('sug');
  const v = id => $(id).value;
  const passa = i => {
    const n = v('fNivel');
    if (n === '' && i.nivel === 'ok') return false;
    if (n && n !== 'todos' && i.nivel !== n) return false;
    if (v('fSeg') && i.seg !== v('fSeg')) return false;
    if (v('fOrig') === 'man' && !i.m) return false;
    if (v('fOrig') === 'auto' && i.m) return false;
    return true;
  };
  const ordem = (x, y) => {
    const o = v('fOrd'), g = (i, k) => i.a && okn(i.a[k]) ? i.a[k] : null;
    if (o === 'vol') return (g(y, 'vol') || 0) - (g(x, 'vol') || 0);
    if (o === 'dy') return (g(y, 'dy12') || 0) - (g(x, 'dy12') || 0);
    if (o === 'pvp') return (g(x, 'pvp') ?? 9) - (g(y, 'pvp') ?? 9);
    if (o === 't') return x.t.localeCompare(y.t);
    return (NORD[x.nivel] ?? 9) - (NORD[y.nivel] ?? 9) || (!!y.m - !!x.m) || ((y.a ? y.a.crit.length : 0) - (x.a ? x.a.crit.length : 0)) || ((g(y, 'vol') || 0) - (g(x, 'vol') || 0));
  };
  let limite = 60;
  function desenhar() {
    $('chips').innerHTML = escolhidos.map(t => `<span class="chip">${esc(t)}<button type="button" data-rm="${esc(t)}" aria-label="Remover">×</button></span>`).join('') + (escolhidos.length ? `<button class="sm ghost" id="chipsX" type="button">Limpar seleção</button>` : '');
    if (escolhidos.length) {
      $('res').innerHTML = `<div class="fgrid">${escolhidos.map(cartao).join('')}</div>`;
      $('cont').textContent = `${escolhidos.length} fundo(s) selecionado(s).`;
      return;
    }
    const L = I.filter(passa).sort(ordem);
    $('res').innerHTML = L.length ? `<div class="fgrid">${L.slice(0, limite).map(i => cartao(i.t)).join('')}</div>${L.length > limite ? `<div style="text-align:center;margin-top:14px"><button class="secondary" id="mais">Mostrar mais (${L.length - limite})</button></div>` : ''}` : '<div class="nota cinza">Nenhum fundo com esses filtros.</div>';
    $('cont').textContent = `${L.length} fundo(s) com esses filtros. Busque um ticker para ver qualquer FII.`;
  }
  function add(t) { t = String(t || '').trim().toUpperCase(); if (!t) return; if (!escolhidos.includes(t)) escolhidos.push(t); q.value = ''; sg.classList.remove('on'); desenhar(); }
  let hi = -1;
  function sugerir() {
    const s = q.value.trim().toUpperCase(); hi = -1;
    if (!s) { sg.classList.remove('on'); return; }
    const ss = semAc(s);
    const o = I.filter(i => i.t.includes(s) || semAc(i.nome).includes(ss)).sort((x, y) => (y.t.startsWith(s) - x.t.startsWith(s)) || x.t.localeCompare(y.t)).slice(0, 10);
    sg.innerHTML = o.length ? o.map(i => `<button type="button" data-add="${esc(i.t)}"><span><b>${esc(i.t)}</b> <span class="sn">${esc(i.nome)}</span></span><span class="sn">${esc(NIVEL[i.nivel] || '')}</span></button>`).join('')
      : `<button type="button" data-add="${esc(s)}"><span><b>${esc(s)}</b></span><span class="sn">buscar mesmo assim</span></button>`;
    sg.classList.add('on');
  }
  q.addEventListener('input', sugerir);
  q.addEventListener('keydown', e => {
    const bs = sg.querySelectorAll('button');
    if (e.key === 'ArrowDown') { e.preventDefault(); hi = Math.min(bs.length - 1, hi + 1); bs.forEach((b, i) => b.classList.toggle('hi', i === hi)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); hi = Math.max(0, hi - 1); bs.forEach((b, i) => b.classList.toggle('hi', i === hi)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const toks = q.value.toUpperCase().match(/\b[A-Z]{4}\d{2}\b/g) || [];
      if (hi >= 0 && bs[hi]) add(bs[hi].dataset.add); else if (toks.length) toks.forEach(add); else if (bs[0]) add(bs[0].dataset.add);
    } else if (e.key === 'Escape') sg.classList.remove('on');
  });
  q.addEventListener('paste', () => setTimeout(() => { const toks = q.value.toUpperCase().match(/\b[A-Z]{4}\d{2}\b/g) || []; if (toks.length > 1) toks.forEach(add); }, 0));
  sg.addEventListener('mousedown', e => { const b = e.target.closest('[data-add]'); if (b) { e.preventDefault(); add(b.dataset.add); } });
  q.addEventListener('blur', () => setTimeout(() => sg.classList.remove('on'), 150));
  $('p-busca').addEventListener('click', e => {
    const r = e.target.closest('[data-rm]'); if (r) { escolhidos.splice(escolhidos.indexOf(r.dataset.rm), 1); desenhar(); }
    if (e.target.id === 'chipsX') { escolhidos.length = 0; desenhar(); }
    if (e.target.id === 'mais') { limite += 60; desenhar(); }
  });
  $('p-busca').querySelectorAll('select').forEach(s => s.addEventListener('change', () => { limite = 60; desenhar(); }));
  desenhar();
}

// ---------- 2. carteira do cliente ----------
let CART = null;   // { cliente, conta, patrimonio, pos: [{ticker, nome, saldo, pct, rentMes, rentAno}], naoListados: [...] }
function montarCarteira() {
  $('p-carteira').innerHTML = `
    <div style="display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">
      <div class="card" style="margin:0">
        <h2 style="margin-top:0">📄 XPerformance do cliente</h2>
        <p class="note" style="margin-top:0">O site encontra os FIIs da carteira, com saldo e rentabilidade, e mostra os pontos críticos e bons de cada um.</p>
        <div class="drop" id="dropXp"><div class="big">📄</div><div><b>Anexar XPerformance (PDF)</b></div><input type="file" id="fileXp" accept="application/pdf,.pdf" hidden></div>
        <div id="infoXp" style="margin-top:10px"></div>
      </div>
      <div class="card" style="margin:0">
        <h2 style="margin-top:0">⌨️ Ou digite os tickers</h2>
        <p class="note" style="margin-top:0">Um por linha, separados por vírgula ou colados de uma planilha.</p>
        <textarea id="cartTk" rows="5" placeholder="Ex.: HGLG11, KNRI11, MXRF11"></textarea>
      </div>
    </div>
    <div id="cartOut" style="margin-top:16px"></div>`;
  $('dropXp').onclick = () => $('fileXp').click();
  $('fileXp').onchange = e => { lerXp(e.target.files[0]); e.target.value = ''; };
  ['dragover', 'dragenter'].forEach(ev => $('dropXp').addEventListener(ev, e => { e.preventDefault(); $('dropXp').classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => $('dropXp').addEventListener(ev, e => { e.preventDefault(); $('dropXp').classList.remove('over'); }));
  $('dropXp').addEventListener('drop', e => lerXp(e.dataTransfer.files[0]));
  $('cartTk').addEventListener('input', () => {
    const T = [...new Set($('cartTk').value.toUpperCase().match(/\b[A-Z]{4}\d{2}\b/g) || [])];
    const antigo = CART && CART.cliente ? CART : null;
    CART = T.length ? { cliente: antigo ? antigo.cliente : '', patrimonio: antigo ? antigo.patrimonio : null, naoListados: antigo ? antigo.naoListados : [], pos: T.map(t => (antigo && antigo.pos.find(p => p.ticker === t)) || { ticker: t }) } : null;
    desenharCarteira();
  });
  desenharCarteira();
}
async function lerXp(file) {
  if (!file) return;
  $('infoXp').innerHTML = '<p class="note">⏳ Lendo o PDF…</p>';
  try {
    const r = await XPParser.parse(await file.arrayBuffer(), file.name);
    const pos = [], naoListados = [];
    (r.ativos || []).forEach(a => {
      if (/collar|fence|booster|call|put|estruturad/i.test(a.nome)) return;
      const m = String(a.nome).toUpperCase().match(/\b([A-Z]{4}1[1-5])\b/);
      const fiiNome = /\bFII\b|FIAGRO|IMOBILI/i.test(a.nome);
      if (m && (conhecido(m[1]) || a.classe === 'fl' || fiiNome)) {
        const t = m[1], ex = pos.find(p => p.ticker === t);
        if (ex) { ex.saldo += a.saldo || 0; ex.pct += a.pct || 0; } else pos.push({ ticker: t, nome: a.nome, saldo: a.saldo || 0, pct: a.pct || 0, rentMes: a.rentMes, rentAno: a.rentAno });
      } else if (fiiNome) naoListados.push({ nome: a.nome, saldo: a.saldo || 0 });
    });
    CART = { cliente: r.cliente || '', patrimonio: r.patrimonio, pos, naoListados };
    $('cartTk').value = pos.map(p => p.ticker).join(', ');
    $('infoXp').innerHTML = `<span class="pill good">✓ ${esc(r.cliente || file.name)}</span> <span class="note">conta ${esc(r.conta || '—')} · ${pos.length} FII(s) listado(s)${naoListados.length ? ` · ${naoListados.length} fundo(s) não listado(s)` : ''}</span>`;
  } catch (e) { $('infoXp').innerHTML = `<p class="note bad">❌ Não consegui ler o PDF: ${esc(e.message)}</p>`; CART = null; }
  desenharCarteira();
}
function classificar() {
  const att = [], sem = [], outros = [];
  CART.pos.forEach(p => { const i = info(p.ticker); p.i = i; if (!i.a && !i.m) outros.push(p); else if (i.nivel === 'ok') sem.push(p); else att.push(p); });
  att.sort((x, y) => (NORD[x.i.nivel] ?? 9) - (NORD[y.i.nivel] ?? 9) || (y.saldo || 0) - (x.saldo || 0));
  return { att, sem, outros };
}
function desenharCarteira() {
  const out = $('cartOut'); if (!out) return;
  if (!CART || (!CART.pos.length && !CART.naoListados.length)) { out.innerHTML = '<div class="nota cinza">Os FIIs do cliente aparecem aqui assim que você anexar o XPerformance ou digitar os tickers.</div>'; return; }
  const { att, sem, outros } = classificar();
  const temSaldo = CART.pos.some(p => okn(p.saldo) && p.saldo > 0);
  const tot = CART.pos.reduce((s, p) => s + (p.saldo || 0), 0), soma = L => L.reduce((s, p) => s + (p.saldo || 0), 0);
  const kv = L => temSaldo ? `<div class="s">${brl(soma(L))}${tot ? ` · ${pct(soma(L) / tot * 100, 1)} dos FIIs` : ''}</div>` : '';
  const nE = att.filter(p => p.i.nivel === 'elevada'), nM = att.filter(p => p.i.nivel === 'moderada');
  const linhaT = p => {
    const i = p.i, a = i.a;
    const sit = i.a || i.m ? `<button class="linkchip ${esc(i.nivel)}" data-open="${esc(i.t)}">${NIVEL[i.nivel]} ›</button>` : '<span class="lv cinza">Sem dados</span>';
    return `<tr><td><b>${esc(p.ticker)}</b>${i.nome ? `<div class="note" style="margin:0">${esc(i.nome)}</div>` : ''}</td>${temSaldo ? `<td class="n">${brl(p.saldo)}</td><td class="n">${okn(p.pct) ? pct(p.pct, 2) : '—'}</td><td class="n ${okn(p.rentAno) ? (p.rentAno < 0 ? 'neg' : 'pos') : ''}">${okn(p.rentAno) ? pct(p.rentAno) : '—'}</td>` : ''}<td class="n">${a ? n2(a.pvp) : '—'}</td><td class="n">${a ? fp(a.dy12) : '—'}</td><td>${sit}</td></tr>`;
  };
  out.innerHTML = `
    <div class="kpis" style="margin-bottom:14px">
      <div class="kpi"><div class="l">FIIs na carteira</div><div class="v">${CART.pos.length}</div>${temSaldo ? `<div class="s">${brl(tot)}${okn(CART.patrimonio) && CART.patrimonio ? ` · ${pct(tot / CART.patrimonio * 100, 1)} do patrimônio` : ''}</div>` : ''}</div>
      <div class="kpi"><div class="l">Atenção elevada</div><div class="v neg">${nE.length}</div>${kv(nE)}</div>
      <div class="kpi"><div class="l">Atenção moderada</div><div class="v" style="color:var(--warn)">${nM.length}</div>${kv(nM)}</div>
      <div class="kpi"><div class="l">Sem alerta</div><div class="v pos">${sem.length}</div>${kv(sem)}</div>
    </div>
    <div class="row" style="margin-bottom:14px"><button id="cartEmail">✉️ E-mail ao cliente</button><button class="secondary" id="cartCopia">Copiar resumo</button></div>
    <div class="card"><h3 style="margin-top:0">FIIs na carteira${CART.cliente ? ` de ${esc(CART.cliente)}` : ''}</h3><div class="table-wrap"><table class="tbl-fii"><thead><tr><th>Fundo</th>${temSaldo ? '<th class="n">Saldo</th><th class="n">% carteira</th><th class="n">Rent. ano</th>' : ''}<th class="n">P/VP</th><th class="n">DY 12m</th><th>Situação</th></tr></thead><tbody>
      ${[...att, ...sem, ...outros].map(linhaT).join('')}</tbody></table></div></div>
    ${att.length ? `<h3>Precisam de atenção</h3><div class="fgrid">${[...new Set(att.map(p => p.i.t))].map(cartao).join('')}</div>` : '<div class="nota ok">Nenhum FII da carteira tem alerta neste momento.</div>'}
    ${sem.length ? `<h3 style="margin-top:18px">Sem alerta</h3><div class="fgrid">${[...new Set(sem.map(p => p.i.t))].map(cartao).join('')}</div>` : ''}
    ${outros.length ? `<h3 style="margin-top:18px">Sem dados</h3><div class="fgrid">${outros.map(p => nota(p.ticker)).join('')}</div>` : ''}
    ${CART.naoListados.length ? `<div class="nota cinza" style="margin-top:14px"><b>Fundos não listados na bolsa</b> (sem cotação nem dados diários): ${CART.naoListados.map(n => `${esc(n.nome)} (${brl(n.saldo)})`).join('; ')}.</div>` : ''}`;
  $('cartCopia').onclick = () => copyText(textoResumo());
  $('cartEmail').onclick = emailCliente;
}
const explicacao = i => i.m ? i.m.explicar : i.a ? 'Pontos que estou acompanhando: ' + i.a.forte.map(s => s.replace(/\.$/, '')).join('; ') + '.' : '';
const vaiNoEmail = i => !!(i.m || (i.a && i.a.forte.length && !DESC[i.t]));
function textoResumo() {
  const { att, sem, outros } = classificar();
  const L = [`FIIs da carteira${CART.cliente ? ` de ${CART.cliente}` : ''} · ${new Date().toLocaleDateString('pt-BR')}`, ''];
  ['elevada', 'moderada'].forEach(n => {
    const x = [...new Set(att.filter(p => p.i.nivel === n).map(p => p.i.t))];
    if (x.length) { L.push(NIVEL[n] + ':'); x.forEach(t => { const i = info(t); L.push(`- ${t} (${i.nome}): ${i.m ? i.m.resumo : i.a.crit.join(' ')}`); }); L.push(''); }
  });
  if (sem.length) { L.push('Sem alerta: ' + sem.map(p => p.ticker).join(', ')); L.push(''); }
  if (outros.length) { L.push('Sem dados: ' + outros.map(p => p.ticker).join(', ')); L.push(''); }
  L.push('Material informativo de apoio ao assessor. Não constitui recomendação de investimento.');
  return L.join('\n');
}
function emailCliente() {
  const { att, sem } = classificar(), h = Email.h;
  const fundos = [...new Set(att.map(p => p.i.t))].map(info).filter(vaiNoEmail);
  const outrosOk = [...sem, ...att.filter(p => !vaiNoEmail(p.i))];
  const nome = (CART.cliente || '').split(/\s+/)[0] || '';
  const abre = fundos.length ? 'Revisei os fundos imobiliários da sua carteira e quero te atualizar sobre alguns deles:' : 'Revisei os fundos imobiliários da sua carteira e, neste momento, nenhum deles apresenta ponto de atenção relevante.';
  const demais = outrosOk.length && fundos.length ? `Os demais fundos (${outrosOk.map(p => p.ticker).join(', ')}) seguem sem ponto de atenção relevante.` : '';
  Email.abrir({
    assunto: 'Seus fundos imobiliários: pontos de atenção', nome,
    texto: (n, ass) => [Email.saudacaoTexto(n), '', abre, '', ...fundos.flatMap(i => [`${i.t} (${i.nome})`, explicacao(i), '']), demais, demais ? '' : null, 'Fico à disposição para conversarmos sobre a sua carteira.', '', 'Abraço,', ass].filter(x => x !== null).join('\n'),
    html: (n, ass) => h.wrap(h.p(h.saudacao(n)) + h.p(abre) + fundos.map(i => h.titulo(`${esc(i.t)} · ${esc(i.nome)}`) + h.p(esc(explicacao(i)))).join('') + (demais ? h.p(esc(demais)) : '') +
      h.p('Fico à disposição para conversarmos sobre a sua carteira.') + h.p('Abraço,') + h.assinatura(ass) +
      h.rodape('Material informativo. Não constitui recomendação de investimento. Rentabilidade passada não é garantia de rentabilidade futura.')),
  });
}

// ---------- 3–5. abas do manual ----------
function montarTemas() {
  const T = arr(MAN.data.temas);
  $('p-temas').innerHTML = `<p class="lead">Do Manual de FIIs (edição ${esc(ED)}): o que explicou o resultado de vários fundos ao mesmo tempo.</p>
    ${T.length ? `<div class="temas">${T.map((t, i) => `<div class="card" style="margin:0"><h3 style="margin-top:0">${i + 1}. ${esc(t.titulo)}</h3><p style="margin:0 0 8px">${esc(t.descricao)}</p>
      <p class="note" style="margin:0 0 8px"><b>Natureza:</b> ${esc(t.natureza)} · <b>Continua presente?</b> ${esc(t.presente)}</p>
      <div>${arr(t.fundos).map(x => { const f = byT[String(x).toUpperCase()]; return f ? `<button class="linkchip ${esc(f.nivel)}" data-open="${esc(f.ticker)}">${esc(f.ticker)}</button>` : `<span class="linkchip">${esc(x)}</span>`; }).join('')}</div></div>`).join('')}</div>`
    : '<div class="nota cinza">Esta edição não tem temas preenchidos.</div>'}`;
}
function montarAgenda() {
  const ev = [];
  FM.forEach(f => f.eventos.forEach(e => ev.push(Object.assign({ t: f.ticker, nivel: f.nivel }, e))));
  ev.sort((a, b) => String(a.ordem || '9999').localeCompare(String(b.ordem || '9999')));
  const hoje = todayISO();
  $('p-agenda').innerHTML = `<p class="lead">Do Manual de FIIs: eventos dos fundos em atenção que podem mudar a análise.</p>
    <label class="check" style="margin-bottom:10px"><input type="checkbox" id="agFut" checked> Mostrar só a partir de hoje</label>
    <div class="table-wrap fixo"><table><thead><tr><th>Quando</th><th>Fundo</th><th>Evento</th><th>Sinal de melhora</th><th>Sinal de piora</th></tr></thead><tbody id="agBody"></tbody></table></div>`;
  const desenhar = () => {
    const L = $('agFut').checked ? ev.filter(e => !e.ordem || e.ordem >= hoje) : ev;
    $('agBody').innerHTML = L.length ? L.map(e => `<tr><td style="white-space:nowrap">${esc(e.prazo)}${e.ordem ? `<div class="note" style="margin:0">${fmtDate(e.ordem)}</div>` : ''}</td><td><button class="linkchip ${esc(e.nivel)}" data-open="${esc(e.t)}">${esc(e.t)}</button></td><td>${esc(e.evento)}</td><td class="up">${esc(e.melhora || '—')}</td><td class="dn">${esc(e.piora || '—')}</td></tr>`).join('')
      : '<tr><td colspan="5" class="note">Nenhum evento.</td></tr>';
  };
  $('agFut').onchange = desenhar; desenhar();
}
function montarSobre() {
  const regras = `<div class="card det"><h3 style="margin:0">Como os alertas automáticos são calculados</h3>
    <p class="note" style="margin-top:0">Indicadores de ${n0(Object.keys(AUTO).length)} FIIs listados, atualizados uma vez por dia${AUTO_META ? ` (última atualização: ${new Date(AUTO_META.gerado).toLocaleString('pt-BR')})` : ''}. Fontes: informe mensal da CVM (valor patrimonial, patrimônio, cotistas), Fundos.NET da B3 (fatos relevantes, comunicados, assembleias e relatório gerencial) e cotações da B3 via Yahoo Finance (preço, volume e rendimentos).</p>
    <div class="dois"><div class="caixa crit"><h4>⚠ Pontos críticos</h4><ul>
      <li>Rendimento 10% ou mais abaixo da média dos 6 meses anteriores.</li><li>Três meses ou mais sem rendimento.</li>
      <li>Valor patrimonial por cota 5% ou mais menor que 12 meses antes.</li><li>Retorno em 12 meses 15 p.p. ou mais abaixo do IFIX.</li>
      <li>P/VP abaixo de 0,70.</li><li>Liquidez abaixo de R$ 100 mil por dia (só informativo).</li></ul><p style="margin-top:8px"><b>📄 Avisos:</b> fato relevante nos últimos 45 dias e assembleia extraordinária convocada nos últimos 60 dias (Fundos.NET). Não mudam o nível: são para ler.</p></div>
    <div class="caixa bom"><h4>✓ Pontos bons</h4><ul><li>Rendimento estável ou subindo.</li><li>Valor patrimonial por cota estável ou subindo em 12 meses.</li><li>Retorno em 12 meses acima do IFIX.</li><li>Liquidez acima de R$ 3 milhões por dia.</li><li>Mais de 100 mil cotistas.</li></ul></div></div>
    <p class="note"><b>Sinais fortes:</b> corte ou falta de rendimento e queda do valor patrimonial. <b>Atenção elevada:</b> dois sinais fortes, ou um forte junto com os dois sinais de mercado (retorno muito abaixo do IFIX e P/VP abaixo de 0,70). <b>Moderada:</b> um sinal forte, ou os dois sinais de mercado juntos. O e-mail ao cliente usa só os sinais fortes. São sinais objetivos para investigar, não uma análise do fundo: não explicam o motivo. Rendimentos podem incluir amortizações. Fiagros e fundos não listados não estão na base.${IFIX ? ` IFIX: ${fs(IFIX.r12)} em 12 meses e ${fs(IFIX.ano)} no ano (${esc(IFIX.fonte)}).` : ''}</p></div>`;
  let man = '';
  if (MAN) {
    const D = MAN.data, U = D.universo || {}, fora = arr(U.fora_escopo), desc = arr(U.descartados);
    const refs = [['ifix', 'IFIX (retorno total)'], ['cdi', 'CDI'], ['poupanca', 'Poupança']];
    man = `<div class="card"><h3 style="margin-top:0">Manual de FIIs em atenção · edição ${esc(ED)}</h3>
        <p class="note" style="margin-top:0">Arquivo: ${esc(MAN.arquivo || '—')} · importado em ${new Date(MAN.importado).toLocaleString('pt-BR')} · fica salvo só neste navegador. Quando o fundo está no manual, a análise escrita aparece junto com os indicadores automáticos.</p>
        ${arr(D.resumo).map(([t, x]) => `<p style="margin:0 0 8px"><b>${esc(t)}:</b> ${esc(x)}</p>`).join('')}
        <button class="sm ghost" id="btnRemover" style="margin-top:6px">Remover o manual deste navegador</button></div>
      <div class="card"><h3 style="margin-top:0">Referenciais do manual</h3><div class="table-wrap"><table><thead><tr><th>Referencial</th><th class="n">No ano</th><th class="n">12 meses</th><th>Fonte</th></tr></thead><tbody>
        ${refs.map(([k, nm]) => { const r = R(k); return `<tr><td>${nm}</td><td class="n">${fs(r.ano)}</td><td class="n">${fs(r.doze)}</td><td class="note">${esc(r.fonte || '')}</td></tr>`; }).join('')}</tbody></table></div></div>
      ${desc.length ? `<details class="card"><summary>Sinal verificado e descartado no manual (${desc.length})</summary><div class="table-wrap" style="margin-top:10px"><table><tbody>${desc.map(d => `<tr><td><b>${esc(d.ticker)}</b></td><td>${esc(d.motivo)}</td></tr>`).join('')}</tbody></table></div></details>` : ''}
      ${arr(D.limitacoes).length ? `<details class="card"><summary>Limitações do manual</summary><ul style="margin-top:10px">${li(D.limitacoes)}</ul></details>` : ''}
      ${fora.length ? `<details class="card"><summary>Fora do escopo do manual (${fora.length})</summary><p style="margin-top:10px">${fora.map(x => `<b>${esc(x.ticker)}</b> (${esc(x.motivo)})`).join('; ')}</p></details>` : ''}
      ${GL.size ? `<details class="card"><summary>Glossário</summary><dl style="margin-top:10px">${[...GL].map(([k, v]) => `<dt style="font-weight:700;margin-top:8px">${esc(k)}</dt><dd style="margin:2px 0 0">${esc(v)}</dd>`).join('')}</dl></details>` : ''}`;
  }
  $('p-sobre').innerHTML = regras + man;
  if ($('btnRemover')) $('btnRemover').onclick = () => { if (!confirm('Remover o manual deste navegador?')) return; try { localStorage.removeItem(CHAVE); } catch (e) {} location.hash = ''; location.reload(); };
}

// ---------- montagem ----------
function montar() {
  ABAS = [['busca', '🔎 Buscar fundo'], ['carteira', '📄 Carteira do cliente']];
  if (MAN) ABAS.push(['temas', '🧩 Temas do manual'], ['agenda', '📅 Agenda do manual']);
  ABAS.push(['sobre', 'ℹ️ Como funciona']);
  $('abas').innerHTML = ABAS.map(([a, l]) => `<button type="button" data-a="${a}">${l}</button>`).join('');
  const nAuto = Object.keys(AUTO).length;
  $('edMeta').innerHTML = (nAuto ? `<span>📊 <b>${n0(nAuto)}</b> FIIs · indicadores de <b>${AUTO_META ? new Date(AUTO_META.gerado).toLocaleDateString('pt-BR') : '—'}</b></span>` : '<span class="bad">Indicadores automáticos indisponíveis no momento.</span>')
    + (MAN ? `<span>📘 Manual: edição <b>${esc(ED)}</b> (${FM.length} fundos analisados em detalhe)</span>` : '');
  $('btnNova').textContent = MAN ? '📘 Importar nova edição do manual' : '📘 Importar Manual de FIIs (opcional)';
  $('rodapeFii').textContent = 'Material informativo de apoio ao assessor. Não constitui recomendação de investimento nem relatório de análise. Os alertas automáticos são sinais objetivos calculados com dados públicos e não explicam o motivo; confira os comunicados do fundo antes de falar com o cliente.';
  escolhidos.length = 0;
  montarBusca(); montarCarteira();
  if (MAN) { montarTemas(); montarAgenda(); }
  montarSobre();
  mostrar(location.hash.slice(1) || 'busca');
}
(async function () {
  try { const p = JSON.parse(localStorage.getItem(CHAVE) || 'null'); if (p && p.data) prepararManual(p); } catch (e) { console.error(e); }
  try {
    const d = await carregarDados('fiis.json');
    AUTO_META = { gerado: d.gerado }; IFIX = d.ifix || null;
    Object.entries(d.f || {}).forEach(([t, a]) => { AUTO[t] = calcAuto(t, a); });
  } catch (e) { console.error(e); }
  montar();
})();
