// Importação de extratos e faturas (CSV) sem duplicar valores.
//
// Formatos reconhecidos:
//   • Fatura de cartão (ex.: Nubank "date,title,amount"): positivo = compra; negativo = pagamento/estorno.
//   • Extrato de conta (ex.: Nubank "Data,Valor,Identificador,Descrição"): negativo = saída.
//   • Genérico: colunas de data, descrição e valor (vírgula ou ponto e vírgula).
//
// Regras para não duplicar:
//   • Cada linha ganha uma chave estável: data + estabelecimento + valor + nº da ocorrência no arquivo
//     (duas compras iguais no mesmo dia continuam sendo duas). Reimportar o mesmo arquivo — ou uma
//     versão mais nova da mesma fatura — só traz o que ainda não existe.
//   • Parcelas ("Parcela 3/12") viram uma compra parcelada; a chave aponta a fatura da 1ª parcela,
//     então a "Parcela 4/12" do mês seguinte é reconhecida como a mesma compra.
//   • Estorno (o valor vai e volta) anula a compra correspondente: nenhum dos dois entra na fatura.
//   • "Pagamento recebido" não é gasto: vira pagamento da fatura (anterior ou adiantamento).

import { addMonths, dateInMonth, isValidKey } from '../lib/dates.js';
import { normalize, sum } from '../lib/util.js';

export const INSTALLMENT_RE = /\s*-?\s*parcela\s+(\d{1,2})\s*\/\s*(\d{1,2})\s*$/i;
const PAYMENT_RE = /^(pagamento (recebido|efetuado|de fatura|da fatura|fatura)|pagto\.? fatura|pgto\.? fatura)/i;
const REFUND_RE = /^(estorno|cr[eé]dito|devolu[cç][aã]o|cancelamento|reembolso)(\s+(de|do|da))?\s*/i;
const BILL_PAYMENT_RE = /(pagamento|pgto|pagto)\s+(de\s+|da\s+)?fatura|fatura (do )?cart/i;

const round2 = (n) => Math.round(n * 100) / 100;

/** Divide uma linha de CSV respeitando aspas ("1.552,30" tem vírgula dentro). */
function splitLine(line, sep) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseCsv(text) {
  const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const first = lines[0];
  const sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
  return lines.map((l) => splitLine(l, sep));
}

/** "1.552,30" · "- 12,00" · "-50.00" · "R$ 1.234,56" · "(10,00)" → número (NaN se inválido). */
export function parseAmount(raw) {
  let s = String(raw ?? '').replace(/\s+/g, '').replace(/R\$/gi, '');
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1); } else if (s.startsWith('+')) s = s.slice(1);
  if (s.endsWith('-')) { neg = !neg; s = s.slice(0, -1); }
  const lc = s.lastIndexOf(',');
  const ld = s.lastIndexOf('.');
  if (lc > ld) s = s.replace(/\./g, '').replace(',', '.');
  else if (ld > lc && lc >= 0) s = s.replace(/,/g, '');
  else if (ld >= 0 && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
  const n = Number(s);
  return neg ? -n : n;
}

