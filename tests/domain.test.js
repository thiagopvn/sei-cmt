import { test } from 'node:test';
import assert from 'node:assert/strict';
import { occursOn, occurrences, describeRule, lastOccurrence, nextOccurrence } from '../js/domain/recurrence.js';
import { parseQuick, activeInstance, toggleDone, streak, groupInstances } from '../js/domain/tasks.js';
import { generateDates, swapStatus, swapBalance, shiftsInRange, expectedPayDate, payStatus, monthStats } from '../js/domain/shifts.js';
import { invoiceDueMonth, invoice, ledger, monthSummary, setSettled, entryOccurrences } from '../js/domain/finance.js';
import { conflicts, collectRange } from '../js/domain/agenda.js';
import { radar } from '../js/domain/insights.js';
import { defaultState } from '../js/store.js';
import { addDays, weekday } from '../js/lib/dates.js';

const T = '2026-10-05'; // segunda-feira
const types = defaultState().types;
const areas = defaultState().areas;

test('recorrência', () => {
  assert.equal(weekday(T), 1);
  assert.ok(occursOn({ freq: 'daily' }, T, '2026-10-09'));
  assert.ok(!occursOn({ freq: 'daily', interval: 2 }, T, '2026-10-06'));
  assert.ok(occursOn({ freq: 'weekdays' }, T, '2026-10-09'));
  assert.ok(!occursOn({ freq: 'weekdays' }, T, '2026-10-10'));
  assert.deepEqual(occurrences(T, { freq: 'weekly', days: [2, 4] }, T, '2026-10-12'), ['2026-10-06', '2026-10-08']);
  assert.ok(occursOn({ freq: 'monthly' }, '2026-01-31', '2026-02-28'));
  assert.ok(occursOn({ freq: 'yearly' }, '2025-10-05', T));
  assert.equal(lastOccurrence('2026-09-01', { freq: 'monthly' }, T), '2026-10-01');
  assert.equal(nextOccurrence('2026-09-01', { freq: 'monthly' }, T), '2026-11-01');
  assert.equal(describeRule({ freq: 'weekly', days: [2, 4] }, T), 'Toda ter, qui');
});

test('captura rápida', () => {
  let r = parseQuick('Enviar PAD até sexta #pad !alta', T, { types, areas });
  assert.equal(r.title, 'Enviar PAD');
  assert.equal(r.due, '2026-10-09');
  assert.equal(r.priority, 1);
  assert.equal(r.type, 'pad');
  assert.equal(r.area, 'trabalho');

  r = parseQuick('Buscar filha na creche toda terça e quinta às 17h30 @família', T, { types, areas });
  assert.equal(r.title, 'Buscar filha na creche');
  assert.deepEqual(r.recurrence, { freq: 'weekly', days: [2, 4] });
  assert.equal(r.due, '2026-10-06');
  assert.equal(r.dueTime, '17:30');
  assert.equal(r.area, 'familia');

  r = parseQuick('Prova de Penal 12/11 às 19h #prova', T, { types, areas });
  assert.equal(r.title, 'Prova de Penal');
  assert.equal(r.due, '2026-11-12');
  assert.equal(r.dueTime, '19:00');
  assert.equal(r.area, 'faculdade');

  r = parseQuick('Pagar condomínio todo dia 10', T, { types, areas });
  assert.equal(r.title, 'Pagar condomínio');
  assert.equal(r.recurrence.freq, 'monthly');
  assert.equal(r.due, '2026-10-10');

  r = parseQuick('Solicitar material amanhã', T, { types, areas });
  assert.equal(r.title, 'Solicitar material');
  assert.equal(r.due, '2026-10-06');

  r = parseQuick('Estudar português todos os dias 2h', T, { types, areas });
  assert.equal(r.recurrence.freq, 'daily');
  assert.equal(r.due, T);
  assert.equal(r.dueTime, null);
  assert.equal(parseQuick('Reunião às 9', T, { types, areas }).dueTime, '09:00');
  assert.equal(parseQuick('Aula 19h', T, { types, areas }).dueTime, '19:00');

  r = parseQuick('Responder SEI dia 3', T, { types, areas });
  assert.equal(r.due, '2026-11-03');
  r = parseQuick('Relatório até o fim do mês', T, { types, areas });
  assert.equal(r.due, '2026-10-31');
  assert.equal(r.title, 'Relatório');
});

test('instâncias e rotinas', () => {
  const task = { id: 'a', title: 'Rotina', due: '2026-09-28', recurrence: { freq: 'daily' }, occ: {} };
  assert.equal(activeInstance(task, T).date, T);
  toggleDone(task, '2026-10-04', 'x');
  toggleDone(task, '2026-10-03', 'x');
  assert.equal(streak(task, T), 2);
  toggleDone(task, T, 'x');
  assert.equal(streak(task, T), 3);
  const weekly = { id: 'b', title: 'Semanal', due: '2026-09-28', recurrence: { freq: 'weekly' }, occ: {} };
  toggleDone(weekly, '2026-10-05', 'x');
  assert.equal(activeInstance(weekly, '2026-10-06').date, '2026-10-12');
  const once = { id: 'c', title: 'Doc', due: '2026-10-01', status: 'todo' };
  const groups = groupInstances([activeInstance(once, T)], T);
  assert.equal(groups[0].key, 'overdue');
});

