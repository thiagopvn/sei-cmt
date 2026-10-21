// Agenda unificada: mês (com camadas e painel do dia) e lista dos próximos dias.

import { esc } from '../lib/util.js';
import { icon } from '../lib/icons.js';
import { addDays, addMonths, monthOf, monthStart, startOfWeek, fmtLong, fmtShort, relDays, WEEKDAYS_SHORT, fromKey, todayKey } from '../lib/dates.js';
import { collectRange, conflicts, LAYERS } from '../domain/agenda.js';
import { shiftPill, shiftLegend, byDuty } from '../ui/shiftui.js';
import { agendaItemRow, monthNav, tabs, emptyState, dot, colorVar, LAYER_COLOR, agendaItemColor } from '../ui/parts.js';
import { rerender } from '../ui/bus.js';
import { exportAgendaPdf } from '../print.js';

const PREF = 'pauta:agenda';
// Rotinas começam ocultas na agenda para não poluir (elas aparecem em Início e Tarefas).
const DEFAULT_LAYERS = ['servico', 'tarefa', 'evento', 'financa'];

let ui = loadPrefs();
let month = null;
let selected = null;

function loadPrefs() {
  try {
    return { mode: 'mes', layers: DEFAULT_LAYERS, area: '', ...JSON.parse(localStorage.getItem(PREF) || '{}') };
  } catch {
    return { mode: 'mes', layers: DEFAULT_LAYERS, area: '' };
  }
}

function savePrefs() {
  try {
    localStorage.setItem(PREF, JSON.stringify(ui));
  } catch { /* ignora */ }
}

