// Funções compartilhadas entre as ferramentas

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const NUM2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function brl(v) { return Number.isFinite(v) ? BRL.format(v) : '—'; }
function pct(v, dec = 2) {
  if (!Number.isFinite(v)) return '—';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + '%';
}

// Aceita "1.234,56", "1234.56", "R$ 1.234", "13,5%"
function parseNum(s) {
  if (typeof s === 'number') return s;
  s = String(s || '').trim().replace(/[R$\s%]/g, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // "100.000" = cem mil
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function daysBetween(a, b) {
  if (!a || !b) return NaN;
  const d1 = new Date(a + 'T12:00:00'), d2 = new Date(b + 'T12:00:00');
  return Math.round((d2 - d1) / 86400000);
}

function todayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

// Tabela regressiva de IR para renda fixa
function aliquotaIR(dias) {
  if (dias <= 180) return 0.225;
  if (dias <= 360) return 0.20;
  if (dias <= 720) return 0.175;
  return 0.15;
}

// Taxa efetiva anual (decimal) a partir do indexador: pre, pctcdi, cdimais, ipcamais
function taxaEfetiva(idx, taxa, cdi, ipca) {
  taxa /= 100; cdi /= 100; ipca /= 100;
  switch (idx) {
    case 'pre': return taxa;
    case 'pctcdi': return Math.pow(1 + (Math.pow(1 + cdi, 1 / 252) - 1) * taxa, 252) - 1;
    case 'cdimais': return (1 + cdi) * (1 + taxa) - 1;
    case 'ipcamais': return (1 + ipca) * (1 + taxa) - 1;
  }
  return NaN;
}
// Converte taxa efetiva anual (decimal) de volta para o formato do indexador (%)
function taxaNoIdx(idx, anual, cdi, ipca) {
  cdi /= 100; ipca /= 100;
  switch (idx) {
    case 'pre': return anual * 100;
    case 'pctcdi': return (Math.pow(1 + anual, 1 / 252) - 1) / (Math.pow(1 + cdi, 1 / 252) - 1) * 100;
    case 'cdimais': return ((1 + anual) / (1 + cdi) - 1) * 100;
    case 'ipcamais': return ((1 + anual) / (1 + ipca) - 1) * 100;
  }
  return NaN;
}
const IDX_OPTS = [['pre', 'Pré'], ['pctcdi', '% CDI'], ['cdimais', 'CDI +'], ['ipcamais', 'IPCA +']];
function fmtIdx(idx, x) {
  if (!Number.isFinite(x)) return '—';
  if (idx === 'pctcdi') return pct(x) + ' do CDI';
  if (idx === 'pre') return pct(x) + ' a.a.';
  return ({ cdimais: 'CDI + ', ipcamais: 'IPCA + ' })[idx] + pct(x);
}

// Dados atualizados pelo GitHub Actions ficam no ramo "dados"; se falhar, usa a cópia local em data/
// o endereço do repositório sai do próprio link do site (usuario.github.io/repositorio), para continuar funcionando se o repositório mudar de nome
const DADOS_URL = (() => {
  const h = location.hostname, m = h.match(/^([\w-]+)\.github\.io$/i);
  if (!m) return 'https://raw.githubusercontent.com/workrico/workbroker/dados/';
  const seg = location.pathname.split('/').filter(Boolean)[0];
  const repo = seg && !/\.html?$/i.test(seg) ? seg : h;
  return `https://raw.githubusercontent.com/${m[1]}/${repo}/dados/`;
})();
async function carregarDados(nome) {
  const t = Math.floor(Date.now() / 120000);
  for (const base of [DADOS_URL, 'data/']) {
    try {
      const r = await fetch(base + nome + '?t=' + t, { cache: 'no-store' });
      if (r.ok) return await r.json();
    } catch {}
  }
  throw new Error('Dados indisponíveis: ' + nome);
}

// Armazenamento local seguro (pode falhar em navegação privada)
const store = {
  get(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
};

function toast(msg) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 2200);
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copiado!'); }
  catch {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta);
    ta.select(); try { document.execCommand('copy'); toast('Copiado!'); } catch { toast('Não foi possível copiar'); }
    ta.remove();
  }
}

