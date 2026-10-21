// Exportar PDF: uma página A4 deitada com o mês inteiro — calendário com serviços, prazos,
// compromissos e contas; ao lado, a lista dos serviços (quem tira, horário, troca, observação),
// os prazos e compromissos e as contas; no rodapé, a legenda.
//
// A página é montada pelo próprio app e enviada à impressão do navegador, onde se escolhe
// "Salvar como PDF". Sem biblioteca externa: funciona offline e o texto sai vetorial (nítido).

import { store } from './store.js';
import { cloud } from './cloud/cloud.js';
import { esc, money } from './lib/util.js';
import { icon } from './lib/icons.js';
import {
  todayKey, monthOf, monthStart, monthEnd, startOfWeek, addDays, diffDays, fromKey, monthLabel, fmtDM, WEEKDAYS_SHORT,
} from './lib/dates.js';
import { collectRange, LAYERS } from './domain/agenda.js';
import { shiftsInRange, monthStats, shiftTitle, shiftNote, permutaLabel, hhLabel } from './domain/shifts.js';
import { shiftPill, shiftTone, isPartial, timeSpan, byDuty } from './ui/shiftui.js';
import { agendaItemColor, colorVar, areaOf } from './ui/parts.js';
import { toast } from './ui/overlay.js';

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function whoLabel(state) {
  const u = cloud.info.user;
  const raw = (state.profile.name || u?.name || '').trim().split(/\s+/)[0] || (u?.email || '').split('@')[0].split(/[._\-+\d]/)[0];
  return raw ? `Área de ${cap(raw)}` : '';
}

const dayCell = (d) => `<span class="p-d">${fromKey(d).getDate()}<small>${WEEKDAYS_SHORT[fromKey(d).getDay()]}</small></span>`;

/** Uma célula do mês: número do dia, serviços (com observação) e os demais itens. O que não couber, fitPage tira. */
function cellHtml(state, d, items, today, M) {
  const shifts = items.filter((i) => i.layer === 'servico').map((i) => i.ref.shift).sort(byDuty);
  const others = items.filter((i) => i.layer !== 'servico');
  const parts = [];
  for (const sh of shifts) {
    const p = shiftPill(sh, state, today);
    parts.push(`<div class="p-shift ${p.cls}">${p.long}</div>${p.note ? `<div class="p-note">${esc(p.note)}</div>` : ''}`);
  }
  for (const i of others) {
    parts.push(`<div class="p-item ${i.done ? 'done' : ''}" style="--c: ${colorVar(agendaItemColor(state, i))}">${i.time ? `<b>${esc(i.time)}</b> ` : ''}${esc(i.title)}</div>`);
  }
  const dow = fromKey(d).getDay();
  return `<div class="p-cell ${monthOf(d) !== M ? 'out' : ''} ${d === today ? 'today' : ''} ${dow === 0 || dow === 6 ? 'weekend' : ''}">
    <div class="p-day"><span class="p-num">${fromKey(d).getDate()}</span></div>${parts.join('')}
  </div>`;
}

function list(title, ic, rows, grow = false) {
  if (!rows.length) return '';
  return `<section class="${grow ? 'grow' : ''}">
    <h2>${icon(ic, 12)}${esc(title)}<span class="p-count">${rows.length}</span></h2>
    <ul>${rows.slice(0, 60).join('')}</ul>
  </section>`;
}

const overflows = (el) => el.scrollHeight > el.clientHeight + 0.5;

/**
 * Encaixe: a página tem tamanho fixo, então o que não cabe sai e vira "+n" — nunca um texto
 * cortado ao meio. Mede na tela (o #print-root tem layout mesmo fora da área visível).
 */
