// Tarefas: "Meu dia" (o que fazer hoje, amanhã e nos próximos dias, com faixa de dias e a caixa
// "Sem data" a planejar), lista completa por data, quadro de status, rotinas, tempo e remuneradas.

import { store } from '../store.js';
import { esc, normalize, plural, uid, sum, money } from '../lib/util.js';
import { icon } from '../lib/icons.js';
import { addDays, fmtShort, fmtDM, fmtLong, WEEKDAYS, WEEKDAYS_MIN, WEEKDAYS_SHORT, weekday, fromKey, nextWeekday, todayKey } from '../lib/dates.js';
import { activeInstance, groupByDay, STATUS, streak, isDone, dayPlan, openCount, undatedOpen, overdueOpen } from '../domain/tasks.js';
import { shiftsInRange } from '../domain/shifts.js';
import { collectRange } from '../domain/agenda.js';
import { describeRule, occurrences } from '../domain/recurrence.js';
import { taskRow, emptyState, tabs, chips, areaTag, dueChip, tile, taskPayPill } from '../ui/parts.js';
import { taskPayDate, taskPayStatus } from '../domain/finance.js';
import { ownersOf, payerLabel } from '../domain/shifts.js';
import { quickAddHtml, bindQuickAdd } from '../ui/quickadd.js';
import { hbars, columns, bindCharts } from '../ui/charts.js';
import { actionSheet, toast, openModal } from '../ui/overlay.js';
import { rerender } from '../ui/bus.js';
import { fmtDuration } from '../timer.js';

const PREF = 'pauta:tarefas';
let ui = (() => {
  try {
    const saved = { area: '', mode: 'dia', type: '', ...JSON.parse(localStorage.getItem(PREF) || '{}') };
    // v2: "Meu dia" passa a ser a abertura padrão (antes era a lista corrida).
    if (saved.v !== 2) Object.assign(saved, { v: 2, mode: 'dia' });
    return saved;
  } catch {
    return { area: '', mode: 'dia', type: '', v: 2 };
  }
})();
let search = '';
let range = 7;
/** O que "Meu dia" mostra: uma data (YYYY-MM-DD), 'late' (atrasadas) ou 'none' (sem data). */
let sel = null;
const AHEAD = 7; // hoje + 6 dias na faixa

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

function filtered(state, { useSearch = true } = {}) {
  const q = useSearch ? normalize(search) : '';
  return state.tasks.filter((t) => (!ui.area || t.area === ui.area)
    && (!ui.type || t.type === ui.type)
    && (!q || normalize(`${t.title} ${t.process || ''} ${t.notes || ''}`).includes(q)));
}

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** "Hoje", "Amanhã", "Sexta-feira", "Sábado". */
function dayName(D, today) {
  if (D === today) return 'Hoje';
  if (D === addDays(today, 1)) return 'Amanhã';
  const w = weekday(D);
  return cap(WEEKDAYS[w]) + (w >= 1 && w <= 5 ? '-feira' : '');
}

/** Rótulo curto para avisos: "hoje", "amanhã", "sáb, 31 out". */
const whenLabel = (D, today) => (!D ? 'sem data' : D === today ? 'hoje' : D === addDays(today, 1) ? 'amanhã' : fmtShort(D));

/** O que está selecionado na faixa, sempre válido (data fora da faixa ou atrasadas vazias voltam para hoje). */
function current(tasks, today) {
  const last = addDays(today, AHEAD - 1);
  if (sel === 'none') return sel;
  if (sel === 'late') return overdueOpen(tasks, today).length ? sel : today;
  if (!sel || sel < today || sel > last) return today;
  return sel;
}

