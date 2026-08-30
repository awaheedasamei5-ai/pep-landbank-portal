import type { Lead, Payment } from '../../../types/domain';
import { monthKey } from '../../../shared/lib/format';

// Port of index.html's computePipelineComposition() -- splits every
// active (not fully paid, not Lost) lead into "committed" (a client who
// has actually started paying) vs "prospect" (no money down yet), by
// value. A simple, real signal of pipeline health: a pipeline that's
// mostly unpaid prospects is far weaker than the same total value spread
// across paying clients.
export interface PipelineComposition {
  prospectVal: number;
  prospectPct: number;
  committedVal: number;
  committedPct: number;
  totalVal: number;
  activeCount: number;
  healthLabel: string;
}

export function computePipelineComposition(leads: Lead[]): PipelineComposition {
  const active = leads.filter((l) => l.stage !== 'Lost' && l.amtPaid < l.grandTotal);
  let prospectVal = 0;
  let committedVal = 0;
  active.forEach((l) => {
    if (l.amtPaid > 0) committedVal += l.grandTotal;
    else prospectVal += l.grandTotal;
  });
  const totalVal = prospectVal + committedVal;
  const prospectPct = totalVal ? Math.round((prospectVal / totalVal) * 100) : 0;
  const committedPct = 100 - prospectPct;
  let healthLabel = 'Healthy';
  if (prospectPct >= 70) healthLabel = 'Weak — mostly unpaid prospects';
  else if (prospectPct >= 45) healthLabel = 'Fair — needs conversion push';
  return { prospectVal, prospectPct, committedVal, committedPct, totalVal, activeCount: active.length, healthLabel };
}

// approved-only, matching this app's established rule (Data Check's
// Ledger mismatch check, manager.overview()'s collectedTrend) that a
// pending payment hasn't actually been collected yet.
function approvedInMonth(payments: Payment[], mk: string): Payment[] {
  return payments.filter((p) => (p.status ?? 'approved') === 'approved' && monthKey(p.date) === mk);
}

export interface MethodBreakdown {
  method: string;
  total: number;
}

export function computePaymentsByMethod(payments: Payment[], mk: string): MethodBreakdown[] {
  const byMethod = new Map<string, number>();
  approvedInMonth(payments, mk).forEach((p) => {
    const m = p.paymentMethod ?? 'Unspecified';
    byMethod.set(m, (byMethod.get(m) ?? 0) + p.amount);
  });
  return [...byMethod.entries()].map(([method, total]) => ({ method, total })).sort((a, b) => b.total - a.total);
}

export interface AgentRevenueRow {
  key: string;
  name: string;
  newLeads: number;
  revenue: number;
}

export function computeTopAgentsByRevenue(leads: Lead[], payments: Payment[], mk: string, nameFor: (key: string) => string): AgentRevenueRow[] {
  const monthPayments = approvedInMonth(payments, mk);
  const agentKeys = new Set<string>([...leads.map((l) => l.agent), ...monthPayments.map((p) => p.agentKey)]);
  const rows = [...agentKeys].map((key) => {
    const newLeads = leads.filter((l) => l.agent === key && monthKey(l.date) === mk).length;
    const revenue = monthPayments.filter((p) => p.agentKey === key).reduce((s, p) => s + p.amount, 0);
    return { key, name: nameFor(key), newLeads, revenue };
  });
  return rows.filter((r) => r.newLeads > 0 || r.revenue > 0).sort((a, b) => b.revenue - a.revenue);
}

export function monthRevenue(payments: Payment[], mk: string): number {
  return approvedInMonth(payments, mk).reduce((s, p) => s + p.amount, 0);
}
