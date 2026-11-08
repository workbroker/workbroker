// Boleta de ações: ordens C/V, e-mail de de acordo e lote para o broker
const $ = id => document.getElementById(id);
const COLS = ['Ativo_Ticker', 'Operação', 'Quantidade', 'Código_Cliente', 'Preço'];
const STATUS = ['Aguardando de acordo', 'De acordo', 'Enviada'];

const novaOrdem = () => ({ id: uid(), ticker: '', op: 'C', qtd: '', tipoPreco: 'mercado', preco: '' });
let B = Object.assign({ nome: '', codigo: '', email: '', ordens: [novaOrdem()] }, store.get('rw_boleta', {}));
let LOTE = store.get('rw_lote', []);
const salvar = () => { store.set('rw_boleta', B); store.set('rw_lote', LOTE); };

const qtdNum = o => parseInt(String(o.qtd).replace(/\D/g, ''), 10) || 0;
const precoTxt = o => o.tipoPreco === 'mercado' || !(parseNum(o.preco) > 0) ? 'A mercado' : NUM2.format(parseNum(o.preco));
const opTxt = op => op === 'V' ? 'Venda' : 'Compra';
const validas = () => B.ordens.filter(o => o.ticker.trim() && qtdNum(o) > 0);

function renderOrdens() {
  $('ordens').innerHTML = B.ordens.map(o => `
    <div class="ord" data-id="${o.id}">
      <label class="f tk"><span class="lbl">Ativo</span><input data-k="ticker" value="${esc(o.ticker)}" placeholder="PETR4" autocapitalize="characters" maxlength="12"></label>
      <label class="f op"><span class="lbl">Operação</span><select data-k="op" class="opsel ${o.op}"><option value="C" ${o.op === 'C' ? 'selected' : ''}>C · Compra</option><option value="V" ${o.op === 'V' ? 'selected' : ''}>V · Venda</option></select></label>
      <label class="f qt"><span class="lbl">Quantidade</span><input data-k="qtd" inputmode="numeric" value="${esc(o.qtd)}" placeholder="100"></label>
      <label class="f pr"><span class="lbl">Preço</span><div class="preco">
        <select data-k="tipoPreco"><option value="mercado" ${o.tipoPreco === 'mercado' ? 'selected' : ''}>Mercado</option><option value="limite" ${o.tipoPreco === 'limite' ? 'selected' : ''}>Limite</option></select>
        <input data-k="preco" inputmode="decimal" value="${esc(o.preco)}" placeholder="R$" ${o.tipoPreco === 'mercado' ? 'disabled' : ''}></div></label>
      <div class="dl"><button class="danger" data-del title="Remover">✕</button></div>
    </div>`).join('');
}

function renderResumo() {
  const v = validas();
  const comp = v.filter(o => o.op === 'C'), vend = v.filter(o => o.op === 'V');
  const valor = l => l.reduce((s, o) => s + (o.tipoPreco === 'limite' && parseNum(o.preco) > 0 ? qtdNum(o) * parseNum(o.preco) : 0), 0);
  $('resumo').innerHTML = `
    <div class="kpi"><div class="l">Ordens</div><div class="v">${v.length}</div><div class="s">${comp.length} compra(s) · ${vend.length} venda(s)</div></div>
    <div class="kpi"><div class="l">Compras (limitadas)</div><div class="v good">${brl(valor(comp))}</div></div>
    <div class="kpi"><div class="l">Vendas (limitadas)</div><div class="v bad">${brl(valor(vend))}</div></div>`;
}

function renderLote() {
  const tb = $('tLote').querySelector('tbody');
  if (!LOTE.length) { tb.innerHTML = '<tr><td colspan="8" class="note">Nenhuma ordem no lote. Use "Mandar para o lote do broker" depois de montar as ordens.</td></tr>'; return; }
  tb.innerHTML = LOTE.map(o => `<tr data-id="${o.id}">
    <td><b>${esc(o.ticker)}</b></td><td class="${o.op === 'V' ? 'bad' : 'good'}"><b>${o.op}</b></td><td class="n">${qtdNum(o).toLocaleString('pt-BR')}</td>
    <td>${esc(o.codigo)}</td><td>${esc(precoTxt(o))}</td><td>${esc(o.nome || '')}</td>
    <td><select class="st ${o.status.split(' ')[0]}" data-st>${STATUS.map(s => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
    <td><button class="danger" data-del>✕</button></td></tr>`).join('');
}

