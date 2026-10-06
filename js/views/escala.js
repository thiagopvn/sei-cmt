// Escala: serviços do mês, trocas com colegas e pagamentos de serviços extras.

import { esc, money, plural, sum } from '../lib/util.js';
import { icon } from '../lib/icons.js';
import { addMonths, monthOf, monthStart, monthEnd, startOfWeek, addDays, fromKey, fmtShort, fmtDM, relDays, WEEKDAYS_SHORT, WEEKDAYS_MIN, hoursLabel, monthShortLabel, todayKey } from '../lib/dates.js';
import { shiftsInRange, shiftTitle, permutaLabel, monthStats, swapStatus, swapBalance, SWAP_LABEL, pendingPayments, payStatus, PAY_LABEL } from '../domain/shifts.js';
import { openShift } from '../actions.js';
import { tile, monthNav, tabs, emptyState } from '../ui/parts.js';
import { columns, bindCharts } from '../ui/charts.js';
import { whatsappLink } from '../forms/service.js';
import { rerender } from '../ui/bus.js';

let month = null;
let tab = 'servicos';

function miniCalendar(state, M, shifts, today) {
  const ws = Number(state.settings.weekStart) || 0;
  const first = startOfWeek(monthStart(M), ws);
  const byDate = new Map(shifts.map((s) => [s.date, s]));
  const cells = Array.from({ length: 42 }, (_, i) => addDays(first, i)).filter((d, i) => i < 35 || monthOf(addDays(first, 35)) === M).map((d) => {
    const sh = byDate.get(d);
    const out = monthOf(d) !== M;
    return `<button type="button" class="mini-cell ${out ? 'out' : ''} ${d === today ? 'today' : ''} ${sh ? `shift-${sh.kind}` : ''}"
      ${out ? 'tabindex="-1"' : ''} data-action="${sh ? 'es-open' : 'service-new'}" data-date="${esc(d)}" data-shift="${esc(sh ? sh.id : '')}"
      aria-label="${fmtShort(d)}${sh ? `: ${esc(shiftTitle(sh))}` : ': sem serviço, toque para adicionar'}">${fromKey(d).getDate()}${sh?.kind === 'coberto' && sh.swap?.theirDate ? `<small class="mini-sub">p/ ${fmtDM(sh.swap.theirDate)}</small>` : ''}</button>`;
  }).join('');
  return `<div class="mini-cal card">
    <div class="mini-head">${Array.from({ length: 7 }, (_, i) => `<span>${WEEKDAYS_MIN[(ws + i) % 7]}</span>`).join('')}</div>
    <div class="mini-body">${cells}</div>
    <div class="cal-legend">
      <span><span class="legend-sw shift-servico"></span>Serviço</span>
      <span><span class="legend-sw shift-cobrindo"></span>Troca (eu tiro)</span>
      <span><span class="legend-sw shift-coberto"></span>Permutado</span>
    </div>
  </div>`;
}

function payPill(status) {
  if (!status) return '';
  const cls = { recebido: 'pill-good', atrasado: 'pill-critical', pendente: 'pill-soft' }[status];
  const ic = { recebido: 'check', atrasado: 'alert', pendente: 'clock' }[status];
  return `<span class="pill ${cls}">${icon(ic, 13)}${PAY_LABEL[status]}</span>`;
}

