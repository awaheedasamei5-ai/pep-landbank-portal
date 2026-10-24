import type { ActivityLogEntry } from '../../../types/domain';
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
