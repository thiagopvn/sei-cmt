// Formulário de tarefa / demanda / rotina.

import { store, NO_ALERTS } from '../store.js';
import { esc, uid, parseMoney, moneyInput, money } from '../lib/util.js';
import { icon } from '../lib/icons.js';
import { todayKey } from '../lib/dates.js';
import { openModal, confirmDialog, toast } from '../ui/overlay.js';
import { field, input, select, textarea, segmented, recurrenceFields, bindRecurrence, readRecurrence, toggle } from '../ui/fields.js';
import { STATUS, taskSeconds, checklistFor } from '../domain/tasks.js';
import { startTimer, fmtDuration } from '../timer.js';

const ALERT_OPTIONS = [[0, 'No dia'], [1, '1 dia antes'], [2, '2 dias'], [3, '3 dias'], [7, '1 semana'], [15, '15 dias'], [30, '30 dias']];

function checklistEditor(items) {
  return `<div class="checklist-edit" data-checklist>
    <ul>${items.map((c) => checklistItem(c)).join('')}</ul>
    <div class="checklist-add">
      <input type="text" placeholder="Adicionar etapa…" data-new-check enterkeyhint="done" aria-label="Nova etapa">
      <button type="button" class="btn btn-sm" data-add-check>${icon('plus', 16)}Adicionar</button>
    </div>
  </div>`;
}

const checklistItem = (c) => `
  <li data-id="${esc(c.id)}">
    <label class="check-line"><input type="checkbox" ${c.done ? 'checked' : ''} data-check-done><span class="check-box">${icon('check', 12)}</span></label>
    <input type="text" value="${esc(c.title)}" data-check-title aria-label="Etapa">
    <button type="button" class="icon-btn" data-remove-check aria-label="Remover etapa">${icon('x', 16)}</button>
  </li>`;

function bindChecklist(el) {
  const box = el.querySelector('[data-checklist]');
  const ul = box.querySelector('ul');
  const add = () => {
    const inp = box.querySelector('[data-new-check]');
    const title = inp.value.trim();
    if (!title) return;
    ul.insertAdjacentHTML('beforeend', checklistItem({ id: uid(), title, done: false }));
    inp.value = '';
    inp.focus();
  };
  box.querySelector('[data-add-check]').addEventListener('click', add);
  box.querySelector('[data-new-check]').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      add();
    }
  });
  box.addEventListener('click', (e) => {
    if (e.target.closest('[data-remove-check]')) e.target.closest('li').remove();
  });
}

function readChecklist(el) {
  return [...el.querySelectorAll('[data-checklist] li')].map((li) => ({
    id: li.dataset.id,
    title: li.querySelector('[data-check-title]').value.trim(),
    done: li.querySelector('[data-check-done]').checked,
  })).filter((c) => c.title);
}

/**
 * @param {object} opts
 * @param {object} [opts.task]     tarefa existente
 * @param {string} [opts.key]      ocorrência (para rotinas)
 * @param {object} [opts.defaults] valores iniciais para nova tarefa
 */
