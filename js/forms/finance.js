// Formulários financeiros: receita, despesa/conta, compra no cartão e cartão.

import { store, AREA_SLOTS } from '../store.js';
import { esc, uid, parseMoney, moneyInput, money } from '../lib/util.js';
import { icon } from '../lib/icons.js';
import { todayKey, fmtDM, fmtShort, monthLabel } from '../lib/dates.js';
import { openModal, confirmDialog, toast } from '../ui/overlay.js';
import { field, input, select, textarea, toggle, segmented } from '../ui/fields.js';
import { invoice, invoiceDueMonth } from '../domain/finance.js';

/**
 * @param {object} o
 * @param {'receita'|'despesa'} [o.kind]
 * @param {boolean} [o.card]  abre já como compra no cartão
 */
export function openEntryForm({ entry = null, kind = 'despesa', card = false, date = null } = {}) {
  const state = store.get();
  const isNew = !entry;
  const e = entry || {
    kind, description: '', amount: 0, date: date || todayKey(), category: '', recurrence: null, until: null,
    cardId: card ? state.cards[0]?.id || '' : '', installments: 1, notes: '',
  };
  const cats = (k) => (k === 'receita' ? state.settings.incomeCategories : state.settings.expenseCategories);
  const catOptions = (k, v) => select('category', cats(k).map((c) => ({ value: c, label: c })), v || cats(k)[0]);
  const settledOnce = entry && !entry.recurrence && !entry.cardId ? !!entry.settled?.once : false;
  const cardOptions = [{ value: '', label: 'Pix, débito, boleto ou dinheiro' }, ...state.cards.map((c) => ({ value: c.id, label: `Cartão ${c.name}` }))];
  const title = isNew ? (card ? 'Compra no cartão' : e.kind === 'receita' ? 'Nova receita' : 'Nova despesa') : 'Editar lançamento';

  const body = `
    ${field('Tipo', segmented('kind', [['despesa', 'Despesa / conta'], ['receita', 'Receita']], e.kind))}
    ${field('Descrição', input('description', e.description, 'required autofocus placeholder="Ex.: Aluguel, Mensalidade da creche, Salário" maxlength="120" autocomplete="off"'))}
    <div class="grid-2">
      ${field('Valor total', input('amount', moneyInput(e.amount), 'required inputmode="decimal" placeholder="0,00"'))}
      ${field(e.cardId ? 'Data da compra' : 'Vencimento / data', input('date', e.date, 'type="date" required'), { id: 'date-field' })}
    </div>
    <div class="grid-2">
      <div class="cat-field">${field('Categoria', catOptions(e.kind, e.category))}</div>
      <div class="pay-method" ${e.kind === 'receita' ? 'hidden' : ''}>${field('Forma de pagamento', select('cardId', cardOptions, e.cardId || ''))}</div>
    </div>
    <div class="card-fields" ${e.cardId ? '' : 'hidden'}>
      ${field('Parcelas', select('installments', Array.from({ length: 24 }, (_, i) => ({ value: i + 1, label: i ? `${i + 1}x` : 'À vista' })), e.installments || 1))}
      <div class="notice card-preview"></div>
    </div>
    <div class="rec-fields" ${e.cardId ? 'hidden' : ''}>
      <div class="grid-2">
        ${field('Repetir', select('recurrence', [{ value: '', label: 'Não repete' }, { value: 'monthly', label: 'Todo mês' }, { value: 'yearly', label: 'Todo ano' }], e.recurrence || ''))}
        <div class="until-field" ${e.recurrence ? '' : 'hidden'}>${field('Até (mês, opcional)', input('until', e.until || '', 'type="month"'))}</div>
      </div>
      <div class="settle-field" ${e.recurrence ? 'hidden' : ''}>${toggle('settled', settledOnce, e.kind === 'receita' ? 'Já recebi' : 'Já paguei')}</div>
    </div>
    ${field('Anotações', textarea('notes', e.notes))}
  `;
  const footer = `
    ${entry ? `<button type="button" class="btn btn-ghost-danger" data-delete>${icon('trash', 16)}Excluir</button>` : ''}
    <span class="spacer"></span>
    <button type="submit" class="btn btn-primary">${isNew ? 'Adicionar' : 'Salvar'}</button>`;

  const m = openModal({
    title,
    body,
    footer,
    onMount(el) {
      const form = el.querySelector('form');
      const sync = () => {
        const k = form.kind.value;
        const isCard = k === 'despesa' && !!form.cardId.value;
        el.querySelector('.pay-method').hidden = k === 'receita';
        el.querySelector('.card-fields').hidden = !isCard;
        el.querySelector('.rec-fields').hidden = isCard;
        el.querySelector('.until-field').hidden = !form.recurrence.value;
        el.querySelector('.settle-field').hidden = !!form.recurrence.value;
        el.querySelector('.settle-field .switch-row span').textContent = k === 'receita' ? 'Já recebi' : 'Já paguei';
        el.querySelector('#date-field .field-label').textContent = isCard ? 'Data da compra' : 'Vencimento / data';
        if (isCard) {
          const c = store.get().cards.find((x) => x.id === form.cardId.value);
          const n = Number(form.installments.value) || 1;
          const total = parseMoney(form.amount.value);
          const dueM = c && form.date.value ? invoiceDueMonth(c, form.date.value) : null;
          el.querySelector('.card-preview').innerHTML = dueM
            ? `${icon('card', 16)}<span>${n > 1 ? `${n}x de ${money(total / n)}` : money(total)} · primeira parcela na fatura de <strong>${monthLabel(dueM)}</strong></span>`
            : '';
        }
      };
      form.kind.forEach?.((r) => r.addEventListener('change', () => {
        el.querySelector('.cat-field').innerHTML = field('Categoria', catOptions(form.kind.value));
        sync();
      }));
      form.addEventListener('input', sync);
      form.addEventListener('change', sync);
      sync();
      el.querySelector('[data-delete]')?.addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: 'Excluir lançamento?',
          message: entry.recurrence ? 'Todas as repetições deste lançamento serão excluídas.' : entry.cardId && entry.installments > 1 ? 'Todas as parcelas desta compra serão excluídas.' : `“${entry.description}” será excluído.`,
          confirmLabel: 'Excluir',
          danger: true,
        });
        if (!ok) return;
        store.update((s) => { s.entries = s.entries.filter((x) => x.id !== entry.id); }, { undoable: true });
        m.close();
        toast('Lançamento excluído', { action: { label: 'Desfazer', onClick: () => store.undo() } });
      });
    },
    onSubmit(fd) {
      const k = fd.get('kind');
      const cardId = k === 'despesa' ? fd.get('cardId') || null : null;
      const recurrence = cardId ? null : fd.get('recurrence') || null;
      const data = {
        kind: k,
        description: fd.get('description').trim(),
        amount: parseMoney(fd.get('amount')),
        date: fd.get('date'),
        category: fd.get('category') || 'Outros',
        cardId,
        installments: cardId ? Number(fd.get('installments')) || 1 : 1,
        recurrence,
        until: recurrence ? fd.get('until') || null : null,
        notes: fd.get('notes').trim(),
      };
      if (!(data.amount > 0)) {
        toast('Informe um valor maior que zero');
        return false;
      }
      store.update((s) => {
        let x = entry ? s.entries.find((y) => y.id === entry.id) : null;
        if (!x) {
          x = { id: uid(), settled: {}, amounts: {}, createdAt: new Date().toISOString() };
          s.entries.push(x);
        }
        Object.assign(x, data);
        x.settled = x.settled || {};
        if (!recurrence && !cardId) {
          if (fd.get('settled') === 'on') x.settled.once = x.settled.once || todayKey();
          else delete x.settled.once;
        }
      });
      toast(isNew ? 'Lançamento adicionado' : 'Lançamento salvo');
    },
  });
  return m;
}

