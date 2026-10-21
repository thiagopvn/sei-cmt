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
  assert.equal(permutaDoMeuDia(sh), 'Troca referente ao dia 16/10');
  assert.equal(shortName('Sgt Silva'), 'Silva');
  assert.equal(shortName('Cb Albuquerque'), 'Albuque.');
  assert.equal(shortName('Pedro'), 'Pedro');
});

test('serviço mostra o titular (meu ou de colega), inclusive extra pago', async () => {
  const { shiftsInRange, shiftTitle, ownerLabel } = await import('../js/domain/shifts.js');
  const s = defaultState();
  s.services = [
    { id: 's1', date: '2026-10-09', start: '08:00', hours: 24, type: 'ordinario' },
    { id: 's2', date: '2026-10-10', start: '19:00', hours: 12, type: 'extra', paid: true, value: 280, owner: 'Sd Pereira' },
  ];
  const [mine, extra] = shiftsInRange(s, '2026-10-01', '2026-10-31');
  assert.equal(ownerLabel(mine), 'Meu serviço');
  assert.equal(ownerLabel(extra), 'De Sd Pereira');
  assert.equal(shiftTitle(extra), 'Serviço extra (pago) de Sd Pereira');
  assert.equal(migrate(s).services[1].owner, 'Sd Pereira');
});

test('dois serviços no mesmo dia: a troca permuta só um deles', async () => {
  const { shiftsInRange, swapsByService } = await import('../js/domain/shifts.js');
  const s = defaultState();
  // Dois serviços idênticos no dia 31 e uma troca antiga (sem serviceId) para o dia 24.
  s.services = [
    { id: 'a', date: '2026-10-31', start: '08:00', hours: 24, type: 'ordinario', unit: 'QCG' },
    { id: 'b', date: '2026-10-31', start: '08:00', hours: 24, type: 'ordinario', unit: 'QCG' },
  ];
  s.swaps = [{ id: 'w1', colleague: 'Cap Diogo Dias', myDate: '2026-10-31', theirDate: '2026-10-24' }];
  const day = () => shiftsInRange(s, '2026-10-31', '2026-10-31').map((x) => `${x.id}:${x.kind}`).sort();
  assert.deepEqual(day(), ['a:coberto', 'b:servico']);
  // Troca que aponta o serviço "b": só ele fica permutado.
  s.swaps[0].serviceId = 'b';
  assert.deepEqual(day(), ['a:servico', 'b:coberto']);
  assert.equal(swapsByService(s).get('b').id, 'w1');
  // Duas trocas no mesmo dia, uma para cada serviço.
  s.swaps.push({ id: 'w2', colleague: 'Sgt Silva', myDate: '2026-10-31', theirDate: '2026-11-02' });
  assert.deepEqual(day(), ['a:coberto', 'b:coberto']);
  // Serviço apontado foi excluído: a troca aparece sozinha e não pega o outro serviço.
  s.swaps = [{ id: 'w1', colleague: 'Cap Diogo Dias', myDate: '2026-10-31', theirDate: '2026-10-24', serviceId: 'x' }];
  assert.deepEqual(day(), ['a:servico', 'b:servico', 'swap-out-w1:coberto']);
  assert.equal(migrate(s).swaps[0].serviceId, 'x');
});

test('extra pode ser de mais de um militar', async () => {
  const { ownersOf, ownersText, ownersShort, shiftsInRange, shiftTitle } = await import('../js/domain/shifts.js');
  assert.deepEqual(ownersOf({ owner: 'Sgt Silva, Cb Souza' }), ['Sgt Silva', 'Cb Souza']);
  assert.deepEqual(ownersOf({ owner: 'Sd Souza e Silva' }), ['Sd Souza e Silva']);
  assert.equal(ownersText(['Sgt Silva', 'Cb Souza']), 'Sgt Silva e Cb Souza');
  assert.equal(ownersText(['A', 'B', 'C']), 'A, B e C');
  assert.equal(ownersShort(['Sgt Silva', 'Cb Souza']), 'Silva/Souza');
  const s = defaultState();
  s.services = [{ id: 's1', date: '2026-10-09', start: '08:00', hours: 24, type: 'extra', paid: true, owner: 'Sgt Silva, Cb Souza' }];
  assert.equal(shiftTitle(shiftsInRange(s, '2026-10-01', '2026-10-31')[0]), 'Serviço extra (pago) de Sgt Silva e Cb Souza');
});

