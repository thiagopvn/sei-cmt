// Tela de entrada. O acesso é restrito às contas autorizadas (ALLOWED_EMAILS).

import { esc } from '../lib/util.js';
import { icon } from '../lib/icons.js';
import { cloud, authErrorMessage, isDevHost } from '../cloud/cloud.js';

const GOOGLE = `<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;

/**
 * @param {HTMLElement} el
 * @param {{ message?: string, kind?: 'error'|'ok', onLocal?: () => void }} opts
 */
export function renderLogin(el, { message = '', kind = 'error', onLocal } = {}) {
  el.innerHTML = `
    <div class="auth">
      <div class="auth-card card">
        <div class="auth-brand"><img class="brand-logo" src="assets/logo-256.png" alt="Brasão do Grupamento Operacional do Comando Geral – CBMERJ" width="104" height="104"><strong>Rotina Geral</strong><small>GOCG · CBMERJ</small></div>
        <h1>Entrar</h1>
        <p class="muted">Agenda, escala, finanças e tarefas sincronizadas entre celular e computador.</p>
        <form class="auth-form" novalidate>
          <label class="field"><span class="field-label">E-mail</span><input name="email" type="email" inputmode="email" autocomplete="email" required placeholder="voce@email.com"></label>
          <label class="field"><span class="field-label">Senha</span><input name="password" type="password" autocomplete="current-password" required placeholder="Sua senha"></label>
          <div class="auth-msg ${kind === 'ok' ? 'ok' : ''}" role="alert" ${message ? '' : 'hidden'}>${esc(message)}</div>
          <button type="submit" class="btn btn-primary auth-submit">Entrar</button>
          <button type="button" class="link-btn" data-reset>Esqueci minha senha</button>
        </form>
        <div class="auth-or"><span>ou</span></div>
        <button type="button" class="btn auth-google" data-google>${GOOGLE}Continuar com Google</button>
        <p class="auth-foot muted small">${icon('shield', 14)} Acesso restrito ao titular.</p>
      </div>
      ${isDevHost() ? '<button type="button" class="link-btn auth-local" data-local>Usar sem conta (desenvolvimento)</button>' : ''}
    </div>`;

  const form = el.querySelector('form');
  const msg = el.querySelector('.auth-msg');
  const submit = el.querySelector('.auth-submit');
  const show = (text, ok = false) => {
    msg.hidden = !text;
    msg.textContent = text;
    msg.classList.toggle('ok', ok);
  };
  const busy = (on) => {
    el.querySelectorAll('button').forEach((b) => { b.disabled = on; });
    submit.textContent = on ? 'Aguarde…' : 'Entrar';
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const email = String(fd.get('email')).trim();
    const password = String(fd.get('password'));
    if (!email || !password) return show('Preencha e-mail e senha.');
    busy(true);
    show('');
    try {
      await cloud.signIn(email, password);
    } catch (err) {
      busy(false);
      show(authErrorMessage(err));
    }
  });

  el.querySelector('[data-reset]').addEventListener('click', async () => {
    const email = String(form.email.value).trim();
    if (!email) {
      form.email.focus();
      return show('Digite seu e-mail acima e toque em “Esqueci minha senha” de novo.');
    }
    try {
      await cloud.resetPassword(email);
      show('Se este e-mail tiver acesso, enviamos um link para redefinir a senha. Confira também o spam.', true);
    } catch (err) {
      show(authErrorMessage(err));
    }
  });

  el.querySelector('[data-google]').addEventListener('click', async () => {
    busy(true);
    show('');
    try {
      await cloud.signInWithGoogle();
    } catch (err) {
      busy(false);
      show(authErrorMessage(err));
    }
  });

  el.querySelector('[data-local]')?.addEventListener('click', () => onLocal?.());
}
