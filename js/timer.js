// Cronômetro por tarefa (livre ou Pomodoro). O tempo vai para state.timeLog.

import { store } from './store.js';
import { toKey } from './lib/dates.js';
import { uid } from './lib/util.js';

function logRunning(s) {
  const t = s.timer;
  if (!t) return;
  const sec = Math.round((Date.now() - t.startedAt) / 1000);
  if (sec >= 10) {
    s.timeLog.push({ id: uid(), taskId: t.taskId, area: t.area, date: toKey(new Date(t.startedAt)), start: new Date(t.startedAt).toISOString(), sec });
  }
}

export function startTimer(taskId, { pomodoro = false } = {}) {
  store.update((s) => {
    const task = s.tasks.find((x) => x.id === taskId);
    if (!task) return;
    if (s.timer) logRunning(s);
    s.timer = {
      taskId,
      title: task.title,
      area: task.area,
      startedAt: Date.now(),
      target: pomodoro ? Number(s.settings.pomodoro) || 25 : null,
    };
    if (task.status === 'todo' && !task.recurrence) task.status = 'doing';
  });
}

/** Para o cronômetro e devolve os segundos registrados. */
export function stopTimer() {
  let sec = 0;
  store.update((s) => {
    if (!s.timer) return;
    sec = Math.round((Date.now() - s.timer.startedAt) / 1000);
    logRunning(s);
    s.timer = null;
  });
  return sec;
}

export function togglePomodoro() {
  store.update((s) => {
    if (!s.timer) return;
    s.timer.target = s.timer.target ? null : Math.ceil((Date.now() - s.timer.startedAt) / 60000) + (Number(s.settings.pomodoro) || 25);
    s.timer.notified = false;
  });
}

export const elapsedSec = (timer) => (timer ? Math.max(0, Math.round((Date.now() - timer.startedAt) / 1000)) : 0);

export function fmtClock(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const p = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

export function fmtDuration(sec) {
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r ? `${h}h ${String(r).padStart(2, '0')}min` : `${h}h`;
}