test('tarefa remunerada entra em Finanças com quem paga e situação do pagamento', async () => {
  const { ledger, taskPayStatus, setSettled } = await import('../js/domain/finance.js');
  const s = defaultState();
  s.tasks = [
    { id: 't1', title: 'Orientação de TCC', value: 500, payDate: '2026-10-20', payer: 'Aluno João', status: 'todo' },
    { id: 't2', title: 'SEI pago', value: 300, payDate: '2026-10-01', status: 'done' },
    { id: 't3', title: 'IPM sem data', value: 200, createdAt: '2026-10-03T12:00:00.000Z', status: 'todo' },
  ];
  assert.equal(taskPayStatus(s.tasks[0], '2026-10-06'), 'pendente');
  assert.equal(taskPayStatus(s.tasks[1], '2026-10-06'), 'atrasado');
  const items = ledger(s, '2026-10').filter((i) => i.source === 'task');
  assert.deepEqual(items.map((i) => i.ref.taskId).sort(), ['t1', 't2', 't3']);
  assert.deepEqual(items.find((i) => i.ref.taskId === 't1').payers, ['Aluno João']);
  setSettled(s, items.find((i) => i.ref.taskId === 't1'), '2026-10-06');
  assert.equal(taskPayStatus(s.tasks[0], '2026-10-06'), 'recebido');
  assert.equal(migrate(s).tasks[0].payer, 'Aluno João');
});

test('permuta da permuta: repassar o serviço que eu tiraria, em cadeia', async () => {
  const { shiftsInRange, swapChain, dependentSwaps, swapsByService } = await import('../js/domain/shifts.js');
  const s = defaultState();
  s.services = [{ id: 's15', date: '2026-10-15', start: '08:00', hours: 24, type: 'ordinario' }];
  s.swaps = [
    // Dias tira o meu dia 15; eu tiro o dele no dia 22.
    { id: 'w1', colleague: 'Cap Dias', myDate: '2026-10-15', theirDate: '2026-10-22', serviceId: 's15' },
    // Não posso no dia 22: Silva tira por mim; eu tiro o dele no dia 05/11.
    { id: 'w2', colleague: 'Sgt Silva', myDate: '2026-10-22', theirDate: '2026-11-05', fromSwapId: 'w1' },
    // De novo: Souza tira o 05/11; eu tiro o dele no dia 12/11.
    { id: 'w3', colleague: 'Cb Souza', myDate: '2026-11-05', theirDate: '2026-11-12', fromSwapId: 'w2' },
  ];
  const all = shiftsInRange(s, '2026-10-01', '2026-11-30').map((x) => `${x.date}:${x.kind}:${x.colleague}`);
  assert.deepEqual(all, [
    '2026-10-15:coberto:Cap Dias',
    '2026-10-22:coberto:Sgt Silva',
    '2026-11-05:coberto:Cb Souza',
    '2026-11-12:cobrindo:Cb Souza',
  ]);
  // O repasse não pega serviço cadastrado no mesmo dia nem aparece duplicado.
  s.services.push({ id: 's22', date: '2026-10-22', start: '08:00', hours: 24, type: 'ordinario' });
  assert.equal(swapsByService(s).has('s22'), false);
  assert.equal(shiftsInRange(s, '2026-10-22', '2026-10-22').filter((x) => x.active).length, 1);
  assert.deepEqual(swapChain(s, s.swaps[1]).map((w) => w.id), ['w1', 'w2', 'w3']);
  assert.deepEqual(dependentSwaps(s, s.swaps[0]).map((w) => w.id), ['w2', 'w3']);
  assert.equal(migrate(s).swaps[1].fromSwapId, 'w1');
});

test('rendição fora do padrão e saída do turno', async () => {
  const { rendicao, shiftEnd, hhLabel } = await import('../js/domain/shifts.js');
  const settings = { service: { start: '08:00', hours: 24 } };
  assert.equal(rendicao({ start: '08:00' }, settings), null);
  assert.equal(rendicao({ start: '18:00' }, settings), '18:00');
  assert.equal(hhLabel('18:00'), '18h');
  assert.equal(hhLabel('07:30'), '07h30');
  assert.deepEqual(shiftEnd({ date: '2026-10-22', start: '18:00', hours: 14 }), { date: '2026-10-23', time: '08:00' });
  assert.deepEqual(shiftEnd({ date: '2026-10-22', start: '08:00', hours: 24 }), { date: '2026-10-23', time: '08:00' });
});

