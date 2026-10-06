// Escala de serviços, trocas e pagamentos de serviços.
//
// service = { id, date, start, hours, type, unit, owner, paid, value, payExpected, receivedAt, notes }
//   owner: '' quando o serviço é meu; nome do militar quando tiro o serviço (ex.: extra) de outra pessoa
// swap    = { id, colleague, myDate, theirDate, serviceId, start, hours, notes, settled }
//   myDate:    dia do MEU serviço que o militar tira por mim
//   serviceId: qual serviço desse dia foi trocado (importa quando há mais de um no mesmo dia)
//   theirDate: dia do serviço DELE que eu tiro (a devolução)

import { addDays, addMonths, dateInMonth, diffDays, eachDay, monthOf, monthStart, monthEnd, toMin, nowMin, weekday, fmtDM } from '../lib/dates.js';
import { sum } from '../lib/util.js';

export const SERVICE_TYPES = {
  ordinario: { label: 'Escala ordinária', paid: false },
  extra: { label: 'Serviço extra (pago)', paid: true },
  sobreaviso: { label: 'Sobreaviso', paid: false },
  outro: { label: 'Outro', paid: false },
};

export const PATTERNS = {
  '24x72': { label: '24 × 72 (um dia sim, três não)', step: 4, hours: 24 },
  '24x48': { label: '24 × 48 (um dia sim, dois não)', step: 3, hours: 24 },
  '24x96': { label: '24 × 96 (um dia sim, quatro não)', step: 5, hours: 24 },
  '12x36': { label: '12 × 36 (dia sim, dia não)', step: 2, hours: 12 },
  '12x60': { label: '12 × 60', step: 3, hours: 12 },
  semanal: { label: 'Dias fixos da semana', step: null, hours: null },
  custom: { label: 'A cada N dias', step: null, hours: null },
};

export function generateDates({ pattern, start, until, every, weekdays = [] }) {
  const out = [];
  if (!start || !until || until < start) return out;
  if (pattern === 'semanal') {
    for (const k of eachDay(start, until)) if (weekdays.includes(weekday(k))) out.push(k);
    return out;
  }
  const step = pattern === 'custom' ? Math.max(1, Number(every) || 1) : PATTERNS[pattern]?.step;
  if (!step) return out;
  for (let k = start; k <= until; k = addDays(k, step)) out.push(k);
  return out;
}

export function expectedPayDate(service, settings) {
  if (service.payExpected) return service.payExpected;
  const rule = settings.service || {};
  if (rule.payRule === 'days') return addDays(service.date, Number(rule.payDays) || 30);
  return dateInMonth(addMonths(monthOf(service.date), 1), Number(rule.payDay) || 10);
}

/** null (não é pago) | 'recebido' | 'atrasado' | 'pendente' */
export function payStatus(service, today, settings) {
  if (!service.paid) return null;
  if (service.receivedAt) return 'recebido';
  return expectedPayDate(service, settings) < today ? 'atrasado' : 'pendente';
}

export const PAY_LABEL = { recebido: 'Recebido', atrasado: 'Pagamento atrasado', pendente: 'A receber' };

/**
 * Situação de uma troca:
 *  'quitada'  — os dois lados já aconteceram (ou marcada manualmente)
 *  'devo'     — o militar já tirou o meu serviço; ainda devo o dele
 *  'me_devem' — eu já tirei o serviço dele; ele ainda me deve
 *  'agendada' — nenhum lado aconteceu ainda
 */
export function swapStatus(swap, today) {
  if (swap.settled) return 'quitada';
  const coveredDone = !!swap.myDate && swap.myDate <= today;
  const coveringDone = !!swap.theirDate && swap.theirDate <= today;
  if (coveredDone && coveringDone) return 'quitada';
  if (coveredDone) return 'devo';
  if (coveringDone) return 'me_devem';
  return 'agendada';
}

export const SWAP_LABEL = {
  quitada: 'Quitada',
  devo: 'Eu devo',
  me_devem: 'Me devem',
  agendada: 'Agendada',
};

