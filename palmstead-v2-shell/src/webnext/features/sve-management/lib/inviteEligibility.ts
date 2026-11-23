import type { SiteVisit } from '../../../types/domain';

type VisitForInvite = Pick<SiteVisit, 'attended' | 'deletedAt' | 'visitDate'>;

// Visit dates are Ghana calendar dates (UTC). Keep the UI and the fresh
// database check on the same rule before a client-facing message is sent.
export function sveInviteEligibility(visit: VisitForInvite, today = new Date().toISOString().slice(0, 10)) {
  if (visit.deletedAt) return { allowed: false, reason: 'Visit cancelled' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(visit.visitDate) || visit.visitDate > today) {
    return { allowed: false, reason: 'Visit has not happened yet' };
  }
  if (visit.attended === false) return { allowed: false, reason: 'Client did not attend' };
  if (visit.attended !== true) return { allowed: false, reason: 'Confirm attendance first' };
  return { allowed: true, reason: 'Ready to invite' };
}
