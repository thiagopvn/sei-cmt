// Finanças: lançamentos (receitas/despesas), contas recorrentes, cartões e faturas,
// e os valores a receber de serviços pagos e trabalhos (TCC, IPM…).
//
// entry = { id, kind: 'receita'|'despesa', description, amount, date, category,
//           recurrence: null|'monthly'|'yearly', until: 'YYYY-MM'|null,
//           settled: { [occKey]: 'YYYY-MM-DD' }, amounts: { [occKey]: number },
//           cardId: null|id, installments: n, notes }
// card  = { id, name, closingDay, dueDay, limit, color, paid: { 'YYYY-MM': 'YYYY-MM-DD' } }

import { addMonths, dateInMonth, fromKey, monthDiff, monthOf, addDays } from '../lib/dates.js';
import { sum } from '../lib/util.js';
import { expectedPayDate, ownersOf } from './shifts.js';

export const SERVICE_INCOME_CATEGORY = 'Serviço extra';
export const TASK_INCOME_CATEGORY = 'Trabalhos (TCC, IPM…)';

/** Quando espero receber por uma tarefa remunerada: previsão, prazo, conclusão ou criação. */
export function taskPayDate(t) {
  return t.payDate || t.due || (t.doneAt ? t.doneAt.slice(0, 10) : null) || (t.createdAt ? String(t.createdAt).slice(0, 10) : null);
}

/** Tarefa remunerada: null (não é) | 'recebido' | 'atrasado' | 'pendente'. */
export function taskPayStatus(t, today) {
  if (!(Number(t.value) > 0)) return null;
  if (t.receivedAt) return 'recebido';
  return t.payDate && t.payDate < today ? 'atrasado' : 'pendente';
}

export function entryOccurrences(entry, M) {
  if (entry.cardId || !entry.date) return [];
  const start = monthOf(entry.date);
  if (!entry.recurrence) return start === M ? [{ key: 'once', date: entry.date }] : [];
  if (M < start || (entry.until && M > entry.until)) return [];
  if (entry.recurrence === 'yearly' && entry.date.slice(5, 7) !== M.slice(5, 7)) return [];
  return [{ key: M, date: dateInMonth(M, fromKey(entry.date).getDate()) }];
}

export const occAmount = (entry, key) => Number(entry.amounts?.[key] ?? entry.amount) || 0;

/** Mês (de vencimento) da fatura em que cai uma compra feita em `purchaseDate`. */
export function invoiceDueMonth(card, purchaseDate) {
  const day = fromKey(purchaseDate).getDate();
  const closeM = day >= Number(card.closingDay) ? addMonths(monthOf(purchaseDate), 1) : monthOf(purchaseDate);
  return Number(card.dueDay) > Number(card.closingDay) ? closeM : addMonths(closeM, 1);
}

function installmentValue(total, n, i) {
  const base = Math.floor((total * 100) / n) / 100;
  return i === n - 1 ? Math.round((total - base * (n - 1)) * 100) / 100 : base;
}

export function invoice(state, card, M) {
  const items = [];
  for (const e of state.entries) {
    if (e.cardId !== card.id || !e.date) continue;
    const n = Math.max(1, Number(e.installments) || 1);
    const i = monthDiff(invoiceDueMonth(card, e.date), M);
    if (i < 0 || i >= n) continue;
    items.push({ entry: e, index: i + 1, count: n, amount: installmentValue(Number(e.amount) || 0, n, i) });
  }
  const closeM = Number(card.dueDay) > Number(card.closingDay) ? M : addMonths(M, -1);
  return {
    card,
    month: M,
    dueDate: dateInMonth(M, Number(card.dueDay) || 1),
    closingDate: dateInMonth(closeM, Number(card.closingDay) || 1),
    items: items.sort((a, b) => a.entry.date.localeCompare(b.entry.date)),
    total: Math.round(sum(items, (x) => x.amount) * 100) / 100,
    paidAt: card.paid?.[M] || null,
  };
}

/** Quanto do limite está comprometido (parcelas de faturas ainda não pagas). */
export function cardUsed(state, card, today) {
  const M = monthOf(today);
  let used = 0;
  for (let i = -36; i <= 24; i++) {
    const inv = invoice(state, card, addMonths(M, i));
    if (!inv.paidAt) used += inv.total;
  }
  return Math.round(used * 100) / 100;
}

/**
 * Todos os itens financeiros de um mês, de todas as fontes.
 * item = { key, kind, source, title, date, amount, settledAt, category, ref }
 */
