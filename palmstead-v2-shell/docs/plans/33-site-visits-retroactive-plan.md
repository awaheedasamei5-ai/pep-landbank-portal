# Site Visits — retroactive plan (palmstead-v2-shell)

Written retroactively, 2026-10-25, as part of `docs/plans/30-master-system-audit-and-unification-plan.md` Phase 9.

## 1. What it does

Books and tracks client site visits to Royal Palm Enclave, Tsopoli — who's visiting, which plot type they're interested in, pickup/transport logistics, and a detailed post-visit record (purpose, discussion so far, key understanding, feedback, next steps). Feeds Site Visit Authorization's day-level cost reconciliation and (via `leadId`) a lead's own Pipeline detail page.

**Staff**: `useSiteVisits()` — their own logged visits only (real `site_visits_sel` RLS: `agent_key = my_key() OR has_permission('ops.view_all')`). **Management**: `useAllSiteVisits()` — every staff member's visits, with a staff-filter dropdown, same `isManager`-widening pattern Master Pipeline uses rather than a second bespoke screen.

## 2. Real database schema

`site_visits`: `id, agent_key, agent_name, name, contact, plot, site, visit_date, visit_time, people, transport, pickup, notes, status, created_at, place_of_work, position, nationality, purpose, discussion_so_far, key_understanding, feedback_after, key_next_steps, source, accompanied, lead_id, deleted_at, deleted_by, deleted_by_name, cancellation_reason, advance_reminder_sent_at, final_reminder_sent_at, rescheduled_at, rescheduled_by, rescheduled_by_name, previous_visit_date`. No `lead_id` FK constraint at the DB level — `name`/`contact` are the real match keys for a V1-era visit with no linked lead.

**RLS** (confirmed live):
- `site_visits_sel` / `site_visits_del`: `agent_key = my_key() OR has_permission('ops.view_all')`.
- `site_visits_ins`: `agent_key = my_key()` — a staff member can only log a visit under their own key.
- `site_visits_upd`: `agent_key = my_key() OR my_role() = 'manager'`.
- `site_visits_client_sel` / `site_visits_client_ins`: a real client-portal self-service path, matched by contact-digits + name (same `my_client_contact_digits()`/`my_client_name()` mechanism the client portal uses elsewhere) — a client can see and create their own visit requests without staff involvement.

## 3. Real screens

- **`SiteVisitsScreen.tsx`** (`/dashboard/site-visits`): the main list — search by name/contact, a staff-filter (Management only), a period filter (`PeriodFilterBar`, Day/Month/Year/Range/All time — shared component, not specific to this app), expandable rows showing the full `DETAIL_FIELDS` set (purpose, discussion, key understanding, feedback, next steps, transport, pickup, place of work, position, nationality, accompanied, source), a cancel action (soft-delete, Master Spec 9.4 — never a hard delete), reschedule, and a per-visit PDF download (`useDownloadSiteVisitFormPdf`).
- **`AddSiteVisitScreen.tsx`**: the booking form — `useCreateSiteVisit` (see below) is the real write path.
- Embedded elsewhere: `SiteVisitsSection` inside `PipelineDetailScreen.tsx` shows a lead's own visit history inline on their detail page (same `site_visits` rows, filtered by `lead_id` via `siteVisitsForLead`).

## 4. Real cross-app fan-out (`useCreateSiteVisit`, `data/source.ts` + `useSiteVisits.ts`)

A booking does more than insert one row:
1. Client SMS (if a contact was given) — includes the real date/time and pickup point (a real fix over V1, whose own equivalent message never included either).
2. Management in-app notification + SMS, to every manager-role profile's phone **and** `app_config.company_phone` (Management's real number — production has no manager-role profile with its own phone, confirmed live), deduped.
3. `findDuplicateVisit()` — client-side guard against the same staff member double-booking the same client/date (Master Spec 9.3), scoped to that staff member's own visits only (not a company-wide check).

Cancel and reschedule (`useCancelSiteVisit`/`useRescheduleSiteVisit`) follow the same shape in reverse: if the actor isn't the original logging agent (typically Management acting on someone else's visit), the original agent gets an in-app notification + SMS so they find out what happened and why, not just that the visit vanished from their list.

## 5. Realtime sync

Wired into `useDashboardRealtime.ts`: `site_visits` invalidates `['siteVisits']`, `['weekSiteVisits']`, `['siteVisitsForLead']` for every signed-in user.

## 6. AI integration

None. No `ai-insights` call anywhere in `src/webnext/features/site-visits/`.

## 7. Known gaps (not exhaustive)

- `useCanViewSiteVisitAuth`'s own comment (in the sibling Site Visit Authorization feature) claims "site visit experience app" access was opened to all staff "the same way" as a matching RLS fix — but as documented in `docs/plans/32-site-visit-authorization-retroactive-plan.md`, that RLS fix was never actually applied for the *Authorization* table. `site_visits` itself is fine (`site_visits_sel` is already `agent_key = my_key() OR has_permission('ops.view_all')`, consistent with the open-access UI) — this note is here only so the cross-reference is clear, not because Site Visits itself has the bug.
- V1→V2 migration (closed this same Phase 9 session): 59 of 85 real site visits were missing until this session's migration; no binary assets involved (this table never stored photos), so it's a clean, complete restore.