function filters(state) {
  const layerChips = Object.entries(LAYERS).map(([id, label]) => `
    <button type="button" class="chip ${ui.layers.includes(id) ? 'active' : ''}" aria-pressed="${ui.layers.includes(id)}" data-action="ag-layer" data-value="${esc(id)}">
      ${dot(LAYER_COLOR[id])}${esc(label)}</button>`).join('');
  return `<div class="filters">
    <div class="chips">${layerChips}</div>
    <select class="select-sm" data-action-change="ag-area" aria-label="Filtrar por área">
      <option value="">Todas as áreas</option>
      ${state.areas.map((a) => `<option value="${esc(a.id)}" ${ui.area === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}
    </select>
  </div>`;
}

function cellHtml(state, d, items, today, M) {
  // Os que eu tiro vêm primeiro; o permutado (tracejado) depois.
  const shifts = items.filter((i) => i.layer === 'servico').map((i) => i.ref.shift).sort(byDuty);
  const others = items.filter((i) => i.layer !== 'servico');
  const dots = others.slice(0, 4).map((i) => {
    const color = i.layer === 'financa' ? LAYER_COLOR.financa : state.areas.find((a) => a.id === i.area)?.color || LAYER_COLOR[i.layer];
    return `<span class="dot ${i.done ? 'hollow' : ''}" style="--c: ${colorVar(color)}"></span>`;
  }).join('');
  // Mais de um serviço no dia: mostra até dois e "+N".
  const pills = shifts.map((sh) => shiftPill(sh, state, today));
  const shown = pills.slice(0, 2).map((p) => `<span class="cal-shift ${p.cls}" title="${esc(p.tip)}"><span class="lbl-long">${p.long}</span><span class="lbl-short">${p.short}</span>${p.note ? `<small class="cal-note">${icon('note', 9)}${esc(p.note)}</small>` : ''}</span>`).join('')
    + (pills.length > 2 ? `<span class="cal-more-shift">+${pills.length - 2}</span>` : '');
  const tips = pills.map((p) => p.tip).join('; ');
  return `<button type="button" class="cal-cell ${monthOf(d) !== M ? 'out' : ''} ${d === today ? 'today' : ''} ${d === selected ? 'selected' : ''} ${shifts.length ? 'has-shift' : ''}"
    data-action="ag-select" data-date="${esc(d)}" aria-label="${fmtLong(d)}${tips ? `, ${esc(tips)}` : ''}${items.length ? `, ${items.length} itens` : ''}" aria-pressed="${d === selected}">
    <span class="cal-num">${fromKey(d).getDate()}</span>
    ${shown}
    <span class="cal-dots">${dots}${others.length > 4 ? '<span class="cal-more">+</span>' : ''}</span>
    <span class="cal-items">${others.slice(0, 3).map((i) => `<span class="cal-item ${i.done ? 'is-done' : ''}" style="--c: ${colorVar(agendaItemColor(state, i))}" title="${esc(i.title)}${i.sub ? ` · ${esc(i.sub)}` : ''}">${i.time ? `<b>${esc(i.time)}</b> ` : ''}${esc(i.title)}</span>`).join('')}${others.length > 3 ? `<span class="cal-item cal-item-more">+${others.length - 3}</span>` : ''}</span>
  </button>`;
}

function dayPanel(state, d, items, today) {
  const conf = conflicts(state, d, d);
  return `<section class="day-panel card">
    <div class="day-panel-head">
      <div><h2>${fmtLong(d)}</h2><span class="muted small">${relDays(d, today)}</span></div>
      <button type="button" class="btn btn-sm btn-primary" data-action="new-menu" data-date="${esc(d)}">${icon('plus', 16)}Adicionar</button>
    </div>
    ${conf.map((c) => `<div class="notice notice-serious">${icon('alert', 16)}<span><strong>${esc(c.reason)}:</strong> ${esc(c.item.title)}. Você está de serviço (${c.shift.start}, ${c.shift.hours}h).</span></div>`).join('')}
    <div class="list">${items.length ? items.map((it) => agendaItemRow(state, it)).join('') : emptyState('calendar', 'Nada neste dia', 'Toque em “Adicionar” para criar algo.')}</div>
  </section>`;
}

export default {
  id: 'agenda',
  title: 'Agenda',
  enter(params) {
    const d = params.get('d');
    if (d) {
      selected = d;
      month = monthOf(d);
      ui.mode = 'mes';
    }
  },
  render({ state, today }) {
    month = month || monthOf(today);
    selected = selected || today;
    if (ui.area && !state.areas.some((a) => a.id === ui.area)) ui.area = '';
    const opts = { layers: ui.layers, area: ui.area || null };
    let body;
    if (ui.mode === 'lista') {
      const from = month === monthOf(today) ? today : monthStart(month);
      const map = collectRange(state, from, addDays(from, 45), opts);
      const days = [...map.entries()].filter(([, items]) => items.length);
      // Tarefas sem prazo também aparecem na lista (ao final), para nada criado em Tarefas ficar invisível aqui.
      const undated = ui.layers.includes('tarefa') ? state.tasks.filter((t) => !t.recurrence && !t.due && t.status !== 'done' && (!ui.area || t.area === ui.area)) : [];
      const undatedBlock = undated.length ? `
        <div class="day-block">
          <div class="day-head sticky"><strong>Sem data</strong><span class="muted">${undated.length === 1 ? '1 tarefa sem prazo' : `${undated.length} tarefas sem prazo`}</span></div>
          <div class="list">${undated.map((t) => agendaItemRow(state, { id: `t:${t.id}:once`, layer: 'tarefa', area: t.area, time: null, kind: 'prazo', title: t.title, sub: 'Sem prazo definido', done: false, ref: { taskId: t.id, key: 'once' } })).join('')}</div>
        </div>` : '';
      body = days.length || undated.length ? `<div class="agenda-list">${days.map(([d, items]) => `
        <div class="day-block">
          <div class="day-head sticky"><strong>${fmtShort(d)}</strong><span class="muted">${relDays(d, today)}</span></div>
          <div class="list">${items.map((it) => agendaItemRow(state, it)).join('')}</div>
        </div>`).join('')}${undatedBlock}</div>` : emptyState('calendar', 'Nada nos próximos 45 dias', 'Ajuste os filtros ou adicione algo.');
    } else {
      const ws = Number(state.settings.weekStart) || 0;
      const first = startOfWeek(monthStart(month), ws);
      const last = addDays(first, 41);
      const map = collectRange(state, first, last, opts);
      const head = Array.from({ length: 7 }, (_, i) => `<span>${WEEKDAYS_SHORT[(ws + i) % 7]}</span>`).join('');
      const cells = [...map.entries()].map(([d, items]) => cellHtml(state, d, items, today, month)).join('');
      const selItems = collectRange(state, selected, selected, opts).get(selected) || [];
      body = `<div class="agenda-grid">
        <div class="calendar card">
          <div class="cal-head">${head}</div>
          <div class="cal-body">${cells}</div>
          ${shiftLegend()}
        </div>
        ${dayPanel(state, selected, selItems, today)}
      </div>`;
    }
    return `
      <header class="page-head">
        <h1>Agenda</h1>
        <div class="head-actions">
          ${tabs([['mes', 'Mês'], ['lista', 'Lista']], ui.mode, 'ag-mode')}
        </div>
      </header>
      <div class="toolbar">
        ${monthNav(month, 'ag-month')}
        <button type="button" class="btn btn-sm" data-action="ag-today">Hoje</button>
        <button type="button" class="btn btn-sm" data-action="ag-pdf" title="Exportar o mês em PDF (uma página)">${icon('download', 16)}PDF</button>
      </div>
      ${filters(state)}
      ${body}`;
  },
  mount(el) {
    el.querySelector('[data-action-change="ag-area"]')?.addEventListener('change', (e) => {
      ui.area = e.target.value;
      savePrefs();
      rerender();
    });
  },
  actions: {
    'ag-pdf'() {
      exportAgendaPdf({ month, layers: ui.layers, area: ui.area || null });
    },
    'ag-mode'(btn) {
      ui.mode = btn.dataset.value;
      savePrefs();
      rerender();
    },
    'ag-month'(btn) {
      const step = Number(btn.dataset.step);
      month = step === 0 ? monthOf(todayKey()) : addMonths(month, step);
      rerender();
    },
    'ag-today'() {
      selected = todayKey();
      month = monthOf(selected);
      rerender();
    },
    'ag-select'(btn) {
      const d = btn.dataset.date;
      if (d === selected && matchMedia('(max-width: 899px)').matches) {
        document.querySelector('.day-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      selected = d;
      if (monthOf(d) !== month) month = monthOf(d);
      rerender();
    },
    'ag-layer'(btn) {
      const id = btn.dataset.value;
      ui.layers = ui.layers.includes(id) ? ui.layers.filter((l) => l !== id) : [...ui.layers, id];
      savePrefs();
      rerender();
    },
  },
};