function fitPage(root) {
  for (const cell of root.querySelectorAll('.p-cell')) {
    if (!overflows(cell)) continue;
    const more = document.createElement('div');
    more.className = 'p-more';
    cell.appendChild(more);
    let hidden = 0;
    while (overflows(cell) && cell.children.length > 2) {
      cell.children[cell.children.length - 2].remove(); // o último item antes do "+n"
      hidden++;
      more.textContent = `+${hidden} ${hidden === 1 ? 'item' : 'itens'}`;
    }
  }
  const sections = [...root.querySelectorAll('.p-side section')];
  const hidden = new Map(sections.map((s) => [s, 0]));
  for (let guard = 0; guard < 500; guard++) {
    const s = sections.filter(overflows).sort((a, b) => b.scrollHeight - b.clientHeight - (a.scrollHeight - a.clientHeight))[0];
    if (!s) break;
    const lis = s.querySelectorAll('ul > li:not(.p-more)');
    if (lis.length <= 1) break;
    lis[lis.length - 1].remove();
    hidden.set(s, hidden.get(s) + 1);
    let more = s.querySelector('li.p-more');
    if (!more) {
      more = document.createElement('li');
      more.className = 'p-more';
      s.querySelector('ul').appendChild(more);
    }
    more.textContent = `+${hidden.get(s)} não ${hidden.get(s) === 1 ? 'coube' : 'couberam'} nesta página`;
  }
}

function sideHtml(state, M, today, map, layers) {
  const on = (l) => !layers || layers.includes(l);
  const sections = [];

  if (on('servico')) {
    const shifts = shiftsInRange(state, monthStart(M), monthEnd(M)).sort((a, b) => a.date.localeCompare(b.date) || byDuty(a, b));
    sections.push(list('Serviços do mês', 'shield', shifts.map((sh) => {
      const note = shiftNote(sh);
      const what = sh.kind === 'coberto' ? `${permutaLabel(sh)}${sh.colleague ? ` · ${sh.colleague} tira` : ''}` : shiftTitle(sh);
      const when = [
        `${hhLabel(sh.start)} · ${sh.hours}h${isPartial(sh) ? ` (${timeSpan(sh)})` : ''}`,
        sh.unit || null,
        sh.kind === 'cobrindo' && sh.swap?.myDate ? `troca do meu dia ${fmtDM(sh.swap.myDate)}` : null,
        sh.paid ? `${money(sh.value)} ${sh.service?.receivedAt ? 'recebido' : 'a receber'}` : null,
      ].filter(Boolean).join(' · ');
      return `<li class="${sh.active ? '' : 'dim'}">${dayCell(sh.date)}<span class="p-t"><strong>${esc(what)}</strong> <span class="p-tag t-${shiftTone(sh)}">${sh.active ? 'eu tiro' : 'não tiro'}</span><span class="p-sub">${esc(when)}</span>${note ? `<i>${icon('note', 9)}${esc(note)}</i>` : ''}</span></li>`;
    }), true));
  }

  const agenda = [];
  const bills = [];
  for (const [d, items] of map) {
    if (monthOf(d) !== M) continue;
    for (const it of items) {
      if (it.layer === 'tarefa' || it.layer === 'evento' || it.layer === 'rotina') agenda.push([d, it]);
      else if (it.layer === 'financa') bills.push([d, it]);
    }
  }
  if (agenda.length) {
    sections.push(list('Prazos e compromissos', 'calendar', agenda.map(([d, it]) => {
      const a = areaOf(state, it.area);
      return `<li class="${it.done ? 'done' : ''}">${dayCell(d)}<span class="p-t"><span class="p-dot" style="--c: ${colorVar(agendaItemColor(state, it))}"></span><strong>${esc(it.title)}</strong><span class="p-sub">${it.time ? `${esc(it.time)} · ` : ''}${esc(it.sub)}${a ? ` · ${esc(a.name)}` : ''}</span></span></li>`;
    }), !sections.length));
  }
  if (bills.length) {
    sections.push(list('Contas e recebimentos', 'wallet', bills.map(([d, it]) => `<li class="${it.done ? 'done' : ''}">${dayCell(d)}<span class="p-t"><strong>${esc(it.title)}</strong><span class="p-sub">${esc(it.sub)}${it.done ? ' · pago' : ''}</span></span></li>`)));
  }
  return sections.join('') || '<section class="grow"><h2>Mês livre</h2><p class="p-sub">Nada marcado para este mês.</p></section>';
}