function renderTudo() {
  $('nome').value = B.nome; $('codigo').value = B.codigo; $('email').value = B.email;
  renderOrdens(); renderResumo(); renderLote();
}

// ---------- Eventos: cliente e ordens ----------
['nome', 'codigo', 'email'].forEach(k => $(k).addEventListener('input', e => { B[k] = e.target.value.trim(); salvar(); }));
$('ordens').addEventListener('input', e => {
  const el = e.target.closest('.ord'); if (!el || !e.target.dataset.k) return;
  const o = B.ordens.find(x => x.id === el.dataset.id), k = e.target.dataset.k;
  o[k] = k === 'ticker' ? e.target.value.toUpperCase().replace(/\s/g, '') : e.target.value;
  if (k === 'ticker') e.target.value = o.ticker;
  if (k === 'op') e.target.className = 'opsel ' + o.op;
  if (k === 'tipoPreco') { renderOrdens(); if (o.tipoPreco === 'limite') document.querySelector(`.ord[data-id="${o.id}"] [data-k="preco"]`).focus(); }
  salvar(); renderResumo();
});
$('ordens').addEventListener('click', e => {
  if (!e.target.closest('[data-del]')) return;
  B.ordens = B.ordens.filter(o => o.id !== e.target.closest('.ord').dataset.id);
  if (!B.ordens.length) B.ordens.push(novaOrdem());
  salvar(); renderOrdens(); renderResumo();
});
$('btnAdd').onclick = () => {
  B.ordens.push(novaOrdem()); salvar(); renderOrdens(); renderResumo();
  document.querySelector('#ordens .ord:last-child [data-k="ticker"]').focus();
};
$('btnLimpar').onclick = () => { B.ordens = [novaOrdem()]; salvar(); renderOrdens(); renderResumo(); };

function exigir() {
  if (!validas().length) { toast('Preencha ao menos uma ordem com ativo e quantidade'); return false; }
  if (!B.codigo) { toast('Informe o código do cliente'); $('codigo').focus(); return false; }
  return true;
}

// ---------- Tabelas (texto e HTML) ----------
const linha = (o, cod) => [o.ticker, o.op, qtdNum(o).toLocaleString('pt-BR'), cod ?? o.codigo, precoTxt(o)];
function tabelaTexto(ordens, cod) {
  return [COLS.join(' | '), ...ordens.map(o => linha(o, cod).join(' | '))].join('\n');
}
function tabelaHtml(ordens, cod) {
  return Email.h.tabela(COLS, ordens.map(o => {
    const l = linha(o, cod).map(esc);
    l[0] = `<b>${l[0]}</b>`;
    l[1] = `<b style="color:${o.op === 'V' ? Email.h.cor.ruim : Email.h.cor.bom}">${l[1]}</b>`;
    return l;
  }), ['left', 'center', 'right', 'center', 'center']);
}
const tsv = (ordens, cod) => [COLS.join('\t'), ...ordens.map(o => [o.ticker, o.op, qtdNum(o), cod ?? o.codigo, precoTxt(o)].join('\t'))].join('\n');

