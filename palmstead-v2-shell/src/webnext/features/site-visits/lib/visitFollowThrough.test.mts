import assert from 'node:assert/strict';
import { test } from 'node:test';
import { visitFollowThrough } from './visitFollowThrough.ts';

test('only confirmed, linked visits receive exact survey, later receipt and same-day cost evidence', () => {
  const visits = [
    { id: 'first', lead_id: 'lead-a', visit_date: '2026-11-10', attended: true, deleted_at: null },
    { id: 'second', lead_id: 'lead-a', visit_date: '2026-11-20', attended: true, deleted_at: null },
    { id: 'unlinked', lead_id: null, visit_date: '2026-11-10', attended: true, deleted_at: null },
    { id: 'unconfirmed', lead_id: 'lead-b', visit_date: '2026-11-10', attended: null, deleted_at: null },
    { id: 'cancelled', lead_id: 'lead-b', visit_date: '2026-11-10', attended: true, deleted_at: '2026-11-11' },
  ];
  const rows = visitFollowThrough(visits, {
    payments: [
      { lead_id: 'lead-a', amount: 10, payment_date: '2026-11-09' },
      { lead_id: 'lead-a', amount: 100, payment_date: '2026-11-12' },
      { lead_id: 'lead-a', amount: 200, payment_date: '2026-11-22' },
      { lead_id: 'lead-b', amount: 500, payment_date: '2026-11-22' },
    ],
    costs: [
      { lead_id: 'lead-a', source_id: 'day-10', amount: 50 },
      { lead_id: 'lead-a', source_id: 'day-20', amount: 70 },
      { lead_id: 'lead-b', source_id: 'day-10', amount: 90 },
    ],
    costDays: [{ id: 'day-10', visit_date: '2026-11-10' }, { id: 'day-20', visit_date: '2026-11-20' }],
    invites: [{ id: 'invite-old', site_visit_id: 'first' }, { id: 'invite-new', site_visit_id: 'first' }],
    surveys: [
      { invite_id: 'invite-old', created_at: '2026-11-11T09:00:00Z', purchase_intent: 'Maybe' },
      { invite_id: 'invite-new', created_at: '2026-11-12T09:00:00Z', purchase_intent: 'Ready to buy' },
    ],
  });
  assert.deepEqual(rows.map((row) => row.visit.id), ['first', 'second']);
  assert.deepEqual(rows.map((row) => row.laterCash), [300, 200]);
  assert.deepEqual(rows.map((row) => row.laterReceipts), [2, 1]);
  assert.deepEqual(rows.map((row) => row.matchedCost), [50, 70]);
  assert.deepEqual(rows.map((row) => row.purchaseIntent), ['Ready to buy', null]);
});
