// Dados de exemplo (marcados com sample: true para poderem ser removidos depois).

import { store } from './store.js';
import { uid } from './lib/util.js';
import { addDays, addMonths, monthOf, todayKey, weekday, nextWeekday } from './lib/dates.js';
import { generateDates } from './domain/shifts.js';

export function loadSample() {
  const T = todayKey();
  const M = monthOf(T);
  const now = new Date().toISOString();
  const s = store.get();
  const tpl = (id) => (s.types.find((t) => t.id === id)?.checklist || []).map((title, i) => ({ id: uid(), title, done: i === 0 }));
  const task = (o) => ({
    id: uid(), sample: true, area: 'trabalho', type: 'outro', priority: 2, status: 'todo', due: null, dueTime: null,
    recurrence: null, occ: {}, alertDays: null, checklist: [], process: '', value: 0, notes: '', createdAt: now, doneAt: null, ...o,
  });

  store.update((st) => {
    // Escala 24x72 começando há 6 dias
    const dates = generateDates({ pattern: '24x72', start: addDays(T, -6), until: addDays(T, 70) });
    for (const d of dates) {
      st.services.push({ id: uid(), sample: true, date: d, start: '08:00', hours: 24, type: 'ordinario', unit: '1º GBM', paid: false, value: 0, payExpected: '', receivedAt: null, notes: '' });
    }
    const extra = (d, received, payExpected = '') => ({ id: uid(), sample: true, date: d, start: '19:00', hours: 12, type: 'extra', unit: 'Operação Verão', paid: true, value: 280, payExpected, receivedAt: received, notes: '' });
    st.services.push(extra(addDays(T, -40), addDays(T, -8)));
    st.services.push(extra(addDays(T, -33), null, addDays(T, -3)));
    st.services.push(extra(addDays(T, -11), null));
    st.services.push(extra(addDays(T, 5), null));

    // Trocas
    st.swaps.push({ id: uid(), sample: true, colleague: 'Sgt Silva', myDate: dates.find((d) => d > addDays(T, 8)), theirDate: null, start: '08:00', hours: 24, notes: 'Combinado pelo WhatsApp', settled: false, createdAt: now });
    st.swaps.push({ id: uid(), sample: true, colleague: 'Cb Souza', myDate: null, theirDate: addDays(T, -3), start: '08:00', hours: 24, notes: '', settled: false, createdAt: now });
    if (!st.colleagues.some((c) => c.name === 'Sgt Silva')) st.colleagues.push({ id: uid(), name: 'Sgt Silva', phone: '' });

    // Demandas
    st.tasks.push(
      task({ title: 'Enviar PAD do Sd Oliveira', type: 'pad', due: addDays(T, 2), priority: 1, checklist: tpl('pad') }),
      task({ title: 'Responder processo SEI da escala de férias', type: 'sei', due: T, dueTime: '16:00', status: 'waiting', process: 'SEI-270059/001234/2026', checklist: tpl('sei') }),
      task({ title: 'Solicitar material de expediente', type: 'material', due: addDays(T, 6), checklist: tpl('material') }),
      task({ title: 'Relatório final da sindicância', type: 'sindicancia', due: addDays(T, -1), priority: 1, status: 'doing', checklist: tpl('sindicancia') }),
      task({ title: 'IPM — ouvir testemunhas', type: 'ipm', due: addDays(T, 10), checklist: tpl('ipm') }),
      task({ title: 'Revisão de TCC (cliente: Ana)', type: 'tcc', area: 'faculdade', due: addDays(T, 12), value: 600, payDate: addDays(T, 15), checklist: tpl('tcc') }),
      task({ title: 'Trabalho de Direito Constitucional', type: 'trabalho-fac', area: 'faculdade', due: addDays(T, 4) }),
      task({ title: 'Estudar para a prova de Direito Administrativo', type: 'prova', area: 'faculdade', due: addDays(T, 8), checklist: tpl('prova') }),
      task({ title: 'Renovar CNH', type: 'vencimento', area: 'pessoal', due: addDays(T, 40), alertDays: [30, 7, 1] }),
      // Rotinas
      task({ title: 'Estudar para o concurso (2h)', type: 'estudo', area: 'concurso', due: addDays(T, -10), dueTime: '20:00', recurrence: { freq: 'daily' } }),
      task({ title: 'Conferir e-mail funcional e SEI', type: 'sei', due: addDays(T, -10), dueTime: '09:00', recurrence: { freq: 'weekdays' } }),
      task({ title: 'Planejar a semana', area: 'pessoal', due: nextWeekday(addDays(T, -7), 0), dueTime: '20:00', recurrence: { freq: 'weekly', days: [0] } }),
      task({ title: 'Conferir pagamento dos serviços extras', area: 'trabalho', due: `${addMonths(M, -1)}-10`, recurrence: { freq: 'monthly' } }),
    );
    const study = st.tasks.find((t) => t.sample && t.type === 'estudo');
    for (let i = 1; i <= 6; i++) {
      if (i !== 3) study.occ[addDays(T, -i)] = { done: now };
      st.timeLog.push({ id: uid(), sample: true, taskId: study.id, area: 'concurso', date: addDays(T, -i), start: now, sec: 5400 + i * 300 });
    }

    // Compromissos
    st.events.push(
      { id: uid(), sample: true, title: 'Buscar filha na creche', type: 'familia', area: 'familia', date: addDays(T, -14), start: '17:30', end: '18:00', allDay: false, location: 'Creche', recurrence: { freq: 'weekdays' }, reminder: 30, notes: '', skip: [] },
      { id: uid(), sample: true, title: 'Prova de Direito Administrativo', type: 'prova', area: 'faculdade', date: addDays(T, 9), start: '19:00', end: '21:00', allDay: false, location: 'Sala 204', recurrence: null, reminder: 1440, notes: '', skip: [] },
      { id: uid(), sample: true, title: 'Pediatra da filha', type: 'consulta', area: 'familia', date: addDays(T, weekday(T) === 6 ? 5 : 4), start: '10:00', end: '11:00', allDay: false, location: '', recurrence: null, reminder: 120, notes: '', skip: [] },
      { id: uid(), sample: true, title: 'Férias', type: 'afastamento', area: 'trabalho', date: addDays(T, 45), endDate: addDays(T, 74), allDay: true, start: '', end: '', location: '', recurrence: null, reminder: null, notes: '', skip: [] },
    );

    // Finanças
    const cardId = uid();
    st.cards.push({ id: cardId, sample: true, name: 'Nubank', closingDay: 3, dueDay: 10, limit: 8000, color: 7, paid: { [addMonths(M, -1)]: `${addMonths(M, -1)}-09` } });
    const entry = (o) => ({ id: uid(), sample: true, kind: 'despesa', category: 'Outros', recurrence: null, until: null, settled: {}, amounts: {}, cardId: null, installments: 1, notes: '', createdAt: now, ...o });
    const past = (day) => Object.fromEntries([-3, -2, -1].map((i) => [addMonths(M, i), `${addMonths(M, i)}-${String(day).padStart(2, '0')}`]));
    st.entries.push(
      entry({ kind: 'receita', description: 'Salário', amount: 6200, date: `${addMonths(M, -3)}-01`, recurrence: 'monthly', category: 'Salário', settled: { ...past(1), [M]: `${M}-01` } }),
      entry({ description: 'Aluguel', amount: 1800, date: `${addMonths(M, -3)}-05`, recurrence: 'monthly', category: 'Moradia', settled: past(5) }),
      entry({ description: 'Mensalidade da creche', amount: 950, date: `${addMonths(M, -3)}-10`, recurrence: 'monthly', category: 'Filha', settled: past(10) }),
      entry({ description: 'Faculdade', amount: 780, date: `${addMonths(M, -3)}-12`, recurrence: 'monthly', category: 'Educação', settled: past(12) }),
      entry({ description: 'Internet e celular', amount: 159.9, date: `${addMonths(M, -3)}-15`, recurrence: 'monthly', category: 'Contas da casa', settled: past(15) }),
      entry({ description: 'Conta de luz', amount: 230, date: `${addMonths(M, -3)}-20`, recurrence: 'monthly', category: 'Contas da casa', settled: past(20) }),
      entry({ description: 'IPVA', amount: 1150, date: addDays(T, 20), recurrence: 'yearly', category: 'Transporte' }),
      entry({ description: 'Mercado', amount: 640.5, date: addDays(T, -4), category: 'Alimentação', cardId }),
      entry({ description: 'Notebook', amount: 3600, date: addDays(T, -35), category: 'Educação', cardId, installments: 10 }),
      entry({ description: 'Farmácia', amount: 118.4, date: addDays(T, -9), category: 'Saúde', cardId }),
      entry({ description: 'Combustível', amount: 250, date: addDays(T, -2), category: 'Transporte', cardId }),
    );
  });
}

export const hasSample = (state) => ['tasks', 'events', 'services', 'swaps', 'entries', 'cards'].some((k) => state[k].some((x) => x.sample));

export function removeSample() {
  store.update((st) => {
    for (const k of ['tasks', 'events', 'services', 'swaps', 'entries', 'cards', 'timeLog']) st[k] = st[k].filter((x) => !x.sample);
    if (st.timer && !st.tasks.some((t) => t.id === st.timer.taskId)) st.timer = null;
  }, { undoable: true });
}