/** "2026-10-11" · "11/10/2026" · "11/10/26" → "2026-10-11" (ou null). */
export function parseDate(raw) {
  const s = String(raw ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return isValidKey(`${m[1]}-${m[2]}-${m[3]}`) ? `${m[1]}-${m[2]}-${m[3]}` : null;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const y = m[3].length === 2 ? `20${m[3]}` : m[3];
  const k = `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return isValidKey(k) ? k : null;
}

/** Nome do estabelecimento sem "Parcela x/y", "Estorno de", aspas e acentos — para comparar. */
export function merchantKey(title) {
  return normalize(String(title || '').replace(INSTALLMENT_RE, '').replace(REFUND_RE, '').replace(/["“”']/g, ''))
    .replace(/\s+/g, ' ').trim();
}

/** Título limpo para exibir (sem o sufixo de parcela). */
export const cleanTitle = (title) => String(title || '').replace(INSTALLMENT_RE, '').trim();

/**
 * Lê o arquivo. Retorna { kind: 'card'|'account', tx: [{ date, title, out, extId }], dueDate, bad }
 * `out` > 0 = dinheiro saindo (gasto/compra); `out` < 0 = entrando (pagamento, estorno, receita).
 */
export function parseStatement(text, fileName = '') {
  const rows = parseCsv(text);
  if (!rows.length) return { kind: 'card', tx: [], dueDate: null, bad: 0 };
  const head = rows[0].map(normalize);
  const hasHeader = !parseDate(rows[0][0]) && head.some((h) => /data|date|valor|amount|descri|title/.test(h));
  const find = (re, fallback) => {
    const i = head.findIndex((h) => re.test(h));
    return hasHeader && i >= 0 ? i : fallback;
  };
  const iDate = find(/^(date|data)/, 0);
  const iAmount = find(/^(amount|valor|value)/, 2);
  const iTitle = find(/title|descri|historico|estabelecimento|lancamento|memo/, iAmount === 1 ? 3 : 1);
  const iId = hasHeader ? head.findIndex((h) => /^identificador|^id$/.test(h)) : -1;
  // Fatura de cartão: positivo é compra. Extrato de conta (tem identificador ou "Valor" antes da descrição): negativo é saída.
  const kind = hasHeader && (iId >= 0 || /valor/.test(head[iAmount] || '')) && !head.includes('title') ? 'account' : 'card';
  const tx = [];
  let bad = 0;
  for (const r of rows.slice(hasHeader ? 1 : 0)) {
    const date = parseDate(r[iDate]);
    const amount = parseAmount(r[iAmount]);
    const title = String(r[iTitle] ?? '').trim();
    if (!date || !Number.isFinite(amount) || !title || amount === 0) { bad++; continue; }
    tx.push({ date, title, out: round2(kind === 'account' ? -amount : amount), extId: iId >= 0 ? r[iId] || null : null });
  }
  const m = String(fileName).match(/(\d{4})-(\d{2})-(\d{2})/);
  const dueDate = m && isValidKey(`${m[1]}-${m[2]}-${m[3]}`) ? `${m[1]}-${m[2]}-${m[3]}` : null;
  return { kind, tx, dueDate, bad };
}

/** Chaves já importadas (compras, parcelas, créditos e pagamentos). */
export function importedKeys(state) {
  const keys = new Set();
  for (const e of state.entries || []) {
    if (e.importKey) keys.add(e.importKey);
    if (e.refundKey) keys.add(e.refundKey);
  }
  for (const c of state.cards || []) for (const p of c.payments || []) if (p.importKey) keys.add(p.importKey);
  return keys;
}

/**
 * Analisa antes de importar (não muda nada).
 * opts: { invoiceMonth: 'YYYY-MM' (mês de vencimento da fatura), dueDay, cardId, state, categorize }
 * Retorna as linhas classificadas e os totais da fatura.
 */
export function analyzeStatement(parsed, { invoiceMonth = null, dueDay = null, cardId = null, state = { entries: [], cards: [] }, categorize = () => 'Outros' } = {}) {
  const existing = importedKeys(state);
  const occ = new Map();
  const rows = parsed.tx.map((t, i) => {
    const inst = parsed.kind === 'card' ? t.title.match(INSTALLMENT_RE) : null;
    const mk = merchantKey(t.title);
    const cents = Math.round(Math.abs(t.out) * 100);
    const sign = t.out < 0 ? '-' : '';
    let base;
    if (t.extId) base = `id|${t.extId}`;
    // A chave não depende do id do cartão (um cartão novo só ganha id ao salvar).
    else if (inst && invoiceMonth) base = `parc|${mk}|${cents}|${inst[2]}|${addMonths(invoiceMonth, -(Number(inst[1]) - 1))}`;
    else base = `${parsed.kind}|${t.date}|${mk}|${sign}${cents}`;
    const n = (occ.get(base) || 0) + 1;
    occ.set(base, n);
    return {
      ...t, i, mk, cents, title: cleanTitle(t.title), raw: t.title,
      inst: inst ? { k: Number(inst[1]), n: Number(inst[2]) } : null,
      key: t.extId ? base : `${base}|${n}`,
      type: null, dup: false, category: null, pairWith: null,
    };
  });

  // 1) Pagamentos de fatura (cartão) e transferências para pagar fatura (conta) não são gastos.
  for (const r of rows) {
    if (parsed.kind === 'card' && r.out < 0 && PAYMENT_RE.test(r.raw)) r.type = 'payment';
    if (parsed.kind === 'account' && r.out > 0 && BILL_PAYMENT_RE.test(r.raw)) r.type = 'billpay';
  }
  // 2) Estornos: o valor vai e volta — casa o crédito com a compra de mesmo estabelecimento e valor.
  const refundable = (r) => !r.type && r.out > 0;
  for (const cr of rows.filter((r) => !r.type && r.out < 0)) {
    const named = REFUND_RE.test(cr.raw);
    const match = rows.find((r) => refundable(r) && !r.pairWith && r.cents === cr.cents && r.mk === cr.mk && r.date <= cr.date);
    if (match) {
      match.type = 'refunded';
      match.pairWith = cr.i;
      cr.type = 'refund';
      cr.pairWith = match.i;
      continue;
    }
    // Estorno de uma compra que já tinha sido importada antes.
    const old = (state.entries || []).find((e) => e.importKey && !e.refundedAt && e.merchant === cr.mk
      && Math.round(Math.abs(Number(e.amount) / Math.max(1, Number(e.installments) || 1)) * 100) === cr.cents && (!cardId || e.cardId === cardId));
    if (old) {
      cr.type = 'refundOld';
      cr.refundEntryId = old.id;
      continue;
    }
    cr.type = parsed.kind === 'card' ? 'credit' : named ? 'credit' : 'income';
  }
  // 3) O resto: compras/parcelas (cartão), despesas/receitas (conta).
  for (const r of rows) {
    if (r.type) continue;
    if (parsed.kind === 'card') r.type = r.inst ? 'installment' : 'purchase';
    else r.type = r.out > 0 ? 'expense' : 'income';
  }
  for (const r of rows) {
    r.dup = existing.has(r.key);
    if (['purchase', 'installment', 'expense', 'credit'].includes(r.type)) r.category = categorize(r);
  }

  // Totais da fatura (cartão): tudo o que está no arquivo, já importado ou não.
  const charges = rows.filter((r) => r.type === 'purchase' || r.type === 'installment');
  const credits = rows.filter((r) => r.type === 'credit' || r.type === 'refundOld');
  const payments = rows.filter((r) => r.type === 'payment');
  const purchasesTotal = round2(sum(charges, (r) => r.out));
  const creditsTotal = round2(sum(credits, (r) => -r.out));
  // O pagamento da fatura anterior costuma aparecer no começo do ciclo: o maior pagamento feito até o
  // vencimento anterior, se for relevante. O usuário pode corrigir na prévia.
  let prevPayment = null;
  if (invoiceMonth && dueDay && payments.length) {
    const prevDue = dateInMonth(addMonths(invoiceMonth, -1), Number(dueDay));
    const cand = payments.filter((p) => p.date <= prevDue).sort((a, b) => a.out - b.out)[0];
    if (cand && -cand.out >= Math.max(500, purchasesTotal * 0.25)) prevPayment = cand;
  }
  for (const p of payments) p.prev = p === prevPayment;
  const advances = round2(sum(payments.filter((p) => !p.prev), (p) => -p.out));
  return {
    kind: parsed.kind,
    rows,
    totals: {
      purchases: purchasesTotal,
      credits: creditsTotal,
      refunded: round2(sum(rows.filter((r) => r.type === 'refunded'), (r) => r.out)),
      payments: round2(sum(payments, (p) => -p.out)),
      prevPayment: prevPayment ? round2(-prevPayment.out) : 0,
      advances,
      invoice: round2(purchasesTotal - creditsTotal),
      open: round2(purchasesTotal - creditsTotal - advances),
      newCount: rows.filter((r) => !r.dup && !['refunded', 'refund'].includes(r.type)).length,
      dupCount: rows.filter((r) => r.dup).length,
    },
  };
}

/** Recalcula os totais quando o usuário muda qual pagamento é da fatura anterior. */
export function recomputeTotals(an) {
  const payments = an.rows.filter((r) => r.type === 'payment');
  const advances = round2(sum(payments.filter((p) => !p.prev), (p) => -p.out));
  const prev = payments.find((p) => p.prev);
  an.totals.advances = advances;
  an.totals.prevPayment = prev ? round2(-prev.out) : 0;
  an.totals.open = round2(an.totals.invoice - advances);
  return an;
}

const INCOME_RE = [[/salario|soldo|vencimento|pagamento de salario|cbmerj|governo do estado|estado do rio/, 'Salário']];

/**
 * Grava a importação no estado (rascunho do store). Pula o que já existe e os pares de estorno.
 * opts: { cardId, newCard: { name, closingDay, dueDay }, invoiceMonth, uid, now }
 * Retorna { entries, payments, refunds, cardId }.
 */
export function applyImport(s, an, { cardId = null, newCard = null, invoiceMonth = null, uid, now = new Date().toISOString() }) {
  const done = { entries: 0, payments: 0, refunds: 0, cardId };
  let card = an.kind === 'card' ? s.cards.find((c) => c.id === cardId) || null : null;
  if (an.kind === 'card' && !card && newCard) {
    card = { id: uid(), limit: 0, color: 7, paid: {}, payments: [], ...newCard };
    s.cards.push(card);
  }
  if (card) {
    card.payments = card.payments || [];
    card.paid = card.paid || {};
    done.cardId = card.id;
  }
  const base = { settled: {}, amounts: {}, notes: '', createdAt: now, imported: true };
  for (const r of an.rows) {
    if (r.dup) continue;
    if (card && (r.type === 'purchase' || r.type === 'installment' || r.type === 'credit')) {
      const n = r.inst ? r.inst.n : 1;
      s.entries.push({
        id: uid(), ...base, kind: 'despesa', description: r.title, amount: round2(r.out * n), date: r.date,
        category: r.type === 'credit' ? 'Estornos e créditos' : r.category, cardId: card.id, installments: n,
        // A fatura vem do arquivo (não depende do dia de fechamento); parcela k/n começou k-1 meses antes.
        invoiceMonth: invoiceMonth ? addMonths(invoiceMonth, -((r.inst?.k || 1) - 1)) : null,
        sinceMonth: invoiceMonth || null,
        importKey: r.key, merchant: r.mk,
      });
      done.entries++;
    } else if (card && r.type === 'payment') {
      const month = r.prev && invoiceMonth ? addMonths(invoiceMonth, -1) : invoiceMonth;
      card.payments.push({ id: uid(), date: r.date, amount: round2(-r.out), month, importKey: r.key });
      if (r.prev && month && !card.paid[month]) card.paid[month] = r.date;
      done.payments++;
    } else if (r.type === 'refundOld') {
      const e = s.entries.find((x) => x.id === r.refundEntryId);
      if (e && !e.refundedAt) {
        e.refundedAt = r.date;
        e.refundKey = r.key;
        done.refunds++;
      }
    } else if (an.kind === 'account' && (r.type === 'expense' || r.type === 'income' || r.type === 'credit')) {
      const income = r.out < 0;
      const t = normalize(r.raw);
      s.entries.push({
        id: uid(), ...base, kind: income ? 'receita' : 'despesa', description: r.title, amount: round2(Math.abs(r.out)), date: r.date,
        category: income ? (INCOME_RE.find(([re]) => re.test(t))?.[1] || 'Outros') : r.category, cardId: null, installments: 1,
        settled: { once: r.date }, importKey: r.key, merchant: r.mk,
      });
      done.entries++;
    }
  }
  return done;
}
