// Formulário de compromisso (consulta, prova, buscar a filha, férias…).

import { store } from '../store.js';
import { uid } from '../lib/util.js';
import { icon } from '../lib/icons.js';
import { todayKey, fmtShort } from '../lib/dates.js';
import { openModal, actionSheet, toast } from '../ui/overlay.js';
import { field, input, select, textarea, toggle, recurrenceFields, bindRecurrence, readRecurrence } from '../ui/fields.js';
import { EVENT_TYPES } from '../domain/events.js';

const REMINDERS = [
  { value: '', label: 'Sem lembrete' },
  { value: 0, label: 'Na hora' },
  { value: 15, label: '15 min antes' },
  { value: 30, label: '30 min antes' },
  { value: 60, label: '1 hora antes' },
  { value: 120, label: '2 horas antes' },
  { value: 1440, label: '1 dia antes' },
];

const TYPE_AREA = { prova: 'faculdade', aula: 'faculdade', familia: 'familia', consulta: 'pessoal' };

export function openEventForm({ event = null, date = null, defaults = {} } = {}) {
  const state = store.get();
  const isNew = !event;
  const e = event || {
    title: '', type: defaults.type || 'compromisso', area: defaults.area || 'pessoal', date: date || todayKey(),
    endDate: '', allDay: false, start: defaults.start || '', end: '', location: '', recurrence: null, reminder: 30, notes: '',
  };
  const body = `
    ${field('Título', input('title', e.title, 'required autofocus placeholder="Ex.: Buscar filha na creche, Prova de Penal, Dentista" maxlength="200" autocomplete="off"'))}
    <div class="grid-2">
      ${field('Tipo', select('type', EVENT_TYPES, e.type))}
      ${field('Área', select('area', state.areas.map((a) => ({ value: a.id, label: a.name })), e.area))}
    </div>
    <div class="grid-2">
      ${field('Data', input('date', e.date, 'type="date" required'))}
      ${field('Até (vários dias)', input('endDate', e.endDate || '', 'type="date"'), { hint: 'Para férias, viagens, cursos…' })}
    </div>
    ${toggle('allDay', e.allDay, 'Dia todo')}
    <div class="grid-2 time-fields" ${e.allDay ? 'hidden' : ''}>
      ${field('Início', input('start', e.start, 'type="time"'))}
      ${field('Fim', input('end', e.end, 'type="time"'))}
    </div>
    ${recurrenceFields(e.recurrence)}
    <div class="grid-2">
      ${field('Lembrete', select('reminder', REMINDERS, e.reminder ?? ''))}
      ${field('Local', input('location', e.location, 'placeholder="Opcional" autocomplete="off"'))}
    </div>
    ${field('Anotações', textarea('notes', e.notes))}
  `;
  const footer = `
    ${event ? `<button type="button" class="btn btn-ghost-danger" data-delete>${icon('trash', 16)}Excluir</button>` : ''}
    <span class="spacer"></span>
    <button type="submit" class="btn btn-primary">${isNew ? 'Criar' : 'Salvar'}</button>`;

  const m = openModal({
    title: isNew ? 'Novo compromisso' : 'Editar compromisso',
    body,
    footer,
    onMount(el) {
      bindRecurrence(el);
      el.querySelector('[name="allDay"]').addEventListener('change', (ev) => {
        el.querySelector('.time-fields').hidden = ev.target.checked;
      });
      if (isNew) {
        el.querySelector('[name="type"]').addEventListener('change', (ev) => {
          const a = TYPE_AREA[ev.target.value];
          if (a && state.areas.some((x) => x.id === a)) el.querySelector('[name="area"]').value = a;
          if (ev.target.value === 'afastamento' || ev.target.value === 'aniversario') {
            el.querySelector('[name="allDay"]').checked = true;
            el.querySelector('.time-fields').hidden = true;
          }
          if (ev.target.value === 'aniversario') {
            el.querySelector('[name="freq"]').value = 'yearly';
            el.querySelector('[name="freq"]').dispatchEvent(new Event('change'));
          }
        });
      }
      el.querySelector('[data-delete]')?.addEventListener('click', async () => {
        let choice = 'all';
        if (event.recurrence && date) {
          choice = await actionSheet({
            title: 'Excluir compromisso repetido',
            options: [
              { value: 'one', label: `Só em ${fmtShort(date)}`, icon: 'calendar' },
              { value: 'all', label: 'Todas as repetições', icon: 'trash', danger: true },
            ],
          });
          if (!choice) return;
        }
        store.update((s) => {
          if (choice === 'one') {
            const x = s.events.find((y) => y.id === event.id);
            x.skip = [...(x.skip || []), date];
          } else {
            s.events = s.events.filter((y) => y.id !== event.id);
          }
        }, { undoable: true });
        m.close();
        toast('Compromisso excluído', { action: { label: 'Desfazer', onClick: () => store.undo() } });
      });
    },
    onSubmit(fd) {
      const allDay = fd.get('allDay') === 'on';
      const data = {
        title: fd.get('title').trim(),
        type: fd.get('type'),
        area: fd.get('area'),
        date: fd.get('date'),
        endDate: fd.get('endDate') && fd.get('endDate') > fd.get('date') ? fd.get('endDate') : '',
        allDay,
        start: allDay ? '' : fd.get('start'),
        end: allDay ? '' : fd.get('end'),
        recurrence: readRecurrence(fd),
        reminder: fd.get('reminder') === '' ? null : Number(fd.get('reminder')),
        location: fd.get('location').trim(),
        notes: fd.get('notes').trim(),
      };
      store.update((s) => {
        if (isNew) s.events.push({ id: uid(), ...data, skip: [], createdAt: new Date().toISOString() });
        else Object.assign(s.events.find((y) => y.id === event.id), data);
      });
      toast(isNew ? 'Compromisso criado' : 'Compromisso salvo');
    },
  });
  return m;
}
