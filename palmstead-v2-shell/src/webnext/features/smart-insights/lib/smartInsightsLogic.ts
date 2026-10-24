import type { Lead, Payment, Complaint, Referral, AllocationRequest, ContractRequest, LeaveRequest, Banner } from '../../../types/domain';
import { today, shiftMonth, monthKey, daysSince, ghs } from '../../../shared/lib/format';
import { linearForecastNextMonth } from '../../../shared/lib/forecast';

// docs/plans/18-smart-insights-plan.md -- port of index.html's real
// getInsightLists()/computeSmartInsights() (index.html:9484-9954),
// already correctly ported once before in web-next/src/features/
// smart-insights/lib/smartInsightsLogic.ts; carried over near-verbatim
// here since the logic itself was already right, only the UI needed a
// real rebuild. Proactive, auto-generated nudges from data already on
// hand, re-scanned every time the screen opens (no dismiss/snooze
// state, matching the original). One real check deliberately dropped:
// "overdue follow-ups" read `l.followDate` on a LEAD object -- verified
// live (information_schema.columns) that `leads` has no `follow_date`
// column at all; that field only exists on `enquiries`. The check was
// comparing a lead against a property no lead object has ever carried,
// so in real production data it always evaluates to an empty list -- a
// genuine latent dead-code bug in index.html, not ported forward here.

export type InsightKind = 'cold' | 'nearTrigger' | 'readyForAllocation' | 'stalledHigh';

// docs/plans/26-smart-insights-v2-cross-app-plan.md -- 6 new cross-app
// kinds, each a real "something is aging and needs a nudge" signal from
// an app that previously fed zero signals into Smart Insights. Kept as
// a separate union (not merged into InsightKind) since their drill-down
// rows are a different shape (not a Lead) -- CrossAppInsightKind's own
// screen branch handles that.
export type CrossAppInsightKind = 'complaintAging' | 'referralAging' | 'allocationAging' | 'contractRequestAging' | 'leavePending' | 'bannerZeroLeads';

export const INSIGHT_META: Record<InsightKind, { title: string; desc: string }> = {
  cold: { title: 'Going cold', desc: 'No next action set, added 10+ days ago' },
  readyForAllocation: { title: 'Ready for allocation', desc: '30% or more paid — eligible for a plot allocation request' },
  nearTrigger: { title: 'Near the 30% allocation mark', desc: 'Between 20% and 30% paid — one more payment away from triggering an allocation request' },
  stalledHigh: { title: 'High priority, no follow-up planned', desc: 'Marked High priority but nothing scheduled next' },
};

export const CROSS_APP_INSIGHT_META: Record<CrossAppInsightKind, { title: string; desc: string; app: string }> = {
  complaintAging: { title: 'Complaints open 7+ days', desc: 'Not yet marked resolved', app: 'Complaints' },
  referralAging: { title: 'Referrals pending 14+ days', desc: 'Logged but not yet cleared', app: 'Referrals' },
  allocationAging: { title: 'Allocation requests pending 5+ days', desc: 'Awaiting a plot suggestion or confirmation', app: 'Allocations' },
  contractRequestAging: { title: 'Contract requests awaiting generation 5+ days', desc: 'Requested but no contract generated yet', app: 'Contract of Sale' },
  leavePending: { title: 'Leave requests pending decision 3+ days', desc: 'Awaiting Management approval or decline', app: 'Leave' },
  bannerZeroLeads: { title: 'Banners with zero leads after 14 days', desc: 'Active campaigns generating no real pipeline', app: 'Banner Tracking' },
};

export interface PctLead extends Lead {
  __pct?: number;
}

function isActive(l: Lead): boolean {
  return l.stage !== 'Lost' && l.amtPaid < l.grandTotal;
}

function pctPaid(l: Lead): number {
  if (!l.grandTotal) return 0;
  return Math.round((l.amtPaid / l.grandTotal) * 100);
}

// Master Spec Section 4's lifecycle-automation gap: this used to key
// off l.date (creation date) alone, so a lead untouched for years but
// created recently read as "fresh," and one created long ago but worked
// on yesterday read as permanently cold. leads.last_modified_at is a
// real, already-existing trigger-maintained column (bumped on every
// UPDATE -- stage changes, payments via approve_payment, doc-stage,
// tags/next-action edits) -- falls back to creation date only for the
// rare row that predates the trigger or in demo mode, where it's never
// set at all.
function lastActivityIso(l: Lead): string {
  return (l.lastModifiedAt ?? l.date).slice(0, 10);
}

