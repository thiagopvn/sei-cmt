// Ficha do serviço: deixa claro se EU TIRO ou NÃO TIRO, a rendição, a saída, o caminho da troca
// (inclusive permuta da permuta) e as ações: trocar/repassar, ver a troca, desfazer, editar.

import { store } from '../store.js';
import { esc, money } from '../lib/util.js';
import { icon } from '../lib/icons.js';
import { fmtLong, fmtShort, fmtDM, hoursLabel, todayKey } from '../lib/dates.js';
import { openModal, toast } from '../ui/overlay.js';
import { textarea } from '../ui/fields.js';
import {
  shiftsInRange, swapChain, shiftEnd, rendicao, hhLabel, ownersOf, ownersText, permutaLabel,
  SERVICE_TYPES, payStatus, PAY_LABEL, shiftNotes,
} from '../domain/shifts.js';
import { shiftTone } from '../ui/shiftui.js';
import { openServiceForm, openSwapForm, undoSwap } from './service.js';

/** De quem é / o que é este turno, numa frase. */
function whoLine(sh, state, today) {
  if (sh.kind === 'coberto') {
    const back = sh.swap?.theirDate ? `você devolve em ${fmtShort(sh.swap.theirDate)}` : 'devolução a combinar';
    const was = sh.origin ? ` Era o serviço de ${sh.origin.colleague} (troca).` : '';
    return `${sh.colleague} tira por você · ${back}.${was}`;
  }
  if (sh.kind === 'cobrindo') {
    return `Serviço de ${sh.colleague} — troca do seu dia ${sh.swap?.myDate ? fmtShort(sh.swap.myDate) : '(a combinar)'}.`;
  }
  const owners = ownersOf(sh);
  const type = SERVICE_TYPES[sh.type]?.label || 'Serviço';
  const pay = sh.paid && sh.service ? ` · ${PAY_LABEL[payStatus(sh.service, today, state.settings)]}` : '';
  return owners.length ? `${sh.paid ? 'Extra' : 'Serviço'} de ${ownersText(owners)}${pay}.` : `${type}${pay}.`;
}

/** Caminho da troca, passo a passo; destaca o passo deste turno. */
function chainHtml(state, sh) {
  const base = sh.origin || sh.swap;
  if (!base) return '';
  const chain = swapChain(state, base);
  if (!chain.length) return '';
  const here = new Set([sh.swap?.id, sh.origin?.id].filter(Boolean));
  const steps = chain.map((w, i) => {
    const verb = w.fromSwapId ? 'Repassou' : 'Passou';
    const mine = w.fromSwapId ? 'o serviço' : 'o seu serviço';
    return `<li class="${here.has(w.id) ? 'here' : ''}">
      <span class="chain-n">${i + 1}</span>
      <span>${verb} ${mine} de <strong>${w.myDate ? fmtDM(w.myDate) : '—'}</strong> para <strong>${esc(w.colleague)}</strong>;
      em troca, tira o dele em <strong>${w.theirDate ? fmtDM(w.theirDate) : 'data a combinar'}</strong>.</span>
    </li>`;
  }).join('');
  return `<section class="chain"><h3>${icon('swap', 15)}Caminho da troca</h3><ol>${steps}</ol></section>`;
}

