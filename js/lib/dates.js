// Utilitários de data. Datas são strings 'YYYY-MM-DD' (chaves) e meses 'YYYY-MM',
// sempre no fuso local, para evitar problemas de UTC.

export const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
export const WEEKDAYS_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const WEEKDAYS_MIN = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
export const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
  'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export const pad = (n) => String(n).padStart(2, '0');

export function toKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromKey(k) {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d || 1);
}

export function isValidKey(k) {
  return typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k) && toKey(fromKey(k)) === k;
}

export const todayKey = (now = new Date()) => toKey(now);

export function addDays(k, n) {
  const d = fromKey(k);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

/** b - a, em dias. */
export function diffDays(a, b) {
  return Math.round((fromKey(b) - fromKey(a)) / 86400000);
}

export const weekday = (k) => fromKey(k).getDay();

export function startOfWeek(k, weekStart = 0) {
  return addDays(k, -((weekday(k) - weekStart + 7) % 7));
}

export const monthOf = (k) => k.slice(0, 7);

export function addMonths(monthKey, n) {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function monthDiff(a, b) {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
}

export const daysInMonth = (y, m0) => new Date(y, m0 + 1, 0).getDate();

/** Dia `day` do mês, limitado ao último dia (ex.: dia 31 em fevereiro → 28/29). */
export function dateInMonth(monthKey, day) {
  const [y, m] = monthKey.split('-').map(Number);
  return `${monthKey}-${pad(Math.min(day, daysInMonth(y, m - 1)))}`;
}

export const monthStart = (monthKey) => `${monthKey}-01`;
export function monthEnd(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  return `${monthKey}-${pad(daysInMonth(y, m - 1))}`;
}

export function toMin(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function fromMin(min) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export const nowMin = (now = new Date()) => now.getHours() * 60 + now.getMinutes();

/** Próxima data (a partir de `fromK`) cujo dia da semana é `wd`. */
export function nextWeekday(fromK, wd, includeToday = true) {
  let diff = (wd - weekday(fromK) + 7) % 7;
  if (diff === 0 && !includeToday) diff = 7;
  return addDays(fromK, diff);
}

export function eachDay(from, to) {
  const out = [];
  for (let k = from; k <= to; k = addDays(k, 1)) out.push(k);
  return out;
}

// ---------- Formatação ----------

export function fmtLong(k) {
  const d = fromKey(k);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}

export function fmtShort(k) {
  const d = fromKey(k);
  return `${WEEKDAYS_SHORT[d.getDay()]}, ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

export function fmtDM(k) {
  const d = fromKey(k);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

export function fmtFull(k) {
  const d = fromKey(k);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function monthLabel(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  return `${MONTHS[m - 1]} de ${y}`;
}

export function monthShortLabel(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  return `${MONTHS_SHORT[m - 1]}/${String(y).slice(2)}`;
}

/** "hoje", "amanhã", "em 3 dias", "há 2 dias"… */
export function relDays(k, today) {
  const n = diffDays(today, k);
  if (n === 0) return 'hoje';
  if (n === 1) return 'amanhã';
  if (n === -1) return 'ontem';
  if (n > 1) return `em ${n} dias`;
  return `há ${-n} dias`;
}

export function hoursLabel(h) {
  return Number.isInteger(h) ? `${h}h` : `${Math.floor(h)}h${pad(Math.round((h % 1) * 60))}`;
}