function shiftRow(state, sh, today) {
  const d = fromKey(sh.date);
  const pay = sh.service ? payStatus(sh.service, today, state.settings) : null;
  const kindPill = sh.kind === 'cobrindo'
    ? `<span class="pill pill-violet">${icon('swap', 13)}Tiro por ${esc(sh.colleague)}</span>`
    : sh.kind === 'coberto' ? `<span class="pill pill-violet">${icon('swap', 13)}${esc(permutaLabel(sh))} · ${esc(sh.colleague)}</span>` : '';
  return `<div class="row shift-row kind-${sh.kind} ${sh.date < today ? 'is-past' : ''}" role="button" tabindex="0" data-action="es-open" data-shift="${esc(sh.id)}">
    <div class="date-block ${sh.date === today ? 'today' : ''}"><strong>${d.getDate()}</strong><span>${WEEKDAYS_SHORT[d.getDay()]}</span></div>
    <div class="row-main">
      <div class="row-title">${esc(sh.kind === 'servico' ? shiftTitle(sh) : sh.service ? shiftTitle({ ...sh, kind: 'servico' }) : 'Serviço')}</div>
      <div class="row-meta">
        <span class="meta">${icon('clock', 13)}${sh.start} · ${hoursLabel(sh.hours)}</span>
        ${sh.unit ? `<span class="meta">${icon('mapPin', 13)}${esc(sh.unit)}</span>` : ''}
        ${kindPill}
        ${sh.paid ? `<span class="meta">${icon('coins', 13)}${money(sh.value)}</span>` : ''}
        ${payPill(pay)}
      </div>
    </div>
    ${pay && pay !== 'recebido' && sh.date <= today ? `<button type="button" class="btn btn-sm" data-action="service-received" data-id="${esc(sh.service.id)}">${icon('check', 14)}Recebi</button>` : ''}
  </div>`;
}

function servicesTab(state, M, shifts, today) {
  return `
    ${miniCalendar(state, M, shifts, today)}
    <section class="section">
      <div class="section-head"><h2>Serviços de ${monthShortLabel(M)}</h2><span class="muted small">${plural(shifts.length, 'registro', 'registros')}</span></div>
      ${shifts.length ? `<div class="list">${shifts.map((s) => shiftRow(state, s, today)).join('')}</div>`
        : emptyState('shield', 'Nenhum serviço neste mês', 'Gere sua escala automaticamente ou adicione serviços avulsos.',
          `<div class="btn-row"><button type="button" class="btn btn-primary btn-sm" data-action="generate-schedule">${icon('sparkles', 16)}Gerar escala</button><button type="button" class="btn btn-sm" data-action="service-new">${icon('plus', 16)}Serviço avulso</button></div>`)}
    </section>`;
}

function swapsTab(state, today) {
  const balance = swapBalance(state.swaps, today);
  const phone = (name) => state.colleagues.find((c) => c.name === name)?.phone;
  const open = state.swaps.filter((w) => swapStatus(w, today) !== 'quitada').sort((a, b) => (a.myDate || a.theirDate || '').localeCompare(b.myDate || b.theirDate || ''));
  const done = state.swaps.filter((w) => swapStatus(w, today) === 'quitada').sort((a, b) => (b.myDate || b.theirDate || '').localeCompare(a.myDate || a.theirDate || '')).slice(0, 20);
  const leg = (label, date, dir) => `<div class="leg ${date && date <= today ? 'leg-done' : ''}">
    <span class="leg-ic ${dir}">${icon(dir === 'out' ? 'arrowUp' : 'arrowDown', 14)}</span>
    <span><small>${label}</small><strong>${date ? `${fmtShort(date)}${date > today ? ` · ${relDays(date, today)}` : ''}` : 'A combinar'}</strong></span>
  </div>`;
  const swapCard = (w) => {
    const st = swapStatus(w, today);
    const pill = { quitada: 'pill-good', devo: 'pill-warning', me_devem: 'pill-violet', agendada: 'pill-soft' }[st];
    return `<article class="swap-card card" role="button" tabindex="0" data-action="swap-open" data-id="${esc(w.id)}">
      <div class="swap-top"><strong>${icon('user', 16)}${esc(w.colleague)}</strong><span class="pill ${pill}">${SWAP_LABEL[st]}</span></div>
      <div class="legs">${leg('Ele tira o meu', w.myDate, 'out')}${leg('Eu tiro o dele', w.theirDate, 'in')}</div>
      ${w.notes ? `<p class="muted small">${esc(w.notes)}</p>` : ''}
    </article>`;
  };
  return `
    <div class="toolbar"><button type="button" class="btn btn-primary btn-sm" data-action="swap-new">${icon('plus', 16)}Registrar troca</button></div>
    ${balance.length ? `<section class="section">
      <div class="section-head"><h2>Saldo com colegas</h2></div>
      <div class="balance">${balance.map((b) => {
        const ph = phone(b.colleague);
        const msg = b.devo ? `Oi, ${b.colleague}! Vamos combinar a data para eu devolver o serviço da troca?` : `Oi, ${b.colleague}! Vamos combinar a data da devolução do serviço da nossa troca?`;
        return `<div class="balance-row">
          <span class="avatar">${esc(b.colleague.split(' ').map((p) => p[0]).slice(-2).join('').toUpperCase())}</span>
          <div class="row-main"><strong>${esc(b.colleague)}</strong>
            <span class="muted small">${b.devo ? `Você deve ${plural(b.devo, 'serviço', 'serviços')}` : ''}${b.devo && b.meDevem ? ' · ' : ''}${b.meDevem ? `Te deve ${plural(b.meDevem, 'serviço', 'serviços')}` : ''}${!b.devo && !b.meDevem ? `${plural(b.abertas, 'troca agendada', 'trocas agendadas')}` : ''}</span></div>
          ${ph ? `<a class="btn btn-sm" href="${esc(whatsappLink(ph, msg))}" target="_blank" rel="noopener">${icon('whatsapp', 16)}Conversar</a>` : ''}
        </div>`;
      }).join('')}</div>
    </section>` : ''}
    <section class="section">
      <div class="section-head"><h2>Trocas em aberto</h2><span class="muted small">${open.length}</span></div>
      ${open.length ? `<div class="swaps">${open.map(swapCard).join('')}</div>` : emptyState('swap', 'Nenhuma troca em aberto', 'Registre quem tira seu serviço e quando você devolve. O app avisa quem deve a quem.')}
    </section>
    ${done.length ? `<details class="section"><summary class="section-head"><h2>Quitadas</h2><span class="muted small">${done.length}</span></summary><div class="swaps">${done.map(swapCard).join('')}</div></details>` : ''}`;
}

