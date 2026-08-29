import type { Config, PlotType } from '../../../types/domain';

// Ported exactly from index.html's computeInstallmentPlan()/
// computeQuotationTotals() (index.html:16586-16613) -- Standard Quotation
// only (Full/Half Plot at list price). Technical Quotation (custom/
// irregular lots priced by area at a dynamic GHS/sqft rate) is a separate,
// much larger geometry-driven feature, deliberately out of scope here.
export const PLAN_MONTHS: Record<PaymentPlanKey, number> = { 'Full Payment': 0, '3 Months': 3, '6 Months': 6, '9 Months': 9, '12 Months': 12 };

// Deposit is 30% of the NET price only (list minus discount, interest NOT
// included) -- confirmed against a real index.html test case with non-zero
// interest on the books (index.html:16571-16585's own documented
// debugging note): GHS 48,000 list, GHS 3,000 interest (12-month), deposit
// must read GHS 14,400 (30% of net) not GHS 15,300 (30% of the GHS 51,000
// grand). Getting this backwards is the exact bug that test caught once
// already -- ported as a fixed constant, not re-derived.
const QUOTE_DEPOSIT_PCT = 0.3;

export type PaymentPlanKey = 'Full Payment' | '3 Months' | '6 Months' | '9 Months' | '12 Months';

export interface InstallmentScheduleRow {
  month: number;
  opening: number;
  payment: number;
  closing: number;
}

export interface QuotationTotals {
  listTotal: number;
  discountTotal: number;
  net: number;
  interestTotal: number;
  grand: number;
  planMonths: number;
  deposit: number;
  balance: number;
  monthlyDue: number;
  schedule: InstallmentScheduleRow[];
}

function pricingFor(config: Config, plotType: PlotType): { list: number; disc: number; eq: number } {
  return plotType === 'Half Plot' ? { list: config.halfPrice, disc: config.halfDiscount, eq: 0.5 } : { list: config.fullPrice, disc: config.fullDiscount, eq: 1 };
}

function interestFor(config: Config, plan: PaymentPlanKey): number {
  const table: Record<PaymentPlanKey, number> = { 'Full Payment': 0, '3 Months': config.int3, '6 Months': config.int6, '9 Months': config.int9, '12 Months': config.int12 };
  return table[plan] ?? 0;
}

function computeInstallmentPlan(net: number, interestTotal: number, planMonths: number, depositPct: number): { grand: number; deposit: number; balance: number; monthlyDue: number; schedule: InstallmentScheduleRow[] } {
  const grand = net + interestTotal;
  let deposit = 0;
  let balance = grand;
  let monthlyDue = 0;
  const schedule: InstallmentScheduleRow[] = [];
  if (planMonths && grand > 0) {
    deposit = Math.round(net * depositPct);
    balance = grand - deposit;
    monthlyDue = Math.round(balance / planMonths);
    let opening = balance;
    for (let m = 1; m <= planMonths; m++) {
      const payment = m === planMonths ? opening : monthlyDue;
      const closing = Math.max(0, Math.round((opening - payment) * 100) / 100);
      schedule.push({ month: m, opening, payment, closing });
      opening = closing;
    }
  }
  return { grand, deposit, balance, monthlyDue, schedule };
}

export function computeQuotationTotals(config: Config, plotType: PlotType, noPlots: number, plan: PaymentPlanKey): QuotationTotals {
  const p = pricingFor(config, plotType);
  const listTotal = p.list * noPlots;
  const discountTotal = p.disc * noPlots;
  const net = Math.max(listTotal - discountTotal, 0);
  const eq = p.eq * noPlots;
  const interestTotal = interestFor(config, plan) * eq;
  const planMonths = PLAN_MONTHS[plan] ?? 0;
  const ip = computeInstallmentPlan(net, interestTotal, planMonths, QUOTE_DEPOSIT_PCT);
  return { listTotal, discountTotal, net, interestTotal, grand: ip.grand, planMonths, deposit: ip.deposit, balance: ip.balance, monthlyDue: ip.monthlyDue, schedule: ip.schedule };
}