/** Saldo de trocas por militar: quantos serviços eu devo e quantos me devem. */
export function swapBalance(swaps, today) {
  const map = new Map();
  for (const w of swaps) {
    const st = swapStatus(w, today);
    const name = (w.colleague || 'Sem nome').trim();
    const row = map.get(name) || { colleague: name, devo: 0, meDevem: 0, abertas: 0 };
    if (st === 'devo') row.devo++;
    if (st === 'me_devem') row.meDevem++;
    if (st !== 'quitada') row.abertas++;
    map.set(name, row);
  }
  return [...map.values()].filter((r) => r.abertas > 0).sort((a, b) => a.colleague.localeCompare(b.colleague));
}

/**
 * Liga cada troca a no máximo UM serviço (Map serviceId → troca). Com dois serviços no mesmo dia,
 * só o serviço escolhido na troca fica permutado. Trocas antigas (sem serviceId) ficam com um
 * serviço livre do dia, de preferência o meu serviço ordinário (nunca com todos).
 */
export function swapsByService(state) {
  const byService = new Map();
  const services = state.services || [];
  const pending = [];
  for (const w of state.swaps || []) {
    if (!w.myDate) continue;
    if (!w.serviceId) {
      pending.push(w);
      continue;
    }
    // Troca que aponta um serviço nunca pega outro: se ele foi excluído ou mudou de dia, a troca aparece sozinha.
    const s = services.find((x) => x.id === w.serviceId && x.date === w.myDate);
    if (s && !byService.has(s.id)) byService.set(s.id, w);
  }
  const rank = (s) => (s.owner ? 2 : 0) + (s.paid ? 1 : 0);
  const order = (a, b) => rank(a) - rank(b) || String(a.start || '').localeCompare(String(b.start || ''))
    || String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || String(a.id).localeCompare(String(b.id));
  pending.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  for (const w of pending) {
    const s = services.filter((x) => x.date === w.myDate && !byService.has(x.id)).sort(order)[0];
    if (s) byService.set(s.id, w);
  }
  return byService;
}

/** Serviços cadastrados em um dia, na ordem em que aparecem (para escolher qual foi trocado). */
export const servicesOn = (state, date) => (state.services || []).filter((s) => s.date === date)
  .sort((a, b) => String(a.start || '').localeCompare(String(b.start || '')) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')));

/**
 * Lista unificada de turnos em um intervalo, combinando serviços cadastrados e trocas.
 * kind: 'servico' (meu) | 'cobrindo' (tiro por um militar) | 'coberto' (militar tira o meu)
 */
export function shiftsInRange(state, from, to) {
  const { settings } = state;
  const def = settings.service;
  const out = [];
  const bySvc = swapsByService(state);
  const linked = new Set(bySvc.values());
  for (const s of state.services) {
    if (s.date < from || s.date > to) continue;
    const swap = bySvc.get(s.id);
    out.push({
      id: s.id,
      date: s.date,
      start: s.start || def.start,
      hours: Number(s.hours) || def.hours,
      kind: swap ? 'coberto' : 'servico',
      active: !swap,
      owner: swap ? null : s.owner || null,
      service: s,
      swap: swap || null,
      colleague: swap?.colleague || null,
      type: s.type,
      unit: s.unit,
      paid: !!s.paid,
      value: Number(s.value) || 0,
    });
  }
  for (const w of state.swaps) {
    if (w.theirDate && w.theirDate >= from && w.theirDate <= to) {
      out.push({
        id: `swap-in-${w.id}`,
        date: w.theirDate,
        start: w.start || def.start,
        hours: Number(w.hours) || def.hours,
        kind: 'cobrindo',
        active: true,
        owner: w.colleague,
        service: null,
        swap: w,
        colleague: w.colleague,
        type: 'troca',
        unit: '',
        paid: false,
        value: 0,
      });
    }
    if (w.myDate && w.myDate >= from && w.myDate <= to && !linked.has(w)) {
      out.push({
        id: `swap-out-${w.id}`,
        date: w.myDate,
        start: w.start || def.start,
        hours: Number(w.hours) || def.hours,
        kind: 'coberto',
        active: false,
        service: null,
        swap: w,
        colleague: w.colleague,
        type: 'troca',
        unit: '',
        paid: false,
        value: 0,
      });
    }
  }
  return out.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}

/** Nome curto do militar para espaços pequenos: "Sgt Silva" → "Silva". */
export function shortName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  const n = parts.length > 1 ? parts[parts.length - 1] : parts[0] || '';
  return n.length > 8 ? `${n.slice(0, 7)}.` : n;
}

