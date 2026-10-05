// Utilitários gerais: escape de HTML, ids, dinheiro e normalização de texto.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID().slice(0, 12);
  return Math.random().toString(36).slice(2, 14);
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const money = (n) => BRL.format(Number(n) || 0);

/** Aceita "1.234,56", "1234.56", "R$ 80" → número. */
export function parseMoney(v) {
  if (typeof v === 'number') return v;
  let s = String(v ?? '').replace(/[^\d,.-]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

/** Valor para preencher um input de dinheiro: 1234.5 → "1234,50". */
export const moneyInput = (n) => (n ? Number(n).toFixed(2).replace('.', ',') : '');

export const normalize = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function debounce(fn, ms = 200) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export const sum = (arr, f = (x) => x) => arr.reduce((acc, x) => acc + (Number(f(x)) || 0), 0);
