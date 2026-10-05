// Finanças: o que entra, o que sai, contas a pagar, cartões e faturas.

import { esc, money, plural, sum } from '../lib/util.js';
import { icon } from '../lib/icons.js';
import { addMonths, monthOf, fmtDM, fmtShort, relDays, todayKey } from '../lib/dates.js';
import { monthSummary, openItems, invoice, cardUsed, expensesByCategory, incomeBySource } from '../domain/finance.js';
import { tile, monthNav, tabs, emptyState, chips } from '../ui/parts.js';
import { hbars } from '../ui/charts.js';
import { openInvoice } from '../forms/finance.js';
import { rerender } from '../ui/bus.js';

let month = null;
let tab = 'resumo';
let kindFilter = '';

const SOURCE_ICON = { entry: 'wallet', service: 'shield', task: 'briefcase', invoice: 'card' };
const CAT_COLORS = [6, 2, 7, 4, 5, 3, 8, 1];

function itemRow(it, today) {
  const late = !it.settledAt && it.date < today;
  const openAction = it.source === 'entry' ? `data-action="entry-open" data-id="${esc(it.ref.entryId)}"`
    : it.source === 'service' ? `data-action="service-open" data-id="${esc(it.ref.serviceId)}"`
      : it.source === 'task' ? `data-action="task-open" data-id="${esc(it.ref.taskId)}" data-key="once"`
        : `data-action="fin-invoice" data-card="${esc(it.ref.cardId)}" data-month="${esc(it.ref.month)}"`;
  return `<div class="row fin-row ${it.settledAt ? 'is-done' : ''}" role="button" tabindex="0" ${openAction}>
    <span class="fin-ic ${it.kind}">${icon(SOURCE_ICON[it.source] || 'wallet', 16)}</span>
    <div class="row-main">
      <div class="row-title">${esc(it.title)}</div>
      <div class="row-meta">
        ${it.settledAt ? `<span class="pill pill-good">${icon('check', 13)}${it.kind === 'receita' ? 'Recebido' : 'Pago'} ${fmtDM(it.settledAt)}</span>`
          : late ? `<span class="pill pill-critical">${icon('alert', 13)}Venceu ${relDays(it.date, today)}</span>`
            : `<span class="meta">${it.date === today ? 'Hoje' : `${fmtShort(it.date)} · ${relDays(it.date, today)}`}</span>`}
        <span class="meta">${esc(it.category)}</span>
        ${it.recurring ? `<span class="meta">${icon('repeat', 13)}${it.recurring === 'yearly' ? 'Anual' : 'Mensal'}</span>` : ''}
      </div>
    </div>
    <span class="amount ${it.kind}">${it.kind === 'receita' ? '+' : '−'} ${money(it.amount)}</span>
    <button type="button" class="check ${it.settledAt ? 'checked' : ''}" data-action="fin-toggle" data-key="${esc(it.key)}" data-month="${esc(it.date.slice(0, 7))}"
      aria-label="${it.settledAt ? 'Desmarcar' : it.kind === 'receita' ? 'Marcar como recebido' : 'Marcar como pago'}">${icon('check', 14)}</button>
  </div>`;
}