test('mudar a data da devolução leva junto o repasse (permuta da permuta)', async () => {
  const { dependentSwaps, shiftsInRange } = await import('../js/domain/shifts.js');
  const s = defaultState();
  s.swaps = [
    { id: 'w1', colleague: 'A', myDate: '2026-10-15', theirDate: '2026-10-22' },
    { id: 'w2', colleague: 'B', myDate: '2026-10-22', theirDate: '2026-11-05', fromSwapId: 'w1' },
  ];
  // Datas desencontradas: o desfazer em cadeia ainda acha o repasse pelo vínculo.
  s.swaps[0].theirDate = '2026-10-23';
  assert.deepEqual(dependentSwaps(s, s.swaps[0]).map((w) => w.id), ['w2']);
  // Com a data do repasse acompanhando, a cadeia volta a se ligar.
  s.swaps[1].myDate = '2026-10-23';
  assert.deepEqual(shiftsInRange(s, '2026-10-23', '2026-10-23').map((x) => `${x.kind}:${x.colleague}`), ['coberto:B']);
});

test('cor do app: só aceita as cores conhecidas (cada conta tem a sua)', () => {
  assert.equal(migrate({ settings: { accent: 'rosa' } }).settings.accent, 'rosa');
  assert.equal(migrate({ settings: { accent: 'azul' } }).settings.accent, 'vermelho');
  assert.equal(migrate({ settings: { accent: '"><script>' } }).settings.accent, 'vermelho');
  assert.equal(migrate({}).settings.accent, 'vermelho');
});

test('calendário: serviço de menos de 24h é "parcial" (claro) e mostra as horas; 24h e 48h são cheios', async () => {
  const { isPartial, durationClass, timeSpan, shiftPill, shiftLegend } = await import('../js/ui/shiftui.js');
  const { shiftsInRange } = await import('../js/domain/shifts.js');
  const s = defaultState();
  s.services = [
    { id: 'a', date: '2026-10-11', start: '08:00', hours: 24, type: 'ordinario' },
    { id: 'b', date: '2026-10-13', start: '08:00', hours: 10, type: 'ordinario' },
    { id: 'c', date: '2026-10-15', start: '08:00', hours: 48, type: 'ordinario' },
  ];
  // Troca: tiro o serviço de DIAS no dia 22 (10h) e o de SILVA no dia 24 (24h).
  s.swaps = [
    { id: 'w1', colleague: 'Cap Dias', myDate: '2026-10-11', theirDate: '2026-10-22', serviceId: 'a', start: '08:00', hours: 10 },
    { id: 'w2', colleague: 'Sgt Silva', myDate: '2026-10-15', theirDate: '2026-10-24', serviceId: 'c', start: '08:00', hours: 24 },
  ];
  const on = (d) => shiftsInRange(s, d, d)[0];
  assert.equal(isPartial(on('2026-10-13')), true);
  assert.equal(isPartial(on('2026-10-15')), false); // 48h: cheio
  assert.equal(isPartial(on('2026-10-24')), false);
  assert.equal(durationClass(on('2026-10-22')), 'd-parcial');
  assert.equal(timeSpan(on('2026-10-13')), '8h–18h');
  assert.equal(timeSpan({ date: '2026-10-13', start: '18:00', hours: 14 }), '18h–8h');

  const p10 = shiftPill(on('2026-10-22'), s, '2026-10-21');
  const p24 = shiftPill(on('2026-10-24'), s, '2026-10-21');
  assert.match(p10.cls, /t-outro .*d-parcial/);
  assert.match(p24.cls, /t-outro .*d-cheio/);
  assert.match(p10.short, /<b class="hrs">10h<\/b>/); // no celular as horas entram no lugar da data da troca
  assert.doesNotMatch(p24.short, /24h/); // 24h de outro militar segue mostrando a data da troca
  assert.match(p10.long, /8h–18h/);
  assert.match(p10.tip, /10h \(8h–18h\)/);
  assert.match(shiftLegend(), /Menos de 24h/);
});
