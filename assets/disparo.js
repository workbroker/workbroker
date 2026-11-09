// Disparo de relatórios: cruza planilha de clientes com os XPerformance e gera um e-mail por cliente
const $ = id => document.getElementById(id);
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const CURTO = { 'Pós Fixado': 'Pós-fixado', 'Pré Fixado': 'Prefixado', 'Renda Variável Brasil': 'Renda variável Brasil', 'Renda Variável Internacional': 'Renda variável global', 'Renda Variável Global': 'Renda variável global', 'Renda Fixa Global': 'Renda fixa global', 'Renda Fixa Internacional': 'Renda fixa global', 'Alternativo': 'Alternativos', 'Carteira Administrada': 'Carteira administrada', 'Fundos Listados': 'Fundos listados' };
const curto = n => CURTO[n] || n;
const cod = x => String(x || '').replace(/\D/g, '').replace(/^0+/, '');
const n2 = (x, d = 2) => Number.isFinite(x) ? x.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
const ps = x => Number.isFinite(x) ? (x > 0 ? '+' : '') + n2(x) + '%' : '—';
const ascii = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '_');

let CLI = store.get('rw_disp_clientes', []);          // [{ codigo, nome, email }]
const REL = new Map();                                   // codigo -> { arquivo, bytes, d }
let CFG = Object.assign({ macro: '', assunto: '', excluidos: [], cat: true, top: true, ano: true }, store.get('rw_disp_cfg', {}));
let MACRO = null;
const salvarCli = () => store.set('rw_disp_clientes', CLI);
const salvarCfg = () => store.set('rw_disp_cfg', CFG);

