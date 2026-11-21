# Cross-staff access split — 21 November 2026

## Current evidence

`ops.view_all` is a single legacy grant used by payments, contracts, site visits, and Data Check dismissal policies. An explicit override grants it to Elias, Elizabeth, and Emmanuel. The generic `agent` role default was removed in `20261121000000_restrict_sensitive_agent_defaults.sql`. Management has built-in access. The six remaining database policies still make one grant capable of reading three unrelated record types, deleting any site visit, and dismissing company-wide Data Check alerts. The Site Visit UI offers only a soft cancel; a hard table DELETE is not part of the user workflow. The Data Check UI writes personal dismissals for all non-managers, but the old insert rule rejects that write for staff with `ops.view_all`.

## Access contract

- Split cross-staff **read** into `payments.view_all`, `contracts.view_all`, and `site_visits.view_all`. An ordinary staff member keeps access to records in their own existing scope. Client-portal payment, contract, and visit policies remain unchanged.
- Copy existing explicit `ops.view_all` overrides to each new read key to avoid silently removing current named oversight access. New Staff receive no default cross-staff grant. Management can then set each app independently.
- Site Visit hard DELETE has no supported UI flow and is denied to browser roles. Existing soft cancellation remains a guarded UPDATE flow.
- Company-wide Data Check dismissal is Management-only. Personal dismissals work for any staff member, including a staff member with cross-staff read access. A cross-staff read grant never confers a company-wide action.
- Keep the legacy key and audit rows for history, but remove it from all active policies. The Settings screen shows only the new functional keys.

## Verification and release

Check new and ordinary staff permission results, named existing overrides, RLS row counts for the three tables, a denied unauthorized DELETE, and personal/company Data Check insert boundaries in rollback-only SQL. Check Management settings and Staff My Access on the exact preview, TypeScript, then merge to V2 `rebuild` and verify the exact production commit alias. Do not send SMS, delete records, or change a real user override during testing.

### Database checks completed before preview

The migration applied to V2. `npx tsc -b` passed. Adams retains 9 visible payments, 3 contracts and 11 site visits with no cross-staff grant; Elias, Elizabeth, Emmanuel and Management retain 19 payments, 8 contracts and 88 site visits. A rolled-back Elias override of `payments.view_all` reduced only payment visibility (19 to 9), while contracts and visits stayed at 8 and 88. The override returned to its original true value after rollback. An Adams hard DELETE of an owned site visit affected zero rows. An Elias personal Data Check dismissal inserted inside a transaction, then rolled back; a company-wide dismissal was rejected by RLS. Zero QA dismissal rows remain.

## References

- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html

