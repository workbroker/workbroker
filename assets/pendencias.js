// Pendências do dia a dia: salvas no navegador e, opcionalmente, num repositório privado do GitHub
const $ = id => document.getElementById(id);
const URG = ['Urgente', 'Alta', 'Média', 'Baixa'];
const ETAPAS = ['Não iniciado', 'Em andamento', 'Esperando terceiros', 'Esperando cliente', 'Parado', 'Concluído'];
const COLS_QUADRO = ['Não iniciado', 'Em andamento', 'Esperando terceiros', 'Esperando cliente', 'Parado'];
const PESO_URG = { Urgente: 0, Alta: 1, 'Média': 2, Baixa: 3 };
const ARQ = 'pendencias.json';
const SLUG_E = { 'Não iniciado': 'nao', 'Em andamento': 'andamento', 'Esperando terceiros': 'terceiros', 'Esperando cliente': 'cliente', 'Parado': 'parado', 'Concluído': 'concluido' };
const cu = u => 'u-' + String(u).normalize('NFD').replace(/[\u0300-\u036f]/g, '');

let P = Object.assign({ itens: [] }, store.get('rw_pend', {}));
let CFG = Object.assign({ repo: '', token: '', sha: '', ultimo: '' }, store.get('rw_pend_nuvem', {}));
let vista = store.get('rw_pend_vista', 'lista');
const agora = () => new Date().toISOString();
const vivos = () => P.itens.filter(t => !t.deleted);

function salvar(sincronizar = true) {
  store.set('rw_pend', P);
  if (sincronizar) agendarSync();
}

// ---------- Opções dos selects ----------
const opts = (lista, sel) => lista.map(x => `<option ${x === sel ? 'selected' : ''}>${x}</option>`).join('');
$('aUrg').innerHTML = opts(URG, 'Média');
$('aEta').innerHTML = opts(ETAPAS, 'Não iniciado');
$('fUrg').innerHTML += opts(URG);
$('fEta').innerHTML += opts(ETAPAS);