function paymentsTab(state, today) {
  const pend = pendingPayments(state, today);
  const late = pend.filter((p) => p.status === 'atrasado');
  const upcoming = pend.filter((p) => p.status !== 'atrasado');
  const received = state.services.filter((s) => s.paid && s.receivedAt).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)).slice(0, 15);
  const M = monthOf(today);
  const last6 = Array.from({ length: 6 }, (_, i) => addMonths(M, i - 5)).map((m) => ({
    label: monthShortLabel(m),
    value: sum(state.services.filter((s) => s.paid && monthOf(s.date) === m), (s) => s.value),
  }));
  const row = (p) => `<div class="row" role="button" tabindex="0" data-action="service-open" data-id="${esc(p.service.id)}">
    <div class="row-main">
      <div class="row-title">Serviço de ${fmtShort(p.service.date)}${p.service.unit ? ` · ${esc(p.service.unit)}` : ''}</div>
      <div class="row-meta">${payPill(p.status)}<span class="meta">Previsão ${fmtDM(p.expected)}${p.status === 'atrasado' ? ` (${relDays(p.expected, today)})` : ''}</span></div>
    </div>
    <span class="amount">${money(p.service.value)}</span>
    <button type="button" class="btn btn-sm" data-action="service-received" data-id="${esc(p.service.id)}">${icon('check', 14)}Recebi</button>
  </div>`;
  return `
    <div class="tiles">
      ${tile('Atrasado', money(sum(late, (p) => p.service.value)), { ic: 'alert', sub: plural(late.length, 'serviço', 'serviços'), tone: late.length ? 'tone-critical' : '' })}
      ${tile('A receber', money(sum(upcoming, (p) => p.service.value)), { ic: 'clock', sub: plural(upcoming.length, 'serviço', 'serviços') })}
    </div>
    ${late.length ? `<section class="section"><div class="section-head"><h2 class="group-overdue">Pagamento atrasado</h2></div><div class="list">${late.map(row).join('')}</div></section>` : ''}
    <section class="section"><div class="section-head"><h2>A receber</h2></div>
      ${upcoming.length ? `<div class="list">${upcoming.map(row).join('')}</div>` : emptyState('coins', 'Nada a receber', 'Marque um serviço como “pago” para acompanhar o pagamento.')}</section>
    <section class="card chart-card">
      <h3>Serviços extras por mês (valor)</h3>
      ${columns(last6, { format: (v) => money(v), color: 6, title: 'valor por mês' })}
    </section>
    ${received.length ? `<details class="section"><summary class="section-head"><h2>Recebidos</h2><span class="muted small">${received.length}</span></summary>
      <div class="list">${received.map((s) => `<div class="row" role="button" tabindex="0" data-action="service-open" data-id="${esc(s.id)}">
        <div class="row-main"><div class="row-title">Serviço de ${fmtShort(s.date)}</div><div class="row-meta">${payPill('recebido')}<span class="meta">em ${fmtDM(s.receivedAt)}</span></div></div>
        <span class="amount">${money(s.value)}</span></div>`).join('')}</div></details>` : ''}`;
}