function statsHtml(state, M, today, map) {
  const st = monthStats(state, M, today);
  let tasks = 0;
  let events = 0;
  for (const [d, items] of map) {
    if (monthOf(d) !== M) continue;
    for (const it of items) {
      if (it.layer === 'tarefa') tasks++;
      else if (it.layer === 'evento') events++;
    }
  }
  const tile = (b, s) => `<div class="p-stat"><b>${b}</b><span>${s}</span></div>`;
  return `<div class="p-stats">
    ${tile(st.count, st.count === 1 ? 'serviço' : 'serviços')}
    ${tile(`${st.hours}h`, 'de serviço')}
    ${st.covered + st.covering ? tile(st.covered + st.covering, st.covered + st.covering === 1 ? 'troca' : 'trocas') : ''}
    ${st.paidTotal ? tile(money(st.paidTotal), st.pending ? `extras · ${money(st.pending)} a receber` : 'extras · tudo recebido') : ''}
    ${tasks ? tile(tasks, tasks === 1 ? 'prazo' : 'prazos') : ''}
    ${events ? tile(events, events === 1 ? 'compromisso' : 'compromissos') : ''}
  </div>`;
}

function legendHtml() {
  const sw = (cls, label) => `<span><span class="p-sw ${cls}"></span>${label}</span>`;
  return `<div class="p-legend">
    ${sw('t-meu', 'Meu serviço')}${sw('t-outro', 'De outro militar (eu tiro)')}${sw('t-pago', 'Extra recebido')}${sw('t-areceber', 'Extra a receber')}
    ${sw('t-perm', 'Permutado (não tiro)')}${sw('d-cheio', '24h')}${sw('d-parcial', 'Menos de 24h')}${sw('rend', 'Rendição fora do padrão')}${sw('note', 'Observação')}
  </div>`;
}

/** HTML da página (A4 deitado) do mês `M`, com as camadas/área que a tela está mostrando. */
export function buildAgendaPage(state, M, today, { layers = null, area = null } = {}) {
  const ws = Number(state.settings.weekStart) || 0;
  const first = startOfWeek(monthStart(M), ws);
  const rows = Math.ceil((diffDays(first, monthEnd(M)) + 1) / 7);
  const last = addDays(first, rows * 7 - 1);
  const map = collectRange(state, first, last, { layers, area });
  const cells = [...map.entries()].map(([d, items]) => cellHtml(state, d, items, today, M)).join('');
  const shown = (layers || Object.keys(LAYERS)).map((l) => LAYERS[l]).join(', ');
  const areaName = area ? areaOf(state, area)?.name : null;
  const now = new Date();
  const who = whoLabel(state);
  return `<div class="p-page">
    <header class="p-head">
      <img class="p-logo" src="assets/logo-128.png" alt="">
      <div class="p-brand"><strong>Rotina Geral</strong>${who ? `<span>${esc(who)}</span>` : ''}</div>
      <div class="p-title"><h1>${esc(monthLabel(M))}</h1><span>Agenda e escala · ${esc(shown)}${areaName ? ` · área ${esc(areaName)}` : ''}</span></div>
      ${statsHtml(state, M, today, map)}
    </header>
    <div class="p-body">
      <div class="p-cal">
        <div class="p-dow">${Array.from({ length: 7 }, (_, i) => `<span>${DOW[(ws + i) % 7]}</span>`).join('')}</div>
        <div class="p-grid" style="grid-template-rows: repeat(${rows}, 1fr)">${cells}</div>
      </div>
      <aside class="p-side">${sideHtml(state, M, today, map, layers)}</aside>
    </div>
    <footer class="p-foot">
      ${legendHtml()}
      <span class="p-gen">Gerado em ${fmtDM(todayKey(now))}/${now.getFullYear()} às ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} · Rotina Geral</span>
    </footer>
  </div>`;
}

/**
 * Monta a página do mês e abre a impressão do navegador (escolha "Salvar como PDF").
 * `layers`/`area`: o que a tela está mostrando (null = tudo).
 */
export function exportAgendaPdf({ month = null, layers = null, area = null } = {}) {
  const state = store.get();
  const today = todayKey();
  const M = month || monthOf(today);
  let root = document.getElementById('print-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'print-root';
    document.body.appendChild(root);
  }
  root.innerHTML = buildAgendaPage(state, M, today, { layers, area });
  fitPage(root);
  document.body.classList.add('printing');
  const done = () => {
    document.body.classList.remove('printing');
    root.innerHTML = '';
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  toast('Na janela que vai abrir, escolha “Salvar como PDF”.', { timeout: 7000 });
  // Dá tempo de o logo carregar antes de abrir a impressão.
  const img = root.querySelector('img');
  const go = () => setTimeout(() => window.print(), 80);
  if (img && !img.complete) {
    img.addEventListener('load', go, { once: true });
    img.addEventListener('error', go, { once: true });
  } else {
    go();
  }
}