test('escala e trocas', () => {
  const dates = generateDates({ pattern: '24x72', start: T, until: '2026-10-20' });
  assert.deepEqual(dates, ['2026-10-05', '2026-10-09', '2026-10-13', '2026-10-17']);
  assert.deepEqual(generateDates({ pattern: 'semanal', start: T, until: '2026-10-11', weekdays: [1, 3] }), ['2026-10-05', '2026-10-07']);
  assert.equal(swapStatus({ myDate: '2026-10-01', theirDate: null }, T), 'devo');
  assert.equal(swapStatus({ myDate: '2026-10-20', theirDate: '2026-10-02' }, T), 'me_devem');
  assert.equal(swapStatus({ myDate: '2026-10-01', theirDate: '2026-10-02' }, T), 'quitada');
  assert.equal(swapStatus({ myDate: '2026-10-20', theirDate: '2026-10-22' }, T), 'agendada');

  const s = defaultState();
  s.services = [
    { id: 's1', date: '2026-10-09', start: '08:00', hours: 24, type: 'ordinario' },
    { id: 's2', date: '2026-10-13', start: '08:00', hours: 24, type: 'extra', paid: true, value: 300 },
  ];
  s.swaps = [{ id: 'w1', colleague: 'Sgt Silva', myDate: '2026-10-09', theirDate: '2026-10-11' }];
  const list = shiftsInRange(s, '2026-10-01', '2026-10-31');
  assert.deepEqual(list.map((x) => [x.date, x.kind]), [['2026-10-09', 'coberto'], ['2026-10-11', 'cobrindo'], ['2026-10-13', 'servico']]);
  assert.equal(expectedPayDate(s.services[1], s.settings), '2026-11-10');
  assert.equal(payStatus(s.services[1], '2026-11-11', s.settings), 'atrasado');
  const st = monthStats(s, '2026-10', T);
  assert.equal(st.count, 2);
  assert.equal(st.hours, 48);
  assert.equal(st.pending, 300);
  assert.deepEqual(swapBalance(s.swaps, '2026-10-10'), [{ colleague: 'Sgt Silva', devo: 1, meDevem: 0, abertas: 1 }]);
});

test('finanças e cartão', () => {
  const card = { id: 'c1', name: 'Nubank', closingDay: 3, dueDay: 10, paid: {} };
  assert.equal(invoiceDueMonth(card, '2026-10-02'), '2026-10');
  assert.equal(invoiceDueMonth(card, '2026-10-03'), '2026-11');
  const card2 = { id: 'c2', name: 'Itaú', closingDay: 25, dueDay: 5 };
  assert.equal(invoiceDueMonth(card2, '2026-10-20'), '2026-11');
  assert.equal(invoiceDueMonth(card2, '2026-10-26'), '2026-12');

  const s = defaultState();
  s.cards = [card];
  s.entries = [
    { id: 'e1', kind: 'despesa', description: 'TV', amount: 1000, date: '2026-10-05', cardId: 'c1', installments: 3, category: 'Lazer' },
    { id: 'e2', kind: 'despesa', description: 'Aluguel', amount: 1500, date: '2026-01-05', recurrence: 'monthly', category: 'Moradia' },
    { id: 'e3', kind: 'receita', description: 'Salário', amount: 5000, date: '2026-01-01', recurrence: 'monthly', category: 'Salário' },
    { id: 'e4', kind: 'despesa', description: 'IPVA', amount: 900, date: '2026-02-15', recurrence: 'yearly' },
  ];
  s.services = [{ id: 's1', date: '2026-10-01', paid: true, value: 250 }];
  s.tasks = [{ id: 't1', title: 'TCC do João', value: 800, due: '2026-11-20', status: 'todo' }];
  const inv = invoice(s, card, '2026-11');
  assert.equal(inv.total, 333.33);
  assert.equal(invoice(s, card, '2027-01').total, 333.34);
  assert.equal(entryOccurrences(s.entries[3], '2027-02').length, 1);
  assert.equal(entryOccurrences(s.entries[3], '2026-10').length, 0);
  const nov = monthSummary(s, '2026-11');
  assert.equal(nov.incomeExpected, 5000 + 250 + 800);
  assert.equal(nov.expenseExpected, 1500 + 333.33);
  const it = ledger(s, '2026-11').find((x) => x.source === 'invoice');
  setSettled(s, it, '2026-11-09');
  assert.equal(monthSummary(s, '2026-11').expenseDone, 333.33);
});

test('conflitos e radar', () => {
  const s = defaultState();
  s.services = [{ id: 's1', date: '2026-10-07', start: '08:00', hours: 24, type: 'ordinario' }];
  s.events = [{ id: 'e1', title: 'Buscar filha', area: 'familia', date: '2026-10-06', start: '17:30', recurrence: { freq: 'weekly', days: [2, 3, 4] } }];
  s.tasks = [{ id: 't1', title: 'Enviar SEI', due: '2026-10-07', status: 'todo', area: 'trabalho' }];
  const c = conflicts(s, T, addDays(T, 14));
  assert.deepEqual(c.map((x) => [x.date, x.item.title]).sort(), [['2026-10-07', 'Buscar filha'], ['2026-10-07', 'Enviar SEI']]);
  const r = radar(s, T);
  const c2 = r.find((x) => x.title.includes('conflitos'));
  assert.ok(c2 && c2.detail.includes('Buscar filha') && c2.detail.includes('Enviar SEI'));
  const map = collectRange(s, T, addDays(T, 6));
  assert.equal(map.get('2026-10-07').length, 3);
});