export function openShiftSheet(shift) {
  const state = store.get();
  const today = todayKey();
  const sh = shiftsInRange(state, shift.date, shift.date).find((x) => x.id === shift.id) || shift;
  const tone = shiftTone(sh);
  const end = shiftEnd(sh);
  const rend = rendicao(sh, state.settings);
  const def = state.settings.service?.start || '08:00';
  const works = sh.active;

  const banner = `<div class="duty-banner t-${tone}">
    <span class="db-ic">${icon(works ? 'shield' : 'arrowRight', 22)}</span>
    <div><strong>${works ? 'Você tira este serviço' : 'Você NÃO tira este serviço'}</strong><small>${esc(whoLine(sh, state, today))}</small></div>
  </div>`;
  // Observação: em destaque logo abaixo do "você tira / não tira", com edição aqui mesmo.
  // Grava no serviço (se existe) ou na troca.
  const notes = shiftNotes(sh);
  const target = sh.service ? { list: 'services', id: sh.service.id } : sh.swap ? { list: 'swaps', id: sh.swap.id } : null;
  const current = (sh.service ? sh.service.notes : sh.swap?.notes) || '';
  const noteBox = `<section class="note-box ${notes.length ? '' : 'is-empty'}">
    <div class="note-head">${icon('note', 16)}<strong>Observação</strong>${target ? `<button type="button" class="link-btn" data-sh="note">${notes.length ? 'Editar' : 'Adicionar'}</button>` : ''}</div>
    ${notes.length ? `<p class="note-text">${notes.map((n) => esc(n.text)).join('<br>')}</p>` : '<p class="muted small">Nada anotado. Ex.: quem vai tirar, se pode ter troca, o que confirmar.</p>'}
    ${target ? `<div class="note-edit" hidden><div class="field">${textarea('note', current, 'rows="3" maxlength="400" placeholder="Ex.: quem vai tirar é o Sgt X · pode ter troca · confirmar com o Cap Y"')}</div>
      <div class="note-actions"><button type="button" class="btn btn-sm" data-sh="note-cancel">Cancelar</button><button type="button" class="btn btn-sm btn-primary" data-sh="note-save">Salvar</button></div></div>` : ''}
  </section>`;
  const facts = `<dl class="facts">
    <div class="${rend ? 'is-rend' : ''}"><dt>Rendição</dt><dd>${rend ? `<b class="rend">${icon('clock', 12)}${esc(hhLabel(rend))}</b> fora do padrão (${esc(def)})` : esc(sh.start)}</dd></div>
    <div><dt>Saída</dt><dd>${end.date === sh.date ? '' : `${fmtShort(end.date)} · `}${esc(end.time)}</dd></div>
    <div><dt>Duração</dt><dd>${hoursLabel(sh.hours)}</dd></div>
    ${sh.unit ? `<div><dt>Local</dt><dd>${esc(sh.unit)}</dd></div>` : ''}
    ${sh.paid ? `<div><dt>Valor</dt><dd>${money(sh.value)}</dd></div>` : ''}
  </dl>`;

  // Ações conforme o tipo de turno.
  const actions = [];
  if (sh.kind === 'servico') {
    actions.push(['swap', 'Trocar este serviço', 'btn-primary']);
    actions.push(['edit', 'Editar serviço', '']);
  } else if (sh.kind === 'cobrindo') {
    actions.push(['pass', 'Repassar (trocar de novo)', 'btn-primary']);
    actions.push(['view', 'Ver troca', '']);
  } else {
    actions.push(['undo', 'Desfazer permuta', 'btn-ghost-danger']);
    actions.push(['view', 'Ver troca', '']);
    if (sh.service) actions.push(['edit', 'Editar serviço', '']);
  }
  const footer = actions.map(([k, label, cls]) => `<button type="button" class="btn ${cls}" data-sh="${k}">${label}</button>`).join('');

  const m = openModal({
    title: fmtLong(sh.date),
    size: 'sm',
    body: `${banner}${noteBox}${facts}${chainHtml(state, sh)}
      ${sh.kind === 'cobrindo' ? '<p class="muted small">Não vai poder tirar? Use “Repassar” para passar este serviço a outro militar — dá para repassar quantas vezes precisar.</p>' : ''}`,
    footer: `<div class="sheet-actions">${footer}</div>`,
    onMount(el) {
      // Observação editada aqui mesmo (sem <form>: a janela já trata o submit do formulário principal).
      const noteEdit = el.querySelector('.note-edit');
      const noteInput = noteEdit?.querySelector('textarea');
      el.querySelectorAll('[data-sh]').forEach((b) => b.addEventListener('click', async () => {
        const k = b.dataset.sh;
        if (k === 'note' || k === 'note-cancel') {
          noteEdit.hidden = k === 'note-cancel';
          if (k === 'note') noteInput.focus();
          return;
        }
        if (k === 'note-save') {
          const text = noteInput.value.trim();
          store.update((st) => {
            const rec = st[target.list].find((x) => x.id === target.id);
            if (rec) rec.notes = text;
          });
          toast(text ? 'Observação salva' : 'Observação removida');
          m.close();
          openShiftSheet(shift);
          return;
        }
        if (k === 'undo') {
          if (await undoSwap(sh.swap)) m.close();
          return;
        }
        m.close();
        if (k === 'edit') openServiceForm({ service: sh.service });
        else if (k === 'swap') openSwapForm({ myDate: sh.date, serviceId: sh.service?.id || null, start: sh.start, hours: sh.hours });
        else if (k === 'pass') openSwapForm({ myDate: sh.date, fromSwapId: sh.swap.id, start: sh.start, hours: sh.hours });
        else if (k === 'view') openSwapForm({ swap: sh.swap });
      }));
    },
  });
  return m;
}
