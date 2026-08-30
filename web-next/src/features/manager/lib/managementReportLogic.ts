import type { Lead, Payment, SiteVisit, FundRequest } from '../../../types/domain';
import { today, isoPlusDays, monthKey, shiftMonth } from '../../../shared/lib/format';
import { computePipelineComposition, type PipelineComposition } from '../../analytics/lib/analyticsLogic';

// Port of index.html's Management Reports data model (index.html:22755-
// 23054) -- "a manager-only, on-demand branded PDF covering only metrics
// that are actually well-defined in this data model." Two real sections
// of the original are deliberately NOT ported here, same reasoning as
// Fund Requests' and Analytics' own scoping: Expenses (period)/Net cash
// position/Expenses by category all need the live-only Expenses tables
// (Log Expense/Categories/Recurring), which web-next hasn't built (no
// live-mode sign-in exists yet to verify a live-only feature through the
// app's own UI). "Pending approvals" here covers pending payments and
// pending Fund Requests only -- the two approval queues that DO exist.

export type ReportPeriodKey = 'week' | 'month' | 'lastmonth' | 'year' | 'lastyear' | 'custom';

export interface ReportRange {
  from: string;
  to: string;
  label: string;
}

export function reportPeriodRange(key: ReportPeriodKey, customFrom?: string, customTo?: string): ReportRange {
  const t = today();
  if (key === 'week') {
    const d = new Date(`${t}T00:00:00`);
    const dow = (d.getDay() + 6) % 7;
    return { from: isoPlusDays(t, -dow), to: t, label: 'This week' };
  }
  if (key === 'month') {
    return { from: `${t.slice(0, 7)}-01`, to: t, label: 'This month' };
  }
  if (key === 'lastmonth') {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthEnd = new Date(first.getTime() - 86400000);
    return { from: `${lastMonthEnd.toISOString().slice(0, 7)}-01`, to: lastMonthEnd.toISOString().slice(0, 10), label: 'Last month' };
  }
  if (key === 'year') {
    return { from: `${t.slice(0, 4)}-01-01`, to: t, label: 'This year' };
  }
  if (key === 'lastyear') {
    const y = new Date().getFullYear() - 1;
    return { from: `${y}-01-01`, to: `${y}-12-31`, label: 'Last year' };
  }
  return { from: customFrom || t, to: customTo || t, label: 'Custom range' };
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 86400000);
}

// Equal-length period immediately before the given range -- e.g. this-
// month-vs-last-month, or any custom range vs. the same-length range
// right before it.
export function priorPeriodRange(range: ReportRange): ReportRange {
  const spanDays = (daysBetween(range.from, range.to) || 0) + 1;
  const priorTo = isoPlusDays(range.from, -1);
  const priorFrom = isoPlusDays(priorTo, -(spanDays - 1));
  return { from: priorFrom, to: priorTo, label: `Previous period (${priorFrom} to ${priorTo})` };
}

export function pctChangeStr(prior: number | null, current: number | null): string {
  if (prior == null || current == null) return '—';
  if (prior === 0) return current === 0 ? '0%' : '+∞%';
  const pct = Math.round(((current - prior) / Math.abs(prior)) * 100);
  return (pct > 0 ? '+' : '') + pct + '%';
}

function inRange(date: string | null | undefined, from: string, to: string): boolean {
  const d = (date ?? '').slice(0, 10);
  return !!d && d >= from && d <= to;
}

export interface AgentPeriodRow {
  name: string;
  newLeads: number;
  revenue: number;
}

export interface MethodPeriodRow {
  method: string;
  count: number;
  total: number;
}

export interface ManagementReportData {
  newLeadsCount: number;
  revenue: number;
  outstandingTotal: number;
  fullyPaidCount: number;
  visitsInRange: number;
  perAgent: AgentPeriodRow[];
  byMethod: MethodPeriodRow[];
  pendingPayments: number;
  pendingFundRequests: number;
  revenueTrend: { label: string; value: number }[];
  forecastNextMonth: number | null;
  pipelineComposition: PipelineComposition;
}

