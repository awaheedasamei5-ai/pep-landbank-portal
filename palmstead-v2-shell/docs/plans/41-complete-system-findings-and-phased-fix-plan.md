# Complete System Findings & Phased Fix Plan

**Source**: a full, 7-batch, live test sweep of every one of palmstead-v2-shell's 31 real built apps,
tested end-to-end as both a Staff account (Adams, agent) and Management (`fapeprah@landbankghana.com`),
covering security (RLS), realtime sync wiring, data quality, and — the deepest dimension —
cross-app data connections, run 2026-10-30/31 against the real `sbydzrlzqxcdbudjaube` Supabase
project and the real dev server.

**Honesty note on scope, stated plainly rather than padded**: the user asked for "a 100 page plan."
This document reflects what the sweep actually found — every real, distinct finding across all 7
batches, with full detail, no item dropped or glossed over. It runs to the length the real findings
support, not an inflated page count. If you print this at a normal page size it will run well short
of 100 pages; that's an honest reflection of the system's actual state (which, per the summary below,
is considerably more solid than a from-scratch system at this stage usually is), not a shortcut.

**Relationship to prior work**: `docs/plans/30-master-system-audit-and-unification-plan.md`
(10 phases, all already DONE and pushed before this sweep started) covers the original
security/data-migration/cleanup pass. This document is the next layer: what the exhaustive
live-testing + cross-app-connection sweep found on top of that. Do not re-run Phases 1-10 of
that document — they're closed. Batch-by-batch raw detail lives in
`docs/plans/35-cross-app-sync-findings-batch2.md` through `docs/plans/40-cross-app-sync-findings-batch7.md`
(Batch 1 found nothing worth a separate file — noted inline below); this document is the synthesis,
not a replacement — read a batch file directly if you want the full blow-by-blow for one app.

---

## 1. Executive summary

- **31 of 31 built apps tested live, both roles.** Zero critical bugs found. Zero data-loss risks
  found. The system is materially more solid than "almost ready" framing might suggest — most apps
  passed clean on the first pass.
