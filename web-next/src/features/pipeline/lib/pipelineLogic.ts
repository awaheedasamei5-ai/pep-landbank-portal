import type { Config, Lead, Payment, PlotType, Stage } from '../../../types/domain';
import { computeLeadQuotationTotals } from '../../quotation/lib/quotationLogic';

// Ports of index.html's stage constants/derivation (index.html:2541,
// 2846-2854, 17138-17139). Pricing here is deliberately simplified to
// unitPrice * noPlots -- the real app's interest/discount/deposit-target
// calc engine (computeLead(), index.html:2860+) is a large, separate
// feature deferred to a later phase; grandTotal below is not yet a full
// port of that engine.
export const STAGES: Stage[] = ['1', '2A', '2B', '3', '4', 'Lost'];

// Internal code -> staff-facing display code (reversed numbering, per the
// deliberate "pipeline stage display flip" business decision already
// shipped in index.html).
const DISPLAY_STAGE_CODE: Record<Stage, string> = { '1': '4', '2A': '3', '2B': '2B', '3': '2A', '4': '1', Lost: 'Lost' };

export function displayStageCode(s: Stage): string {
  return DISPLAY_STAGE_CODE[s] ?? s;
}

export function deriveStageFromPayment(paid: number, grand: number): Stage {
  if (!grand || grand <= 0) return '1';
  const pct = (paid / grand) * 100;
  if (pct >= 100) return '4';
  if (pct >= 70) return '3';
  if (pct >= 30) return '2B';
  if (pct > 0) return '2A';
  return '1';
}

export function computeGrandTotal(unitPrice: number, noPlots: number): number {
  return unitPrice * noPlots;
}

// Ported from index.html's allocationUnitsNeeded() (index.html:2660-2675) --
// breaks a lead's plotType+noPlots into the real physical units Allocations
// needs to hand over, e.g. 1.5 Full Plot -> ['Full Plot','Half Plot']. Uses
// the same full-plot-equivalence (1 for Full, 0.5 for Half) the pricing
// engine already uses, not a new invented concept.
export function allocationUnitsNeeded(plotType: PlotType, noPlots: number): PlotType[] {
  const eqPerUnit = plotType === 'Half Plot' ? 0.5 : 1;
  const eq = eqPerUnit * (noPlots || 1);
  const wholeCount = Math.floor(eq + 1e-9);
  const hasHalf = eq - wholeCount >= 0.5 - 1e-9;
  const units: PlotType[] = [];
  for (let i = 0; i < wholeCount; i++) units.push('Full Plot');
  if (hasHalf) units.push('Half Plot');
  return units.length ? units : ['Full Plot'];
}

const PLAN_MONTHS: Record<string, number> = { '3 Months': 3, '6 Months': 6, '9 Months': 9, '12 Months': 12 };

export interface DepositStatus {
  target: number;
  paid: number;
  complete: boolean;
  remaining: number;
  clearedDate: string | null;
}

// Ported from index.html's computeDepositStatus() (index.html:2704-2725).
// Default deposit target is 30% of NET (list minus discount, interest NOT
// included) -- confirmed by that function's own comment against a real
// test case with non-zero interest (GHS 48,000 list, GHS 3,000 interest,
// deposit must read GHS 14,400 = 30% of net, not 15,300 = 30% of grand).
// Only ever falls back to that default when no explicit depositTarget is
// on file; a real, already-set target is used exactly as stored.
export function computeDepositStatus(config: Config, lead: Lead, paymentsForLead: Payment[]): DepositStatus {
  const totals = computeLeadQuotationTotals(config, lead);
  const net = lead.netTotal != null ? lead.netTotal : totals.net;
  const target = lead.depositTarget != null ? lead.depositTarget : Math.round(net * 0.3);
  const sorted = [...paymentsForLead].sort((a, b) => a.date.localeCompare(b.date));
  let cum = 0;
  let clearedDate: string | null = null;
  for (const p of sorted) {
    const before = cum;
    cum += p.amount;
    if (before < target && cum >= target) clearedDate = p.date;
  }
  const complete = target > 0 && cum >= target;
  return { target, paid: cum, complete, remaining: Math.max(0, target - cum), clearedDate };
}

export interface MonthlySchedule {
  monthlyInstallment: number;
  planMonths: number;
  monthsElapsed: number;
  monthsRemaining: number;
  expectedThisMonth: number;
  arrears: number;
  nextDueDate: string;
}

function monthsElapsedSince(dateStr: string): number {
  const start = new Date(dateStr);
  const now = new Date();
  if (isNaN(start.getTime())) return 1;
  return Math.max(1, (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()) + 1);
}

// Ported from index.html's computeMonthlySchedule() (index.html:2734-2772).
// Only ever returns non-null once the deposit is fully cleared -- the
// monthly plan begins the day the deposit actually clears, not the lead's
// creation date or first payment. Everything paid beyond the deposit
// target flows into installment tracking as one running total (no
// individual payment needs to be tagged "this is the deposit" vs "this is
// month 3"), and arrears only ever counts unpaid installments from BEFORE
// this month -- this is what used to silently balloon "expected this
// month" up to the client's entire remaining balance for anyone behind.
export function computeMonthlySchedule(config: Config, lead: Lead, paymentsForLead: Payment[]): MonthlySchedule | null {
  const planMonths = PLAN_MONTHS[lead.paymentPlan];
  if (!planMonths) return null;
  const totals = computeLeadQuotationTotals(config, lead);
  const grand = lead.grandTotal || totals.grand;
  if (!grand) return null;
  const dep = computeDepositStatus(config, lead, paymentsForLead);
  if (!dep.complete || !dep.clearedDate) return null;

  const installmentTotal = Math.max(0, grand - dep.target);
  const monthlyInstallment = Math.round(installmentTotal / planMonths);
  const monthsElapsed = Math.min(planMonths, monthsElapsedSince(dep.clearedDate));
  const cumulativeThrough = (n: number) => Math.min(installmentTotal, monthlyInstallment * Math.max(0, n));

  const thisMonthStart = `${new Date().toISOString().slice(0, 7)}-01`;
  const totalPaid = paymentsForLead.reduce((s, p) => s + p.amount, 0);
  const paidBeforeThisMonth = paymentsForLead.filter((p) => p.date < thisMonthStart).reduce((s, p) => s + p.amount, 0);
  const installmentPaidTotal = Math.max(0, totalPaid - dep.target);
  const installmentPaidBeforeThisMonth = Math.max(0, paidBeforeThisMonth - dep.target);
  const installmentPaidThisMonth = installmentPaidTotal - installmentPaidBeforeThisMonth;

  const thisMonthSlot = cumulativeThrough(monthsElapsed) - cumulativeThrough(monthsElapsed - 1);
  const expectedThisMonth = Math.max(0, Math.round(thisMonthSlot - installmentPaidThisMonth));
  const arrears = Math.max(0, Math.round(cumulativeThrough(monthsElapsed - 1) - installmentPaidBeforeThisMonth));
  const monthsRemaining = Math.max(0, planMonths - monthsElapsed + 1);

  const startDate = new Date(dep.clearedDate);
  if (isNaN(startDate.getTime())) return null;
  const nextDue = new Date(startDate.getFullYear(), startDate.getMonth() + monthsElapsed, startDate.getDate());

  return { monthlyInstallment, planMonths, monthsElapsed, monthsRemaining, expectedThisMonth, arrears, nextDueDate: nextDue.toISOString().slice(0, 10) };
}