function uid() { return Math.random().toString(36).slice(2, 9); }

function fmtDate(iso) { return iso ? iso.split('-').reverse().join('/') : '—'; }
function addDays(iso, n) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }

// ---------- Menu lateral (estilo hub) + busca ----------
const ICON = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  check: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>',
  trend: '<path d="M4 17l5-5 4 4 7-8"/><path d="M15 8h5v5"/>',
  bank: '<path d="M3 9.5 12 4l9 5.5"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8"/><path d="M3 20h18"/>',
  pie: '<path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M14.5 3.3A9 9 0 0 1 20.7 9.5H14.5z"/>',
  slides: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M12 16v4M8 20h8"/>',
  news: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 13h8M8 17h5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
};
const svgI = (k, sz = 20) => `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>`;
const MENU = [
  { id: 'inicio', label: 'Início', href: 'index.html', ic: 'home' },
  { id: 'favoritos', label: 'Favoritos', ic: 'star', fav: true },
  { id: 'pendencias', label: 'Pendências', href: 'pendencias.html', ic: 'check' },
  { id: 'invest', label: 'Investimentos', ic: 'bank', paginas: ['rf', 'rv', 'carteira'], grupos: [
    { t: 'Renda fixa', itens: [['Troca de ativos', 'rolagem.html'], ['Isento × tributado', 'rf-calculadoras.html#isento'], ['Juros recebidos no tempo', 'rf-calculadoras.html#cupons'], ['Juros compostos', 'rf-calculadoras.html#compostos'], ['Saldo parado × aplicado', 'rf-calculadoras.html#parado'], ['Risco de crédito', 'rf-credito.html']] },
    { t: 'Renda variável', itens: [['Boleta de ações', 'rv-boleta.html'], ['FIIs em atenção', 'fiis.html']] },
    { t: 'Carteira', itens: [['Carteira e rebalanceamento', 'carteira.html']] }] },
  { id: 'mercado', label: 'Mercado', href: 'mercado.html', ic: 'news' },
];
const PAGINAS = [
  ['Início', 'index.html', 'home inicio painel'], ['Pendências', 'pendencias.html', 'tarefas pendencias to-do urgente'],
  ['FIIs em atenção', 'fiis.html', 'fii fiis fundos imobiliarios fiagro manual atencao pontos criticos dividendos pvp dy'],
  ['Boleta de ações', 'rv-boleta.html', 'renda variavel acoes fii ordens compra venda de acordo broker'],
  ['Troca de ativos', 'rolagem.html', 'renda fixa rolagem desagio cdb troca'],
  ['Isento × tributado', 'rf-calculadoras.html#isento', 'lci lca gross-up equivalencia'],
  ['Juros recebidos no tempo', 'rf-calculadoras.html#cupons', 'cupom cupons fluxo ntn-b juros semestrais pagamento'],
  ['Juros compostos', 'rf-calculadoras.html#compostos', 'aportes simulacao patrimonio'],
  ['Saldo parado × aplicado', 'rf-calculadoras.html#parado', 'saldo parado conta corrente inflacao perda poder de compra cdi rendimento caixa'],
  ['Risco de crédito', 'rf-credito.html', 'renda fixa rating fgc emissor concentracao vencimentos'],
  ['Visão geral de renda fixa', 'rf.html', 'renda fixa ferramentas'],
  ['Carteira e rebalanceamento', 'carteira.html', ' alocacao over under recomendada'],
  ['Mercado ao vivo', 'mercado.html', 'noticias infomoney cotacoes'],
];
const favs = () => store.get('rw_favs', []);
const semAcentoNav = t => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

