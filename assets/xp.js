// Página XP Inc.: lê xp.json (GitHub Actions: Yahoo Finance, SEC EDGAR, radar.json e Google Notícias).
const $ = id => document.getElementById(id);
let X = null;
const n2 = (v, d = 2) => Number.isFinite(v) ? v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
const pv = v => Number.isFinite(v) ? `<span class="${v > 0 ? 'up' : v < 0 ? 'dn' : ''}">${v > 0 ? '+' : ''}${n2(v)}%</span>` : '—';
const bi = v => Number.isFinite(v) ? (v >= 1e9 ? 'R$ ' + n2(v / 1e9, 1) + ' bi' : 'R$ ' + n2(v / 1e6, 0) + ' mi') : '—';
const dBR = s => s ? s.split('-').reverse().join('/') : '';
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const CORES = { XP: '#ff5a00', BPAC11: '#22105a', ITUB4: '#1f6feb', BBDC4: '#c0392b', NU: '#8a2be2', INTR: '#e67e22', IBOV: '#8a87a0' };
const ORDEM = ['XP', 'BPAC11', 'ITUB4', 'BBDC4', 'NU', 'INTR', 'IBOV'];
let LIGADOS = new Set(['XP', 'BPAC11', 'ITUB4', 'NU', 'IBOV']);

function hero() {
  const a = X.cot.XP, b = X.cot.XPBR31;
  const pos = a.max52 > a.min52 ? (a.preco - a.min52) / (a.max52 - a.min52) * 100 : 50;
  $('hero').innerHTML = `
    <div class="card">
      <div class="sub2">XP · Nasdaq (US$)</div>
      <div class="px"><span class="p">US$ ${n2(a.preco)}</span><span class="v">${pv(a.var)}</span></div>
      <div class="sub2">no ano ${pv(a.ano)} · 12 meses ${pv(a.a12)}</div>
      <div class="faixa"><i style="left:${Math.min(Math.max(pos, 0), 100)}%"></i></div>
      <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted)"><span>mín. 12m US$ ${n2(a.min52)}</span><span>máx. 12m US$ ${n2(a.max52)}</span></div>
      ${b ? `<div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--line)"><span class="sub2">XPBR31 · BDR na B3</span><div class="px"><span class="p" style="font-size:24px">R$ ${n2(b.preco)}</span><span class="v" style="font-size:15px">${pv(b.var)}</span></div></div>` : ''}
    </div>
    <div class="card">
      <h2 style="margin-bottom:4px">Indicadores</h2>
      <div class="kp">
        <div>Valor de mercado<b>${bi(a.mcap)}</b></div><div>P/L<b>${n2(a.pl, 1)}</b></div><div>P/VP<b>${n2(a.pvp, 2)}</b></div>
        <div>ROE<b>${Number.isFinite(a.roe) ? n2(a.roe, 1) + '%' : '—'}</b></div><div>Dividend yield 12m<b>${Number.isFinite(a.dy) ? n2(a.dy, 1) + '%' : '—'}</b></div><div>Dólar<b>R$ ${n2(X.usd)}</b></div>
      </div>
      <p class="note" style="margin:10px 0 0">P/L, P/VP e ROE com o lucro e o patrimônio do último balanço anual na SEC (${a.ref_balanco || '—'}) e as ações em circulação; DY = proventos pagos em 12 meses ÷ preço.</p>
    </div>`;
}
function grafico() {
  const S = ORDEM.filter(k => X.cot[k]?.serie?.length > 5 && LIGADOS.has(k)).map(k => {
    const s = X.cot[k].serie, b = s[0][1];
    return { k, pts: s.map(([d, c]) => [d, c / b * 100]) };
  });
  $('leg').innerHTML = ORDEM.filter(k => X.cot[k]).map(k => `<button type="button" data-k="${k}" class="${LIGADOS.has(k) ? '' : 'off'}"><i style="background:${CORES[k]}"></i>${k === 'IBOV' ? 'Ibovespa' : k}</button>`).join('');
  if (!S.length) { $('graf').innerHTML = ''; return; }
  const datas = [...new Set(S.flatMap(s => s.pts.map(p => p[0])))].sort();
  const d0 = datas[0], d1 = datas[datas.length - 1], t0 = Date.parse(d0), t1 = Date.parse(d1);
  const vs = S.flatMap(s => s.pts.map(p => p[1])); let lo = Math.min(...vs, 100), hi = Math.max(...vs, 100);
  const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
  const W = 720, H = 280, pl = 40, pr = 54, pt = 10, pb = 24;
  const Xp = d => pl + (Date.parse(d) - t0) / (t1 - t0 || 1) * (W - pl - pr), Yp = v => pt + (1 - (v - lo) / (hi - lo)) * (H - pt - pb);
  const ticks = [lo + pad, 100, hi - pad].filter((v, i, a) => a.findIndex(x => Math.abs(x - v) < (hi - lo) * 0.08) === i);
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'], rot = d => `${MES[+d.slice(5, 7) - 1]}/${d.slice(2, 4)}`;
  const linhas = S.map(s => `<polyline points="${s.pts.map(p => `${Xp(p[0]).toFixed(1)},${Yp(p[1]).toFixed(1)}`).join(' ')}" fill="none" stroke="${CORES[s.k]}" stroke-width="${s.k === 'XP' ? 3 : 1.8}" stroke-linejoin="round" vector-effect="non-scaling-stroke" opacity="${s.k === 'XP' ? 1 : .85}"/>`).join('');
  // rótulos no fim, sem sobreposição
  const fins = S.map(s => ({ k: s.k, v: s.pts[s.pts.length - 1][1] })).sort((a, b) => b.v - a.v);
  let ult = -Infinity; fins.forEach(f => { f.y = Math.max(Yp(f.v), ult + 13); ult = f.y; });
  $('graf').innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    ${ticks.map(t => `<line x1="${pl}" x2="${W - pr}" y1="${Yp(t)}" y2="${Yp(t)}" stroke="${Math.abs(t - 100) < .01 ? '#b9b5c9' : '#eceaf2'}" ${Math.abs(t - 100) < .01 ? 'stroke-dasharray="4 3"' : ''}/><text x="${pl - 5}" y="${Yp(t) + 3}" font-size="10" fill="#8a87a0" text-anchor="end">${Math.round(t)}</text>`).join('')}
    ${linhas}
    ${fins.map(f => `<text x="${W - pr + 4}" y="${f.y + 3}" font-size="10.5" font-weight="700" fill="${CORES[f.k]}">${f.k === 'IBOV' ? 'IBOV' : f.k} ${f.v >= 100 ? '+' : ''}${Math.round(f.v - 100)}%</text>`).join('')}
    <text x="${pl}" y="${H - 6}" font-size="10" fill="#8a87a0">${rot(d0)}</text><text x="${W - pr}" y="${H - 6}" font-size="10" fill="#8a87a0" text-anchor="end">${rot(d1)}</text></svg>`;
}
$('leg').addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (!b) return; const k = b.dataset.k; LIGADOS.has(k) ? LIGADOS.delete(k) : LIGADOS.add(k); grafico(); });

