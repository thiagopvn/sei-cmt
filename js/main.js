// Inicialização: navegação, renderização, eventos globais, cronômetro e lembretes.

import { store } from './store.js';
import { todayKey } from './lib/dates.js';
import { icon } from './lib/icons.js';
import { esc } from './lib/util.js';
import { actions, newItemMenu } from './actions.js';
import { closeTop, hasOverlay, toast } from './ui/overlay.js';
import { checkAlarms, showNotification } from './notify.js';
import { elapsedSec, fmtClock, stopTimer, togglePomodoro, fmtDuration } from './timer.js';
import { openItems } from './domain/finance.js';
import { pendingPayments } from './domain/shifts.js';
import './install.js';
import { cloud } from './cloud/cloud.js';
import { renderLogin } from './views/login.js';

import inicio from './views/inicio.js';
import agenda from './views/agenda.js';
import tarefas from './views/tarefas.js';
import escala from './views/escala.js';
import financas from './views/financas.js';
import ajustes from './views/ajustes.js';

const VIEWS = { inicio, agenda, tarefas, escala, financas, ajustes };
const NAV = [
  ['inicio', 'Início', 'home'],
  ['agenda', 'Agenda', 'calendar'],
  ['tarefas', 'Tarefas', 'tasks'],
  ['escala', 'Escala', 'shield'],
  ['financas', 'Finanças', 'wallet'],
];

let currentId = null;
let currentRaw = null;
let lastDay = todayKey();
/** 'boot' (carregando) | 'login' | 'app' */
let phase = 'boot';
let cloudStarted = false;
let sdkFailed = false;

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query] = raw.split('?');
  return { id: VIEWS[path] ? path : 'inicio', params: new URLSearchParams(query || ''), raw };
}

function buildShell() {
  const link = ([id, label, ic], cls) => `<a class="${cls}" data-nav="${id}" href="#/${id}">${icon(ic, 22)}<span>${label}</span><span class="nav-badge" hidden></span></a>`;
  document.getElementById('side-nav').innerHTML = NAV.map((n) => link(n, 'side-link')).join('')
    + `<a class="side-link" data-nav="ajustes" href="#/ajustes">${icon('settings', 22)}<span>Ajustes</span></a>`;
  document.getElementById('bottom-nav').innerHTML = NAV.map((n) => link(n, 'tab-link')).join('');
  document.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = icon(el.dataset.icon, Number(el.dataset.size) || 20); });
}

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else delete root.dataset.theme;
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg || '#f4f5f7');
}

function updateBadges(state, today) {
  const lateTasks = state.tasks.filter((t) => !t.recurrence && t.status !== 'done' && t.due && t.due < today).length;
  const lateBills = openItems(state, today, 0, 3).filter((i) => i.kind === 'despesa' && i.date < today).length;
  const latePay = pendingPayments(state, today).filter((p) => p.status === 'atrasado').length;
  const counts = { tarefas: lateTasks, financas: lateBills, escala: latePay };
  document.querySelectorAll('[data-nav]').forEach((a) => {
    const b = a.querySelector('.nav-badge');
    if (!b) return;
    const n = counts[a.dataset.nav] || 0;
    b.hidden = !n;
    b.textContent = n > 9 ? '9+' : String(n);
  });
}

function renderTimer(state) {
  const bar = document.getElementById('timerbar');
  const t = state.timer;
  document.body.classList.toggle('has-timer', !!t);
  if (!t) {
    bar.hidden = true;
    bar.innerHTML = '';
    return;
  }
  bar.hidden = false;
  bar.innerHTML = `
    <span class="tb-pulse" aria-hidden="true"></span>
    <button type="button" class="tb-text" data-action="task-open" data-id="${esc(t.taskId)}" data-key="once">
      <strong>${esc(t.title)}</strong><span class="tb-mode">${t.target ? `Pomodoro de ${t.target} min` : 'Cronômetro'}</span>
    </button>
    <span class="tb-clock" aria-live="off">${fmtClock(elapsedSec(t))}</span>
    <button type="button" class="btn btn-sm tb-pomo ${t.target ? 'on' : ''}" data-action="timer-pomodoro" aria-pressed="${!!t.target}" title="Modo Pomodoro">${icon('target', 16)}<span class="hide-sm">Pomodoro</span></button>
    <button type="button" class="icon-btn tb-stop" data-action="timer-stop" aria-label="Parar e registrar tempo">${icon('stop', 18)}</button>`;
}