function resumoTab(state, M, sm, today) {
  const isCurrent = M === monthOf(today);
  // No mês atual, inclui o que ficou em aberto de meses anteriores.
  const carry = isCurrent ? openItems(state, today, 0).filter((i) => monthOf(i.date) < M) : [];
  const inc = [...carry.filter((i) => i.kind === 'receita'), ...sm.items.filter((i) => i.kind === 'receita')];
  const exp = [...carry.filter((i) => i.kind === 'despesa'), ...sm.items.filter((i) => i.kind === 'despesa')];
  const sortOpen = (a, b) => (!!a.settledAt - !!b.settledAt) || a.date.localeCompare(b.date);
  const byCat = expensesByCategory(state, M).map((x, i) => ({ label: x.category, value: x.value, color: CAT_COLORS[i % 8] }));
  const bySrc = incomeBySource(state, M).map((x, i) => ({ label: x.category, value: x.value, color: [6, 7, 3, 2][i % 4] }));
  return `
    <div class="two-col">
      <section class="section">
        <div class="section-head"><h2>${icon('arrowDown', 18)}A pagar</h2><span class="muted small">${money(sum(exp.filter((i) => !i.settledAt), (i) => i.amount))} em aberto</span></div>
        ${exp.length ? `<div class="list">${exp.sort(sortOpen).map((i) => itemRow(i, today)).join('')}</div>` : emptyState('wallet', 'Nenhuma conta neste mês', 'Cadastre suas contas fixas uma vez e elas se repetem todo mês.', `<button type="button" class="btn btn-sm btn-primary" data-action="entry-new" data-kind="despesa">${icon('plus', 16)}Nova conta</button>`)}
      </section>
      <section class="section">
        <div class="section-head"><h2>${icon('arrowUp', 18)}A receber</h2><span class="muted small">${money(sum(inc.filter((i) => !i.settledAt), (i) => i.amount))} em aberto</span></div>
        ${inc.length ? `<div class="list">${inc.sort(sortOpen).map((i) => itemRow(i, today)).join('')}</div>` : emptyState('coins', 'Nenhuma receita neste mês', 'Salário, serviços extras pagos e trabalhos (TCC, IPM…) aparecem aqui.', `<button type="button" class="btn btn-sm btn-primary" data-action="entry-new" data-kind="receita">${icon('plus', 16)}Nova receita</button>`)}
      </section>
    </div>
    <div class="two-col">
      <section class="card chart-card"><h3>Para onde vai o dinheiro</h3>${hbars(byCat, { format: money, empty: 'Sem despesas neste mês.' })}</section>
      <section class="card chart-card"><h3>Fontes de renda</h3>${hbars(bySrc, { format: money, empty: 'Sem receitas neste mês.' })}</section>
    </div>`;
}

function lancamentosTab(state, sm, today) {
  let items = sm.items;
  if (kindFilter === 'aberto') items = items.filter((i) => !i.settledAt);
  else if (kindFilter) items = items.filter((i) => i.kind === kindFilter);
  return `
    ${chips([['receita', 'Receitas'], ['despesa', 'Despesas'], ['aberto', 'Em aberto']], kindFilter || null, 'fin-kind', { all: 'Todos' })}
    ${items.length ? `<div class="list">${items.map((i) => itemRow(i, today)).join('')}</div>` : emptyState('wallet', 'Nenhum lançamento', 'Use os botões acima para adicionar.')}`;
}

function cartoesTab(state, M, today) {
  if (!state.cards.length) {
    return emptyState('card', 'Nenhum cartão cadastrado', 'Cadastre seus cartões com o dia de fechamento e de vencimento. As compras parceladas vão sozinhas para as faturas certas.',
      `<button type="button" class="btn btn-primary btn-sm" data-action="card-new">${icon('plus', 16)}Adicionar cartão</button>`);
  }
  return `
    <div class="toolbar"><button type="button" class="btn btn-primary btn-sm" data-action="entry-new" data-card="1">${icon('plus', 16)}Compra no cartão</button>
      <button type="button" class="btn btn-sm" data-action="card-new">${icon('card', 16)}Novo cartão</button></div>
    <div class="cards-grid">${state.cards.map((c) => {
      const inv = invoice(state, c, M);
      const next = invoice(state, c, addMonths(M, 1));
      const used = cardUsed(state, c, today);
      const pct = c.limit ? Math.min(100, Math.round((used / c.limit) * 100)) : null;
      const late = !inv.paidAt && inv.total > 0 && inv.dueDate < today;
      return `<article class="credit-card card" style="--c: var(--c${c.color || 7})">
        <div class="cc-top"><strong>${icon('card', 18)}${esc(c.name)}</strong>
          <button type="button" class="icon-btn" data-action="card-edit" data-id="${esc(c.id)}" aria-label="Editar cartão">${icon('edit', 16)}</button></div>
        <button type="button" class="cc-invoice" data-action="fin-invoice" data-card="${esc(c.id)}" data-month="${esc(M)}">
          <span class="muted small">Fatura de ${fmtDM(inv.dueDate)}</span>
          <strong class="big">${money(inv.total)}</strong>
          <span class="row-meta">
            ${inv.paidAt ? `<span class="pill pill-good">${icon('check', 13)}Paga</span>` : late ? `<span class="pill pill-critical">${icon('alert', 13)}Vencida</span>` : `<span class="meta">Fecha ${fmtDM(inv.closingDate)} · vence ${relDays(inv.dueDate, today)}</span>`}
            <span class="meta">${plural(inv.items.length, 'compra', 'compras')}</span>
          </span>
        </button>
        <div class="cc-next muted small">Próxima fatura: ${money(next.total)}</div>
        ${pct !== null ? `<div class="meter" role="meter" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Limite usado">
          <span class="meter-fill ${pct > 85 ? 'high' : pct > 60 ? 'mid' : ''}" style="width:${pct}%"></span></div>
          <div class="muted small">Limite usado: ${money(used)} de ${money(c.limit)} (${pct}%)</div>` : ''}
      </article>`;
    }).join('')}</div>`;
}

