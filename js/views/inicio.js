// Início: situação de hoje, radar de alertas, agenda do dia e próximos dias.

import { esc, money, plural, sum } from '../lib/util.js';
import { icon } from '../lib/icons.js';
import { addDays, fmtLong, fmtShort, monthOf, relDays, toMin, fromMin, hoursLabel } from '../lib/dates.js';
import { onDutyNow, nextShift, shiftsInRange, monthStats } from '../domain/shifts.js';
import { collectRange, conflicts } from '../domain/agenda.js';
import { radar } from '../domain/insights.js';
import { openItems } from '../domain/finance.js';
import { activeInstance } from '../domain/tasks.js';
import { agendaItemRow, tile, emptyState } from '../ui/parts.js';
import { quickAddHtml, bindQuickAdd } from '../ui/quickadd.js';
import { rerender } from '../ui/bus.js';
import { cloud } from '../cloud/cloud.js';
import { loadSample } from '../sample.js';
import { canInstall, promptInstall } from '../install.js';

let showAllRadar = false;

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Boa noite' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

function statusCard(state, today) {
  const duty = onDutyNow(state, today);
  if (duty) {
    const end = fromMin(toMin(duty.start) + duty.hours * 60);
    const endDay = addDays(duty.date, Math.floor((toMin(duty.start) + duty.hours * 60) / 1440));
    return `<div class="status-card on-duty">
      <span class="status-ic">${icon('shield', 22)}</span>
      <div><strong>${duty.kind === 'cobrindo' ? `De serviço (troca com ${esc(duty.colleague)})` : 'Você está de serviço'}</strong>
      <span>Até ${endDay === today ? 'hoje' : relDays(endDay, today)} às ${end}${duty.unit ? ` · ${esc(duty.unit)}` : ''}</span></div>
    </div>`;
  }
  const covered = shiftsInRange(state, today, today).find((s) => s.kind === 'coberto');
  const next = nextShift(state, today);
  const nextTxt = next
    ? `Próximo serviço ${relDays(next.date, today)} (${fmtShort(next.date)}) às ${next.start}${next.kind === 'cobrindo' ? ` · troca com ${esc(next.colleague)}` : ''}`
    : 'Nenhum serviço cadastrado à frente';
  return `<div class="status-card">
    <span class="status-ic">${icon(covered ? 'swap' : 'sun', 22)}</span>
    <div><strong>${covered ? `Folga — ${esc(covered.colleague)} tira seu serviço hoje` : 'Folga hoje'}</strong><span>${nextTxt}</span></div>
  </div>`;
}

const LEVEL_ICON = { critical: 'alert', serious: 'alert', warning: 'clock', info: 'bell', good: 'check' };

function radarHtml(items) {
  if (!items.length) {
    return `<div class="radar-ok">${icon('check', 18)}<span>Tudo em dia. Nenhum prazo, conta ou pagamento pedindo atenção.</span></div>`;
  }
  const shown = showAllRadar ? items : items.slice(0, 4);
  return `<div class="radar">${shown.map((r) => `
    <a class="radar-item lvl-${r.level}" href="${esc(r.to)}">
      <span class="radar-ic">${icon(r.icon || LEVEL_ICON[r.level], 18)}</span>
      <span class="radar-text"><strong>${esc(r.title)}</strong>${r.detail ? `<small>${esc(r.detail)}</small>` : ''}</span>
      ${icon('chevronRight', 16, 'radar-go')}
    </a>`).join('')}
    ${items.length > 4 ? `<button type="button" class="link-btn" data-action="radar-more">${showAllRadar ? 'Mostrar menos' : `Ver mais ${items.length - 4} alertas`}</button>` : ''}
  </div>`;
}

function isEmpty(state) {
  return !state.tasks.length && !state.services.length && !state.events.length && !state.entries.length && !state.swaps.length;
}

function onboarding() {
  return `<section class="card onboarding">
    <h2>Vamos montar a sua central</h2>
    <p class="muted">Em poucos minutos o app passa a cuidar dos seus prazos, da sua escala e do seu dinheiro.</p>
    <ol class="steps">
      <li><button type="button" class="step" data-action="generate-schedule">${icon('shield', 18)}<span><strong>Gere sua escala</strong><small>24×72, 12×36 ou dias fixos</small></span></button></li>
      <li><button type="button" class="step" data-action="entry-new" data-kind="despesa">${icon('wallet', 18)}<span><strong>Cadastre contas fixas</strong><small>Aluguel, creche, internet…</small></span></button></li>
      <li><button type="button" class="step" data-action="card-new">${icon('card', 18)}<span><strong>Adicione seus cartões</strong><small>Fechamento e vencimento</small></span></button></li>
      <li><button type="button" class="step" data-action="go" data-to="#/tarefas?mode=rotinas">${icon('repeat', 18)}<span><strong>Crie suas rotinas</strong><small>Creche, estudo, contas do mês</small></span></button></li>
    </ol>
    <button type="button" class="btn" data-action="load-sample">${icon('sparkles', 16)}Ver o app com dados de exemplo</button>
  </section>`;
}

