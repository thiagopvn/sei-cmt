// Formulários da escala: serviço, troca e gerador de escala.

import { store } from '../store.js';
import { esc, uid, parseMoney, moneyInput, plural } from '../lib/util.js';
import { icon } from '../lib/icons.js';
import { todayKey, addMonths, monthOf, monthEnd, fmtDM, fmtShort, addDays } from '../lib/dates.js';
import { openModal, confirmDialog, toast } from '../ui/overlay.js';
import { field, input, select, textarea, toggle, weekdayChips, segmented } from '../ui/fields.js';
import { SERVICE_TYPES, PATTERNS, generateDates, expectedPayDate, ownersOf, ownersText, swapsByService, servicesOn } from '../domain/shifts.js';

const HOURS = [6, 8, 12, 24, 48].map((h) => ({ value: h, label: `${h} horas` }));

function colleagueList(state) {
  const names = new Set([...state.colleagues.map((c) => c.name), ...state.swaps.map((w) => w.colleague)].filter(Boolean));
  return `<datalist id="colleague-list">${[...names].sort().map((n) => `<option value="${esc(n)}">`).join('')}</datalist>`;
}

export function openServiceForm({ service = null, date = null } = {}) {
  const state = store.get();
  const def = state.settings.service;
  const isNew = !service;
  const s = service || {
    date: date || todayKey(), start: def.start, hours: def.hours, type: 'ordinario', unit: '', owner: '',
    paid: false, value: def.value || 0, payExpected: '', receivedAt: '', notes: '',
  };
  const swap = service ? swapsByService(state).get(service.id) || null : null;
  const body = `
    ${swap ? `<div class="notice notice-swap">${icon('swap', 16)}<span><strong>${esc(swap.colleague)}</strong> vai tirar este serviço por você${swap.theirDate ? `; você devolve em ${fmtShort(swap.theirDate)}` : ' (devolução a combinar)'}.
      <span class="notice-actions"><button type="button" class="btn btn-sm" data-swap-open>Ver troca</button><button type="button" class="btn btn-sm btn-ghost-danger" data-swap-undo>${icon('undo', 14)}Desfazer permuta</button></span></span></div>` : ''}
    <div class="grid-2">
      ${field('Data', input('date', s.date, 'type="date" required'))}
      ${field('Início', input('start', s.start, 'type="time" required'))}
    </div>
    <div class="grid-2">
      ${field('Duração', select('hours', HOURS.some((h) => h.value === Number(s.hours)) ? HOURS : [...HOURS, { value: s.hours, label: `${s.hours} horas` }], s.hours))}
      ${field('Tipo', select('type', Object.fromEntries(Object.entries(SERVICE_TYPES).map(([k, v]) => [k, v.label])), s.type))}
    </div>
    ${field('De quem é o serviço', segmented('ownerKind', [['meu', 'Meu'], ['outro', 'De outro militar']], s.owner || (isNew && s.type === 'extra') ? 'outro' : 'meu'))}
    <div class="owner-field" ${s.owner || (isNew && s.type === 'extra') ? '' : 'hidden'}>
      ${field('De quem você vai tirar', `${input('owner', s.owner || '', 'list="colleague-list" placeholder="Ex.: Sgt Silva" autocomplete="off" maxlength="120"')}${colleagueList(state)}`, { hint: 'Se for de mais de um militar, separe por vírgula. Ex.: Sgt Silva, Cb Souza' })}
    </div>
    ${field('Local / unidade / função', input('unit', s.unit, 'placeholder="Ex.: 1º GBM, Viatura ABT, Sala de operações" autocomplete="off"'))}
    ${toggle('paid', s.paid, 'Serviço pago (gera valor a receber)')}
    <div class="pay-fields" ${s.paid ? '' : 'hidden'}>
      <div class="grid-2">
        ${field('Valor', input('value', moneyInput(s.value), 'inputmode="decimal" placeholder="0,00"'))}
        ${field('Previsão de pagamento', input('payExpected', s.payExpected || '', 'type="date"'), { hint: `Padrão: ${fmtDM(expectedPayDate({ ...s, payExpected: '' }, state.settings))}` })}
      </div>
      ${toggle('received', !!s.receivedAt, 'Já recebi por este serviço')}
      <div class="received-field" ${s.receivedAt ? '' : 'hidden'}>
        ${field('Recebido em', input('receivedAt', s.receivedAt || todayKey(), 'type="date"'))}
      </div>
    </div>
    ${field('Anotações', textarea('notes', s.notes, 'placeholder="Equipe, observações…"'))}
  `;
  const footer = `
    ${service ? `<button type="button" class="btn btn-ghost-danger" data-delete>${icon('trash', 16)}Excluir</button>` : ''}
    <span class="spacer"></span>
    ${service && !swap ? `<button type="button" class="btn" data-swap>${icon('swap', 16)}Trocar</button>` : ''}
    <button type="submit" class="btn btn-primary">${isNew ? 'Adicionar' : 'Salvar'}</button>`;

  const m = openModal({
    title: isNew ? 'Novo serviço' : 'Serviço',
    body,
    footer,
    onMount(el) {
      const paid = el.querySelector('[name="paid"]');
      el.querySelector('[name="type"]').addEventListener('change', (e) => {
        paid.checked = !!SERVICE_TYPES[e.target.value]?.paid;
        paid.dispatchEvent(new Event('change'));
        // Extra: normalmente é de outro militar — já abre o campo do nome.
        if (e.target.value === 'extra' && !el.querySelector('[name="owner"]').value) {
          el.querySelector('[name="ownerKind"][value="outro"]').checked = true;
          el.querySelector('.owner-field').hidden = false;
        }
      });
      paid.addEventListener('change', () => { el.querySelector('.pay-fields').hidden = !paid.checked; });
      el.querySelectorAll('[name="ownerKind"]').forEach((r) => r.addEventListener('change', () => {
        const outro = el.querySelector('[name="ownerKind"]:checked')?.value === 'outro';
        el.querySelector('.owner-field').hidden = !outro;
        if (outro) el.querySelector('[name="owner"]').focus();
      }));
      el.querySelector('[name="received"]').addEventListener('change', (e) => {
        el.querySelector('.received-field').hidden = !e.target.checked;
      });
      el.querySelector('[data-swap]')?.addEventListener('click', () => {
        m.close();
        openSwapForm({ myDate: service.date, serviceId: service.id });
      });
      el.querySelector('[data-swap-open]')?.addEventListener('click', () => {
        m.close();
        openSwapForm({ swap });
      });
      el.querySelector('[data-swap-undo]')?.addEventListener('click', async () => {
        if (await undoSwap(swap)) m.close();
      });
      el.querySelector('[data-delete]')?.addEventListener('click', async () => {
        const ok = await confirmDialog({ title: 'Excluir serviço?', message: `Serviço de ${fmtShort(service.date)} será removido da escala.`, confirmLabel: 'Excluir', danger: true });
        if (!ok) return;
        store.update((st) => { st.services = st.services.filter((x) => x.id !== service.id); }, { undoable: true });
        m.close();
        toast('Serviço excluído', { action: { label: 'Desfazer', onClick: () => store.undo() } });
      });
    },
    onSubmit(fd, form) {
      const paid = fd.get('paid') === 'on';
      // Vários titulares: guardados como "Sgt Silva, Cb Souza".
      const owner = fd.get('ownerKind') === 'outro' ? ownersOf({ owner: fd.get('owner') }).join(', ') : '';
      if (fd.get('ownerKind') === 'outro' && !owner) {
        form.querySelector('[name="owner"]').classList.add('invalid');
        form.querySelector('[name="owner"]').focus();
        toast('Informe de qual militar é o serviço');
        return false;
      }
      const data = {
        owner,
        date: fd.get('date'),
        start: fd.get('start'),
        hours: Number(fd.get('hours')) || 24,
        type: fd.get('type'),
        unit: fd.get('unit').trim(),
        paid,
        value: paid ? parseMoney(fd.get('value')) : 0,
        payExpected: paid ? fd.get('payExpected') || '' : '',
        receivedAt: paid && fd.get('received') === 'on' ? fd.get('receivedAt') || todayKey() : null,
        notes: fd.get('notes').trim(),
      };
      store.update((st) => {
        if (isNew) st.services.push({ id: uid(), ...data, createdAt: new Date().toISOString() });
        else Object.assign(st.services.find((x) => x.id === service.id), data);
        for (const name of ownersOf({ owner })) {
          if (!st.colleagues.some((c) => c.name === name)) st.colleagues.push({ id: uid(), name, phone: '' });
        }
      });
      toast(isNew ? 'Serviço adicionado à escala' : 'Serviço salvo');
    },
  });
  return m;
}