function tickTimer() {
  const t = store.get().timer;
  if (!t) return;
  const sec = elapsedSec(t);
  const clock = document.querySelector('#timerbar .tb-clock');
  if (clock) clock.textContent = fmtClock(t.target ? Math.max(0, t.target * 60 - sec) : sec);
  if (t.target && sec >= t.target * 60) {
    const logged = stopTimer();
    showNotification('Pomodoro concluído', `${t.title} — ${fmtDuration(logged)}. Faça uma pausa de 5 minutos.`, 'pomodoro');
    toast(`Pomodoro concluído: ${fmtDuration(logged)} registrados. Hora de uma pausa!`, { timeout: 8000 });
  }
}

function render() {
  if (phase !== 'app') return;
  const { id, params, raw } = parseHash();
  const view = VIEWS[id];
  const state = store.get();
  const today = todayKey();
  const changedView = id !== currentId;
  if (changedView || raw !== currentRaw) view.enter?.(params);
  currentId = id;
  currentRaw = raw;
  applyTheme(state.settings.theme);
  const el = document.getElementById('view');
  const y = window.scrollY;
  el.innerHTML = view.render({ state, today, params });
  view.mount?.(el, { state, today, params });
  if (changedView) window.scrollTo(0, 0);
  else if (Math.abs(window.scrollY - y) > 1) window.scrollTo(0, y);
  document.querySelectorAll('[data-nav]').forEach((a) => {
    const on = a.dataset.nav === id;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  document.title = id === 'inicio' ? 'Rotina Geral' : `${view.title} · Rotina Geral`;
  renderTimer(state);
  tickTimer();
  updateBadges(state, today);
}

const shellActions = {
  'timer-pomodoro'() {
    togglePomodoro();
  },
};

function onClick(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const name = el.dataset.action;
  const view = VIEWS[currentId];
  const fn = view?.actions?.[name] || actions[name] || shellActions[name];
  if (!fn) return;
  if (el.tagName === 'A' && name !== 'go') e.preventDefault();
  fn.call(view, el, e, { state: store.get(), today: todayKey() });
}

function onKey(e) {
  const tag = e.target.tagName;
  const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable;
  if (e.key === 'Escape' && closeTop()) return;
  if (phase !== 'app') return;
  if ((e.key === 'Enter' || e.key === ' ') && !typing && e.target.matches('[role="button"][data-action]')) {
    e.preventDefault();
    e.target.click();
    return;
  }
  if (typing || e.metaKey || e.ctrlKey || e.altKey || hasOverlay()) return;
  if (e.key === 'n') {
    e.preventDefault();
    newItemMenu();
  } else if (e.key === '/') {
    const q = document.querySelector('[data-quick] input, [data-search]');
    if (q) {
      e.preventDefault();
      q.focus();
    }
  } else if (/^[1-6]$/.test(e.key)) {
    const id = [...NAV.map((n) => n[0]), 'ajustes'][Number(e.key) - 1];
    location.hash = `#/${id}`;
  }
}

function minuteTick() {
  if (phase !== 'app') return;
  const t = todayKey();
  if (t !== lastDay) {
    lastDay = t;
    render();
  }
  checkAlarms(store.get());
}

// ---------- Conta e sincronização ----------

const SYNC_LABEL = {
  online: 'Sincronizado',
  connecting: 'Conectando…',
  offline: 'Sem internet',
  error: 'Erro na sincronização',
};

function renderSync(info) {
  for (const el of document.querySelectorAll('[data-sync]')) {
    if (!info.user) {
      el.hidden = true;
      continue;
    }
    el.hidden = false;
    const sending = info.status === 'online' && info.pending > 0;
    const label = sending ? 'Enviando…' : SYNC_LABEL[info.status] || '';
    el.className = `sync-ind st-${sending ? 'sending' : info.status}`;
    el.title = `${label}${info.pending ? ` · ${info.pending} alteração(ões) a enviar` : ''}`;
    el.setAttribute('aria-label', el.title);
    el.innerHTML = `${icon(info.status === 'offline' || info.status === 'error' ? 'cloudOff' : 'cloud', 18)}<span class="sync-text">${label}${info.pending && info.status !== 'online' ? ` · ${info.pending}` : ''}</span>`;
  }
}

function showApp() {
  phase = 'app';
  document.body.classList.remove('auth-screen');
  currentId = null;
  render();
}

function showLogin(message = '') {
  phase = 'login';
  document.body.classList.add('auth-screen');
  renderTimer({ timer: null });
  renderLogin(document.getElementById('view'), {
    message,
    fresh: true,
    onLocal: () => {
      cloud.setLocalMode(true);
      showApp();
    },
  });
}

async function startCloud() {
  if (cloudStarted) return;
  cloudStarted = true;
  const hadAccount = !!localStorage.getItem('pauta:owner');
  if (hadAccount) showApp(); // abre na hora com a cópia local; a nuvem atualiza em seguida
  else if (phase !== 'app') document.getElementById('view').innerHTML = '<div class="splash"><span class="brand-mark">✓</span><p class="muted">Carregando…</p></div>';
  // Internet lenta: não deixa a pessoa presa no "Carregando…".
  const slow = setTimeout(() => {
    if (phase === 'boot') showLogin('A conexão está lenta. Aguarde, tente entrar ou use o app sem conta.');
  }, 8000);
  try {
    await cloud.init((user) => {
      if (user) {
        if (phase !== 'app') {
          toast(`Conectado como ${user.email || user.name}`);
          showApp();
        }
      } else if (!cloud.localMode) {
        showLogin();
      }
    });
  } catch {
    clearTimeout(slow);
    cloudStarted = false;
    sdkFailed = true;
    if (hadAccount) toast('Sem internet: usando os dados salvos neste aparelho.', { timeout: 6000 });
    else showLogin('Sem conexão com a internet para entrar agora. Conecte-se ou use o app sem conta.');
  }
}

function init() {
  buildShell();
  cloud.subscribe((info) => {
    renderSync(info);
    if (currentId === 'ajustes' && phase === 'app') render();
  });
  // Abriu sem internet: quando a conexão voltar, recarrega para baixar o Firebase
  // (o navegador não tenta de novo um módulo que falhou). Os dados já estão salvos no
  // aparelho e as alterações ficam na fila de envio.
  window.addEventListener('online', () => {
    if (cloudStarted || cloud.localMode || !sdkFailed) return;
    if (hasOverlay()) {
      toast('A internet voltou.', { action: { label: 'Sincronizar', onClick: () => location.reload() }, timeout: 15000 });
    } else {
      location.reload();
    }
  });
  window.addEventListener('pauta:login', () => {
    cloud.setLocalMode(false);
    if (cloudStarted && !cloud.info.user) showLogin();
    else startCloud();
  });
  store.subscribe(render);
  window.addEventListener('hashchange', render);
  window.addEventListener('pauta:render', render);
  document.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey);
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme(store.get().settings.theme));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') minuteTick();
  });
  if (cloud.localMode) showApp();
  else startCloud();
  setInterval(tickTimer, 1000);
  setInterval(minuteTick, 60000);
  setTimeout(minuteTick, 2500);

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* sem service worker: o app funciona online */ });
  }
}

init();