export default {
  id: 'escala',
  title: 'Escala',
  enter(params) {
    if (params.get('tab')) tab = params.get('tab');
  },
  render({ state, today }) {
    month = month || monthOf(today);
    const shifts = shiftsInRange(state, monthStart(month), monthEnd(month));
    const st = monthStats(state, month, today);
    const bal = swapBalance(state.swaps, today);
    const owe = sum(bal, (b) => b.devo);
    const owed = sum(bal, (b) => b.meDevem);
    const lateCount = pendingPayments(state, today).filter((p) => p.status === 'atrasado').length;
    let body = '';
    if (tab === 'trocas') body = swapsTab(state, today);
    else if (tab === 'pagamentos') body = paymentsTab(state, today);
    else body = servicesTab(state, month, shifts, today);
    return `
      <header class="page-head">
        <h1>Escala</h1>
        <div class="head-actions">
          <button type="button" class="btn btn-sm" data-action="generate-schedule">${icon('sparkles', 16)}Gerar escala</button>
          <button type="button" class="btn btn-primary btn-sm" data-action="service-new">${icon('plus', 16)}Serviço</button>
        </div>
      </header>
      ${tab === 'servicos' ? `<div class="toolbar">${monthNav(month, 'es-month')}</div>
      <div class="tiles">
        ${tile('Serviços', String(st.count), { ic: 'shield', sub: hoursLabel(st.hours) + ' trabalhadas' })}
        ${tile('Extras pagos', money(st.paidTotal), { ic: 'coins', sub: st.paidCount ? `${money(st.received)} recebido` : 'Nenhum no mês' })}
        ${tile('Trocas no mês', String(st.covered + st.covering), { ic: 'swap', sub: `${st.covered} permutados · ${st.covering} cobrindo` })}
        ${tile('Saldo de trocas', owe || owed ? `${owe ? `−${owe}` : ''}${owe && owed ? ' / ' : ''}${owed ? `+${owed}` : ''}` : '0', { ic: 'users', sub: owe || owed ? `devo ${owe} · me devem ${owed}` : 'Tudo quitado', to: '#/escala?tab=trocas' })}
      </div>` : ''}
      ${tabs([['servicos', 'Serviços'], ['trocas', 'Trocas', owe + owed || ''], ['pagamentos', 'Pagamentos', lateCount || '']], tab, 'es-tab')}
      <div class="view-body">${body}</div>`;
  },
  mount(el) {
    bindCharts(el);
  },
  actions: {
    'es-tab'(btn) {
      tab = btn.dataset.value;
      history.replaceState(null, '', '#/escala');
      rerender();
    },
    'es-month'(btn) {
      const step = Number(btn.dataset.step);
      month = step === 0 ? monthOf(todayKey()) : addMonths(month, step);
      rerender();
    },
    'es-open'(btn, ev, { state }) {
      const sh = shiftsInRange(state, '0000-01-01', '9999-12-31').find((x) => x.id === btn.dataset.shift);
      if (sh) openShift(sh);
    },
  },
};