(function renderLayout() {
  const h = document.querySelector('header.top');
  if (!h) return;
  const page = h.dataset.page, arq = (location.pathname.split('/').pop() || 'index.html') + (location.hash || '');
  document.body.classList.add('has-side');

  const side = document.createElement('aside');
  side.className = 'side no-print';
  side.innerHTML = `<a class="side-logo" href="index.html" title="WorkBroker">WB</a>
    <nav class="side-nav">${MENU.map(m => {
      const ativo = m.id === page || (m.paginas || []).includes(page);
      const inner = `${svgI(m.ic)}<span>${m.label}</span>`;
      return m.href && !m.grupos ? `<a class="side-item ${ativo ? 'on' : ''}" href="${m.href}" data-m="${m.id}">${inner}</a>`
        : `<button class="side-item ${ativo ? 'on' : ''}" data-m="${m.id}" type="button">${inner}</button>`;
    }).join('')}</nav>`;
  document.body.appendChild(side);

  const fly = document.createElement('div');
  fly.className = 'fly no-print'; fly.id = 'fly';
  document.body.appendChild(fly);
  const shade = document.createElement('div');
  shade.className = 'side-shade no-print';
  document.body.appendChild(shade);

  h.innerHTML = `<div class="bar">
      <button class="menu-btn" type="button" aria-label="Menu">${svgI('menu', 22)}</button>
      <a class="brand" href="index.html"><span class="mark">WB</span><span class="name">Work<b>Broker</b></span></a>
      <div class="busca"><input type="search" id="buscaPag" placeholder="Buscar página ou ferramenta" autocomplete="off">${svgI('search', 18)}<div class="busca-res" id="buscaRes"></div></div>
    </div>`;

  // painel de subpáginas
  let fecharT;
  const linha = ([nome, href]) => {
    const f = favs().includes(href), atual = href === arq || href.split('#')[0] === arq && !href.includes('#');
    return `<div class="fly-row ${atual ? 'on' : ''}"><a href="${href}">${esc(nome)}</a><button class="fly-star ${f ? 'f' : ''}" data-fav="${href}" data-nome="${esc(nome)}" title="${f ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}" type="button">${svgI('star', 16)}</button></div>`;
  };
  function abrir(id) {
    const m = MENU.find(x => x.id === id); if (!m) return;
    let html;
    if (m.fav) {
      const F = favs().map(href => PAGINAS.find(p => p[1] === href)).filter(Boolean);
      html = `<div class="fly-t">Favoritos</div>${F.length ? F.map(p => linha([p[0], p[1]])).join('') : '<p class="note">Toque na ☆ ao lado de qualquer página para fixá-la aqui.</p>'}`;
    } else html = m.grupos.map(g => `<div class="fly-t">${esc(g.t)}</div>${g.itens.map(linha).join('')}`).join('<hr>');
    fly.innerHTML = html; fly.classList.add('on'); fly.dataset.m = id;
    side.querySelectorAll('.side-item').forEach(b => b.classList.toggle('hover', b.dataset.m === id));
  }
  function fechar() { fly.classList.remove('on'); side.querySelectorAll('.side-item').forEach(b => b.classList.remove('hover')); }
  const temPainel = id => { const m = MENU.find(x => x.id === id); return m && (m.grupos || m.fav); };
  let abertoEm = 0;
  side.addEventListener('mouseover', e => { const b = e.target.closest('.side-item'); if (!b || !matchMedia('(hover: hover)').matches) return; clearTimeout(fecharT); if (temPainel(b.dataset.m)) { if (fly.dataset.m !== b.dataset.m || !fly.classList.contains('on')) abertoEm = Date.now(); abrir(b.dataset.m); } else fechar(); });
  side.addEventListener('click', e => { const b = e.target.closest('button.side-item'); if (!b) return; const recem = Date.now() - abertoEm < 500; fly.classList.contains('on') && fly.dataset.m === b.dataset.m && !recem ? fechar() : abrir(b.dataset.m); });
  [side, fly].forEach(el => { el.addEventListener('mouseleave', () => { if (matchMedia('(hover: hover)').matches) fecharT = setTimeout(fechar, 250); }); el.addEventListener('mouseenter', () => clearTimeout(fecharT)); });
  fly.addEventListener('click', e => {
    const st = e.target.closest('[data-fav]'); if (!st) return;
    e.preventDefault();
    const F = favs(), href = st.dataset.fav;
    store.set('rw_favs', F.includes(href) ? F.filter(x => x !== href) : [...F, href]);
    abrir(fly.dataset.m);
  });
  // celular: menu abre por cima
  const menuBtn = h.querySelector('.menu-btn');
  menuBtn.onclick = () => document.body.classList.toggle('side-open');
  shade.onclick = () => { document.body.classList.remove('side-open'); fechar(); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { fechar(); document.body.classList.remove('side-open'); } });

  // busca de páginas
  const inp = h.querySelector('#buscaPag'), res = h.querySelector('#buscaRes');
  const achar = q => { q = semAcentoNav(q.trim()); return q ? PAGINAS.filter(p => semAcentoNav(p[0] + ' ' + p[2]).includes(q)).slice(0, 7) : []; };
  inp.addEventListener('input', () => {
    const r = achar(inp.value);
    res.innerHTML = r.length ? r.map(p => `<a href="${p[1]}">${esc(p[0])}</a>`).join('') : inp.value.trim() ? '<div class="note" style="padding:10px 14px">Nada encontrado</div>' : '';
    res.classList.toggle('on', !!inp.value.trim());
  });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { const r = achar(inp.value); if (r[0]) location.href = r[0][1]; } });
  inp.addEventListener('blur', () => setTimeout(() => res.classList.remove('on'), 200));
  document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); inp.focus(); } });
})();