export function getInsightLists(leads: Lead[]): Record<InsightKind, PctLead[]> {
  const active = leads.filter(isActive);
  const cold = active.filter((l) => !(l.nextAction ?? '').trim() && daysSince(lastActivityIso(l)) >= 10);
  const nearTrigger = active
    .filter((l) => l.grandTotal > 0 && pctPaid(l) >= 20 && pctPaid(l) < 30)
    .map((l) => ({ ...l, __pct: pctPaid(l) }))
    .sort((a, b) => (b.__pct ?? 0) - (a.__pct ?? 0));
  const readyForAllocation = active
    .filter((l) => l.grandTotal > 0 && pctPaid(l) >= 30)
    .map((l) => ({ ...l, __pct: pctPaid(l) }))
    .sort((a, b) => (b.__pct ?? 0) - (a.__pct ?? 0));
  const stalledHigh = active.filter((l) => l.priority === 'High' && !(l.nextAction ?? '').trim());
  return { cold, nearTrigger, readyForAllocation, stalledHigh };
}

export interface SmartInsight {
  key: string;
  icon: 'warning' | 'trophy' | 'chartLine' | 'barChart' | 'check';
  tone: 'ok' | 'warn' | 'danger';
  text: string;
  detail?: string;
  kind?: InsightKind;
  crossAppKind?: CrossAppInsightKind;
  app?: string;
}

// The 6 new cross-app checks. Each is a plain, real aging rule against
// real columns (confirmed live via information_schema.columns this
// session) -- no new tables, no new computation beyond "how many days
// since this real timestamp".
export function getComplaintAging(complaints: Complaint[]): Complaint[] {
  return complaints.filter((c) => c.status !== 'Resolved' && daysSince(c.createdAt.slice(0, 10)) >= 7);
}

export function getReferralAging(referrals: Referral[]): Referral[] {
  return referrals.filter((r) => r.status !== 'Cleared' && daysSince(r.createdAt.slice(0, 10)) >= 14);
}

export function getAllocationAging(requests: AllocationRequest[]): AllocationRequest[] {
  return requests.filter((a) => a.status !== 'Allocated' && daysSince(a.createdAt.slice(0, 10)) >= 5);
}

export function getContractRequestAging(requests: ContractRequest[]): ContractRequest[] {
  return requests.filter((r) => r.status === 'pending' && daysSince(r.createdAt.slice(0, 10)) >= 5);
}

export function getLeavePending(requests: LeaveRequest[]): LeaveRequest[] {
  return requests.filter((r) => r.status === 'pending' && daysSince(r.createdAt.slice(0, 10)) >= 3);
}

// Banner status values (placed/needs_maintenance/location_only/
// being_replaced -- confirmed live) all describe the sign's physical
// condition, not whether the campaign is active -- a banner that
// "needs maintenance" is still up and should still be generating
// leads, so every banner counts here regardless of status, only its
// age and real attributed lead count matter.
export function getBannerZeroLeads(banners: Banner[], leads: Lead[]): Banner[] {
  const leadCountByBanner = new Map<string, number>();
  leads.forEach((l) => {
    if (l.bannerId) leadCountByBanner.set(l.bannerId, (leadCountByBanner.get(l.bannerId) ?? 0) + 1);
  });
  return banners.filter((b) => daysSince(b.createdAt.slice(0, 10)) >= 14 && !(leadCountByBanner.get(b.id) ?? 0));
}

export interface CrossAppData {
  complaints?: Complaint[];
  referrals?: Referral[];
  allocationRequests?: AllocationRequest[];
  contractRequests?: ContractRequest[];
  leaveRequests?: LeaveRequest[];
  banners?: Banner[];
}

