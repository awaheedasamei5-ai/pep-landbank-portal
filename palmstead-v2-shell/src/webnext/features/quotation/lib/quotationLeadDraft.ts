import type { PlotType } from '../../../types/domain';
import type { PaymentPlanKey } from './quotationLogic';

// Next's pipeline layout mounts before its Add Lead child and reads the
// routing shim's one-shot location state. Keep this short-lived handoff in
// the same browser tab so the quotation values survive that parent render.
const KEY = 'palmstead:quotation-lead-draft';
const MAX_AGE_MS = 5 * 60 * 1000;

export type QuotationLeadDraft = {
  name: string;
  contact: string;
  address: string;
  plotType: PlotType;
  noPlots: number;
  paymentPlan: PaymentPlanKey;
  unitPrice: number;
  discount: number;
  depositTarget?: number;
  leadSource: 'Quotation';
  returnTo: '/dashboard/quotation';
};

export function saveQuotationLeadDraft(draft: QuotationLeadDraft): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(KEY, JSON.stringify({ ...draft, savedAt: Date.now() }));
}

export function readQuotationLeadDraft(): QuotationLeadDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as QuotationLeadDraft & { savedAt: number };
    if (value.leadSource !== 'Quotation' || !Number.isFinite(value.savedAt) || Date.now() - value.savedAt > MAX_AGE_MS || !Number.isFinite(value.depositTarget ?? 0)) {
      window.sessionStorage.removeItem(KEY);
      return null;
    }
    return value;
  } catch {
    window.sessionStorage.removeItem(KEY);
    return null;
  }
}

export function clearQuotationLeadDraft(): void {
  if (typeof window !== 'undefined') window.sessionStorage.removeItem(KEY);
}

