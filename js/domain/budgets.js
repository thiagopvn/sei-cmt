// Limites de gasto por categoria, por mês (ex.: Transporte por app até R$ 400).
//
// Gasto do mês = lançamentos fora do cartão no mês + compras do cartão feitas no mês.
// As compras de um mês caem na fatura que vence no mês seguinte, então o cartão entra pelo
// ciclo (fatura de M+1), e não pela data de vencimento.

import { addMonths } from '../lib/dates.js';
import { expensesByCategory } from './finance.js';

const r2 = (n) => Math.round(n * 100) / 100;

/** Map categoria → gasto do mês (mesma base do gráfico "Para onde vai o dinheiro"). */
export function spentByCategory(state, M) {
  return new Map(expensesByCategory(state, M).map((x) => [x.category, x.value]));
}

/**
 * Situação de cada limite no mês: { category, limit, spent, pct, left, level: 'ok'|'near'|'over' }.
 * Mais apertados primeiro.
 */
export function budgetStatus(state, M) {
  const spent = spentByCategory(state, M);
  return (state.settings?.budgets || []).filter((b) => Number(b.v) > 0).map((b) => {
    const s = spent.get(b.c) || 0;
    const pct = Math.round((s / b.v) * 100);
    return { category: b.c, limit: b.v, spent: s, pct, left: r2(b.v - s), level: pct >= 100 ? 'over' : pct >= 80 ? 'near' : 'ok' };
  }).sort((a, b) => b.pct - a.pct);
}

/** Média de gasto dos últimos `n` meses (sem contar o mês M) — ajuda a escolher o limite. */
export function averageSpent(state, M, category, n = 3) {
  let total = 0;
  for (let i = 1; i <= n; i++) total += spentByCategory(state, addMonths(M, -i)).get(category) || 0;
  return r2(total / n);
}
