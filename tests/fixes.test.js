// Testes das correções apontadas na revisão de código do PR #1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, NO_ALERTS } from '../js/store.js';
import { conflicts } from '../js/domain/agenda.js';
import { onDutyNow } from '../js/domain/shifts.js';
import { cardUsed } from '../js/domain/finance.js';
import { canon, toPaths, fromRemote } from '../js/cloud/sync.js';
import { buildAlarms } from '../js/notify.js';

const { store } = await import('../js/store.js');
const migrate = store.migrate;

test('conflitos no terceiro dia de um serviço de 48h', () => {
  const s = defaultState();
  s.services = [{ id: 's1', date: '2026-10-05', start: '08:00', hours: 48, type: 'ordinario' }];
  s.events = [
    { id: 'e1', title: 'Reunião dia 2', date: '2026-10-06', start: '15:00' },
    { id: 'e2', title: 'Consulta dia 3 cedo', date: '2026-10-07', start: '07:00' },
    { id: 'e3', title: 'Consulta dia 3 tarde', date: '2026-10-07', start: '10:00' },
  ];
  s.tasks = [
    { id: 't1', title: 'Prazo no meio do serviço', due: '2026-10-06', status: 'todo' },
    { id: 't2', title: 'Prazo depois do serviço', due: '2026-10-07', status: 'todo' },
  ];
  const titles = conflicts(s, '2026-10-01', '2026-10-10').map((c) => c.item.title).sort();
  assert.deepEqual(titles, ['Consulta dia 3 cedo', 'Prazo no meio do serviço', 'Reunião dia 2']);
});

test('serviço de 48h: segundo dia continua "de serviço"', () => {
  const s = defaultState();
  s.services = [{ id: 's1', date: '2026-10-04', start: '08:00', hours: 48, type: 'ordinario' }];
  assert.ok(onDutyNow(s, '2026-10-05', new Date(2026, 9, 5, 22, 0)));
  assert.ok(!onDutyNow(s, '2026-10-06', new Date(2026, 9, 6, 9, 0)));
});

test('fatura antiga não paga continua ocupando o limite', () => {
  const s = defaultState();
  s.cards = [{ id: 'c1', name: 'X', closingDay: 1, dueDay: 10, limit: 5000, paid: {} }];
  s.entries = [{ id: 'e1', kind: 'despesa', description: 'Velha', amount: 700, date: '2026-01-15', cardId: 'c1', installments: 1 }];
  assert.equal(cardUsed(s, s.cards[0], '2026-10-05'), 700);
});

test('"nenhum aviso" sobrevive à ida e volta pela nuvem', () => {
  const s = migrate(defaultState());
  s.settings.alertDays = NO_ALERTS;
  s.tasks.push({ id: 't1', title: 'Sem aviso', due: '2026-10-07', status: 'todo', alertDays: NO_ALERTS, checklist: [], occ: {} });
  const remote = canon(Object.fromEntries([...toPaths(s)].map(([p, v]) => [p, JSON.parse(v)]))) || {};
  const tree = {};
  for (const [p, v] of Object.entries(remote)) {
    const [k, id] = p.split('/');
    if (id) (tree[k] = tree[k] || {})[id] = v; else tree[k] = v;
  }
  const back = migrate(fromRemote(tree));
  assert.deepEqual(back.settings.alertDays, NO_ALERTS);
  assert.deepEqual(back.tasks[0].alertDays, NO_ALERTS);
  const alarms = buildAlarms(back, new Date(2026, 9, 5, 9, 0)).filter((a) => a.key.startsWith('t:'));
  assert.equal(alarms.length, 0);
});

test('conta com aviso "só no dia" gera um único alarme', () => {
  const s = defaultState();
  s.settings.billAlertDays = 0;
  s.entries = [{ id: 'e1', kind: 'despesa', description: 'Luz', amount: 100, date: '2026-10-05' }];
  const alarms = buildAlarms(migrate(s), new Date(2026, 9, 5, 9, 0)).filter((a) => a.key.startsWith('f:'));
  assert.equal(alarms.length, 1);
});

test('ids e datas maliciosos de um backup são higienizados', () => {
  const evil = '"><img src=x onerror=alert(1)>';
  const s = migrate({
    tasks: [{ id: evil, title: 'x', due: evil, area: evil, checklist: [{ id: evil, title: 'a' }], occ: { [evil]: { done: 'x' }, '2026-10-01': { done: 'x' } } }],
    areas: [{ id: 'trabalho', name: 'T', color: '1)"><script>' }],
    cards: [{ id: 'a/b.c', name: 'C', color: 99, paid: { '2026-10': '2026-10-09', 'x/y': 'z' } }],
    timer: { taskId: evil, startedAt: 1 },
  });
  const t = s.tasks[0];
  for (const v of [t.id, t.area, t.checklist[0].id, s.cards[0].id, s.timer.taskId]) assert.match(v, /^[A-Za-z0-9_-]+$/);
  assert.equal(t.due, null);
  assert.deepEqual(Object.keys(t.occ), ['2026-10-01']);
  assert.equal(s.areas[0].color, 6);
  assert.equal(s.cards[0].color, 7);
  assert.deepEqual(s.cards[0].paid, { '2026-10': '2026-10-09' });
  assert.equal(s.timer.taskId, t.id);
});

test('serviço trocado aparece como "Permutado para o dia X"', async () => {
  const { shiftsInRange, shiftTitle, permutaLabel } = await import('../js/domain/shifts.js');
  const s = defaultState();
  s.services = [{ id: 's1', date: '2026-10-09', start: '08:00', hours: 24, type: 'ordinario' }];
  s.swaps = [{ id: 'w1', colleague: 'Sgt Silva', myDate: '2026-10-09', theirDate: '2026-10-12' }];
  const sh = shiftsInRange(s, '2026-10-01', '2026-10-31').find((x) => x.kind === 'coberto');
  assert.equal(shiftTitle(sh), 'Permutado para o dia 12/10');
  assert.equal(permutaLabel(sh, { short: true }), 'Perm. 12/10');
  s.swaps[0].theirDate = null;
  const sh2 = shiftsInRange(s, '2026-10-01', '2026-10-31').find((x) => x.kind === 'coberto');
  assert.equal(shiftTitle(sh2), 'Permutado (data a combinar)');
});

test('serviço de colega mostra de quem é', async () => {
  const { shiftsInRange, shiftTitle, shortName, permutaDoMeuDia } = await import('../js/domain/shifts.js');
  const s = defaultState();
  s.swaps = [{ id: 'w1', colleague: 'Sgt Silva', myDate: '2026-10-16', theirDate: '2026-10-19' }];
  const sh = shiftsInRange(s, '2026-10-01', '2026-10-31').find((x) => x.kind === 'cobrindo');
  assert.equal(shiftTitle(sh), 'Serviço de Sgt Silva');
  assert.equal(permutaDoMeuDia(sh), 'Permuta do meu dia 16/10');
  assert.equal(shortName('Sgt Silva'), 'Silva');
  assert.equal(shortName('Cb Albuquerque'), 'Albuque.');
  assert.equal(shortName('Pedro'), 'Pedro');
});
