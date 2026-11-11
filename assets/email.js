// Envio de simulações por e-mail.
// O site não envia nada sozinho: ele abre o seu app de e-mail (ou Gmail/Outlook) com a mensagem pronta,
// ou copia a versão formatada para colar. Assim o e-mail sai da sua conta e fica no seu histórico.

const Email = (() => {
  const ASS_PADRAO = 'Italo Nunes\nAssessor de Investimentos';
  let atual = null; // { assunto, texto(nome, ass), html(nome, ass), aoSalvarCliente }

  function montarModal() {
    if (document.getElementById('emailModal')) return;
    const el = document.createElement('div');
    el.id = 'emailModal';
    el.className = 'modal-bg no-print';
    el.hidden = true;
    el.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="emTitulo">
        <div class="modal-head"><h2 id="emTitulo">✉️ Enviar por e-mail</h2><button class="ghost" data-fechar aria-label="Fechar">✕</button></div>
        <div class="fields">
          <label class="f">Nome do cliente <input id="emNome" placeholder="Como chamar o cliente"></label>
          <label class="f">E-mail do cliente <input id="emPara" type="email" inputmode="email" autocomplete="email" placeholder="cliente@email.com"></label>
          <label class="f full">Assunto <input id="emAssunto"></label>
          <label class="f full">Mensagem <small>pode editar antes de enviar</small>
            <textarea id="emTexto" rows="12"></textarea></label>
        </div>
        <details style="margin-top:8px"><summary class="note" style="cursor:pointer">Minha assinatura</summary>
          <textarea id="emAss" rows="3" style="margin-top:6px"></textarea></details>
        <p id="emDica" hidden style="margin:12px 0 0;padding:10px 12px;border-radius:10px;background:var(--orange-soft);color:#9a3a00;font-size:13.5px"></p>
        <div class="em-actions">
          <button id="emApp">Abrir no app de e-mail</button>
          <button class="secondary" id="emGmail">Gmail</button>
          <button class="secondary" id="emOutlook">Outlook</button>
          <button class="outline" id="emCopiar">Copiar e-mail formatado</button>
          <button class="ghost" id="emGrafico" hidden>⬇️ Baixar gráfico</button>
        </div>
        <p class="note" style="margin:10px 0 0">"Copiar e-mail formatado" leva a versão com tabelas e cores: cole no corpo do Gmail ou Outlook. Para anexar a simulação completa, use "Imprimir / PDF".</p>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-fechar]')) fechar(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !el.hidden) fechar(); });
    const $ = id => document.getElementById(id);
    $('emAss').value = store.get('rw_assinatura', ASS_PADRAO);
    $('emAss').addEventListener('input', () => { store.set('rw_assinatura', $('emAss').value); regerarTexto(); });
    $('emNome').addEventListener('input', regerarTexto);
    $('emTexto').addEventListener('input', () => { $('emTexto').dataset.editado = '1'; });
    $('emApp').onclick = () => abrir('app');
    $('emGmail').onclick = () => abrir('gmail');
    $('emOutlook').onclick = () => abrir('outlook');
    $('emCopiar').onclick = copiarHtml;
    $('emGrafico').onclick = () => atual?.grafico && baixarSvgComoPng(atual.grafico(), 'simulacao.png');
  }

  function regerarTexto() {
    const t = document.getElementById('emTexto');
    if (t.dataset.editado || !atual) return;
    t.value = atual.texto(nome(), assinatura());
  }
  const nome = () => document.getElementById('emNome').value.trim();
  const assinatura = () => document.getElementById('emAss').value.trim();

  function lembrar() {
    const n = nome(), para = document.getElementById('emPara').value.trim();
    if (atual?.aoSalvarCliente) atual.aoSalvarCliente(n, para);
    store.set('rw_email_ultimo', { nome: n, para });
  }

  function abrir(onde) {
    const para = document.getElementById('emPara').value.trim();
    const assunto = document.getElementById('emAssunto').value;
    const corpo = document.getElementById('emTexto').value;
    lembrar();
    const q = encodeURIComponent;
    let url;
    if (onde === 'gmail') url = `https://mail.google.com/mail/?view=cm&fs=1&to=${q(para)}&su=${q(assunto)}&body=${q(corpo)}`;
    else if (onde === 'outlook') url = `https://outlook.office.com/mail/deeplink/compose?to=${q(para)}&subject=${q(assunto)}&body=${q(corpo)}`;
    else url = `mailto:${q(para).replace(/%40/g, '@')}?subject=${q(assunto)}&body=${q(corpo)}`;
    if (onde === 'app') window.location.href = url; else window.open(url, '_blank', 'noopener');
  }

  async function copiarHtml() {
    lembrar();
    const html = atual.html(nome(), assinatura());
    const texto = document.getElementById('emTexto').value;
    try {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([texto], { type: 'text/plain' }),
      })]);
      toast('E-mail formatado copiado — cole no corpo da mensagem');
    } catch {
      const div = document.createElement('div');
      div.contentEditable = 'true'; div.innerHTML = html;
      div.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(div);
      const r = document.createRange(); r.selectNodeContents(div);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      try { document.execCommand('copy'); toast('E-mail formatado copiado'); } catch { toast('Não foi possível copiar'); }
      sel.removeAllRanges(); div.remove();
    }
  }

  // Converte o gráfico SVG em PNG para anexar ao e-mail
  function baixarSvgComoPng(svgEl, arquivo) {
    if (!svgEl) { toast('Gráfico indisponível'); return; }
    const clone = svgEl.cloneNode(true);
    const vb = (clone.getAttribute('viewBox') || '0 0 800 360').split(/\s+/).map(Number);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', vb[2]); clone.setAttribute('height', vb[3]);
    clone.setAttribute('font-family', 'Arial, Helvetica, sans-serif');
    const fundo = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    fundo.setAttribute('width', '100%'); fundo.setAttribute('height', '100%'); fundo.setAttribute('fill', '#ffffff');
    clone.insertBefore(fundo, clone.firstChild);
    const src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone));
    const img = new Image();
    img.onload = () => {
      const esc = 2, c = document.createElement('canvas');
      c.width = vb[2] * esc; c.height = vb[3] * esc;
      const ctx = c.getContext('2d'); ctx.scale(esc, esc); ctx.drawImage(img, 0, 0);
      c.toBlob(b => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b); a.download = arquivo; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1500);
      }, 'image/png');
    };
    img.onerror = () => toast('Não foi possível gerar a imagem');
    img.src = src;
  }

  function fechar() { document.getElementById('emailModal').hidden = true; document.body.style.overflow = ''; }

  // opts: { assunto, nome, para, texto(nome, ass), html(nome, ass), grafico?(), aoSalvarCliente?(nome, para) }
  function abrirModal(opts) {
    montarModal();
    atual = opts;
    const ult = store.get('rw_email_ultimo', {});
    const $ = id => document.getElementById(id);
    $('emNome').value = opts.nome ?? ult.nome ?? '';
    $('emPara').value = opts.para ?? (opts.nome === undefined ? ult.para || '' : '');
    $('emAssunto').value = opts.assunto;
    delete $('emTexto').dataset.editado;
    $('emTexto').value = opts.texto(nome(), assinatura());
    $('emGrafico').hidden = !opts.grafico;
    // Quando o e-mail tem gráficos e tabelas, o caminho principal é copiar a versão formatada
    $('emCopiar').className = opts.preferirCopiar ? '' : 'outline';
    $('emApp').className = opts.preferirCopiar ? 'secondary' : '';
    $('emCopiar').textContent = opts.preferirCopiar ? '📋 Copiar e-mail com gráficos e tabelas' : 'Copiar e-mail formatado';
    $('emDica').hidden = !opts.preferirCopiar;
    $('emDica').innerHTML = opts.preferirCopiar ? '<b>Para enviar com gráficos e tabelas:</b> toque em "Copiar e-mail com gráficos e tabelas", abra o Gmail ou o Outlook, preencha o destinatário e o assunto e cole no corpo da mensagem (Ctrl+V). Os botões de abrir o e-mail levam só o texto.' : '';
    $('emailModal').hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(() => ($('emPara').value ? $('emAssunto') : $('emPara')).focus(), 50);
  }

  // ---------- Ajudantes para montar o HTML do e-mail (estilos inline para funcionar em qualquer cliente) ----------
  const cor = { ind: '#22105a', ora: '#ff5a00', mut: '#6d6a80', lin: '#e9e8f0', bom: '#129b5a', ruim: '#e2403a' };
  const h = {
    cor,
    wrap: (conteudo) => `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#26233a;max-width:640px">${conteudo}</div>`,
    p: t => `<p style="margin:0 0 12px">${t}</p>`,
    titulo: t => `<h3 style="margin:18px 0 8px;font-size:15px;color:${cor.ind};border-bottom:2px solid ${cor.ora};padding-bottom:4px">${t}</h3>`,
    destaque: (t, tipo) => `<div style="background:${tipo === 'bom' ? '#e5f6ee' : tipo === 'ruim' ? '#fdeceb' : '#fff4dc'};color:${tipo === 'bom' ? '#0b6e3f' : tipo === 'ruim' ? '#a52521' : '#8a5400'};padding:12px 14px;border-radius:8px;font-weight:bold;margin:0 0 12px">${t}</div>`,
    tabela: (cab, linhas, alinhar = []) => `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:13px;margin:0 0 12px">
      ${cab.some(c => c) ? `<tr>${cab.map((c, i) => `<th style="text-align:${alinhar[i] || 'left'};padding:7px 8px;background:${cor.ind};color:#fff;font-weight:bold">${c}</th>`).join('')}</tr>` : ''}
      ${linhas.map((l, k) => `<tr>${l.map((c, i) => `<td style="text-align:${alinhar[i] || 'left'};padding:7px 8px;border-bottom:1px solid ${cor.lin};${k % 2 ? 'background:#f6f7f8;' : ''}">${c}</td>`).join('')}</tr>`).join('')}
    </table>`,
    rodape: t => `<p style="margin:16px 0 0;font-size:11.5px;color:${cor.mut}">${t}</p>`,
    assinatura: ass => ass ? `<p style="margin:18px 0 0">${esc(ass).replace(/\n/g, '<br>')}</p>` : '',
    saudacao: nome => nome ? `Olá, ${esc(nome.split(' ')[0])}!` : 'Olá!',
  };

  return { abrir: abrirModal, h, saudacaoTexto: n => n ? `Olá, ${n.split(' ')[0]}!` : 'Olá!' };
})();