// ---------- Adicionar ----------
function adicionar() {
  const txt = $('aTxt').value.trim();
  if (!txt) { toast('Escreva a tarefa'); $('aTxt').focus(); return; }
  P.itens.unshift({
    id: uid() + Date.now().toString(36), cliente: $('aCli').value.trim(), tarefa: txt,
    urgencia: $('aUrg').value, etapa: $('aEta').value, depende: $('aDep').value.trim(), prazo: $('aPrazo').value,
    criada: todayISO(), atualizada: agora(),
  });
  $('aTxt').value = ''; $('aDep').value = ''; $('aPrazo').value = '';
  salvar(); render(); $('aTxt').focus();
  toast('Pendência adicionada');
}
$('btnAdd').onclick = adicionar;
['aCli', 'aTxt', 'aDep'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter') adicionar(); }));

// ---------- Filtros e ordenação ----------
function filtrados() {
  const q = $('fBusca').value.trim().toLowerCase(), u = $('fUrg').value, e = $('fEta').value, conc = $('fConc').checked;
  return vivos().filter(t =>
    (!q || `${t.cliente} ${t.tarefa} ${t.depende}`.toLowerCase().includes(q)) &&
    (!u || t.urgencia === u) && (!e || t.etapa === e) && (conc || e === 'Concluído' || t.etapa !== 'Concluído'))
    .sort((a, b) => (a.etapa === 'Concluído') - (b.etapa === 'Concluído') || PESO_URG[a.urgencia] - PESO_URG[b.urgencia] || (a.prazo || '9999').localeCompare(b.prazo || '9999') || a.criada.localeCompare(b.criada));
}
const diasDesde = d => daysBetween(d, todayISO());
const atrasada = t => t.prazo && t.etapa !== 'Concluído' && t.prazo < todayISO();
function quando(t) {
  const d = diasDesde(t.criada);
  const criada = d === 0 ? 'hoje' : d === 1 ? 'ontem' : `há ${d} dias`;
  const prazo = t.prazo ? `<span class="${atrasada(t) ? 'atrasada' : ''}">prazo ${fmtDate(t.prazo).slice(0, 5)}${atrasada(t) ? ' · atrasada' : ''}</span>` : '';
  return `<b>${fmtDate(t.criada)}</b>${criada}${prazo ? '<br>' + prazo : ''}`;
}

// ---------- Renderização ----------
function renderKpis() {
  const A = vivos().filter(t => t.etapa !== 'Concluído');
  const n = f => A.filter(f).length;
  const conclHoje = vivos().filter(t => t.etapa === 'Concluído' && (t.concluida || '').slice(0, 10) === todayISO()).length;
  $('kpis').innerHTML = `
    <div class="kpi"><div class="l">Em aberto</div><div class="v">${A.length}</div><div class="s">${conclHoje ? `${conclHoje} concluída(s) hoje` : ''}</div></div>
    <div class="kpi" style="background:#fde2e1"><div class="l">Urgentes</div><div class="v bad">${n(t => t.urgencia === 'Urgente')}</div><div class="s">${n(t => t.urgencia === 'Alta')} de alta urgência</div></div>
    <div class="kpi" style="background:#fff1dc"><div class="l">Esperando alguém</div><div class="v warn">${n(t => /Esperando/.test(t.etapa))}</div><div class="s">terceiros ou cliente</div></div>
    <div class="kpi"><div class="l">Atrasadas</div><div class="v ${n(atrasada) ? 'bad' : ''}">${n(atrasada)}</div><div class="s">prazo vencido</div></div>
    <div class="kpi"><div class="l">Paradas há +7 dias</div><div class="v">${n(t => t.etapa === 'Parado' && diasDesde((t.atualizada || t.criada).slice(0, 10)) > 7)}</div><div class="s">sem movimento</div></div>`;
}

function renderLista(L) {
  if (!L.length) return '<p class="note" style="padding:14px 0">Nenhuma pendência por aqui. 🎉</p>';
  return `<div class="lista"><div class="item head"><div>Cliente</div><div>Tarefa</div><div>Urgência</div><div>Etapa</div><div>Depende de</div><div>Criada</div><div></div></div>
    ${L.map(t => `<div class="item ${t.etapa === 'Concluído' ? 'done' : ''}" data-id="${t.id}">
      <div class="c-cli"><span class="cli" contenteditable="true" data-f="cliente" spellcheck="false">${esc(t.cliente)}</span></div>
      <div class="c-txt"><div class="txt" contenteditable="true" data-f="tarefa">${esc(t.tarefa)}</div></div>
      <div class="c-urg"><select class="chip ${cu(t.urgencia)}" data-f="urgencia">${opts(URG, t.urgencia)}</select></div>
      <div class="c-eta"><select class="chip e-${SLUG_E[t.etapa]}" data-f="etapa">${opts(ETAPAS, t.etapa)}</select></div>
      <div class="c-dep"><div class="dep" contenteditable="true" data-f="depende">${esc(t.depende)}</div></div>
      <div class="c-dt dt">${quando(t)}</div>
      <div class="ac">${t.etapa !== 'Concluído' ? '<button class="ghost" data-concluir title="Concluir">✔</button>' : '<button class="ghost" data-reabrir title="Reabrir">↺</button>'}<button class="danger" data-del title="Excluir">✕</button></div>
    </div>`).join('')}</div>`;
}

function renderQuadro(L) {
  const cols = $('fConc').checked ? [...COLS_QUADRO, 'Concluído'] : COLS_QUADRO;
  return `<div class="quadro" style="grid-template-columns:repeat(${cols.length}, minmax(220px, 1fr))">${cols.map(c => {
    const itens = L.filter(t => t.etapa === c);
    return `<div class="col" data-col="${c}"><h3><span>${c}</span><span class="muted">${itens.length}</span></h3>
      ${itens.map(t => `<div class="card-t ${cu(t.urgencia)}" draggable="true" data-id="${t.id}">
        <div class="cli">${esc(t.cliente || 'Sem cliente')}</div><div class="tt">${esc(t.tarefa)}</div>
        <div class="mt"><span>${t.urgencia}${t.depende ? ' · ' + esc(t.depende) : ''}</span><span class="${atrasada(t) ? 'atrasada' : ''}">${t.prazo ? 'prazo ' + fmtDate(t.prazo).slice(0, 5) : diasDesde(t.criada) ? 'há ' + diasDesde(t.criada) + 'd' : 'hoje'}</span></div>
      </div>`).join('')}</div>`;
  }).join('')}</div><p class="note">Arraste os cartões entre as colunas para mudar a etapa. Para editar, use a Lista.</p>`;
}

function render() {
  const L = filtrados();
  $('vista').innerHTML = vista === 'quadro' ? renderQuadro(L) : renderLista(L);
  document.querySelectorAll('#segVista button').forEach(b => b.classList.toggle('on', b.dataset.v === vista));
  renderKpis();
}

// ---------- Edição ----------
const achar = el => P.itens.find(t => t.id === el.closest('[data-id]').dataset.id);
function alterar(t, campo, valor) {
  if (t[campo] === valor) return;
  t[campo] = valor; t.atualizada = agora();
  if (campo === 'etapa') t.concluida = valor === 'Concluído' ? agora() : '';
  salvar();
}
$('vista').addEventListener('change', e => {
  const f = e.target.dataset.f; if (!f) return;
  alterar(achar(e.target), f, e.target.value); render();
});
$('vista').addEventListener('focusout', e => {
  const f = e.target.dataset.f; if (!f || e.target.tagName === 'SELECT') return;
  alterar(achar(e.target), f, e.target.textContent.trim()); renderKpis();
});
$('vista').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.isContentEditable) { e.preventDefault(); e.target.blur(); } });
$('vista').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || !b.closest('[data-id]')) return;
  const t = achar(b);
  if (b.hasAttribute('data-concluir')) { alterar(t, 'etapa', 'Concluído'); toast('Concluída ✔'); }
  if (b.hasAttribute('data-reabrir')) alterar(t, 'etapa', 'Em andamento');
  if (b.hasAttribute('data-del')) {
    if (!confirm('Excluir esta pendência?')) return;
    t.deleted = true; t.atualizada = agora(); salvar();
  }
  render();
});
// arrastar no quadro
$('vista').addEventListener('dragstart', e => { const c = e.target.closest('.card-t'); if (c) e.dataTransfer.setData('text/plain', c.dataset.id); });
$('vista').addEventListener('dragover', e => { const col = e.target.closest('.col'); if (col) { e.preventDefault(); col.classList.add('over'); } });
$('vista').addEventListener('dragleave', e => { const col = e.target.closest('.col'); if (col) col.classList.remove('over'); });
$('vista').addEventListener('drop', e => {
  const col = e.target.closest('.col'); if (!col) return; e.preventDefault();
  const t = P.itens.find(x => x.id === e.dataTransfer.getData('text/plain'));
  if (t) { alterar(t, 'etapa', col.dataset.col); render(); }
});

