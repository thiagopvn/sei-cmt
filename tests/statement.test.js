// Importação de fatura/extrato: sem duplicar, com estornos, parcelas e pagamentos (dados fictícios).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState } from '../js/store.js';
import { parseAmount, parseDate, parseStatement, analyzeStatement, applyImport } from '../js/domain/statement.js';
import { guessCategory } from '../js/domain/categories.js';
import { invoice } from '../js/domain/finance.js';
import { cardInsights, insightTips } from '../js/domain/spending.js';

let n = 0;
const uid = () => `id${++n}`;
const cat = (r) => guessCategory(r);

const FATURA_NOV = `date,title,amount
2026-10-11,Pagamento recebido,"- 100,00"
2026-10-10,Dl *Uberrides,"12,50"
2026-10-09,Picpay*Fulano,"17,59"
2026-10-09,Picpay*Fulano,"17,59"
2026-10-08,Loja Bonita,"50,00"
2026-10-09,"Estorno de ""Loja Bonita""","- 50,00"
2026-10-05,Mercado Central - Parcela 2/3,"100,00"
2026-10-04,Supermercado Bom Preco,"1.234,56"
2026-10-02,Netflix.Com,"55,90"
2026-10-01,Pagamento recebido,"- 3.000,00"
`;

test('valores e datas no formato brasileiro', () => {
  assert.equal(parseAmount('1.552,30'), 1552.3);
  assert.equal(parseAmount('- 12,00'), -12);
  assert.equal(parseAmount('-50.00'), -50);
  assert.equal(parseAmount('R$ 1.234,56'), 1234.56);
  assert.equal(parseAmount('(10,00)'), -10);
  assert.ok(Number.isNaN(parseAmount('abc')));
  assert.equal(parseDate('11/10/2026'), '2026-10-11');
  assert.equal(parseDate('2026-10-11'), '2026-10-11');
  assert.equal(parseDate('31/02/2026'), null);
});

test('fatura: estorno anula a compra, cobranças iguais ficam, pagamento não é gasto', () => {
  const s = defaultState();
  const p = parseStatement(FATURA_NOV, 'Banco_2026-11-08.csv');
  assert.equal(p.kind, 'card');
  assert.equal(p.dueDate, '2026-11-08');
  const an = analyzeStatement(p, { invoiceMonth: '2026-11', dueDay: 8, state: s, categorize: cat });
  const types = Object.fromEntries(an.rows.map((r) => [`${r.date} ${r.title} ${r.out}`, r.type]));
  assert.equal(types['2026-10-08 Loja Bonita 50'], 'refunded');
  assert.equal(an.rows.filter((r) => r.raw === 'Picpay*Fulano' && r.type === 'purchase').length, 2);
  // Compras: 12,50 + 17,59×2 + 100 (parcela) + 1.234,56 + 55,90 = 1.438,14
  assert.equal(an.totals.purchases, 1438.14);
  // O pagamento grande no começo do ciclo é da fatura anterior; o de 100 abate desta.
  assert.equal(an.totals.prevPayment, 3000);
  assert.equal(an.totals.advances, 100);
  assert.equal(an.totals.open, 1338.14);

  applyImport(s, an, { newCard: { name: 'Banco', closingDay: 1, dueDay: 8 }, invoiceMonth: '2026-11', uid });
  const card = s.cards[0];
  const nov = invoice(s, card, '2026-11');
  assert.equal(nov.total, 1438.14);
  assert.equal(nov.balance, 1338.14);
  // O pagamento da fatura anterior fica registrado nela, sem marcá-la paga à força.
  assert.equal(card.paid['2026-10'], undefined);
  assert.deepEqual(card.payments.filter((x) => x.month === '2026-10').map((x) => x.amount), [3000]);
  // Parcela 2/3: a 3ª já aparece em dezembro; outubro (fatura não importada) não ganha cobrança.
  assert.equal(invoice(s, card, '2026-12').total, 100);
  assert.equal(invoice(s, card, '2026-10').total, 0);

  // Reimportar o mesmo arquivo: nada novo.
  const again = analyzeStatement(p, { invoiceMonth: '2026-11', dueDay: 8, cardId: card.id, state: s, categorize: cat });
  assert.equal(again.totals.newCount, 0);

  // Mês seguinte: a "Parcela 3/3" é a mesma compra; o estorno de uma compra antiga tira ela da fatura.
  const dez = parseStatement(`date,title,amount
2026-11-05,Mercado Central - Parcela 3/3,"100,00"
2026-11-06,Dl *Uberrides,"9,90"
2026-11-07,Estorno de Netflix.Com,"- 55,90"
`, 'Banco_2026-12-08.csv');
  const an2 = analyzeStatement(dez, { invoiceMonth: '2026-12', dueDay: 8, cardId: card.id, state: s, categorize: cat });
  assert.equal(an2.rows.find((r) => r.inst).dup, true);
  assert.equal(an2.rows.find((r) => r.out < 0).type, 'refundOld');
  applyImport(s, an2, { cardId: card.id, invoiceMonth: '2026-12', uid });
  assert.equal(invoice(s, card, '2026-12').total, 109.9);
  assert.equal(invoice(s, card, '2026-11').total, 1382.24);
});

