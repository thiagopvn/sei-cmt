// Ajustes: perfil, aparência, lembretes, escala, áreas, modelos de demanda, categorias, colegas e dados.

import { store, AREA_SLOTS, NO_ALERTS } from '../store.js';
import { esc, uid, moneyInput, parseMoney, normalize } from '../lib/util.js';
import { icon } from '../lib/icons.js';
import { todayKey } from '../lib/dates.js';
import { openModal, confirmDialog, toast } from '../ui/overlay.js';
import { field, input, select, textarea } from '../ui/fields.js';
import { permission, requestPermission, showNotification, notificationsSupported } from '../notify.js';
import { canInstall, promptInstall, isStandalone, isIOS } from '../install.js';
import { hasSample, removeSample } from '../sample.js';
import { rerender } from '../ui/bus.js';
import { cloud } from '../cloud/cloud.js';

const ALERTS = [[0, 'No dia'], [1, '1 dia'], [2, '2 dias'], [3, '3 dias'], [7, '7 dias'], [15, '15 dias'], [30, '30 dias']];

function setting(path, value) {
  store.update((s) => {
    const keys = path.split('.');
    let o = s;
    for (const k of keys.slice(0, -1)) o = o[k];
    o[keys[keys.length - 1]] = value;
  });
}

const section = (id, ic, title, body, desc = '') => `
  <section class="card settings-card" id="${id}">
    <h2>${icon(ic, 18)}${esc(title)}</h2>
    ${desc ? `<p class="muted small">${desc}</p>` : ''}
    ${body}
  </section>`;

