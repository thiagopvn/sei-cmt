// Ações compartilhadas entre telas, acionadas por data-action="…" (delegação de eventos).

import { store } from './store.js';
import { uid } from './lib/util.js';
import { todayKey, monthOf, fmtShort } from './lib/dates.js';
import { toggleDone, toggleCheck } from './domain/tasks.js';
import { ledger, setSettled } from './domain/finance.js';
import { shiftsInRange } from './domain/shifts.js';
import { openTaskForm } from './forms/task.js';
import { openEventForm } from './forms/event.js';
import { openServiceForm, openSwapForm, openGeneratorForm } from './forms/service.js';
import { openEntryForm, openCardForm } from './forms/finance.js';
import { actionSheet, toast } from './ui/overlay.js';
import { startTimer, stopTimer, fmtDuration } from './timer.js';

const findTask = (id) => store.get().tasks.find((t) => t.id === id);

export function openShift(shift) {
  if (shift.service) return openServiceForm({ service: shift.service });
  if (shift.swap) return openSwapForm({ swap: shift.swap });
  return null;
}

export async function newItemMenu(date = null) {
  const choice = await actionSheet({
    title: date ? `Adicionar em ${fmtShort(date)}` : 'Adicionar',
    options: [
      { value: 'task', label: 'Tarefa ou prazo', sub: 'Documento, PAD, SEI, trabalho da faculdade…', icon: 'tasks', color: 2 },
      { value: 'routine', label: 'Rotina', sub: 'Algo que se repete: diário, semanal, mensal', icon: 'repeat', color: 3 },
      { value: 'event', label: 'Compromisso', sub: 'Consulta, prova, buscar a filha, férias', icon: 'calendar', color: 5 },
      { value: 'service', label: 'Serviço', sub: 'Plantão da escala ou serviço extra', icon: 'shield', color: 'accent' },
      { value: 'swap', label: 'Troca de serviço', sub: 'Quem tira por quem e quando', icon: 'swap', color: 'swap' },
      { value: 'expense', label: 'Conta / despesa', sub: 'Boleto, conta fixa, gasto', icon: 'wallet', color: 2 },
      { value: 'card', label: 'Compra no cartão', sub: 'À vista ou parcelada', icon: 'card', color: 4 },
      { value: 'income', label: 'Receita', sub: 'Salário, trabalho, outra renda', icon: 'coins', color: 6 },
    ],
  });
  const due = date || '';
  switch (choice) {
    case 'task': return openTaskForm({ defaults: { due } });
    case 'routine': return openTaskForm({ defaults: { due: date || todayKey(), recurrence: { freq: 'daily' } } });
    case 'event': return openEventForm({ date });
    case 'service': return openServiceForm({ date });
    case 'swap': return openSwapForm({ myDate: date || '' });
    case 'expense': return openEntryForm({ kind: 'despesa', date });
    case 'income': return openEntryForm({ kind: 'receita', date });
    case 'card':
      if (!store.get().cards.length) {
        toast('Cadastre um cartão primeiro');
        return openCardForm();
      }
      return openEntryForm({ card: true, date });
    default: return null;
  }
}

