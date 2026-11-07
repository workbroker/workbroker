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

// Cabeçalho comum a todas as páginas: <header class="top" data-page="..."></header>
const NAV = [
  { id: 'inicio', href: 'index.html', label: 'Início' },
  { id: 'troca', href: 'rolagem.html', label: 'Troca de ativos' },
  { id: 'carteira', href: 'carteira.html', label: 'Carteira e rebalanceamento' },
  { id: 'relatorio', href: '#', label: 'Relatório mensal', soon: true },
  { id: 'mercado', href: 'mercado.html', label: 'Mercado ao vivo' },
];
(function renderHeader() {
  const h = document.querySelector('header.top');
  if (!h) return;
  const page = h.dataset.page;
  h.innerHTML = `
    <div class="bar">
      <a class="brand" href="index.html"><span class="mark">RW</span><span class="name">Rico<b>.</b>Work</span></a>
    </div>
    <nav>${NAV.map(n => `<a href="${n.href}" class="${n.id === page ? 'active' : ''}">${n.label}${n.soon ? '<span class="soon">em breve</span>' : ''}</a>`).join('')}</nav>`;
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

// Ativos da faixa de cotações do rodapé (edite aqui para trocar a lista)
const TICKERS = [
  ['BMFBOVESPA:IBOV', 'Ibovespa'], ['FX_IDC:USDBRL', 'Dólar'], ['BMFBOVESPA:IFIX', 'IFIX'],
  ['BMFBOVESPA:PETR4', 'PETR4'], ['BMFBOVESPA:VALE3', 'VALE3'], ['BMFBOVESPA:ITUB4', 'ITUB4'],
  ['BMFBOVESPA:BBAS3', 'BBAS3'], ['BMFBOVESPA:BBDC4', 'BBDC4'], ['BMFBOVESPA:B3SA3', 'B3SA3'],
  ['BMFBOVESPA:WEGE3', 'WEGE3'], ['BMFBOVESPA:ABEV3', 'ABEV3'], ['FX_IDC:EURBRL', 'Euro'],
  ['TVC:UKOIL', 'Petróleo Brent'], ['TVC:GOLD', 'Ouro'], ['FOREXCOM:SPXUSD', 'S&P 500'],
  ['FOREXCOM:NSXUSD', 'Nasdaq 100'], ['BITSTAMP:BTCUSD', 'Bitcoin'],
];
(function rodapeCotacoes() {
  if (document.body.dataset.ticker === 'off') return;
  const bar = document.createElement('div');
  bar.className = 'ticker-bar no-print';
  bar.innerHTML = '<div class="ticker-ph">Carregando cotações…</div>';
  document.body.appendChild(bar);
  document.body.classList.add('has-ticker');
  setTimeout(() => tvWidget(bar, 'ticker-tape', {
    symbols: TICKERS.map(([proName, title]) => ({ proName, title })),
    showSymbolLogo: true, isTransparent: true, displayMode: 'adaptive', colorTheme: 'dark', locale: 'br',
  }), 50);
})();
