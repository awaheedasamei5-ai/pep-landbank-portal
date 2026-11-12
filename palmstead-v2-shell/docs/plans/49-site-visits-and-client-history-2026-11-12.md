# Site Visits and client history rebuild — V2

Date: 12 November 2026. V2 only (`rebuild`, Supabase `sbydzrlzqxcdbudjaube`). This plan extends the implemented work recorded in plan 43. It does not replace the working client survey or send new SMS during a UI release.

## Product model and evidence

The workflow is **request → authorization and logistics → attended / no-show confirmation → client feedback → site manager day review → follow-up and payment**. Microsoft Field Service documents the same staged idea of scheduling, field execution, review, a record timeline, and reporting from structured inspection answers. Odoo's field service documentation pairs completed worksheets with recorded time/materials and a customer report. HubSpot's record page uses an activity timeline with discrete notes, calls and tasks. References: [Microsoft workflow](https://learn.microsoft.com/en-us/dynamics365/field-service/field-service-architecture), [Microsoft inspection analytics](https://learn.microsoft.com/en-us/dynamics365/field-service/inspections-reporting), [Odoo field service](https://www.odoo.com/documentation/20.0/applications/services/field_service/product_management.html), [HubSpot record timeline](https://knowledge.hubspot.com/records/work-with-records). OpenFieldPro and ERPNext are useful open-source architecture references, but cloning their data or UI wholesale would conflict with Palmstead's existing identities, payments and policies. Retain and extend the V2 system.

Current code already has Site Visit creation, cancel/reschedule, a per-client request PDF, Site Visit Authorization estimate/actual costs, Experience invites and feedback, manager day report and PDF, a conversion tab, client 360 site-visit form, linked leads, and a Site Visit report. Existing plan 43 completed attendance, cost linkage and conversion reads. Screenshot supplied by the user shows a Follow-up textarea and a separate **Add a note** action; the latter already creates rows in personal `notes`, but that section displays title/date only and personal RLS means a colleague cannot reliably read the conversation. Replacing the textarea without a shared access model would lose history.

Live V2 read on 12 November: 88 site visits, 3 linked by `lead_id`, 4 explicitly attended, 0 explicitly no-show, 84 unknown attendance; 3 client feedback submissions, 6 day reports, 65 weekly authorization forms. These counts make any broad attendance or conversion percentage misleading unless the unknown and unlinked cohorts are shown. Do not infer attendance from status `Completed`, a submitted survey, or an old free-text pipeline flag. Do not infer a sale from a scheduled visit or a linked lead.

## Canonical records and sync

- `site_visits.id` is the visit identity; `lead_id` is the exact pipeline/Client 360 link when known. Walk-ins can stay unlinked until staff explicitly match or convert them. Never auto-match only by name or phone without a review screen.
- `site_visit_experience_invites` and `_submissions` retain the perfect client-facing feedback form. Keep raw answers and submission timestamps. The manager's review, attendance and AI summary are separate, visibly attributed material; AI text is reviewable and never silently substituted for client words.
- `weekly_visit_forms` is the daily logistics budget with estimate and actual category amounts. A day report links by `weekly_visit_form_id`. `client_cost_attributions` carries the reviewed allocated per-client cost; label unallocated days and avoid double counting aggregate and attributed amounts.
- Pipeline/Company Leads/Master Pipeline and Client 360 read the same `leads.id`, `site_visits.lead_id`, approved payments, allocation, quotations and contract generations. Invalidation plus Supabase Realtime refreshes active screens; page reload always reconstructs from the database. Cross-app writes should be transactional or idempotent, not duplicate copies of source facts.
- Personal `notes` stay private. Add a separate append-only lead conversation timeline with lead FK, server timestamp, author profile, channel, summary/body and optional next action. Read access follows the lead's existing staff/management visibility; writing requires actual lead access. Existing `leads.notes` becomes a clearly labeled legacy summary, never overwritten by a new conversation. The UI shows full body, author and Ghana-local timestamp in oldest/newest order and can add a new entry without editing prior ones. Exact permissions and old-note migration must be audited before schema work.

## Site Visit workspace design

1. A responsive overview with upcoming, awaiting attendance, feedback awaiting invite/response, manager report pending, and rescheduled/cancelled queues. Search by name/reference/contact, then filter by day range, site, staff, attendance, authorization state, lead-link state, survey state, purchase intent and payment stage. Keep filter state visible and offer reset. Company-wide controls require permission; Staff see their own visit records and only their permitted lead data.
2. A dedicated visit detail route with sections for request form, authorization/budget, attendance, client survey, manager review, follow-up, payment and timeline. Back links return to the filtered list. Use existing shadcn cards, tabs, badges, tables and semantic theme colors. On phones, controls stack, tables scroll within cards, and action buttons remain reachable.
3. Site Visit Experience keeps the client survey unchanged. Redesign the staff workspace into clear Feedback, Day reports and Conversion sections. A day report distinguishes raw survey text, manager observations and generated analysis; shows missing evidence and linked cost. Manager approval/sending remains an explicit action.

## Report definitions and PDF set

Filters: date basis (scheduled date, recorded date, survey received date, payment date), arbitrary range, site, salesperson, site manager, attended/no-show/unknown/cancelled, lead linked/unlinked, feedback invited/submitted/missing, purchase intent, outcome/follow-up, cost availability, payment stage, lead source, plot type, and selected comparison period. A filter must apply to cards, charts, registers and PDF identically. Managers can compare staff/site cohorts; Staff remain personally scoped. Export selected sections as well as a full report.

Metrics: requested visits; authorized; attended; no-show; unknown; cancellations/reschedules; client and staff headcount; survey invitation, response and satisfaction distributions; NPS only among actual respondents; purchase intent; exact linked leads; conversion to **approved payment** and fully paid purchase as distinct measures; approved receipts by payment date; next-payment schedule where present; actual and estimated logistics by category; variance; attributed cost per attended client; cost per first-payment and per fully paid client only for cohorts with reliable links/cost. Compare both counts and rates with clear denominators and a missing-data panel. No payout/ROI conclusion from the 3 linked historical visits.

Documents:
- Client request/visit PDF: preserve the existing completed form, improve hierarchy, date/time, signer/issuer, site, pickup, party size and version.
- Individual feedback PDF: retain the client's exact answers and submitted timestamp; never present AI paraphrase as a quote.
- Manager day PDF: cover and methodology, planned vs confirmed attendance, manager narrative and review, client feedback summaries with provenance, budget estimate/actual breakdown and variance, attributed cost/unknown cost, follow-up actions, prepared/sent timestamps, and source record references.
- Filtered analytic PDF: cover and filters, KPI definitions, trend and comparison charts, staff/site breakdown, visit/client register, feedback/follow-up and finance linkages, evidence/data-quality notes, timestamp and pagination. Private KYC/receipt PDFs are linked in the authorized client dossier, not publicly embedded in an SMS report.
- Client dossier PDF: generated per authorized request from exact `lead_id` associations. Include identity/KYC snapshot with provenance, plot intentions and stage history where actually recorded, chronological conversations/calls, visits and forms, feedback, quotations, contracts, documents, allocations, approved payment ledger with receipt numbers/timestamps, and an appendix of receipt/contract PDFs only if securely retrievable. Identify missing artifacts rather than inventing them. Access follows client-record permissions; do not generate a reusable public all-data link.

## Delivery phases and gates

**A — Source audit and data quality** (first): map the actual records and permissions; fix misleading report wording; show unknown/unlinked evidence and add live refresh in the report without changing legacy rows. Validate Staff and Management counts against read-only SQL, browser filters and PDF.

**B — Visit workspace and detail route:** rebuild navigation and responsive screens around existing creation/cancel/reschedule mutations; test Management/Staff visibility, form round trip and cross-app Client 360 link.

**C — Experience and day report:** reorganize screens, keep survey form, add cost/attendance/feedback provenance to PDFs and selected-section exports. Verify real PDF pages and no invented attendance.

**D — Analytics:** filtered multi-source report and comparisons. Build read-side joins in one documented service; use approved-payment and cost-attribution definitions. Test reconciliation on known dates/staff and empty/missing cohorts.

**E — Shared conversations:** add carefully scoped append-only lead timeline and show it in Staff Pipeline, Master Pipeline, Company Leads and Client 360. Test one user's entry visible to another authorized user and hidden from an unauthorized user; preserve personal Notes.

**F — Client dossier:** build a permissioned server-side export with stable snapshots and selected attachments. Verify several lead identities, no cross-client data, exact receipt ledger, PDF page render and mobile entry point.

Each phase uses a V2 feature branch and preview, clean typecheck, role tests, responsive check, rendered PDF if changed, then merge to `rebuild`, wait for READY and refresh production. Never touch V1 `main` or create fake client visits/payments. Real handset/SMS delivery is a separate live-device gate.

