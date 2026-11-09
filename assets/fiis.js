// FIIs em atenção: lê o "Manual de FIIs em atenção" (.html) importado pelo assessor e permite
// buscar fundos e checar a carteira do cliente (tickers ou XPerformance).
// O manual fica só no navegador (localStorage), nunca no repositório.

const $ = id => document.getElementById(id);
const CHAVE = 'rw_fii_manual';

// ---------- formatos (frações: 0,123 = 12,3%) ----------
const okn = v => typeof v === 'number' && isFinite(v);
const nf = d => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const fp = (v, d = 1) => okn(v) ? (v < 0 ? '−' : '') + nf(d).format(Math.abs(v * 100)) + '%' : '—';
const fs = (v, d = 1) => okn(v) ? (v >= 0 ? '+' : '−') + nf(d).format(Math.abs(v * 100)) + '%' : '—';
const fpp = v => okn(v) ? (v >= 0 ? '+' : '−') + nf(1).format(Math.abs(v * 100)) + ' p.p.' : '—';
const n0 = v => okn(v) ? nf(0).format(v) : '—';
const n2 = v => okn(v) ? nf(2).format(v) : '—';
const rs = v => okn(v) ? 'R$ ' + nf(v < 0.2 ? 3 : 2).format(v) : '—';
const cl = v => okn(v) ? (v < 0 ? 'neg' : 'pos') : '';
const arr = v => Array.isArray(v) ? v : (v ? [v] : []);
const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mlab = s => { const p = String(s || '').split('-'); return p.length === 2 ? MES[+p[1] - 1] + '/' + p[0].slice(2) : String(s || ''); };
const li = a => arr(a).map(x => `<li>${esc(x)}</li>`).join('');
const LVL = { elevada: 'Atenção elevada', moderada: 'Atenção moderada' };
const LVLORD = { elevada: 0, moderada: 1 };
const MUD = { novo: 'Novo nesta edição', mantido: 'Mantido', piorou: 'Piorou', melhorou: 'Melhorou' };
const lv = k => `<span class="lv ${esc(k)}">${esc(LVL[k] || k)}</span>`;
const mud = k => k ? `<span class="mud">${esc(MUD[k] || k)}</span>` : '';