/**
 * Desfaz uma permuta (apaga a troca): o meu serviço volta a ser meu e o serviço do outro militar
 * sai da escala. Pede confirmação e oferece "Desfazer". Retorna true se desfez.
 */
export async function undoSwap(swap) {
  const parts = [
    swap.myDate ? `o seu serviço de ${fmtShort(swap.myDate)} volta a ser seu` : '',
    swap.theirDate ? `o serviço de ${swap.colleague} em ${fmtShort(swap.theirDate)} sai da sua escala` : '',
  ].filter(Boolean);
  const ok = await confirmDialog({
    title: 'Desfazer a permuta?',
    message: `Troca com ${swap.colleague}: ${parts.join(' e ')}.`,
    confirmLabel: 'Desfazer permuta',
    danger: true,
  });
  if (!ok) return false;
  store.update((st) => { st.swaps = st.swaps.filter((x) => x.id !== swap.id); }, { undoable: true });
  toast('Permuta desfeita', { action: { label: 'Desfazer', onClick: () => store.undo() } });
  return true;
}

/** Descrição curta de um serviço para escolher qual foi trocado: "08:00 · 24h · Escala ordinária · QCG". */
function serviceOption(s) {
  const owners = ownersOf(s);
  const kind = `${SERVICE_TYPES[s.type]?.label || 'Serviço'}${owners.length ? ` de ${ownersText(owners)}` : ''}`;
  return [s.start, `${s.hours}h`, kind, s.unit].filter(Boolean).join(' · ');
}