// ---------- Planilha ----------
function mapearColunas(linhas) {
  const hi = linhas.findIndex(l => l.filter(x => String(x).trim()).length >= 2);
  const cab = (linhas[hi] || []).map(x => String(x).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
  let c = cab.findIndex(x => /cod|conta/.test(x)), n = cab.findIndex(x => /nome/.test(x)), e = cab.findIndex(x => /mail/.test(x));
  let ini = hi + 1;
  if (c < 0 || e < 0) { // sem cabeçalho: descobre pelas células
    const amostra = linhas[hi] || [];
    c = amostra.findIndex(x => /^\d{4,}$/.test(String(x).replace(/\D/g, '')) && !/@/.test(x));
    e = amostra.findIndex(x => /@/.test(x));
    n = amostra.findIndex((x, i) => i !== c && i !== e && /[a-z]/i.test(x));
    ini = hi;
  }
  return { c, n, e, ini };
}
async function importarPlanilha(file) {
  if (!file) return;
  try {
    const linhas = await ArquivosLite.lerPlanilha(file);
    const m = mapearColunas(linhas);
    if (m.c < 0) throw new Error('Não encontrei a coluna de código/conta');
    const novos = linhas.slice(m.ini).map(l => ({ codigo: cod(l[m.c]), nome: String(l[m.n] ?? '').trim().split(/\s+/)[0] || '', email: String(l[m.e] ?? '').trim().toLowerCase() })).filter(x => x.codigo);
    const porCod = new Map(CLI.map(x => [x.codigo, x]));
    novos.forEach(x => porCod.set(x.codigo, { ...porCod.get(x.codigo), ...x }));
    CLI = [...porCod.values()]; salvarCli();
    $('infoPlan').innerHTML = `<span class="pill good">✓ ${novos.length} clientes importados</span> <span class="note">${esc(file.name)}</span>`;
    render();
  } catch (e) { $('infoPlan').innerHTML = `<p class="note bad">❌ ${esc(e.message)}</p>`; }
}
$('dropPlan').onclick = () => $('filePlan').click();
$('filePlan').onchange = e => { importarPlanilha(e.target.files[0]); e.target.value = ''; };

// ---------- PDFs (arquivos soltos, pasta inteira ou .zip) ----------
async function expandir(lista) {           // PDFs + conteúdo dos .zip
  const out = [];
  for (const f of lista) {
    if (/\.pdf$/i.test(f.name)) out.push({ nome: f.name, blob: f });
    else if (/\.zip$/i.test(f.name)) (await ArquivosLite.extrairZip(f)).filter(x => /\.pdf$/i.test(x.nome)).forEach(x => out.push(x));
  }
  return out;
}
async function importarPdfs(lista) {
  lista = [...lista]; if (!lista.length) return;
  $('infoPdf').innerHTML = '<div class="note">⏳ Abrindo os arquivos…</div>';
  let files;
  try { files = await expandir(lista); } catch (e) { $('infoPdf').innerHTML = `<p class="note bad">❌ ${esc(e.message)}</p>`; return; }
  if (!files.length) { $('infoPdf').innerHTML = '<p class="note bad">Nenhum PDF encontrado.</p>'; return; }
  let ok = 0; const erros = [], t0 = Date.now();
  $('infoPdf').innerHTML = `<div class="note">⏳ Lendo <span id="pdfN">0</span> de ${files.length}<span id="pdfEta"></span>… pode continuar usando o site.</div><div class="barra"><i id="pdfBar"></i></div>`;
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    try {
      const r = await XPParser.parse(await f.blob.arrayBuffer(), f.nome);
      const c = cod(r.conta) || cod((f.nome.match(/\b(\d{5,})\b/) || [])[1]);
      if (!c) throw new Error('conta não encontrada');
      REL.set(c, { arquivo: f.nome, blob: f.blob, d: r });
      if (!CLI.find(x => x.codigo === c)) CLI.push({ codigo: c, nome: (r.cliente || '').split(/\s+/)[0] || '', email: '', semCadastro: true });
      ok++;
    } catch (e) { erros.push(`${f.nome}: ${e.message}`); }
    $('pdfN').textContent = i + 1; $('pdfBar').style.width = ((i + 1) / files.length * 100) + '%';
    const resta = Math.round((Date.now() - t0) / (i + 1) * (files.length - i - 1) / 1000);
    if (i > 2 && resta > 5) $('pdfEta').textContent = ` (falta ~${resta >= 60 ? Math.ceil(resta / 60) + ' min' : resta + 's'})`;
    if (i % 25 === 24) { salvarCli(); render(); }
  }
  salvarCli();
  $('infoPdf').innerHTML = `<span class="pill good">✓ ${ok} relatório(s) lido(s)</span>${erros.length ? ` <span class="pill bad">${erros.length} com erro</span><div class="note" style="margin-top:6px">${erros.map(esc).join('<br>')}</div>` : ''}`;
  if (!CFG.macro.trim()) gerarMacro();
  if (!CFG.assunto.trim()) { CFG.assunto = `Seu relatório de investimentos · ${mesRef()}`; $('assunto').value = CFG.assunto; salvarCfg(); }
  render();
}
// arrastar uma pasta: percorre as subpastas
async function arquivosDoDrop(dt) {
  const entradas = [...(dt.items || [])].map(it => it.webkitGetAsEntry && it.webkitGetAsEntry()).filter(Boolean);
  if (!entradas.length) return [...dt.files];
  const out = [];
  const lerDir = d => new Promise(res => { const r = d.createReader(), todos = []; const lote = () => r.readEntries(es => { if (!es.length) res(todos); else { todos.push(...es); lote(); } }, () => res(todos)); lote(); });
  const visitar = async e => {
    if (e.isFile) out.push(await new Promise(res => e.file(res, () => res(null))));
    else if (e.isDirectory) for (const x of await lerDir(e)) await visitar(x);
  };
  for (const e of entradas) await visitar(e);
  return out.filter(Boolean);
}
$('dropPdf').onclick = e => { if (!e.target.closest('button')) $('filePdf').click(); };
$('btnPasta').onclick = () => $('filePasta').click();
$('filePdf').onchange = e => { importarPdfs(e.target.files); e.target.value = ''; };
$('filePasta').onchange = e => { importarPdfs(e.target.files); e.target.value = ''; };
[['dropPlan', dt => importarPlanilha(dt.files[0])], ['dropPdf', async dt => importarPdfs(await arquivosDoDrop(dt))]].forEach(([id, fn]) => {
  ['dragover', 'dragenter'].forEach(ev => $(id).addEventListener(ev, e => { e.preventDefault(); $(id).classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => $(id).addEventListener(ev, e => { e.preventDefault(); $(id).classList.remove('over'); }));
  $(id).addEventListener('drop', e => fn(e.dataTransfer));
});

// ---------- Textos ----------
function primeiroRel() { return [...REL.values()][0]?.d; }
function mesRef(d = primeiroRel()) { if (!d?.dataRef) return ''; const [, m, a] = d.dataRef.split('/'); const t = `${MESES[+m - 1]} de ${a}`; return t.charAt(0).toUpperCase() + t.slice(1); }
function gerarMacro() {
  const d = primeiroRel(), R = d?.resumo?.refs || {}, it = id => MACRO?.itens?.find(i => i.id === id)?.valor;
  const mes = d ? MESES[+d.dataRef.split('/')[1] - 1] : 'o mês';
  const mov = (v, sobe, cai) => v >= 0 ? `${sobe} ${n2(v)}%` : `${cai} ${n2(Math.abs(v))}%`;
  const p = [];
  if (R.CDI) p.push(`Em ${mes}, o CDI rendeu ${n2(R.CDI.mes)}%`);
  if (R.Ibovespa) p.push(`o Ibovespa ${mov(R.Ibovespa.mes, 'subiu', 'caiu')}`);
  if (R.Dolar) p.push(`o dólar ${mov(R.Dolar.mes, 'subiu', 'caiu')}`);
  let t = p.length ? (p.length > 1 ? p.slice(0, -1).join(', ') + ' e ' + p[p.length - 1] : p[0]) + '.' : '';
  if (R.IPCA) t += ` A inflação (IPCA) foi de ${n2(R.IPCA.mes)}% no mês${it('ipca_12m') ? `, acumulando ${n2(it('ipca_12m'))}% em 12 meses` : ''}.`;
  if (it('selic')) t += ` A Selic está em ${n2(it('selic'))}% ao ano${it('dolar') ? ` e o dólar é cotado hoje a R$ ${n2(it('dolar'), 2)}` : ''}.`;
  t += '\n\n[Escreva aqui a sua visão sobre política, economia e o que esperar para os próximos meses.]';
  CFG.macro = t.trim(); $('macro').value = CFG.macro; salvarCfg();
}
$('btnSugerir').onclick = () => { if (CFG.macro.trim() && !confirm('Substituir o texto atual pelo texto gerado com os indicadores?')) return; gerarMacro(); };

function dadosCliente(rel) {
  const d = rel.d, r = d.resumo || {}, cdiMes = r.refs?.CDI?.mes, pcdi = v => Number.isFinite(v) && cdiMes ? v / cdiMes * 100 : NaN;
  const est = (d.estrategias || []).filter(e => Number.isFinite(e.rentMes)).map(e => ({ nome: curto(e.nome), pct: e.pct, rent: e.rentMes, cdi: pcdi(e.rentMes) })).sort((a, b) => b.rent - a.rent);
  const atv = (d.ativos || []).filter(a => Number.isFinite(a.rentMes) && a.saldo > 0 && !a.sintetico).sort((a, b) => b.rentMes - a.rentMes);
  const m = r.periodos?.['MÊS'] || {}, ano = r.periodos?.ANO || {};
  return { patrimonio: r.patrimonio || d.patrimonio, rentMes: r.rentMes, cdiMesPct: Number.isFinite(m.cdi) ? m.cdi : pcdi(r.rentMes), ganho: r.ganhoMes, ano, est,
    top: atv.slice(0, 3), piores: atv.length > 3 ? atv.slice(-2).reverse() : [], mes: mesRef(d) };
}
function textoEmail(c, rel) {
  const x = dadosCliente(rel), ass = $('ass').value.trim();
  const L = [`Olá, ${c.nome || ''}!`.replace(', !', '!'), '', `Segue em anexo o seu relatório de investimentos de ${x.mes.toLowerCase()}.`, ''];
  if (CFG.macro.trim()) L.push('CENÁRIO', CFG.macro.trim(), '');
  L.push(`SUA CARTEIRA EM ${x.mes.toUpperCase()}`, `• Patrimônio: ${brl(x.patrimonio)}`, `• Rentabilidade no mês: ${ps(x.rentMes)}${Number.isFinite(x.cdiMesPct) ? ` (${n2(x.cdiMesPct, 0)}% do CDI)` : ''}`, `• Resultado financeiro: ${brl(x.ganho)}`);
  if (CFG.ano && Number.isFinite(x.ano.rent)) L.push(`• No ano: ${ps(x.ano.rent)} (${n2(x.ano.cdi, 0)}% do CDI)`);
  if (CFG.cat && x.est.length) { L.push('', 'RENTABILIDADE POR ESTRATÉGIA'); x.est.forEach(e => L.push(`• ${e.nome}: ${ps(e.rent)}${Number.isFinite(e.cdi) && e.rent > 0 ? ` (${n2(e.cdi, 0)}% do CDI)` : ''}`)); }
  if (CFG.top && x.top.length) {
    L.push('', 'DESTAQUES DO MÊS', `Melhores: ${x.top.map(a => `${a.nome} (${ps(a.rentMes)})`).join('; ')}`);
    if (x.piores.length) L.push(`Menor desempenho: ${x.piores.map(a => `${a.nome} (${ps(a.rentMes)})`).join('; ')}`);
  }
  L.push('', 'Fico à disposição para conversarmos.', '', 'Abraço,', ass, '', 'Rentabilidade passada não é garantia de rentabilidade futura.');
  return L.join('\n');
}
function htmlEmail(c, rel) {
  const x = dadosCliente(rel), h = Email.h, ass = $('ass').value.trim();
  const cor = v => `color:${v > 0 ? h.cor.bom : v < 0 ? h.cor.ruim : '#26233a'}`;
  let html = h.p(`Olá, ${esc(c.nome || '')}!`.replace(', !', '!')) + h.p(`Segue em anexo o seu relatório de investimentos de <b>${esc(x.mes.toLowerCase())}</b>.`);
  if (CFG.macro.trim()) html += h.titulo('Cenário') + h.p(esc(CFG.macro.trim()).replace(/\n/g, '<br>'));
  html += h.titulo(`Sua carteira em ${esc(x.mes.toLowerCase())}`) + h.tabela(['', ''], [
    ['Patrimônio', `<b>${brl(x.patrimonio)}</b>`],
    ['Rentabilidade no mês', `<b style="${cor(x.rentMes)}">${ps(x.rentMes)}</b>${Number.isFinite(x.cdiMesPct) ? ` (${n2(x.cdiMesPct, 0)}% do CDI)` : ''}`],
    ['Resultado financeiro', brl(x.ganho)],
    ...(CFG.ano && Number.isFinite(x.ano.rent) ? [['No ano', `<span style="${cor(x.ano.rent)}">${ps(x.ano.rent)}</span> (${n2(x.ano.cdi, 0)}% do CDI)`]] : []),
  ], ['left', 'right']);
  if (CFG.cat && x.est.length) html += h.titulo('Rentabilidade por estratégia') + h.tabela(['Estratégia', '% da carteira', 'No mês', '% do CDI'], x.est.map(e => [esc(e.nome), n2(e.pct) + '%', `<span style="${cor(e.rent)}">${ps(e.rent)}</span>`, Number.isFinite(e.cdi) && e.rent > 0 ? n2(e.cdi, 0) + '%' : '—']), ['left', 'right', 'right', 'right']);
  if (CFG.top && x.top.length) {
    html += h.titulo('Destaques do mês') + h.tabela(['Melhores ativos', 'No mês'], x.top.map(a => [esc(a.nome), `<span style="${cor(a.rentMes)}">${ps(a.rentMes)}</span>`]), ['left', 'right']);
    if (x.piores.length) html += h.tabela(['Menor desempenho', 'No mês'], x.piores.map(a => [esc(a.nome), `<span style="${cor(a.rentMes)}">${ps(a.rentMes)}</span>`]), ['left', 'right']);
  }
  html += h.p('Fico à disposição para conversarmos.') + h.p('Abraço,') + h.assinatura(ass) + h.rodape('Rentabilidade passada não é garantia de rentabilidade futura. Dados do relatório XPerformance em anexo.');
  return h.wrap(html);
}

// ---------- Tabela ----------
const emailOk = e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e || '');
function linhas() {
  return CLI.map(c => ({ c, rel: REL.get(c.codigo) })).sort((a, b) => (!!b.rel - !!a.rel) || (a.c.nome || '').localeCompare(b.c.nome || '', 'pt-BR'));
}
function status(c, rel) {
  if (!rel) return ['warn', 'Sem relatório'];
  if (!emailOk(c.email)) return ['bad', 'Sem e-mail'];
  if (c.semCadastro) return ['orange', 'Fora da planilha'];
  return ['good', 'Pronto'];
}
const pronto = (c, rel) => rel && emailOk(c.email) && !CFG.excluidos.includes(c.codigo);
function render() {
  const L = linhas();
  const prontos = L.filter(x => pronto(x.c, x.rel)).length, semRel = L.filter(x => !x.rel).length, semMail = L.filter(x => x.rel && !emailOk(x.c.email)).length;
  $('kpis').innerHTML = `<div class="kpi" style="background:var(--good-soft)"><div class="l">Prontos para enviar</div><div class="v good">${prontos}</div></div>
    <div class="kpi"><div class="l">Relatórios lidos</div><div class="v">${REL.size}</div></div>
    <div class="kpi"><div class="l">Sem relatório</div><div class="v warn">${semRel}</div></div>
    <div class="kpi"><div class="l">Sem e-mail</div><div class="v ${semMail ? 'bad' : ''}">${semMail}</div></div>`;
  $('tCli').innerHTML = L.length ? `<thead><tr><th></th><th>Código</th><th>Nome</th><th>E-mail</th><th>Relatório</th><th class="n">Mês</th><th>Situação</th><th></th></tr></thead><tbody>${L.map(({ c, rel }) => {
    const [cls, txt] = status(c, rel), x = rel ? dadosCliente(rel) : null;
    return `<tr data-c="${esc(c.codigo)}">
      <td><input type="checkbox" data-inc ${pronto(c, rel) ? 'checked' : ''} ${rel && emailOk(c.email) ? '' : 'disabled'}></td>
      <td><b>${esc(c.codigo)}</b></td>
      <td><input type="text" data-f="nome" value="${esc(c.nome)}" style="min-width:110px"></td>
      <td><input type="email" data-f="email" value="${esc(c.email)}" placeholder="e-mail" style="min-width:200px"></td>
      <td class="sub" style="font-size:12px;max-width:220px;white-space:normal">${rel ? esc(rel.arquivo) : '—'}</td>
      <td class="n">${x ? `<b class="${x.rentMes >= 0 ? 'good' : 'bad'}">${ps(x.rentMes)}</b><div class="note">${Number.isFinite(x.cdiMesPct) ? n2(x.cdiMesPct, 0) + '% CDI' : ''}</div>` : '—'}</td>
      <td><span class="pill ${cls}">${txt}</span></td>
      <td style="white-space:nowrap">${rel ? `<button class="sm ghost" data-ver title="Ver e enviar este e-mail">✉️</button><button class="sm ghost" data-eml title="Baixar só este e-mail">⬇</button>` : ''}<button class="sm danger" data-del title="Remover da lista">✕</button></td>
    </tr>`;
  }).join('')}</tbody>` : '<tbody><tr><td class="note">Importe a planilha de clientes e os XPerformance.</td></tr></tbody>';
  $('infoZip').textContent = prontos ? `${prontos} e-mail(s) com o XPerformance anexado` : '';
}
$('tCli').addEventListener('change', e => {
  const tr = e.target.closest('tr[data-c]'); if (!tr) return;
  const c = CLI.find(x => x.codigo === tr.dataset.c);
  if (e.target.dataset.inc !== undefined) { CFG.excluidos = e.target.checked ? CFG.excluidos.filter(x => x !== c.codigo) : [...CFG.excluidos, c.codigo]; salvarCfg(); render(); return; }
  const f = e.target.dataset.f; if (!f) return;
  c[f] = e.target.value.trim(); if (f === 'email') c.email = c.email.toLowerCase();
  salvarCli(); render();
});
async function emlDe(c, rel) {
  const anexo = { nome: ascii(rel.arquivo.replace(/\.pdf$/i, '')) + '.pdf', dados: new Uint8Array(await rel.blob.arrayBuffer()) };
  return ArquivosLite.criarEml({ para: c.email, assunto: CFG.assunto || `Seu relatório de investimentos · ${mesRef(rel.d)}`, texto: textoEmail(c, rel), html: htmlEmail(c, rel), anexo });
}
function baixar(nome, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); }
$('tCli').addEventListener('click', async e => {
  const tr = e.target.closest('tr[data-c]'); if (!tr) return;
  const c = CLI.find(x => x.codigo === tr.dataset.c), rel = REL.get(c.codigo);
  if (e.target.closest('[data-del]')) { CLI = CLI.filter(x => x !== c); REL.delete(c.codigo); salvarCli(); render(); }
  if (e.target.closest('[data-eml]')) { if (!emailOk(c.email)) { toast('Informe o e-mail do cliente'); return; } baixar(`${ascii(c.nome || 'cliente')}_${c.codigo}.eml`, new Blob([await emlDe(c, rel)], { type: 'message/rfc822' })); }
  if (e.target.closest('[data-ver]')) {
    Email.abrir({ assunto: CFG.assunto, nome: c.nome, para: c.email, texto: () => textoEmail(c, rel), html: () => htmlEmail(c, rel),
      aoSalvarCliente: (nome, para) => { if (nome) c.nome = nome.split(/\s+/)[0]; if (para) c.email = para; salvarCli(); render(); } });
  }
});