/** Faixa de dias: Atrasadas · Hoje · Amanhã · próximos dias · Sem data, cada um com quantas coisas em aberto. */
function dayStrip(tasks, today, cur) {
  const late = overdueOpen(tasks, today).length;
  const none = undatedOpen(tasks).length;
  const item = (key, top, main, n, cls = '', label = '') => `
    <button type="button" class="dstrip-item ${cls} ${cur === key ? 'active' : ''}" data-action="tk-day" data-value="${esc(key)}" aria-pressed="${cur === key}" aria-label="${esc(label || top)}: ${n ? plural(n, 'item', 'itens') : 'nada'}">
      <small>${top}</small><b>${main}</b><span class="dstrip-n ${n ? '' : 'zero'}">${n || '·'}</span>
    </button>`;
  const days = Array.from({ length: AHEAD }, (_, i) => addDays(today, i)).map((d, i) => item(
    d,
    i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : WEEKDAYS_SHORT[weekday(d)],
    String(fromKey(d).getDate()),
    openCount(tasks, d, today),
    `${i === 0 ? 'is-today' : ''} ${weekday(d) === 0 || weekday(d) === 6 ? 'is-weekend' : ''}`,
    fmtLong(d),
  )).join('');
  return `<nav class="dstrip" aria-label="Escolha o dia">
    ${late ? item('late', 'Atrasadas', icon('alert', 18), late, 'is-late') : ''}
    ${days}
    ${item('none', 'Sem data', icon('inbox', 18), none, 'is-none')}
  </nav>`;
}

/** Linha da caixa "Sem data": concluir, abrir e planejar com um toque (Hoje / Amanhã / escolher). */
function inboxRow(state, t, today) {
  return `<div class="row task-row inbox-row" role="button" tabindex="0" data-action="task-open" data-id="${esc(t.id)}" data-key="once">
    <button type="button" class="check" data-action="task-toggle" data-id="${esc(t.id)}" data-key="once" aria-label="Concluir: ${esc(t.title)}">${icon('check', 14)}</button>
    <div class="row-main">
      <div class="row-title">${t.priority === 1 ? `<span class="prio-flag" title="Prioridade alta">${icon('flag', 14)}</span>` : ''}${esc(t.title)}</div>
      <div class="row-meta">${t.status !== 'todo' ? `<span class="pill pill-soft">${esc(STATUS[t.status])}</span>` : ''}${!ui.area ? areaTag(state, t.area) : ''}</div>
      <div class="plan-btns" role="group" aria-label="Quando fazer">
        <button type="button" class="plan-btn" data-action="tk-plan" data-id="${esc(t.id)}" data-when="${today}">${icon('sun', 14)}Hoje</button>
        <button type="button" class="plan-btn" data-action="tk-plan" data-id="${esc(t.id)}" data-when="${addDays(today, 1)}">Amanhã</button>
        <button type="button" class="plan-btn" data-action="tk-plan" data-id="${esc(t.id)}" data-when="pick">${icon('calendar', 14)}Outro dia</button>
      </div>
    </div>
  </div>`;
}

/** Contexto do dia: serviço e compromissos (para planejar sabendo como está o dia). */
function dayContext(state, D) {
  const shifts = shiftsInRange(state, D, D).filter((s) => s.active);
  const events = collectRange(state, D, D, { layers: ['evento'] }).get(D) || [];
  if (!shifts.length && !events.length) return '';
  const sh = shifts.map((s) => `<a class="ctx-chip ctx-duty" href="#/agenda?d=${esc(D)}">${icon('shield', 14)}De serviço · ${esc(s.start)} · ${s.hours}h${s.unit ? ` · ${esc(s.unit)}` : ''}</a>`).join('');
  const ev = events.slice(0, 3).map((e) => `<a class="ctx-chip" href="#/agenda?d=${esc(D)}">${icon('calendar', 14)}${e.time ? `${esc(e.time)} ` : ''}${esc(e.title)}</a>`).join('');
  return `<div class="day-ctx">${sh}${ev}${events.length > 3 ? `<a class="ctx-chip" href="#/agenda?d=${esc(D)}">+${events.length - 3}</a>` : ''}</div>`;
}

