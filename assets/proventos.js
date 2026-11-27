// Proventos anunciados (bloco recolhível do Radar de ações). Lê proventos.json (B3 + avisos aos acionistas da CVM).
(() => {
  const el = id => document.getElementById(id);
  const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const hojeISO = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const mais = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const dBR = d => d ? d.split('-').reverse().join('/') : 'a definir';
  const dCurta = d => d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '—';
  const sem = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const rs = v => Number.isFinite(v) ? 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: v < 1 ? 4 : 2 }) : '—';
  const pct = v => Number.isFinite(v) ? v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%' : '';
  const tipo = t => `<span class="tp ${t === 'JCP' ? 'jcp' : t === 'Dividendo' ? '' : 'out'}">${esc(t)}</span>`;
  const st = { aba: 'com', busca: '', tipo: '', ibov: false };
  let P = [], HOJE = hojeISO();

  const ABAS = [
    ['com', '⏰ Data com chegando'],
    ['novos', '🆕 Anunciados (30 dias)'],
    ['pagar', '💰 Próximos pagamentos'],
  ];

  function listas() {
    const b = sem(st.busca).replace(/\s+/g, '');
    const F = P.filter(p => (!st.tipo || p.tipo === st.tipo) && (!st.ibov || p.ibov) &&
      (!b || sem(p.tk).includes(b) || sem(p.nome).replace(/\s+/g, '').includes(b)));
    return {
      com: F.filter(p => p.com && p.com >= HOJE).sort((a, b) => a.com.localeCompare(b.com) || (b.yield || 0) - (a.yield || 0)),
      novos: F.filter(p => p.aprov && p.aprov >= mais(HOJE, -30)).sort((a, b) => b.aprov.localeCompare(a.aprov) || a.tk.localeCompare(b.tk)),
      pagar: F.filter(p => p.pag && p.pag >= HOJE).sort((a, b) => a.pag.localeCompare(b.pag)),
    };
  }

  function linha(p, campo) {
    const d = p[campo];
    const partes = [];
    if (campo !== 'aprov' && p.aprov) partes.push(`aprovado ${dBR(p.aprov)}`);
    if (campo === 'aprov') partes.push(`aprovado ${dBR(p.aprov)}`);
    if (campo !== 'com') partes.push(`data com ${dBR(p.com)}`);
    if (campo !== 'pag') partes.push(`pagamento ${dBR(p.pag)}`);
    if (p.ref) partes.push(esc(p.ref));
    if (p.doc) partes.push(`<a href="${esc(p.doc)}" target="_blank" rel="noopener">ver aviso</a>`);
    return `<div class="pv ${d === HOJE ? 'hoje' : ''}"><span class="d">${dCurta(d)}<small>${d ? (d === HOJE ? 'hoje' : DIAS[new Date(d + 'T12:00:00').getDay()]) : ''}</small></span>
      <span style="min-width:0"><span class="tk">${esc(p.tk)}</span> ${tipo(p.tipo)} <span class="nm">${esc(p.nome || '')}</span><div class="mt">${partes.join(' · ')}</div></span>
      <span class="vv">${rs(p.valor)}<small>${Number.isFinite(p.yield) ? pct(p.yield) + ' da cotação' : 'por ação'}</small></span></div>`;
  }

  function render() {
    HOJE = hojeISO();
    const L = listas();
    const campo = { com: 'com', novos: 'aprov', pagar: 'pag' }[st.aba];
    const notas = {
      com: 'Quem tiver a ação no fim do pregão da <b>data com</b> recebe; no dia seguinte a ação passa a ser negociada "ex".',
      novos: 'Aprovados pelas empresas nos últimos 30 dias, do mais recente para o mais antigo.',
      pagar: 'Pagamentos com data marcada, do mais próximo para o mais distante.',
    };
    el('provCorpo').innerHTML = `
      <div class="pv-abas">${ABAS.map(([k, t]) => `<button type="button" data-aba="${k}" class="${st.aba === k ? 'on' : ''}">${t} (${L[k].length})</button>`).join('')}</div>
      <div class="pv-filtros">
        <input type="search" id="provBusca" placeholder="Filtrar (ex.: BBDC, ITUB4)" value="${esc(st.busca)}">
        <div class="chips">${[['', 'Todos'], ['Dividendo', 'Dividendos'], ['JCP', 'JCP']].map(([k, t]) => `<button type="button" data-tipo="${k}" class="${st.tipo === k ? 'on' : ''}">${t}</button>`).join('')}</div>
        <label style="display:flex;align-items:center;gap:6px;font-size:13.5px;font-weight:700"><input type="checkbox" id="provIbov" ${st.ibov ? 'checked' : ''}> Só Ibovespa</label>
      </div>
      <div class="pvl">${L[st.aba].map(p => linha(p, campo)).join('') || '<p class="note">Nada por aqui com esses filtros.</p>'}</div>
      <p class="note" style="margin-top:8px">${notas[st.aba]} Valores brutos por ação; o JCP tem imposto retido na fonte. Confirme no aviso aos acionistas antes de orientar o cliente.</p>`;
  }

  el('provCorpo').addEventListener('click', e => {
    const a = e.target.closest('[data-aba]'), t = e.target.closest('[data-tipo]');
    if (a) { st.aba = a.dataset.aba; render(); }
    if (t) { st.tipo = t.dataset.tipo; render(); }
  });
  el('provCorpo').addEventListener('input', e => {
    if (e.target.id !== 'provBusca') return;
    st.busca = e.target.value;
    const pos = e.target.selectionStart; render();
    const i = el('provBusca'); i.focus(); i.setSelectionRange(pos, pos);
  });
  el('provCorpo').addEventListener('change', e => { if (e.target.id === 'provIbov') { st.ibov = e.target.checked; render(); } });

  (async () => {
    try {
      const D = await carregarDados('proventos.json');
      if (!D || !D.p) throw 0;
      P = D.p;
      HOJE = hojeISO();
      const L = listas();
      if (!L.com.length && L.novos.length) st.aba = 'novos';
      el('provPrev').innerHTML = L.com.length
        ? `Data com: ${L.com.slice(0, 3).map(p => `<b>${esc(p.tk)}</b> ${rs(p.valor)} até ${dCurta(p.com)}`).join(' · ')}${L.com.length > 3 ? ` · e mais ${L.com.length - 3}` : ''}`
        : `${L.novos.length} anunciados nos últimos 30 dias`;
      render();
    } catch { el('provPrev').textContent = 'indisponível agora'; el('provCorpo').innerHTML = '<p class="note">Os proventos ainda não estão disponíveis.</p>'; }
  })();
})();
