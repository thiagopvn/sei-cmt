// Tarefas: demandas por área (sem misturar), quadro de status, rotinas e tempo dedicado.

import { store } from '../store.js';
import { esc, normalize, plural, uid, sum } from '../lib/util.js';
import { icon } from '../lib/icons.js';
import { addDays, fmtShort, WEEKDAYS_MIN, weekday } from '../lib/dates.js';
import { activeInstance, groupInstances, STATUS, streak, isDone } from '../domain/tasks.js';
import { describeRule, occurrences } from '../domain/recurrence.js';
import { taskRow, emptyState, tabs, chips, areaTag, dueChip } from '../ui/parts.js';
import { quickAddHtml, bindQuickAdd } from '../ui/quickadd.js';
import { hbars, columns, bindCharts } from '../ui/charts.js';
import { actionSheet, toast } from '../ui/overlay.js';
import { rerender } from '../ui/bus.js';
import { fmtDuration } from '../timer.js';

const PREF = 'pauta:tarefas';
let ui = (() => {
  try {
    return { area: '', mode: 'lista', type: '', ...JSON.parse(localStorage.getItem(PREF) || '{}') };
  } catch {
    return { area: '', mode: 'lista', type: '' };
  }
})();
let search = '';
let filter = '';
let range = 7;

const save = () => {
  try {
    localStorage.setItem(PREF, JSON.stringify(ui));
  } catch { /* ignora */ }
};

const ROUTINE_IDEAS = [
  { title: 'Buscar filha na creche', area: 'familia', time: '17:30', rec: { freq: 'weekdays' } },
  { title: 'Estudar para o concurso', area: 'concurso', type: 'estudo', time: '20:00', rec: { freq: 'daily' } },
  { title: 'Conferir e-mail funcional e SEI', area: 'trabalho', type: 'sei', time: '09:00', rec: { freq: 'weekdays' } },
  { title: 'Planejar a semana', area: 'pessoal', time: '20:00', rec: { freq: 'weekly', days: [0] } },
  { title: 'Conferir pagamento dos serviços extras', area: 'trabalho', rec: { freq: 'monthly' }, day: 10 },
  { title: 'Treino físico (TAF)', area: 'pessoal', time: '06:30', rec: { freq: 'weekly', days: [1, 3, 5] } },
  { title: 'Revisar matéria da faculdade', area: 'faculdade', time: '21:00', rec: { freq: 'weekly', days: [2, 4] } },
  { title: 'Declaração do Imposto de Renda', area: 'pessoal', rec: { freq: 'yearly' }, md: '03-15' },
];

function filtered(state) {
  const q = normalize(search);
  return state.tasks.filter((t) => (!ui.area || t.area === ui.area)
    && (!ui.type || t.type === ui.type)
    && (!q || normalize(`${t.title} ${t.process || ''} ${t.notes || ''}`).includes(q)));
}

