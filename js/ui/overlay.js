// Janelas (modal / folha inferior no celular), confirmação, menu de ações e avisos (toast).

import { esc } from '../lib/util.js';
import { icon } from '../lib/icons.js';

const stack = [];

function root() {
  return document.getElementById('overlay-root');
}

/**
 * Abre uma janela. Com `onSubmit`, o conteúdo vira um <form>; retornar `false` mantém aberta.
 */
export function openModal({ title, body, footer = '', onSubmit, onMount, onClose, size = 'md' }) {
  const wrap = document.createElement('div');
  wrap.className = 'overlay';
  const inner = onSubmit
    ? `<form class="modal-form" novalidate><div class="modal-body">${body}</div>${footer ? `<footer class="modal-foot">${footer}</footer>` : ''}</form>`
    : `<div class="modal-body">${body}</div>${footer ? `<footer class="modal-foot">${footer}</footer>` : ''}`;
  wrap.innerHTML = `
    <div class="modal modal-${size}" role="dialog" aria-modal="true" aria-labelledby="mt-${stack.length}">
      <div class="modal-grip" aria-hidden="true"></div>
      <header class="modal-head">
        <h2 id="mt-${stack.length}">${esc(title)}</h2>
        <button type="button" class="icon-btn" data-close aria-label="Fechar">${icon('x')}</button>
      </header>
      ${inner}
    </div>`;
  const prevFocus = document.activeElement;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    wrap.classList.add('leaving');
    stack.splice(stack.indexOf(api), 1);
    setTimeout(() => wrap.remove(), 160);
    if (!stack.length) document.body.classList.remove('modal-open');
    onClose?.();
    prevFocus?.focus?.({ preventScroll: true });
  };
  const api = { el: wrap, close };
  stack.push(api);
  wrap.addEventListener('mousedown', (e) => {
    if (e.target === wrap) close();
  });
  wrap.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) close();
  });
  const form = wrap.querySelector('form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const firstInvalid = [...form.querySelectorAll('[required]')].find((i) => !String(i.value).trim());
      if (firstInvalid) {
        firstInvalid.classList.add('invalid');
        firstInvalid.focus();
        return;
      }
      if (onSubmit(new FormData(form), form, e.submitter) !== false) close();
    });
    form.addEventListener('input', (e) => e.target.classList?.remove('invalid'));
  }
  root().appendChild(wrap);
  document.body.classList.add('modal-open');
  onMount?.(wrap.querySelector('.modal'), api);
  const auto = wrap.querySelector('[autofocus]');
  if (auto && matchMedia('(pointer: fine)').matches) auto.focus();
  else wrap.querySelector('.modal').focus?.();
  return api;
}

export function closeTop() {
  const top = stack[stack.length - 1];
  if (top) top.close();
  return !!top;
}

export const hasOverlay = () => stack.length > 0;

export function confirmDialog({ title = 'Confirmar', message = '', confirmLabel = 'Confirmar', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    const m = openModal({
      title,
      size: 'sm',
      body: `<p class="muted">${esc(message)}</p>`,
      footer: `<button type="button" class="btn" data-close>Cancelar</button>
               <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(confirmLabel)}</button>`,
      onClose: () => { if (!answered) resolve(false); },
      onMount: (el) => {
        el.querySelector('[data-ok]').addEventListener('click', () => {
          answered = true;
          resolve(true);
          m.close();
        });
      },
    });
  });
}

/** Menu de opções. options: [{ value, label, sub, icon, danger }] */
export function actionSheet({ title, options }) {
  return new Promise((resolve) => {
    let answered = false;
    const m = openModal({
      title,
      size: 'sm',
      body: `<div class="sheet-list">${options.map((o, i) => `
        <button type="button" class="sheet-item ${o.danger ? 'danger' : ''}" data-i="${i}">
          ${o.icon ? `<span class="sheet-ic" ${o.color ? `style="--c: ${o.color === 'accent' ? 'var(--accent)' : `var(--c${Number(o.color) || 0})`}"` : ''}>${icon(o.icon)}</span>` : ''}
          <span class="sheet-text"><strong>${esc(o.label)}</strong>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</span>
        </button>`).join('')}</div>`,
      onClose: () => { if (!answered) resolve(null); },
      onMount: (el) => {
        el.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => {
          answered = true;
          resolve(options[Number(b.dataset.i)].value);
          m.close();
        }));
      },
    });
  });
}

export function toast(message, { action, timeout = 4500, kind = '' } = {}) {
  const host = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.setAttribute('role', 'status');
  el.innerHTML = `<span>${esc(message)}</span>${action ? `<button type="button" class="toast-btn">${esc(action.label)}</button>` : ''}`;
  const remove = () => {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 200);
  };
  if (action) {
    el.querySelector('button').addEventListener('click', () => {
      action.onClick();
      remove();
    });
  }
  // Um aviso por vez: o novo substitui o anterior.
  host.replaceChildren(el);
  setTimeout(remove, timeout);
}
