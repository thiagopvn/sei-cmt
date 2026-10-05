// Agenda unificada: junta serviços, trocas, tarefas/prazos, compromissos e finanças
// por dia, e detecta conflitos com os dias de serviço.

import { addDays, addMonths, monthOf, toMin, eachDay } from '../lib/dates.js';
import { shiftsInRange, shiftTitle } from './shifts.js';
import { instancesInRange } from './tasks.js';
import { eventInstances, eventTimeLabel, EVENT_TYPES } from './events.js';
import { ledger } from './finance.js';
import { money } from '../lib/util.js';

export const LAYERS = {
  servico: 'Serviços',
  tarefa: 'Prazos',
  evento: 'Compromissos',
  rotina: 'Rotinas',
  financa: 'Finanças',
};

/**
 * Map<'YYYY-MM-DD', item[]>, item = { id, layer, area, time, title, sub, done, kind, ref }
 */
export function collectRange(state, from, to, { layers = null, area = null } = {}) {
  const on = (l) => !layers || layers.includes(l);
  const okArea = (a) => !area || a === area;
  const map = new Map(eachDay(from, to).map((d) => [d, []]));
  const push = (d, item) => map.get(d)?.push(item);

  if (on('servico') && (!area || area === 'trabalho')) {
    for (const sh of shiftsInRange(state, from, to)) {
      push(sh.date, {
        id: `sh:${sh.id}`, layer: 'servico', area: 'trabalho', time: sh.start, kind: sh.kind,
        title: shiftTitle(sh), sub: `${sh.start} · ${sh.hours}h${sh.unit ? ` · ${sh.unit}` : ''}`,
        done: false, ref: { shift: sh },
      });
    }
  }
  if (on('tarefa') || on('rotina')) {
    for (const t of state.tasks) {
      const layer = t.recurrence ? 'rotina' : 'tarefa';
      if (!on(layer) || !okArea(t.area)) continue;
      for (const inst of instancesInRange(t, from, to)) {
        push(inst.date, {
          id: `t:${t.id}:${inst.key}`, layer, area: t.area, time: t.dueTime || null,
          kind: t.recurrence ? 'rotina' : 'prazo', title: t.title,
          sub: t.recurrence ? 'Rotina' : 'Prazo', done: inst.done, ref: { taskId: t.id, key: inst.key },
        });
      }
    }
  }
  if (on('evento') || on('rotina')) {
    for (const ev of state.events) {
      const layer = ev.recurrence ? 'rotina' : 'evento';
      if (!on(layer) || !okArea(ev.area)) continue;
      for (const inst of eventInstances(ev, from, to)) {
        push(inst.date, {
          id: `ev:${ev.id}:${inst.key}`, layer, area: ev.area,
          time: ev.allDay ? null : ev.start || null, kind: ev.type,
          title: ev.title,
          sub: `${inst.days > 1 ? `Dia ${inst.day} de ${inst.days}` : eventTimeLabel(ev)}${ev.location ? ` · ${ev.location}` : ''}`,
          done: false, ref: { eventId: ev.id, date: inst.date },
        });
      }
    }
  }
  if (on('financa') && !area) {
    for (let M = monthOf(from); M <= monthOf(to); M = addMonths(M, 1)) {
      for (const it of ledger(state, M)) {
        if (it.date < from || it.date > to) continue;
        push(it.date, {
          id: `f:${it.key}`, layer: 'financa', area: null, time: null, kind: it.kind,
          title: it.title, sub: `${it.kind === 'receita' ? 'Receber' : 'Pagar'} ${money(it.amount)}`,
          done: !!it.settledAt, ref: { item: it },
        });
      }
    }
  }
  const order = { servico: 0, evento: 1, rotina: 2, tarefa: 3, financa: 4 };
  for (const list of map.values()) {
    list.sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99') || order[a.layer] - order[b.layer]);
  }
  return map;
}

/**
 * Conflitos com dias de serviço: compromissos durante o turno e prazos que caem no dia do serviço.
 */
export function conflicts(state, from, to) {
  const out = [];
  const shifts = shiftsInRange(state, from, to).filter((s) => s.active);
  if (!shifts.length) return out;
  const items = collectRange(state, from, addDays(to, 1), { layers: ['tarefa', 'evento', 'rotina'] });
  for (const sh of shifts) {
    const startAbs = toMin(sh.start);
    const endAbs = startAbs + sh.hours * 60;
    const days = [[sh.date, 0], [addDays(sh.date, 1), 1440]];
    for (const [d, offset] of days) {
      for (const it of items.get(d) || []) {
        if (it.done) continue;
        if (it.ref.taskId) {
          if (offset === 0 && it.kind === 'prazo') out.push({ date: d, shift: sh, item: it, reason: 'Prazo no dia do serviço' });
          continue;
        }
        const ev = state.events.find((e) => e.id === it.ref.eventId);
        if (ev?.type === 'afastamento') {
          if (offset === 0) out.push({ date: d, shift: sh, item: it, reason: `Serviço durante ${EVENT_TYPES.afastamento.toLowerCase()}` });
          continue;
        }
        if (it.time == null) {
          if (offset === 0) out.push({ date: d, shift: sh, item: it, reason: 'Compromisso no dia do serviço' });
          continue;
        }
        const t = toMin(it.time) + offset;
        if (t >= startAbs && t < endAbs) out.push({ date: d, shift: sh, item: it, reason: 'Compromisso durante o serviço' });
      }
    }
  }
  return out;
}
