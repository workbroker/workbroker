// Radar de FIIs: maiores altas e quedas do dia entre as cotas do IFIX (radar.json, atualizado a cada rodada do Actions)
(async () => {
  const el = id => document.getElementById(id);
  let R;
  try { R = await carregarDados('radar.json'); } catch { return; }
  const F = (R.fiis || []).filter(a => Number.isFinite(a.var));
  if (F.length < 10) return;
  const n2 = v => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pv = v => `<span class="${v > 0 ? 'up' : v < 0 ? 'dn' : ''}">${v > 0 ? '+' : ''}${n2(v)}%</span>`;
  const mx = Math.max(...F.map(a => Math.abs(a.var)), 0.01);
  const item = a => `<button class="mv-it" type="button" data-fii="${a.tk}"><span class="tk">${a.tk}</span>
    <span><span class="nm">${esc((a.nome || '').replace(/^Fii\s+/i, ''))}${Number.isFinite(a.dy) && a.dy ? ` · DY ${n2(a.dy)}%` : ''}</span><div class="bar"><i style="width:${Math.abs(a.var) / mx * 100}%;background:${a.var >= 0 ? 'var(--good)' : 'var(--bad)'}"></i></div></span>
    <span class="vv">${pv(a.var)}<small>R$ ${n2(a.preco)}</small></span></button>`;
  el('fAltas').innerHTML = [...F].sort((a, b) => b.var - a.var).slice(0, 6).map(item).join('');
  el('fQuedas').innerHTML = [...F].sort((a, b) => a.var - b.var).slice(0, 6).map(item).join('');
  // "hoje" ou o dia do último pregão
  const t = F.reduce((m, a) => Math.max(m, a.t || 0), 0), d = new Date(t * 1000), h = new Date();
  const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const quando = d.toDateString() === h.toDateString() ? 'hoje' : `pregão de ${DIAS[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  document.querySelectorAll('#movFii .qd').forEach(x => { x.textContent = quando; });
  const sobe = F.filter(a => a.var > 0).length, cai = F.filter(a => a.var < 0).length;
  el('movNota').innerHTML = `${R.ifix ? `IFIX ${pv(R.ifix.var)} · ` : ''}${sobe} cotas sobem e ${cai} caem entre os ${F.length} fundos do IFIX. Cotações de ${d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} (Yahoo Finance, atualizadas mais ou menos de hora em hora). Toque no fundo para ver a ficha.`;
  el('movFii').hidden = false;
  el('movFii').addEventListener('click', e => {
    const b = e.target.closest('[data-fii]'); if (!b) return;
    const tk = b.dataset.fii;
    if (typeof info === 'function') { const i = info(tk); if (!i.a && !i.m) { toast(`${tk}: ainda sem ficha (o fundo não aparece nos dados da CVM)`); return; } }
    if (typeof abrirFundo === 'function') abrirFundo(tk);
  });
})();