function dayView(state, today) {
  const tasks = filtered(state, { useSearch: false });
  const cur = current(tasks, today);
  sel = cur;
  const strip = dayStrip(tasks, today, cur);
  const rowOpts = { showArea: !ui.area, plan: true };

  if (cur === 'late') {
    const late = overdueOpen(tasks, today);
    return `${strip}
      <div class="day-hero is-late">
        <div class="day-hero-main"><h2>Atrasadas</h2><span>${plural(late.length, 'tarefa passou do prazo', 'tarefas passaram do prazo')}</span></div>
        <button type="button" class="btn btn-sm btn-primary" data-action="tk-late-today">${icon('sun', 15)}Trazer todas para hoje</button>
      </div>
      <div class="list">${late.map((i) => taskRow(state, i, today, rowOpts)).join('')}</div>`;
  }

  if (cur === 'none') {
    const list = undatedOpen(tasks);
    return `${strip}
      <div class="day-hero is-none">
        <div class="day-hero-main"><h2>Sem data</h2><span>${list.length ? 'Escolha quando fazer cada uma: assim ela aparece no dia certo.' : 'Tudo planejado.'}</span></div>
      </div>
      ${list.length ? `<div class="list">${list.map((t) => inboxRow(state, t, today)).join('')}</div>`
    : emptyState('inbox', 'Nada sem data', 'Toda tarefa tem um dia marcado. Ao criar sem data, ela aparece aqui para você planejar.')}`;
  }

  const D = cur;
  const p = dayPlan(tasks, D, today);
  const total = p.open.length + p.done.length + p.routines.length;
  const doneN = p.done.length + p.routines.filter((i) => i.done).length;
  const pct = total ? Math.round((doneN / total) * 100) : 0;
  const late = D === today ? overdueOpen(tasks, today) : [];
  const inbox = D === today ? undatedOpen(tasks) : [];
  const hero = `<div class="day-hero ${D === today ? 'is-today' : ''}">
    <div class="day-hero-main"><h2>${esc(dayName(D, today))}</h2><span>${esc(cap(fmtLong(D)))}</span></div>
    ${total ? `<div class="day-progress" title="${doneN} de ${total} feitas">
      <strong>${doneN}<small>/${total}</small></strong><span>feitas</span>
      <div class="meter"><span class="meter-fill" style="width: ${pct}%"></span></div>
    </div>` : ''}
  </div>`;
  const lateCard = late.length ? `
    <div class="plan-card is-late">
      <span class="plan-ic">${icon('alert', 18)}</span>
      <div class="plan-text"><strong>${plural(late.length, 'tarefa atrasada', 'tarefas atrasadas')}</strong><small>${esc(late.slice(0, 2).map((i) => i.task.title).join(' · '))}${late.length > 2 ? '…' : ''}</small></div>
      <div class="plan-actions"><button type="button" class="btn btn-sm" data-action="tk-day" data-value="late">Ver</button><button type="button" class="btn btn-sm btn-primary" data-action="tk-late-today">Para hoje</button></div>
    </div>` : '';
  const inboxCard = inbox.length ? `
    <section class="plan-card is-none plan-inbox">
      <div class="plan-head"><span class="plan-ic">${icon('inbox', 18)}</span>
        <div class="plan-text"><strong>${plural(inbox.length, 'tarefa sem data', 'tarefas sem data')}</strong><small>Diga quando fazer e ela entra no dia certo.</small></div>
        ${inbox.length > 3 ? `<button type="button" class="btn btn-sm" data-action="tk-day" data-value="none">Ver todas</button>` : ''}
      </div>
      <div class="list">${inbox.slice(0, 3).map((t) => inboxRow(state, t, today)).join('')}</div>
    </section>` : '';
  const openSec = p.open.length ? `
    <section class="section" data-sec="open">
      <div class="section-head"><h2>${icon('flag', 18)}Para fazer</h2><span class="muted small">${p.open.length}</span></div>
      <div class="list">${p.open.map((i) => taskRow(state, i, today, { ...rowOpts, showDate: false, timeOnly: true })).join('')}</div>
    </section>` : '';
  const routSec = p.routines.length ? `
    <section class="section" data-sec="routines">
      <div class="section-head"><h2>${icon('repeat', 18)}Rotinas</h2><span class="muted small">${p.routines.filter((i) => i.done).length}/${p.routines.length}</span></div>
      <div class="list">${p.routines.map((i) => taskRow(state, i, today, { showArea: !ui.area, showDate: i.date < today, timeOnly: true })).join('')}</div>
    </section>` : '';
  const empty = !p.open.length && !p.routines.length ? emptyState(p.done.length ? 'check' : 'sun', p.done.length ? 'Tudo feito!' : `${dayName(D, today)} está livre`, p.done.length ? 'Nada mais para este dia.' : `Escreva no campo acima e a tarefa entra ${D === today ? 'para hoje' : `para ${whenLabel(D, today)}`}.`) : '';
  const doneSec = p.done.length ? `
    <details class="section done-section">
      <summary class="section-head"><h2>${icon('check', 18)}Concluídas</h2><span class="muted small">${p.done.length}</span></summary>
      <div class="list">${p.done.map((i) => taskRow(state, i, today, { showArea: !ui.area, showDate: false })).join('')}</div>
    </details>` : '';
  return `${strip}${hero}${dayContext(state, D)}${lateCard}${openSec}${empty}${inboxCard}${routSec}${doneSec}`;
}

