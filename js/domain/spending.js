// Raio-x dos gastos: fatura aberta de cada cartão, ritmo e projeção, categorias que mais pesam,
// assinaturas, corridas por app, envios (Pix/PicPay) x dinheiro dos extras e parcelas futuras.

import { addDays, addMonths, diffDays, fmtDM } from '../lib/dates.js';
import { normalize, sum, money } from '../lib/util.js';
import { invoice, openInvoiceMonth } from './finance.js';
import { CAT } from './categories.js';

const r2 = (n) => Math.round(n * 100) / 100;
const AI_RE = /chatgpt|openai|perplexity|google g1|gemini|claude|anthropic|copilot|juridico ai/;

function groupBy(list, key, val) {
  const m = new Map();
  for (const x of list) {
    const k = key(x);
    const g = m.get(k) || { key: k, total: 0, count: 0, items: [] };
    g.total = r2(g.total + val(x));
    g.count++;
    g.items.push(x);
    m.set(k, g);
  }
  return [...m.values()].sort((a, b) => b.total - a.total);
}

/** Extras (serviços pagos) recebidos entre duas datas. */
export function extrasReceived(state, from, to) {
  return (state.services || []).filter((s) => s.paid && s.receivedAt && s.receivedAt >= from && s.receivedAt <= to);
}

/**
 * Análise da fatura aberta de um cartão.
 * Retorna null se a fatura não tem compras.
 */
export function cardInsights(state, card, today) {
  const M = openInvoiceMonth(card, today);
  const inv = invoice(state, card, M);
  if (!inv.items.length) return null;
  const prevClose = invoice(state, card, addMonths(M, -1)).closingDate;
  const cycleDays = Math.max(1, diffDays(prevClose, inv.closingDate));
  const elapsed = Math.min(cycleDays, Math.max(1, diffDays(prevClose, today) + 1));
  const items = inv.items.filter((it) => it.amount > 0);
  const installments = items.filter((it) => it.count > 1);
  const oneShot = items.filter((it) => it.count === 1);
  // Projeção até o fechamento: o que é fixo ou pontual entra uma vez (parcelas, assinaturas, compras
  // grandes, envios); só o gasto do dia a dia é projetado pelo ritmo diário.
  const once = (it) => it.amount >= 500 || [CAT.assinaturas, CAT.envios].includes(it.entry.category);
  const daily = oneShot.filter((it) => !once(it));
  const perDay = r2(sum(daily, (it) => it.amount) / elapsed);
  const projection = r2(sum(installments, (it) => it.amount) + sum(oneShot.filter(once), (it) => it.amount) + perDay * cycleDays);
  const byCat = groupBy(items, (it) => it.entry.category || 'Outros', (it) => it.amount);
  const cat = (c) => byCat.find((g) => g.key === c) || { total: 0, count: 0, items: [] };

  const rides = cat(CAT.transporte);
  const subs = groupBy(cat(CAT.assinaturas).items, (it) => it.entry.description, (it) => it.amount);
  const ai = subs.filter((g) => AI_RE.test(normalize(g.key)));
  const envios = cat(CAT.envios);
  const biggestEnvio = [...envios.items].sort((a, b) => b.amount - a.amount)[0] || null;

  // Dinheiro dos extras: o que entrou de serviços pagos no ciclo (ou até 10 dias antes) x o que saiu em envios.
  const extras = extrasReceived(state, addDays(prevClose, -10), today);
  const extrasTotal = r2(sum(extras, (s) => s.value));

  // Parcelas que já estão contratadas para as próximas faturas.
  const ahead = [];
  for (let k = 1; k <= 12; k++) {
    const next = invoice(state, card, addMonths(M, k));
    const v = r2(sum(next.items.filter((it) => it.count > 1 && it.amount > 0), (it) => it.amount));
    if (v > 0) ahead.push({ month: addMonths(M, k), value: v, count: next.items.filter((it) => it.count > 1).length });
  }
  const top = oneShot.filter((it) => it.entry.category !== CAT.envios).sort((a, b) => b.amount - a.amount).slice(0, 3);
  return {
    card, month: M, invoice: inv, cycleDays, elapsed, perDay, projection, byCat,
    rides: { count: rides.count, total: rides.total, avg: rides.count ? r2(rides.total / rides.count) : 0, perDay: r2(rides.total / elapsed) },
    subs: { list: subs, total: r2(sum(subs, (g) => g.total)), ai, aiTotal: r2(sum(ai, (g) => g.total)) },
    envios: { count: envios.count, total: envios.total, biggest: biggestEnvio, share: inv.total ? Math.round((envios.total / inv.total) * 100) : 0 },
    extras: { list: extras, total: extrasTotal },
    installments: { count: installments.length, total: r2(sum(installments, (it) => it.amount)), ahead, aheadTotal: r2(sum(ahead, (a) => a.value)) },
    top,
  };
}

