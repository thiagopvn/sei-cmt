// Card de detalhes de uma tarefa/rotina ou de um compromisso, aberto pela Agenda: tudo o que
// importa numa janela só (quando, onde, etapas, observação), com ações rápidas. "Editar" abre
// o formulário completo.

import { store } from '../store.js';
import { esc, money } from '../lib/util.js';
import { icon } from '../lib/icons.js';
import { fmtLong, fmtShort, todayKey, relDays } from '../lib/dates.js';
import { openModal, toast } from '../ui/overlay.js';
import { areaOf, typeOf, colorVar } from '../ui/parts.js';
import { STATUS, PRIORITY, isDone, checklistFor, toggleDone, toggleCheck, taskSeconds } from '../domain/tasks.js';
import { describeRule } from '../domain/recurrence.js';
import { EVENT_TYPES, eventTimeLabel, eventInstances } from '../domain/events.js';
import { conflicts } from '../domain/agenda.js';
import { fmtDuration } from '../timer.js';
import { openTaskForm } from './task.js';
import { openEventForm } from './event.js';

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function hero(state, { area, kind, ic, title, done = false }) {
  const a = areaOf(state, area);
  return `<div class="item-hero ${done ? 'is-done' : ''}" style="--c: ${a ? colorVar(a.color) : 'var(--text-3)'}">
    <span class="item-ic">${icon(done ? 'check' : ic, 22)}</span>
    <div class="item-hero-main">
      <div class="item-kind">${esc(kind)}${a ? ` · ${esc(a.name)}` : ''}</div>
      <h3 class="item-title">${esc(title)}</h3>
    </div>
  </div>`;
}

const facts = (rows) => `<dl class="facts">${rows.filter(Boolean).map(([dt, dd]) => `<div><dt>${esc(dt)}</dt><dd>${dd}</dd></div>`).join('')}</dl>`;
const when = (date, time, today) => `${cap(fmtLong(date))}${time ? ` · ${esc(time)}` : ''}<small>${esc(relDays(date, today))}</small>`;
const noteBlock = (text) => (text ? `<div class="note-line">${icon('note', 14)}<span>${esc(text)}</span></div>` : '');

function reminderLabel(m) {
  const n = Number(m);
  if (n === 0) return 'Na hora';
  if (n < 60) return `${n} min antes`;
  if (n < 1440) return `${n / 60} h antes`;
  return `${n / 1440} dia(s) antes`;
}

