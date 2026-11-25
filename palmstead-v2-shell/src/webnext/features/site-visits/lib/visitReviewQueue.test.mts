import assert from 'node:assert/strict';
import { test } from 'node:test';
import { visitReviewQueue } from './visitReviewQueue.ts';

test('review queue identifies missing evidence without treating future, no-show, or cancelled visits as overdue', () => {
  const rows = visitReviewQueue([
    { id: 'unknown', visit_date: '2026-11-20', attended: null, deleted_at: null, lead_id: null },
    { id: 'unlinked', visit_date: '2026-11-20', attended: true, deleted_at: null, lead_id: null },
    { id: 'linked', visit_date: '2026-11-20', attended: true, deleted_at: null, lead_id: 'lead-a' },
    { id: 'complete', visit_date: '2026-11-20', attended: true, deleted_at: null, lead_id: 'lead-b' },
    { id: 'no-show', visit_date: '2026-11-20', attended: false, deleted_at: null, lead_id: null },
    { id: 'future', visit_date: '2026-11-26', attended: null, deleted_at: null, lead_id: null },
    { id: 'cancelled', visit_date: '2026-11-20', attended: null, deleted_at: '2026-11-21', lead_id: null },
  ], '2026-11-25', {
    invites: [
      { id: 'waiting', site_visit_id: 'linked', sent_at: '2026-11-20' },
      { id: 'answered', site_visit_id: 'complete', sent_at: '2026-11-20' },
    ],
    surveys: [{ invite_id: 'answered' }],
    costs: [{ lead_id: 'lead-b', source_id: 'day-form' }],
    costDays: [{ id: 'day-form', visit_date: '2026-11-20' }],
  });
  assert.deepEqual(rows.map(({ visit }) => visit.id), ['unknown', 'unlinked', 'linked']);
  assert.deepEqual(rows.map(({ actions }) => actions), [
    ['Confirm attendance'],
    ['Link pipeline lead', 'Invite client feedback'],
    ['Follow up on client feedback', 'Review visit cost attribution'],
  ]);
});
