// Compromissos: consultas, provas, reuniões, buscar a filha, férias/afastamentos…
//
// event = { id, title, area, type, date, endDate, allDay, start, end, location,
//           recurrence, reminder (minutos antes | null), notes, skip: [datas] }

import { addDays, diffDays } from '../lib/dates.js';
import { occurrences } from './recurrence.js';

export const EVENT_TYPES = {
  compromisso: 'Compromisso',
  prova: 'Prova',
  aula: 'Aula',
  consulta: 'Saúde / consulta',
  familia: 'Família',
  afastamento: 'Férias / afastamento',
  aniversario: 'Aniversário',
  outro: 'Outro',
};

/** Instâncias de um compromisso por dia dentro do intervalo. */
export function eventInstances(ev, from, to) {
  if (!ev.date) return [];
  const skip = new Set(ev.skip || []);
  if (ev.recurrence) {
    return occurrences(ev.date, ev.recurrence, from, to).filter((d) => !skip.has(d)).map((d) => ({ event: ev, date: d, key: d }));
  }
  const end = ev.endDate && ev.endDate > ev.date ? ev.endDate : ev.date;
  const out = [];
  for (let d = ev.date > from ? ev.date : from; d <= end && d <= to; d = addDays(d, 1)) {
    out.push({ event: ev, date: d, key: d, day: diffDays(ev.date, d) + 1, days: diffDays(ev.date, end) + 1 });
  }
  return out;
}

export function eventTimeLabel(ev) {
  if (ev.allDay || !ev.start) return 'Dia todo';
  return ev.end ? `${ev.start}–${ev.end}` : ev.start;
}
