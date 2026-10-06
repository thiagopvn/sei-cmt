// Lembretes: prazos, rotinas, compromissos, serviços e contas.
// Disparam com o app aberto (ou em segundo plano no celular, enquanto o navegador mantiver o app ativo).

import { addDays, fmtDM, fromKey, toMin, relDays, todayKey } from './lib/dates.js';
import { money } from './lib/util.js';
import { activeInstance } from './domain/tasks.js';
import { eventInstances } from './domain/events.js';
import { shiftsInRange } from './domain/shifts.js';
import { openItems } from './domain/finance.js';
import { toast } from './ui/overlay.js';

const SENT_KEY = 'pauta:notified';

function loadSent() {
  try {
    return JSON.parse(localStorage.getItem(SENT_KEY)) || {};
  } catch {
    return {};
  }
}

function saveSent(map) {
  const limit = Date.now() - 45 * 86400000;
  for (const k of Object.keys(map)) if (map[k] < limit) delete map[k];
  try {
    localStorage.setItem(SENT_KEY, JSON.stringify(map));
  } catch { /* sem espaço: ignora */ }
}

const at = (dateKey, hhmm) => {
  const d = fromKey(dateKey);
  const m = toMin(hhmm || '08:00');
  d.setHours(Math.floor(m / 60), m % 60, 0, 0);
  return d.getTime();
};

export const notificationsSupported = () => 'Notification' in window;
export const permission = () => (notificationsSupported() ? Notification.permission : 'unsupported');

export async function requestPermission() {
  if (!notificationsSupported()) return 'unsupported';
  return Notification.requestPermission();
}

export async function showNotification(title, body, tag) {
  if (permission() !== 'granted') return false;
  const opts = { body, tag, icon: 'assets/icon-192.png', badge: 'assets/icon-192.png', renotify: false };
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg) {
      await reg.showNotification(title, opts);
      return true;
    }
    new Notification(title, opts);
    return true;
  } catch {
    return false;
  }
}

/** Lista de alarmes { key, when (ms), title, body } dos próximos/últimos dias. */
export function buildAlarms(state, now = new Date()) {
  const today = todayKey(now);
  const s = state.settings;
  const hour = s.alertHour || '08:00';
  const alarms = [];

  for (const t of state.tasks) {
    const inst = activeInstance(t, today);
    if (!inst || inst.done || !inst.date) continue;
    if (t.recurrence) {
      if (inst.date === today && t.dueTime) {
        alarms.push({ key: `r:${t.id}:${inst.date}`, when: at(inst.date, t.dueTime), title: t.title, body: `Rotina de hoje às ${t.dueTime}` });
      }
      continue;
    }
    for (const n of (t.alertDays || s.alertDays || []).filter((d) => d >= 0)) {
      const day = addDays(inst.date, -n);
      const when = n === 0 && t.dueTime ? at(day, t.dueTime) - 60 * 60000 : at(day, hour);
      const body = n === 0 ? `Prazo vence hoje${t.dueTime ? ` às ${t.dueTime}` : ''}` : `Prazo vence ${relDays(inst.date, day)} (${fmtDM(inst.date)})`;
      alarms.push({ key: `t:${t.id}:${inst.date}:${n}`, when, title: t.title, body });
    }
  }

  for (const ev of state.events) {
    if (ev.reminder == null || ev.reminder === '') continue;
    for (const inst of eventInstances(ev, today, addDays(today, 2))) {
      if (inst.day > 1) continue;
      const when = ev.allDay || !ev.start ? at(inst.date, hour) : at(inst.date, ev.start) - Number(ev.reminder) * 60000;
      alarms.push({ key: `e:${ev.id}:${inst.date}`, when, title: ev.title, body: ev.allDay || !ev.start ? `Hoje${ev.location ? ` · ${ev.location}` : ''}` : `${relDays(inst.date, today) === 'hoje' ? 'Hoje' : fmtDM(inst.date)} às ${ev.start}${ev.location ? ` · ${ev.location}` : ''}` });
    }
  }

  const before = Number(s.serviceAlertHours) || 12;
  for (const sh of shiftsInRange(state, today, addDays(today, 2))) {
    if (!sh.active) continue;
    const label = sh.owner ? `Serviço de ${sh.owner} (você tira)` : 'Você está de serviço (meu serviço)';
    alarms.push({ key: `s:${sh.id}:${sh.date}`, when: at(sh.date, sh.start) - before * 3600000, title: label, body: `${relDays(sh.date, today)} (${fmtDM(sh.date)}) às ${sh.start} · ${sh.hours}h${sh.unit ? ` · ${sh.unit}` : ''}` });
  }

  const billDays = Number(s.billAlertDays) || 0;
  for (const it of openItems(state, today, billDays + 1, 1)) {
    if (it.kind !== 'despesa') continue;
    if (billDays > 0) {
      alarms.push({ key: `f:${it.key}:${it.date}:pre`, when: at(addDays(it.date, -billDays), hour), title: `Conta a pagar: ${it.title}`, body: `${money(it.amount)} · vence ${relDays(it.date, today)} (${fmtDM(it.date)})` });
    }
    alarms.push({ key: `f:${it.key}:${it.date}:due`, when: at(it.date, hour), title: `Vence hoje: ${it.title}`, body: money(it.amount) });
  }
  return alarms;
}

/**
 * Dispara os alarmes vencidos ainda não avisados. Alarmes com mais de 12h são só marcados
 * (o Radar do Início já mostra o que está pendente). No app aberto, os avisos recentes
 * viram um único aviso na tela, para não poluir.
 */
export function checkAlarms(state, now = new Date()) {
  if (state.settings.notifications === false) return;
  const sent = loadSent();
  const t = now.getTime();
  const fresh = [];
  let changed = false;
  for (const a of buildAlarms(state, now)) {
    if (sent[a.key] || a.when > t) continue;
    sent[a.key] = t;
    changed = true;
    if (t - a.when <= 12 * 3600000) fresh.push(a);
  }
  if (changed) saveSent(sent);
  if (!fresh.length) return;
  const visible = document.visibilityState === 'visible';
  if (!visible || permission() === 'granted') {
    for (const a of fresh.slice(0, 5)) showNotification(a.title, a.body, a.key);
  }
  if (visible) {
    const recent = fresh.filter((a) => t - a.when <= 30 * 60000);
    if (recent.length === 1) toast(`${recent[0].title} — ${recent[0].body}`, { timeout: 8000 });
    else if (recent.length > 1) toast(`${recent.length} lembretes agora: ${recent.slice(0, 2).map((a) => a.title).join(', ')}${recent.length > 2 ? '…' : ''}`, { timeout: 8000 });
  }
}

