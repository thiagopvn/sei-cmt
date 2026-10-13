// Como um serviço aparece na tela (calendário, mini-calendário, listas e ficha).
//
// Regra visual única, para não confundir:
//   sólido     = EU TIRO   (vermelho: meu · roxo: de outro militar · verde/dourado: extra recebido/a receber)
//   tracejado  = NÃO TIRO  (permutado: outro militar tira; eu devolvo na data indicada)
//   amarelo    = rendição fora do padrão (ex.: rende 18h em vez de 08h)

import { esc } from '../lib/util.js';
import { icon } from '../lib/icons.js';
import { fmtDM } from '../lib/dates.js';
import {
  ownersOf, ownersText, shortName, permutaLabel, payStatus, rendicao, hhLabel, shiftTitle,
} from '../domain/shifts.js';

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
  const tone = shiftTone(sh);
  const rend = rendBadge(sh, state.settings);
  const cls = `t-${tone} k-${sh.kind}`;
  const nm = (n) => `<span class="nm">${esc(shortName(n))}</span>`;
  const rendText = rendicao(sh, state.settings) ? ` · rende ${hhLabel(rendicao(sh, state.settings))}` : '';

  if (tone === 'perm') {
    const d = sh.swap?.theirDate;
    const by = sh.colleague ? `${sh.colleague} tira` : '';
    return {
      cls,
      // "Permutado → 11/11" (a frase inteira "Permutado para o dia…" fica na dica e no painel do dia).
      long: `Permutado ${icon('arrowRight', 10)}${d ? fmtDM(d) : 'a combinar'}${sh.colleague ? `<small class="cal-ref">${esc(shortName(sh.colleague))} tira</small>` : ''}`,
      short: `Perm.<small class="cal-ref">${d ? `→${fmtDM(d)}` : 'a comb.'}</small>`,
      tip: `NÃO TIRO — ${permutaLabel(sh)}${by ? ` (${by})` : ''}${sh.origin ? ` · era o serviço de ${sh.origin.colleague}` : ''}`,
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
      long: `Serviço de ${esc(sh.colleague)}<small class="cal-ref">${swapRef}${rend}</small>`,
      // No celular a rendição tem prioridade sobre a data da troca (cabe só um detalhe).
      short: `${names.map(nm).join('')}<small class="cal-ref">${rend || swapRef}</small>`,
      tip: `EU TIRO — ${shiftTitle(sh)} · troca do meu dia ${sh.swap?.myDate ? fmtDM(sh.swap.myDate) : '(a combinar)'}${rendText}`,
    };
  }

  const word = sh.paid ? 'Extra' : 'Serviço';
  const pay = sh.paid ? ` (${status === 'recebido' ? 'recebido' : status === 'atrasado' ? 'pagamento atrasado' : 'a receber'})` : '';
  const detail = `${sh.paid ? icon('coins', 10) : ''}${rend || hours}${mark}`;
  if (names.length) {
    return {
      cls,
      long: `${word} de ${esc(ownersText(names))}<small class="cal-ref">${sh.paid ? icon('coins', 10) : ''}${hours}${mark}${rend}</small>`,
      short: `${names.map(nm).join('')}<small class="cal-ref">${rend || hours}${mark}</small>`,
      tip: `EU TIRO — ${word} de ${ownersText(names)}${pay} · ${hours}${rendText}`,
    };
  }
  return sh.paid
    ? { cls, long: `Extra<small class="cal-ref">${icon('coins', 10)}${hours}${mark}${rend}</small>`, short: rend ? `<span class="nm">Extra</span><small class="cal-ref">${rend}${mark}</small>` : `${hours}${mark}`, tip: `EU TIRO — Extra${pay} · ${hours}${rendText}` }
    : { cls, long: `Meu serviço<small class="cal-ref">${rend ? `${rend} ${hours}` : hours}</small>`, short: rend ? `<span class="nm">Meu</span><small class="cal-ref">${rend}</small>` : hours, tip: `EU TIRO — Meu serviço · ${hours}${rendText}` };
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

/** Legenda única do calendário e do mini-calendário. */
export function shiftLegend() {
  return `<div class="cal-legend">
    <span><span class="legend-sw t-meu"></span>Meu serviço</span>
    <span><span class="legend-sw t-outro"></span>De outro militar (eu tiro)</span>
    <span><span class="legend-sw t-pago"></span>Extra recebido</span>
    <span><span class="legend-sw t-areceber"></span>Extra a receber</span>
    <span><span class="legend-sw t-perm"></span>Permutado (não tiro)</span>
    <span><b class="rend">${icon('clock', 10)}18h</b>Rendição fora das 08h</span>
  </div>`;
}
