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
