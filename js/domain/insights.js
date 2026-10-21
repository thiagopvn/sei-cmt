// "Radar": alertas inteligentes que cruzam todos os módulos.
// level: 'critical' | 'serious' | 'warning' | 'info' | 'good'

import { addDays, diffDays, fmtDM, fmtShort, relDays } from '../lib/dates.js';
import { money, plural, sum } from '../lib/util.js';
import { activeInstance } from './tasks.js';
import { openItems, invoice, remaining, openInvoiceMonth, cardUsed } from './finance.js';
import { budgetStatus } from './budgets.js';
import { pendingPayments, swapStatus, shiftsInRange, shiftTitle, shiftNote } from './shifts.js';
import { conflicts } from './agenda.js';
import { monthOf } from '../lib/dates.js';

const names = (list, n = 2) => list.slice(0, n).map((x) => `“${x}”`).join(', ') + (list.length > n ? ` e mais ${list.length - n}` : '');

export function radar(state, today, { synced = false } = {}) {
  const out = [];
  const instances = state.tasks.map((t) => activeInstance(t, today)).filter(Boolean);
  const pending = instances.filter((i) => !i.done && i.date);

  const overdue = pending.filter((i) => i.date < today && !i.task.recurrence);
  if (overdue.length) {
    out.push({
      level: 'critical', icon: 'alert',
      title: `${plural(overdue.length, 'tarefa atrasada', 'tarefas atrasadas')}`,
      detail: names(overdue.map((i) => i.task.title)),
      to: '#/tarefas?f=atrasadas',
    });
  }
  const dueToday = pending.filter((i) => i.date === today && !i.task.recurrence);
  if (dueToday.length) {
    out.push({
      level: 'warning', icon: 'flag',
      title: `${plural(dueToday.length, 'prazo vence', 'prazos vencem')} hoje`,
      detail: names(dueToday.map((i) => i.task.title)),
      to: '#/tarefas',
    });
  }
  const soon = pending.filter((i) => !i.task.recurrence && i.date > today && diffDays(today, i.date) <= 3);
  if (soon.length) {
    out.push({
      level: 'warning', icon: 'clock',
      title: `${plural(soon.length, 'prazo', 'prazos')} nos próximos 3 dias`,
      detail: soon.slice(0, 3).map((i) => `${i.task.title} (${relDays(i.date, today)})`).join(' · '),
      to: '#/tarefas',
    });
  }

  // Conflitos com serviço (próximos 14 dias)
  const conf = conflicts(state, today, addDays(today, 14));
  if (conf.length === 1) {
    const c = conf[0];
    out.push({
      level: 'serious', icon: 'shield',
      title: `${c.reason}: ${c.item.title}`,
      detail: `${fmtShort(c.date)} — você está de serviço (${c.shift.start}, ${c.shift.hours}h). Antecipe, troque ou reorganize.`,
      to: `#/agenda?d=${c.date}`,
    });
  } else if (conf.length > 1) {
    out.push({
      level: 'serious', icon: 'shield',
      title: `${conf.length} conflitos com seus dias de serviço`,
      detail: conf.slice(0, 3).map((c) => `${c.item.title} (${fmtDM(c.date)})`).join(' · ') + (conf.length > 3 ? '…' : ''),
      to: `#/agenda?d=${conf[0].date}`,
    });
  }

  // Finanças
  const open = openItems(state, today, Math.max(3, Number(state.settings.billAlertDays) || 2) + 2);
  const lateBills = open.filter((i) => i.kind === 'despesa' && i.date < today);
  if (lateBills.length) {
    out.push({
      level: 'critical', icon: 'wallet',
      title: `${plural(lateBills.length, 'conta atrasada', 'contas atrasadas')} · ${money(sum(lateBills, remaining))}`,
      detail: names(lateBills.map((i) => i.title)),
      to: '#/financas',
    });
  }
  const dueBills = open.filter((i) => i.kind === 'despesa' && i.date >= today);
  if (dueBills.length) {
    out.push({
      level: 'warning', icon: 'wallet',
      title: `${plural(dueBills.length, 'conta a pagar', 'contas a pagar')} em breve · ${money(sum(dueBills, remaining))}`,
      detail: dueBills.slice(0, 3).map((i) => `${i.title} (${relDays(i.date, today)})`).join(' · '),
      to: '#/financas',
    });
  }
  for (const card of state.cards) {
    // A fatura que está aberta (recebendo compras), com o que falta pagar.
    const inv = invoice(state, card, openInvoiceMonth(card, today));
    const n = diffDays(today, inv.closingDate);
    if (inv.total > 0 && n >= 0 && n <= 3) {
      out.push({
        level: 'info', icon: 'card',
        title: `Fatura ${card.name} fecha ${relDays(inv.closingDate, today)}`,
        detail: `Parcial de ${money(inv.total)}${inv.paidAmount ? ` (falta ${money(inv.balance)})` : ''}. Compras a partir de ${fmtDM(inv.closingDate)} vão para a próxima fatura.`,
        to: '#/financas?tab=cartoes',
      });
    }
    // Limite do cartão quase todo usado (faturas em aberto + parcelas futuras).
    if (Number(card.limit) > 0) {
      const used = cardUsed(state, card, today);
      const pct = Math.round((used / card.limit) * 100);
      if (pct >= 85) {
        out.push({
          level: pct >= 100 ? 'serious' : 'warning', icon: 'card',
          title: `Limite do ${card.name}: ${pct}% usado`,
          detail: `${money(used)} de ${money(card.limit)} comprometidos (faturas em aberto e parcelas).`,
          to: '#/financas?tab=cartoes',
        });
      }
    }
  }

  // Limites de gasto do mês
  const budgets = budgetStatus(state, monthOf(today));
  const over = budgets.filter((b) => b.level === 'over');
  const near = budgets.filter((b) => b.level === 'near');
  if (over.length) {
    out.push({
      level: 'serious', icon: 'target',
      title: over.length === 1 ? `Limite estourado: ${over[0].category}` : `${over.length} limites estourados`,
      detail: over.slice(0, 3).map((b) => `${b.category} ${money(b.spent)} de ${money(b.limit)}`).join(' · '),
      to: '#/financas',
    });
  }
  if (near.length) {
    out.push({
      level: 'warning', icon: 'target',
      title: near.length === 1 ? `Perto do limite: ${near[0].category} (${near[0].pct}%)` : `${near.length} categorias perto do limite`,
      detail: near.slice(0, 3).map((b) => `${b.category}: resta ${money(b.left)}`).join(' · '),
      to: '#/financas',
    });
  }

  // Pagamentos de serviços
  const late = pendingPayments(state, today).filter((p) => p.status === 'atrasado');
  if (late.length) {
    out.push({
      level: 'serious', icon: 'coins',
      title: `${plural(late.length, 'serviço pago', 'serviços pagos')} sem pagamento · ${money(sum(late, (p) => p.service.value))}`,
      detail: `Previsão vencida para ${late.slice(0, 4).map((p) => fmtDM(p.service.date)).join(', ')}. Confira ou cobre.`,
      to: '#/escala?tab=pagamentos',
    });
  }
  const taskIncome = state.tasks.filter((t) => Number(t.value) > 0 && t.status === 'done' && !t.receivedAt);
  if (taskIncome.length) {
    out.push({
      level: 'info', icon: 'coins',
      title: `A receber por trabalhos · ${money(sum(taskIncome, (t) => t.value))}`,
      detail: names(taskIncome.map((t) => t.title)),
      to: '#/financas',
    });
  }

  // Observações nos serviços dos próximos 7 dias: o que você anotou no card aparece aqui,
  // sem precisar lembrar que aquele serviço tem uma particularidade.
  for (const sh of shiftsInRange(state, today, addDays(today, 7))) {
    const note = shiftNote(sh);
    if (!note) continue;
    out.push({
      level: diffDays(today, sh.date) <= 2 ? 'warning' : 'info', icon: 'note',
      title: `${sh.active ? '' : 'Não tiro — '}${shiftTitle(sh)} · ${relDays(sh.date, today)} (${fmtDM(sh.date)})${sh.unit ? ` · ${sh.unit}` : ''}`,
      detail: note,
      to: `#/agenda?d=${sh.date}`,
    });
  }

  // Trocas
  for (const w of state.swaps) {
    const st = swapStatus(w, today);
    if (st === 'devo' && !w.theirDate) {
      out.push({
        level: 'info', icon: 'swap',
        title: `Você deve um serviço a ${w.colleague}`,
        detail: `Ele tirou o seu dia ${fmtDM(w.myDate)}. Combine a data da devolução.`,
        to: '#/escala?tab=trocas',
      });
    } else if (st === 'me_devem' && !w.myDate) {
      out.push({
        level: 'info', icon: 'swap',
        title: `${w.colleague} te deve um serviço`,
        detail: `Você tirou o dia ${fmtDM(w.theirDate)} por ele. Combine quando ele devolve.`,
        to: '#/escala?tab=trocas',
      });
    }
  }

  // Backup
  const hasData = state.tasks.length + state.services.length + state.entries.length > 5;
  const last = state.settings.lastBackup;
  if (!synced && hasData && (!last || diffDays(last.slice(0, 10), today) > 30)) {
    out.push({
      level: 'info', icon: 'download',
      title: 'Faça um backup dos seus dados',
      detail: 'Os dados ficam salvos neste aparelho. Exporte um backup de vez em quando.',
      to: '#/ajustes',
    });
  }

  const order = { critical: 0, serious: 1, warning: 2, info: 3, good: 4 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}