/** Tarefa, demanda com prazo ou rotina (uma ocorrência). `key`: ocorrência da rotina (data) ou 'once'. */
export function openTaskSheet({ task, key = 'once' }) {
  const state = store.get();
  const today = todayKey();
  const t = state.tasks.find((x) => x.id === task.id) || task;
  const k = key || 'once';
  const routine = !!t.recurrence;
  const done = isDone(t, k);
  const date = routine && k !== 'once' ? k : t.due;
  const checks = checklistFor(t, k);
  const type = typeOf(state, t.type);
  const spent = taskSeconds(state, t.id);
  const paid = Number(t.value) > 0;

  const checklist = checks.length ? `<section class="sheet-sec sheet-checks">
    <div class="sheet-sec-head">${icon('tasks', 15)}<strong>Etapas</strong><span class="muted small" data-progress>${checks.filter((c) => c.done).length} de ${checks.length}</span></div>
    <div class="meter"><span class="meter-fill" data-meter style="width: ${Math.round((checks.filter((c) => c.done).length / checks.length) * 100)}%"></span></div>
    <ul>${checks.map((c) => `<li><label class="sheet-check"><input type="checkbox" ${c.done ? 'checked' : ''} data-check="${esc(c.id)}"><span class="cb">${icon('check', 12)}</span><span class="ct">${esc(c.title)}</span></label></li>`).join('')}</ul>
  </section>` : '';

  const m = openModal({
    title: routine ? 'Rotina' : 'Tarefa',
    size: 'sm',
    body: `
      ${hero(state, { area: t.area, kind: routine ? 'Rotina' : type?.name || 'Tarefa', ic: routine ? 'repeat' : 'flag', title: t.title, done })}
      ${facts([
        date ? ['Quando', when(date, t.dueTime, today)] : ['Quando', 'Sem prazo definido'],
        routine ? ['Repete', esc(describeRule(t.recurrence, t.due))] : ['Situação', esc(done ? STATUS.done : STATUS[t.status] || STATUS.todo)],
        ['Prioridade', esc(PRIORITY[t.priority] || PRIORITY[2])],
        t.process ? ['Processo', esc(t.process)] : null,
        paid ? ['Valor', `${money(t.value)}<small>${t.receivedAt ? 'recebido' : 'a receber'}${t.payer ? ` de ${esc(t.payer)}` : ''}</small>`] : null,
        spent ? ['Tempo registrado', esc(fmtDuration(spent))] : null,
      ])}
      ${checklist}
      ${noteBlock(t.notes)}`,
    footer: `<div class="sheet-actions">
      <button type="button" class="btn ${done ? '' : 'btn-primary'}" data-it="toggle">${icon(done ? 'undo' : 'check', 16)}${done ? 'Reabrir' : 'Concluir'}</button>
      <button type="button" class="btn" data-it="edit">${icon('edit', 16)}Editar</button>
      <a class="btn" href="#/tarefas" data-it="go">${icon('tasks', 16)}Ver em Tarefas</a>
    </div>`,
    onMount(el) {
      // Etapas marcadas aqui mesmo; o progresso acompanha sem fechar o card.
      el.querySelectorAll('[data-check]').forEach((cb) => cb.addEventListener('change', () => {
        store.update((s) => {
          const x = s.tasks.find((y) => y.id === t.id);
          if (x) toggleCheck(x, k, cb.dataset.check);
        });
        const list = checklistFor(store.get().tasks.find((y) => y.id === t.id) || t, k);
        const n = list.filter((c) => c.done).length;
        el.querySelector('[data-progress]').textContent = `${n} de ${list.length}`;
        el.querySelector('[data-meter]').style.width = `${Math.round((n / list.length) * 100)}%`;
      }));
      el.querySelectorAll('[data-it]').forEach((b) => b.addEventListener('click', () => {
        const act = b.dataset.it;
        if (act === 'toggle') {
          let nowDone = false;
          store.update((s) => {
            const x = s.tasks.find((y) => y.id === t.id);
            if (x) nowDone = toggleDone(x, k, new Date().toISOString());
          }, { undoable: true });
          toast(nowDone ? 'Concluída' : 'Reaberta', { action: { label: 'Desfazer', onClick: () => store.undo() } });
        }
        m.close();
        if (act === 'edit') openTaskForm({ task: t, key: k });
      }));
    },
  });
  return m;
}

/** Compromisso (uma ocorrência, no dia `date`). */
export function openEventSheet({ event, date = null }) {
  const state = store.get();
  const today = todayKey();
  const ev = state.events.find((x) => x.id === event.id) || event;
  const d = date || ev.date;
  const inst = eventInstances(ev, d, d)[0] || null;
  const multi = inst && inst.days > 1;
  const conf = conflicts(state, d, d).filter((c) => c.item?.ref?.eventId === ev.id);

  const m = openModal({
    title: 'Compromisso',
    size: 'sm',
    body: `
      ${hero(state, { area: ev.area, kind: EVENT_TYPES[ev.type] || EVENT_TYPES.compromisso, ic: 'calendar', title: ev.title })}
      ${conf.map((c) => `<div class="notice notice-serious">${icon('shield', 16)}<span><strong>Você está de serviço nesse dia</strong> (${esc(c.shift.start)}, ${c.shift.hours}h). ${esc(c.reason)}.</span></div>`).join('')}
      ${facts([
        ['Quando', when(d, null, today)],
        ['Horário', esc(eventTimeLabel(ev))],
        multi ? ['Período', `${esc(fmtShort(ev.date))} a ${esc(fmtShort(ev.endDate))}<small>dia ${inst.day} de ${inst.days}</small>`] : null,
        ev.location ? ['Local', esc(ev.location)] : null,
        ev.recurrence ? ['Repete', esc(describeRule(ev.recurrence, ev.date))] : null,
        ev.reminder != null && ev.reminder !== '' ? ['Lembrete', esc(reminderLabel(ev.reminder))] : null,
      ])}
      ${noteBlock(ev.notes)}`,
    footer: `<div class="sheet-actions">
      <button type="button" class="btn btn-primary" data-it="edit">${icon('edit', 16)}Editar</button>
      <a class="btn" href="#/agenda?d=${esc(d)}" data-it="go">${icon('calendar', 16)}Ver o dia</a>
    </div>`,
    onMount(el) {
      el.querySelectorAll('[data-it]').forEach((b) => b.addEventListener('click', () => {
        m.close();
        if (b.dataset.it === 'edit') openEventForm({ event: ev, date: d });
      }));
    },
  });
  return m;
}
