// Estado do app, persistido no localStorage do aparelho.

import { todayKey } from './lib/dates.js';

const KEY = 'pauta:v1';

export const AREA_SLOTS = 8; // cores categóricas disponíveis (--c1 … --c8)

/** "Nenhum aviso": o Firebase apaga listas vazias, então usamos um marcador. */
export const NO_ALERTS = [-1];

export function defaultState() {
  return {
    version: 1,
    profile: { name: '' },
    areas: [
      { id: 'trabalho', name: 'Trabalho', color: 6 },
      { id: 'faculdade', name: 'Faculdade', color: 7 },
      { id: 'concurso', name: 'Concurso', color: 2 },
      { id: 'familia', name: 'Família', color: 5 },
      { id: 'pessoal', name: 'Pessoal', color: 3 },
    ],
    types: [
      { id: 'documento', name: 'Documento', area: 'trabalho', checklist: ['Redigir', 'Revisar', 'Assinar', 'Enviar'] },
      { id: 'sei', name: 'SEI', area: 'trabalho', checklist: ['Abrir/localizar processo', 'Incluir documentos', 'Assinar', 'Tramitar', 'Acompanhar resposta'] },
      { id: 'pad', name: 'PAD', area: 'trabalho', checklist: ['Elaborar', 'Revisar', 'Assinar', 'Enviar'] },
      { id: 'material', name: 'Solicitação de material', area: 'trabalho', checklist: ['Levantar necessidade', 'Preencher solicitação', 'Enviar', 'Acompanhar entrega'] },
      { id: 'ipm', name: 'IPM', area: 'trabalho', checklist: ['Portaria/instauração', 'Oitivas', 'Diligências', 'Relatório', 'Remessa'] },
      { id: 'sindicancia', name: 'Sindicância', area: 'trabalho', checklist: ['Portaria', 'Oitivas', 'Relatório', 'Remessa'] },
      { id: 'tcc', name: 'TCC', area: 'faculdade', checklist: ['Projeto', 'Pesquisa', 'Escrita', 'Revisão', 'Entrega'] },
      { id: 'prova', name: 'Prova', area: 'faculdade', checklist: ['Revisar conteúdo', 'Exercícios', 'Resumo final'] },
      { id: 'trabalho-fac', name: 'Trabalho da faculdade', area: 'faculdade', checklist: [] },
      { id: 'estudo', name: 'Estudo', area: 'concurso', checklist: [] },
      { id: 'vencimento', name: 'Vencimento/renovação', area: 'pessoal', checklist: [] },
      { id: 'outro', name: 'Outro', area: null, checklist: [] },
    ],
    tasks: [],
    events: [],
    services: [],
    swaps: [],
    colleagues: [],
    entries: [],
    cards: [],
    timeLog: [],
    timer: null,
    settings: {
      theme: 'auto',
      weekStart: 0,
      alertHour: '08:00',
      alertDays: [3, 1, 0],
      billAlertDays: 2,
      serviceAlertHours: 12,
      notifications: true,
      pomodoro: 25,
      service: { start: '08:00', hours: 24, value: 0, payRule: 'nextMonth', payDay: 10, payDays: 30 },
      incomeCategories: ['Salário', 'Serviço extra', 'Trabalhos (TCC, IPM…)', 'Outros'],
      expenseCategories: ['Moradia', 'Alimentação', 'Transporte', 'Saúde', 'Educação', 'Filha', 'Contas da casa', 'Lazer', 'Outros'],
      lastBackup: null,
    },
  };
}

// O Firebase devolve listas como objetos e apaga listas/objetos vazios: normaliza tudo.
const arr = (v) => (Array.isArray(v) ? v.filter((x) => x != null) : v && typeof v === 'object' ? Object.values(v) : []);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

// Higienização: dados vindos de backup ou da nuvem viram chaves do Firebase e atributos
// HTML, então ids, chaves e datas só podem ter caracteres seguros.
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const safeId = (v) => {
  const s = String(v ?? '');
  return ID_RE.test(s) ? s : s.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64) || '_';
};
const optId = (v) => (v == null || v === '' ? null : safeId(v));
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const date = (v, empty = null) => (typeof v === 'string' && DATE_RE.test(v) ? v : empty);
const safeKeys = (o) => Object.fromEntries(Object.entries(obj(o)).filter(([k]) => ID_RE.test(k)));
const color = (v, def = 6) => {
  const n = Math.round(Number(v));
  return n >= 1 && n <= AREA_SLOTS ? n : def;
};
const time = (v) => (typeof v === 'string' && /^\d{2}:\d{2}$/.test(v) ? v : null);

function normRule(r) {
  if (!r || typeof r !== 'object') return null;
  const out = { ...r };
  if (r.days) out.days = arr(r.days).map(Number).filter((d) => d >= 0 && d <= 6);
  if (r.until !== undefined) out.until = date(r.until);
  return out;
}