// Drill-down lookup -- same shape as getInsightLists() but for the 6
// cross-app kinds, used by the [kind] route to render the right list
// regardless of which real table it came from.
export function getCrossAppInsightList(kind: CrossAppInsightKind, data: CrossAppData, leads: Lead[]): Complaint[] | Referral[] | AllocationRequest[] | ContractRequest[] | LeaveRequest[] | Banner[] {
  switch (kind) {
    case 'complaintAging':
      return getComplaintAging(data.complaints ?? []);
    case 'referralAging':
      return getReferralAging(data.referrals ?? []);
    case 'allocationAging':
      return getAllocationAging(data.allocationRequests ?? []);
    case 'contractRequestAging':
      return getContractRequestAging(data.contractRequests ?? []);
    case 'leavePending':
      return getLeavePending(data.leaveRequests ?? []);
    case 'bannerZeroLeads':
      return getBannerZeroLeads(data.banners ?? [], leads);
  }
}

export function computeSmartInsights(leads: Lead[], payments: Payment[], crossApp: CrossAppData = {}): SmartInsight[] {
  const insights: SmartInsight[] = [];
  const { cold, nearTrigger, readyForAllocation, stalledHigh } = getInsightLists(leads);

  if (cold.length) {
    insights.push({
      key: 'cold',
      icon: 'warning',
      tone: 'warn',
      text: `${cold.length} lead${cold.length === 1 ? '' : 's'} ${cold.length === 1 ? 'has' : 'have'} no next action set and ${cold.length === 1 ? 'is' : 'are'} going cold`,
      detail:
        cold
          .slice(0, 3)
          .map((l) => l.name)
          .join(', ') + (cold.length > 3 ? ` +${cold.length - 3} more` : ''),
      kind: 'cold',
    });
  }

  if (readyForAllocation.length) {
    insights.push({
      key: 'readyForAllocation',
      icon: 'trophy',
      tone: 'ok',
      text: `${readyForAllocation.length} client${readyForAllocation.length === 1 ? ' has' : 's have'} crossed 30% — ready for plot allocation`,
      detail: readyForAllocation
        .slice(0, 3)
        .map((l) => `${l.name} (${l.__pct}%)`)
        .join(', '),
      kind: 'readyForAllocation',
    });
  }

  if (nearTrigger.length) {
    insights.push({
      key: 'nearTrigger',
      icon: 'chartLine',
      tone: 'ok',
      text: `${nearTrigger.length} client${nearTrigger.length === 1 ? ' is' : 's are'} within reach of the 30% allocation mark`,
      detail: nearTrigger
        .slice(0, 3)
        .map((l) => `${l.name} (${l.__pct}%)`)
        .join(', '),
      kind: 'nearTrigger',
    });
  }

  if (stalledHigh.length) {
    insights.push({
      key: 'stalledHigh',
      icon: 'warning',
      tone: 'danger',
      text: `${stalledHigh.length} high-priority client${stalledHigh.length === 1 ? '' : 's'} ${stalledHigh.length === 1 ? 'has' : 'have'} no follow-up planned`,
      detail: stalledHigh
        .slice(0, 3)
        .map((l) => l.name)
        .join(', '),
      kind: 'stalledHigh',
    });
  }

  // Momentum -- this month vs last month collected (approved-only,
  // matching the app-wide rule established across Analytics/Data Check/
  // Management Reports).
  const approved = payments.filter((p) => (p.status ?? 'approved') === 'approved');
  const thisM = today().slice(0, 7);
  const lastM = shiftMonth(thisM, -1);
  const thisVal = approved.filter((p) => monthKey(p.date) === thisM).reduce((s, p) => s + p.amount, 0);
  const lastVal = approved.filter((p) => monthKey(p.date) === lastM).reduce((s, p) => s + p.amount, 0);
  if (lastVal > 0) {
    const delta = Math.round(((thisVal - lastVal) / lastVal) * 100);
    if (delta <= -20) {
      insights.push({ key: 'momentumDown', icon: 'chartLine', tone: 'danger', text: `Collections are down ${Math.abs(delta)}% vs last month`, detail: `${ghs(thisVal)} so far vs ${ghs(lastVal)} last month` });
    } else if (delta >= 20) {
      insights.push({ key: 'momentumUp', icon: 'chartLine', tone: 'ok', text: `Collections are up ${delta}% vs last month`, detail: `${ghs(thisVal)} so far vs ${ghs(lastVal)} last month` });
    }
  }

  // Simple revenue forecast -- linear trend over the last 3 months of
  // real approved payments.
  const fvals = [2, 1, 0].map((i) => {
    const key = shiftMonth(thisM, -i);
    return approved.filter((p) => monthKey(p.date) === key).reduce((s, p) => s + p.amount, 0);
  }) as [number, number, number];
  const forecast = linearForecastNextMonth(fvals);
  if (forecast != null) {
    insights.push({ key: 'forecast', icon: 'barChart', tone: 'ok', text: `Projected to collect ~${ghs(forecast)} next month`, detail: 'Based on the trend across your last 3 months of real payments — a projection, not a promise.' });
  }

  // Cross-app signals -- docs/plans/26-smart-insights-v2-cross-app-plan.md.
  // Each only pushes a card when there's something real to show; pct is
  // never attached since these aren't Lead rows.
  if (crossApp.complaints) {
    const list = getComplaintAging(crossApp.complaints);
    if (list.length) {
      insights.push({
        key: 'complaintAging',
        icon: 'warning',
        tone: 'warn',
        app: 'Complaints',
        text: `${list.length} complaint${list.length === 1 ? '' : 's'} open 7+ days`,
        detail: list
          .slice(0, 3)
          .map((c) => c.name || 'Unnamed')
          .join(', '),
        crossAppKind: 'complaintAging',
      });
    }
  }
  if (crossApp.referrals) {
    const list = getReferralAging(crossApp.referrals);
    if (list.length) {
      insights.push({
        key: 'referralAging',
        icon: 'chartLine',
        tone: 'warn',
        app: 'Referrals',
        text: `${list.length} referral${list.length === 1 ? '' : 's'} pending 14+ days`,
        detail: list
          .slice(0, 3)
          .map((r) => r.referredName)
          .join(', '),
        crossAppKind: 'referralAging',
      });
    }
  }
  if (crossApp.allocationRequests) {
    const list = getAllocationAging(crossApp.allocationRequests);
    if (list.length) {
      insights.push({
        key: 'allocationAging',
        icon: 'warning',
        tone: 'warn',
        app: 'Allocations',
        text: `${list.length} allocation request${list.length === 1 ? '' : 's'} pending 5+ days`,
        detail: list
          .slice(0, 3)
          .map((a) => a.clientName)
          .join(', '),
        crossAppKind: 'allocationAging',
      });
    }
  }
  if (crossApp.contractRequests) {
    const list = getContractRequestAging(crossApp.contractRequests);
    if (list.length) {
      insights.push({
        key: 'contractRequestAging',
        icon: 'warning',
        tone: 'warn',
        app: 'Contract of Sale',
        text: `${list.length} contract request${list.length === 1 ? '' : 's'} awaiting generation 5+ days`,
        detail: list
          .slice(0, 3)
          .map((r) => r.clientName)
          .join(', '),
        crossAppKind: 'contractRequestAging',
      });
    }
  }
  if (crossApp.leaveRequests) {
    const list = getLeavePending(crossApp.leaveRequests);
    if (list.length) {
      insights.push({
        key: 'leavePending',
        icon: 'warning',
        tone: 'danger',
        app: 'Leave',
        text: `${list.length} leave request${list.length === 1 ? '' : 's'} pending decision 3+ days`,
        detail: list
          .slice(0, 3)
          .map((r) => r.agentName)
          .join(', '),
        crossAppKind: 'leavePending',
      });
    }
  }
  if (crossApp.banners) {
    const list = getBannerZeroLeads(crossApp.banners, leads);
    if (list.length) {
      insights.push({
        key: 'bannerZeroLeads',
        icon: 'chartLine',
        tone: 'warn',
        app: 'Banner Tracking',
        text: `${list.length} banner${list.length === 1 ? '' : 's'} with zero leads after 14 days`,
        detail: list
          .slice(0, 3)
          .map((b) => `${b.name} (${b.area})`)
          .join(', '),
        crossAppKind: 'bannerZeroLeads',
      });
    }
  }

  if (!insights.length) {
    insights.push({ key: 'clean', icon: 'check', tone: 'ok', text: 'Nothing urgent right now — pipeline looks healthy', detail: 'Smart insights re-scan every time you open this.' });
  }

  return insights;
}
