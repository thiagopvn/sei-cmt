// Importar fatura do cartão ou extrato da conta (CSV) com prévia: nada é gravado antes de conferir.

import { store } from '../store.js';
import { esc, uid, money, plural, sum } from '../lib/util.js';
import { icon } from '../lib/icons.js';
import { addMonths, fmtDM, monthLabel, todayKey, dateInMonth } from '../lib/dates.js';
import { openModal, toast } from '../ui/overlay.js';
import { field, input, select, segmented } from '../ui/fields.js';
import { parseStatement, analyzeStatement, recomputeTotals, applyImport } from '../domain/statement.js';
import { guessCategory, IMPORT_CATEGORIES } from '../domain/categories.js';
import { invoiceDueMonth } from '../domain/finance.js';

const TYPE_LABEL = {
  purchase: 'Compra', installment: 'Parcela', credit: 'Crédito', payment: 'Pagamento', refund: 'Estorno', refunded: 'Estornada',
  refundOld: 'Estorno', expense: 'Saída', income: 'Entrada', billpay: 'Pagamento de fatura',
};

const days = Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: `Dia ${i + 1}` }));
const bankName = (fileName) => (String(fileName).match(/^([A-Za-zÀ-ú]+)[_\- ]/)?.[1] || 'Cartão').replace(/^./, (c) => c.toUpperCase());