export function openTaskForm({ task = null, key = null, defaults = {} } = {}) {
  const state = store.get();
  const isNew = !task;
  const t = task || {
    title: '', area: defaults.area || state.areas[0]?.id, type: defaults.type || 'outro', priority: 2, status: 'todo',
    due: defaults.due || '', dueTime: defaults.dueTime || '', recurrence: defaults.recurrence || null,
    checklist: [], process: '', value: 0, notes: '', alertDays: null,
  };
  const checklist = task ? checklistFor(task, key || 'once') : t.checklist;
  const alertDays = t.alertDays || state.settings.alertDays;
  const spent = task ? taskSeconds(state, task.id) : 0;
  const typeOptions = state.types.map((x) => ({ value: x.id, label: x.name }));
  const areaOptions = state.areas.map((a) => ({ value: a.id, label: a.name }));
  const title = isNew ? (t.recurrence ? 'Nova rotina' : 'Nova tarefa') : (task.recurrence ? 'Editar rotina' : 'Editar tarefa');

  const body = `
    ${field('O que precisa ser feito?', input('title', t.title, 'required autofocus placeholder="Ex.: Enviar PAD, Estudar Português, Pagar IPVA" maxlength="200" autocomplete="off"'))}
    <div class="grid-2">
      ${field('Área', select('area', areaOptions, t.area))}
      ${field('Tipo', select('type', typeOptions, t.type), { hint: isNew ? 'Alguns tipos já trazem um passo a passo.' : '' })}
    </div>
    <div class="grid-2">
      ${field(t.recurrence ? 'Começa em' : 'Prazo', input('due', t.due, 'type="date"'), { id: 'due-field' })}
      ${field('Horário (opcional)', input('dueTime', t.dueTime, 'type="time"'))}
    </div>
    ${recurrenceFields(t.recurrence)}
    ${field('Prioridade', segmented('priority', [[1, 'Alta'], [2, 'Normal'], [3, 'Baixa']], t.priority))}
    <div class="status-field" ${t.recurrence ? 'hidden' : ''}>
      ${field('Situação', segmented('status', Object.entries(STATUS), t.status))}
    </div>
    <div class="alert-field">
      <span class="field-label">${icon('bell', 14)} Avisar antes do prazo</span>
      <div class="chips-row">${ALERT_OPTIONS.map(([n, l]) => `
        <label class="chip-check"><input type="checkbox" name="alertDays" value="${n}" ${alertDays.includes(n) ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
    </div>
    <div class="field">
      <span class="field-label">Passo a passo</span>
      ${checklistEditor(checklist)}
    </div>
    <details class="more" ${t.process || Number(t.value) > 0 || t.notes ? 'open' : ''}>
      <summary>Mais detalhes: processo, valor a receber e anotações</summary>
      ${field('Nº do processo / SEI / documento', input('process', t.process, 'placeholder="Ex.: SEI-270001/000123/2026" autocomplete="off"'))}
      ${toggle('hasValue', Number(t.value) > 0, 'Este trabalho gera renda (ex.: TCC, IPM, serviço avulso)')}
      <div class="value-fields grid-2" ${Number(t.value) > 0 ? '' : 'hidden'}>
        ${field('Valor a receber', input('value', moneyInput(t.value), 'inputmode="decimal" placeholder="0,00"'))}
        ${field('Previsão de pagamento', input('payDate', t.payDate || '', 'type="date"'))}
      </div>
      ${field('Anotações', textarea('notes', t.notes, 'placeholder="Contatos, links, observações…"'))}
    </details>
    ${task ? `<div class="time-spent">${icon('timer', 16)} Tempo registrado: <strong>${spent ? fmtDuration(spent) : 'nenhum'}</strong></div>` : ''}
  `;

  const footer = `
    ${task ? `<button type="button" class="btn btn-ghost-danger" data-delete>${icon('trash', 16)}Excluir</button>` : ''}
    <span class="spacer"></span>
    ${task && !task.recurrence ? `<button type="button" class="btn" data-timer>${icon('timer', 16)}Cronometrar</button>` : ''}
    <button type="submit" class="btn btn-primary">${isNew ? 'Criar' : 'Salvar'}</button>`;

  const m = openModal({
    title,
    body,
    footer,
    onMount(el) {
      bindRecurrence(el);
      bindChecklist(el);
      const freq = el.querySelector('select[name="freq"]');
      const syncFreq = () => {
        el.querySelector('.status-field').hidden = !!freq.value;
        el.querySelector('#due-field .field-label').textContent = freq.value ? 'Começa em' : 'Prazo';
      };
      freq.addEventListener('change', syncFreq);
      el.querySelector('[name="hasValue"]').addEventListener('change', (e) => {
        el.querySelector('.value-fields').hidden = !e.target.checked;
      });
      if (isNew) {
        el.querySelector('[name="type"]').addEventListener('change', (e) => {
          const type = store.get().types.find((x) => x.id === e.target.value);
          if (!type) return;
          if (type.area) el.querySelector('[name="area"]').value = type.area;
          const ul = el.querySelector('[data-checklist] ul');
          if (!ul.children.length && type.checklist?.length) {
            ul.innerHTML = type.checklist.map((c) => checklistItem({ id: uid(), title: c, done: false })).join('');
          }
        });
      }
      el.querySelector('[data-delete]')?.addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: 'Excluir tarefa?',
          message: task.recurrence ? 'A rotina e todo o histórico dela serão excluídos.' : `“${task.title}” será excluída.`,
          confirmLabel: 'Excluir',
          danger: true,
        });
        if (!ok) return;
        store.update((s) => {
          s.tasks = s.tasks.filter((x) => x.id !== task.id);
          if (s.timer?.taskId === task.id) s.timer = null;
        }, { undoable: true });
        m.close();
        toast('Tarefa excluída', { action: { label: 'Desfazer', onClick: () => store.undo() } });
      });
      el.querySelector('[data-timer]')?.addEventListener('click', () => {
        el.querySelector('form').requestSubmit();
        startTimer(task.id);
      });
    },
    onSubmit(fd, form) {
      const rec = readRecurrence(fd);
      if (rec?.freq === 'weekly' && !rec.days?.length) delete rec.days;
      const due = fd.get('due') || (rec ? todayKey() : null);
      const list = readChecklist(form);
      const hasValue = fd.get('hasValue') === 'on';
      const data = {
        title: fd.get('title').trim(),
        area: fd.get('area'),
        type: fd.get('type'),
        due,
        dueTime: fd.get('dueTime') || null,
        recurrence: rec,
        priority: Number(fd.get('priority')) || 2,
        alertDays: fd.getAll('alertDays').length ? fd.getAll('alertDays').map(Number) : NO_ALERTS,
        process: fd.get('process').trim(),
        value: hasValue ? parseMoney(fd.get('value')) : 0,
        payDate: hasValue ? fd.get('payDate') || null : null,
        notes: fd.get('notes').trim(),
      };
      store.update((s) => {
        if (isNew) {
          const status = rec ? 'todo' : fd.get('status') || 'todo';
          s.tasks.push({
            id: uid(), ...data, status, occ: {}, createdAt: new Date().toISOString(),
            doneAt: status === 'done' ? new Date().toISOString() : null,
            checklist: list.map((c) => ({ ...c, done: rec ? false : c.done })),
          });
          return;
        }
        const x = s.tasks.find((y) => y.id === task.id);
        if (!x) return;
        Object.assign(x, data);
        if (rec) {
          // Em rotinas, o "feito" de cada etapa é guardado por ocorrência.
          x.checklist = list.map(({ id, title: tt }) => ({ id, title: tt, done: false }));
          if (key && key !== 'once') {
            x.occ = x.occ || {};
            x.occ[key] = { ...(x.occ[key] || {}), checks: list.filter((c) => c.done).map((c) => c.id) };
          }
        } else {
          x.checklist = list;
          const status = fd.get('status') || 'todo';
          if (status === 'done' && x.status !== 'done') x.doneAt = new Date().toISOString();
          if (status !== 'done') x.doneAt = null;
          x.status = status;
        }
      });
      toast(isNew ? `${rec ? 'Rotina criada' : 'Tarefa criada'}${data.value ? ` · ${money(data.value)} a receber` : ''}` : 'Alterações salvas');
    },
  });
  return m;
}
