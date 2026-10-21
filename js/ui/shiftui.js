// Como um serviço aparece na tela (calendário, mini-calendário, listas e ficha).
//
// Regra visual única, para não confundir:
//   cor        = DE QUEM É  (vermelho: meu · roxo: de outro militar · verde/dourado: extra recebido/a receber)
//   cheio      = 24h ou mais (o dia inteiro)
//   claro      = MENOS DE 24h (6h, 8h, 10h, 12h, 14h…): fundo da cor clareado, contorno e as horas em destaque
//   tracejado  = NÃO TIRO  (permutado: outro militar tira; eu devolvo na data indicada)
//   amarelo    = rendição fora do padrão (ex.: rende 18h em vez de 08h)
//   dobra laranja no canto = tem observação (o texto aparece ao passar o mouse, no painel do dia e na ficha)

import { esc } from '../lib/util.js';
import { icon } from '../lib/icons.js';
import { fmtDM } from '../lib/dates.js';
import {
  ownersOf, ownersText, shortName, permutaLabel, payStatus, rendicao, hhLabel, shiftTitle, shiftEnd, shiftNote,
} from '../domain/shifts.js';

/** Serviço de menos de 24h (6h, 8h, 10h, 12h, 14h…). 24h e 48h são "cheios". */
export const isPartial = (sh) => Number(sh?.hours) > 0 && Number(sh.hours) < 24;

/** Classe de duração: 'd-parcial' (menos de 24h) ou 'd-cheio'. */
export const durationClass = (sh) => (isPartial(sh) ? 'd-parcial' : 'd-cheio');

/** "8h–18h": entrada e saída de um serviço de menos de 24h (nos de 24h é redundante). */
export function timeSpan(sh) {
  if (!sh?.start) return '';
  return `${hhLabel(sh.start)}–${hhLabel(shiftEnd(sh).time)}`;
}

/** 'meu' | 'outro' | 'pago' | 'areceber' | 'perm' */
export function shiftTone(sh) {
  if (sh.kind === 'coberto') return 'perm';
  if (sh.kind === 'cobrindo') return 'outro';
  if (sh.paid) return sh.service?.receivedAt ? 'pago' : 'areceber';
  return ownersOf(sh).length ? 'outro' : 'meu';
}

/** Turnos que eu tiro primeiro (definem a cor do dia), depois os permutados. */
export const byDuty = (a, b) => Number(b.active) - Number(a.active) || (a.start || '').localeCompare(b.start || '');

/** De quem é o serviço: nomes dos titulares (extra/alheio) ou do militar da troca. */
function whoseNames(sh) {
  if (sh.kind === 'cobrindo') return [sh.colleague].filter(Boolean);
  if (sh.kind === 'coberto' && sh.origin) return [sh.origin.colleague].filter(Boolean);
  return ownersOf(sh);
}

/** Selo amarelo da rendição fora do padrão: "⏱18h". */
export function rendBadge(sh, settings, size = 10) {
  const r = rendicao(sh, settings);
  return r ? `<b class="rend" title="Rendição às ${esc(r)} (fora do padrão)">${icon('clock', size)}${esc(hhLabel(r))}</b>` : '';
}

/**
 * Etiqueta do calendário: { cls, long, short, tip }.
 * `long` (computador): texto completo; `short` (celular): um nome por linha + detalhe.
 */
export function shiftPill(sh, state, today) {
  const p = basePill(sh, state, today);
  const note = shiftNote(sh);
  if (note) {
    p.cls += ' has-note';
    p.tip += ` · Obs.: ${note}`;
  }
  p.note = note;
  return p;
}

