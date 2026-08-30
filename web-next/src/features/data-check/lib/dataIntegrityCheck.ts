import type { Config, Lead, Payment, SiteVisit } from '../../../types/domain';
import { computeLeadQuotationTotals } from '../../quotation/lib/quotationLogic';

export type IssueSeverity = 'danger' | 'warn';

export interface DataIssue {
  leadId: string;
  leadName: string;
  agentDisplay: string;
  type: string;
  severity: IssueSeverity;
  detail: string;
}

function issueDismissKey(issue: Pick<DataIssue, 'leadId' | 'type'>): string {
  return `issue_${issue.leadId}_${issue.type.replace(/\s+/g, '')}`;
}

const DISMISS_KEY = 'pep_webnext_dismissed_issues';

function dismissedIssueKeys(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DISMISS_KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function dismissIssue(issue: Pick<DataIssue, 'leadId' | 'type'>): void {
  const key = issueDismissKey(issue);
  const existing = dismissedIssueKeys();
  if (!existing.includes(key)) {
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify([...existing, key]));
    } catch {
      // storage full/unavailable -- dismissal just won't stick, not fatal
    }
  }
}

function contactMatches(a: string | null | undefined, b: string | null | undefined, name1: string, name2: string): boolean {
  const ca = String(a ?? '').replace(/\D/g, '');
  const cb = String(b ?? '').replace(/\D/g, '');
  const nameMatch = name1.trim().toLowerCase() === name2.trim().toLowerCase() && name1.trim() !== '';
  if (ca && cb) return ca === cb && nameMatch;
  return nameMatch;
}

// Ported from index.html's runDataIntegrityCheck() (index.html:19180-19271)
// -- scans every lead in scope for pricing/payment inconsistencies and
// record hygiene. Two checks are deliberately out of scope here (documented
// in the DataCheckScreen comment, not silently dropped): "Missing payment
// plan" (web-next's mapLeadRow already defaults a null payment_plan to
// 'Full Payment', so the real gap it would catch is masked before this
// function ever sees the lead) and "Unresolved task" (web-next's
// ScheduleItem has no lead_id linkage at all, unlike the real schema).
//
// One deliberate correction from a literal port, not a fidelity gap: the
// real "Ledger mismatch" check sums ALL of a lead's payments with no status
// filter, which would false-positive on every lead with a payment still
// awaiting approval (pending/declined payments live in the same table,
// confirmed this session while building Log Payment) -- amtPaid is only
// ever supposed to reflect *approved* payments (this app's own payments_sel
// RLS and applyApprovedPaymentToLead precedent), so this filters to
// approved-or-unset-status (matching the same `status ?? 'approved'`
// fallback PipelineDetailScreen already uses for pre-status legacy rows)
// before summing.
export function runDataIntegrityCheck(leads: Lead[], payments: Payment[], siteVisits: SiteVisit[], config: Config, agentNameFor: (agentKey: string) => string = (k) => k): DataIssue[] {
  const issues: DataIssue[] = [];

  leads.forEach((l) => {
    const totals = computeLeadQuotationTotals(config, l);
    const expectedUnit = l.plotType === 'Half Plot' ? config.halfPrice : config.fullPrice;
    const storedGrand = l.grandTotal;
    const agentDisplay = agentNameFor(l.agent);
    const push = (type: string, severity: IssueSeverity, detail: string) => issues.push({ leadId: l.id, leadName: l.name, agentDisplay, type, severity, detail });

    if (!l.unitPrice) {
      push('Missing unit price', 'danger', 'Unit price is zero or blank — grand total is likely wrong.');
    } else if (Math.abs(l.unitPrice - expectedUnit) > 1) {
      push('Price mismatch', 'warn', `Unit price ${l.unitPrice} vs current ${l.plotType} price ${expectedUnit}. Could be a past promo — worth confirming.`);
    }

    if (Math.abs(storedGrand - totals.grand) > 1) {
      push('Total out of sync', 'danger', `Stored grand total doesn't match what the current numbers recalculate to.`);
    }

    if (l.amtPaid > storedGrand + 1) {
      push('Overpaid', 'danger', `Paid more than the grand total on file.`);
    }

    const ledgerSum = payments.filter((p) => p.leadId === l.id && (p.status ?? 'approved') === 'approved').reduce((s, p) => s + p.amount, 0);
    if (Math.abs(l.amtPaid - ledgerSum) > 1) {
      push('Ledger mismatch', 'danger', `Amount paid doesn't match the sum of this client's approved payment entries — a correction may not have synced correctly.`);
    }

    if (!l.noPlots) {
      push('Missing quantity', 'danger', 'No. of plots is zero or blank.');
    }
    if (l.plotType === 'Half Plot' && l.noPlots > 0 && l.noPlots < 1) {
      push('Quantity error', 'danger', `No. of plots is ${l.noPlots} on a Half Plot — that's half of an already-half unit. This almost always means it should be 1, not ${l.noPlots}.`);
    }

    const isDead = l.stage === 'Lost' || l.amtPaid >= storedGrand;
    if (!l.contact) {
      push('Missing contact', 'warn', "No phone number on file — this client can't be reached or receive SMS/portal login.");
    }
    if (!l.nextAction && !isDead) {
      push('Missing next action', 'warn', 'No next action set — this lead has no follow-up plan.');
    }
    if (l.lastModifiedAt && !isDead) {
      const staleDays = Math.round((Date.now() - new Date(l.lastModifiedAt).getTime()) / 86400000);
      if (staleDays > 30) push('Stale lead', 'warn', `No updates in ${staleDays} days — this lead may need a follow-up call.`);
    }

    const today = new Date().toISOString().slice(0, 10);
    siteVisits
      .filter((v) => v.visitDate && v.visitDate < today && !(v.feedbackAfter ?? '').trim() && contactMatches(v.contact, l.contact, v.name, l.name))
      .forEach((v) => push('Unlogged site visit outcome', 'warn', `Site visit on ${v.visitDate} has no outcome/feedback recorded — was the result of this visit ever logged?`));
  });

  const contactGroups = new Map<string, Lead[]>();
  leads.forEach((l) => {
    const digits = String(l.contact ?? '').replace(/\D/g, '');
    if (digits.length < 9) return;
    const key = digits.slice(-9);
    if (!contactGroups.has(key)) contactGroups.set(key, []);
    contactGroups.get(key)!.push(l);
  });
  contactGroups.forEach((group) => {
    const distinctNames = new Set(group.map((l) => l.name.trim().toLowerCase()).filter(Boolean));
    if (distinctNames.size > 1) {
      group.forEach((l) => {
        const others = group
          .filter((x) => x !== l)
          .map((x) => x.name)
          .join(', ');
        const agentDisplay = agentNameFor(l.agent);
        issues.push({
          leadId: l.id,
          leadName: l.name,
          agentDisplay,
          type: 'Shared phone number',
          severity: 'danger',
          detail: `This phone number is also on ${others}'s lead — almost always means one of the two numbers was mistyped.`,
        });
      });
    }
  });

  const dismissed = dismissedIssueKeys();
  return issues.filter((iss) => !dismissed.includes(issueDismissKey(iss)));
}
