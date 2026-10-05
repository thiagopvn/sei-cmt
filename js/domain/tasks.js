// Tarefas, demandas com prazo e rotinas (tarefas recorrentes).
//
// task = { id, title, area, type, priority: 1|2|3, status: 'todo'|'doing'|'waiting'|'done',
//          due, dueTime, recurrence, occ: { [date]: { done, checks: [ids] } },
//          alertDays: null|[n], checklist: [{ id, title, done }], process, value, payDate,
//          receivedAt, notes, createdAt, doneAt }

import { addDays, diffDays, monthEnd, monthOf, nextWeekday, addMonths, dateInMonth, fromKey, toKey } from '../lib/dates.js';
import { normalize, sum } from '../lib/util.js';
import { lastOccurrence, nextOccurrence, occurrences } from './recurrence.js';

export const STATUS = {
  todo: 'A fazer',
  doing: 'Em andamento',
  waiting: 'Aguardando',
  done: 'Concluída',
};

export const PRIORITY = { 1: 'Alta', 2: 'Normal', 3: 'Baixa' };

export function isDone(task, key) {
  if (!task.recurrence) return task.status === 'done';
  return !!task.occ?.[key]?.done;
}

/** Instância "da vez" de uma tarefa: a ocorrência pendente mais relevante. */
export function activeInstance(task, today) {
  if (!task.recurrence) {
    return { task, key: 'once', date: task.due || null, done: task.status === 'done' };
  }
  const last = lastOccurrence(task.due, task.recurrence, today);
  if (last && (!isDone(task, last) || last === today)) {
    return { task, key: last, date: last, done: isDone(task, last) };
  }
  const next = nextOccurrence(task.due, task.recurrence, today);
  return next ? { task, key: next, date: next, done: isDone(task, next) } : null;
}

export function instancesInRange(task, from, to) {
  if (!task.recurrence) {
    return task.due && task.due >= from && task.due <= to
      ? [{ task, key: 'once', date: task.due, done: task.status === 'done' }] : [];
  }
  return occurrences(task.due, task.recurrence, from, to).map((d) => ({ task, key: d, date: d, done: isDone(task, d) }));
}

/** 'done' | 'none' | 'overdue' | 'today' | 'tomorrow' | 'soon' | 'week' | 'later' */
export function urgency(inst, today) {
  if (inst.done) return 'done';
  if (!inst.date) return 'none';
  const n = diffDays(today, inst.date);
  if (n < 0) return 'overdue';
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n <= 3) return 'soon';
  if (n <= 7) return 'week';
  return 'later';
}

export const GROUPS = [
  ['overdue', 'Atrasadas'],
  ['today', 'Hoje'],
  ['tomorrow', 'Amanhã'],
  ['soon', 'Próximos dias'],
  ['week', 'Esta semana'],
  ['later', 'Mais adiante'],
  ['none', 'Sem prazo'],
  ['done', 'Concluídas'],
];

export function compareInstances(a, b) {
  const da = a.date || '9999';
  const db = b.date || '9999';
  if (da !== db) return da.localeCompare(db);
  const ta = a.task.dueTime || '99';
  const tb = b.task.dueTime || '99';
  if (ta !== tb) return ta.localeCompare(tb);
  return (a.task.priority || 2) - (b.task.priority || 2) || a.task.title.localeCompare(b.task.title);
}

export function groupInstances(instances, today) {
  const map = new Map(GROUPS.map(([k]) => [k, []]));
  for (const inst of instances) map.get(urgency(inst, today)).push(inst);
  for (const list of map.values()) list.sort(compareInstances);
  map.get('done').sort((a, b) => (b.task.doneAt || b.date || '').localeCompare(a.task.doneAt || a.date || ''));
  return GROUPS.map(([k, label]) => ({ key: k, label, items: map.get(k) })).filter((g) => g.items.length);
}

export function checklistFor(task, key) {
  const list = task.checklist || [];
  if (!task.recurrence) return list;
  const checks = task.occ?.[key]?.checks || [];
  return list.map((c) => ({ ...c, done: checks.includes(c.id) }));
}