export default {
  id: 'financas',
  title: 'Finanças',
  enter(params) {
    if (params.get('tab')) tab = params.get('tab');
  },
  render({ state, today }) {
    month = month || monthOf(today);
    const sm = monthSummary(state, month);
    const late = openItems(state, today, 0).filter((i) => i.date < today);
    const lateExp = late.filter((i) => i.kind === 'despesa');
    let body = '';
    if (tab === 'lancamentos') body = lancamentosTab(state, sm, today);
    else if (tab === 'cartoes') body = cartoesTab(state, month, today);
    else body = resumoTab(state, month, sm, today);
    const balance = sm.balance;
    return `
      <header class="page-head">
        <h1>Finanças</h1>
        <div class="head-actions">
          <button type="button" class="btn btn-sm" data-action="entry-new" data-kind="receita">${icon('plus', 16)}Receita</button>
          <button type="button" class="btn btn-primary btn-sm" data-action="entry-new" data-kind="despesa">${icon('plus', 16)}Despesa</button>
        </div>
      </header>
      <div class="toolbar">${monthNav(month, 'fin-month')}</div>
      <div class="tiles">
        ${tile('Entradas', money(sm.incomeExpected), { ic: 'arrowUp', sub: `${money(sm.incomeDone)} recebido` })}
        ${tile('Saídas', money(sm.expenseExpected), { ic: 'arrowDown', sub: `${money(sm.expenseDone)} pago` })}
        ${tile('Saldo previsto', `${balance < 0 ? '−' : ''}${money(Math.abs(balance))}`, { ic: 'wallet', sub: balance < 0 ? 'Gastos acima das entradas' : 'Entradas menos saídas', tone: balance < 0 ? 'tone-critical' : 'tone-good' })}
        ${tile('Contas atrasadas', String(lateExp.length), { ic: 'alert', sub: lateExp.length ? money(sum(lateExp, (i) => i.amount)) : 'Tudo em dia', tone: lateExp.length ? 'tone-critical' : '' })}
      </div>
      ${tabs([['resumo', 'Resumo'], ['lancamentos', 'Lançamentos'], ['cartoes', 'Cartões']], tab, 'fin-tab')}
      <div class="view-body">${body}</div>`;
  },
  actions: {
    'fin-tab'(btn) {
      tab = btn.dataset.value;
      history.replaceState(null, '', '#/financas');
      rerender();
    },
    'fin-month'(btn) {
      const step = Number(btn.dataset.step);
      month = step === 0 ? monthOf(todayKey()) : addMonths(month, step);
      rerender();
    },
    'fin-kind'(btn) {
      kindFilter = btn.dataset.value;
      rerender();
    },
    'fin-invoice'(btn) {
      openInvoice(btn.dataset.card, btn.dataset.month);
    },
  },
};