function comparacao() {
  const L = ORDEM.filter(k => k !== 'IBOV' && X.cot[k]);
  $('tComp').innerHTML = `<thead><tr><th>Empresa</th><th class="n">Preço</th><th class="n">Dia</th><th class="n">Ano</th><th class="n">12 meses</th><th class="n">Valor de mercado</th><th class="n">P/L</th><th class="n">P/VP</th><th class="n">ROE</th><th class="n">DY 12m</th></tr></thead><tbody>
    ${L.map(k => { const a = X.cot[k]; const moeda = a.moeda === 'USD' ? 'US$ ' : 'R$ ';
      return `<tr class="${k === 'XP' ? 'xp' : ''}"><td><b>${a.nome}</b><div class="sub2">${k} · ${a.bolsa}</div></td><td class="n">${moeda}${n2(a.preco)}</td><td class="n">${pv(a.var)}</td><td class="n">${pv(a.ano)}</td><td class="n">${pv(a.a12)}</td>
      <td class="n">${bi(a.mcap)}</td><td class="n">${n2(a.pl, 1)}</td><td class="n">${n2(a.pvp, 2)}</td><td class="n">${Number.isFinite(a.roe) ? n2(a.roe, 1) + '%' : '—'}</td><td class="n">${Number.isFinite(a.dy) ? n2(a.dy, 1) + '%' : '—'}</td></tr>`; }).join('')}</tbody>`;
  $('compNota').textContent = 'BTG, Itaú e Bradesco: indicadores calculados com os balanços da CVM (lucro de 12 meses), como no Radar de ações. XP, Nubank e Inter: último balanço anual na SEC (20-F). Valor de mercado em reais.';
}
function calendario() {
  const R = X.resultados || [], P = X.proximo;
  const linha = (r, prox) => { const dt = r.d ? new Date(r.d + 'T12:00:00') : null;
    return `<${r.l ? `a href="${esc(r.l)}" target="_blank" rel="noopener"` : 'div'} class="c ${prox ? 'prox' : ''}"><span class="d">${dt ? dBR(r.d).slice(0, 5) : '—'}<small>${dt ? DIAS[dt.getDay()] + ' ' + r.d.slice(0, 4) : ''}</small></span><span><b>${r.tri}</b> ${prox ? 'próximo resultado' : 'resultado divulgado'}</span><span class="sub2">${prox ? (r.est ? 'previsão' : '') : 'release ›'}</span></${r.l ? 'a' : 'div'}>`; };
  $('cal').innerHTML = (P ? linha(P, true) : '') + [...R].reverse().slice(0, 8).map(r => linha(r)).join('') || '<p class="note">Sem datas.</p>';
  $('calNota').textContent = 'Datas dos releases de resultado enviados à SEC (a XP divulga após o fechamento do mercado). O próximo é uma previsão pela data do mesmo trimestre no ano passado; a data oficial sai no site de RI.';
}
function perfil() {
  const linhas = [
    ['Negociação', 'Nasdaq (XP) e BDR na B3 (XPBR31)'],
    ['Fundação', '2001, em Porto Alegre'],
    ['Abertura de capital', 'Nasdaq, dezembro de 2019'],
    ['CEO', 'Thiago Maffra (desde 2021)'],
    ['CFO', 'Gustavo Alejo Viviani (desde agosto de 2026)'],
    ['Relações com investidores', 'André Parize'],
  ];
  $('perfil').innerHTML = linhas.map(([a, b]) => `<div><span>${a}</span><span>${b}</span></div>`).join('');
}
function balanco() {
  const A = X.sec?.XP?.anos || [];
  if (!A.length) { $('tBal').innerHTML = '<tbody><tr><td class="note">Sem dados da SEC agora.</td></tr></tbody>'; return; }
  const v = x => Number.isFinite(x) ? 'R$ ' + n2(x / 1e9, 2) + ' bi' : '—';
  $('tBal').innerHTML = `<thead><tr><th>Ano</th><th class="n">Receita</th><th class="n">Lucro líquido</th><th class="n">Patrimônio</th><th class="n">ROE</th></tr></thead><tbody>
    ${[...A].reverse().map(a => `<tr><td><b>${a.ano}</b></td><td class="n">${v(a.receita)}</td><td class="n">${v(a.lucro)}</td><td class="n">${v(a.pl)}</td><td class="n">${a.lucro && a.pl ? n2(a.lucro / a.pl * 100, 1) + '%' : '—'}</td></tr>`).join('')}</tbody>`;
}
function listas() {
  $('news').innerHTML = (X.noticias || []).map(n => `<a href="${esc(n.l)}" target="_blank" rel="noopener"><span class="d">${n.d ? dBR(n.d).slice(0, 5) : ''}</span><span>${esc(n.t)}<div class="f">${esc(n.f || '')}</div></span></a>`).join('') || '<p class="note">Sem notícias agora.</p>';
  $('docs').innerHTML = (X.docs || []).slice(0, 12).map(d => `<a href="${esc(d.l)}" target="_blank" rel="noopener"><span class="d">${dBR(d.d)}</span><span>${d.res ? `<b>Resultado ${d.res}</b> · ` : ''}${esc((d.t || d.f).slice(0, 140))}<div class="f">${esc(d.f)}</div></span></a>`).join('') || '<p class="note">Sem documentos agora.</p>';
}

(async () => {
  try { X = await carregarDados('xp.json'); } catch { $('hero').innerHTML = '<div class="card"><p class="note">Dados ainda não disponíveis. Tente de novo mais tarde.</p></div>'; return; }
  hero(); grafico(); comparacao(); calendario(); perfil(); balanco(); listas();
  $('rodape').innerHTML = `Fontes: Yahoo Finance (cotações, com atraso), SEC EDGAR (balanços 20-F e documentos), CVM via Radar de ações (concorrentes da B3) e Google Notícias (manchetes). Atualizado em ${new Date(X.atualizado).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}. Página de informações públicas, sem relação oficial com a empresa; não é recomendação de investimento.`;
})();
