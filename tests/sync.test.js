import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canon, toPaths, diff, fromRemote, overlay, pathsOnlyLocal, samePaths } from '../js/cloud/sync.js';
import { defaultState } from '../js/store.js';

// store.js lê localStorage ao carregar; no Node não existe, então ele cai no estado padrão.
const { store } = await import('../js/store.js');
const migrate = store.migrate;

/** Simula o que o Realtime Database guarda: aplica updates em uma árvore e devolve canon(). */
function applyRemote(tree, updates) {
  const t = structuredClone(tree || {});
  for (const [path, value] of Object.entries(updates)) {
    const [k, id] = path.split('/');
    if (!id) {
      if (value === null) delete t[k]; else t[k] = value;
    } else {
      t[k] = t[k] || {};
      if (value === null) delete t[k][id]; else t[k][id] = value;
      if (!Object.keys(t[k]).length) delete t[k];
    }
  }
  return canon(t) || null;
}

function richState() {
  const s = defaultState();
  s.tasks.push(
    { id: 't1', title: 'Enviar PAD', area: 'trabalho', type: 'pad', priority: 1, status: 'todo', due: '2026-10-09', dueTime: null, recurrence: null, occ: {}, alertDays: null, checklist: [{ id: 'c1', title: 'Redigir', done: true }], process: '', value: 0, notes: '', createdAt: '2026-10-01T10:00:00Z', doneAt: null },
    { id: 't2', title: 'Rotina', area: 'familia', type: 'outro', priority: 2, status: 'todo', due: '2026-10-01', recurrence: { freq: 'weekly', days: [2, 4] }, occ: { '2026-10-06': { done: 'x', checks: [] } }, checklist: [], createdAt: '2026-10-02T10:00:00Z' },
  );
  s.events.push({ id: 'e1', title: 'Férias', date: '2026-11-01', endDate: '2026-11-30', skip: [], recurrence: null, createdAt: '2026-10-01' });
  s.entries.push({ id: 'n1', kind: 'despesa', description: 'Aluguel', amount: 1800, date: '2026-01-05', recurrence: 'monthly', settled: { '2026-09': '2026-09-05' }, amounts: {}, cardId: null, installments: 1 });
  s.cards.push({ id: 'k1', name: 'Nubank', closingDay: 3, dueDay: 10, paid: {} });
  s.timer = null;
  return s;
}

test('canon remove vazios e ordena chaves', () => {
  assert.equal(canon({ b: 1, a: null, c: [], d: {}, e: [null, 2] }) && JSON.stringify(canon({ b: 1, a: null, c: [], d: {}, e: [null, 2] })), '{"b":1,"e":[2]}');
  assert.equal(canon([]), undefined);
  assert.equal(canon(0), 0);
  assert.equal(canon(false), false);
});

test('ida e volta pela nuvem não perde nem altera nada', () => {
  const local = migrate(richState());
  const paths = toPaths(local);
  const remote = applyRemote({}, diff(new Map(), paths));
  const back = migrate(fromRemote(remote));
  assert.ok(samePaths(toPaths(back), paths));
  // listas vazias voltam como listas (o Firebase as apaga)
  assert.deepEqual(back.tasks.find((t) => t.id === 't2').checklist, []);
  assert.deepEqual(back.events[0].skip, []);
  assert.deepEqual(back.cards[0].paid, {});
  assert.deepEqual(back.tasks.find((t) => t.id === 't2').recurrence.days, [2, 4]);
});

test('diff envia só o item alterado e remove o excluído', () => {
  const a = migrate(richState());
  const before = toPaths(a);
  a.tasks[0].status = 'done';
  a.cards = [];
  const up = diff(before, toPaths(a));
  assert.deepEqual(Object.keys(up).sort(), ['cards/k1', 'tasks/t1']);
  assert.equal(up['cards/k1'], null);
  assert.equal(up['tasks/t1'].status, 'done');
});

test('alterações pendentes (sem internet) prevalecem sobre a nuvem', () => {
  const local = migrate(richState());
  const remote = applyRemote({}, diff(new Map(), toPaths(local)));
  // outro aparelho mudou t1 e o aluguel; aqui, offline, mudamos t1 de novo
  const other = migrate(fromRemote(remote));
  other.tasks.find((t) => t.id === 't1').title = 'Título da nuvem';
  other.entries[0].amount = 1900;
  const remote2 = applyRemote(remote, diff(toPaths(migrate(fromRemote(remote))), toPaths(other)));
  local.tasks.find((t) => t.id === 't1').title = 'Título local (pendente)';
  const merged = migrate(overlay(migrate(fromRemote(remote2)), local, new Set(['tasks/t1'])));
  assert.equal(merged.tasks.find((t) => t.id === 't1').title, 'Título local (pendente)');
  assert.equal(merged.entries[0].amount, 1900);
});

test('primeiro login junta os itens que só existem no aparelho', () => {
  const remoteState = migrate(richState());
  const local = migrate(defaultState());
  local.tasks.push({ id: 'novo', title: 'Criada sem conta', checklist: [], occ: {} });
  local.settings.theme = 'dark';
  const only = pathsOnlyLocal(toPaths(local), toPaths(remoteState));
  assert.deepEqual(only, ['tasks/novo']);
  const merged = migrate(overlay(remoteState, local, only));
  assert.equal(merged.tasks.length, 3);
  assert.equal(merged.settings.theme, 'auto'); // ajustes da nuvem prevalecem
});
