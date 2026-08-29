import type { CommissionAgentRow, CommissionBreakdownRow, CompanyCommissionReport, Config, Lead, Payment } from '../../../types/domain';
import { shiftMonth } from '../../../shared/lib/format';

// Commission integrity is a real past-incident area (see project memory:
// a test payment once stayed live in Agent of Month/Commission after being
// "corrected" on the pipeline side) -- so every entry point here filters to
// `status === 'approved'` FIRST, explicitly, before any arithmetic. A
// pending or declined payment must never be able to reach these totals.
function approvedOnly(payments: Payment[]): Payment[] {
  return payments.filter((p) => p.status === 'approved');
}

// Ported from index.html's computeMyPersonalCommission()/
// computeMyCommissionBreakdown() (index.html:25415-25442) -- commission is
// capped per payment, not a flat percentage: each approved payment earns
// cap * (amount / list price), where cap/list price depend on whether the
// lead is a half or full plot.
function paymentContribution(payment: Payment, lead: Lead, config: Config): number {
  const isHalf = lead.plotType === 'Half Plot';
  const cap = isHalf ? config.commissionHalfCap : config.commissionFullCap;
  const listPrice = isHalf ? config.halfPrice : config.fullPrice;
  return listPrice > 0 ? cap * (payment.amount / listPrice) : 0;
}

export function computeMyCommissionBreakdown(payments: Payment[], leads: Lead[], monthKey: string, config: Config): { rows: CommissionBreakdownRow[]; total: number } {
  const leadById = new Map(leads.map((l) => [l.id, l]));
  const rows: CommissionBreakdownRow[] = approvedOnly(payments)
    .filter((p) => p.date.slice(0, 7) === monthKey)
    .map((p): CommissionBreakdownRow | null => {
      const lead = leadById.get(p.leadId);
      if (!lead) return null;
      return {
        leadId: p.leadId,
        clientName: lead.name,
        plotType: lead.plotType,
        paymentDate: p.date,
        paymentAmount: p.amount,
        contribution: paymentContribution(p, lead, config),
      };
    })
    .filter((r): r is CommissionBreakdownRow => r !== null)
    .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
  return { rows, total: rows.reduce((s, r) => s + r.contribution, 0) };
}

// Ported from index.html's computeCommissionForMonth() (index.html:25371-
// 25409) -- personal commission per agent this month, plus a shared pool
// (totalNewPlotsThisMonth * poolPerPlot) split evenly across agents
// "eligible" for it: anyone who sold at least one genuinely new plot
// (a lead's FIRST-ever approved payment) in this month or either of the
// two months before it. "New plot" is counted by first-payment date, not
// lead-creation date, matching the real rule exactly.
export function computeCompanyCommissionForMonth(payments: Payment[], leads: Lead[], staff: { key: string; name: string }[], monthKey: string, config: Config): CompanyCommissionReport {
  const approved = approvedOnly(payments);
  const leadById = new Map(leads.map((l) => [l.id, l]));

  const paymentsByLead = new Map<string, Payment[]>();
  for (const p of approved) {
    const arr = paymentsByLead.get(p.leadId) ?? [];
    arr.push(p);
    paymentsByLead.set(p.leadId, arr);
  }
  for (const arr of paymentsByLead.values()) arr.sort((a, b) => a.date.localeCompare(b.date));

  const monthsBack = [monthKey, shiftMonth(monthKey, -1), shiftMonth(monthKey, -2)];

  const newPlotsFor = (agentKey: string, mk: string): number => {
    let sum = 0;
    for (const [leadId, arr] of paymentsByLead) {
      const first = arr[0];
      if (first && first.agentKey === agentKey && first.date.slice(0, 7) === mk) sum += leadById.get(leadId)?.noPlots ?? 1;
    }
    return sum;
  };

  const rows: CommissionAgentRow[] = staff.map((s) => {
    let personal = 0;
    for (const p of approved) {
      if (p.agentKey !== s.key || p.date.slice(0, 7) !== monthKey) continue;
      const lead = leadById.get(p.leadId);
      if (!lead) continue;
      personal += paymentContribution(p, lead, config);
    }
    const plotsByMonth = monthsBack.map((mk) => newPlotsFor(s.key, mk));
    const eligible = plotsByMonth.some((c) => c > 0);
    return { key: s.key, name: s.name, personal, newPlotsThisMonth: plotsByMonth[0], eligible, poolShare: 0, total: 0 };
  });

  const totalNewPlotsThisMonth = rows.reduce((s, r) => s + r.newPlotsThisMonth, 0);
  const poolTotal = totalNewPlotsThisMonth * config.commissionPoolPerPlot;
  const eligibleCount = rows.filter((r) => r.eligible).length;
  const poolShare = eligibleCount ? poolTotal / eligibleCount : 0;
  for (const r of rows) {
    r.poolShare = r.eligible ? poolShare : 0;
    r.total = r.personal + r.poolShare;
  }

  return { monthKey, rows, poolTotal, poolShare, eligibleCount, totalNewPlotsThisMonth };
}