// ---------- E-mail de de acordo para o cliente ----------
$('btnEmail').onclick = () => {
  if (!exigir()) return;
  const ord = validas();
  Email.abrir({
    assunto: `De acordo: ordens de renda variável · conta ${B.codigo}`,
    nome: B.nome, para: B.email,
    texto: (nome, ass) => [
      Email.saudacaoTexto(nome), '',
      'Conforme conversamos, seguem as operações de renda variável propostas para a sua conta:', '',
      tabelaTexto(ord, B.codigo), '',
      '(C = compra, V = venda)', '',
      'Para que eu possa encaminhar as ordens à mesa de operações, peço, por gentileza, que responda a este e-mail com o seu DE ACORDO.', '',
      'Ordens "a mercado" são executadas pelo preço disponível no momento da execução. Ordens com preço limitado só são executadas se o preço for atingido.', '',
      'Abraço,', ass,
    ].join('\n'),
    html: (nome, ass) => Email.h.wrap(
      Email.h.p(Email.h.saudacao(nome)) +
      Email.h.p('Conforme conversamos, seguem as operações de renda variável propostas para a sua conta:') +
      tabelaHtml(ord, B.codigo) +
      Email.h.p('<span style="color:#6d6a80;font-size:12px">C = compra · V = venda</span>') +
      Email.h.destaque('Para que eu possa encaminhar as ordens à mesa de operações, peço, por gentileza, que responda a este e-mail com o seu DE ACORDO.', 'neutro') +
      Email.h.p('Abraço,') + Email.h.assinatura(ass) +
      Email.h.rodape('Ordens "a mercado" são executadas pelo preço disponível no momento da execução. Ordens com preço limitado só são executadas se o preço for atingido. Rentabilidade passada não garante rentabilidade futura.')
    ),
    aoSalvarCliente: (nome, para) => { B.nome = nome || B.nome; B.email = para; $('nome').value = B.nome; $('email').value = B.email; salvar(); },
  });
};
$('btnCopiar').onclick = () => { if (exigir()) copyText(tsv(validas(), B.codigo)); };
$('btnLote').onclick = () => {
  if (!exigir()) return;
  validas().forEach(o => LOTE.push({ ...o, id: uid(), codigo: B.codigo, nome: B.nome, status: 'Aguardando de acordo', criado: new Date().toISOString() }));
  salvar(); renderLote();
  toast(`${validas().length} ordem(ns) no lote do broker`);
};

// ---------- Lote do broker ----------
$('tLote').addEventListener('change', e => {
  if (!e.target.matches('[data-st]')) return;
  const o = LOTE.find(x => x.id === e.target.closest('tr').dataset.id);
  o.status = e.target.value; e.target.className = 'st ' + o.status.split(' ')[0]; salvar();
});
$('tLote').addEventListener('click', e => {
  if (!e.target.closest('[data-del]')) return;
  LOTE = LOTE.filter(o => o.id !== e.target.closest('tr').dataset.id); salvar(); renderLote();
});
const comAcordo = () => LOTE.filter(o => o.status === 'De acordo');
$('btnCopiarLote').onclick = () => {
  const l = comAcordo(); if (!l.length) { toast('Nenhuma ordem com status "De acordo"'); return; }
  copyText(tsv(l));
};
$('btnBroker').onclick = () => {
  const l = comAcordo(); if (!l.length) { toast('Nenhuma ordem com status "De acordo"'); return; }
  const hoje = new Date().toLocaleDateString('pt-BR');
  Email.abrir({
    assunto: `Ordens RV com de acordo · ${hoje}`,
    nome: '', para: store.get('rw_broker_email', ''),
    texto: (nome, ass) => ['Olá!', '', `Seguem ${l.length} ordem(ns) com de acordo dos clientes para execução:`, '', tabelaTexto(l), '', 'Obrigado!', ass].join('\n'),
    html: (nome, ass) => Email.h.wrap(Email.h.p('Olá!') + Email.h.p(`Seguem ${l.length} ordem(ns) com de acordo dos clientes para execução:`) + tabelaHtml(l) + Email.h.p('Obrigado!') + Email.h.assinatura(ass)),
    aoSalvarCliente: (nome, para) => store.set('rw_broker_email', para),
  });
};
$('btnMarcar').onclick = () => {
  const l = comAcordo(); if (!l.length) { toast('Nenhuma ordem com status "De acordo"'); return; }
  l.forEach(o => o.status = 'Enviada'); salvar(); renderLote(); toast('Marcadas como enviadas');
};
$('btnLimparLote').onclick = () => { LOTE = LOTE.filter(o => o.status !== 'Enviada'); salvar(); renderLote(); };

renderTudo();
