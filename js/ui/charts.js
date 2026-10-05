// Gráficos simples em HTML/SVG: barras horizontais (categorias) e colunas (série temporal).
// Cores das marcas vêm da paleta categórica; textos usam sempre as cores de texto.

import { esc } from '../lib/util.js';

/** Barras horizontais rotuladas. data: [{ label, value, color }] */
export function hbars(data, { format = (v) => v, empty = 'Sem dados no período.' } = {}) {
  if (!data.length) return `<p class="muted small">${esc(empty)}</p>`;
  const max = Math.max(...data.map((d) => d.value), 1);
  return `<div class="hbars" role="list">${data.map((d) => `
    <div class="hbar" role="listitem">
      <div class="hbar-label"><span class="dot" style="--c: var(--c${d.color || 6})"></span>${esc(d.label)}</div>
      <div class="hbar-track"><span class="hbar-fill" style="width:${Math.max(2, (d.value / max) * 100)}%; --c: var(--c${d.color || 6})"></span></div>
      <div class="hbar-value">${esc(format(d.value))}</div>
    </div>`).join('')}</div>`;
}

/**
 * Colunas de uma série, com dica ao passar o mouse/tocar e tabela opcional.
 * data: [{ label, value, tip }]
 */
export function columns(data, { format = (v) => v, color = 6, title = '' } = {}) {
  const max = Math.max(...data.map((d) => d.value), 0);
  const top = niceMax(max);
  const H = 140;
  const bars = data.map((d, i) => {
    const h = top ? Math.round((d.value / top) * H) : 0;
    return `<button type="button" class="col" style="--h:${h}px; --c: var(--c${color})" data-col="${i}"
      aria-label="${esc(d.label)}: ${esc(format(d.value))}">
      <span class="col-fill"></span><span class="col-x">${esc(d.label)}</span></button>`;
  }).join('');
  return `
    <div class="colchart" data-colchart='${esc(JSON.stringify(data.map((d) => ({ l: d.tip || d.label, v: format(d.value) }))))}'>
      <div class="col-axis"><span>${esc(format(top))}</span><span>${esc(format(top / 2))}</span><span>0</span></div>
      <div class="col-plot" style="--H:${H}px">
        <div class="col-grid"><span></span><span></span><span></span></div>
        <div class="col-bars">${bars}</div>
        <div class="col-tip" hidden></div>
      </div>
    </div>
    <details class="table-view"><summary>Ver tabela${title ? `: ${esc(title)}` : ''}</summary>
      <table><tbody>${data.map((d) => `<tr><th scope="row">${esc(d.tip || d.label)}</th><td>${esc(format(d.value))}</td></tr>`).join('')}</tbody></table>
    </details>`;
}

function niceMax(v) {
  if (v <= 0) return 0;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * p;
}

/** Liga as dicas (tooltip) dos gráficos de colunas dentro de `root`. */
export function bindCharts(root) {
  root.querySelectorAll('[data-colchart]').forEach((chart) => {
    const data = JSON.parse(chart.dataset.colchart);
    const tip = chart.querySelector('.col-tip');
    const plot = chart.querySelector('.col-plot');
    const show = (btn) => {
      const d = data[Number(btn.dataset.col)];
      tip.innerHTML = `<strong>${esc(d.v)}</strong><span>${esc(d.l)}</span>`;
      tip.hidden = false;
      const r = btn.getBoundingClientRect();
      const pr = plot.getBoundingClientRect();
      const x = Math.min(Math.max(r.left - pr.left + r.width / 2, 50), pr.width - 50);
      tip.style.left = `${x}px`;
      chart.querySelectorAll('.col').forEach((c) => c.classList.toggle('dim', c !== btn));
    };
    const hide = () => {
      tip.hidden = true;
      chart.querySelectorAll('.col').forEach((c) => c.classList.remove('dim'));
    };
    chart.querySelectorAll('.col').forEach((btn) => {
      btn.addEventListener('mouseenter', () => show(btn));
      btn.addEventListener('focus', () => show(btn));
      btn.addEventListener('click', () => show(btn));
      btn.addEventListener('blur', hide);
    });
    chart.addEventListener('mouseleave', hide);
  });
}