// ---------- Baixar todos ----------
$('btnZip').onclick = async () => {
  const L = linhas().filter(x => pronto(x.c, x.rel));
  if (!L.length) { toast('Nenhum cliente pronto (precisa de relatório e e-mail)'); return; }
  if (CFG.macro.includes('[Escreva aqui') && !confirm('O comentário macro ainda tem o trecho "[Escreva aqui…]". Baixar assim mesmo?')) return;
  const TAM = 50, z = ArquivosLite.novoZip(), nLotes = Math.ceil(L.length / TAM);
  for (let i = 0; i < L.length; i++) {
    const { c, rel } = L[i], lote = Math.floor(i / TAM);
    const pasta = nLotes > 1 ? `Lote ${String(lote + 1).padStart(2, '0')} (${lote * TAM + 1}-${Math.min(L.length, (lote + 1) * TAM)})/` : '';
    z.add(`${pasta}${ascii(c.nome || 'cliente')}_${c.codigo}.eml`, await emlDe(c, rel));
    if (i % 10 === 0) { $('infoZip').textContent = `Gerando ${i + 1} de ${L.length}…`; await new Promise(r => setTimeout(r, 0)); }
  }
  baixar(`emails-relatorios-${ascii(mesRef()).toLowerCase() || todayISO()}.zip`, z.blob());
  $('infoZip').textContent = `${L.length} e-mail(s) gerado(s)${nLotes > 1 ? `, separados em ${nLotes} pastas de até ${TAM}` : ''}. Extraia o .zip e dê dois cliques em cada arquivo para abrir no Outlook.`;
};
$('btnCsv').onclick = () => {
  const L = linhas(), csv = [['Código', 'Nome', 'E-mail', 'Relatório', 'Rent. mês', 'Situação']].concat(L.map(({ c, rel }) => [c.codigo, c.nome, c.email, rel ? rel.arquivo : '', rel ? ps(dadosCliente(rel).rentMes) : '', status(c, rel)[1]]));
  baixar(`disparo-${todayISO()}.csv`, new Blob(['﻿' + csv.map(l => l.map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(';')).join('\n')], { type: 'text/csv;charset=utf-8' }));
};

// ---------- Campos ----------
$('macro').value = CFG.macro; $('assunto').value = CFG.assunto;
$('ass').value = store.get('rw_assinatura', 'Italo Nunes\nAssessor de Investimentos');
$('optCat').checked = CFG.cat; $('optTop').checked = CFG.top; $('optAno').checked = CFG.ano;
$('macro').addEventListener('input', e => { CFG.macro = e.target.value; salvarCfg(); });
$('assunto').addEventListener('input', e => { CFG.assunto = e.target.value; salvarCfg(); });
$('ass').addEventListener('input', e => store.set('rw_assinatura', e.target.value));
[['optCat', 'cat'], ['optTop', 'top'], ['optAno', 'ano']].forEach(([id, k]) => $(id).addEventListener('change', e => { CFG[k] = e.target.checked; salvarCfg(); }));
if (CLI.length) $('infoPlan').innerHTML = `<span class="pill">${CLI.filter(c => !c.semCadastro).length} clientes salvos neste navegador</span> <span class="note">importe de novo para atualizar</span>`;
carregarDados('macro.json').then(m => { MACRO = m; }).catch(() => {});
render();