export const actions = {
  go(el) {
    location.hash = el.dataset.to;
  },
  'task-open'(el) {
    const t = findTask(el.dataset.id);
    if (t) openTaskForm({ task: t, key: el.dataset.key });
  },
  'task-new'(el) {
    openTaskForm({ defaults: { area: el.dataset.area || undefined, due: el.dataset.due || '' } });
  },
  'routine-new'(el) {
    openTaskForm({ defaults: { area: el.dataset.area || undefined, due: todayKey(), recurrence: { freq: 'daily' } } });
  },
  'task-toggle'(el) {
    let done = false;
    let title = '';
    store.update((s) => {
      const t = s.tasks.find((x) => x.id === el.dataset.id);
      if (!t) return;
      title = t.title;
      done = toggleDone(t, el.dataset.key, new Date().toISOString());
      if (done && s.timer?.taskId === t.id && !t.recurrence) {
        // Concluiu a tarefa com o cronômetro rodando: registra o tempo.
        const sec = Math.round((Date.now() - s.timer.startedAt) / 1000);
        if (sec >= 10) s.timeLog.push({ id: uid(), taskId: t.id, area: t.area, date: todayKey(), start: new Date(s.timer.startedAt).toISOString(), sec });
        s.timer = null;
      }
    }, { undoable: true });
    if (done) {
      navigator.vibrate?.(15);
      toast(`Concluída: ${title}`, { action: { label: 'Desfazer', onClick: () => store.undo() } });
    }
  },
  'task-check'(el) {
    store.update((s) => {
      const t = s.tasks.find((x) => x.id === el.dataset.id);
      if (t) toggleCheck(t, el.dataset.key, el.dataset.check);
    });
  },
  'timer-start'(el) {
    startTimer(el.dataset.id);
    toast('Cronômetro iniciado');
  },
  'timer-stop'() {
    const sec = stopTimer();
    if (sec >= 10) toast(`Tempo registrado: ${fmtDuration(sec)}`);
    else toast('Cronômetro parado (menos de 10 s não é registrado)');
  },
  'event-open'(el) {
    const ev = store.get().events.find((x) => x.id === el.dataset.id);
    if (ev) openEventForm({ event: ev, date: el.dataset.date });
  },
  'event-new'(el) {
    openEventForm({ date: el.dataset.date || null, defaults: { type: el.dataset.type, area: el.dataset.area } });
  },
  'service-new'(el) {
    openServiceForm({ date: el.dataset.date || null });
  },
  'service-open'(el) {
    const state = store.get();
    const s = state.services.find((x) => x.id === el.dataset.id);
    if (s) return openServiceForm({ service: s });
    const w = state.swaps.find((x) => x.id === el.dataset.swap);
    if (w) openSwapForm({ swap: w });
  },
  'service-received'(el) {
    store.update((s) => {
      const sv = s.services.find((x) => x.id === el.dataset.id);
      if (sv) sv.receivedAt = sv.receivedAt ? null : todayKey();
    }, { undoable: true });
    const sv = store.get().services.find((x) => x.id === el.dataset.id);
    if (sv?.receivedAt) toast('Pagamento marcado como recebido', { action: { label: 'Desfazer', onClick: () => store.undo() } });
  },
  'swap-new'(el) {
    openSwapForm({ myDate: el.dataset.date || '' });
  },
  'swap-open'(el) {
    const w = store.get().swaps.find((x) => x.id === el.dataset.id);
    if (w) openSwapForm({ swap: w });
  },
  'generate-schedule'() {
    openGeneratorForm();
  },
  'fin-toggle'(el) {
    const M = el.dataset.month || monthOf(todayKey());
    let settled = false;
    store.update((s) => {
      const item = ledger(s, M).find((x) => x.key === el.dataset.key);
      if (!item) return;
      settled = !item.settledAt;
      setSettled(s, item, settled ? todayKey() : null);
    }, { undoable: true });
    if (settled) toast('Marcado como pago/recebido', { action: { label: 'Desfazer', onClick: () => store.undo() } });
  },
  'entry-new'(el) {
    if (el.dataset.card && !store.get().cards.length) {
      toast('Cadastre um cartão primeiro');
      return openCardForm();
    }
    return openEntryForm({ kind: el.dataset.kind || 'despesa', card: !!el.dataset.card, date: el.dataset.date || null });
  },
  'entry-open'(el) {
    const e = store.get().entries.find((x) => x.id === el.dataset.id);
    if (e) openEntryForm({ entry: e });
  },
  'card-new'() {
    openCardForm();
  },
  'card-edit'(el) {
    const c = store.get().cards.find((x) => x.id === el.dataset.id);
    if (c) openCardForm({ card: c });
  },
  'new-menu'(el) {
    newItemMenu(el.dataset.date || null);
  },
  /** Abre um item da agenda unificada (id no formato "tipo:…"). */
  'agenda-open'(el) {
    const id = el.dataset.item;
    const state = store.get();
    const [kind, a, b] = id.split(':');
    if (kind === 't') {
      const t = findTask(a);
      if (t) openTaskForm({ task: t, key: b });
    } else if (kind === 'ev') {
      const ev = state.events.find((x) => x.id === a);
      if (ev) openEventForm({ event: ev, date: b });
    } else if (kind === 'sh') {
      const shiftId = id.slice(3);
      const sh = shiftsInRange(state, '0000-01-01', '9999-12-31').find((x) => x.id === shiftId);
      if (sh) openShift(sh);
    } else if (kind === 'f') {
      const key = id.slice(2);
      const [src, ref] = key.split(':');
      if (src === 'e') openEntryForm({ entry: state.entries.find((x) => x.id === ref) });
      else if (src === 's') openServiceForm({ service: state.services.find((x) => x.id === ref) });
      else if (src === 't') openTaskForm({ task: findTask(ref) });
      else if (src === 'c') import('./forms/finance.js').then((m) => m.openInvoice(ref, key.split(':')[2]));
    }
  },
};