function openTypeForm(type = null) {
  const state = store.get();
  const isNew = !type;
  const t = type || { name: '', area: null, checklist: [] };
  const m = openModal({
    title: isNew ? 'Novo tipo de demanda' : `Modelo: ${t.name}`,
    body: `
      ${field('Nome', input('name', t.name, 'required autofocus placeholder="Ex.: Ofício, Escala de férias" maxlength="60"'))}
      ${field('Área padrão', select('area', [{ value: '', label: 'Nenhuma' }, ...state.areas.map((a) => ({ value: a.id, label: a.name }))], t.area || ''))}
      ${field('Passo a passo (uma etapa por linha)', textarea('checklist', t.checklist.join('\n'), 'rows="6" placeholder="Redigir\nRevisar\nAssinar\nEnviar"'), { hint: 'Ao criar uma tarefa deste tipo, as etapas entram automaticamente.' })}`,
    footer: `${type && type.id !== 'outro' ? `<button type="button" class="btn btn-ghost-danger" data-delete>${icon('trash', 16)}Excluir</button>` : ''}<span class="spacer"></span><button type="submit" class="btn btn-primary">Salvar</button>`,
    onMount(el) {
      el.querySelector('[data-delete]')?.addEventListener('click', async () => {
        const ok = await confirmDialog({ title: 'Excluir tipo?', message: 'Tarefas desse tipo passam para “Outro”.', confirmLabel: 'Excluir', danger: true });
        if (!ok) return;
        store.update((s) => {
          s.types = s.types.filter((x) => x.id !== type.id);
          for (const tk of s.tasks) if (tk.type === type.id) tk.type = 'outro';
        }, { undoable: true });
        m.close();
      });
    },
    onSubmit(fd) {
      const data = {
        name: fd.get('name').trim(),
        area: fd.get('area') || null,
        checklist: fd.get('checklist').split('\n').map((x) => x.trim()).filter(Boolean),
      };
      store.update((s) => {
        if (isNew) {
          const base = normalize(data.name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tipo';
          const id = s.types.some((x) => x.id === base) ? `${base}-${uid().slice(0, 4)}` : base;
          s.types.splice(s.types.length - 1, 0, { id, ...data });
        } else Object.assign(s.types.find((x) => x.id === type.id), data);
      });
      toast('Modelo salvo');
    },
  });
}

function download(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
}

export default {
  id: 'ajustes',
  title: 'Ajustes',
  render({ state }) {
    const s = state.settings;
    const perm = permission();
    const permTxt = { granted: 'Ativadas neste aparelho', denied: 'Bloqueadas no navegador — libere nas configurações do site', default: 'Ainda não ativadas', unsupported: 'Este navegador não suporta notificações' }[perm];

    const install = isStandalone()
      ? `<p class="notice">${icon('check', 16)}<span>O app já está instalado e aberto em modo aplicativo.</span></p>`
      : canInstall()
        ? `<button type="button" class="btn btn-primary" data-action="aj-install">${icon('install', 16)}Instalar o app</button>`
        : isIOS()
          ? `<p class="notice">${icon('install', 16)}<span>No iPhone: abra no <strong>Safari</strong>, toque em <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>.</span></p>`
          : `<p class="notice">${icon('install', 16)}<span>No Android (Chrome): abra o menu <strong>⋮</strong> e toque em <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.</span></p>`;

    const ci = cloud.info;
    const syncPill = {
      online: ci.pending ? ['pill-soft', 'cloud', `Enviando ${ci.pending} alteração(ões)…`] : ['pill-good', 'check', 'Tudo sincronizado'],
      connecting: ['pill-soft', 'cloud', 'Conectando…'],
      offline: ['pill-warning', 'cloudOff', `Sem internet${ci.pending ? ` · ${ci.pending} alteração(ões) serão enviadas depois` : ' · as alterações serão enviadas depois'}`],
      error: ['pill-critical', 'alert', 'Erro na sincronização'],
    }[ci.status] || ['pill-soft', 'cloud', 'Desconectado'];
    const account = ci.user ? `
      <div class="account-row">
        <span class="avatar">${esc((ci.user.name || ci.user.email || '?').slice(0, 2).toUpperCase())}</span>
        <div class="row-main"><strong>${esc(ci.user.name || 'Minha conta')}</strong><span class="muted small">${esc(ci.user.email || '')}</span></div>
      </div>
      <p><span class="pill ${syncPill[0]}">${icon(syncPill[1], 13)}${esc(syncPill[2])}</span></p>
      ${ci.error ? `<p class="notice notice-serious">${icon('alert', 16)}<span>${esc(ci.error)}</span></p>` : ''}
      <p class="muted small">Seus dados ficam salvos na nuvem (Firebase) e aparecem em qualquer aparelho em que você entrar com esta conta. Sem internet, o app continua funcionando e envia as alterações quando a conexão voltar.</p>
      <button type="button" class="btn" data-action="aj-logout">${icon('logout', 16)}Sair da conta</button>`
      : `
      <p class="notice">${icon('cloudOff', 16)}<span>Você está usando o app <strong>sem conta</strong>: os dados ficam só neste aparelho. Entre para salvar na nuvem e usar no celular e no computador.</span></p>
      <button type="button" class="btn btn-primary" data-action="aj-login">${icon('cloud', 16)}Entrar</button>`;

    return `
      <header class="page-head"><h1>Ajustes</h1></header>
      <nav class="settings-nav chips">${[['conta', 'Conta'], ['perfil', 'Perfil'], ['lembretes', 'Lembretes'], ['escala-cfg', 'Escala'], ['areas', 'Áreas'], ['modelos', 'Modelos'], ['financas-cfg', 'Finanças'], ['colegas', 'Colegas'], ['dados', 'Backup'], ['instalar', 'Instalar']].map(([id, l]) => `<a class="chip" href="#/ajustes" data-action="aj-jump" data-to="${id}">${l}</a>`).join('')}</nav>
      <div class="settings">
        ${section('conta', 'cloud', 'Conta e nuvem', account)}
        ${section('perfil', 'user', 'Perfil e aparência', `
          ${field('Como quer ser chamado?', `<input data-setting="profile.name" value="${esc(state.profile.name)}" placeholder="Seu nome" maxlength="40" autocomplete="name">`)}
          <div class="grid-2">
            ${field('Tema', `<select data-setting="settings.theme">${[['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Escuro']].map(([v, l]) => `<option value="${esc(v)}" ${s.theme === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
            ${field('A semana começa no', `<select data-setting="settings.weekStart" data-num>${[[0, 'Domingo'], [1, 'Segunda']].map(([v, l]) => `<option value="${esc(v)}" ${Number(s.weekStart) === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
          </div>`)}

        ${section('lembretes', 'bell', 'Lembretes e notificações', `
          <div class="perm-row"><span class="pill ${perm === 'granted' ? 'pill-good' : perm === 'denied' ? 'pill-critical' : 'pill-soft'}">${perm === 'granted' ? icon('check', 13) : icon('bell', 13)}${permTxt}</span>
            ${notificationsSupported() && perm !== 'granted' && perm !== 'denied' ? `<button type="button" class="btn btn-primary btn-sm" data-action="aj-notify">Ativar notificações</button>` : ''}
            ${perm === 'granted' ? `<button type="button" class="btn btn-sm" data-action="aj-test">Enviar teste</button>` : ''}
          </div>
          <label class="switch-row"><span>Avisar prazos, serviços, contas e compromissos</span><span class="switch"><input type="checkbox" data-setting="settings.notifications" data-bool ${s.notifications !== false ? 'checked' : ''}><span class="switch-ui"></span></span></label>
          <div class="grid-2">
            ${field('Horário dos avisos do dia', `<input type="time" data-setting="settings.alertHour" value="${esc(s.alertHour)}">`)}
            ${field('Avisar contas', `<select data-setting="settings.billAlertDays" data-num>${[0, 1, 2, 3, 5, 7].map((n) => `<option value="${n}" ${Number(s.billAlertDays) === n ? 'selected' : ''}>${n ? `${n} dia(s) antes` : 'Só no dia'}</option>`).join('')}</select>`)}
          </div>
          ${field('Avisar serviço', `<select data-setting="settings.serviceAlertHours" data-num>${[2, 6, 12, 24].map((n) => `<option value="${n}" ${Number(s.serviceAlertHours) === n ? 'selected' : ''}>${n} horas antes</option>`).join('')}</select>`)}
          <div class="field"><span class="field-label">Aviso padrão de prazos</span>
            <div class="chips-row">${ALERTS.map(([n, l]) => `<label class="chip-check"><input type="checkbox" data-alert-day value="${n}" ${s.alertDays.includes(n) ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
            <small class="field-hint">Cada tarefa pode ter avisos próprios.</small></div>
          ${field('Duração do Pomodoro', `<select data-setting="settings.pomodoro" data-num>${[15, 25, 30, 45, 50, 60, 90].map((n) => `<option value="${n}" ${Number(s.pomodoro) === n ? 'selected' : ''}>${n} minutos</option>`).join('')}</select>`)}
          <p class="muted small">${icon('alert', 13)} Os lembretes funcionam com o app aberto ou rodando em segundo plano. Mantenha o app instalado e abra-o pelo menos uma vez por dia.</p>
        `)}

        ${section('escala-cfg', 'shield', 'Escala e serviços', `
          <div class="grid-2">
            ${field('Início padrão do serviço', `<input type="time" data-setting="settings.service.start" value="${esc(s.service.start)}">`)}
            ${field('Duração padrão', `<select data-setting="settings.service.hours" data-num>${[6, 8, 12, 24].map((n) => `<option value="${n}" ${Number(s.service.hours) === n ? 'selected' : ''}>${n} horas</option>`).join('')}</select>`)}
          </div>
          ${field('Valor padrão do serviço extra', `<input data-setting="settings.service.value" data-money inputmode="decimal" value="${moneyInput(s.service.value)}" placeholder="0,00">`)}
          <div class="grid-2">
            ${field('Previsão de pagamento', `<select data-setting="settings.service.payRule">${[['nextMonth', 'Dia fixo do mês seguinte'], ['days', 'X dias após o serviço']].map(([v, l]) => `<option value="${esc(v)}" ${s.service.payRule === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
            ${s.service.payRule === 'days'
              ? field('Dias após o serviço', `<input type="number" min="1" max="120" data-setting="settings.service.payDays" data-num value="${s.service.payDays}">`)
              : field('Dia do pagamento', `<input type="number" min="1" max="31" data-setting="settings.service.payDay" data-num value="${s.service.payDay}">`)}
          </div>`, 'Usado ao criar serviços e para calcular quando cada serviço extra deve ser pago.')}

        ${section('areas', 'grid', 'Áreas da sua vida', `
          <div class="list edit-list">${state.areas.map((a) => `
            <div class="edit-row" data-area="${esc(a.id)}">
              <span class="dot big" style="--c: var(--c${a.color})"></span>
              <input value="${esc(a.name)}" data-area-name aria-label="Nome da área" maxlength="30">
              <select data-area-color aria-label="Cor">${Array.from({ length: AREA_SLOTS }, (_, i) => `<option value="${esc(i + 1)}" ${a.color === i + 1 ? 'selected' : ''}>Cor ${i + 1}</option>`).join('')}</select>
              <button type="button" class="icon-btn" data-action="aj-area-del" data-id="${esc(a.id)}" aria-label="Excluir área">${icon('trash', 16)}</button>
            </div>`).join('')}</div>
          <button type="button" class="btn btn-sm" data-action="aj-area-add">${icon('plus', 16)}Nova área</button>`,
          'Separe o que é do trabalho, da faculdade, do concurso, da família e pessoal. Nada se mistura.')}

        ${section('modelos', 'file', 'Tipos de demanda e modelos', `
          <div class="list">${state.types.map((t) => `
            <div class="row" role="button" tabindex="0" data-action="aj-type" data-id="${esc(t.id)}">
              <div class="row-main"><div class="row-title">${esc(t.name)}</div>
                <div class="row-meta"><span class="meta">${t.checklist.length ? `${t.checklist.length} etapas` : 'Sem etapas'}</span>${t.area ? `<span class="meta">${esc(state.areas.find((a) => a.id === t.area)?.name || '')}</span>` : ''}</div></div>
              ${icon('chevronRight', 16)}
            </div>`).join('')}</div>
          <button type="button" class="btn btn-sm" data-action="aj-type-new">${icon('plus', 16)}Novo tipo</button>`,
          'Cada tipo traz um passo a passo pronto. Ex.: SEI → abrir processo, incluir documentos, assinar, tramitar.')}

        ${section('financas-cfg', 'wallet', 'Categorias financeiras', `
          <div class="grid-2">
            ${field('Receitas (uma por linha)', `<textarea rows="5" data-list="incomeCategories">${esc(s.incomeCategories.join('\n'))}</textarea>`)}
            ${field('Despesas (uma por linha)', `<textarea rows="5" data-list="expenseCategories">${esc(s.expenseCategories.join('\n'))}</textarea>`)}
          </div>`)}

        ${section('colegas', 'users', 'Colegas (para trocas)', state.colleagues.length ? `
          <div class="list edit-list">${state.colleagues.map((c) => `
            <div class="edit-row" data-colleague="${esc(c.id)}">
              <input value="${esc(c.name)}" data-col-name aria-label="Nome" maxlength="40">
              <input value="${esc(c.phone || '')}" data-col-phone type="tel" inputmode="tel" placeholder="WhatsApp" aria-label="Telefone">
              <button type="button" class="icon-btn" data-action="aj-col-del" data-id="${esc(c.id)}" aria-label="Remover">${icon('trash', 16)}</button>
            </div>`).join('')}</div>` : '<p class="muted small">Os colegas aparecem aqui quando você registra trocas.</p>')}

        ${section('dados', 'download', 'Backup e dados', `
          <p class="muted small">${ci.user ? 'Seus dados já estão na nuvem. O backup em arquivo é uma cópia extra, se quiser guardar.' : 'Sem conta, seus dados ficam só neste aparelho. Faça backup com frequência e guarde o arquivo no Drive ou no WhatsApp.'}
            ${s.lastBackup ? `Último backup: ${new Date(s.lastBackup).toLocaleDateString('pt-BR')}.` : 'Nenhum backup feito ainda.'}</p>
          <div class="btn-row">
            <button type="button" class="btn btn-primary" data-action="aj-export">${icon('download', 16)}Exportar backup</button>
            <label class="btn">${icon('upload', 16)}Restaurar backup<input type="file" accept="application/json,.json" data-import hidden></label>
          </div>
          ${hasSample(state) ? `<div class="notice">${icon('sparkles', 16)}<span>Você está vendo dados de exemplo.</span><button type="button" class="btn btn-sm" data-action="aj-sample-remove">Remover exemplos</button></div>` : ''}
          <button type="button" class="btn btn-ghost-danger" data-action="aj-reset">${icon('trash', 16)}Apagar todos os dados</button>`)}

        ${section('instalar', 'install', 'Instalar no celular', install, 'Instalado, o app abre em tela cheia, funciona sem internet e fica no seu celular como qualquer aplicativo.')}

        <p class="muted small center">Rotina Geral · versão 1.2 · ${ci.user ? 'sincronizado com o Firebase' : 'dados neste aparelho'}</p>
      </div>`;
  },
  mount(el) {
    el.querySelectorAll('[data-setting]').forEach((inp) => {
      inp.addEventListener('change', () => {
        let v = inp.type === 'checkbox' ? inp.checked : inp.value;
        if (inp.hasAttribute('data-num')) v = Number(v);
        if (inp.hasAttribute('data-money')) v = parseMoney(v);
        if (inp.dataset.setting === 'profile.name') v = String(v).trim();
        setting(inp.dataset.setting, v);
        toast('Ajuste salvo', { timeout: 1500 });
      });
    });
    el.querySelectorAll('[data-alert-day]').forEach((cb) => cb.addEventListener('change', () => {
      const days = [...el.querySelectorAll('[data-alert-day]:checked')].map((x) => Number(x.value)).sort((a, b) => b - a);
      setting('settings.alertDays', days.length ? days : NO_ALERTS);
    }));
    el.querySelectorAll('[data-list]').forEach((ta) => ta.addEventListener('change', () => {
      const list = ta.value.split('\n').map((x) => x.trim()).filter(Boolean);
      if (!list.length) return;
      setting(`settings.${ta.dataset.list}`, list);
      toast('Categorias salvas', { timeout: 1500 });
    }));
    el.querySelectorAll('[data-area]').forEach((row) => {
      const id = row.dataset.area;
      row.querySelector('[data-area-name]').addEventListener('change', (e) => {
        const name = e.target.value.trim();
        if (name) store.update((s) => { s.areas.find((a) => a.id === id).name = name; });
      });
      row.querySelector('[data-area-color]').addEventListener('change', (e) => {
        store.update((s) => { s.areas.find((a) => a.id === id).color = Number(e.target.value); });
      });
    });
    el.querySelectorAll('[data-colleague]').forEach((row) => {
      const id = row.dataset.colleague;
      row.querySelector('[data-col-name]').addEventListener('change', (e) => {
        const name = e.target.value.trim();
        if (!name) return;
        store.update((s) => {
          const c = s.colleagues.find((x) => x.id === id);
          for (const w of s.swaps) if (w.colleague === c.name) w.colleague = name;
          c.name = name;
        });
      });
      row.querySelector('[data-col-phone]').addEventListener('change', (e) => {
        store.update((s) => { s.colleagues.find((x) => x.id === id).phone = e.target.value.trim(); });
      });
    });
    el.querySelector('[data-import]')?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const ok = await confirmDialog({
        title: 'Restaurar backup?',
        message: cloud.info.user
          ? 'Os dados atuais serão substituídos pelos do arquivo neste aparelho E na nuvem (em todos os seus aparelhos). O que foi criado depois do backup será apagado.'
          : 'Os dados atuais deste aparelho serão substituídos pelos do arquivo.',
        confirmLabel: 'Restaurar',
        danger: !!cloud.info.user,
      });
      if (!ok) return;
      try {
        store.import(await file.text());
        toast('Backup restaurado', { action: { label: 'Desfazer', onClick: () => store.undo() } });
      } catch (err) {
        toast(`Não foi possível restaurar: ${err.message}`, { kind: 'error' });
      }
    });
  },
  actions: {
    'aj-jump'(btn, ev) {
      ev.preventDefault();
      document.getElementById(btn.dataset.to)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    async 'aj-notify'() {
      const r = await requestPermission();
      if (r === 'granted') {
        toast('Notificações ativadas');
        showNotification('Rotina Geral', 'Pronto! Você vai receber lembretes por aqui.', 'test');
      } else toast('As notificações não foram permitidas');
      rerender();
    },
    'aj-test'() {
      showNotification('Teste de lembrete', 'Se você está vendo isto, os avisos estão funcionando.', `test-${Date.now()}`);
    },
    'aj-install'() {
      promptInstall();
    },
    'aj-area-add'() {
      store.update((s) => {
        const used = new Set(s.areas.map((a) => a.color));
        const color = [6, 7, 2, 5, 3, 4, 8, 1].find((c) => !used.has(c)) || 6;
        s.areas.push({ id: `area-${uid().slice(0, 6)}`, name: 'Nova área', color });
      });
    },
    async 'aj-area-del'(btn) {
      const state = store.get();
      if (state.areas.length <= 1) return toast('É preciso ter pelo menos uma área');
      const area = state.areas.find((a) => a.id === btn.dataset.id);
      const n = state.tasks.filter((t) => t.area === area.id).length + state.events.filter((e) => e.area === area.id).length;
      const target = state.areas.find((a) => a.id !== area.id);
      const ok = await confirmDialog({ title: `Excluir “${area.name}”?`, message: n ? `${n} item(ns) desta área passarão para “${target.name}”.` : 'A área será removida.', confirmLabel: 'Excluir', danger: true });
      if (!ok) return;
      store.update((s) => {
        s.areas = s.areas.filter((a) => a.id !== area.id);
        for (const t of s.tasks) if (t.area === area.id) t.area = target.id;
        for (const e of s.events) if (e.area === area.id) e.area = target.id;
        for (const tp of s.types) if (tp.area === area.id) tp.area = null;
      }, { undoable: true });
      toast('Área excluída', { action: { label: 'Desfazer', onClick: () => store.undo() } });
      return null;
    },
    'aj-type'(btn) {
      openTypeForm(store.get().types.find((t) => t.id === btn.dataset.id));
    },
    'aj-type-new'() {
      openTypeForm();
    },
    'aj-col-del'(btn) {
      store.update((s) => { s.colleagues = s.colleagues.filter((c) => c.id !== btn.dataset.id); }, { undoable: true });
    },
    'aj-export'() {
      download(`rotina-geral-backup-${todayKey()}.json`, store.export());
      setting('settings.lastBackup', new Date().toISOString());
      toast('Backup exportado');
    },
    'aj-sample-remove'() {
      removeSample();
      toast('Exemplos removidos', { action: { label: 'Desfazer', onClick: () => store.undo() } });
    },
    'aj-login'() {
      window.dispatchEvent(new Event('pauta:login'));
    },
    async 'aj-logout'() {
      const ok = await confirmDialog({ title: 'Sair da conta?', message: 'Os dados continuam salvos na nuvem e voltam quando você entrar de novo. Este aparelho fica sem os dados até lá.', confirmLabel: 'Sair' });
      if (!ok) return;
      if (cloud.info.pending) {
        toast('Enviando as últimas alterações…', { timeout: 5000 });
        const synced = await cloud.waitForSync(cloud.info.status === 'online' ? 8000 : 1500);
        if (!synced) {
          const sure = await confirmDialog({ title: 'Há alterações não enviadas', message: `${cloud.info.pending} alteração(ões) ainda não chegaram à nuvem${cloud.info.status === 'online' ? '' : ' por falta de internet'}. Se sair agora, elas serão perdidas.`, confirmLabel: 'Sair mesmo assim', danger: true });
          if (!sure) return;
        }
      }
      await cloud.signOut();
    },
    async 'aj-reset'() {
      const ok = await confirmDialog({ title: 'Apagar todos os dados?', message: cloud.info.user ? 'Tarefas, escala, trocas, finanças e ajustes serão apagados deste aparelho E da nuvem (em todos os aparelhos). Faça um backup antes, se precisar.' : 'Tarefas, escala, trocas, finanças e ajustes deste aparelho serão apagados. Faça um backup antes, se precisar.', confirmLabel: 'Apagar tudo', danger: true });
      if (!ok) return;
      store.reset();
      toast('Dados apagados', { action: { label: 'Desfazer', onClick: () => store.undo() } });
    },
  },
};
