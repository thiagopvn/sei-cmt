// Pedaços de interface reutilizados entre as telas.

import { esc, money } from '../lib/util.js';
import { icon } from '../lib/icons.js';
import { diffDays, fmtShort, monthLabel, relDays } from '../lib/dates.js';
import { checklistFor, urgency } from '../domain/tasks.js';
import { describeRule } from '../domain/recurrence.js';

export const areaOf = (state, id) => state.areas.find((a) => a.id === id) || null;
export const typeOf = (state, id) => state.types.find((t) => t.id === id) || null;

export const dot = (color) => `<span class="dot" style="--c: var(--c${color || 0})"></span>`;

export function areaTag(state, id) {
  const a = areaOf(state, id);
  return a ? `<span class="meta">${dot(a.color)}${esc(a.name)}</span>` : '';
}

export function dueChip(inst, today) {
  const u = urgency(inst, today);
  const time = inst.task.dueTime ? ` · ${inst.task.dueTime}` : '';
  switch (u) {
    case 'overdue': {
      const n = -diffDays(today, inst.date);
      return `<span class="pill pill-critical">${icon('alert', 13)}Atrasada ${n === 1 ? 'há 1 dia' : `há ${n} dias`}</span>`;
    }
    case 'today': return `<span class="pill pill-warning">${icon('clock', 13)}Hoje${time}</span>`;
    case 'tomorrow': return `<span class="pill pill-soft">${icon('clock', 13)}Amanhã${time}</span>`;
    case 'soon':
    case 'week': return `<span class="pill pill-soft">${fmtShort(inst.date)}${time} · ${relDays(inst.date, today)}</span>`;
    case 'later': return `<span class="meta">${icon('calendar', 13)}${fmtShort(inst.date)}${time}</span>`;
    case 'done': return inst.date ? `<span class="meta">${fmtShort(inst.date)}</span>` : '';
    default: return '';
  }
}

export function taskRow(state, inst, today, { showArea = true, showDate = true } = {}) {
  const t = inst.task;
  const list = checklistFor(t, inst.key);
  const doneCount = list.filter((c) => c.done).length;
  const running = state.timer?.taskId === t.id;
  const type = typeOf(state, t.type);
  const status = !t.recurrence && !inst.done && t.status !== 'todo'
    ? `<span class="pill pill-soft">${t.status === 'doing' ? 'Em andamento' : 'Aguardando'}</span>` : '';
  return `
    <div class="row task-row ${inst.done ? 'is-done' : ''}" role="button" tabindex="0"
         data-action="task-open" data-id="${esc(t.id)}" data-key="${esc(inst.key)}">
      <button type="button" class="check ${inst.done ? 'checked' : ''}" data-action="task-toggle" data-id="${esc(t.id)}" data-key="${esc(inst.key)}"
        aria-label="${inst.done ? 'Desmarcar' : 'Concluir'}: ${esc(t.title)}" aria-pressed="${inst.done}">${icon('check', 14)}</button>
      <div class="row-main">
        <div class="row-title">${t.priority === 1 && !inst.done ? `<span class="prio-flag" title="Prioridade alta">${icon('flag', 14)}</span>` : ''}${esc(t.title)}</div>
        <div class="row-meta">
          ${showDate ? dueChip(inst, today) : ''}
          ${status}
          ${t.recurrence ? `<span class="meta">${icon('repeat', 13)}${esc(describeRule(t.recurrence, t.due))}</span>` : ''}
          ${type && type.id !== 'outro' ? `<span class="meta">${esc(type.name)}</span>` : ''}
          ${showArea ? areaTag(state, t.area) : ''}
          ${list.length ? `<span class="meta">${icon('tasks', 13)}${doneCount}/${list.length}</span>` : ''}
          ${t.process ? `<span class="meta">nº ${esc(t.process)}</span>` : ''}
          ${Number(t.value) > 0 ? `<span class="meta">${icon('coins', 13)}${money(t.value)}${t.receivedAt ? ' · recebido' : ''}</span>` : ''}
        </div>
      </div>
      ${inst.done ? '' : `<button type="button" class="icon-btn timer-btn ${running ? 'on' : ''}" data-action="${running ? 'timer-stop' : 'timer-start'}" data-id="${esc(t.id)}"
        aria-label="${running ? 'Parar cronômetro' : 'Iniciar cronômetro'}">${icon(running ? 'stop' : 'timer', 18)}</button>`}
    </div>`;
}