// ---------- importar o manual ----------
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
  const info = $('comManual').hidden ? $('infoMan') : null;
  try {
    const { data, gloss } = extrair(await file.text());
    const pacote = { data, gloss, arquivo: file.name, importado: new Date().toISOString() };
    try { localStorage.setItem(CHAVE, JSON.stringify(pacote)); }
    catch (e) { toast('Não deu para guardar no navegador; o manual vale só até fechar a página.'); }
    iniciar(pacote);
    toast(`Manual da edição ${data.edicao || ''} importado`);
  } catch (e) {
    if (info) info.innerHTML = `<p class="note bad">❌ ${esc(e.message)}</p>`; else toast('❌ ' + e.message);
  }
}
$('dropMan').onclick = () => $('fileMan').click();
$('fileMan').onchange = e => { importar(e.target.files[0]); e.target.value = ''; };
$('btnNova').onclick = () => $('fileMan2').click();
$('fileMan2').onchange = e => { importar(e.target.files[0]); e.target.value = ''; };
['dragover', 'dragenter'].forEach(ev => $('dropMan').addEventListener(ev, e => { e.preventDefault(); $('dropMan').classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => $('dropMan').addEventListener(ev, e => { e.preventDefault(); $('dropMan').classList.remove('over'); }));
$('dropMan').addEventListener('drop', e => importar(e.dataTransfer.files[0]));

// ---------- estado ----------
let DATA, F, byT, UT, FORA, NLOC, PEND, DESC, GL, ED, REF;

function preparar(pacote) {
  DATA = pacote.data; ED = DATA.edicao || '';
  const ANO = +String(ED).split('/')[2];
  F = arr(DATA.fundos).map(f0 => {
    const f = Object.assign({}, f0);
    f._r = arr(f.rendimentos).map(x => ({ m: String(x[0]), v: +x[1] }));
    f.ult = f._r.length ? f._r[0].v : null;
    f.soma12 = f._r.slice(0, 12).reduce((a, x) => a + x.v, 0);
    f.div_ano = f._r.filter(x => +x.m.slice(0, 4) === ANO).reduce((a, x) => a + x.v, 0);
    const okp = okn(f.preco) && f.preco > 0;
    f.pvp = okn(f.vp) && f.vp > 0 && okp ? f.preco / f.vp : null;
    f.dy12 = f._r.length && okp ? f.soma12 / f.preco : null;
    f.dym = okn(f.ult) && okp ? f.ult / f.preco : null;
    f.var_ano = okp && okn(f.preco_inicio_ano) ? f.preco / f.preco_inicio_ano - 1 : null;
    f.var12 = okp && okn(f.preco_12m) ? f.preco / f.preco_12m - 1 : null;
    f.tr_ano = okp && okn(f.preco_inicio_ano) ? (f.preco + f.div_ano) / f.preco_inicio_ano - 1 : null;
    f.tr12 = okp && okn(f.preco_12m) ? (f.preco + f.soma12) / f.preco_12m - 1 : null;
    ['causas', 'acompanhar', 'sinais', 'impactos', 'fatores', 'ativos', 'eventos', 'perguntas', 'fontes'].forEach(k => f[k] = arr(f[k]));
    f.ticker = String(f.ticker || '').toUpperCase();
    return f;
  }).sort((a, b) => (LVLORD[a.nivel] ?? 9) - (LVLORD[b.nivel] ?? 9) || a.ticker.localeCompare(b.ticker));
  byT = Object.fromEntries(F.map(f => [f.ticker, f]));
  const U = DATA.universo || {};
  UT = new Set(arr(U.tickers).map(t => String(t).toUpperCase()));
  FORA = Object.fromEntries(arr(U.fora_escopo).map(x => [String(x.ticker).toUpperCase(), x.motivo]));
  NLOC = new Set(arr(U.nao_localizados).map(t => String(t).toUpperCase()));
  PEND = new Set(arr(U.pendentes).map(t => String(t).toUpperCase()));
  DESC = Object.fromEntries(arr(U.descartados).map(x => [String(x.ticker).toUpperCase(), x.motivo]));
  GL = new Map(arr(pacote.gloss)); arr(DATA.glossario_extra).forEach(([k, v]) => GL.set(k, v));
  REF = DATA.referenciais || {};
}
const R = k => { const r = REF[k] || {}; return { ano: okn(r.ano) ? r.ano / 100 : null, doze: okn(r.doze) ? r.doze / 100 : null, fonte: r.fonte }; };

function statusOf(t) {
  if (byT[t]) return { k: 'card' };
  if (FORA[t]) return { k: 'fora', motivo: FORA[t] };
  if (NLOC.has(t)) return { k: 'nloc' };
  if (PEND.has(t)) return { k: 'pend' };
  if (UT.has(t)) return { k: 'ok' };
  const m = /^([A-Z]{4})1[2-5]$/.exec(t);
  if (m) { const b = m[1] + '11'; if (byT[b] || UT.has(b)) return { k: 'recibo', base: b }; }
  return { k: 'desconhecido' };
}
const conhecido = t => { const k = statusOf(t).k; return k !== 'desconhecido'; };

// ---------- cartões ----------
function pontosCard(f) {
  const crit = f.sinais.slice(0, 3), bom = [];
  if (f.positivo) bom.push(f.positivo);
  if (f.cobertura_ok === true) bom.push('Último rendimento coberto pelo resultado do fundo.');
  return `<div class="pontos">
    ${crit.map(s => `<div class="p crit"><span>⚠</span><span>${esc(s)}</span></div>`).join('')}
    ${bom.map(s => `<div class="p bom"><span>✓</span><span>${esc(s)}</span></div>`).join('')}</div>`;
}
function compacto(f) {
  const nx = f.eventos.slice().sort((a, b) => String(a.ordem || '9').localeCompare(String(b.ordem || '9')))[0];
  return `<article class="fcard ${esc(f.nivel)}">
    <div class="topo"><div><span class="tk">${esc(f.ticker)}</span>${mud(f.mudanca)}</div>${lv(f.nivel)}</div>
    <div class="nm">${esc(f.nome)} · ${esc(f.gestora)} · ${esc(f.setor)}</div>
    <div class="rs">${esc(f.resumo)}</div>
    ${pontosCard(f)}
    <div class="mm"><div>P/VP<b>${n2(f.pvp)}</b></div><div>DY 12m<b>${fp(f.dy12)}</b></div><div>Var. ano<b class="${cl(f.var_ano)}">${fs(f.var_ano)}</b></div><div>Últ. rend.<b>${rs(f.ult)}</b></div></div>
    ${nx ? `<div class="nx"><b>Próximo evento:</b> ${esc(nx.prazo)} — ${esc(nx.evento)}</div>` : ''}
    <div><button class="sm" data-open="${esc(f.ticker)}">Ver análise completa</button></div>
  </article>`;
}
function nota(t, st) {
  if (st.k === 'ok') return `<div class="nota ok"><span class="tk" style="font-size:15px">${esc(t)}</span> <span class="lv ok">Sem ponto de atenção</span>
    <div style="margin-top:6px">Analisado na edição de ${esc(ED)} sem ponto de atenção relevante.${DESC[t] ? `<div class="pontos" style="margin-top:8px"><div class="p bom"><span>✓</span><span>Sinal verificado e descartado: ${esc(DESC[t])}</span></div></div>` : ''}</div></div>`;
  const msg = st.k === 'fora' ? `fora do escopo do manual (${esc(st.motivo)}).`
    : st.k === 'nloc' ? 'não foi localizado na B3 nem na CVM durante a triagem.'
    : st.k === 'pend' ? 'teve sinal na triagem e <b>ainda está em análise</b>; o resultado entra numa próxima atualização.'
    : `não está entre os fundos analisados na edição de ${esc(ED)}.`;
  return `<div class="nota cinza"><span class="tk" style="font-size:15px">${esc(t)}</span> — ${msg}</div>`;
}
function itensDe(t) {
  const st = statusOf(t), out = [];
  if (st.k === 'card') out.push(compacto(byT[t]));
  else if (st.k === 'recibo') {
    out.push(`<div class="nota cinza"><span class="tk" style="font-size:15px">${esc(t)}</span> é recibo ou direito de subscrição de <b>${esc(st.base)}</b>.</div>`);
    out.push(byT[st.base] ? compacto(byT[st.base]) : nota(st.base, statusOf(st.base)));
  } else out.push(nota(t, st));
  return out;
}

// ---------- análise completa ----------
function completo(f) {
  const ri = R('ifix'), rc = R('cdi'), rp = R('poupanca');
  const dif = (a, b) => okn(a) && okn(b) ? fpp(a - b) : '—';
  const sec = (h, x) => x ? `<div><h4>${h}</h4><p>${esc(x)}</p></div>` : '';
  const crit = [...f.sinais], bom = [];
  if (f.positivo) bom.push(f.positivo);
  if (f.cobertura_ok === true) bom.push('Último rendimento coberto pelo resultado: ' + (f.cobertura || ''));
  if (f.melhorar) bom.push('Pode melhorar com: ' + f.melhorar);
  const fat = f.fatores.map((x, i) => `<div class="fator"><div class="ev">${i + 1}. ${esc(x.evento)}</div><dl><dt>Ativos envolvidos</dt><dd>${esc(x.ativos)}</dd><dt>Impacto</dt><dd>${esc(x.impacto)}</dd><dt>Natureza</dt><dd>${esc(x.natureza)}</dd><dt>Continua presente?</dt><dd>${esc(x.presente)}</dd></dl></div>`).join('');
  const ativos = f.ativos.map(a => `<div class="ativo"><div class="an">${esc(a.nome)}</div><div class="ae">${esc(a.peso_txt || '—')}</div><div>${esc(a.situacao)}. <i>${esc(a.motivo)}.</i></div></div>`).join('');
  const evs = f.eventos.slice().sort((a, b) => String(a.ordem || '9').localeCompare(String(b.ordem || '9'))).map(e => `<li><div class="pz">${esc(e.prazo)}</div><div><b>${esc(e.evento)}</b></div>${e.melhora ? `<div class="up">▲ ${esc(e.melhora)}</div>` : ''}${e.piora ? `<div class="dn">▼ ${esc(e.piora)}</div>` : ''}</li>`).join('');
  const perf = `<div class="table-wrap"><table><thead><tr><th>Período</th><th class="n">Fundo (aprox.)</th><th class="n">IFIX</th><th class="n">CDI</th><th class="n">Poupança</th><th class="n">Dif. vs IFIX</th></tr></thead><tbody>
    <tr><td>No ano</td><td class="n">${fs(f.tr_ano)}</td><td class="n">${fs(ri.ano)}</td><td class="n">${fs(rc.ano)}</td><td class="n">${fs(rp.ano)}</td><td class="n">${dif(f.tr_ano, ri.ano)}</td></tr>
    <tr><td>12 meses</td><td class="n">${fs(f.tr12)}</td><td class="n">${fs(ri.doze)}</td><td class="n">${fs(rc.doze)}</td><td class="n">${fs(rp.doze)}</td><td class="n">${dif(f.tr12, ri.doze)}</td></tr></tbody></table></div>
    <p class="note">Retorno aproximado = (cotação final + rendimentos do período) ÷ cotação inicial − 1, sem reinvestimento e antes de IR.</p>`;
  const fontes = `<div class="table-wrap"><table><thead><tr><th>Informação</th><th>Documento</th><th>Fonte</th><th>Data</th><th>Tipo</th><th></th></tr></thead><tbody>${f.fontes.map(s => `<tr><td>${esc(s.info)}</td><td>${esc(s.doc)}</td><td>${esc(s.fonte)}</td><td>${esc(s.data)}</td><td>${esc(s.tipo)}</td><td>${s.link && /^https?:/i.test(s.link) ? `<a href="${esc(s.link)}" target="_blank" rel="noopener">abrir</a>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
  return `<div class="det">
    <div class="mg">
      <div>Tipo<b>${esc(f.tipo)}</b></div><div>Setor<b>${esc(f.setor)}</b></div><div>P/VP<b>${n2(f.pvp)}</b></div>
      <div>DY 12m<b>${fp(f.dy12)}</b></div><div>DY do mês<b>${fp(f.dym, 2)}</b></div><div>Último rend.<b>${rs(f.ult)}</b></div>
      <div>Cotação<b>${rs(f.preco)}</b></div><div>VP (${esc(f.vp_mes || '')})<b>${rs(f.vp)}</b></div>
      <div>Var. no ano<b class="${cl(f.var_ano)}">${fs(f.var_ano)}</b></div><div>Var. 12m<b class="${cl(f.var12)}">${fs(f.var12)}</b></div>
      <div>Cotistas<b>${n0(f.cotistas)}</b></div><div>Taxa<b>${esc(f.taxa_resumo || '—')}</b></div>
    </div>
    <p class="note" style="margin:0">Gestora: ${esc(f.gestor)} · Administradora: ${esc(f.administradora)} · Classificação: ${esc(f.classificacao)} · Atualização: ${esc(f.atualizacao)}</p>
    <div class="dois">
      <div class="caixa crit"><h4>⚠ Pontos críticos</h4><ul>${li(crit)}</ul></div>
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
    <details><summary>Detalhes técnicos</summary><div class="det" style="margin-top:10px">
      ${sec('Cobertura do último rendimento', f.cobertura)}${sec('Leitura do P/VP', f.leitura_pvp)}${sec('Sustentabilidade do rendimento', f.sustentabilidade)}
      <div><h4>Classificação da causa</h4><p>Origem: ${esc(f.origem)} · Natureza: ${esc(f.natureza)} · Impacto: ${esc(f.refletido)}</p></div>
      ${sec('Taxas', f.taxa)}<div><h4>Retorno aproximado × referenciais</h4>${perf}</div>
      <div><h4>Últimos rendimentos (R$/cota, mês da data-com)</h4><p>${f._r.map(x => `${mlab(x.m)} ${nf(x.v < 0.2 ? 3 : 2).format(x.v)}`).join(' · ')}</p></div></div></details>
    ${f.fontes.length ? `<details><summary>Fontes</summary><div style="margin-top:10px">${fontes}</div></details>` : ''}
  </div>`;
}
function abrirFundo(t) {
  const f = byT[String(t).toUpperCase()]; if (!f) return;
  $('dlgT').innerHTML = `<span class="tk">${esc(f.ticker)}</span> <span style="font-weight:600;font-size:16px">· ${esc(f.nome)}</span> ${lv(f.nivel)}${mud(f.mudanca)}`;
  $('dlgB').innerHTML = completo(f);
  $('dlgFii').hidden = false; $('dlgFii').querySelector('.modal').scrollTop = 0;
  document.body.style.overflow = 'hidden';
}
function fecharFundo() { $('dlgFii').hidden = true; document.body.style.overflow = ''; }
$('dlgX').onclick = fecharFundo;
$('dlgFii').addEventListener('click', e => { if (e.target.id === 'dlgFii') fecharFundo(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('dlgFii').hidden) fecharFundo(); });
document.addEventListener('click', e => { const b = e.target.closest('[data-open]'); if (b) abrirFundo(b.dataset.open); });

// ---------- abas ----------
const ABAS = [['busca', '🔎 Buscar fundo'], ['carteira', '📄 Carteira do cliente'], ['temas', '🧩 Temas da edição'], ['agenda', '📅 Agenda'], ['sobre', 'ℹ️ Sobre a edição']];
function mostrar(id) {
  ABAS.forEach(([a]) => { $('p-' + a).classList.toggle('on', a === id); });
  $('abas').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.a === id));
  history.replaceState(null, '', '#' + id);
}
$('abas').innerHTML = ABAS.map(([a, l]) => `<button type="button" data-a="${a}">${l}</button>`).join('');
$('abas').addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (b) mostrar(b.dataset.a); });

// ---------- 1. busca ----------
const escolhidos = [];
function montarBusca() {
  const uniq = k => [...new Set(F.map(f => f[k]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));
  const sel = (id, label, opts) => `<label class="f">${label}<select id="${id}"><option value="">Todos</option>${opts.map(o => `<option value="${esc(o[0])}">${esc(o[1])}</option>`).join('')}</select></label>`;
  const nE = F.filter(f => f.nivel === 'elevada').length, nM = F.filter(f => f.nivel === 'moderada').length;
  const nAn = okn((DATA.universo || {}).analisados) ? DATA.universo.analisados : UT.size;
  $('p-busca').innerHTML = `
    <div class="kpis" style="margin-bottom:14px">
      <div class="kpi"><div class="l">Fundos analisados</div><div class="v">${n0(nAn)}</div></div>
      <div class="kpi"><div class="l">Atenção elevada</div><div class="v neg">${nE}</div></div>
      <div class="kpi"><div class="l">Atenção moderada</div><div class="v" style="color:var(--warn)">${nM}</div></div>
      <div class="kpi"><div class="l">Sem ponto de atenção</div><div class="v pos">${n0(Math.max(0, nAn - F.length - PEND.size))}</div></div>
    </div>
    <div class="card">
      <div class="busca-f"><input id="q" type="search" autocomplete="off" placeholder="Digite o ticker ou o nome do FII (ex.: HGLG11) e tecle Enter. Dá para colar vários."><div class="sug" id="sug"></div></div>
      <div class="chips" id="chips"></div>
      <div class="filtros">${sel('fNivel', 'Nível de atenção', Object.entries(LVL))}${sel('fSetor', 'Setor', uniq('setor').map(v => [v, v]))}${sel('fTipo', 'Tipo', uniq('tipo').map(v => [v, v]))}${sel('fGest', 'Gestora', uniq('gestora').map(v => [v, v]))}</div>
    </div>
    ${arr(DATA.resumo).length ? `<details class="card"><summary>Resumo da edição</summary><div style="margin-top:10px;display:grid;gap:8px">${arr(DATA.resumo).map(([t, x]) => `<p style="margin:0"><b>${esc(t)}:</b> ${esc(x)}</p>`).join('')}</div></details>` : ''}
    <p class="note" id="cont"></p>
    <div id="res"></div>`;
  const q = $('q'), sg = $('sug');
  const v = id => ($(id) || {}).value || '';
  const passa = f => (!v('fNivel') || f.nivel === v('fNivel')) && (!v('fSetor') || f.setor === v('fSetor')) && (!v('fTipo') || f.tipo === v('fTipo')) && (!v('fGest') || f.gestora === v('fGest'));
  function desenhar() {
    $('chips').innerHTML = escolhidos.map(t => `<span class="chip">${esc(t)}<button type="button" data-rm="${esc(t)}" aria-label="Remover">×</button></span>`).join('') + (escolhidos.length ? `<button class="sm ghost" id="chipsX" type="button">Limpar seleção</button>` : '');
    if (escolhidos.length) {
      const it = escolhidos.flatMap(t => statusOf(t).k === 'card' && !passa(byT[t]) ? [] : itensDe(t));
      $('res').innerHTML = `<div class="fgrid">${it.join('')}</div>`;
      $('cont').textContent = `${escolhidos.length} fundo(s) selecionado(s).`;
    } else {
      const L = F.filter(passa);
      $('res').innerHTML = L.length ? `<div class="fgrid">${L.map(compacto).join('')}</div>` : '<div class="nota cinza">Nenhum fundo com esses filtros.</div>';
      $('cont').textContent = `Mostrando ${L.length} de ${F.length} fundos em atenção. Busque um ticker para ver qualquer fundo analisado, inclusive os que estão sem ponto de atenção.`;
    }
  }
  function add(t) { t = String(t || '').trim().toUpperCase(); if (!t) return; if (!escolhidos.includes(t)) escolhidos.push(t); q.value = ''; sg.classList.remove('on'); desenhar(); }
  let hi = -1;
  function sugerir() {
    const s = q.value.trim().toUpperCase(); hi = -1;
    if (!s) { sg.classList.remove('on'); return; }
    const sem = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
    const a = F.filter(f => f.ticker.includes(s) || sem(f.nome).includes(sem(s)) || sem(f.gestora).includes(sem(s))).slice(0, 8).map(f => ({ t: f.ticker, d: f.nome, l: LVL[f.nivel] }));
    const vistos = new Set(a.map(x => x.t));
    const b = [...UT, ...Object.keys(FORA)].filter(t => t.startsWith(s) && !vistos.has(t)).slice(0, 6).map(t => ({ t, d: '', l: FORA[t] ? 'fora do escopo' : 'sem ponto de atenção' }));
    const o = [...a, ...b];
    sg.innerHTML = o.length ? o.map(x => `<button type="button" data-add="${esc(x.t)}"><span><b>${esc(x.t)}</b> <span class="sn">${esc(x.d || '')}</span></span><span class="sn">${esc(x.l || '')}</span></button>`).join('')
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
      const toks = (q.value.toUpperCase().match(/\b[A-Z]{4}\d{2}\b/g) || []);
      if (hi >= 0 && bs[hi]) add(bs[hi].dataset.add); else if (toks.length) toks.forEach(add); else if (bs[0]) add(bs[0].dataset.add);
    } else if (e.key === 'Escape') sg.classList.remove('on');
  });
  q.addEventListener('paste', () => setTimeout(() => { const toks = q.value.toUpperCase().match(/\b[A-Z]{4}\d{2}\b/g) || []; if (toks.length > 1) toks.forEach(add); }, 0));
  sg.addEventListener('mousedown', e => { const b = e.target.closest('[data-add]'); if (b) { e.preventDefault(); add(b.dataset.add); } });
  q.addEventListener('blur', () => setTimeout(() => sg.classList.remove('on'), 150));
  $('p-busca').addEventListener('click', e => { const r = e.target.closest('[data-rm]'); if (r) { escolhidos.splice(escolhidos.indexOf(r.dataset.rm), 1); desenhar(); } if (e.target.id === 'chipsX') { escolhidos.length = 0; desenhar(); } });
  $('p-busca').querySelectorAll('select').forEach(s => s.addEventListener('change', desenhar));
  desenhar();
}

// ---------- 2. carteira do cliente ----------
let CART = null;   // { cliente, conta, dataRef, patrimonio, pos: [{ticker, nome, saldo, pct, rentMes, rentAno}], naoListados: [...] }
function montarCarteira() {
  $('p-carteira').innerHTML = `
    <div class="passos" style="display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">
      <div class="card" style="margin:0">
        <h2 style="margin-top:0">📄 XPerformance do cliente</h2>
        <p class="note" style="margin-top:0">O site encontra os FIIs e Fiagros da carteira, com saldo e rentabilidade, e cruza com o manual.</p>
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
    CART = T.length ? { pos: T.map(t => ({ ticker: t })), naoListados: [] } : null;
    $('infoXp').innerHTML = '';
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
        if (ex) { ex.saldo += a.saldo || 0; ex.pct += a.pct || 0; } else pos.push({ ticker: t, nome: a.nome, saldo: a.saldo || 0, pct: a.pct || 0, rentMes: a.rentMes, rentAno: a.rentAno, qtd: a.qtd });
      } else if (fiiNome) naoListados.push({ nome: a.nome, saldo: a.saldo || 0, pct: a.pct || 0 });
    });
    CART = { cliente: r.cliente || '', conta: r.conta || '', dataRef: r.dataRef || '', patrimonio: r.patrimonio, pos, naoListados };
    $('cartTk').value = pos.map(p => p.ticker).join(', ');
    $('infoXp').innerHTML = `<span class="pill good">✓ ${esc(r.cliente || file.name)}</span> <span class="note">conta ${esc(r.conta || '—')} · ${pos.length} FII(s) listado(s)${naoListados.length ? ` · ${naoListados.length} não listado(s)` : ''}</span>`;
  } catch (e) { $('infoXp').innerHTML = `<p class="note bad">❌ Não consegui ler o PDF: ${esc(e.message)}</p>`; CART = null; }
  desenharCarteira();
}
function classificar() {
  const att = [], sem = [], pend = [], outros = [];
  CART.pos.forEach(p => {
    let st = statusOf(p.ticker), t = p.ticker;
    if (st.k === 'recibo') { t = st.base; st = statusOf(t); }
    p.st = st.k === 'card' ? byT[t].nivel : st.k; p.base = t;
    if (st.k === 'card') att.push(p); else if (st.k === 'ok') sem.push(p); else if (st.k === 'pend') pend.push(p); else outros.push(p);
  });
  att.sort((a, b) => (LVLORD[a.st] ?? 9) - (LVLORD[b.st] ?? 9) || (b.saldo || 0) - (a.saldo || 0));
  return { att, sem, pend, outros };
}
const ST_TXT = { elevada: ['Atenção elevada', 'elevada'], moderada: ['Atenção moderada', 'moderada'], ok: ['Sem ponto de atenção', 'ok'], pend: ['Em análise', 'cinza'], fora: ['Fora do escopo', 'cinza'], nloc: ['Não localizado', 'cinza'], desconhecido: ['Não analisado', 'cinza'] };
function desenharCarteira() {
  const out = $('cartOut'); if (!out) return;
  if (!CART || (!CART.pos.length && !CART.naoListados.length)) { out.innerHTML = '<div class="nota cinza">Os FIIs do cliente aparecem aqui assim que você anexar o XPerformance ou digitar os tickers.</div>'; return; }
  const { att, sem, pend, outros } = classificar();
  const temSaldo = CART.pos.some(p => okn(p.saldo) && p.saldo > 0);
  const totFii = CART.pos.reduce((s, p) => s + (p.saldo || 0), 0);
  const soma = L => L.reduce((s, p) => s + (p.saldo || 0), 0);
  const kv = (L) => temSaldo ? `<div class="s">${brl(soma(L))}${totFii ? ` · ${pct(soma(L) / totFii * 100, 1)} dos FIIs` : ''}</div>` : '';
  const nE = att.filter(p => p.st === 'elevada'), nM = att.filter(p => p.st === 'moderada');
  const tabela = temSaldo ? `<div class="card"><h3 style="margin-top:0">FIIs na carteira${CART.cliente ? ` de ${esc(CART.cliente)}` : ''}</h3><div class="table-wrap"><table class="tbl-fii"><thead><tr><th>Fundo</th><th class="n">Saldo</th><th class="n">% carteira</th><th class="n">Rent. mês</th><th class="n">Rent. ano</th><th>Situação no manual</th></tr></thead><tbody>
      ${[...CART.pos].sort((a, b) => (b.saldo || 0) - (a.saldo || 0)).map(p => { const [txt, c] = ST_TXT[p.st] || ST_TXT.desconhecido; const f = byT[p.base];
        return `<tr><td><b>${esc(p.ticker)}</b>${f ? `<div class="note" style="margin:0">${esc(f.nome)}</div>` : ''}</td><td class="n">${brl(p.saldo)}</td><td class="n">${pct(p.pct, 2)}</td><td class="n ${okn(p.rentMes) ? (p.rentMes < 0 ? 'neg' : 'pos') : ''}">${okn(p.rentMes) ? pct(p.rentMes) : '—'}</td><td class="n ${okn(p.rentAno) ? (p.rentAno < 0 ? 'neg' : 'pos') : ''}">${okn(p.rentAno) ? pct(p.rentAno) : '—'}</td><td>${f ? `<button class="linkchip ${c}" data-open="${esc(p.base)}">${txt} ›</button>` : `<span class="lv ${c}">${txt}</span>`}</td></tr>`; }).join('')}
      </tbody></table></div></div>` : '';
  out.innerHTML = `
    <div class="kpis" style="margin-bottom:14px">
      <div class="kpi"><div class="l">FIIs na carteira</div><div class="v">${CART.pos.length}</div>${temSaldo ? `<div class="s">${brl(totFii)}${okn(CART.patrimonio) && CART.patrimonio ? ` · ${pct(totFii / CART.patrimonio * 100, 1)} do patrimônio` : ''}</div>` : ''}</div>
      <div class="kpi"><div class="l">Atenção elevada</div><div class="v neg">${nE.length}</div>${kv(nE)}</div>
      <div class="kpi"><div class="l">Atenção moderada</div><div class="v" style="color:var(--warn)">${nM.length}</div>${kv(nM)}</div>
      <div class="kpi"><div class="l">Sem ponto de atenção</div><div class="v pos">${sem.length}</div>${kv(sem)}</div>
    </div>
    <div class="row" style="margin-bottom:14px"><button id="cartEmail">✉️ E-mail ao cliente</button><button class="secondary" id="cartCopia">Copiar resumo</button></div>
    ${tabela}
    ${att.length ? `<h3>Precisam de atenção</h3><div class="fgrid">${[...new Set(att.map(p => p.base))].map(t => compacto(byT[t])).join('')}</div>` : '<div class="nota ok">Nenhum FII da carteira está em atenção nesta edição do manual.</div>'}
    ${sem.length ? `<h3 style="margin-top:18px">Sem ponto de atenção relevante</h3><div class="fgrid">${sem.map(p => nota(p.base, statusOf(p.base))).join('')}</div>` : ''}
    ${pend.length || outros.length ? `<h3 style="margin-top:18px">Em análise, fora do escopo ou não analisados</h3><div class="fgrid">${[...pend, ...outros].map(p => nota(p.ticker, statusOf(p.ticker))).join('')}</div>` : ''}
    ${CART.naoListados.length ? `<div class="nota cinza" style="margin-top:14px"><b>FIIs e Fiagros não listados na bolsa</b> (não fazem parte do manual): ${CART.naoListados.map(n => `${esc(n.nome)} (${brl(n.saldo)})`).join('; ')}.</div>` : ''}`;
  $('cartCopia').onclick = () => copyText(textoResumo());
  $('cartEmail').onclick = emailCliente;
}
function textoResumo() {
  const { att, sem, pend, outros } = classificar();
  const L = [`FIIs da carteira${CART.cliente ? ` de ${CART.cliente}` : ''} no Manual de FIIs em atenção (edição ${ED})`, ''];
  ['elevada', 'moderada'].forEach(n => { const x = att.filter(p => p.st === n); if (x.length) { L.push(LVL[n] + ':'); [...new Set(x.map(p => p.base))].forEach(t => L.push(`- ${t} (${byT[t].nome}): ${byT[t].resumo}`)); L.push(''); } });
  if (sem.length) { L.push('Sem ponto de atenção relevante: ' + sem.map(p => p.ticker).join(', ')); L.push(''); }
  if (pend.length) { L.push('Em análise: ' + pend.map(p => p.ticker).join(', ')); L.push(''); }
  if (outros.length) { L.push('Fora do escopo ou não analisados: ' + outros.map(p => p.ticker).join(', ')); L.push(''); }
  L.push('Material informativo de apoio ao assessor. Não constitui recomendação de investimento.');
  return L.join('\n');
}
function emailCliente() {
  const { att, sem } = classificar(), h = Email.h;
  const fundos = [...new Set(att.map(p => p.base))].map(t => byT[t]);
  const nome = (CART.cliente || '').split(/\s+/)[0] || '';
  Email.abrir({
    assunto: 'Seus fundos imobiliários: pontos de atenção', nome,
    texto: (n, ass) => [Email.saudacaoTexto(n), '',
      fundos.length ? 'Revisei os fundos imobiliários da sua carteira e quero te atualizar sobre alguns deles:' : 'Revisei os fundos imobiliários da sua carteira e, neste momento, nenhum deles apresenta ponto de atenção relevante.', '',
      ...fundos.flatMap(f => [`${f.ticker} (${f.nome})`, f.explicar, '']),
      sem.length && fundos.length ? `Os demais fundos (${sem.map(p => p.ticker).join(', ')}) seguem sem ponto de atenção relevante.` : '', '',
      'Fico à disposição para conversarmos sobre a sua carteira.', '', 'Abraço,', ass].join('\n'),
    html: (n, ass) => h.wrap(
      h.p(h.saudacao(n)) +
      h.p(fundos.length ? 'Revisei os fundos imobiliários da sua carteira e quero te atualizar sobre alguns deles:' : 'Revisei os fundos imobiliários da sua carteira e, neste momento, nenhum deles apresenta ponto de atenção relevante.') +
      fundos.map(f => h.titulo(`${esc(f.ticker)} · ${esc(f.nome)}`) + h.p(esc(f.explicar))).join('') +
      (sem.length && fundos.length ? h.p(`Os demais fundos (${sem.map(p => esc(p.ticker)).join(', ')}) seguem sem ponto de atenção relevante.`) : '') +
      h.p('Fico à disposição para conversarmos sobre a sua carteira.') + h.p('Abraço,') + h.assinatura(ass) +
      h.rodape('Material informativo. Não constitui recomendação de investimento. Rentabilidade passada não é garantia de rentabilidade futura.')),
  });
}