function listView(state, today) {
  const tasks = filtered(state);
  const demands = tasks.filter((t) => !t.recurrence);
  const routinesToday = tasks.filter((t) => t.recurrence).map((t) => activeInstance(t, today)).filter((i) => i && i.date <= today);
  let groups = groupInstances(demands.map((t) => activeInstance(t, today)), today);
  if (filter === 'atrasadas') groups = groups.filter((g) => g.key === 'overdue');
  const doneGroup = groups.find((g) => g.key === 'done');
  const openGroups = groups.filter((g) => g.key !== 'done');
  const typeOptions = state.types.filter((t) => state.tasks.some((x) => x.type === t.id));

  return `
    <div class="toolbar">
      <label class="search">${icon('search', 16)}<input type="search" placeholder="Buscar por título, nº do processo…" value="${esc(search)}" data-search aria-label="Buscar tarefas"></label>
      ${typeOptions.length ? `<select class="select-sm" data-type-filter aria-label="Filtrar por tipo">
        <option value="">Todos os tipos</option>
        ${typeOptions.map((t) => `<option value="${t.id}" ${ui.type === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
      </select>` : ''}
      ${filter ? `<button type="button" class="chip active" data-action="tk-clear-filter">Só atrasadas ${icon('x', 14)}</button>` : ''}
    </div>
    ${routinesToday.length && !filter ? `
      <section class="section">
        <div class="section-head"><h2>${icon('repeat', 18)}Rotinas de hoje</h2><span class="muted small">${routinesToday.filter((i) => i.done).length}/${routinesToday.length}</span></div>
        <div class="list">${routinesToday.map((i) => taskRow(state, i, today, { showArea: !ui.area })).join('')}</div>
      </section>` : ''}
    ${openGroups.length ? openGroups.map((g) => `
      <section class="section">
        <div class="section-head"><h2 class="group-${g.key}">${esc(g.label)}</h2><span class="muted small">${g.items.length}</span></div>
        <div class="list">${g.items.map((i) => taskRow(state, i, today, { showArea: !ui.area })).join('')}</div>
      </section>`).join('') : emptyState('check', search ? 'Nada encontrado' : 'Nenhuma demanda em aberto', search ? 'Tente outra busca.' : 'Use o campo acima para adicionar. Ex.: “Enviar PAD até sexta #pad”.')}
    ${doneGroup ? `
      <details class="section done-section">
        <summary class="section-head"><h2>Concluídas</h2><span class="muted small">${doneGroup.items.length}</span></summary>
        <div class="list">${doneGroup.items.slice(0, 30).map((i) => taskRow(state, i, today, { showArea: !ui.area })).join('')}</div>
      </details>` : ''}`;
}

function boardView(state, today) {
  const tasks = filtered(state).filter((t) => !t.recurrence);
  const cols = Object.entries(STATUS).map(([status, label]) => {
    let items = tasks.filter((t) => t.status === status).map((t) => activeInstance(t, today));
    if (status === 'done') items = items.sort((a, b) => (b.task.doneAt || '').localeCompare(a.task.doneAt || '')).slice(0, 12);
    else items.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
    return `<section class="board-col" data-status="${status}">
      <div class="board-head"><strong>${label}</strong><span class="badge">${items.length}</span></div>
      <div class="board-list" data-drop="${status}">
        ${items.map((i) => `
          <article class="board-card ${i.done ? 'is-done' : ''}" draggable="true" data-drag="${i.task.id}" role="button" tabindex="0" data-action="task-open" data-id="${i.task.id}" data-key="once">
            <div class="row-title">${i.task.priority === 1 && !i.done ? `<span class="prio-flag">${icon('flag', 14)}</span>` : ''}${esc(i.task.title)}</div>
            <div class="row-meta">${dueChip(i, today)}${!ui.area ? areaTag(state, i.task.area) : ''}</div>
            <button type="button" class="icon-btn board-move" data-action="tk-move" data-id="${i.task.id}" aria-label="Mudar situação">${icon('more', 18)}</button>
          </article>`).join('') || '<p class="board-empty">Arraste para cá</p>'}
      </div>
    </section>`;
  }).join('');
  return `<p class="muted small hint-line">Arraste os cartões entre as colunas ou toque em ${icon('more', 14)} para mudar a situação.</p><div class="board">${cols}</div>`;
}

function routinesView(state, today) {
  const routines = filtered(state).filter((t) => t.recurrence);
  const ideas = ROUTINE_IDEAS.filter((r) => (!ui.area || r.area === ui.area)
    && state.areas.some((a) => a.id === r.area)
    && !state.tasks.some((t) => normalize(t.title) === normalize(r.title)));
  const cards = routines.map((t) => {
    const inst = activeInstance(t, today);
    const past = occurrences(t.due, t.recurrence, addDays(today, -60), today).slice(-14);
    const total30 = occurrences(t.due, t.recurrence, addDays(today, -29), today);
    const rate = total30.length ? Math.round((total30.filter((d) => isDone(t, d)).length / total30.length) * 100) : null;
    const st = streak(t, today);
    return `<article class="routine card">
      <div class="routine-top" role="button" tabindex="0" data-action="task-open" data-id="${t.id}" data-key="${inst?.key || t.due}">
        <div class="row-main">
          <div class="row-title">${esc(t.title)}</div>
          <div class="row-meta"><span class="meta">${icon('repeat', 13)}${esc(describeRule(t.recurrence, t.due))}${t.dueTime ? ` · ${t.dueTime}` : ''}</span>${!ui.area ? areaTag(state, t.area) : ''}</div>
        </div>
        ${inst && inst.date <= today ? `<button type="button" class="check big ${inst.done ? 'checked' : ''}" data-action="task-toggle" data-id="${t.id}" data-key="${inst.key}" aria-label="${inst.done ? 'Desmarcar' : 'Marcar como feita'}${inst.date < today ? ` (${fmtShort(inst.date)})` : ' hoje'}">${icon('check', 16)}</button>` : `<span class="muted small">${inst ? `Próxima: ${fmtShort(inst.date)}` : 'Encerrada'}</span>`}
      </div>
      <div class="routine-stats">
        <div class="streak-dots" aria-label="Últimas ocorrências">${past.map((d) => `<span class="sd ${isDone(t, d) ? 'ok' : d === today ? 'now' : 'miss'}" title="${fmtShort(d)}: ${isDone(t, d) ? 'feito' : d === today ? 'hoje' : 'não feito'}">${WEEKDAYS_MIN[weekday(d)]}</span>`).join('')}</div>
        <div class="routine-nums">
          <span title="Sequência atual">${icon('flame', 14)}${st}</span>
          ${rate !== null ? `<span title="Concluídas nos últimos 30 dias">${rate}%</span>` : ''}
        </div>
      </div>
    </article>`;
  }).join('');
  return `
    <div class="toolbar"><button type="button" class="btn btn-primary btn-sm" data-action="routine-new" data-area="${ui.area}">${icon('plus', 16)}Nova rotina</button>
      <span class="muted small">Rotinas lembram o que se repete: diário, semanal, mensal ou anual.</span></div>
    ${routines.length ? `<div class="routines">${cards}</div>` : emptyState('repeat', 'Nenhuma rotina ainda', 'Crie rotinas para não esquecer o que se repete.')}
    ${ideas.length ? `<section class="section">
      <div class="section-head"><h2>${icon('sparkles', 18)}Sugestões para você</h2></div>
      <div class="ideas">${ideas.map((r) => `<button type="button" class="idea" data-action="tk-idea" data-title="${esc(r.title)}">
        ${icon('plus', 16)}<span><strong>${esc(r.title)}</strong><small>${esc(describeRule(r.rec, r.md ? `2026-${r.md}` : '2026-01-04'))}${r.time ? ` · ${r.time}` : ''}</small></span></button>`).join('')}</div>
    </section>` : ''}`;
}

function timeView(state, today) {
  const from = addDays(today, -(range - 1));
  const logs = state.timeLog.filter((l) => l.date >= from && l.date <= today && (!ui.area || l.area === ui.area));
  const total = sum(logs, (l) => l.sec);
  const byArea = state.areas.map((a) => ({ label: a.name, color: a.color, value: sum(logs.filter((l) => l.area === a.id), (l) => l.sec) })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
  const byTask = new Map();
  for (const l of logs) byTask.set(l.taskId, (byTask.get(l.taskId) || 0) + l.sec);
  const topTasks = [...byTask.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, sec]) => ({ task: state.tasks.find((t) => t.id === id), sec })).filter((x) => x.task);
  const days = Array.from({ length: Math.min(range, 14) }, (_, i) => addDays(today, -(Math.min(range, 14) - 1 - i)));
  const daily = days.map((d) => ({ label: WEEKDAYS_MIN[weekday(d)], tip: fmtShort(d), value: Math.round(sum(logs.filter((l) => l.date === d), (l) => l.sec) / 60) }));
  return `
    <div class="toolbar">${tabs([[7, '7 dias'], [30, '30 dias']].map(([v, l]) => [String(v), l]), String(range), 'tk-range')}
      <span class="muted small">Inicie o cronômetro em qualquer tarefa pelo botão ${icon('timer', 14)}.</span></div>
    <div class="tiles">
      <div class="tile"><span class="tile-label">${icon('timer', 16)}Tempo registrado</span><span class="tile-value">${total ? fmtDuration(total) : '0 min'}</span><span class="tile-sub">últimos ${range} dias</span></div>
      <div class="tile"><span class="tile-label">${icon('target', 16)}Média por dia</span><span class="tile-value">${fmtDuration(total / range)}</span><span class="tile-sub">${plural(new Set(logs.map((l) => l.date)).size, 'dia com registro', 'dias com registro')}</span></div>
    </div>
    <div class="two-col">
      <section class="card chart-card">
        <h3>Minutos por dia</h3>
        ${columns(daily, { format: (v) => `${Math.round(v)} min`, color: 1, title: 'minutos por dia' })}
      </section>
      <section class="card chart-card">
        <h3>Tempo por área</h3>
        ${hbars(byArea, { format: (v) => fmtDuration(v), empty: 'Nenhum tempo registrado no período.' })}
      </section>
    </div>
    <section class="section">
      <div class="section-head"><h2>Onde seu tempo foi</h2></div>
      ${topTasks.length ? `<div class="list">${topTasks.map(({ task, sec }) => `
        <div class="row" role="button" tabindex="0" data-action="task-open" data-id="${task.id}" data-key="once">
          <div class="row-main"><div class="row-title">${esc(task.title)}</div><div class="row-meta">${areaTag(state, task.area)}</div></div>
          <span class="amount">${fmtDuration(sec)}</span>
        </div>`).join('')}</div>` : emptyState('timer', 'Sem registros', 'Use o cronômetro para medir estudo, processos e trabalhos.')}
    </section>`;
}

export default {
  id: 'tarefas',
  title: 'Tarefas',
  enter(params) {
    filter = params.get('f') || '';
    if (params.get('mode')) ui.mode = params.get('mode');
    if (filter) ui.mode = 'lista';
  },
  render({ state, today }) {
    const counts = Object.fromEntries(state.areas.map((a) => [a.id, state.tasks.filter((t) => t.area === a.id && !t.recurrence && t.status !== 'done').length]));
    const areaItems = state.areas.map((a) => [a.id, `${a.name}${counts[a.id] ? ` · ${counts[a.id]}` : ''}`, a.color]);
    const area = state.areas.find((a) => a.id === ui.area);
    let body = '';
    if (ui.mode === 'quadro') body = boardView(state, today);
    else if (ui.mode === 'rotinas') body = routinesView(state, today);
    else if (ui.mode === 'tempo') body = timeView(state, today);
    else body = listView(state, today);
    return `
      <header class="page-head">
        <h1>Tarefas</h1>
        <div class="head-actions">
          <button type="button" class="btn btn-primary btn-sm" data-action="task-new" data-area="${ui.area}">${icon('plus', 16)}Nova</button>
        </div>
      </header>
      ${chips(areaItems, ui.area || null, 'tk-area', { all: 'Todas' })}
      ${quickAddHtml(area ? `Nova tarefa em ${area.name}… ex.: “Entregar trabalho dia 20”` : 'Ex.: Enviar SEI até sexta #sei !alta')}
      ${tabs([['lista', 'Lista'], ['quadro', 'Quadro'], ['rotinas', 'Rotinas'], ['tempo', 'Tempo']], ui.mode, 'tk-mode')}
      <div class="view-body">${body}</div>`;
  },
  mount(el) {
    bindQuickAdd(el, { area: ui.area || null });
    bindCharts(el);
    const s = el.querySelector('[data-search]');
    if (s) {
      s.addEventListener('input', () => {
        search = s.value;
        const pos = s.selectionStart;
        rerender();
        const n = document.querySelector('[data-search]');
        n?.focus();
        n?.setSelectionRange(pos, pos);
      });
    }
    el.querySelector('[data-type-filter]')?.addEventListener('change', (e) => {
      ui.type = e.target.value;
      save();
      rerender();
    });
    // Arrastar e soltar no quadro (desktop)
    el.querySelectorAll('[data-drag]').forEach((card) => {
      card.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', card.dataset.drag);
        card.classList.add('dragging');
      });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));
    });
    el.querySelectorAll('[data-drop]').forEach((zone) => {
      zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('drop-over');
      });
      zone.addEventListener('dragleave', () => zone.classList.remove('drop-over'));
      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('drop-over');
        setStatus(e.dataTransfer.getData('text/plain'), zone.dataset.drop);
      });
    });
  },
  actions: {
    'tk-area'(btn) {
      ui.area = btn.dataset.value;
      save();
      rerender();
    },
    'tk-mode'(btn) {
      ui.mode = btn.dataset.value;
      save();
      rerender();
    },
    'tk-range'(btn) {
      range = Number(btn.dataset.value);
      rerender();
    },
    'tk-clear-filter'() {
      filter = '';
      location.hash = '#/tarefas';
    },
    async 'tk-move'(btn) {
      const status = await actionSheet({
        title: 'Mudar situação',
        options: Object.entries(STATUS).map(([value, label]) => ({ value, label, icon: value === 'done' ? 'check' : value === 'waiting' ? 'clock' : value === 'doing' ? 'play' : 'inbox' })),
      });
      if (status) setStatus(btn.dataset.id, status);
    },
    'tk-idea'(btn) {
      const idea = ROUTINE_IDEAS.find((r) => r.title === btn.dataset.title);
      if (!idea) return;
      const today = new Date();
      const y = today.getFullYear();
      const pad = (n) => String(n).padStart(2, '0');
      const t = `${y}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
      let due = t;
      if (idea.day) due = `${y}-${pad(today.getMonth() + 1)}-${pad(idea.day)}`;
      if (idea.md) due = `${y}-${idea.md}`;
      store.update((s) => {
        s.tasks.push({
          id: uid(), title: idea.title, area: idea.area, type: idea.type || 'outro', priority: 2, status: 'todo',
          due, dueTime: idea.time || null, recurrence: idea.rec, occ: {}, alertDays: null, checklist: [], process: '', value: 0, notes: '',
          createdAt: new Date().toISOString(), doneAt: null,
        });
      });
      toast(`Rotina criada: ${idea.title}`);
    },
  },
};

function setStatus(id, status) {
  store.update((s) => {
    const t = s.tasks.find((x) => x.id === id);
    if (!t || t.status === status) return;
    t.status = status;
    t.doneAt = status === 'done' ? new Date().toISOString() : null;
  }, { undoable: true });
  toast(`Movida para “${STATUS[status]}”`, { action: { label: 'Desfazer', onClick: () => store.undo() } });
}
