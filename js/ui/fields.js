// Pequenos construtores de campos de formulário (HTML em string).

import { esc } from '../lib/util.js';
import { WEEKDAYS_SHORT } from '../lib/dates.js';
import { FREQS } from '../domain/recurrence.js';

export const field = (label, control, { hint = '', cls = '', id = '' } = {}) => `
  <label class="field ${cls}" ${id ? `id="${id}"` : ''}>
    <span class="field-label">${esc(label)}</span>
    ${control}
    ${hint ? `<small class="field-hint">${hint}</small>` : ''}
  </label>`;

export const input = (name, value = '', attrs = '') =>
  `<input name="${name}" value="${esc(value ?? '')}" ${attrs}>`;

export const textarea = (name, value = '', attrs = '') =>
  `<textarea name="${name}" rows="3" ${attrs}>${esc(value ?? '')}</textarea>`;

export function select(name, options, value, attrs = '') {
  const opts = Array.isArray(options) ? options : Object.entries(options).map(([v, l]) => ({ value: v, label: l }));
  return `<select name="${name}" ${attrs}>${opts.map((o) => {
    const v = typeof o === 'object' ? o.value : o;
    const l = typeof o === 'object' ? o.label : o;
    return `<option value="${esc(v)}" ${String(v) === String(value ?? '') ? 'selected' : ''}>${esc(l)}</option>`;
  }).join('')}</select>`;
}

/** Botões segmentados que funcionam como radio. */
export function segmented(name, options, value) {
  return `<div class="seg" role="radiogroup">${options.map(([v, l]) => `
    <label class="seg-opt"><input type="radio" name="${name}" value="${esc(v)}" ${String(v) === String(value) ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('')}</div>`;
}

export function toggle(name, checked, label) {
  return `<label class="switch-row"><span>${esc(label)}</span>
    <span class="switch"><input type="checkbox" name="${name}" ${checked ? 'checked' : ''}><span class="switch-ui"></span></span></label>`;
}

export function weekdayChips(name, selected = []) {
  return `<div class="chips-row">${WEEKDAYS_SHORT.map((d, i) => `
    <label class="chip-check"><input type="checkbox" name="${name}" value="${i}" ${selected.includes(i) ? 'checked' : ''}><span>${d}</span></label>`).join('')}</div>`;
}

/** Bloco de repetição (frequência, dias da semana, intervalo, até). */
export function recurrenceFields(rule, { allowYearly = true } = {}) {
  const freqs = Object.entries(FREQS).filter(([k]) => allowYearly || k !== 'yearly');
  return `
    <div class="rec-block">
      ${field('Repetir', select('freq', [{ value: '', label: 'Não repete' }, ...freqs.map(([v, l]) => ({ value: v, label: l }))], rule?.freq || ''))}
      <div class="rec-extra" ${rule ? '' : 'hidden'}>
        <div class="rec-days" ${rule?.freq === 'weekly' ? '' : 'hidden'}>
          <span class="field-label">Nos dias</span>
          ${weekdayChips('days', rule?.days || [])}
        </div>
        <div class="grid-2">
          ${field('A cada', `<div class="input-suffix">${input('interval', rule?.interval || 1, 'type="number" min="1" max="99" inputmode="numeric"')}<span class="rec-unit">vez(es)</span></div>`, { cls: 'rec-interval' })}
          ${field('Até (opcional)', input('until', rule?.until || '', 'type="date"'))}
        </div>
      </div>
    </div>`;
}

export function bindRecurrence(el) {
  const freq = el.querySelector('select[name="freq"]');
  if (!freq) return;
  const sync = () => {
    const v = freq.value;
    el.querySelector('.rec-extra').hidden = !v;
    el.querySelector('.rec-days').hidden = v !== 'weekly';
    el.querySelector('.rec-interval').hidden = v === 'weekdays';
    const unit = { daily: 'dia(s)', weekly: 'semana(s)', monthly: 'mês(es)', yearly: 'ano(s)' }[v] || '';
    el.querySelector('.rec-unit').textContent = unit;
  };
  freq.addEventListener('change', sync);
  sync();
}

export function readRecurrence(fd) {
  const freq = fd.get('freq');
  if (!freq) return null;
  const rule = { freq };
  const interval = Math.max(1, Number(fd.get('interval')) || 1);
  if (interval > 1 && freq !== 'weekdays') rule.interval = interval;
  if (freq === 'weekly') rule.days = fd.getAll('days').map(Number).sort();
  if (fd.get('until')) rule.until = fd.get('until');
  return rule;
}