/** Serviço de um militar que eu tiro: "Troca referente ao dia 16/10" (o meu dia que ele tira). */
export function permutaDoMeuDia(sh) {
  const d = sh.swap?.myDate;
  return d ? `Troca referente ao dia ${fmtDM(d)}` : 'Troca (dia a combinar)';
}

/**
 * Meu serviço que um militar tira: "Permutado para o dia 12/10" (o dia em que eu devolvo).
 * `short` gera a versão curta para o calendário do celular.
 */
export function permutaLabel(sh, { short = false } = {}) {
  const d = sh.swap?.theirDate;
  if (short) return d ? `Perm. ${fmtDM(d)}` : 'Perm.';
  return d ? `Permutado para o dia ${fmtDM(d)}` : 'Permutado (data a combinar)';
}

/**
 * Titulares do serviço: "Sgt Silva, Cb Souza" → ['Sgt Silva', 'Cb Souza'].
 * Não separa por " e " para não quebrar sobrenomes como "Souza e Silva".
 */
export function ownersOf(sh) {
  return String(sh?.owner || '').split(/[,;/+]/).map((x) => x.trim()).filter(Boolean);
}

/** "Sgt Silva", "Sgt Silva e Cb Souza", "A, B e C". */
export function ownersText(names) {
  return names.length <= 1 ? names[0] || '' : `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

/** Versão curta para o calendário do celular: "Silva/Souza". */
export const ownersShort = (names) => names.map(shortName).join('/');

/** Quem paga o extra (os titulares do serviço): "Paga: Sgt Silva" / "Pagam: Sgt Silva e Cb Souza". */
export const payerLabel = (names) => (names.length ? `${names.length > 1 ? 'Pagam' : 'Paga'}: ${ownersText(names)}` : '');

/** De quem é o serviço que vou tirar: "Meu serviço" ou "De Sgt Silva e Cb Souza". */
export const ownerLabel = (sh) => (ownersOf(sh).length ? `De ${ownersText(ownersOf(sh))}` : 'Meu serviço');

export function shiftTitle(sh) {
  if (sh.kind === 'cobrindo') return `Serviço de ${sh.colleague}`;
  if (sh.kind === 'coberto') return permutaLabel(sh);
  const label = SERVICE_TYPES[sh.type]?.label || 'Serviço';
  const owners = ownersOf(sh);
  return owners.length ? `${label} de ${ownersText(owners)}` : label;
}

/** Turno ativo cobrindo o momento atual (considera turnos que começaram ontem). */
export function onDutyNow(state, today, now = new Date()) {
  const m = nowMin(now);
  const list = shiftsInRange(state, addDays(today, -3), today).filter((s) => s.active);
  return list.find((s) => {
    const startMin = toMin(s.start) - diffDays(s.date, today) * 1440;
    return m >= startMin && m < startMin + s.hours * 60;
  }) || null;
}

export function nextShift(state, today) {
  return shiftsInRange(state, today, addDays(today, 120)).find((s) => s.active && (s.date > today || toMin(s.start) > nowMin())) || null;
}

/** Serviços pagos ainda não recebidos (todos os meses), mais antigos primeiro. */
export function pendingPayments(state, today) {
  return state.services
    .filter((s) => s.paid && !s.receivedAt && s.date <= addDays(today, 60))
    .map((s) => ({ service: s, expected: expectedPayDate(s, state.settings), status: payStatus(s, today, state.settings) }))
    .sort((a, b) => a.expected.localeCompare(b.expected));
}

export function monthStats(state, M, today) {
  const shifts = shiftsInRange(state, monthStart(M), monthEnd(M));
  const worked = shifts.filter((s) => s.active);
  const paid = state.services.filter((s) => s.paid && monthOf(s.date) === M);
  return {
    count: worked.length,
    hours: sum(worked, (s) => s.hours),
    covered: shifts.filter((s) => s.kind === 'coberto').length,
    covering: shifts.filter((s) => s.kind === 'cobrindo').length,
    paidCount: paid.length,
    paidTotal: sum(paid, (s) => s.value),
    received: sum(paid.filter((s) => s.receivedAt), (s) => s.value),
    pending: sum(paid.filter((s) => !s.receivedAt), (s) => s.value),
    late: paid.filter((s) => payStatus(s, today, state.settings) === 'atrasado').length,
  };
}

export const daysUntil = (today, k) => diffDays(today, k);