export function openCardForm({ card = null } = {}) {
  const isNew = !card;
  const c = card || { name: '', closingDay: 1, dueDay: 10, limit: 0, color: 7 };
  const days = Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: `Dia ${i + 1}` }));
  const body = `
    ${field('Nome do cartão', input('name', c.name, 'required autofocus placeholder="Ex.: Nubank, Itaú, BB" maxlength="40" autocomplete="off"'))}
    <div class="grid-2">
      ${field('Fecha no', select('closingDay', days, c.closingDay), { hint: 'Compras a partir deste dia vão para a fatura seguinte.' })}
      ${field('Vence no', select('dueDay', days, c.dueDay))}
    </div>
    ${field('Limite (opcional)', input('limit', moneyInput(c.limit), 'inputmode="decimal" placeholder="0,00"'))}
    <div class="field"><span class="field-label">Cor</span>
      <div class="chips-row">${Array.from({ length: AREA_SLOTS }, (_, i) => i + 1).map((n) => `
        <label class="color-pick"><input type="radio" name="color" value="${n}" ${Number(c.color) === n ? 'checked' : ''}><span style="--c: var(--c${n})"></span></label>`).join('')}</div>
    </div>`;
  const footer = `
    ${card ? `<button type="button" class="btn btn-ghost-danger" data-delete>${icon('trash', 16)}Excluir</button>` : ''}
    <span class="spacer"></span>
    <button type="submit" class="btn btn-primary">${isNew ? 'Adicionar cartão' : 'Salvar'}</button>`;
  const m = openModal({
    title: isNew ? 'Novo cartão de crédito' : 'Editar cartão',
    body,
    footer,
    onMount(el) {
      el.querySelector('[data-delete]')?.addEventListener('click', async () => {
        const n = store.get().entries.filter((x) => x.cardId === card.id).length;
        const ok = await confirmDialog({ title: 'Excluir cartão?', message: n ? `O cartão e ${n} compra(s) lançada(s) nele serão excluídos.` : 'O cartão será excluído.', confirmLabel: 'Excluir', danger: true });
        if (!ok) return;
        store.update((s) => {
          s.cards = s.cards.filter((x) => x.id !== card.id);
          s.entries = s.entries.filter((x) => x.cardId !== card.id);
        }, { undoable: true });
        m.close();
        toast('Cartão excluído', { action: { label: 'Desfazer', onClick: () => store.undo() } });
      });
    },
    onSubmit(fd) {
      const data = {
        name: fd.get('name').trim(),
        closingDay: Number(fd.get('closingDay')),
        dueDay: Number(fd.get('dueDay')),
        limit: parseMoney(fd.get('limit')),
        color: Number(fd.get('color')) || 7,
      };
      store.update((s) => {
        if (isNew) s.cards.push({ id: uid(), ...data, paid: {} });
        else Object.assign(s.cards.find((x) => x.id === card.id), data);
      });
      toast(isNew ? 'Cartão adicionado' : 'Cartão salvo');
    },
  });
  return m;
}