export function emptyState(ic, title, text = '', action = '') {
  return `<div class="empty">
    <div class="empty-ic">${icon(ic, 26)}</div>
    <strong>${esc(title)}</strong>
    ${text ? `<p>${text}</p>` : ''}
    ${action}
  </div>`;
}

export function tile(label, value, { sub = '', ic = '', to = '', tone = '' } = {}) {
  const tag = to ? 'a' : 'div';
  return `<${tag} class="tile ${tone}" ${to ? `href="${esc(to)}"` : ''}>
    <span class="tile-label">${ic ? icon(ic, 16) : ''}${esc(label)}</span>
    <span class="tile-value">${value}</span>
    ${sub ? `<span class="tile-sub">${sub}</span>` : ''}
  </${tag}>`;
}

export function monthNav(M, action) {
  return `<div class="month-nav">
    <button type="button" class="icon-btn" data-action="${action}" data-step="-1" aria-label="Mês anterior">${icon('chevronLeft')}</button>
    <button type="button" class="month-label" data-action="${action}" data-step="0" title="Voltar para o mês atual">${monthLabel(M)}</button>
    <button type="button" class="icon-btn" data-action="${action}" data-step="1" aria-label="Próximo mês">${icon('chevronRight')}</button>
  </div>`;
}

export function tabs(items, active, action) {
  return `<div class="tabs" role="tablist">${items.map(([id, label, badge]) => `
    <button type="button" role="tab" class="tab ${id === active ? 'active' : ''}" aria-selected="${id === active}"
      data-action="${action}" data-value="${esc(id)}">${esc(label)}${badge ? `<span class="badge">${badge}</span>` : ''}</button>`).join('')}</div>`;
}

export function chips(items, active, action, { all = null } = {}) {
  const list = all ? [[null, all], ...items] : items;
  return `<div class="chips" role="group">${list.map(([id, label, color]) => `
    <button type="button" class="chip ${String(id) === String(active) ? 'active' : ''}" aria-pressed="${String(id) === String(active)}"
      data-action="${action}" data-value="${esc(id ?? '')}">${color ? dot(color) : ''}${esc(label)}</button>`).join('')}</div>`;
}

export const LAYER_COLOR = { servico: 6, troca: 7, tarefa: 2, evento: 5, rotina: 3, financa: 4 };

export function agendaItemRow(state, it) {
  const color = it.layer === 'servico'
    ? (it.kind === 'servico' ? LAYER_COLOR.servico : LAYER_COLOR.troca)
    : it.layer === 'financa' ? LAYER_COLOR.financa : areaOf(state, it.area)?.color || LAYER_COLOR[it.layer];
  const checkable = !!it.ref.taskId || it.layer === 'financa';
  const checkAction = it.ref.taskId
    ? `data-action="task-toggle" data-id="${esc(it.ref.taskId)}" data-key="${esc(it.ref.key)}"`
    : it.layer === 'financa' ? `data-action="fin-toggle" data-key="${esc(it.ref.item.key)}" data-month="${esc(it.ref.item.date.slice(0, 7))}"` : '';
  return `
    <div class="row agenda-row layer-${it.layer} kind-${esc(it.kind)} ${it.done ? 'is-done' : ''}" role="button" tabindex="0"
         data-action="agenda-open" data-item="${esc(it.id)}">
      <span class="bar" style="--c: var(--c${color})"></span>
      <span class="agenda-time">${it.time ? esc(it.time) : '—'}</span>
      <div class="row-main">
        <div class="row-title">${esc(it.title)}</div>
        <div class="row-meta"><span class="meta">${esc(it.sub)}</span>${it.layer !== 'servico' && it.area ? areaTag(state, it.area) : ''}</div>
      </div>
      ${checkable ? `<button type="button" class="check ${it.done ? 'checked' : ''}" ${checkAction} aria-label="${it.done ? 'Desmarcar' : 'Marcar como feito'}">${icon('check', 14)}</button>` : ''}
    </div>`;
}