/**
 * Com mais de um serviço no mesmo dia, pergunta qual deles foi trocado.
 * Os que já estão em outra troca aparecem marcados.
 */
function servicePicker(state, date, selected, swapId) {
  const list = date ? servicesOn(state, date) : [];
  if (list.length < 2) return '';
  const taken = swapsByService(state);
  // Numerados: dois serviços iguais (mesmo horário e local) também podem ser escolhidos.
  const opts = list.map((s, i) => {
    const other = taken.get(s.id);
    return { value: s.id, label: `${i + 1}º · ${serviceOption(s)}${other && other.id !== swapId ? ` (já permutado com ${other.colleague})` : ''}` };
  });
  const free = list.find((s) => !taken.get(s.id) || taken.get(s.id).id === swapId);
  const value = list.some((s) => s.id === selected) ? selected : (free || list[0]).id;
  return field('Qual serviço desse dia?', select('serviceId', opts, value), { hint: `Você tem ${list.length} serviços neste dia. Só o escolhido fica permutado.` });
}

/** Registrar ou editar uma troca de serviço. */
export function openSwapForm({ swap = null, myDate = '', theirDate = '', serviceId = null } = {}) {
  const state = store.get();
  const def = state.settings.service;
  const isNew = !swap;
  const w = swap || { colleague: '', myDate, theirDate, serviceId, start: def.start, hours: def.hours, notes: '', settled: false };
  // Troca antiga sem serviceId: parte do serviço que hoje aparece como permutado.
  const linkedId = w.serviceId || (swap ? [...swapsByService(state)].find(([, x]) => x.id === swap.id)?.[0] : null) || null;
  const phone = state.colleagues.find((c) => c.name === w.colleague)?.phone || '';
  const body = `
    <p class="muted small">Uma troca tem dois lados. Preencha o que já estiver combinado; o outro pode ficar “a combinar”.</p>
    ${field('Militar', `${input('colleague', w.colleague, 'required autofocus list="colleague-list" placeholder="Ex.: Sgt Silva" autocomplete="off"')}${colleagueList(state)}`)}
    ${field('WhatsApp do militar (opcional)', input('phone', phone, 'type="tel" inputmode="tel" placeholder="(21) 99999-9999"'))}
    <div class="swap-legs">
      <div class="swap-leg">
        <span class="swap-leg-ic out">${icon('arrowUp', 16)}</span>
        ${field('Ele tira o MEU serviço em', input('myDate', w.myDate || '', 'type="date"'), { hint: 'Deixe vazio se ainda não foi combinado.' })}
      </div>
      <div class="swap-svc">${servicePicker(state, w.myDate, linkedId, swap?.id)}</div>
      <div class="swap-leg">
        <span class="swap-leg-ic in">${icon('arrowDown', 16)}</span>
        ${field('Eu tiro o serviço DELE em', input('theirDate', w.theirDate || '', 'type="date"'), { hint: 'A devolução (ou o dia em que eu cubro).' })}
      </div>
    </div>
    <div class="grid-2">
      ${field('Início do turno', input('start', w.start || def.start, 'type="time"'))}
      ${field('Duração', select('hours', HOURS, w.hours || def.hours))}
    </div>
    ${field('Observações', textarea('notes', w.notes))}
    ${swap ? toggle('settled', w.settled, 'Marcar troca como quitada') : ''}
  `;
  const footer = `
    ${swap ? `<button type="button" class="btn btn-ghost-danger" data-delete>${icon('undo', 16)}Desfazer permuta</button>` : ''}
    <span class="spacer"></span>
    <button type="submit" class="btn btn-primary">${isNew ? 'Registrar troca' : 'Salvar'}</button>`;
  const m = openModal({
    title: isNew ? 'Registrar troca' : 'Troca de serviço',
    body,
    footer,
    onMount(el) {
      el.querySelector('[name="myDate"]').addEventListener('change', (e) => {
        const cur = el.querySelector('[name="serviceId"]')?.value || linkedId;
        el.querySelector('.swap-svc').innerHTML = servicePicker(store.get(), e.target.value, cur, swap?.id);
      });
      el.querySelector('[data-delete]')?.addEventListener('click', async () => {
        if (await undoSwap(swap)) m.close();
      });
    },
    onSubmit(fd, form) {
      const my = fd.get('myDate') || null;
      const their = fd.get('theirDate') || null;
      if (!my && !their) {
        form.querySelector('[name="myDate"]').classList.add('invalid');
        toast('Informe pelo menos uma das datas da troca');
        return false;
      }
      const name = fd.get('colleague').trim();
      // Qual serviço foi trocado: o escolhido na lista ou o único serviço do dia.
      const sameDay = my ? servicesOn(store.get(), my) : [];
      const svc = sameDay.find((x) => x.id === fd.get('serviceId')) || (sameDay.length === 1 ? sameDay[0] : null);
      const data = {
        colleague: name, myDate: my, theirDate: their, serviceId: svc?.id || null, start: fd.get('start'), hours: Number(fd.get('hours')) || 24,
        notes: fd.get('notes').trim(), settled: fd.get('settled') === 'on',
      };
      store.update((st) => {
        if (isNew) st.swaps.push({ id: uid(), ...data, createdAt: new Date().toISOString() });
        else Object.assign(st.swaps.find((x) => x.id === swap.id), data);
        const ph = fd.get('phone').trim();
        const c = st.colleagues.find((x) => x.name === name);
        if (c) c.phone = ph || c.phone;
        else if (name) st.colleagues.push({ id: uid(), name, phone: ph });
      });
      toast(isNew ? 'Troca registrada' : 'Troca salva');
    },
  });
  return m;
}