export default {
  id: 'inicio',
  title: 'Início',
  render({ state, today }) {
    const name = state.profile.name ? `, ${esc(state.profile.name.split(' ')[0])}` : '';
    const todayItems = collectRange(state, today, today).get(today) || [];
    // Próximos dias sem rotinas: só o que foge do comum (serviços, prazos, compromissos, contas).
    const week = collectRange(state, addDays(today, 1), addDays(today, 7), { layers: ['servico', 'tarefa', 'evento', 'financa'] });
    const open = openItems(state, today, 31);
    const toReceive = open.filter((i) => i.kind === 'receita');
    const toPay = open.filter((i) => i.kind === 'despesa' && i.date <= addDays(today, 7));
    const lateToPay = toPay.filter((i) => i.date < today);
    const ms = monthStats(state, monthOf(today), today);
    const openTasks = state.tasks.filter((t) => !t.recurrence && t.status !== 'done');
    const lateTasks = openTasks.filter((t) => t.due && t.due < today);
    const routinesToday = state.tasks.filter((t) => t.recurrence).map((t) => activeInstance(t, today)).filter((i) => i && i.date === today);
    const routinesDone = routinesToday.filter((i) => i.done).length;
    const conf = new Set(conflicts(state, today, today).map((c) => c.item.id));

    const weekHtml = [...week.entries()].filter(([, items]) => items.length).map(([d, items]) => `
      <div class="day-block">
        <div class="day-head"><strong>${fmtShort(d)}</strong><span class="muted">${relDays(d, today)}</span></div>
        <div class="list compact">${items.slice(0, 4).map((it) => agendaItemRow(state, it)).join('')}
          ${items.length > 4 ? `<a class="more-link" href="#/agenda?d=${d}">+ ${items.length - 4} no dia</a>` : ''}</div>
      </div>`).join('');

    return `
      <header class="page-head home-head">
        <div>
          <p class="eyebrow">${fmtLong(today)}</p>
          <h1>${greeting()}${name}</h1>
        </div>
      </header>

      ${statusCard(state, today)}

      ${isEmpty(state) ? onboarding() : ''}

      ${canInstall() && !localStorage.getItem('pauta:install-dismissed') ? `
        <div class="install-banner">${icon('install', 20)}<span><strong>Instale o app no celular</strong><small>Abre em tela cheia, funciona sem internet e envia lembretes.</small></span>
          <button type="button" class="btn btn-primary btn-sm" data-action="install">Instalar</button>
          <button type="button" class="icon-btn" data-action="install-dismiss" aria-label="Dispensar">${icon('x', 16)}</button></div>` : ''}

      ${quickAddHtml()}

      <section class="section">
        <div class="section-head"><h2>${icon('zap', 18)}Radar</h2></div>
        ${radarHtml(radar(state, today, { synced: !!cloud.info.user }))}
      </section>

      <div class="tiles">
        ${tile('A receber', money(sum(toReceive, (i) => i.amount)), { ic: 'coins', to: '#/financas', sub: toReceive.length ? plural(toReceive.length, 'lançamento', 'lançamentos') : 'Nada pendente' })}
        ${tile('A pagar · 7 dias', money(sum(toPay, (i) => i.amount)), { ic: 'wallet', to: '#/financas', sub: lateToPay.length ? `${plural(lateToPay.length, 'atrasada', 'atrasadas')}` : `${plural(toPay.length, 'conta', 'contas')}`, tone: lateToPay.length ? 'tone-critical' : '' })}
        ${tile('Serviços no mês', String(ms.count), { ic: 'shield', to: '#/escala', sub: `${hoursLabel(ms.hours)}${ms.covered + ms.covering ? ` · ${plural(ms.covered + ms.covering, 'troca', 'trocas')}` : ''}` })}
        ${tile('Demandas abertas', String(openTasks.length), { ic: 'tasks', to: '#/tarefas', sub: lateTasks.length ? plural(lateTasks.length, 'atrasada', 'atrasadas') : 'Nenhuma atrasada', tone: lateTasks.length ? 'tone-critical' : '' })}
      </div>

      <div class="home-grid">
        <section class="section">
          <div class="section-head">
            <h2>${icon('calendar', 18)}Hoje</h2>
            ${routinesToday.length ? `<span class="muted small">Rotinas: ${routinesDone}/${routinesToday.length}</span>` : ''}
            <button type="button" class="btn btn-sm" data-action="new-menu" data-date="${esc(today)}">${icon('plus', 16)}Adicionar</button>
          </div>
          ${routinesToday.length ? `<div class="progress" role="progressbar" aria-valuenow="${routinesDone}" aria-valuemax="${routinesToday.length}" aria-label="Rotinas concluídas hoje"><span style="width:${(routinesDone / routinesToday.length) * 100}%"></span></div>` : ''}
          <div class="list">${todayItems.length
            ? todayItems.map((it) => (conf.has(it.id) ? agendaItemRow(state, it).replace('class="row agenda-row', 'class="row agenda-row has-conflict') : agendaItemRow(state, it))).join('')
            : emptyState('sun', 'Dia livre', 'Nada agendado para hoje.')}</div>
        </section>

        <section class="section">
          <div class="section-head"><h2>${icon('clock', 18)}Próximos 7 dias</h2><a class="link-btn" href="#/agenda">Agenda</a></div>
          ${weekHtml || emptyState('calendar', 'Semana tranquila', 'Nada marcado nos próximos 7 dias.')}
        </section>
      </div>`;
  },
  mount(el) {
    bindQuickAdd(el);
  },
  actions: {
    'radar-more'() {
      showAllRadar = !showAllRadar;
      rerender();
    },
    'load-sample'() {
      loadSample();
    },
    install() {
      promptInstall();
    },
    'install-dismiss'() {
      localStorage.setItem('pauta:install-dismissed', '1');
      rerender();
    },
  },
};
