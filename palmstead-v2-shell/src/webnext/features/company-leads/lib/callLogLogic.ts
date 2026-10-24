import type { ActivityLogEntry, Lead, SiteVisit } from '../../../types/domain';
import { today } from '../../../shared/lib/format';

// docs/plans/28-company-leads-engagement-upgrade-plan.md §5 -- the real,
// precise follow-up-queue definition: a lead's "open follow-up" is the
// `follow` date on its MOST RECENT activity_log row, if any. Logging a
// newer call naturally supersedes an older one (the new row becomes
// "most recent"), matching the real workflow -- no separate resolved/
// unresolved flag needed, and nothing can drift out of sync with it.
export interface OpenFollowUp {
  leadId: string;
  client: string;
  follow: string;
  overdue: boolean;
  latestEntry: ActivityLogEntry;
}

export function getOpenFollowUps(entries: ActivityLogEntry[]): OpenFollowUp[] {
  const latestByLead = new Map<string, ActivityLogEntry>();
  for (const e of entries) {
    if (!e.leadId) continue;
    const existing = latestByLead.get(e.leadId);
    if (!existing || e.createdAt > existing.createdAt) latestByLead.set(e.leadId, e);
  }
  const todayIso = today();
  const open: OpenFollowUp[] = [];
  for (const e of latestByLead.values()) {
    if (!e.follow || !e.leadId) continue;
    open.push({ leadId: e.leadId, client: e.client, follow: e.follow, overdue: e.follow < todayIso, latestEntry: e });
  }
  return open.sort((a, b) => a.follow.localeCompare(b.follow));
}

export function isToday(iso: string): boolean {
  return iso.slice(0, 10) === today();
}

// docs/plans/29-company-leads-full-system-blueprint.md Section 7.4 -- "how
// many of the people have gone to site out of the Company Leads, how many
// have bought, how many didn't," per the user's own words. Same real
// definition as the Dashboard's own tiles (all-time cohort measures, not
// period-gated -- matching the workbook's own Dashboard tab, where these
// three tiles don't move with the Year/Month selector either), factored
// out here so Call Log and the Dashboard can't silently drift apart.
export interface VisitCohort {
  visitedCount: number;
  boughtCount: number;
  notBoughtCount: number;
}

export function computeVisitCohort(leads: Lead[], visits: SiteVisit[]): VisitCohort {
  const leadIds = new Set(leads.map((l) => l.id));
  const visitedLeadIds = new Set(visits.filter((v) => v.leadId && leadIds.has(v.leadId)).map((v) => v.leadId as string));
  const visitedLeads = leads.filter((l) => visitedLeadIds.has(l.id));
  const boughtCount = visitedLeads.filter((l) => l.grandTotal > 0 && l.amtPaid >= l.grandTotal).length;
  return { visitedCount: visitedLeadIds.size, boughtCount, notBoughtCount: visitedLeadIds.size - boughtCount };
}