/** Detalhe de uma fatura, com as compras e parcelas. */
export function openInvoice(cardId, M) {
  const render = () => {
    const state = store.get();
    const card = state.cards.find((c) => c.id === cardId);
    if (!card) return '';
    const inv = invoice(state, card, M);
    return `
      <div class="invoice-head">
        <div><span class="muted small">Total da fatura</span><strong class="big">${money(inv.total)}</strong></div>
        <div class="invoice-dates">
          <span>Fecha ${fmtDM(inv.closingDate)}</span><span>Vence ${fmtDM(inv.dueDate)}</span>
          ${inv.paidAt ? `<span class="pill pill-good">${icon('check', 13)}Paga em ${fmtDM(inv.paidAt)}</span>` : inv.dueDate < todayKey() && inv.total > 0 ? `<span class="pill pill-critical">${icon('alert', 13)}Vencida</span>` : ''}
        </div>
      </div>
      <div class="list">${inv.items.length ? inv.items.map((it) => `
        <div class="row" role="button" tabindex="0" data-entry="${esc(it.entry.id)}">
          <div class="row-main">
            <div class="row-title">${esc(it.entry.description)}</div>
            <div class="row-meta"><span class="meta">${fmtShort(it.entry.date)}</span>${it.count > 1 ? `<span class="meta">Parcela ${it.index}/${it.count}</span>` : ''}<span class="meta">${esc(it.entry.category || '')}</span></div>
          </div>
          <span class="amount">${money(it.amount)}</span>
        </div>`).join('') : '<p class="muted small">Nenhuma compra nesta fatura.</p>'}</div>`;
  };
  const state = store.get();
  const card = state.cards.find((c) => c.id === cardId);
  let unsub;
  const m = openModal({
    title: `Fatura ${card.name} · ${monthLabel(M)}`,
    body: `<div data-invoice>${render()}</div>`,
    footer: `<button type="button" class="btn" data-buy>${icon('plus', 16)}Nova compra</button><span class="spacer"></span><button type="button" class="btn btn-primary" data-pay></button>`,
    onClose: () => unsub?.(),
    onMount(el) {
      const payBtn = el.querySelector('[data-pay]');
      const refresh = () => {
        el.querySelector('[data-invoice]').innerHTML = render();
        const c = store.get().cards.find((x) => x.id === cardId);
        payBtn.textContent = c?.paid?.[M] ? 'Desmarcar pagamento' : 'Marcar fatura como paga';
      };
      refresh();
      unsub = store.subscribe(refresh);
      payBtn.addEventListener('click', () => {
        store.update((s) => {
          const c = s.cards.find((x) => x.id === cardId);
          c.paid = c.paid || {};
          if (c.paid[M]) delete c.paid[M]; else c.paid[M] = todayKey();
        });
      });
      el.querySelector('[data-buy]').addEventListener('click', () => openEntryForm({ card: true }));
      el.addEventListener('click', (ev) => {
        const row = ev.target.closest('[data-entry]');
        if (row) openEntryForm({ entry: store.get().entries.find((x) => x.id === row.dataset.entry) });
      });
    },
  });
  return m;
}