/** Lista completa, agrupada por data de verdade: Atrasadas · Hoje · Sem data · Amanhã · cada dia · depois. */
function listView(state, today) {
  const tasks = filtered(state);
  const demands = tasks.filter((t) => !t.recurrence);
  const routinesToday = tasks.filter((t) => t.recurrence).map((t) => activeInstance(t, today)).filter((i) => i && i.date <= today);
  const groups = groupByDay(demands.map((t) => activeInstance(t, today)), today, AHEAD);
  const doneGroup = groups.find((g) => g.key === 'done');
  const openGroups = groups.filter((g) => g.key !== 'done');
  const typeOptions = state.types.filter((t) => state.tasks.some((x) => x.type === t.id));
  const head = (g) => {
    if (g.key === 'overdue') return ['overdue', 'Atrasadas', ''];
    if (g.key === 'none') return ['none', 'Sem data', 'defina quando fazer'];
    if (g.key === 'later') return ['later', `A partir de ${fmtShort(g.date)}`, ''];
    return [g.date === today ? 'today' : 'day', dayName(g.date, today), fmtShort(g.date)];
  };
  const rows = (g) => g.items.map((i) => (g.key === 'none' ? inboxRow(state, i.task, today)
    : taskRow(state, i, today, { showArea: !ui.area, plan: true, showDate: g.key === 'overdue' || g.key === 'later', timeOnly: true }))).join('');
  const routineSec = routinesToday.length ? `
      <section class="section">
        <div class="section-head"><h2 class="group-today">${icon('repeat', 18)}Rotinas de hoje</h2><span class="muted small">${routinesToday.filter((i) => i.done).length}/${routinesToday.length}</span></div>
        <div class="list">${routinesToday.map((i) => taskRow(state, i, today, { showArea: !ui.area })).join('')}</div>
      </section>` : '';
  const sections = openGroups.map((g) => {
    const [cls, title, sub] = head(g);
    return `<section class="section">
        <div class="section-head day-head-${cls}"><h2 class="group-${cls}">${esc(title)}${sub ? ` <small>${esc(sub)}</small>` : ''}</h2><span class="muted small">${g.items.length}</span></div>
        <div class="list">${rows(g)}</div>
      </section>`;
  });
  // Rotinas de hoje logo depois de "Hoje" (ou no topo, se não há nada para hoje).
  const at = openGroups.findIndex((g) => g.key === today);
  if (routineSec) sections.splice(at >= 0 ? at + 1 : openGroups[0]?.key === 'overdue' ? 1 : 0, 0, routineSec);

  return `
    <div class="toolbar">
      <label class="search">${icon('search', 16)}<input type="search" placeholder="Buscar por título, nº do processo…" value="${esc(search)}" data-search aria-label="Buscar tarefas"></label>
      ${typeOptions.length ? `<select class="select-sm" data-type-filter aria-label="Filtrar por tipo">
        <option value="">Todos os tipos</option>
        ${typeOptions.map((t) => `<option value="${esc(t.id)}" ${ui.type === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
      </select>` : ''}
    </div>
    ${sections.length ? sections.join('') : emptyState('check', search ? 'Nada encontrado' : 'Nenhuma demanda em aberto', search ? 'Tente outra busca.' : 'Use o campo acima para adicionar. Ex.: “Enviar PAD até sexta #pad”.')}
    ${doneGroup ? `
      <details class="section done-section">
        <summary class="section-head"><h2>Concluídas</h2><span class="muted small">${doneGroup.items.length}</span></summary>
        <div class="list">${doneGroup.items.slice(0, 30).map((i) => taskRow(state, i, today, { showArea: !ui.area })).join('')}</div>
      </details>` : ''}`;
}

/** Tarefas remuneradas (TCC, SEI pago, IPM…): o que falta receber e o que já recebi. */
function paidView(state, today) {
  const paid = filtered(state).filter((t) => Number(t.value) > 0);
  const open = paid.filter((t) => !t.receivedAt).sort((a, b) => String(taskPayDate(a) || '9').localeCompare(String(taskPayDate(b) || '9')));
  const late = open.filter((t) => taskPayStatus(t, today) === 'atrasado');
  const got = paid.filter((t) => t.receivedAt).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  const row = (t) => {
    const payers = ownersOf({ owner: t.payer });
    // A data da previsão já aparece no selo "a receber · dd/mm"; aqui só quando o selo não mostra.
    const st = taskPayStatus(t, today);
    const when = t.receivedAt ? `em ${fmtDM(t.receivedAt)}` : st === 'pendente' && t.payDate ? '' : taskPayDate(t) ? `Previsão ${fmtDM(taskPayDate(t))}` : 'Sem previsão';
    return `<div class="row" role="button" tabindex="0" data-action="task-open" data-id="${esc(t.id)}" data-key="once">
      <div class="row-main">
        <div class="row-title">${esc(t.title)}</div>
        <div class="row-meta">${taskPayPill(t, today)}${payers.length ? `<span class="meta payer">${icon(payers.length > 1 ? 'users' : 'user', 13)}${esc(payerLabel(payers))}</span>` : ''}${when ? `<span class="meta">${when}</span>` : ''}${t.status === 'done' ? `<span class="meta">${icon('check', 13)}Tarefa concluída</span>` : ''}${!ui.area ? areaTag(state, t.area) : ''}</div>
      </div>
      ${t.receivedAt ? '' : `<button type="button" class="btn btn-sm" data-action="task-received" data-id="${esc(t.id)}">${icon('check', 14)}Recebi</button>`}
    </div>`;
  };
  return `
    <div class="toolbar"><button type="button" class="btn btn-primary btn-sm" data-action="task-new" data-paid="1" data-area="${esc(ui.area)}">${icon('plus', 16)}Nova tarefa remunerada</button></div>
    ${paid.length ? `<div class="tiles">
      ${tile('A receber', money(sum(open, (t) => t.value)), { ic: 'clock', sub: plural(open.length, 'tarefa', 'tarefas'), tone: late.length ? 'tone-critical' : '' })}
      ${tile('Recebido', money(sum(got, (t) => t.value)), { ic: 'coins', sub: plural(got.length, 'tarefa', 'tarefas') })}
    </div>
    <section class="section"><div class="section-head"><h2>A receber</h2><span class="muted small">${open.length}</span></div>
      ${open.length ? `<div class="list">${open.map(row).join('')}</div>` : emptyState('coins', 'Nada a receber', 'Todas as tarefas remuneradas já foram pagas.')}</section>
    ${got.length ? `<details class="section"><summary class="section-head"><h2>Recebidas</h2><span class="muted small">${got.length}</span></summary>
      <div class="list">${got.slice(0, 30).map(row).join('')}</div></details>` : ''}`
    : emptyState('coins', 'Nenhuma tarefa remunerada', 'Orientação de TCC, SEI pago, IPM, sindicância… Marque “Tarefa remunerada” ao criar a tarefa para acompanhar o pagamento. Ela também entra em Finanças.')}`;
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
          <article class="board-card ${i.done ? 'is-done' : ''}" draggable="true" data-drag="${esc(i.task.id)}" role="button" tabindex="0" data-action="task-open" data-id="${esc(i.task.id)}" data-key="once">
            <div class="row-title">${i.task.priority === 1 && !i.done ? `<span class="prio-flag">${icon('flag', 14)}</span>` : ''}${esc(i.task.title)}</div>
            <div class="row-meta">${dueChip(i, today)}${!ui.area ? areaTag(state, i.task.area) : ''}</div>
            <button type="button" class="icon-btn board-move" data-action="tk-move" data-id="${esc(i.task.id)}" aria-label="Mudar situação">${icon('more', 18)}</button>
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
      <div class="routine-top" role="button" tabindex="0" data-action="task-open" data-id="${esc(t.id)}" data-key="${esc(inst?.key || t.due)}">
        <div class="row-main">
          <div class="row-title">${esc(t.title)}</div>
          <div class="row-meta"><span class="meta">${icon('repeat', 13)}${esc(describeRule(t.recurrence, t.due))}${t.dueTime ? ` · ${t.dueTime}` : ''}</span>${!ui.area ? areaTag(state, t.area) : ''}</div>
        </div>
        ${inst && inst.date <= today ? `<button type="button" class="check big ${inst.done ? 'checked' : ''}" data-action="task-toggle" data-id="${esc(t.id)}" data-key="${esc(inst.key)}" aria-label="${inst.done ? 'Desmarcar' : 'Marcar como feita'}${inst.date < today ? ` (${fmtShort(inst.date)})` : ' hoje'}">${icon('check', 16)}</button>` : `<span class="muted small">${inst ? `Próxima: ${fmtShort(inst.date)}` : 'Encerrada'}</span>`}
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
    <div class="toolbar"><button type="button" class="btn btn-primary btn-sm" data-action="routine-new" data-area="${esc(ui.area)}">${icon('plus', 16)}Nova rotina</button>
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
        ${columns(daily, { format: (v) => `${Math.round(v)} min`, color: 6, title: 'minutos por dia' })}
      </section>
      <section class="card chart-card">
        <h3>Tempo por área</h3>
        ${hbars(byArea, { format: (v) => fmtDuration(v), empty: 'Nenhum tempo registrado no período.' })}
      </section>
    </div>
    <section class="section">
      <div class="section-head"><h2>Onde seu tempo foi</h2></div>
      ${topTasks.length ? `<div class="list">${topTasks.map(({ task, sec }) => `
        <div class="row" role="button" tabindex="0" data-action="task-open" data-id="${esc(task.id)}" data-key="once">
          <div class="row-main"><div class="row-title">${esc(task.title)}</div><div class="row-meta">${areaTag(state, task.area)}</div></div>
          <span class="amount">${fmtDuration(sec)}</span>
        </div>`).join('')}</div>` : emptyState('timer', 'Sem registros', 'Use o cronômetro para medir estudo, processos e trabalhos.')}
    </section>`;
}

export default {
  id: 'tarefas',
  title: 'Tarefas',
  enter(params) {
    if (params.get('mode')) ui.mode = params.get('mode');
    if (params.get('f') === 'atrasadas') {
      ui.mode = 'dia';
      sel = 'late';
    }
    if (params.get('d')) {
      ui.mode = 'dia';
      sel = params.get('d');
    }
  },
  render({ state, today }) {
    // Filtro guardado no aparelho que não existe nesta conta (área apagada, ou outra pessoa
    // usou o app neste aparelho): solta, senão a lista apareceria vazia sem motivo visível.
    if (ui.area && !state.areas.some((a) => a.id === ui.area)) ui.area = '';
    if (ui.type && !state.tasks.some((t) => t.type === ui.type)) ui.type = '';
    const counts = Object.fromEntries(state.areas.map((a) => [a.id, state.tasks.filter((t) => t.area === a.id && !t.recurrence && t.status !== 'done').length]));
    const areaItems = state.areas.map((a) => [a.id, `${a.name}${counts[a.id] ? ` · ${counts[a.id]}` : ''}`, a.color]);
    const area = state.areas.find((a) => a.id === ui.area);
    const toReceive = state.tasks.filter((t) => Number(t.value) > 0 && !t.receivedAt).length;
    let body = '';
    if (ui.mode === 'quadro') body = boardView(state, today);
    else if (ui.mode === 'rotinas') body = routinesView(state, today);
    else if (ui.mode === 'tempo') body = timeView(state, today);
    else if (ui.mode === 'remuneradas') body = paidView(state, today);
    else if (ui.mode === 'lista') body = listView(state, today);
    else body = dayView(state, today);
    // Captura rápida e "Nova" já caem no dia aberto em "Meu dia" (sem data só na aba "Sem data").
    const openDay = ui.mode === 'dia' ? (sel === 'none' ? null : sel === 'late' ? today : sel || today) : null;
    const placeholder = ui.mode === 'dia'
      ? (openDay ? `Adicionar para ${whenLabel(openDay, today)}… ex.: Enviar SEI #sei !alta` : 'Adicionar sem data… ex.: Renovar CNH @pessoal')
      : area ? `Nova tarefa em ${area.name}… ex.: “Entregar trabalho dia 20”` : 'Ex.: Enviar SEI até sexta #sei !alta';
    return `
      <header class="page-head">
        <h1>Tarefas</h1>
        <div class="head-actions">
          <button type="button" class="btn btn-primary btn-sm" data-action="task-new" data-area="${esc(ui.area)}" data-due="${esc(openDay || '')}">${icon('plus', 16)}Nova</button>
        </div>
      </header>
      ${chips(areaItems, ui.area || null, 'tk-area', { all: 'Todas' })}
      ${tabs([['dia', 'Meu dia'], ['lista', 'Lista'], ['quadro', 'Quadro'], ['rotinas', 'Rotinas'], ['tempo', 'Tempo'], ['remuneradas', 'Remuneradas', toReceive || '']], ui.mode, 'tk-mode')}
      ${quickAddHtml(placeholder)}
      <div class="view-body">${body}</div>`;
  },
  mount(el) {
    const today = todayKey();
    bindQuickAdd(el, { area: ui.area || null, due: ui.mode === 'dia' ? (sel === 'none' ? null : sel === 'late' ? today : sel || today) : null });
    // Faixa de dias: o dia escolhido sempre à vista.
    const strip = el.querySelector('.dstrip');
    const on = strip?.querySelector('.dstrip-item.active');
    if (strip && on) {
      const r = on.getBoundingClientRect();
      const b = strip.getBoundingClientRect();
      if (r.right > b.right || r.left < b.left) strip.scrollLeft += r.left - b.left - 12;
    }
    // Celular: a barra de abas rola; garante que a aba ativa (ex.: Remuneradas) fique à vista.
    const bar = el.querySelector('.tabs');
    const active = bar?.querySelector('.tab.active');
    if (bar && active) {
      const hidden = active.getBoundingClientRect().right - bar.getBoundingClientRect().right;
      if (hidden > 0) bar.scrollLeft += hidden + 8;
    }
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
    'tk-day'(btn) {
      sel = btn.dataset.value;
      ui.mode = 'dia';
      save();
      rerender();
    },
    /** Botão de calendário na tarefa: mudar o dia. */
    async 'tk-when'(btn) {
      const today = todayKey();
      const t = store.get().tasks.find((x) => x.id === btn.dataset.id);
      if (!t) return;
      const mon = nextWeekday(today, 1, false);
      const sat = nextWeekday(today, 6, false);
      const opts = [
        { value: today, label: 'Hoje', sub: fmtShort(today), icon: 'sun' },
        { value: addDays(today, 1), label: 'Amanhã', sub: fmtShort(addDays(today, 1)), icon: 'arrowRight' },
        weekday(today) !== 6 && weekday(today) !== 0 ? { value: sat, label: 'Fim de semana', sub: fmtShort(sat), icon: 'calendar' } : null,
        { value: mon, label: 'Próxima semana', sub: fmtShort(mon), icon: 'calendar' },
        { value: 'pick', label: 'Escolher o dia…', icon: 'calendar' },
        t.due ? { value: 'none', label: 'Tirar a data', sub: 'vai para “Sem data”', icon: 'inbox' } : null,
      ].filter((o) => o && o.value !== t.due);
      const v = await actionSheet({ title: `Quando fazer “${t.title}”?`, options: opts });
      if (!v) return;
      if (v === 'pick') pickDay(t);
      else setDue([t.id], v === 'none' ? null : v);
    },
    /** Botões da caixa "Sem data": Hoje / Amanhã / Outro dia. */
    'tk-plan'(btn) {
      const t = store.get().tasks.find((x) => x.id === btn.dataset.id);
      if (!t) return;
      if (btn.dataset.when === 'pick') pickDay(t);
      else setDue([t.id], btn.dataset.when);
    },
    'tk-late-today'() {
      const today = todayKey();
      const ids = overdueOpen(filtered(store.get(), { useSearch: false }), today).map((i) => i.task.id);
      if (!ids.length) return;
      setDue(ids, today);
      sel = today;
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

/** Muda o prazo de uma ou mais tarefas (com desfazer). `due` null = sem data. */
function setDue(ids, due) {
  const today = todayKey();
  const set = new Set(ids);
  store.update((s) => {
    for (const t of s.tasks) if (set.has(t.id)) t.due = due || '';
  }, { undoable: true });
  const what = ids.length === 1 ? 'Tarefa' : plural(ids.length, 'tarefa', 'tarefas');
  toast(`${what} ${ids.length === 1 ? 'movida' : 'movidas'} para ${whenLabel(due, today)}`, { action: { label: 'Desfazer', onClick: () => store.undo() } });
}

/** Escolher um dia no calendário do aparelho. */
function pickDay(t) {
  const today = todayKey();
  openModal({
    title: 'Escolher o dia',
    size: 'sm',
    body: `<p class="muted small">${esc(t.title)}</p>
      <div class="field"><label class="field-label" for="pick-day">Dia</label><input id="pick-day" name="due" type="date" value="${esc(t.due || today)}" required autofocus></div>`,
    footer: '<button type="button" class="btn" data-close>Cancelar</button><button type="submit" class="btn btn-primary">Salvar</button>',
    onSubmit(fd) {
      const d = fd.get('due');
      if (d) setDue([t.id], d);
    },
  });
}

function setStatus(id, status) {
  store.update((s) => {
    const t = s.tasks.find((x) => x.id === id);
    if (!t || t.status === status) return;
    t.status = status;
    t.doneAt = status === 'done' ? new Date().toISOString() : null;
  }, { undoable: true });
  toast(`Movida para “${STATUS[status]}”`, { action: { label: 'Desfazer', onClick: () => store.undo() } });
}