export function toggleDone(task, key, nowIso) {
  if (!task.recurrence) {
    const done = task.status !== 'done';
    task.status = done ? 'done' : 'todo';
    task.doneAt = done ? nowIso : null;
    return done;
  }
  task.occ = task.occ || {};
  const o = task.occ[key] || {};
  o.done = o.done ? null : nowIso;
  task.occ[key] = o;
  return !!o.done;
}

export function toggleCheck(task, key, checkId) {
  if (!task.recurrence) {
    const c = task.checklist.find((x) => x.id === checkId);
    if (c) c.done = !c.done;
    return;
  }
  task.occ = task.occ || {};
  const o = task.occ[key] || {};
  const set = new Set(o.checks || []);
  if (set.has(checkId)) set.delete(checkId); else set.add(checkId);
  o.checks = [...set];
  task.occ[key] = o;
}

/** Sequência de ocorrências concluídas seguidas (para rotinas). */
export function streak(task, today) {
  if (!task.recurrence) return 0;
  let n = 0;
  let d = lastOccurrence(task.due, task.recurrence, today);
  if (d && d === today && !isDone(task, d)) d = lastOccurrence(task.due, task.recurrence, addDays(today, -1));
  for (let i = 0; d && i < 366; i++) {
    if (!isDone(task, d)) break;
    n++;
    d = lastOccurrence(task.due, task.recurrence, addDays(d, -1));
  }
  return n;
}

export function taskSeconds(state, taskId) {
  return sum(state.timeLog.filter((l) => l.taskId === taskId), (l) => l.sec);
}

// ---------- Captura rápida em linguagem natural ----------

const WD_KEYS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
const WD_RE = '(?:domingo|segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado)s?(?:-feiras?)?';
const END = '(?=[\\s,.;]|$)';

const wdIndex = (word) => WD_KEYS.findIndex((k) => normalize(word).startsWith(k));

function findMatch(text, entity, list) {
  const n = normalize(entity);
  return list.find((x) => normalize(x.id) === n || normalize(x.name) === n)
    || list.find((x) => normalize(x.name).startsWith(n) || normalize(x.id).startsWith(n));
}

/**
 * Interpreta frases como:
 *   "Enviar PAD até sexta #pad !alta"
 *   "Buscar filha na creche toda terça e quinta às 17h30 @família"
 *   "Prova de Direito Penal 12/11 às 19h #prova"
 */