function basePill(sh, state, today) {
  const tone = shiftTone(sh);
  const rend = rendBadge(sh, state.settings);
  const partial = isPartial(sh);
  const cls = `t-${tone} k-${sh.kind} ${durationClass(sh)}`;
  const nm = (n) => `<span class="nm">${esc(shortName(n))}</span>`;
  const rendText = rendicao(sh, state.settings) ? ` · rende ${hhLabel(rendicao(sh, state.settings))}` : '';
  // Menos de 24h: as horas ganham destaque ("10h") e, no computador, o horário ("8h–18h").
  const hoursTag = partial ? `<b class="hrs">${sh.hours}h</b>` : `${sh.hours}h`;
  const spanTag = partial ? `<span class="span">${esc(timeSpan(sh))}</span>` : '';
  const hoursText = partial ? `${sh.hours}h (${timeSpan(sh)})` : `${sh.hours}h`;

  if (tone === 'perm') {
    const d = sh.swap?.theirDate;
    const by = sh.colleague ? `${sh.colleague} tira` : '';
    return {
      cls,
      // "Permutado → 11/11" (a frase inteira "Permutado para o dia…" fica na dica e no painel do dia).
      long: `Permutado ${icon('arrowRight', 10)}${d ? fmtDM(d) : 'a combinar'}${sh.colleague ? `<small class="cal-ref">${esc(shortName(sh.colleague))} tira</small>` : ''}`,
      short: `Perm.<small class="cal-ref">${d ? `→${fmtDM(d)}` : 'a comb.'}</small>`,
      tip: `NÃO TIRO — ${permutaLabel(sh)}${by ? ` (${by})` : ''}${sh.origin ? ` · era o serviço de ${sh.origin.colleague}` : ''} · ${hoursText}`,
    };
  }

  const names = whoseNames(sh);
  const status = sh.paid && sh.service ? payStatus(sh.service, today, state.settings) : null;
  const mark = status === 'recebido' ? icon('check', 10) : status === 'atrasado' ? icon('alert', 10) : '';
  const hours = `${sh.hours}h`;

  if (sh.kind === 'cobrindo') {
    const swapRef = `${icon('swap', 10)}${sh.swap?.myDate ? fmtDM(sh.swap.myDate) : 'troca'}`;
    return {
      cls,
      long: `Serviço de ${esc(sh.colleague)}<small class="cal-ref">${partial ? `${hoursTag}${spanTag}` : ''}${swapRef}${rend}</small>`,
      // No celular cabe um detalhe só: rendição > horas (se menos de 24h) > data da troca.
      short: `${names.map(nm).join('')}<small class="cal-ref">${rend || (partial ? hoursTag : swapRef)}</small>`,
      tip: `EU TIRO — ${shiftTitle(sh)} · ${hoursText} · troca do meu dia ${sh.swap?.myDate ? fmtDM(sh.swap.myDate) : '(a combinar)'}${rendText}`,
    };
  }

  const word = sh.paid ? 'Extra' : 'Serviço';
  const pay = sh.paid ? ` (${status === 'recebido' ? 'recebido' : status === 'atrasado' ? 'pagamento atrasado' : 'a receber'})` : '';
  if (names.length) {
    return {
      cls,
      long: `${word} de ${esc(ownersText(names))}<small class="cal-ref">${sh.paid ? icon('coins', 10) : ''}${hoursTag}${spanTag}${mark}${rend}</small>`,
      short: `${names.map(nm).join('')}<small class="cal-ref">${rend || hoursTag}${mark}</small>`,
      tip: `EU TIRO — ${word} de ${ownersText(names)}${pay} · ${hoursText}${rendText}`,
    };
  }
  return sh.paid
    ? { cls, long: `Extra<small class="cal-ref">${icon('coins', 10)}${hoursTag}${spanTag}${mark}${rend}</small>`, short: rend ? `<span class="nm">Extra</span><small class="cal-ref">${rend}${mark}</small>` : `${hoursTag}${mark}`, tip: `EU TIRO — Extra${pay} · ${hoursText}${rendText}` }
    : { cls, long: `Meu serviço<small class="cal-ref">${rend ? `${rend} ${hoursTag}` : `${hoursTag}${spanTag}`}</small>`, short: rend ? `<span class="nm">Meu</span><small class="cal-ref">${rend}</small>` : hoursTag, tip: `EU TIRO — Meu serviço · ${hoursText}${rendText}` };
}

/** Linha de observação para listas, painel do dia e Início (texto completo, quebras preservadas). */
export function noteLine(sh, size = 14) {
  const n = shiftNote(sh);
  return n ? `<div class="note-line">${icon('note', size)}<span>${esc(n)}</span></div>` : '';
}

/** Pílula da rendição fora do padrão para listas: "Rende 18h". */
export function rendPill(sh, settings) {
  const r = rendicao(sh, settings);
  return r ? `<span class="pill pill-rend">${icon('clock', 13)}Rende ${esc(hhLabel(r))}</span>` : '';
}

/** Selo "Você tira" / "Não tira" para listas e ficha. */
export function dutyTag(sh) {
  const tone = shiftTone(sh);
  return sh.active
    ? `<span class="duty-tag t-${tone}">${icon('shield', 12)}Você tira</span>`
    : `<span class="duty-tag t-perm">${icon('arrowRight', 12)}Não tira</span>`;
}

/** Legenda única do calendário e do mini-calendário: a cor diz de quem é; cheio/claro diz a duração. */
export function shiftLegend() {
  // No celular começa recolhida; no computador fica sempre aberta (o resumo some via CSS).
  const open = typeof matchMedia !== 'function' || matchMedia('(min-width: 900px)').matches;
  return `<details class="cal-legend-box" ${open ? 'open' : ''}><summary>${icon('chevronDown', 14)}Legenda</summary><div class="cal-legend">
    <span><span class="legend-sw t-meu"></span>Meu serviço</span>
    <span><span class="legend-sw t-outro"></span>De outro militar (eu tiro)</span>
    <span><span class="legend-sw t-pago"></span>Extra recebido</span>
    <span><span class="legend-sw t-areceber"></span>Extra a receber</span>
    <span><span class="legend-sw t-perm"></span>Permutado (não tiro)</span>
    <span class="legend-sep" aria-hidden="true"></span>
    <span><span class="legend-sw d-cheio"></span>24h (cheio)</span>
    <span><span class="legend-sw d-parcial">10h</span>Menos de 24h (claro, com as horas)</span>
    <span><b class="rend">${icon('clock', 10)}18h</b>Rendição fora das 08h</span>
    <span><span class="legend-sw has-note"></span>Com observação (passe o mouse ou toque)</span>
  </div></details>`;
}