function migrate(raw) {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;
  const s = { ...base, ...raw };
  s.settings = { ...base.settings, ...obj(raw.settings) };
  s.settings.service = { ...base.settings.service, ...obj(raw.settings?.service) };
  for (const k of ['alertDays', 'incomeCategories', 'expenseCategories']) {
    const list = arr(s.settings[k]);
    s.settings[k] = list.length ? list : base.settings[k];
  }
  s.profile = { ...base.profile, ...obj(raw.profile) };
  for (const k of ['tasks', 'events', 'services', 'swaps', 'colleagues', 'entries', 'cards', 'timeLog']) s[k] = arr(s[k]);
  for (const k of ['areas', 'types']) {
    s[k] = arr(s[k]);
    if (!s[k].length) s[k] = base[k];
  }
  s.areas = s.areas.map((a) => ({ ...a, id: safeId(a.id), color: color(a.color) }));
  s.types = s.types.map((t) => ({ ...t, id: safeId(t.id), checklist: arr(t.checklist).map(String), area: optId(t.area) }));
  s.tasks = s.tasks.map((t) => ({
    ...t,
    id: safeId(t.id),
    area: optId(t.area),
    type: optId(t.type) || 'outro',
    due: date(t.due),
    dueTime: time(t.dueTime),
    payDate: date(t.payDate),
    receivedAt: date(t.receivedAt),
    checklist: arr(t.checklist).map((c) => ({ ...c, id: safeId(c.id) })),
    occ: Object.fromEntries(Object.entries(safeKeys(t.occ)).map(([k, o]) => [k, o?.checks ? { ...o, checks: arr(o.checks).map(safeId) } : obj(o)])),
    recurrence: normRule(t.recurrence),
    alertDays: t.alertDays ? arr(t.alertDays).map(Number) : null,
  }));
  s.events = s.events.map((e) => ({
    ...e, id: safeId(e.id), area: optId(e.area), date: date(e.date), endDate: date(e.endDate, ''),
    start: time(e.start) || '', end: time(e.end) || '', skip: arr(e.skip).filter((d) => DATE_RE.test(d)), recurrence: normRule(e.recurrence),
  }));
  s.services = s.services.map((x) => ({
    ...x, id: safeId(x.id), date: date(x.date), start: time(x.start), payExpected: date(x.payExpected, ''), receivedAt: date(x.receivedAt),
    owner: typeof x.owner === 'string' ? x.owner.trim().slice(0, 120) : '',
  })).filter((x) => x.date);
  s.swaps = s.swaps.map((w) => ({ ...w, id: safeId(w.id), myDate: date(w.myDate), theirDate: date(w.theirDate), start: time(w.start), serviceId: optId(w.serviceId) }));
  s.colleagues = s.colleagues.map((c) => ({ ...c, id: safeId(c.id) }));
  s.entries = s.entries.map((e) => ({
    ...e, id: safeId(e.id), cardId: optId(e.cardId), date: date(e.date), until: typeof e.until === 'string' && /^\d{4}-\d{2}$/.test(e.until) ? e.until : null,
    settled: Object.fromEntries(Object.entries(safeKeys(e.settled)).filter(([, v]) => DATE_RE.test(v))), amounts: safeKeys(e.amounts),
  }));
  s.cards = s.cards.map((c) => ({
    ...c, id: safeId(c.id), color: color(c.color, 7), paid: Object.fromEntries(Object.entries(safeKeys(c.paid)).filter(([, v]) => DATE_RE.test(v))),
  }));
  s.timeLog = s.timeLog.map((l) => ({ ...l, id: safeId(l.id), taskId: optId(l.taskId), area: optId(l.area), date: date(l.date) })).filter((l) => l.date);
  s.timer = s.timer && typeof s.timer === 'object' && s.timer.taskId ? { ...s.timer, taskId: safeId(s.timer.taskId), area: optId(s.timer.area) } : null;
  return s;
}

function load() {
  try {
    return migrate(JSON.parse(localStorage.getItem(KEY)));
  } catch {
    return defaultState();
  }
}

let state = load();
let undoSnap = null;
const listeners = new Set();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Falha ao salvar', e);
  }
}

function emit(meta = {}) {
  for (const fn of listeners) fn(state, meta);
}

export const store = {
  get: () => state,
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  /** Aplica uma mutação. `undoable` guarda o estado anterior para "Desfazer". */
  update(mutator, { undoable = false, silent = false } = {}) {
    if (undoable) undoSnap = JSON.stringify(state);
    mutator(state);
    save();
    if (!silent) emit();
  },
  canUndo: () => !!undoSnap,
  undo() {
    if (!undoSnap) return;
    state = migrate(JSON.parse(undoSnap));
    undoSnap = null;
    save();
    emit();
  },
  export() {
    return JSON.stringify({ app: 'rotina-geral', exportedAt: new Date().toISOString(), data: state }, null, 2);
  },
  import(json) {
    const parsed = typeof json === 'string' ? JSON.parse(json) : json;
    const data = parsed?.data ?? parsed;
    if (!data || typeof data !== 'object' || !Array.isArray(data.tasks)) throw new Error('Arquivo de backup inválido');
    undoSnap = JSON.stringify(state);
    state = migrate(data);
    save();
    emit();
  },
  reset() {
    undoSnap = JSON.stringify(state);
    state = defaultState();
    save();
    emit();
  },
  /** Substitui o estado pelo que veio da nuvem (não é reenviado para a nuvem). */
  replaceFromRemote(remote) {
    state = migrate(remote);
    undoSnap = null;
    save();
    emit({ remote: true });
  },
  /** Limpa os dados deste aparelho sem apagar nada da nuvem (ao sair da conta). */
  clearLocal() {
    state = defaultState();
    undoSnap = null;
    save();
    emit({ remote: true });
  },
  /** Somente para testes. */
  _set(s) {
    state = migrate(s);
  },
  migrate: (raw) => migrate(raw),
};

export const today = () => todayKey();

export const areaById = (s, id) => s.areas.find((a) => a.id === id);
export const typeById = (s, id) => s.types.find((t) => t.id === id);