- **9 real bugs found this sweep; 8 already fixed and pushed, 1 flagged for deliberate human review**
  (an HR-sensitive attendance-math default, not touched per this sweep's own conservatism rule).
- **The single most common real bug class**: a table added to the `supabase_realtime` publication but
  never actually subscribed in the app's one central realtime hook. Found and fixed **4 separate
  times** across the sweep (10 tables total) — this is now the best-understood and most thoroughly
  swept bug class in the codebase; a final system-wide audit in Batch 7 closes it out.
- **The real theme of the cross-app findings**: this system is already considerably more connected
  than a typical first-build — Chat is a genuine working cross-app notification hub, Document Vault
  is a genuine working cross-app audit trail, Leaderboard/My Portfolio share one real scoring source
  of truth, Directory's `agent_key` is a consistent identity spine every other app correctly
  references. The gaps found are not "the system is siloed" — they're specific, named, structural
  holes in an otherwise-real architecture: a handful of tables missing a `lead_id` foreign key, one
  genuine money-reconciliation gap (Site Visit Authorization costs → Accounting), and a handful of
  intelligence-layer features (Smart Insights, Data Check) that don't yet use every data source the
  system has already proven is queryable.
- **Two items explicitly deferred, not forgotten**: Operations Tracker's own cross-app linkage and
  the Finance subsystem's realtime wiring are both under active, separate concurrent development
  (confirmed by real commits merging into this branch throughout the sweep) — touching either would
  risk colliding with that work. Both are documented here with a concrete fix proposal for whoever
  picks them up next.

---

## 2. Findings by theme

### A. Security (RLS)

| # | Finding | Severity | Apps | Status |
|---|---|---|---|---|
| A1 | `contract_templates_sel`/`contract_template_versions_sel` hardcoded to manager/elizabeth only, silently blocking every other staff member's real Contract Generation flow | Medium (testing-phase blocker, not a data-exposure risk) | Contract of Sale | **Fixed** (Batch 4) |
| A2 | `weekly_visit_forms` has no delete policy at all | Low, likely intentional | Site Visit Authorization | **Resolved (Phase 2)** — left as-is, confirmed correct |
| A3 | Every other RLS policy checked across all 31 apps (dozens of tables) | — | all | **Sound** — no other gaps found |

A1's fix followed the exact same pattern already established earlier this session for
`contract_requests_upd` and `weekly_visit_forms`'s own insert/update policies: widen the `_sel`
(read) policy to `auth.uid() is not null` for the testing phase, leave `_ins`/`_upd` untouched
(still manager/elizabeth-gated). This is a temporary, explicitly user-authorized state — revert
alongside the other testing-phase widenings once the real Settings/permissions UI exists (per
`docs/plans/30-master-system-audit-and-unification-plan.md` §2.2 Phase 3).

**A2 — resolved in Phase 2**: left as-is. A signed-off weekly cost-authorization record shouldn't
be staff-deletable; no delete policy is the correct, safe default for that record type. No RLS
change made.

---

### B. Realtime / sync wiring — now fully closed out

The pattern: a table gets added to the `supabase_realtime` publication (so Postgres *can* push
changes to it) but never gets a matching `.on('postgres_changes', ...)` listener in
`useDashboardRealtime.ts` (or, for Chat, its own `use-chat.ts` channel) — so nothing ever actually
*uses* that publication membership. The symptom is always the same: a real change on device A
doesn't appear on an already-open screen on device B until a manual refresh.

| # | Tables | Found in | Status |
|---|---|---|---|
| B1 | `attendance_corrections`, plus Staff Hub's 4 tables (`notice_board_posts`, `polls`, `poll_votes`, `staff_complaints`, `feedback`, `feedback_comments`) | Batch 3 | **Fixed** |
| B2 | `chat_message_reactions`, `chat_group_members`, `chat_groups` | Batch 5 | **Fixed** (wired into Chat's own dedicated channel, not the dashboard hook — correct, by design) |
| B3 | `data_check_dismissals` | Batch 6 | **Fixed** |
| B4 | `achievement_definitions`, `staff_achievements`, `attendance_exceptions`, `leave_request_logs`, `office_locations` | Batch 7 (final system-wide sweep) | **Fixed** |
| B5 | `attendance_policy`, `attendance_reviews` | Batch 7 | **Resolved (Phase 2)** — `attendance_policy` wired (real query key `['attendancePolicy']`, used by `useAttendance`/`useAttendanceMonth`/`useAttendanceComparison`/`useAttendanceManagement`). `attendance_reviews` confirmed to have **zero real call sites anywhere in the app** — left unwired, nothing to invalidate |
| B6 | `notice_board_reports` (moderation sub-table) | Batch 3 | **Fixed (Phase 2)** — was also missing from the `supabase_realtime` publication itself (added), wired to the existing `invalidateNoticeBoard` (shares `['noticeBoard']` with `notice_board_posts`, since `useNoticeBoard()` reads both tables in one query) |

**10 tables fixed across 4 commits this sweep** (`f4bec95`/`5da7c89` Batch 3, part of Batch 5's
commit, `d9a6242` Batch 6, `5e72a61` Batch 7). The Batch 7 system-wide audit cross-referenced **all
84 tables** currently in the publication against the hook, closing this bug class out — the only
remaining gaps (B5, B6) are deliberately deferred for the reasons stated, not missed.

**Deliberately out of scope, not bugs**: `op_*` tables (Operations Tracker's own subsystem, under
active concurrent development — see §4 Deferred), `chat_starred_messages`/`chat_conversation_settings`
(intentionally personal/per-device, correctly never wired), `client_notifications`/`plot_requests`/
`site_visit_feedback` (confirmed zero real code consumers — genuinely dead tables), `role_permissions`/
`contract_share_links` (documented in the original master plan as having no frontend cache yet),
Finance's newer tables (concurrent session's own subsystem — see §4 Deferred).

---

### C. Cross-app data connections — the deep findings

This is the section that answers the user's core question: where does data *already* flow between
apps correctly, and where are the real, concrete, buildable gaps?

#### C1. Confirmed strengths — real, working cross-app patterns already in production

These are not findings to "fix" — they're the proof that the architecture already supports what the
user is asking for, and the templates any new cross-app work should copy rather than reinvent:

- **Chat is the system's real cross-app notification hub.** Confirmed live, multiple real message
  types from a `Palmstead System` sender: Pipeline → Chat (payment-threshold allocation-eligibility
  nudges), Site Visits → Chat (visit logged/requested notices), Memorandum → Chat (send/cc echoes),
  Operations Tracker → Chat (issue escalations), Commission → Chat/Announcements (payout-ready
  notices), Pipeline-restore-request → Chat. **This is the reusable mechanism**: insert a `messages`
  row from a conventional system sender with real `recipient_key` targeting, fired from whatever
  RPC/mutation triggers the event. Any future "notify the right person when X happens elsewhere"
  need should reuse this exact pattern.
- **Document Vault is the system's real cross-app audit trail.** Every real file generated anywhere
  in the system (receipts, site visit PDFs, Pipeline exports, payments reports, quotations,
  contract-of-sale PDFs, allocation attachments, SVA forms, backups) is auto-logged here, correctly
  role-scoped (own downloads for staff, company-wide for Management). Zero manual entry required —
  this already is the "system relies on its own knowledge" pattern the user asked for, just not yet
  generalized to non-file events.
- **Leaderboard and My Portfolio share one real scoring RPC**, by explicit code-level design
  (confirmed: an agent's own portfolio rank can never disagree with what Management sees on the
  Leaderboard) — and that shared score was independently verified to reconcile *exactly* against raw
  source data (payments sum, site-visit count) for a real agent. Trustworthy, not stale.
- **Referrals → Leaderboard**, **Commission → Announcements/Chat**, **Notes → Memorandum** (a real
  "save as memo" bridge in Notes' own UI) are all confirmed real and working.
- **Directory's `agent_key` is a consistent identity spine** — every app's staff reference
  (`leads.agent_key`, `payments.agent_key`, `attendance_log.staff_key`, `leave_requests.agent_key`,
  etc.) resolves back to the same real staff roster with zero drift found anywhere in the system.
- **Allocations correctly honors its own backend RPC's real authorization contract** at the UI level
  (action buttons hidden exactly when `confirm_allocation`'s real role check would reject them) —
  confirmed not a frontend gap but the frontend correctly reflecting a real backend rule.
- **Company Leads' restrictive RLS** (only manager/elias/emmanuel/elizabeth can see unassigned
  company leads) initially looked like a bug (Adams sees 0, Management sees 176) but is a real,
  intentional business rule protecting against lead poaching — correctly left alone.

#### C2. Real gaps — concrete, buildable, not yet built

Each entry: what's missing, why it matters, the concrete fix, which apps it touches.

**C2.1 — Site Visits → Pipeline: no lead-conversion path for walk-in visitors**
82 of 85 real `site_visits` rows have no `lead_id`; only 13 of those 82 are even retroactively
matchable by phone number. The other **69 real site visits represent people who showed up and were
never captured as a Pipeline lead at all** — real funnel data being silently dropped. *Fix*: a
"Convert to lead" quick-action on any site-visit row with `lead_id is null`, pre-filled from the
visit's own name/contact/plot_type. *Apps*: Site Visits, Master Pipeline.

**C2.2 — Enquiries and Complaints have no `lead_id` foreign key at all**
Unlike Referrals (which does this correctly), Enquiries and Complaints are pure free-text
name/contact with zero structural link to a real lead. Management looking at a lead's Pipeline
detail page has no way to see "this client has filed 2 complaints" without manually
cross-referencing by name in a different app. *Fix*: add a nullable `lead_id uuid references
leads(id)` to both tables, populate via the same phone-digit-match helper already used by
`client_portal_login`, surface as a real section on the lead detail page (same pattern Payment
History/Site Visits/Contract of Sale already use there). *Apps*: Enquiries, Complaints, Master
Pipeline, Client Database.

**C2.3 — Site Visit Authorization's real actual-cost totals never reach Accounting**
Confirmed twice (Batch 2's initial flag, Batch 4's live confirmation): Accounting's Expenses tab
shows "No expenses logged yet" despite real non-zero `weekly_visit_forms.*_act` cost data existing.
A real day's site-visit spending exists only on one screen, reconciled nowhere else — the single
clearest money-adjacent gap found in the whole sweep. *Fix*: a database trigger on
`weekly_visit_forms` UPDATE (status → finalized/approved) that inserts a corresponding expense entry
(category "Site Visit Logistics", amount = sum of the `*_act` columns, reference back to the form's
id) — matches the trigger-fan-out pattern already used by `approve_payment`. *Apps*: Site Visit
Authorization, Accounting. **Money-adjacent — build and test carefully, confirm the real target
table/shape with Accounting's own code first.**

**C2.4 — Accounting's own Vaults (treasury) explicitly doesn't reconcile against real payments**
The app's own UI copy already admits this: *"Existing client payments and expenses have not been
imported or reconciled into this ledger."* Real collected money (confirmed GHS 192,196 in one
period) has zero linkage to any real bank/cash vault balance — 100% manual entry today. *Fix*: a
real approved payment could post an automatic "pending reconciliation" line into a holding vault.
This is a real design decision for whoever owns Finance policy (how strict should reconciliation
be?), not a pure engineering task — flagged for a decision, not silently built. *Apps*: Accounting.

**C2.5 — Two disconnected "contract" concepts in Contract of Sale**
The legacy `contracts` table (8 real rows, including this session's own V1-migrated records) and the
new v3 `contract_generations` table (0 rows) represent the same real-world thing but are read by
different screens — Pipeline's own Contract-of-Sale tab reads the legacy table; the dedicated
Contract of Sale app's Vault/Reports read only the v3 table. Result: **all 8 real contracts are
invisible in the app whose entire job is "every contract ever issued."** *Fix (architectural
decision needed, not a one-liner)*: either migrate the 8 legacy rows into `contract_generations`
with a null PDF path, union both tables in the Vault/Reports queries, or formally deprecate the
legacy path going forward. *Apps*: Contract of Sale, Master Pipeline.

**C2.6 — Quotation is a pure calculator with zero persistence**
Filling in a real customer's details and generating a quotation PDF creates no `leads` row, no
`activity_log` entry — if that prospect doesn't separately become a lead through a manual Add Lead
action, the interaction is lost entirely. *Fix*: an optional "Save as lead" action using the fields
already being typed (`lead_source = "Quotation"`). *Apps*: Quotation, Master Pipeline.

**C2.7 — Allocations never checks real Leave/Attendance status before assigning work**
No reference to `leave_requests` or `attendance_log` anywhere in Allocations' own code. A staff
member on approved leave today can still be the target of a new allocation. Operations Tracker
already solves this exact problem for its own "Assign Task" flow
(`useColleagueAvailability.ts`, reads `leave_requests` directly) — the same pattern should be reused
anywhere work gets assigned, as a soft warning rather than a hard block (matching the system's
existing "inform, don't block" philosophy already used by Emergency Leave). *Apps*: Allocations,
Leave, Attendance.

**C2.8 — No staff-facing surface shows real-time attendance/leave status**
Directory has no staff-detail page at all (flat card list) — even if it did, nothing currently feeds
attendance/leave status into it. *Fix*: either an expandable row/popover on Directory's existing
staff cards, or (if a staff-detail page is ever built) that page, pulling from
`attendance_log`/`leave_requests` — data that already exists, pure UI-surfacing gap. *Apps*:
Directory, Attendance, Leave.

**C2.9 — Notes has zero linkage to any business entity**
`notes` schema: `id, owner_key, title, body, created_at, updated_at` — no FK to anything. A quick
thought about a specific client lives only in a personal flat list. *Fix*: nullable `lead_id uuid
references leads(id)` plus an "Attach to a lead" picker in compose, surfaced on the lead detail page
same as every other linked entity. *Apps*: Notes, Master Pipeline.

**C2.10 — Smart Insights is missing several data sources it's already proven it can use**
Real, working cross-app categories today: Complaints, Referrals, Allocations, Contract Requests,
Leave, Banner Tracking (all correctly tagged by source app). **Missing**: Site Visits (Data Check
already has the exact "no logged outcome" rule Smart Insights could reuse), Attendance/Leave
*patterns* (vs. the existing single-event Leave check), Operations Tracker, per-client
Accounting/payment-health beyond one company-wide card. *Fix*: additive `CrossAppInsightKind`
entries using the already-proven pattern. Low-risk, directly serves "surface things staff would
otherwise have to notice." *Apps*: Smart Insights (reads from everywhere).

**C2.11 — Data Check is almost entirely `leads`-scoped**
9 real rules, 8 are pure `leads`-table checks, only 1 (site visit outcomes) is cross-app — despite
Smart Insights already proving Complaints/Referrals/Allocations/Leave/Banners are all queryable for
exactly this kind of staleness check. *Fix*: port Smart Insights' aging-threshold pattern into Data
Check as real "fix this" worklist items. **Consider**: Smart Insights (the "what's happening" digest)
and Data Check (the "fix this" worklist) could share one rule-definition layer instead of
duplicating the same underlying queries twice — worth a design decision before building both out
further. *Apps*: Data Check (reads from everywhere, once built out).

**C2.12 — Banner detail pages show zero lead-attribution**
`leads.banner_id` is real and already aggregated correctly at the Banner Tracking dashboard level
("3 leads generated"), but a banner's own individual detail page shows only its status-update
history — no "leads sourced from this banner" list, for either role. *Fix*: add that section,
reusing the exact query `useLeadBannerCounts()` already proves works. *Apps*: Banner Tracking,
Master Pipeline.

**C2.13 — Document Vault entries don't deep-link to their source record** (minor)
Clicking `Receipt_RCT-000004.pdf` downloads the file but doesn't jump to that payment in Pipeline.
The filename convention already encodes enough context to backfill a real `source_type`/`source_id`.
Low priority — current behavior works, this is a pure enhancement. *Apps*: Document Vault.

---

### D. Data quality

No critical data-integrity issues found anywhere in the 31-app sweep. Specific real observations
worth recording (none are bugs):

- 173 Company Leads contacts have no phone number — confirmed this is the nature of a raw bulk
  contact-list import, not a defect.
- 69 real `site_visits` rows have no matching lead (see C2.1 above — the real finding, already
  covered as a sync gap, not a data-corruption issue).
- `leaderboard_scores.total_collected`/`site_visits` reconcile *exactly* against raw source tables
  for the agent spot-checked (see C1 above) — confirms trustworthiness, doesn't need separate action.
- `leads.amt_paid`/`balance` are independent snapshot columns, not a live `sum(payments)` derivation
  — a real, pre-existing V1 design decision, already documented in
  `docs/plans/34-pipeline-retroactive-plan.md`; **do not re-flag this as a bug in future sessions,**
  it has now been independently confirmed twice (once in the original migration work, once in this
  sweep's Batch 4).
- Vendor/budget/vault/payroll tables are genuinely empty (feature just shipped by the concurrent
  Finance session) — nothing to reconcile yet, not a defect.

---

### E. UX / copy

**E1 — Home's "Pipeline by stage" card subtitle hardcoded to "company-wide" regardless of role. Fixed (Phase 2).**
Was shown verbatim to Adams even though the numbers displayed were scoped to his own 34 leads, not
the company's 309. Fixed in `subscriber-overview.tsx`: the subtitle is now conditional on whether
the viewer's own real `leads_sel` RLS actually returns company-wide data (`role === 'manager'` OR
`key` in the same trusted set the RLS policy itself hardcodes — `elias`/`emmanuel`/`elizabeth`),
not just a blunt `isManager` check, so the copy stays truthful for every account type. Verified live
as both Adams ("your own leads") and Management ("company-wide"). *Apps*: Home.

---

## 3. Phased fix plan

Ordered by real dependency and impact, not just severity. Phases 1-2 are effectively done or
near-zero-effort; Phases 3+ are real scoped work for a future session.

### Phase 1 — Already shipped this sweep (no further action)
Everything in §B marked **Fixed**, plus the one security fix (A1). 8 real bugs, already committed
and pushed across Batches 3-7. Nothing to do.

### Phase 2 — Quick confirmations and trivial fixes — **DONE 2026-10-31**
- A2 (`weekly_visit_forms` no-delete-policy): resolved by leaving as-is, confirmed correct for a
  signed-off record type. No RLS change.
- E1 (Home subtitle): fixed, conditional on the real `leads_sel` RLS condition, verified live both
  roles.
- B5 (`attendance_policy`/`attendance_reviews` realtime): `attendance_policy` wired to its real
  `['attendancePolicy']` query key; `attendance_reviews` confirmed to have zero real consumers,
  correctly left unwired.
- B6 (`notice_board_reports` realtime): fixed — was also missing from the `supabase_realtime`
  publication itself (added), wired to the existing `invalidateNoticeBoard`.

`npx tsc -b` clean. Live-verified as both Adams and Management, zero console errors (only known
harmless HMR noise). Committed and pushed to `rebuild`.

### Phase 3 — Foundational schema additions (unlocks Phase 4) — **DONE**
Added nullable `lead_id uuid references public.leads(id)` to `enquiries`, `complaints`, `notes`
(same shape as Referrals' existing `referrer_lead_id`/`referred_lead_id`). Domain types
(`Enquiry`/`Complaint`/`Note` in `src/webnext/types/domain.ts`) and their row mappers
(`src/webnext/data/mappers.ts`) updated with `leadId`; no `source.ts` changes needed since every
real list/create query already used `select("*")`/`.select().single()`, so the new column flows
through automatically.

**Retroactive population — honest result, not padded**: both `enquiries` and `complaints` turned
out to have only 2 real rows each in production (a genuinely tiny real dataset, not a large backlog)
— ran the same digit-match approach `client_portal_login` uses (last-9-digits + case-insensitive
trimmed name, unambiguous single-match only), **0 of 2 matched in each table**. This is a correct,
honest result (these specific 4 rows' contacts/names don't correspond to any current lead), not a
bug in the matching logic — verified by checking the real row counts first. `notes` has no
contact/name column at all (`owner_key, title, body` only), so it was never a retroactive-match
candidate — the column exists purely for the Phase 4+ "attach to a lead" compose UI.

`npx tsc -b` clean (note: hit a transient out-of-memory failure from concurrent node processes on
the shared dev machine on the first two attempts — unrelated to this change; resolved by running
with `NODE_OPTIONS="--max-old-space-size=4096"`, which then passed clean. Worth remembering as a
root cause if tsc OOMs again in future sessions on this machine, rather than assuming broken code).

**Correction found and fixed in Phase 4**: this entry originally said "no `source.ts` changes
needed" for all three tables — true for Enquiries/Complaints, but wrong for Notes. The real Notes
app (`src/app/(main)/dashboard/notes/_components/use-notes.ts`) is a completely separate
implementation from `src/webnext/data/source.ts`'s own unused `notes` block — the real file still
needed its own `leadId` wiring, which Phase 4 found and fixed (see below). Recorded here so this
specific "two implementations of the same concept" trap isn't re-hit.

### Phase 4 — Surface the new connections on the lead detail page — **DONE**
Added real "Complaints"/"Enquiries"/"Notes" sections to `PipelineDetailScreen.tsx` (rendered for
both Pipeline and Company Leads via `LeadClientScreen.tsx`), same visual/structural pattern already
used for Payment History/Site Visits/Contract of Sale on that screen.

- **Complaints/Enquiries**: read-only list sections (`useComplaintsForLead`/`useEnquiriesForLead` in
  `useLead.ts`, backed by new `listForLead(leadId)` methods on `source.ts`'s `complaints`/`enquiries`
  data sources) — no "log new" action here, since both apps' real create flows live on their own
  standalone screens, not this one.
- **Notes**: the one of the three needing a real write path, since nothing else links to a note.
  Built both "New note for this lead" (creates pre-linked via `useSaveNote`) and "Attach an existing
  note" (searches the viewer's own unlinked notes via `useNotes`, re-saves with the lead's id) in a
  new `NotesSection`/`ExistingNoteLinker` pair in `PipelineDetailScreen.tsx`. This is the piece that
  required the Phase 3 correction above — `use-notes.ts` (the real implementation) got its
  `useNotesForLead` query and `leadId` support added here.
- `useDashboardRealtime.ts`: `notes` added to the publication and wired (it was never in the
  publication at all until this phase); `complaintsForLead`/`enquiriesForLead` query-key prefixes
  added to the existing Complaints/Enquiries invalidation functions, so a change reaches an
  already-open lead detail page's own sections, not just the standalone list screens.

`npx tsc -b` clean (`NODE_OPTIONS="--max-old-space-size=4096"`). **Live verification incomplete**:
the Browser pane tooling became unresponsive partway through this phase's testing (navigation/
screenshot timeouts, confirmed as an environment/tool-level issue, not an app bug — the dev server's
own logs show zero compile or runtime errors throughout, and a successful login as Adams did load
the real Pipeline list with correct data before the pane locked up). The implementation is complete,
type-safe, and follows every established pattern in the codebase exactly, but a full live click-
through of the 3 new sections and the real note-link round-trip (create → link → verify → delete)
could not be completed and should be done as a quick follow-up once the browser tooling is working
again — treat this phase as code-complete but not yet visually confirmed in the running app.

**Substitute verification performed** (browser tool still unresponsive on retry): `npx tsc -b` clean
again after merge; a direct SQL smoke query (`select ... from leads l left join enquiries/complaints/
notes on lead_id = l.id ...`) confirmed the `lead_id` column reads cleanly on all three tables with no
schema error; `useDashboardRealtime.ts` confirmed to contain real `notes`/`complaintsForLead`/
`enquiriesForLead` invalidation wiring exactly as described above. This does not replace a real
click-through, but rules out a schema-level or wiring-level mistake.

### Phase 5 — Funnel-capture automation — **DONE** (code-complete, substitute-verified)

**C2.1 — "Convert to lead" on unlinked site visits**: `site_visits.lead_id` already existed (added
earlier this sweep) with `SiteVisit.leadId`/`mapSiteVisitRow` already wired — only the write path was
missing. Added `siteVisits.linkToLead(id, leadId)` to `source.ts` and a matching
`useLinkSiteVisitToLead()` hook. `SiteVisitsScreen.tsx` now shows "Convert to lead" (unlinked) or
"View lead →" (linked) on each visit row; the former navigates to Add Lead with the visit's
name/contact pre-filled plus a new `siteVisitIdToLink` field. `AddLeadScreen.tsx` links the visit back
to the newly-created lead right after save (fire-and-forget, non-fatal on failure — same discipline
already used for the existing Referral auto-link). `SiteVisitsSection` on the lead detail page (built
in Phase 4) picks this up automatically since it already reads `site_visits.lead_id` directly.

**C2.6 — "Save as lead" on Quotation**: added `'Quotation'` as a real, new `lead_source` value (the
system's own first self-generated source, not a v1-ported one). `AddLeadScreen`'s prefill type
extended with `plotType`/`noPlots`/`paymentPlan`/`address`/`leadSource` so the real figures Quotation
already computed carry straight through instead of being retyped. `QuotationScreen.tsx` gets a "Save
as lead" button beside "Download PDF" — purely additive, downloading a quotation works identically
whether or not this is ever clicked.

**Verification**: `npx tsc -b` clean (`NODE_OPTIONS="--max-old-space-size=4096"`); dev server compiles
with zero errors (`preview_logs` checked directly). **Live click-through still blocked**: the Browser
pane tool remains unresponsive on retry (confirmed again this phase, same symptom as Phase 4 — a
genuine environment/tool issue, not an app bug). Substitute checks performed instead: `site_visits_upd`
RLS confirmed to allow the exact actors (own agent or manager) who'd ever click "Convert to lead";
`NewLead`/`FormInput` field shapes confirmed to match what's being passed from both new callers. This
phase and Phase 4 should both get one real click-through pass as soon as the browser tool recovers —
noted as a standing follow-up, not silently assumed fine.

### Phase 5 — Funnel-capture automation
- C2.1: "Convert to lead" quick-action on unlinked site visits.
- C2.6: "Save as lead" action on Quotation.
Both are additive, low-risk, directly reduce manual re-entry — the user's stated core goal.

### Phase 6 — Staff-availability awareness — **DONE** (code-complete, substitute-verified)

**Correction found before building**: `useColleagueAvailability.ts` (the hook this item was supposed to
reuse, per Batch 3's own finding) **no longer exists anywhere in the codebase** — confirmed by grep for
both the filename and its real query key (`colleagueAvailability`), only a stale comment in
`useDashboardRealtime.ts` still references it. Almost certainly removed/refactored during Operations
Tracker's own active concurrent rework throughout this sweep. Rather than reuse a pattern that's gone,
built a fresh, minimal, additive equivalent — two new SECURITY DEFINER RPCs, same real discipline as
the already-proven `get_leave_conflict_dates` (summary-only, never exposes another staff member's leave
reason/letter/raw timestamps, works for any authenticated viewer without needing broadened
`leave_requests`/`attendance_log` RLS, both of which are hardcoded owner-or-manager and NOT routed
through `has_permission()`):
- `public.is_agent_on_leave(p_agent_key, p_date) returns boolean`
- `public.get_staff_today_status(p_agent_key) returns text` ('on_leave' | 'present' | 'not_checked_in'),
  built on top of the first.

**C2.7**: `AllocationRequestsScreen.tsx`'s `AwaitingPanel` (where Management/an allocator confirms a
request) now shows a soft amber warning — "`<agent>` is on approved leave today — confirming is still
allowed, but any client follow-up may need to wait or be reassigned" — via a new
`useIsAgentOnLeaveToday` hook in `useLeaveRequests.ts`. Confirming is never blocked, matching the
system's existing Emergency Leave "inform, don't block" philosophy exactly.

**C2.8**: Directory's `StaffCard` gets a new `TodayStatusBadge` (amber "On leave today" / emerald
"Present today" / neutral "Not checked in") via a new `useStaffTodayStatus` hook in `use-directory.ts`,
shown for every agent card (not Management's own card, which already shows a distinct "Management"
badge).

Both features are strictly read-only against `leave_requests`/`attendance_log` — no write path, no RLS
change, no business-logic change to either table, per this sweep's own HR-data conservatism rule.

**Verification**: `npx tsc -b` clean (`NODE_OPTIONS="--max-old-space-size=4096"`). **Live click-through
still blocked** — the Browser pane tool remains unresponsive after multiple independent retries across
several phases now (Phase 4, 5, and again here), confirmed as a persistent environment/tool issue, not
an app bug. Substitute verification: the new RPCs' own auth guard correctly rejects an unauthenticated
service-role call (matching `get_leave_conflict_dates`'s identical real behavior — a good sign, not an
error); the underlying query logic was run directly against real data for all 7 real agents and returned
clean, sane results (nobody is on approved leave covering today in the real dataset right now, so every
agent correctly shows `not_checked_in`/`present` depending on real attendance — the on-leave path has
correct logic but no real positive case to click-test against today). Phases 4, 5, and 6 should all get
one real click-through pass as soon as the Browser pane tool recovers.

### Phase 7 — Money/accounting reconciliation — **PARTIALLY DONE 2026-11-01**

**C2.3 — DONE.** First confirmed `expenses`/`expense_categories` are a stable, older part of Finance
(Parts B.1-B.3 of the finance blueprint, only one commit ever touched `use-finance-expenses.ts`) —
NOT part of the actively-moving Vendor/Budget/Vault/Payroll work landing concurrently this sweep —
so this was safe to build. Added a real `sync_sva_actual_costs_to_expenses()` trigger (`AFTER UPDATE
ON weekly_visit_forms`, fires when `status` transitions to `'Finalized'`): sums the 5 real `*_act`
columns, and if nonzero, inserts a matching `expenses` row (`category = 'Fuel & Transport'` — the
closest real existing category, since a dedicated "Site Visit Logistics" category doesn't exist and
inventing an unrecognized one would break the Expense Category Breakdown's own grouping;
`payment_method = 'cash'`, `status = 'approved'` since the source SVA form was already
signed-off/finalized — no second manual approval step for data that's already authorized). A new
nullable `expenses.sva_form_id` column (additive only, doesn't touch any Finance code) prevents a
double-post if a form is edited and re-finalized. Verified correct via a `begin; ...; rollback;`
transaction against a real `'Open'` form with real GHS 536 in actual costs — confirmed the resulting
expense row's category/amount/status were exactly right — then rolled back so no real data was
touched by the test itself (the trigger function was already applied for real beforehand).

**C2.5 — DONE, narrower than originally scoped.** Reading the real code revealed `useContracts()`/
`useContractReports()` already correctly read BOTH `contracts` and `contract_generations` — Reports'
own production-count math has always used `contracts.length` as the true total, `contract_generations
.length` as the template-based subset. Only `ContractVaultScreen.tsx` was reading
`contract_generations` alone. Added `useAllContractsForVault()` (`useContractTemplates.ts`) which
merges both tables into the one shape the Vault already renders — a legacy row gets
`templateId`/`pdfStoragePath = null`, which the screen's existing "Legacy" badge and "No stored PDF"
state already handle correctly, with no migration or mutation of a single real legacy row. Deduped by
`clientName` + day against real `contract_generations` rows, covering the one real code path
(`useGenerateContract`'s template branch) that already writes both tables for the same event. Verified
via direct SQL (9 real legacy contracts, 0 generations, confirmed no dedup collisions) since the
Browser pane tool remains unresponsive (see Phase 4/5/6's own notes) — `npx tsc -b` clean.

**C2.4 — DEFERRED**, not attempted. Accounting's Vaults/treasury code is squarely inside the
actively-moving concurrent Finance subsystem (same commits confirmed above) and needs a real Finance-
policy decision before any code is written regardless. Moved into Phase 10's deferred list.

### Phase 8 — Intelligence-layer expansion
- C2.10: new Smart Insights cross-app sources (Site Visits, Attendance/Leave patterns, Operations,
  per-client payment health).
- C2.11: port the same aging-threshold pattern into Data Check; consider a shared rule-definition
  layer between the two apps before building either out further (a real architecture decision, not
  just "add more rules").

### Phase 9 — Remaining attribution/UX polish
- C2.12: banner detail page lead-attribution section.
- C2.13: Document Vault deep-linking to source records.

### Phase 10 — Deferred, not forgotten (owned by concurrent work, pick up once that work settles)
- Operations Tracker's own cross-app linkage (`op_issues.related_lead_id`, per Batch 5's concrete
  proposal) — deliberately not touched this sweep since that subsystem had real commits merging in
  throughout the sweep.
- `op_todos` family realtime wiring (same reasoning, documented originally in the master plan's own
  §5.1 item 8 resolution).
- **C2.4 — Accounting Vaults auto-reconciliation** (moved here from Phase 7): needs a real Finance-
  policy decision (how strict should reconciliation be?) from whoever owns that subsystem, which is
  under active concurrent development right now — not purely an engineering task.
- Finance's newer tables (`finance_vaults`, `finance_budgets`, `finance_vendors`, `payroll_*`, etc.)
  realtime wiring — same concurrent-session boundary, confirmed again in Batch 4.

---

## 4. What this sweep deliberately did not do, and why

- **Did not touch Operations Tracker's or Finance's own code/schema**, even where a real gap was
  found (C2.7's Operations precedent, the Finance realtime gap) — both subsystems had real commits
  from a different concurrent session merging into this branch throughout the sweep. Touching either
  risked a collision with in-progress work that isn't this sweep's to interfere with.
- **Did not touch any HR business-logic calculation** (Attendance's `onTimeRate` default) even
  though it was found and is arguably wrong — flagged for explicit human review instead, per this
  sweep's own standing conservatism rule for anything HR/compensation-adjacent.
- **Did not touch any money/legal calculation logic** — only pure wiring/rendering bugs were fixed
  directly in Accounting/Contract of Sale/Commission; every real finding in those apps that touches
  actual financial correctness (C2.3, C2.4, C2.5) is flagged here for a scoped follow-up, not
  auto-built.
- **Did not revert the testing-phase `has_permission()` override** or any of its related RLS
  widenings (including this sweep's own A1 fix) — that's explicitly the user's own next step once
  the real Settings/permissions UI exists, per the original master plan.
- **Did not build any of the Phase 3-9 items above** — this document is the plan, not the
  implementation. Building out schema changes, new UI sections, triggers, and intelligence-layer
  rules across 9 phases is real, substantial future work, scoped and sequenced here so it can be
  picked up cleanly rather than re-derived from scratch.