/** Gera a escala automaticamente (24x72, 12x36, dias fixos…). */
export function openGeneratorForm() {
  const state = store.get();
  const def = state.settings.service;
  const start = todayKey();
  const until = monthEnd(addMonths(monthOf(start), 3));
  const body = `
    <p class="muted small">Cadastre de uma vez os seus serviços ordinários. Datas que já têm serviço não são duplicadas.</p>
    ${field('Regime', select('pattern', Object.fromEntries(Object.entries(PATTERNS).map(([k, v]) => [k, v.label])), '24x72'))}
    <div class="grid-2">
      ${field('Primeiro serviço', input('start', start, 'type="date" required'))}
      ${field('Gerar até', input('until', until, 'type="date" required'))}
    </div>
    <div class="gen-custom" hidden>${field('A cada quantos dias?', input('every', 4, 'type="number" min="1" max="60" inputmode="numeric"'))}</div>
    <div class="gen-weekly" hidden><span class="field-label">Dias da semana</span>${weekdayChips('weekdays', [])}</div>
    <div class="grid-2">
      ${field('Início', input('time', def.start, 'type="time"'))}
      ${field('Duração', select('hours', HOURS, def.hours))}
    </div>
    <div class="grid-2">
      ${field('Tipo', select('type', Object.fromEntries(Object.entries(SERVICE_TYPES).map(([k, v]) => [k, v.label])), 'ordinario'))}
      ${field('Local / unidade', input('unit', '', 'placeholder="Opcional" autocomplete="off"'))}
    </div>
    <div class="gen-preview notice" aria-live="polite"></div>
  `;
  const read = (form) => {
    const fd = new FormData(form);
    return {
      pattern: fd.get('pattern'),
      start: fd.get('start'),
      until: fd.get('until'),
      every: fd.get('every'),
      weekdays: fd.getAll('weekdays').map(Number),
    };
  };
  openModal({
    title: 'Gerar escala',
    body,
    footer: '<span class="spacer"></span><button type="submit" class="btn btn-primary">Gerar serviços</button>',
    onMount(el) {
      const form = el.querySelector('form');
      const preview = () => {
        const opts = read(form);
        el.querySelector('.gen-custom').hidden = opts.pattern !== 'custom';
        el.querySelector('.gen-weekly').hidden = opts.pattern !== 'semanal';
        const p = PATTERNS[opts.pattern];
        if (p?.hours && form.dataset.lastPattern !== opts.pattern) form.hours.value = p.hours;
        form.dataset.lastPattern = opts.pattern;
        const dates = generateDates(opts);
        const existing = new Set(store.get().services.map((x) => x.date));
        const fresh = dates.filter((d) => !existing.has(d));
        el.querySelector('.gen-preview').innerHTML = dates.length
          ? `${icon('calendar', 16)}<span>${plural(fresh.length, 'serviço novo', 'serviços novos')}${dates.length > fresh.length ? ` (${dates.length - fresh.length} já cadastrados)` : ''}. Próximos: ${fresh.slice(0, 4).map(fmtDM).join(', ')}${fresh.length > 4 ? '…' : ''}</span>`
          : `${icon('alert', 16)}<span>Nenhuma data gerada com essas opções.</span>`;
      };
      form.addEventListener('input', preview);
      form.addEventListener('change', preview);
      preview();
    },
    onSubmit(fd, form) {
      const opts = read(form);
      const existing = new Set(store.get().services.map((x) => x.date));
      const dates = generateDates(opts).filter((d) => !existing.has(d));
      if (!dates.length) {
        toast('Nada a gerar com essas opções');
        return false;
      }
      const type = fd.get('type');
      store.update((st) => {
        for (const d of dates) {
          st.services.push({
            id: uid(), date: d, start: fd.get('time'), hours: Number(fd.get('hours')) || 24, type, unit: fd.get('unit').trim(),
            paid: !!SERVICE_TYPES[type]?.paid, value: SERVICE_TYPES[type]?.paid ? def.value || 0 : 0, payExpected: '', receivedAt: null, notes: '', createdAt: new Date().toISOString(),
          });
        }
      }, { undoable: true });
      toast(`${plural(dates.length, 'serviço gerado', 'serviços gerados')} até ${fmtDM(addDays(dates[dates.length - 1], 0))}`, { action: { label: 'Desfazer', onClick: () => store.undo() } });
    },
  });
}

export function whatsappLink(phone, text = '') {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  const full = digits.length <= 11 ? `55${digits}` : digits;
  return `https://wa.me/${full}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

