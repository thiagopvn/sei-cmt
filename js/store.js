// Estado do app, persistido no localStorage do aparelho.

import { todayKey } from './lib/dates.js';

const KEY = 'pauta:v1';

export const AREA_SLOTS = 8; // cores categóricas disponíveis (--c1 … --c8)

export function defaultState() {
  return {
    version: 1,
    profile: { name: '' },
    areas: [
      { id: 'trabalho', name: 'Trabalho', color: 1 },
      { id: 'faculdade', name: 'Faculdade', color: 7 },
      { id: 'concurso', name: 'Concurso', color: 4 },
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

function migrate(raw) {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;
  const s = { ...base, ...raw };
  s.settings = { ...base.settings, ...(raw.settings || {}) };
  s.settings.service = { ...base.settings.service, ...(raw.settings?.service || {}) };
  s.profile = { ...base.profile, ...(raw.profile || {}) };
  for (const k of ['tasks', 'events', 'services', 'swaps', 'colleagues', 'entries', 'cards', 'timeLog', 'areas', 'types']) {
    if (!Array.isArray(s[k])) s[k] = base[k];
  }
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

function emit() {
  for (const fn of listeners) fn(state);
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
    return JSON.stringify({ app: 'pauta', exportedAt: new Date().toISOString(), data: state }, null, 2);
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
  /** Somente para testes. */
  _set(s) {
    state = migrate(s);
  },
};

export const today = () => todayKey();

export const areaById = (s, id) => s.areas.find((a) => a.id === id);
export const typeById = (s, id) => s.types.find((t) => t.id === id);