test('extrato da conta: identificador evita duplicar e pagamento de fatura não conta como gasto', () => {
  const s = defaultState();
  const csv = `Data,Valor,Identificador,Descrição
05/10/2026,-80.00,a1,Compra no débito - Padaria
05/10/2026,2500.00,a2,Transferência recebida - Salario
06/10/2026,-1500.00,a3,Pagamento de fatura
`;
  const p = parseStatement(csv, 'extrato.csv');
  assert.equal(p.kind, 'account');
  const an = analyzeStatement(p, { state: s, categorize: cat });
  assert.deepEqual(an.rows.map((r) => r.type), ['expense', 'income', 'billpay']);
  applyImport(s, an, { uid });
  assert.equal(s.entries.length, 2);
  assert.equal(s.entries.find((e) => e.kind === 'receita').category, 'Salário');
  // Pagamento de fatura na conta não é gravado nem conta como novo: reimportar não oferece nada.
  assert.equal(analyzeStatement(p, { state: s, categorize: cat }).totals.newCount, 0);
});

test('categorias automáticas', () => {
  const g = (raw) => guessCategory({ raw, mk: raw.toLowerCase() });
  assert.equal(g('Dl*99 Ride'), 'Transporte por app');
  assert.equal(g('Pop 10out 07h20min'), 'Transporte por app');
  assert.equal(g('Amazonprimebr'), 'Assinaturas');
  assert.equal(g('Amazon'), 'Compras online');
  assert.equal(g('Ifd*Csb Drogarias'), 'Saúde');
  assert.equal(g('Ifd*Egx Burguer'), 'Delivery e restaurantes');
  assert.equal(g('Moda Mundial*Sheincom'), 'Vestuário');
  assert.equal(g('S. K. M. Modas Infant'), 'Filha');
  assert.equal(g('Pix no Crédito - Fulano'), 'Envios (Pix/PicPay)');
  assert.equal(guessCategory({ raw: 'Loja X', mk: 'loja x' }, { 'loja x': 'Lazer' }), 'Lazer');
});

test('raio-x da fatura aberta: envios x extras, assinaturas de IA e parcelas futuras', () => {
  const s = defaultState();
  const p = parseStatement(`date,title,amount
2026-10-02,Google Chatgpt,"95,99"
2026-10-02,Perplexity Pro,"104,56"
2026-10-06,Picpay*Fulano,"1.000,00"
2026-10-07,Dl *Uberrides,"10,00"
2026-10-07,Dl *Uberrides,"12,00"
2026-10-07,Dl*99 Ride,"8,00"
2026-10-08,Dl*99 Ride,"9,00"
2026-10-08,Dl *Uberrides,"11,00"
2026-10-05,Loja - Parcela 1/4,"50,00"
`, 'Banco_2026-11-08.csv');
  const an = analyzeStatement(p, { invoiceMonth: '2026-11', dueDay: 8, state: s, categorize: cat });
  applyImport(s, an, { newCard: { name: 'Banco', closingDay: 1, dueDay: 8 }, invoiceMonth: '2026-11', uid });
  s.services = [{ id: 'x', date: '2026-09-20', paid: true, value: 1250, receivedAt: '2026-10-05', type: 'extra' }];
  const x = cardInsights(s, s.cards[0], '2026-10-10');
  assert.equal(x.envios.total, 1000);
  assert.equal(x.extras.total, 1250);
  assert.equal(x.subs.ai.length, 2);
  assert.equal(x.rides.count, 5);
  assert.equal(x.installments.aheadTotal, 150);
  const tips = insightTips(x).map((t) => t.title);
  assert.ok(tips.includes('Dinheiro enviado pelo cartão'));
  assert.match(insightTips(x).find((t) => t.title === 'Dinheiro enviado pelo cartão').text, /80% desse dinheiro/);
});

const card = (s, name = 'Banco') => {
  const c = { id: uid(), name, closingDay: 1, dueDay: 8, paid: {}, payments: [] };
  s.cards.push(c);
  return c;
};
const imp = (s, text, file, c) => {
  const p = parseStatement(text, file);
  const M = p.dueDate ? p.dueDate.slice(0, 7) : null;
  const an = analyzeStatement(p, { invoiceMonth: M, dueDay: 8, cardId: c?.id || null, state: s, categorize: cat });
  applyImport(s, an, { cardId: c?.id || null, invoiceMonth: M, uid });
  return an;
};