export function ledger(state, M) {
  const items = [];
  for (const e of state.entries) {
    for (const o of entryOccurrences(e, M)) {
      items.push({
        key: `e:${e.id}:${o.key}`,
        kind: e.kind,
        source: 'entry',
        title: e.description,
        date: o.date,
        amount: occAmount(e, o.key),
        settledAt: e.settled?.[o.key] || null,
        category: e.category || 'Outros',
        recurring: e.recurrence || null,
        ref: { entryId: e.id, occKey: o.key },
      });
    }
  }
  for (const s of state.services) {
    if (!s.paid) continue;
    const date = s.receivedAt || expectedPayDate(s, state.settings);
    if (monthOf(date) !== M) continue;
    items.push({
      key: `s:${s.id}`,
      kind: 'receita',
      source: 'service',
      title: `Serviço extra de ${s.date.slice(8, 10)}/${s.date.slice(5, 7)}${s.unit ? ` · ${s.unit}` : ''}`,
      date,
      amount: Number(s.value) || 0,
      settledAt: s.receivedAt || null,
      category: SERVICE_INCOME_CATEGORY,
      payers: ownersOf(s),
      ref: { serviceId: s.id },
    });
  }
  for (const t of state.tasks) {
    if (!(Number(t.value) > 0)) continue;
    const date = t.receivedAt || taskPayDate(t);
    if (!date || monthOf(date) !== M) continue;
    items.push({
      key: `t:${t.id}`,
      kind: 'receita',
      source: 'task',
      title: t.title,
      date,
      amount: Number(t.value) || 0,
      settledAt: t.receivedAt || null,
      category: TASK_INCOME_CATEGORY,
      payers: ownersOf({ owner: t.payer }),
      ref: { taskId: t.id },
    });
  }
  for (const c of state.cards) {
    const inv = invoice(state, c, M);
    if (inv.total <= 0) continue;
    items.push({
      key: `c:${c.id}:${M}`,
      kind: 'despesa',
      source: 'invoice',
      title: `Fatura ${c.name}`,
      date: inv.dueDate,
      amount: inv.total,
      settledAt: inv.paidAt,
      category: 'Cartão de crédito',
      ref: { cardId: c.id, month: M },
    });
  }
  return items.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

export function monthSummary(state, M) {
  const items = ledger(state, M);
  const inc = items.filter((i) => i.kind === 'receita');
  const exp = items.filter((i) => i.kind === 'despesa');
  const r = (n) => Math.round(n * 100) / 100;
  return {
    items,
    incomeExpected: r(sum(inc, (i) => i.amount)),
    incomeDone: r(sum(inc.filter((i) => i.settledAt), (i) => i.amount)),
    expenseExpected: r(sum(exp, (i) => i.amount)),
    expenseDone: r(sum(exp.filter((i) => i.settledAt), (i) => i.amount)),
    get balance() { return r(this.incomeExpected - this.expenseExpected); },
  };
}

/** Itens em aberto (não pagos/recebidos) de meses anteriores até `days` dias à frente. */
export function openItems(state, today, days = 7, lookbackMonths = 6) {
  const M = monthOf(today);
  const limit = addDays(today, days);
  const out = [];
  for (let i = -lookbackMonths; i <= 2; i++) {
    for (const it of ledger(state, addMonths(M, i))) {
      if (!it.settledAt && it.date <= limit) out.push(it);
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Despesas do mês por categoria (compras no cartão entram pela categoria da compra). */
export function expensesByCategory(state, M) {
  const map = new Map();
  const add = (cat, v) => map.set(cat || 'Outros', (map.get(cat || 'Outros') || 0) + v);
  for (const e of state.entries) {
    if (e.kind !== 'despesa') continue;
    for (const o of entryOccurrences(e, M)) add(e.category, occAmount(e, o.key));
  }
  for (const c of state.cards) for (const it of invoice(state, c, M).items) add(it.entry.category, it.amount);
  return [...map.entries()].map(([category, value]) => ({ category, value: Math.round(value * 100) / 100 }))
    .filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
}

export function incomeBySource(state, M) {
  const map = new Map();
  for (const it of ledger(state, M)) {
    if (it.kind !== 'receita') continue;
    map.set(it.category, (map.get(it.category) || 0) + it.amount);
  }
  return [...map.entries()].map(([category, value]) => ({ category, value: Math.round(value * 100) / 100 }))
    .sort((a, b) => b.value - a.value);
}

/** Marca/desmarca um item do ledger como pago/recebido (muta o estado). */
export function setSettled(state, item, dateKey) {
  const { ref } = item;
  if (item.source === 'entry') {
    const e = state.entries.find((x) => x.id === ref.entryId);
    if (!e) return;
    e.settled = e.settled || {};
    if (dateKey) e.settled[ref.occKey] = dateKey; else delete e.settled[ref.occKey];
  } else if (item.source === 'service') {
    const s = state.services.find((x) => x.id === ref.serviceId);
    if (s) s.receivedAt = dateKey || null;
  } else if (item.source === 'task') {
    const t = state.tasks.find((x) => x.id === ref.taskId);
    if (t) t.receivedAt = dateKey || null;
  } else if (item.source === 'invoice') {
    const c = state.cards.find((x) => x.id === ref.cardId);
    if (!c) return;
    c.paid = c.paid || {};
    if (dateKey) c.paid[ref.month] = dateKey; else delete c.paid[ref.month];
  }
}