['fBusca', 'fUrg', 'fEta', 'fConc'].forEach(id => $(id).addEventListener('input', render));
$('segVista').onclick = e => { const b = e.target.closest('button'); if (!b) return; vista = b.dataset.v; store.set('rw_pend_vista', vista); render(); };

// ---------- Exportar / importar ----------
function baixar(nome, conteudo, tipo) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([conteudo], { type: tipo })); a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$('btnCsv').onclick = () => {
  const linhas = [['Cliente', 'Tarefa', 'Urgência', 'Etapa', 'Depende de', 'Criada em', 'Prazo', 'Concluída em']]
    .concat(vivos().map(t => [t.cliente, t.tarefa, t.urgencia, t.etapa, t.depende, fmtDate(t.criada), t.prazo ? fmtDate(t.prazo) : '', t.concluida ? fmtDate(t.concluida.slice(0, 10)) : '']));
  baixar(`pendencias-${todayISO()}.csv`, '﻿' + linhas.map(l => l.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n'), 'text/csv;charset=utf-8');
};
$('btnJson').onclick = () => baixar(`pendencias-backup-${todayISO()}.json`, JSON.stringify(P, null, 1), 'application/json');
$('btnImp').onclick = () => $('fileImp').click();
$('fileImp').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try { const d = JSON.parse(await f.text()); if (!Array.isArray(d.itens)) throw 0; P = mesclar(P, d); salvar(); render(); toast('Cópia restaurada'); }
  catch { toast('Arquivo inválido'); }
  e.target.value = '';
};

// ---------- Nuvem (repositório privado no GitHub) ----------
// Junta duas versões: para cada pendência, vale a alteração mais recente (exclusões também contam)
function mesclar(a, b) {
  const m = new Map();
  [...(a.itens || []), ...(b.itens || [])].forEach(t => { const x = m.get(t.id); if (!x || (t.atualizada || '') > (x.atualizada || '')) m.set(t.id, t); });
  return { itens: [...m.values()].sort((x, y) => (y.criada || '').localeCompare(x.criada || '')) };
}
const b64e = s => btoa(unescape(encodeURIComponent(s)));
const b64d = s => decodeURIComponent(escape(atob(s.replace(/\n/g, ''))));
function status(tipo, txt) { $('dot').className = 'dot ' + (tipo || ''); $('syncTxt').textContent = txt; }
async function gh(metodo, corpo) {
  const r = await fetch(`https://api.github.com/repos/${CFG.repo}/contents/${ARQ}`, {
    method: metodo, cache: 'no-store',
    headers: { Authorization: `Bearer ${CFG.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  return r;
}
let syncando = false, pendente = false, timer = null;
function agendarSync() {
  if (!CFG.repo || !CFG.token) { status('', 'Salvo neste navegador'); return; }
  status('busy', 'Salvando na nuvem…');
  clearTimeout(timer); timer = setTimeout(sincronizar, 1500);
}
async function sincronizar() {
  if (!CFG.repo || !CFG.token) return;
  if (syncando) { pendente = true; return; }
  syncando = true; status('busy', 'Sincronizando…');
  try {
    let remoto = { itens: [] }, sha;
    const r = await gh('GET');
    if (r.ok) { const j = await r.json(); sha = j.sha; remoto = JSON.parse(b64d(j.content)); }
    else if (r.status === 401 || r.status === 403) throw new Error('Token sem permissão');
    else if (r.status === 404) { const t = await fetch(`https://api.github.com/repos/${CFG.repo}`, { headers: { Authorization: `Bearer ${CFG.token}` } }); if (!t.ok) throw new Error('Repositório não encontrado'); }
    else throw new Error('GitHub respondeu ' + r.status);
    const junto = mesclar(P, remoto);
    const mudouRemoto = JSON.stringify(junto) !== JSON.stringify(remoto);
    P = junto; salvar(false);
    if (mudouRemoto) {
      const w = await gh('PUT', { message: `Pendências atualizadas ${new Date().toLocaleString('pt-BR')}`, content: b64e(JSON.stringify(junto, null, 1)), ...(sha ? { sha } : {}) });
      if (w.status === 409 || w.status === 422) { syncando = false; return sincronizar(); } // alguém salvou antes: junta de novo
      if (!w.ok) throw new Error('Falha ao salvar (' + w.status + ')');
    }
    CFG.ultimo = agora(); store.set('rw_pend_nuvem', CFG);
    status('ok', 'Na nuvem · ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    render();
  } catch (e) {
    status('err', 'Só neste navegador: ' + e.message);
  } finally {
    syncando = false;
    if (pendente) { pendente = false; agendarSync(); }
  }
}
$('nRepo').value = CFG.repo; $('nTok').value = CFG.token ? '••••••••' : '';
$('btnConectar').onclick = async () => {
  const repo = $('nRepo').value.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '');
  const tok = $('nTok').value.trim();
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) { toast('Informe o repositório como usuario/rico-dados'); return; }
  if (tok && !tok.startsWith('••')) CFG.token = tok;
  if (!CFG.token) { toast('Cole o token'); return; }
  CFG.repo = repo; store.set('rw_pend_nuvem', CFG);
  $('nTok').value = '••••••••';
  await sincronizar();
  if ($('dot').classList.contains('ok')) { toast('Conectado! As pendências estão na nuvem'); $('cardNuvem').open = false; }
};
$('btnSync').onclick = () => { if (!CFG.repo) { toast('Conecte primeiro'); return; } sincronizar(); };
$('btnDesconectar').onclick = () => {
  if (!confirm('Desconectar a nuvem neste aparelho? As pendências continuam salvas aqui e no GitHub.')) return;
  CFG = { repo: '', token: '', sha: '', ultimo: '' }; store.set('rw_pend_nuvem', CFG); $('nTok').value = ''; status('', 'Salvo neste navegador');
};

// ---------- Início ----------
if (!$('nRepo').value) $('nRepo').placeholder = 'workrico/rico-dados';
render();
if (CFG.repo && CFG.token) { sincronizar(); setInterval(sincronizar, 60 * 1000); }
else { status('', 'Salvo neste navegador · ative a cópia na nuvem'); $('cardNuvem').open = !vivos().length ? false : false; }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && CFG.repo) sincronizar(); });