export function computeManagementReportData(leads: Lead[], payments: Payment[], siteVisits: SiteVisit[], fundRequests: FundRequest[], from: string, to: string, nameFor: (key: string) => string): ManagementReportData {
  // approved-only, matching the app-wide rule (Data Check's Ledger
  // mismatch check, Analytics' revenue figures) that a pending payment
  // hasn't actually been collected yet.
  const approved = payments.filter((p) => (p.status ?? 'approved') === 'approved');
  const newLeads = leads.filter((l) => inRange(l.date, from, to));
  const paymentsInRange = approved.filter((p) => inRange(p.date, from, to));
  const revenue = paymentsInRange.reduce((s, p) => s + p.amount, 0);

  const byMethodMap = new Map<string, { count: number; total: number }>();
  paymentsInRange.forEach((p) => {
    const m = p.paymentMethod ?? 'Unspecified';
    const existing = byMethodMap.get(m) ?? { count: 0, total: 0 };
    existing.count += 1;
    existing.total += p.amount;
    byMethodMap.set(m, existing);
  });

  // Outstanding/fully-paid are company-wide balance snapshots, not
  // range-scoped -- matches index.html's own outstandingTotal/
  // fullyPaidCount, which reduce over allLeads regardless of `from`/`to`.
  const outstandingTotal = leads.reduce((s, l) => s + Math.max(l.grandTotal - l.amtPaid, 0), 0);
  const fullyPaidCount = leads.filter((l) => l.grandTotal > 0 && l.amtPaid >= l.grandTotal).length;
  const visitsInRange = siteVisits.filter((v) => inRange(v.visitDate, from, to)).length;

  const agentKeys = new Set(leads.map((l) => l.agent));
  const perAgent = [...agentKeys]
    .map((key) => {
      const leadsA = newLeads.filter((l) => l.agent === key);
      const revA = paymentsInRange.filter((p) => p.agentKey === key).reduce((s, p) => s + p.amount, 0);
      return { name: nameFor(key), newLeads: leadsA.length, revenue: revA };
    })
    .filter((a) => a.newLeads > 0 || a.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue);

  const pendingPayments = payments.filter((p) => p.status === 'pending').length;
  const pendingFundRequests = fundRequests.filter((f) => f.status === 'pending').length;

  // Trailing 6-month revenue trend + a 3-month linear-regression forecast
  // -- deliberately independent of the selected report range, so a short
  // custom period still shows real momentum, same as index.html.
  const mk = today().slice(0, 7);
  const revenueTrend = Array.from({ length: 6 }, (_, i) => {
    const key = shiftMonth(mk, i - 5);
    const d = new Date(`${key}-01T00:00:00`);
    return { label: d.toLocaleDateString('en-GB', { month: 'short' }), value: approved.filter((p) => monthKey(p.date) === key).reduce((s, p) => s + p.amount, 0) };
  });

  const fvals = [2, 1, 0].map((i) => {
    const key = shiftMonth(mk, -i);
    return approved.filter((p) => monthKey(p.date) === key).reduce((s, p) => s + p.amount, 0);
  });
  let forecastNextMonth: number | null = null;
  if (fvals.filter((v) => v > 0).length >= 2) {
    const n = 3;
    const xMean = 1;
    const yMean = fvals.reduce((a, b) => a + b, 0) / n;
    let numer = 0;
    let den = 0;
    [0, 1, 2].forEach((x, i) => {
      numer += (x - xMean) * (fvals[i] - yMean);
      den += (x - xMean) ** 2;
    });
    const slope = den ? numer / den : 0;
    forecastNextMonth = Math.max(0, Math.round(yMean + slope * (3 - xMean)));
  }

  return {
    newLeadsCount: newLeads.length,
    revenue,
    outstandingTotal,
    fullyPaidCount,
    visitsInRange,
    perAgent,
    byMethod: [...byMethodMap.entries()].map(([method, v]) => ({ method, ...v })),
    pendingPayments,
    pendingFundRequests,
    revenueTrend,
    forecastNextMonth,
    pipelineComposition: computePipelineComposition(leads),
  };
}
