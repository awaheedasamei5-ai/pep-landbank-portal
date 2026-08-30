import type { Config, Lead, PlotType } from '../../../types/domain';

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
export const QUOTE_DEPOSIT_PCT = 0.3;

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

// Ported from index.html's computeLead()+computeLeadQuotationTotals()
// (index.html:2860-2864, 17077-17095) -- used by the Contract of Sale PDF.
// Unlike the plain calculator above, a real lead can carry manager-set
// overrides on top of standard pricing: a custom unitPrice, an explicit
// discount, a stored netTotal/grandTotal (set once when the deal was
// negotiated and not necessarily equal to today's config-driven price),
// and a depositTarget that need not be exactly 30% of net. Every override
// is respected when present; only a field actually left blank falls back
// to the same standard-pricing math computeQuotationTotals() uses.
export function computeLeadQuotationTotals(config: Config, lead: Lead): QuotationTotals {
  const p = pricingFor(config, lead.plotType);
  const qty = lead.noPlots;
  const gross = (lead.unitPrice || p.list) * qty;
  const disc = lead.discount != null ? lead.discount : p.disc * qty;
  const computedNet = Math.max(gross - disc, 0);
  const eq = p.eq * qty;
  const interestTotal = interestFor(config, lead.paymentPlan) * eq;

  const net = lead.netTotal != null ? lead.netTotal : computedNet;
  const grand = lead.grandTotal != null ? lead.grandTotal : net + interestTotal;
  const planMonths = PLAN_MONTHS[lead.paymentPlan] ?? 0;
  const target = lead.depositTarget != null ? lead.depositTarget : Math.round(net * QUOTE_DEPOSIT_PCT);

  let deposit = 0;
  let balance = grand;
  let monthlyDue = 0;
  const schedule: InstallmentScheduleRow[] = [];
  if (planMonths && grand > 0) {
    deposit = Math.min(Math.max(target, 0), grand);
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
  return { listTotal: gross, discountTotal: disc, net, interestTotal, grand, planMonths, deposit, balance, monthlyDue, schedule };
}

// ---- Technical Quotation: geometry-driven pricing -----------------------
// Ported from index.html's techBaseAreaSqft()/techHalfAreaSqft()/
// techPricePerSqft()/techCustomLotArea()/computeTechnicalQuotationTotals()
// (index.html:2682-2689, 16623-16640) -- pricing is driven purely by
// combined area (standard plots at their configured baseline size, plus
// any custom/irregular lots via rectangular or trapezoidal formulas)
// times one dynamic GHS/sqft rate, always derived from config.fullPrice /
// baseline area -- never a hardcoded rate. Interest scales the same way
// Standard Quotation's does (a flat per-full-plot-equivalent figure),
// using area/baseArea as the continuous "plot equivalent" in place of a
// discrete plot count, since a custom lot has no natural plot count.
export type TechLotShape = 'rectangular' | 'trapezoidal';

export interface TechLot {
  shape: TechLotShape;
  len: number | '';
  wid: number | '';
  a: number | '';
  b: number | '';
  h: number | '';
}

export function techBaseAreaSqft(config: Config): number {
  return config.techFullPlotLengthFt * config.techFullPlotWidthFt;
}

export function techHalfAreaSqft(config: Config): number {
  return config.techHalfPlotLengthFt * config.techHalfPlotWidthFt;
}

export function techPricePerSqft(config: Config): number {
  const a = techBaseAreaSqft(config);
  return a > 0 ? config.fullPrice / a : 0;
}

export function techCustomLotArea(lot: TechLot): number {
  if (!lot) return 0;
  if (lot.shape === 'trapezoidal') return Math.max(0, (((Number(lot.a) || 0) + (Number(lot.b) || 0)) / 2) * (Number(lot.h) || 0));
  return Math.max(0, (Number(lot.len) || 0) * (Number(lot.wid) || 0));
}

export interface TechnicalQuotationTotals {
  rate: number;
  fullCount: number;
  halfCount: number;
  fullArea: number;
  halfArea: number;
  customLots: TechLot[];
  customAreas: number[];
  customArea: number;
  totalArea: number;
  net: number;
  interestTotal: number;
  grand: number;
  planMonths: number;
  deposit: number;
  balance: number;
  monthlyDue: number;
  schedule: InstallmentScheduleRow[];
}

export function computeTechnicalQuotationTotals(config: Config, fullCount: number, halfCount: number, customLots: TechLot[], plan: PaymentPlanKey, depositPctOverride: number | null): TechnicalQuotationTotals {
  const rate = techPricePerSqft(config);
  const baseArea = techBaseAreaSqft(config);
  const fullArea = baseArea * fullCount;
  const halfArea = techHalfAreaSqft(config) * halfCount;
  const customAreas = customLots.map(techCustomLotArea);
  const customArea = customAreas.reduce((s, a) => s + a, 0);
  const totalArea = fullArea + halfArea + customArea;
  const net = Math.round(totalArea * rate);
  const eq = baseArea > 0 ? totalArea / baseArea : 0;
  const interestTotal = Math.round(interestFor(config, plan) * eq);
  const planMonths = PLAN_MONTHS[plan] ?? 0;
  const depositPct = depositPctOverride != null ? Math.max(0, Math.min(100, depositPctOverride)) / 100 : QUOTE_DEPOSIT_PCT;
  const ip = computeInstallmentPlan(net, interestTotal, planMonths, depositPct);
  return { rate, fullCount, halfCount, fullArea, halfArea, customLots, customAreas, customArea, totalArea, net, interestTotal, grand: ip.grand, planMonths, deposit: ip.deposit, balance: ip.balance, monthlyDue: ip.monthlyDue, schedule: ip.schedule };
}