export function openImportForm({ onDone } = {}) {
  let parsed = null;
  let fileName = '';
  let an = null;
  const overrides = new Map(); // estabelecimento → categoria escolhida nesta prévia
  const prevFlags = new Map(); // índice do pagamento → é da fatura anterior?

  const m = openModal({
    title: 'Importar fatura ou extrato',
    size: 'lg',
    body: `
      <label class="import-drop">
        ${icon('upload', 26)}
        <strong>Escolher arquivo .csv</strong>
        <span class="muted small">No app do banco, exporte a fatura do cartão ou o extrato da conta (ex.: Nubank → Fatura → Exportar). Nada é salvo antes de você conferir.</span>
        <input type="file" name="file" accept=".csv,.txt,text/csv">
      </label>
      <div class="import-config"></div>
      <div class="import-preview"></div>`,
    footer: '<span class="spacer"></span><button type="button" class="btn btn-primary" data-import disabled>Importar</button>',
    onMount(el) {
      const cfg = el.querySelector('.import-config');
      const prev = el.querySelector('.import-preview');
      const btn = el.querySelector('[data-import]');

      const config = () => {
        const f = (n) => cfg.querySelector(`[name="${n}"]`);
        return {
          kind: cfg.querySelector('[name="imKind"]:checked')?.value || parsed.kind,
          cardId: f('imCard')?.value || '',
          name: f('imName')?.value.trim() || bankName(fileName),
          closingDay: Number(f('imClose')?.value) || 1,
          dueDay: Number(f('imDue')?.value) || 8,
          month: f('imMonth')?.value || '',
        };
      };

      const renderConfig = () => {
        const state = store.get();
        const due = parsed.dueDate;
        const dueDay = due ? Number(due.slice(8, 10)) : 8;
        const closeDay = ((dueDay - 7 + 30) % 31) + 1; // fecha ~7 dias antes do vencimento
        const card = state.cards[0];
        const lastTx = parsed.tx.map((t) => t.date).sort().pop() || todayKey();
        const month = due ? due.slice(0, 7) : card ? invoiceDueMonth(card, lastTx) : addMonths(lastTx.slice(0, 7), 1);
        cfg.innerHTML = `
          <div class="import-file">${icon('file', 16)}<strong>${esc(fileName)}</strong><span class="muted small">${plural(parsed.tx.length, 'linha lida', 'linhas lidas')}${parsed.bad ? ` · ${parsed.bad} ignorada(s)` : ''}</span></div>
          ${field('O arquivo é', segmented('imKind', [['card', 'Fatura do cartão'], ['account', 'Extrato da conta']], parsed.kind))}
          <div class="im-card" ${parsed.kind === 'card' ? '' : 'hidden'}>
            <div class="grid-2">
              ${field('Cartão', select('imCard', [...state.cards.map((c) => ({ value: c.id, label: c.name })), { value: '', label: `+ Novo cartão (${bankName(fileName)})` }], card?.id || ''))}
              ${field('Fatura com vencimento em', input('imMonth', month, 'type="month"'), { hint: due ? `Lido do nome do arquivo: vence ${fmtDM(due)}.` : 'Mês em que esta fatura vence.' })}
            </div>
            <div class="grid-3 im-new" ${card ? 'hidden' : ''}>
              ${field('Nome', input('imName', bankName(fileName), 'maxlength="40"'))}
              ${field('Fecha no', select('imClose', days, closeDay))}
              ${field('Vence no', select('imDue', days, dueDay))}
            </div>
          </div>`;
      };
      // Um único ouvinte (o bloco é redesenhado a cada arquivo escolhido).
      cfg.addEventListener('change', (e) => {
        if (!parsed) return;
        if (e.target.name === 'imCard') cfg.querySelector('.im-new').hidden = !!e.target.value;
        if (e.target.name === 'imKind' && e.target.value !== parsed.kind) {
          cfg.querySelector('.im-card').hidden = e.target.value !== 'card';
          // Cartão: positivo é compra; conta: negativo é saída — reinterpreta os sinais.
          parsed = { ...parsed, kind: e.target.value, tx: parsed.tx.map((t) => ({ ...t, out: -t.out })) };
        }
        analyze();
      });

      const analyze = () => {
        const state = store.get();
        const c = config();
        const card = state.cards.find((x) => x.id === c.cardId);
        const rules = Object.fromEntries((state.settings.importRules || []).map((r) => [r.m, r.c]));
        an = analyzeStatement(parsed, {
          invoiceMonth: c.kind === 'card' ? c.month || null : null,
          dueDay: card ? card.dueDay : c.dueDay,
          cardId: c.kind === 'card' ? card?.id || 'novo' : null,
          state,
          categorize: (r) => overrides.get(r.mk) || guessCategory(r, rules),
        });
        for (const r of an.rows) if (r.type === 'payment' && prevFlags.has(r.i)) r.prev = prevFlags.get(r.i);
        recomputeTotals(an);
        renderPreview();
      };

      const renderPreview = () => {
        const t = an.totals;
        const c = config();
        const state = store.get();
        const cats = [...new Set([...state.settings.expenseCategories, ...IMPORT_CATEGORIES])];
        const live = an.rows.filter((r) => ['purchase', 'installment', 'expense'].includes(r.type));
        const groups = new Map();
        for (const r of live) {
          const g = groups.get(r.category) || { total: 0, count: 0, merchants: new Map() };
          g.total += r.out;
          g.count++;
          const mm = g.merchants.get(r.mk) || { title: r.title, total: 0, count: 0, dup: 0 };
          mm.total += r.out;
          mm.count++;
          mm.dup += r.dup ? 1 : 0;
          g.merchants.set(r.mk, mm);
          groups.set(r.category, g);
        }
        const twins = new Map();
        for (const r of live) {
          const k = `${r.date}|${r.mk}|${r.cents}`;
          twins.set(k, [...(twins.get(k) || []), r]);
        }
        const same = [...twins.values()].filter((l) => l.length > 1);
        const pairs = an.rows.filter((r) => r.type === 'refund' || r.type === 'refundOld');
        const payments = an.rows.filter((r) => r.type === 'payment');
        const inst = an.rows.filter((r) => r.type === 'installment');
        const ignored = an.rows.filter((r) => r.type === 'billpay');
        const card = c.kind === 'card';

        const summary = card ? `
          <div class="im-summary">
            <div><span>Compras na fatura</span><strong>${money(t.purchases)}</strong></div>
            ${t.credits ? `<div><span>Estornos/créditos</span><strong>− ${money(t.credits)}</strong></div>` : ''}
            <div><span>Pago adiantado</span><strong>− ${money(t.advances)}</strong></div>
            <div class="im-open"><span>Fatura em aberto${c.month ? ` · vence ${monthLabel(c.month)}` : ''}</span><strong>${money(t.open)}</strong></div>
          </div>`
          : `<div class="im-summary">
            <div><span>Saídas</span><strong>${money(sum(an.rows.filter((r) => r.type === 'expense'), (r) => r.out))}</strong></div>
            <div><span>Entradas</span><strong>${money(sum(an.rows.filter((r) => r.type === 'income'), (r) => -r.out))}</strong></div>
          </div>`;

        const checks = [
          `${icon('check', 14)}${plural(t.newCount, 'lançamento novo', 'lançamentos novos')}`,
          t.dupCount ? `${icon('swap', 14)}${plural(t.dupCount, 'já importado', 'já importados')} — não entra de novo` : `${icon('check', 14)}nenhum já importado`,
          pairs.length ? `${icon('undo', 14)}${plural(pairs.length, 'estorno', 'estornos')} (o valor foi e voltou) — não entra na fatura` : `${icon('check', 14)}nenhum estorno nesta fatura`,
          ...same.map((l) => `${icon('alert', 14)}${l.length} cobranças iguais de ${money(l[0].out)} em ${fmtDM(l[0].date)} (${esc(l[0].title)}) — mantidas como lançamentos separados`),
          ignored.length ? `${icon('alert', 14)}${plural(ignored.length, 'pagamento de fatura', 'pagamentos de fatura')} na conta — não conta como gasto (já está no cartão)` : '',
        ].filter(Boolean);

        prev.innerHTML = `
          ${summary}
          <ul class="im-checks">${checks.map((x) => `<li>${x}</li>`).join('')}</ul>
          ${card && payments.length ? `<section class="im-sec"><h3>Pagamentos no período</h3>
            <p class="muted small">Pagamento não é gasto. Marque o que foi da fatura anterior; o resto abate desta.</p>
            ${payments.map((p) => `<label class="im-pay"><input type="checkbox" data-prev="${p.i}" ${p.prev ? 'checked' : ''}><span>${fmtDM(p.date)} · <strong>${money(-p.out)}</strong></span><small class="muted">${p.prev ? 'fatura anterior' : 'adiantamento desta fatura'}</small></label>`).join('')}
          </section>` : ''}
          <section class="im-sec"><h3>Por categoria</h3>
            <p class="muted small">Toque para ver os estabelecimentos. Mudou a categoria? O app lembra nas próximas importações.</p>
            ${[...groups.entries()].sort((a, b) => b[1].total - a[1].total).map(([cat, g]) => `
              <details class="im-cat"><summary><strong>${esc(cat)}</strong><span class="muted small">${g.count}×</span><span class="amount">${money(g.total)}</span></summary>
                ${[...g.merchants.entries()].sort((a, b) => b[1].total - a[1].total).map(([mk, mm]) => `
                  <div class="im-merchant"><span>${esc(mm.title)}<small class="muted"> · ${mm.count}×${mm.dup ? ` (${mm.dup} já importado)` : ''}</small></span><span class="amount">${money(mm.total)}</span>
                    <select class="select-sm" data-mk="${esc(mk)}" aria-label="Categoria de ${esc(mm.title)}">${cats.map((x) => `<option ${x === cat ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>`).join('')}
              </details>`).join('')}
          </section>
          ${inst.length ? `<section class="im-sec"><h3>Parcelas (${inst.length})</h3>
            <p class="muted small">Viram compras parceladas: as próximas parcelas já aparecem nas faturas seguintes — e não duplicam quando você importar o mês que vem.</p>
            ${inst.map((r) => `<div class="im-merchant"><span>${esc(r.title)} <small class="muted">· ${r.inst.k}/${r.inst.n}${r.inst.k < r.inst.n ? ` · faltam ${r.inst.n - r.inst.k}` : ' · última'}</small></span><span class="amount">${money(r.out)}</span></div>`).join('')}
          </section>` : ''}`;
        btn.disabled = !t.newCount;
        btn.textContent = t.newCount ? `Importar ${plural(t.newCount, 'lançamento', 'lançamentos')}` : 'Nada novo para importar';
      };

      el.querySelector('[name="file"]').addEventListener('change', async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        fileName = f.name;
        parsed = parseStatement(await f.text(), f.name);
        if (!parsed.tx.length) {
          prev.innerHTML = `<div class="notice notice-serious">${icon('alert', 16)}<span>Não encontrei lançamentos neste arquivo. Use o CSV exportado pelo banco (data, descrição e valor).</span></div>`;
          return;
        }
        // Fatura de cartão com a maioria negativa: o banco usou o sinal invertido.
        if (parsed.kind === 'card' && parsed.tx.filter((x) => x.out < 0).length > parsed.tx.length / 2) parsed.tx = parsed.tx.map((x) => ({ ...x, out: -x.out }));
        el.querySelector('.import-drop').classList.add('compact');
        overrides.clear();
        prevFlags.clear();
        renderConfig();
        analyze();
      });
      prev.addEventListener('change', (e) => {
        if (e.target.dataset.prev) {
          prevFlags.set(Number(e.target.dataset.prev), e.target.checked);
          analyze();
        } else if (e.target.dataset.mk) {
          overrides.set(e.target.dataset.mk, e.target.value);
          analyze();
        }
      });
      btn.addEventListener('click', () => {
        const c = config();
        const card = c.kind === 'card';
        let res;
        store.update((s) => {
          // Categorias novas usadas na importação entram na lista.
          for (const r of an.rows) if (r.category && !s.settings.expenseCategories.includes(r.category) && r.category !== 'Estornos e créditos') s.settings.expenseCategories.splice(-1, 0, r.category);
          // Lembra as categorias trocadas à mão.
          const rules = s.settings.importRules || (s.settings.importRules = []);
          for (const [mk, cat] of overrides) {
            const old = rules.find((r) => r.m === mk);
            if (old) old.c = cat; else rules.push({ m: mk, c: cat });
          }
          res = applyImport(s, an, {
            cardId: card ? c.cardId || null : null,
            newCard: card && !c.cardId ? { name: c.name, closingDay: c.closingDay, dueDay: c.dueDay } : null,
            invoiceMonth: card ? c.month || null : null,
            uid,
          });
        }, { undoable: true });
        m.close();
        const what = `${plural(res.entries, 'lançamento', 'lançamentos')}${res.payments ? ` e ${plural(res.payments, 'pagamento', 'pagamentos')}` : ''}${res.refunds ? ` · ${plural(res.refunds, 'estorno', 'estornos')}` : ''}`;
        toast(card ? `Importado: ${what} · fatura em aberto ${money(an.totals.open)}` : `Importado: ${what}`, {
          action: { label: 'Desfazer', onClick: () => store.undo() }, timeout: 8000,
        });
        onDone?.({ cardId: res.cardId, month: card ? c.month : null });
      });
    },
  });
  return m;
}

/** Dica de mês de vencimento do ciclo aberto (para quem chama). */
export const openCycleDue = (card, today) => (card ? invoiceDueMonth(card, today) : null);
export const dueDateOf = (card, M) => dateInMonth(M, Number(card.dueDay) || 1);
