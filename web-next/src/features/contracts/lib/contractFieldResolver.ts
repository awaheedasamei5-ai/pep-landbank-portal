import { fmtLongDate, ghs, today } from '../../../shared/lib/format';
import { computeLeadQuotationTotals, QUOTE_DEPOSIT_PCT } from '../../quotation/lib/quotationLogic';
import type { Config, ContractSection, Lead, LeadKyc } from '../../../types/domain';

// CONTRACT_OF_SALE_BLUEPRINT.md §9 capability 1 / §11 report 3 -- the one
// real deterministic missing-KYC check, shared by the AI completeness
// summary and the missing-information report so both name the same real
// fields rather than each re-deriving their own list.
const KYC_FIELD_LABELS: [keyof LeadKyc, string][] = [
  ['nationality', 'Nationality'],
  ['occupation', 'Occupation'],
  ['idType', 'ID type'],
  ['idNumber', 'ID number'],
  ['contactName', 'Contact person name'],
  ['contactPhone', 'Contact person phone'],
  ['landUsage', 'Land usage'],
];

export function missingKycFieldLabels(lead: Lead | null | undefined): string[] {
  if (!lead) return KYC_FIELD_LABELS.map(([, label]) => label);
  return KYC_FIELD_LABELS.filter(([key]) => !lead.kyc?.[key]).map(([, label]) => label);
}

// CONTRACT_OF_SALE_BLUEPRINT.md §7 -- a real, exhaustive, typed union
// (not a dynamic string lookup), so an unresolvable token is a
// compile-time-visible gap, not a silent blank at generation time.
export type ContractFieldKey =
  | 'clientLegalName'
  | 'clientAddress'
  | 'clientContact'
  | 'plotType'
  | 'noPlots'
  | 'unitPrice'
  | 'discount'
  | 'grandTotal'
  | 'depositAmount'
  | 'depositPercent'
  | 'monthlyInstallment'
  | 'paymentPlanMonths'
  | 'kycNationality'
  | 'kycOccupation'
  | 'kycIdType'
  | 'kycIdNumber'
  | 'kycContactName'
  | 'kycContactPhone'
  | 'kycLandUsage'
  | 'vendorCeoName'
  | 'generationDate';

const TOKEN_PATTERN = /\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g;

// CONTRACT_OF_SALE_BLUEPRINT.md §9 capability 3 -- human-readable labels
// for the consistency scan's real field-drift diff (never shown as raw
// camelCase keys to Management).
export const CONTRACT_FIELD_LABELS: Record<ContractFieldKey, string> = {
  clientLegalName: 'Client name',
  clientAddress: 'Client address',
  clientContact: 'Client contact',
  plotType: 'Plot type',
  noPlots: 'Number of plots',
  unitPrice: 'Unit price',
  discount: 'Discount',
  grandTotal: 'Grand total',
  depositAmount: 'Deposit amount',
  depositPercent: 'Deposit percent',
  monthlyInstallment: 'Monthly installment',
  paymentPlanMonths: 'Payment plan (months)',
  kycNationality: 'Nationality',
  kycOccupation: 'Occupation',
  kycIdType: 'ID type',
  kycIdNumber: 'ID number',
  kycContactName: 'Contact person name',
  kycContactPhone: 'Contact person phone',
  kycLandUsage: 'Land usage',
  vendorCeoName: 'Vendor CEO name',
  generationDate: 'Generation date',
};

export function resolveContractFields(lead: Lead, config: Config): Record<ContractFieldKey, string> {
  const totals = computeLeadQuotationTotals(config, lead);
  const depositTarget = lead.depositTarget != null ? lead.depositTarget : Math.round(totals.net * QUOTE_DEPOSIT_PCT);
  return {
    clientLegalName: lead.name || '',
    clientAddress: lead.address || lead.kyc?.location || '',
    clientContact: lead.contact || '',
    plotType: lead.plotType || '',
    noPlots: String(lead.noPlots || 1),
    unitPrice: ghs(lead.unitPrice || 0),
    discount: ghs(lead.discount || 0),
    grandTotal: ghs(totals.grand),
    depositAmount: ghs(depositTarget),
    depositPercent: `${Math.round(QUOTE_DEPOSIT_PCT * 100)}%`,
    monthlyInstallment: ghs(totals.monthlyDue),
    paymentPlanMonths: String(totals.planMonths),
    kycNationality: lead.kyc?.nationality || '',
    kycOccupation: lead.kyc?.occupation || '',
    kycIdType: lead.kyc?.idType || '',
    kycIdNumber: lead.kyc?.idNumber || '',
    kycContactName: lead.kyc?.contactName || '',
    kycContactPhone: lead.kyc?.contactPhone || '',
    kycLandUsage: lead.kyc?.landUsage || '',
    vendorCeoName: config.contractCeoName || '',
    generationDate: fmtLongDate(today()),
  };
}

// Substitutes every {{key}} this resolver knows about; an unrecognized or
// blank-valued key is deliberately left as the literal "{{key}}" text so
// findUnresolvedTokens() below can catch it -- never silently drops a
// token into an empty string that reads as correct but isn't.
export function resolveTokensInText(text: string, fieldValues: Record<string, string>): string {
  return text.replace(TOKEN_PATTERN, (match, key: string) => {
    const value = fieldValues[key];
    return value ? value : match;
  });
}

export function resolveSections(sections: ContractSection[], fieldValues: Record<string, string>): ContractSection[] {
  return sections.map((s) => (s.text ? { ...s, text: resolveTokensInText(s.text, fieldValues) } : s));
}

// CONTRACT_OF_SALE_BLUEPRINT.md §7's real correctness gate -- run before
// allowing generation. Scans the ALREADY-RESOLVED content (post
// resolveSections) for any {{...}} that survived, meaning either an
// unrecognized key or a known key with no real value for this lead.
export function findUnresolvedTokens(resolvedSections: ContractSection[]): string[] {
  const found = new Set<string>();
  for (const section of resolvedSections) {
    for (const match of (section.text ?? '').matchAll(TOKEN_PATTERN)) found.add(match[1]);
  }
  return [...found];
}
