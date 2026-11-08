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
  { id: 'rv', href: 'rv.html', label: 'Renda variável' },
  { id: 'rf', href: 'rf.html', label: 'Renda fixa' },
  { id: 'carteira', href: 'carteira.html', label: 'Carteira e rebalanceamento' },
  { id: 'mercado', href: 'mercado.html', label: 'Mercado ao vivo' },
  { id: 'relatorio', href: '#', label: 'Relatório mensal', soon: true },
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
      const r = await fetch('data/macro.json?t=' + Math.floor(Date.now() / 300000), { cache: 'no-store' });
      if (!r.ok) throw 0;
      const d = await r.json();
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
