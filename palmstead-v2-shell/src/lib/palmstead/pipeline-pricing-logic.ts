import type { AppConfigSubset } from "@/lib/palmstead/use-app-config";

// Direct logic port of web-next's pipelineLogic.ts (previewGrandTotal,
// computeDepositStatus, computeMonthlySchedule, qtyOfType) -- same real
// pricing engine (interest by payment plan, per-plot-type discount,
// deposit-target-is-percent-of-net) used by both Add Lead and Pipeline
// Detail's own Plot & Pricing edit there, so it lives here once too.
export type PlotType = "Full Plot" | "Half Plot";
export type PaymentPlan = "Full Payment" | "3 Months" | "6 Months" | "9 Months" | "12 Months";

export function qtyOfType(plotType: PlotType, noPlots: number): number {
  const eqPerUnit = plotType === "Half Plot" ? 0.5 : 1;
  return (noPlots || eqPerUnit) / eqPerUnit;
}

// Ported from web-next's deriveStageFromPayment -- same real stage
// thresholds (100/70/30%), used every time a payment changes a lead's
// amt_paid (creating a lead with an opening deposit, logging a payment).
export function deriveStageFromPayment(paid: number, grand: number): "1" | "2A" | "2B" | "3" | "4" {
  if (!grand || grand <= 0) return "1";
  const pct = (paid / grand) * 100;
  if (pct >= 100) return "4";
  if (pct >= 70) return "3";
  if (pct >= 30) return "2B";
  if (pct > 0) return "2A";
  return "1";
}

export interface GrandTotalPreview {
  net: number;
  interest: number;
  grand: number;
  disc: number;
  listPrice: number;
}

// noPlots is a full-plot-equivalent count everywhere (0.5 IS one standard
// Half Plot) -- see web-next's own previewGrandTotal comment for the real
// production undercharge bug this convention fixed.
export function previewGrandTotal(
  config: AppConfigSubset,
  plotType: PlotType,
  noPlots: number,
  unitPrice: number,
  discount: number | null,
  paymentPlan: PaymentPlan,
): GrandTotalPreview {
  const p =
    plotType === "Half Plot"
      ? { list: config.halfPrice, disc: config.halfDiscount, eq: 0.5 }
      : { list: config.fullPrice, disc: config.fullDiscount, eq: 1 };
  const eq = noPlots || 1;
  const qty = eq / p.eq;
  const unit = unitPrice || p.list;
  const gross = unit * qty;
  const disc = discount ?? p.disc * qty;
  const net = Math.max(gross - disc, 0);
  const interestTable: Record<PaymentPlan, number> = {
    "Full Payment": 0,
    "3 Months": config.int3,
    "6 Months": config.int6,
    "9 Months": config.int9,
    "12 Months": config.int12,
  };
  const interest = (interestTable[paymentPlan] ?? 0) * eq;
  return { net, interest, grand: net + interest, disc, listPrice: p.list };
}

export interface DepositStatus {
  target: number;
  paid: number;
  complete: boolean;
  remaining: number;
  clearedDate: string | null;
}

export interface DepositLeadSubset {
  grandTotal: number;
  depositTarget: number | null;
  netTotal: number | null;
}

// Simplified vs. web-next's own version: uses lead.netTotal (falling back
// to grandTotal) directly rather than re-deriving net via
// computeLeadQuotationTotals's full config-based recompute -- correct for
// every lead created through this shell's own Add Lead form (always sets
// netTotal), a reasonable approximation for older rows that predate it.
export function computeDepositStatus(
  config: AppConfigSubset,
  lead: DepositLeadSubset,
  paymentsForLead: { amount: number; date: string }[],
): DepositStatus {
  const net = lead.netTotal ?? lead.grandTotal;
  const target = lead.depositTarget ?? Math.round(net * (config.allocationThresholdPct / 100));
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

const PLAN_MONTHS: Record<string, number> = { "3 Months": 3, "6 Months": 6, "9 Months": 9, "12 Months": 12 };

function monthsElapsedSince(dateStr: string): number {
  const start = new Date(dateStr);
  const now = new Date();
  if (Number.isNaN(start.getTime())) return 1;
  return Math.max(1, (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()) + 1);
}

// Only ever non-null once the deposit has actually cleared -- the
// installment plan begins the day the deposit clears, not lead creation.
export function computeMonthlySchedule(
  config: AppConfigSubset,
  lead: DepositLeadSubset & { paymentPlan: PaymentPlan },
  paymentsForLead: { amount: number; date: string }[],
): MonthlySchedule | null {
  const planMonths = PLAN_MONTHS[lead.paymentPlan];
  if (!planMonths) return null;
  const grand = lead.grandTotal;
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
  if (Number.isNaN(startDate.getTime())) return null;
  const nextDue = new Date(startDate.getFullYear(), startDate.getMonth() + monthsElapsed, startDate.getDate());

  return {
    monthlyInstallment,
    planMonths,
    monthsElapsed,
    monthsRemaining,
    expectedThisMonth,
    arrears,
    nextDueDate: nextDue.toISOString().slice(0, 10),
  };
}
