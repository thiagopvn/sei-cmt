// Recorrência de tarefas e compromissos.
// rule = { freq: 'daily'|'weekdays'|'weekly'|'monthly'|'yearly', interval?: n, days?: [0..6], until?: 'YYYY-MM-DD' }

import { addDays, diffDays, fromKey, startOfWeek, weekday, daysInMonth, WEEKDAYS_SHORT } from '../lib/dates.js';

export const FREQS = {
  daily: 'Todos os dias',
  weekdays: 'Dias úteis (seg a sex)',
  weekly: 'Semanal',
  monthly: 'Mensal',
  yearly: 'Anual',
};

export function occursOn(rule, startKey, k) {
  if (!rule || !startKey || k < startKey) return false;
  if (rule.until && k > rule.until) return false;
  const interval = Math.max(1, Number(rule.interval) || 1);
  switch (rule.freq) {
    case 'daily':
      return diffDays(startKey, k) % interval === 0;
    case 'weekdays': {
      const w = weekday(k);
      return w >= 1 && w <= 5;
    }
    case 'weekly': {
      const days = rule.days?.length ? rule.days : [weekday(startKey)];
      if (!days.includes(weekday(k))) return false;
      const weeks = diffDays(startOfWeek(startKey), startOfWeek(k)) / 7;
      return weeks % interval === 0;
    }
    case 'monthly': {
      const s = fromKey(startKey);
      const d = fromKey(k);
      const months = (d.getFullYear() - s.getFullYear()) * 12 + d.getMonth() - s.getMonth();
      if (months % interval !== 0) return false;
      return d.getDate() === Math.min(s.getDate(), daysInMonth(d.getFullYear(), d.getMonth()));
    }
    case 'yearly': {
      const s = fromKey(startKey);
      const d = fromKey(k);
      if ((d.getFullYear() - s.getFullYear()) % interval !== 0 || d.getMonth() !== s.getMonth()) return false;
      return d.getDate() === Math.min(s.getDate(), daysInMonth(d.getFullYear(), d.getMonth()));
    }
    default:
      return false;
  }
}

/** Datas em que um item (com `date` inicial e `recurrence`) acontece entre from e to. */
export function occurrences(startKey, rule, from, to) {
  if (!startKey) return [];
  if (!rule) return startKey >= from && startKey <= to ? [startKey] : [];
  const out = [];
  let k = startKey > from ? startKey : from;
  const end = rule.until && rule.until < to ? rule.until : to;
  for (; k <= end; k = addDays(k, 1)) if (occursOn(rule, startKey, k)) out.push(k);
  return out;
}

/** Última ocorrência <= `k` (busca até ~400 dias para trás). */
export function lastOccurrence(startKey, rule, k) {
  if (!startKey || k < startKey) return null;
  if (!rule) return startKey;
  for (let i = 0, d = k; i < 400 && d >= startKey; i++, d = addDays(d, -1)) {
    if (occursOn(rule, startKey, d)) return d;
  }
  return null;
}

/** Próxima ocorrência > `k`. */
export function nextOccurrence(startKey, rule, k) {
  if (!startKey) return null;
  if (!rule) return startKey > k ? startKey : null;
  let d = startKey > k ? startKey : addDays(k, 1);
  for (let i = 0; i < 800; i++, d = addDays(d, 1)) {
    if (rule.until && d > rule.until) return null;
    if (occursOn(rule, startKey, d)) return d;
  }
  return null;
}

export function describeRule(rule, startKey) {
  if (!rule) return 'Não repete';
  const n = Math.max(1, Number(rule.interval) || 1);
  let s;
  switch (rule.freq) {
    case 'daily': s = n === 1 ? 'Todos os dias' : `A cada ${n} dias`; break;
    case 'weekdays': s = 'Dias úteis'; break;
    case 'weekly': {
      const days = (rule.days?.length ? rule.days : [weekday(startKey)]).slice().sort();
      const names = days.map((d) => WEEKDAYS_SHORT[d]).join(', ');
      s = n === 1 ? `Toda ${names}` : `A cada ${n} semanas (${names})`;
      break;
    }
    case 'monthly': s = `${n === 1 ? 'Todo mês' : `A cada ${n} meses`}, dia ${fromKey(startKey).getDate()}`; break;
    case 'yearly': {
      const d = fromKey(startKey);
      s = `Todo ano, ${d.getDate()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
      break;
    }
    default: s = 'Repete';
  }
  return s;
}
