// Radar de lista (ETFs da B3, ETFs internacionais e ações internacionais).
// radarLista(elemento, itens, cfg) monta: cartões do topo, maiores altas e quedas (com a explicação de uma linha),
// próximos resultados (ações), filtro por categoria, busca e tabela ordenável. Toque abre a ficha.
const RL = (() => {
  const n2 = (v, d = 2) => Number.isFinite(v) ? v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
  const pv = v => Number.isFinite(v) ? `<span class="${v > 0 ? 'up' : v < 0 ? 'dn' : ''}">${v > 0 ? '+' : ''}${n2(v)}%</span>` : '<span class="note">—</span>';
  const sem = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const dBR = d => d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '—';
  const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const mcapTxt = v => !Number.isFinite(v) ? '—' : v >= 1e12 ? `${n2(v / 1e12, 2)} tri` : `${n2(v / 1e9, 0)} bi`;
  const med = arr => { const v = arr.filter(Number.isFinite).sort((a, b) => a - b); return v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : NaN; };

  function ficha(a, cfg) {
    const $ = id => document.getElementById(id);
    const px = v => `${cfg.moeda} ${n2(v)}`;
    const pos = Number.isFinite(a.min12) && a.max12 > a.min12 ? (a.p - a.min12) / (a.max12 - a.min12) * 100 : null;
    $('dlgT').innerHTML = `${a.tk} <span style="font-weight:600;color:var(--muted);font-size:14px">${esc(a.nome || '')}</span>`;
    $('dlgB').innerHTML = `
      <p style="margin:0 0 10px"><span class="pill">${esc(a.cat)}</span> ${esc(a.desc)}</p>
      <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:10px"><b style="font-size:28px">${px(a.p)}</b><span style="font-weight:800">${pv(a.var)} hoje</span></div>
      <div class="ind">
        <div>No mês<b>${pv(a.mes)}</b></div><div>No ano<b>${pv(a.ano)}</b></div><div>12 meses<b>${pv(a.a12)}</b></div>
        ${cfg.acoes ? `<div>P/L<b>${Number.isFinite(a.pl) ? n2(a.pl, 1) : '—'}</b></div><div>Dividend yield<b>${Number.isFinite(a.dy) ? n2(a.dy, 1) + '%' : '—'}</b></div><div>Valor de mercado<b>${Number.isFinite(a.mcap) ? 'US$ ' + mcapTxt(a.mcap) : '—'}</b></div>
        <div>P/VP<b>${Number.isFinite(a.pvp) ? n2(a.pvp, 1) : '—'}</b></div><div>${a.res && a.res < new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }) ? 'Último resultado' : 'Próximo resultado'}<b>${a.res ? a.res.split('-').reverse().join('/') : '—'}</b></div>` : ''}
      </div>
      ${pos !== null ? `<div class="faixa"><i style="left:${pos}%"></i></div><div style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted)"><span>mín. 12m ${px(a.min12)}</span><span>máx. 12m ${px(a.max12)}</span></div>` : ''}
      <div class="tvm" id="tvMini"></div>
      <p class="note" style="margin-top:8px">${a.aberto ? 'Pregão aberto' : 'Pregão fechado'} · cotação de ${a.t ? new Date(a.t * 1000).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}${cfg.moeda === 'US$' ? ' (horário de Brasília)' : ''}.</p>`;
    $('dlg').hidden = false;
    tvWidget($('tvMini'), 'mini-symbol-overview', { symbol: cfg.tv(a.tk), width: '100%', height: '100%', locale: 'br', dateRange: '12M', colorTheme: 'light', isTransparent: true, autosize: true, largeChartUrl: '' });
  }

  function radarLista(raiz, L, cfg) {
    const id = cfg.id, q = sel => raiz.querySelector(sel);
    const ref = cfg.ref.map(t => L.find(a => a.tk === t)).filter(Boolean);
    const comVar = L.filter(a => Number.isFinite(a.var));
    const sobe = comVar.filter(a => a.var > 0).length, cai = comVar.filter(a => a.var < 0).length, md = med(comVar.map(a => a.var));
    const quando = Math.max(...L.map(a => a.t || 0));
    const qd = quando ? new Date(quando * 1000).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
    const px = v => `${cfg.moeda} ${n2(v)}`;
    const cats = [...new Set(L.map(a => a.cat))];
    const st = { cat: '', busca: '', col: 'var', asc: false };

    const item = (a, cor) => {
      const mx = Math.max(...comVar.map(x => Math.abs(x.var)), 0.01);
      return `<button class="it" type="button" data-tk="${esc(a.tk)}">
        <span style="min-width:0"><span class="tk">${esc(a.tk)}</span><span class="ds">${esc(a.desc)}</span><div class="bar"><i style="width:${Math.max(Math.abs(a.var) / mx * 100, 3)}%;background:${cor}"></i></div></span>
        <span class="vv">${pv(a.var)}<small>${px(a.p)}</small></span></button>`;
    };
    const altas = [...comVar].filter(a => a.var > 0).sort((a, b) => b.var - a.var).slice(0, 6);
    const quedas = [...comVar].filter(a => a.var < 0).sort((a, b) => a.var - b.var).slice(0, 6);

    // próximos resultados (ações): 45 dias à frente
    const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
    const lim = new Date(Date.now() + 45 * 864e5).toISOString().slice(0, 10);
    const cal = cfg.acoes ? L.filter(a => a.res && a.res >= hoje && a.res <= lim).sort((a, b) => a.res.localeCompare(b.res)) : [];

    const colsEtf = [['tk', 'Ativo'], ['cat', 'Categoria'], ['p', 'Preço'], ['var', 'Dia'], ['mes', 'Mês'], ['ano', 'Ano'], ['a12', '12 meses']];
    const colsAc = [['tk', 'Ação'], ['cat', 'Setor'], ['p', 'Preço'], ['var', 'Dia'], ['ano', 'Ano'], ['a12', '12 meses'], ['pl', 'P/L'], ['dy', 'DY'], ['mcap', 'Valor de mercado'], ['res', 'Resultado']];
    const COLS = cfg.acoes ? colsAc : colsEtf;

    raiz.innerHTML = `
      <div class="kpis">
        ${ref.map(a => `<div class="kpi"><div class="l">${esc(a.tk)} <small style="font-weight:600">${esc(cfg.refRot?.[a.tk] || '')}</small></div><div class="v">${px(a.p)}</div><div class="s">${pv(a.var)} hoje · ${pv(a.ano)} no ano</div></div>`).join('')}
        <div class="kpi"><div class="l">Sobem × caem</div><div class="v"><span class="up">${sobe}</span> × <span class="dn">${cai}</span></div><div class="s">de ${comVar.length} ${cfg.rotulo}</div></div>
        <div class="kpi"><div class="l">Variação mediana</div><div class="v ${md > 0 ? 'up' : md < 0 ? 'dn' : ''}">${Number.isFinite(md) ? (md > 0 ? '+' : '') + n2(md) + '%' : '—'}</div><div class="s">metade acima disso · ${qd}</div></div>
      </div>
      <div class="duo">
        <div class="card"><h2>📈 Maiores altas <small>hoje</small></h2><div class="lst">${altas.map(a => item(a, 'var(--good)')).join('') || '<p class="note">Nenhum em alta agora.</p>'}</div></div>
        <div class="card"><h2>📉 Maiores quedas <small>hoje</small></h2><div class="lst">${quedas.map(a => item(a, 'var(--bad)')).join('') || '<p class="note">Nenhum em queda agora.</p>'}</div></div>
      </div>
      ${cfg.acoes ? `<details class="card fold" data-fold="${id}-cal" style="margin-top:14px">
        <summary><h2>🗓️ Próximos resultados</h2><span class="fold-prev">${cal.length ? cal.slice(0, 3).map(a => `<b>${esc(a.tk)}</b> ${dBR(a.res)}`).join(' · ') + (cal.length > 3 ? ` · e mais ${cal.length - 3}` : '') : 'nenhum nas próximas semanas'}</span><span class="chev">▾</span></summary>
        <div class="cal">${cal.map(a => `<button class="c" type="button" data-tk="${esc(a.tk)}"><span class="d">${dBR(a.res)}<small>${DIAS[new Date(a.res + 'T12:00:00').getDay()]}</small></span>
          <span><b>${esc(a.tk)}</b> <span style="color:var(--muted);font-size:12.5px">${esc(a.desc)}</span></span><span style="font-size:12.5px;color:var(--muted)">${pv(a.a12)} 12m</span></button>`).join('') || '<p class="note">Nenhuma data nas próximas semanas.</p>'}</div>
        <p class="note" style="margin-top:8px">Datas previstas pelo Yahoo Finance; as empresas americanas costumam divulgar antes da abertura ou depois do fechamento.</p></details>` : ''}
      <div class="card" style="margin-top:14px">
        <div class="card-head"><h2>📋 ${cfg.tituloTabela}</h2><input class="busca-r" type="search" placeholder="Filtrar por ticker ou descrição"></div>
        <div class="chips"><button class="on" data-cat="" type="button">Todos (${L.length})</button>${cats.map(c => `<button data-cat="${esc(c)}" type="button">${esc(c)}</button>`).join('')}</div>
        <div class="table-wrap"><table class="tl"><thead></thead><tbody></tbody></table></div>
        <p class="note" style="margin-top:8px">Toque no nome da coluna para ordenar e na linha para ver a ficha.</p>
      </div>`;

    function tabela() {
      const b = sem(st.busca);
      const V = L.filter(a => (!st.cat || a.cat === st.cat) && (!b || sem(`${a.tk} ${a.desc} ${a.nome || ''} ${a.cat}`).includes(b)));
      const num = a => a[st.col];
      V.sort((x, y) => {
        const a = num(x), c = num(y);
        if (typeof a === 'string' || typeof c === 'string') return (st.asc ? 1 : -1) * String(a || '').localeCompare(String(c || ''));
        const va = Number.isFinite(a) ? a : (st.asc ? Infinity : -Infinity), vb = Number.isFinite(c) ? c : (st.asc ? Infinity : -Infinity);
        return st.asc ? va - vb : vb - va;
      });
      q('thead').innerHTML = `<tr>${COLS.map(([k, t]) => `<th data-k="${k}" class="${st.col === k ? 'on' + (st.asc ? ' asc' : '') : ''}" style="${k === 'tk' || k === 'cat' ? '' : 'text-align:right'}">${t}</th>`).join('')}</tr>`;
      q('tbody').innerHTML = V.map(a => `<tr data-tk="${esc(a.tk)}">${COLS.map(([k]) => {
        if (k === 'tk') return `<td><span class="tk">${esc(a.tk)}</span><div class="ds">${esc(a.desc)}</div></td>`;
        if (k === 'cat') return `<td class="ct">${esc(a.cat)}</td>`;
        if (k === 'p') return `<td style="text-align:right">${n2(a.p)}</td>`;
        if (k === 'pl') return `<td style="text-align:right">${Number.isFinite(a.pl) ? n2(a.pl, 1) : '—'}</td>`;
        if (k === 'dy') return `<td style="text-align:right">${Number.isFinite(a.dy) ? n2(a.dy, 1) + '%' : '—'}</td>`;
        if (k === 'mcap') return `<td style="text-align:right">${Number.isFinite(a.mcap) ? 'US$ ' + mcapTxt(a.mcap) : '—'}</td>`;
        if (k === 'res') return `<td style="text-align:right">${a.res ? a.res.split('-').reverse().join('/') : '—'}</td>`;
        return `<td style="text-align:right">${pv(a[k])}</td>`;
      }).join('')}</tr>`).join('') || `<tr><td colspan="${COLS.length}" class="note">Nada encontrado.</td></tr>`;
    }
    tabela();
    q('.busca-r').addEventListener('input', e => { st.busca = e.target.value; tabela(); });
    q('.chips').addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if (!b) return; st.cat = b.dataset.cat; q('.chips').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); tabela(); });
    q('thead').addEventListener('click', e => { const th = e.target.closest('th'); if (!th) return; const k = th.dataset.k; st.asc = st.col === k ? !st.asc : (k === 'tk' || k === 'cat' || k === 'res'); st.col = k; tabela(); });
    raiz.addEventListener('click', e => { const b = e.target.closest('[data-tk]'); if (!b || e.target.closest('th')) return; const a = L.find(x => x.tk === b.dataset.tk); if (a) ficha(a, cfg); });
    aplicarFold(raiz);
  }

  // modal
  document.addEventListener('click', e => { if (e.target.id === 'dlgX' || e.target.id === 'dlg') document.getElementById('dlg').hidden = true; });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.getElementById('dlg')) document.getElementById('dlg').hidden = true; });
  return { radarLista };
})();
