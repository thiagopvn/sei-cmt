// Agenda unificada: mês (com camadas e painel do dia) e lista dos próximos dias.

import { esc } from '../lib/util.js';
import { icon } from '../lib/icons.js';
import { addDays, addMonths, monthOf, monthStart, startOfWeek, fmtLong, fmtShort, relDays, WEEKDAYS_SHORT, fromKey, todayKey, fmtDM } from '../lib/dates.js';
import { collectRange, conflicts, LAYERS } from '../domain/agenda.js';
import { permutaLabel, permutaDoMeuDia, shiftTitle, shortName, ownersOf, ownersText, payStatus } from '../domain/shifts.js';
import { agendaItemRow, monthNav, tabs, emptyState, dot, colorVar, LAYER_COLOR } from '../ui/parts.js';
import { rerender } from '../ui/bus.js';

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

/** Etiqueta de um serviço no calendário: { cls, long, short, tip }. Nome em cima, detalhe pequeno embaixo. */
function shiftPill(sh, state, today) {
  if (sh.kind === 'cobrindo') {
    const ref = `<small class="cal-ref">${icon('swap', 10)}${sh.swap?.myDate ? fmtDM(sh.swap.myDate) : 'troca'}</small>`;
    return {
      cls: 'k-cobrindo',
      long: `Serviço de ${esc(sh.colleague)}${ref}`,
      short: `${esc(shortName(sh.colleague))}${ref}`,
      tip: `${shiftTitle(sh)} — ${permutaDoMeuDia(sh).toLowerCase()}`,
    };
  }
  if (sh.kind === 'coberto') {
    return { cls: 'k-coberto', long: esc(permutaLabel(sh)), short: esc(permutaLabel(sh, { short: true })), tip: shiftTitle(sh) };
  }
  // Serviço pago (extra): verde com ✓ quando já recebi, dourado enquanto está a receber (⚠ se atrasou).
  // Serviço de outro(s) militar(es): mostra os nomes.
  const owners = ownersOf(sh);
  const status = sh.paid && sh.service ? payStatus(sh.service, today, state.settings) : null;
  const mark = status === 'recebido' ? icon('check', 10) : status === 'atrasado' ? icon('alert', 10) : '';
  const hrs = `${sh.paid ? icon('coins', 10) : ''}${sh.hours}h${mark}`;
  const ref = `<small class="cal-ref">${hrs}</small>`;
  // No celular a cor já diz que é pago: sem a moeda, para caber o nome.
  const refShort = `<small class="cal-ref">${sh.hours}h${mark}</small>`;
  const namesShort = owners.map((n) => `<span class="nm">${esc(shortName(n))}</span>`).join('');
  const word = sh.paid ? 'Extra' : 'Serviço';
  const cls = `k-servico${sh.paid ? ` is-pago${status === 'recebido' ? '' : ' a-receber'}` : owners.length ? ' is-alheio' : ''}`;
  const pay = sh.paid ? ` (${status === 'recebido' ? 'recebido' : status === 'atrasado' ? 'pagamento atrasado' : 'a receber'})` : '';
  if (owners.length) {
    return {
      cls,
      long: `${word} de ${esc(ownersText(owners))}${ref}`,
      short: `${namesShort}${refShort}`,
      tip: `${word} de ${ownersText(owners)}${pay} · ${sh.hours}h`,
    };
  }
  return sh.paid
    ? { cls, long: `Extra${ref}`, short: `${sh.hours}h${mark}`, tip: `Extra${pay} · ${sh.hours}h` }
    : { cls, long: `Meu serviço${ref}`, short: `${sh.hours}h`, tip: `Meu serviço · ${sh.hours}h` };
}

function cellHtml(state, d, items, today, M) {
  const shifts = items.filter((i) => i.layer === 'servico').map((i) => i.ref.shift);
  const others = items.filter((i) => i.layer !== 'servico');
  const dots = others.slice(0, 4).map((i) => {
    const color = i.layer === 'financa' ? LAYER_COLOR.financa : state.areas.find((a) => a.id === i.area)?.color || LAYER_COLOR[i.layer];
    return `<span class="dot ${i.done ? 'hollow' : ''}" style="--c: ${colorVar(color)}"></span>`;
  }).join('');
  // Mais de um serviço no dia: mostra até dois e "+N".
  const pills = shifts.map((sh) => shiftPill(sh, state, today));
  const shown = pills.slice(0, 2).map((p) => `<span class="cal-shift ${p.cls}" title="${esc(p.tip)}"><span class="lbl-long">${p.long}</span><span class="lbl-short">${p.short}</span></span>`).join('')
    + (pills.length > 2 ? `<span class="cal-more-shift">+${pills.length - 2}</span>` : '');
  const tips = pills.map((p) => p.tip).join('; ');
  return `<button type="button" class="cal-cell ${monthOf(d) !== M ? 'out' : ''} ${d === today ? 'today' : ''} ${d === selected ? 'selected' : ''} ${shifts.length ? 'has-shift' : ''}"
    data-action="ag-select" data-date="${esc(d)}" aria-label="${fmtLong(d)}${tips ? `, ${esc(tips)}` : ''}${items.length ? `, ${items.length} itens` : ''}" aria-pressed="${d === selected}">
    <span class="cal-num">${fromKey(d).getDate()}</span>
    ${shown}
    <span class="cal-dots">${dots}${others.length > 4 ? '<span class="cal-more">+</span>' : ''}</span>
    <span class="cal-items">${others.slice(0, 3).map((i) => `<span class="cal-item ${i.done ? 'is-done' : ''}">${i.time ? `${i.time} ` : ''}${esc(i.title)}</span>`).join('')}${others.length > 3 ? `<span class="cal-item muted">+${others.length - 3}</span>` : ''}</span>
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
    const opts = { layers: ui.layers, area: ui.area || null };
    let body;
    if (ui.mode === 'lista') {
      const from = month === monthOf(today) ? today : monthStart(month);
      const map = collectRange(state, from, addDays(from, 45), opts);
      const days = [...map.entries()].filter(([, items]) => items.length);
      body = days.length ? `<div class="agenda-list">${days.map(([d, items]) => `
        <div class="day-block">
          <div class="day-head sticky"><strong>${fmtShort(d)}</strong><span class="muted">${relDays(d, today)}</span></div>
          <div class="list">${items.map((it) => agendaItemRow(state, it)).join('')}</div>
        </div>`).join('')}</div>` : emptyState('calendar', 'Nada nos próximos 45 dias', 'Ajuste os filtros ou adicione algo.');
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
          <div class="cal-legend">
            <span><span class="legend-sw shift-servico"></span>Meu serviço</span>
            <span><span class="legend-sw shift-pago"></span>Extra recebido</span>
            <span><span class="legend-sw shift-a-receber"></span>Extra a receber</span>
            <span><span class="legend-sw shift-cobrindo"></span>Serviço de outro militar (eu tiro)</span>
            <span><span class="legend-sw shift-coberto"></span>Permutado (outro militar tira)</span>
          </div>
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