// ---------- 3. temas ----------
function montarTemas() {
  const T = arr(DATA.temas);
  $('p-temas').innerHTML = `<p class="lead">O que explicou o resultado de vários fundos ao mesmo tempo. Toque no ticker para abrir a análise.</p>
    ${T.length ? `<div class="temas">${T.map((t, i) => `<div class="card" style="margin:0"><h3 style="margin-top:0">${i + 1}. ${esc(t.titulo)}</h3><p style="margin:0 0 8px">${esc(t.descricao)}</p>
      <p class="note" style="margin:0 0 8px"><b>Natureza:</b> ${esc(t.natureza)} · <b>Continua presente?</b> ${esc(t.presente)}</p>
      <div>${arr(t.fundos).map(x => { const f = byT[String(x).toUpperCase()]; return f ? `<button class="linkchip ${esc(f.nivel)}" data-open="${esc(f.ticker)}">${esc(f.ticker)}</button>` : `<span class="linkchip">${esc(x)}</span>`; }).join('')}</div></div>`).join('')}</div>`
    : '<div class="nota cinza">Esta edição não tem temas preenchidos.</div>'}`;
}

// ---------- 4. agenda ----------
function montarAgenda() {
  const ev = [];
  F.forEach(f => f.eventos.forEach(e => ev.push(Object.assign({ t: f.ticker, nivel: f.nivel }, e))));
  ev.sort((a, b) => String(a.ordem || '9999').localeCompare(String(b.ordem || '9999')));
  const hoje = todayISO();
  $('p-agenda').innerHTML = `<p class="lead">Eventos dos fundos em atenção que podem mudar a análise, em ordem de data.</p>
    <label class="check" style="margin-bottom:10px"><input type="checkbox" id="agFut" checked> Mostrar só a partir de hoje</label>
    <div class="table-wrap fixo"><table><thead><tr><th>Quando</th><th>Fundo</th><th>Evento</th><th>Sinal de melhora</th><th>Sinal de piora</th></tr></thead><tbody id="agBody"></tbody></table></div>`;
  const desenhar = () => {
    const L = $('agFut').checked ? ev.filter(e => !e.ordem || e.ordem >= hoje) : ev;
    $('agBody').innerHTML = L.length ? L.map(e => `<tr><td style="white-space:nowrap">${esc(e.prazo)}${e.ordem ? `<div class="note" style="margin:0">${fmtDate(e.ordem)}</div>` : ''}</td><td><button class="linkchip ${esc(e.nivel)}" data-open="${esc(e.t)}">${esc(e.t)}</button></td><td>${esc(e.evento)}</td><td class="up">${esc(e.melhora || '—')}</td><td class="dn">${esc(e.piora || '—')}</td></tr>`).join('')
      : '<tr><td colspan="5" class="note">Nenhum evento.</td></tr>';
  };
  $('agFut').onchange = desenhar; desenhar();
}