/** Dicas em frases curtas, das mais úteis para as menos. */
export function insightTips(x) {
  const tips = [];
  if (x.envios.count) {
    const big = x.envios.biggest;
    let text = `${x.envios.count} envios por PicPay/Pix no cartão somam ${money(x.envios.total)} (${x.envios.share}% da fatura)`;
    if (big) text += `; o maior foi ${money(big.amount)} em ${fmtDM(big.entry.date)}`;
    if (x.extras.total > 0) {
      const pct = Math.round((x.envios.total / x.extras.total) * 100);
      text += `. Você recebeu ${money(x.extras.total)} de extras no período — os envios equivalem a ${pct}% desse dinheiro.`;
    } else text += '. Marque os extras como recebidos para ver quanto do dinheiro dos serviços foi enviado.';
    tips.push({ icon: 'swap', tone: 'warn', title: 'Dinheiro enviado pelo cartão', text: `${text} Enviar pelo cartão costuma cobrar taxa; pelo saldo da conta sai sem taxa e não pesa na fatura.` });
  }
  if (x.rides.count >= 5) {
    tips.push({ icon: 'mapPin', tone: '', title: 'Transporte por app', text: `${x.rides.count} corridas = ${money(x.rides.total)} (média ${money(x.rides.avg)} por corrida, ${money(x.rides.perDay)} por dia). Juntar trajetos ou combinar carona em dias de serviço reduz bem esse valor.` });
  }
  if (x.subs.list.length) {
    let text = `${x.subs.list.length} assinaturas somam ${money(x.subs.total)} por mês: ${x.subs.list.slice(0, 5).map((g) => `${g.key} ${money(g.total)}`).join(', ')}${x.subs.list.length > 5 ? ' e outras' : ''}.`;
    if (x.subs.ai.length >= 2) text += ` ${x.subs.ai.length} são de inteligência artificial (${money(x.subs.aiTotal)}/mês) — ficar com uma ou duas já economiza.`;
    tips.push({ icon: 'repeat', tone: x.subs.ai.length >= 2 ? 'warn' : '', title: 'Assinaturas', text });
  }
  if (x.installments.count) {
    const next = x.installments.ahead.slice(0, 3).map((a) => `${a.month.slice(5)}/${a.month.slice(2, 4)}: ${money(a.value)}`).join(' · ');
    tips.push({ icon: 'card', tone: '', title: 'Parcelas', text: `${x.installments.count} parcelas nesta fatura (${money(x.installments.total)}). Já comprometido nas próximas: ${money(x.installments.aheadTotal)}${next ? ` (${next}${x.installments.ahead.length > 3 ? '…' : ''})` : ''}.` });
  }
  if (x.top.length) {
    tips.push({ icon: 'target', tone: '', title: 'Maiores compras', text: x.top.map((it) => `${it.entry.description} ${money(it.amount)} (${fmtDM(it.entry.date)})`).join(' · ') });
  }
  if (x.elapsed >= 5 && x.elapsed < x.cycleDays && x.projection > x.invoice.total * 1.05) {
    tips.unshift({ icon: 'alert', tone: 'warn', title: 'Projeção da fatura', text: `Se o gasto do dia a dia continuar em ${money(x.perDay)} por dia, esta fatura fecha em torno de ${money(x.projection)} em ${fmtDM(x.invoice.closingDate)} (já conta parcelas, assinaturas e as compras grandes uma vez só).` });
  }
  return tips;
}