export function parseQuick(input, today, { areas = [], types = [] } = {}) {
  let s = ` ${input} `;
  const out = { title: '', due: null, dueTime: null, priority: 2, type: null, area: null, recurrence: null };
  const take = (re, fn) => {
    const m = s.match(re);
    if (!m) return false;
    fn(m);
    s = `${s.slice(0, m.index)} ${s.slice(m.index + m[0].length)}`;
    return true;
  };

  // Recorrência
  take(new RegExp(`\\s(?:tod[ao]s?\\s+(?:as\\s+|os\\s+)?)${WD_RE}(?:\\s*(?:,|e)\\s*${WD_RE})*${END}`, 'i'), (m) => {
    const days = [...m[0].matchAll(new RegExp(WD_RE, 'gi'))].map((x) => wdIndex(x[0])).filter((d) => d >= 0);
    out.recurrence = { freq: 'weekly', days: [...new Set(days)].sort() };
    out.due = days.map((d) => nextWeekday(today, d)).sort()[0];
  })
  || take(new RegExp(`\\stodo\\s+dia\\s+(\\d{1,2})${END}`, 'i'), (m) => {
    const day = Math.min(31, Number(m[1]));
    out.recurrence = { freq: 'monthly' };
    let d = dateInMonth(monthOf(today), day);
    if (d < today) d = dateInMonth(addMonths(monthOf(today), 1), day);
    out.due = d;
  })
  || take(new RegExp(`\\s(?:todos\\s+os\\s+dias|todo\\s+dia|diariamente)${END}`, 'i'), () => { out.recurrence = { freq: 'daily' }; })
  || take(new RegExp(`\\s(?:(?:nos\\s+|em\\s+)?dias\\s+[úu]teis|de\\s+segunda\\s+a\\s+sexta)${END}`, 'i'), () => { out.recurrence = { freq: 'weekdays' }; })
  || take(new RegExp(`\\s(?:toda\\s+semana|semanalmente)${END}`, 'i'), () => { out.recurrence = { freq: 'weekly' }; })
  || take(new RegExp(`\\s(?:todo\\s+m[êe]s|mensalmente)${END}`, 'i'), () => { out.recurrence = { freq: 'monthly' }; })
  || take(new RegExp(`\\s(?:todo\\s+ano|anualmente)${END}`, 'i'), () => { out.recurrence = { freq: 'yearly' }; });

  // Data
  const PRE = '(?:at[ée]\\s+(?:[ao]\\s+)?|para\\s+(?:[ao]\\s+)?|pra\\s+|em\\s+|n[ao]\\s+)?';
  take(new RegExp(`\\s${PRE}depois\\s+de\\s+amanh[ãa]${END}`, 'i'), () => { out.due = addDays(today, 2); })
  || take(new RegExp(`\\s${PRE}amanh[ãa]${END}`, 'i'), () => { out.due = addDays(today, 1); })
  || take(new RegExp(`\\s${PRE}hoje${END}`, 'i'), () => { out.due = today; })
  || take(new RegExp(`\\s${PRE}(?:dia\\s+)?(\\d{1,2})\\/(\\d{1,2})(?:\\/(\\d{2,4}))?${END}`, 'i'), (m) => {
    const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : fromKey(today).getFullYear();
    let d = toKey(new Date(y, Number(m[2]) - 1, Number(m[1])));
    if (!m[3] && d < today) d = toKey(new Date(y + 1, Number(m[2]) - 1, Number(m[1])));
    out.due = d;
  })
  || take(new RegExp(`\\s${PRE}(?:o\\s+)?dia\\s+(\\d{1,2})${END}`, 'i'), (m) => {
    const day = Math.min(31, Number(m[1]));
    let d = dateInMonth(monthOf(today), day);
    if (d < today) d = dateInMonth(addMonths(monthOf(today), 1), day);
    out.due = d;
  })
  || take(new RegExp(`\\s${PRE}(?:o\\s+)?fi(?:m|nal)\\s+do\\s+m[êe]s${END}`, 'i'), () => { out.due = monthEnd(monthOf(today)); })
  || take(new RegExp(`\\s${PRE}(?:semana\\s+que\\s+vem|pr[óo]xima\\s+semana)${END}`, 'i'), () => { out.due = addDays(today, 7); })
  || take(new RegExp(`\\s${PRE}(pr[óo]xim[ao]\\s+)?(${WD_RE})${END}`, 'i'), (m) => {
    out.due = nextWeekday(today, wdIndex(m[2]), !m[1]);
  });

  // Hora ("às 14", "14:30", "14h30", "19h"). "2h" sozinho é duração, não horário.
  const setTime = (h, min = 0) => {
    h = Number(h);
    min = Number(min || 0);
    if (h < 24 && min < 60) out.dueTime = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  };
  take(new RegExp(`\\s[àa]s\\s+(\\d{1,2})(?:[h:](\\d{2})?h?)?${END}`, 'i'), (m) => setTime(m[1], m[2]))
  || take(new RegExp(`\\s(\\d{1,2})(?:h|:)(\\d{2})${END}`, 'i'), (m) => setTime(m[1], m[2]))
  || take(new RegExp(`\\s([6-9]|1\\d|2[0-3])h${END}`, 'i'), (m) => setTime(m[1]));

  // Prioridade
  take(/\s(?:!!|!(?:alta|urgente|1))(?=[\s,.;]|$)/i, () => { out.priority = 1; })
  || take(/\s!(?:baixa|3)(?=[\s,.;]|$)/i, () => { out.priority = 3; })
  || take(/\s!(?:normal|m[ée]dia|2)(?=[\s,.;]|$)/i, () => { out.priority = 2; });

  // Tipo (#pad) e área (@faculdade)
  take(/\s#([\p{L}\d-]+)/iu, (m) => { out.type = findMatch(s, m[1], types)?.id || null; });
  take(/\s@([\p{L}\d-]+)/iu, (m) => { out.area = findMatch(s, m[1], areas)?.id || null; });

  if (out.recurrence && !out.due) out.due = today;
  if (!out.area && out.type) out.area = types.find((t) => t.id === out.type)?.area || null;
  out.title = s.replace(/\s+/g, ' ').trim().replace(/^[,.;-]\s*|\s*[,.;-]$/g, '') || input.trim();
  return out;
}