// ---------- 5. sobre ----------
function montarSobre(pacote) {
  const U = DATA.universo || {}, fora = arr(U.fora_escopo), desc = arr(U.descartados);
  const refs = [['ifix', 'IFIX (retorno total)'], ['cdi', 'CDI'], ['poupanca', 'Poupança']];
  $('p-sobre').innerHTML = `
    <div class="card"><h3 style="margin-top:0">Edição ${esc(ED)}</h3>
      <p class="note" style="margin-top:0">Arquivo: ${esc(pacote.arquivo || '—')} · importado em ${new Date(pacote.importado).toLocaleString('pt-BR')} · dados consultados até ${esc(DATA.data_consulta || ED)}. Fica salvo só neste navegador.</p>
      ${arr(DATA.resumo).map(([t, x]) => `<p style="margin:0 0 8px"><b>${esc(t)}:</b> ${esc(x)}</p>`).join('')}
      <button class="sm ghost" id="btnRemover" style="margin-top:6px">Remover o manual deste navegador</button></div>
    <div class="card"><h3 style="margin-top:0">Referenciais</h3><div class="table-wrap"><table><thead><tr><th>Referencial</th><th class="n">No ano</th><th class="n">12 meses</th><th>Fonte</th></tr></thead><tbody>
      ${refs.map(([k, nm]) => { const r = R(k); return `<tr><td>${nm}</td><td class="n">${fs(r.ano)}</td><td class="n">${fs(r.doze)}</td><td class="note">${esc(r.fonte || '')}</td></tr>`; }).join('')}</tbody></table></div></div>
    ${desc.length ? `<details class="card"><summary>Sinal verificado e descartado (${desc.length})</summary><div class="table-wrap" style="margin-top:10px"><table><tbody>${desc.map(d => `<tr><td><b>${esc(d.ticker)}</b></td><td>${esc(d.motivo)}</td></tr>`).join('')}</tbody></table></div></details>` : ''}
    ${arr(DATA.limitacoes).length ? `<details class="card"><summary>Limitações</summary><ul style="margin-top:10px">${li(DATA.limitacoes)}</ul></details>` : ''}
    ${fora.length || arr(U.nao_localizados).length ? `<details class="card"><summary>Fora do escopo e não localizados (${fora.length + arr(U.nao_localizados).length})</summary><p style="margin-top:10px">${fora.map(x => `<b>${esc(x.ticker)}</b> (${esc(x.motivo)})`).join('; ')}${arr(U.nao_localizados).length ? `<br><b>Não localizados:</b> ${esc(arr(U.nao_localizados).join(', '))}` : ''}</p></details>` : ''}
    ${GL.size ? `<details class="card"><summary>Glossário</summary><dl style="margin-top:10px">${[...GL].map(([k, v]) => `<dt style="font-weight:700;margin-top:8px">${esc(k)}</dt><dd style="margin:2px 0 0">${esc(v)}</dd>`).join('')}</dl></details>` : ''}`;
  $('btnRemover').onclick = () => { if (!confirm('Remover o manual deste navegador?')) return; try { localStorage.removeItem(CHAVE); } catch (e) {} location.hash = ''; location.reload(); };
}

