# Payment balance review — Data Check continuation

## Purpose and evidence

Eight current V2 leads have a difference between `leads.amt_paid` and the sum of their approved `payments.amount`. Some approved rows carry `approval_snapshot_is_legacy`. A mismatch is an exception for human review, not proof that either figure is wrong. Client 360 already shows a warning; Management needs a consolidated review path. This slice does not change balances, approvals, receipts, or payment records.

ERPNext's open-source Payment Reconciliation separates payment entries, references and allocations and validates before reconciling: https://github.com/frappe/erpnext/blob/develop/erpnext/accounts/doctype/payment_reconciliation/payment_reconciliation.py . Odoo likewise presents a transaction and matching accounting entries for review: https://www.odoo.com/documentation/19.0/applications/finance/accounting/bank/reconciliation.html . Our data has no bank feed or general ledger, so this is a narrower pipeline balance exception review, not bank reconciliation or an accounting adjustment tool.

## Database and security

- Reuse existing V2 `leads` and `payments` data and existing `Data Check` queries. No migration or financial write.
- Only Management sees the company-wide queue. Existing RLS scopes the underlying reads; Staff retain their scoped Data Check and Client 360 warning.
- Approved payments are those with `status='approved'` or legacy unset status, matching the existing mismatch scan. Pending, declined and correction rows do not change the approved sum.
- Keep the review queue independent of dismissed data-hygiene issues. Dismissing a warning cannot remove a financial exception from the queue.
- On a read error, show a visible error instead of an empty state.

## UI and behavior

- Place the review directly before the Data Check issue register, where Management already sees the ledger warning and can reach each pipeline lead.
- Sort by absolute discrepancy. Each record shows stored paid amount, approved-entry total, difference direction, owner and lead ID. Expand to inspect dates, methods, references and legacy markers. Provide Client 360 and pipeline links.
- Cards form one vertical review list at small widths and a compact three-column amount summary at wider widths. Use shell tokens in both themes.
- Never offer a one-click balance overwrite or receipt from this panel. The user must compare bank or legacy source evidence first.

## Verification and next layer

- Typecheck this slice, inspect the V2 preview with Management and Staff, check mobile overflow and link destinations, then merge to `rebuild` and verify the exact production deployment.
- Next layer: controlled, audited balance correction workflow with documentary evidence and a durable resolution log after the company defines who may correct historical imports. Do not infer those corrections from the current records.
