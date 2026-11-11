// Ordens de ações (C/V) e e-mail pedindo o de acordo do cliente.
// Usado na boleta de ações.
const Ordens = (() => {
  const COLS = ['Ativo_Ticker', 'Operação', 'Quantidade', 'Código_Cliente', 'Preço'];
  const nova = (o = {}) => ({ id: uid(), ticker: '', op: 'C', qtd: '', tipoPreco: 'mercado', preco: '', ...o });
  const qtdNum = o => parseInt(String(o.qtd).replace(/\D/g, ''), 10) || 0;
  const precoTxt = o => o.tipoPreco === 'mercado' || !(parseNum(o.preco) > 0) ? 'A mercado' : NUM2.format(parseNum(o.preco));

  // cfg: { el, chave, cliente: () => ({nome, codigo, email}), salvarCliente(nome, email), aoMudar() }
  function criar(cfg) {
    let lista = store.get(cfg.chave, null) || [];
    const salvar = () => { store.set(cfg.chave, lista); cfg.aoMudar && cfg.aoMudar(); };
    const validas = () => lista.filter(o => o.ticker.trim() && qtdNum(o) > 0);

    function render() {
      if (!lista.length) { cfg.el.innerHTML = '<p class="note" style="padding:8px 0">Nenhuma ordem. Use os botões Comprar/Vender na tabela ou adicione abaixo.</p>'; return; }
      cfg.el.innerHTML = `<div class="ord ord-head hide-sm"><div>Ativo</div><div>Operação</div><div>Quantidade</div><div>Preço</div><div></div></div>` + lista.map(o => `
        <div class="ord" data-id="${o.id}">
          <label class="f otk"><span class="lbl">Ativo</span><input data-k="ticker" value="${esc(o.ticker)}" placeholder="PETR4" autocapitalize="characters" maxlength="12"></label>
          <label class="f op"><span class="lbl">Operação</span><select data-k="op" class="opsel ${o.op}"><option value="C" ${o.op === 'C' ? 'selected' : ''}>C · Compra</option><option value="V" ${o.op === 'V' ? 'selected' : ''}>V · Venda</option></select></label>
          <label class="f qt"><span class="lbl">Quantidade</span><input data-k="qtd" inputmode="numeric" value="${esc(o.qtd)}" placeholder="100"></label>
          <label class="f pr"><span class="lbl">Preço</span><div class="preco">
            <select data-k="tipoPreco"><option value="mercado" ${o.tipoPreco === 'mercado' ? 'selected' : ''}>Mercado</option><option value="limite" ${o.tipoPreco === 'limite' ? 'selected' : ''}>Limite</option></select>
            <input data-k="preco" inputmode="decimal" value="${esc(o.preco)}" placeholder="R$" ${o.tipoPreco === 'mercado' ? 'disabled' : ''}></div></label>
          <div class="dl"><button class="danger" data-del title="Remover">✕</button></div>
        </div>`).join('');
    }
    cfg.el.addEventListener('input', e => {
      const el = e.target.closest('.ord'); if (!el || !e.target.dataset.k) return;
      const o = lista.find(x => x.id === el.dataset.id), k = e.target.dataset.k;
      o[k] = k === 'ticker' ? e.target.value.toUpperCase().replace(/\s/g, '') : e.target.value;
      if (k === 'ticker') e.target.value = o.ticker;
      if (k === 'op') e.target.className = 'opsel ' + o.op;
      if (k === 'tipoPreco') { render(); if (o.tipoPreco === 'limite') cfg.el.querySelector(`.ord[data-id="${o.id}"] [data-k="preco"]`).focus(); }
      salvar();
    });
    cfg.el.addEventListener('click', e => {
      if (!e.target.closest('[data-del]')) return;
      lista = lista.filter(o => o.id !== e.target.closest('.ord').dataset.id); salvar(); render();
    });

    function adicionar(o, focar = 'qtd') {
      const x = nova(o); lista.push(x); salvar(); render();
      const el = cfg.el.querySelector(`.ord[data-id="${x.id}"] [data-k="${o && o.ticker ? focar : 'ticker'}"]`);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => el.focus(), 300); }
    }
    function limpar() { lista = []; salvar(); render(); }
    function substituir(arr) { lista = arr.map(o => nova(o)); salvar(); render(); }

    const linha = (o, cod) => [o.ticker, o.op, qtdNum(o).toLocaleString('pt-BR'), cod, precoTxt(o)];
    function email() {
      const c = cfg.cliente(), ord = validas();
      if (!ord.length) { toast('Preencha ao menos uma ordem com ativo e quantidade'); return; }
      if (!c.codigo) { toast('Informe o código (conta) do cliente'); return; }
      const h = Email.h;
      Email.abrir({
        assunto: `De acordo: ordens de renda variável · conta ${c.codigo}`,
        nome: c.nome || '', para: c.email || '',
        texto: (nome, ass) => [
          Email.saudacaoTexto(nome), '',
          'Conforme conversamos, seguem as operações de renda variável propostas para a sua conta:', '',
          [COLS.join(' | '), ...ord.map(o => linha(o, c.codigo).join(' | '))].join('\n'), '',
          '(C = compra, V = venda)', '',
          'Para que eu possa encaminhar as ordens à mesa de operações, peço, por gentileza, que responda a este e-mail com o seu DE ACORDO.', '',
          'Ordens "a mercado" são executadas pelo preço disponível no momento da execução. Ordens com preço limitado só são executadas se o preço for atingido.', '',
          'Abraço,', ass,
        ].join('\n'),
        html: (nome, ass) => h.wrap(
          h.p(h.saudacao(nome)) +
          h.p('Conforme conversamos, seguem as operações de renda variável propostas para a sua conta:') +
          h.tabela(COLS, ord.map(o => { const l = linha(o, c.codigo).map(esc); l[0] = `<b>${l[0]}</b>`; l[1] = `<b style="color:${o.op === 'V' ? h.cor.ruim : h.cor.bom}">${l[1]}</b>`; return l; }), ['left', 'center', 'right', 'center', 'center']) +
          h.p('<span style="color:#6b6e74;font-size:12px">C = compra · V = venda</span>') +
          h.destaque('Para que eu possa encaminhar as ordens à mesa de operações, peço, por gentileza, que responda a este e-mail com o seu DE ACORDO.', 'neutro') +
          h.p('Abraço,') + h.assinatura(ass) +
          h.rodape('Ordens "a mercado" são executadas pelo preço disponível no momento da execução. Ordens com preço limitado só são executadas se o preço for atingido. Rentabilidade passada não é garantia de rentabilidade futura.')),
        aoSalvarCliente: (nome, para) => cfg.salvarCliente && cfg.salvarCliente(nome, para),
      });
    }
    function tsv() {
      const c = cfg.cliente();
      return [COLS.join('\t'), ...validas().map(o => [o.ticker, o.op, qtdNum(o), c.codigo, precoTxt(o)].join('\t'))].join('\n');
    }
    render();
    return { adicionar, limpar, substituir, email, tsv, validas, render, lista: () => lista };
  }
  return { criar, qtdNum };
})();