// ---------- início ----------
function iniciar(pacote) {
  preparar(pacote);
  escolhidos.length = 0;
  const nE = F.filter(f => f.nivel === 'elevada').length, nM = F.length - nE;
  const nAn = okn((DATA.universo || {}).analisados) ? DATA.universo.analisados : UT.size;
  $('edMeta').innerHTML = `<span>📘 Edição <b>${esc(ED)}</b></span><span><b>${n0(nAn)}</b> fundos analisados</span><span><b>${F.length}</b> em atenção (${nE} elevada · ${nM} moderada)</span>`;
  $('rodapeFii').textContent = `Material informativo de apoio ao assessor, com dados consultados até ${DATA.data_consulta || ED}. Não constitui recomendação de investimento nem relatório de análise. Eventos posteriores à data da edição não estão considerados.`;
  montarBusca(); montarCarteira(); montarTemas(); montarAgenda(); montarSobre(pacote);
  $('semManual').hidden = true; $('comManual').hidden = false;
  const h = location.hash.slice(1);
  mostrar(ABAS.some(a => a[0] === h) ? h : 'busca');
}
(function () {
  let p = null;
  try { p = JSON.parse(localStorage.getItem(CHAVE) || 'null'); } catch (e) {}
  if (p && p.data) { try { iniciar(p); return; } catch (e) { console.error(e); } }
  $('semManual').hidden = false;
})();
