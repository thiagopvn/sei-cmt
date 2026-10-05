// Campo de captura rápida: escreva em português e o app entende prazo, hora, área e tipo.

import { store } from '../store.js';
import { esc, uid } from '../lib/util.js';
import { icon } from '../lib/icons.js';
import { fmtShort, todayKey } from '../lib/dates.js';
import { parseQuick, PRIORITY } from '../domain/tasks.js';
import { describeRule } from '../domain/recurrence.js';
import { toast } from './overlay.js';
import { openTaskForm } from '../forms/task.js';

let refocus = false;

export function quickAddHtml(placeholder = 'Ex.: Enviar SEI até sexta #sei !alta') {
  return `
    <form class="quick" data-quick autocomplete="off">
      <div class="quick-box">
        <span class="quick-ic">${icon('plus', 18)}</span>
        <input name="q" type="text" placeholder="${esc(placeholder)}" aria-label="Adicionar tarefa rápida" enterkeyhint="done" maxlength="240">
        <button type="submit" class="btn btn-primary btn-sm">Adicionar</button>
      </div>
      <div class="quick-preview" aria-live="polite"></div>
    </form>`;
}

function previewHtml(p, state) {
  if (!p) return '<span class="quick-hint">Dica: “até sexta”, “amanhã às 14h”, “toda terça”, “dia 10”, <b>#pad</b> <b>#sei</b> <b>#prova</b>, <b>@faculdade</b>, <b>!alta</b></span>';
  const parts = [];
  if (p.recurrence) parts.push(`${icon('repeat', 13)}${esc(describeRule(p.recurrence, p.due))}`);
  else if (p.due) parts.push(`${icon('calendar', 13)}${fmtShort(p.due)}`);
  if (p.dueTime) parts.push(`${icon('clock', 13)}${p.dueTime}`);
  const area = state.areas.find((a) => a.id === p.area);
  if (area) parts.push(`<span class="dot" style="--c: var(--c${area.color})"></span>${esc(area.name)}`);
  const type = state.types.find((t) => t.id === p.type);
  if (type) parts.push(esc(type.name));
  if (p.priority !== 2) parts.push(`${icon('flag', 13)}${PRIORITY[p.priority]}`);
  return parts.map((x) => `<span class="meta">${x}</span>`).join('');
}

export function bindQuickAdd(root, { area = null } = {}) {
  const form = root.querySelector('[data-quick]');
  if (!form) return;
  const inp = form.querySelector('input');
  const prev = form.querySelector('.quick-preview');
  const state = () => store.get();
  const parse = () => (inp.value.trim() ? parseQuick(inp.value, todayKey(), state()) : null);
  const update = () => { prev.innerHTML = previewHtml(parse(), state()); };
  inp.addEventListener('input', update);
  inp.addEventListener('focus', update);
  if (refocus) {
    refocus = false;
    inp.focus();
    update();
  }
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const p = parse();
    if (!p || !p.title) return;
    const s = state();
    const id = uid();
    const type = p.type || 'outro';
    const tpl = s.types.find((t) => t.id === type);
    refocus = true; // a tela é redesenhada dentro do update; o novo campo recebe o foco
    store.update((st) => {
      st.tasks.push({
        id,
        title: p.title,
        area: p.area || area || tpl?.area || st.areas[0]?.id,
        type,
        priority: p.priority,
        status: 'todo',
        due: p.due,
        dueTime: p.dueTime,
        recurrence: p.recurrence,
        occ: {},
        alertDays: null,
        checklist: (tpl?.checklist || []).map((title) => ({ id: uid(), title, done: false })),
        process: '',
        value: 0,
        notes: '',
        createdAt: new Date().toISOString(),
        doneAt: null,
      });
    });
    toast(`${p.recurrence ? 'Rotina' : 'Tarefa'} criada: ${p.title}`, {
      action: { label: 'Detalhes', onClick: () => openTaskForm({ task: store.get().tasks.find((t) => t.id === id), key: p.recurrence ? p.due : 'once' }) },
    });
  });
}