// ---------- Widgets do TradingView (cotações) ----------
function tvWidget(container, nome, config) {
  if (!container) return;
  container.innerHTML = '<div class="tradingview-widget-container" style="height:100%;width:100%"><div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div></div>';
  const s = document.createElement('script');
  s.src = `https://s3.tradingview.com/external-embedding/embed-widget-${nome}.js`;
  s.async = true;
  s.text = JSON.stringify(config);
  container.firstChild.appendChild(s);
}

// ---------- Rodapé com indicadores macro (data/macro.json, atualizado pelo GitHub Actions) ----------
function fmtMacro(i) {
  const n = (v, min, max) => v.toLocaleString('pt-BR', { minimumFractionDigits: min, maximumFractionDigits: max });
  if (i.valor == null) return '—';
  switch (i.fmt) {
    case 'pct': return n(i.valor, 2, 2) + '%';
    case 'brl': return 'R$ ' + n(i.valor, 3, 3);
    case 'usd': return 'US$ ' + n(i.valor, 2, 2);
    case 'pts': return n(i.valor, 0, 0) + ' pts';
    default: return n(i.valor, 2, 2);
  }
}
(function rodapeMacro() {
  if (document.body.dataset.ticker === 'off') return;
  const bar = document.createElement('a');
  bar.className = 'ticker-bar no-print';
  bar.href = 'mercado.html';
  bar.setAttribute('aria-label', 'Indicadores de mercado');
  bar.innerHTML = '<div class="ticker-ph">Carregando indicadores…</div>';
  document.body.appendChild(bar);
  document.body.classList.add('has-ticker');
  async function carregar() {
    try {
      const d = await carregarDados('macro.json');
      const itens = d.itens.map(i => {
        const v = i.var != null ? `<span class="tk-var ${i.var >= 0 ? 'up' : 'down'}">${i.var >= 0 ? '▲' : '▼'} ${Math.abs(i.var).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</span>` : '';
        return `<span class="tk"><span class="tk-n">${esc(i.nome)}</span><b>${fmtMacro(i)}</b>${v}${i.sub ? `<span class="tk-s">${esc(i.sub)}</span>` : ''}</span>`;
      }).join('');
      bar.innerHTML = `<div class="tk-track">${itens}${itens}</div>`;
      const track = bar.firstChild;
      track.style.animationDuration = Math.max(25, track.scrollWidth / 2 / 45) + 's';
    } catch { if (!bar.querySelector('.tk')) bar.innerHTML = '<div class="ticker-ph">Indicadores indisponíveis no momento</div>'; }
  }
  carregar();
  setInterval(carregar, 5 * 60 * 1000);
})();