test('cartões diferentes com a mesma compra não se confundem', () => {
  const s = defaultState();
  const a = card(s, 'A');
  const b = card(s, 'B');
  const csv = 'date,title,amount\n2026-10-05,Padaria,"20,00"\n';
  imp(s, csv, 'A_2026-11-08.csv', a);
  const an = imp(s, csv, 'B_2026-11-08.csv', b);
  assert.equal(an.totals.newCount, 1);
  assert.equal(invoice(s, b, '2026-11').total, 20);
});

test('parcela final com 1 centavo a mais é a mesma compra', () => {
  const s = defaultState();
  const c = card(s);
  imp(s, 'date,title,amount\n2026-10-05,Loja - Parcela 2/3,"33,33"\n', 'X_2026-11-08.csv', c);
  const an = imp(s, 'date,title,amount\n2026-11-05,Loja - Parcela 3/3,"33,34"\n', 'X_2026-12-08.csv', c);
  assert.equal(an.rows[0].dup, true);
  assert.equal(s.entries.length, 1);
});

test('parcelas com identificadores diferentes a cada mês continuam sendo uma compra', () => {
  const s = defaultState();
  const c = card(s);
  const p1 = { kind: 'card', tx: [{ date: '2026-10-05', title: 'Loja - Parcela 1/2', out: 50, extId: 'x1' }] };
  const p2 = { kind: 'card', tx: [{ date: '2026-11-05', title: 'Loja - Parcela 2/2', out: 50, extId: 'x2' }] };
  applyImport(s, analyzeStatement(p1, { invoiceMonth: '2026-11', cardId: c.id, state: s, categorize: cat }), { cardId: c.id, invoiceMonth: '2026-11', uid });
  const an = analyzeStatement(p2, { invoiceMonth: '2026-12', cardId: c.id, state: s, categorize: cat });
  assert.equal(an.rows[0].dup, true);
});

test('pagamento parcial da fatura anterior não a marca como paga', () => {
  const s = defaultState();
  const c = card(s);
  imp(s, 'date,title,amount\n2026-09-10,Mercado Central,"2.000,00"\n', 'X_2026-10-08.csv', c);
  imp(s, 'date,title,amount\n2026-10-02,Pagamento recebido,"- 800,00"\n2026-10-03,Padaria,"700,00"\n', 'X_2026-11-08.csv', c);
  const out = invoice(s, c, '2026-10');
  assert.equal(out.paidAt, null);
  assert.equal(out.balance, 1200);
});

test('estorno que chega depois em outra fatura/extrato tira a compra das contas', async () => {
  const { ledger, expensesByCategory } = await import('../js/domain/finance.js');
  const s = defaultState();
  // Conta: gasto num arquivo, estorno no seguinte.
  imp(s, 'Data,Valor,Identificador,Descrição\n05/10/2026,-80.00,a1,Loja Z\n', 'conta1.csv', null);
  imp(s, 'Data,Valor,Identificador,Descrição\n09/10/2026,80.00,a2,Estorno Loja Z\n', 'conta2.csv', null);
  assert.equal(ledger(s, '2026-10').filter((i) => i.kind === 'despesa').length, 0);
  assert.equal(expensesByCategory(s, '2026-10').length, 0);
  // Crédito na conta não estorna compra igual do cartão.
  const c = card(s);
  imp(s, 'date,title,amount\n2026-10-05,Loja Y,"40,00"\n', 'X_2026-11-08.csv', c);
  imp(s, 'Data,Valor,Identificador,Descrição\n10/10/2026,40.00,a3,Loja Y\n', 'conta3.csv', null);
  assert.equal(invoice(s, c, '2026-11').total, 40);
});

test('fatura reimportada com o estorno de uma compra já importada', () => {
  const s = defaultState();
  const c = card(s);
  imp(s, 'date,title,amount\n2026-10-05,Loja W,"90,00"\n', 'X_2026-11-08.csv', c);
  const an = imp(s, 'date,title,amount\n2026-10-05,Loja W,"90,00"\n2026-10-08,Estorno de Loja W,"- 90,00"\n', 'X_2026-11-08.csv', c);
  assert.equal(an.totals.newCount, 1);
  assert.equal(invoice(s, c, '2026-11').total, 0);
  assert.equal(imp(s, 'date,title,amount\n2026-10-05,Loja W,"90,00"\n2026-10-08,Estorno de Loja W,"- 90,00"\n', 'X_2026-11-08.csv', c).totals.newCount, 0);
});

test('saídas pagas do mês contam o pagamento parcial da fatura', async () => {
  const { monthSummary } = await import('../js/domain/finance.js');
  const s = defaultState();
  const c = card(s);
  imp(s, 'date,title,amount\n2026-10-03,Padaria,"500,00"\n2026-10-04,Pagamento recebido,"- 100,00"\n', 'X_2026-11-08.csv', c);
  const sm = monthSummary(s, '2026-11');
  assert.equal(sm.expenseExpected, 500);
  assert.equal(sm.expenseDone, 100);
});
