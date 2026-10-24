# Company Leads — full system blueprint (Dashboard, Analytics, Call Log, Client Layers, Contract pipeline)

Real user brief, 2026-10-24, second round: the Phase-1-3 Call Log/Analytics work shipped earlier the same day was judged too shallow. Verbatim asks, all authoritative:

1. Analyze the `UNIFIED_CUSTOMER_ENGAGEMENT_SYSTEM.xlsx` workbook end to end (it has its own Dashboard, Analytics, Call Log, Site Visit Log, Payments, Client Finance, Data Quality tabs with a real, working metric system including "average calls per active day") and translate every one of those metrics into this app.
2. A full-scale filter system: filter everything by day / week / month / year, with custom ranges, and show averages per day / week / month / year.
3. Redesign the Company Leads **dashboard** — current one judged shallow.
4. Redesign the **Call Log** so staff can see every call in or out, how many company leads visited site, how many bought, how many didn't, and call trends by period.
5. A **layered client detail page**: clicking a Company Leads client opens a page with distinct sections/layers — Payment History (download receipts), Site Visit/Allocation records, and Contract of Sale (if none exists: agent fills KYC → requests a contract → it is generated → lands on the client's own page, downloadable → an SMS goes to the client with a download link).
6. No emoji as icons.
7. Don't build from scratch — find and adapt a real existing repo.

This document is the full analysis + plan required before any of it is coded, per this repo's own standing build process (`AGENTS.md`, `docs/CONTINUE_HERE.md`).

---

## 1. What the workbook actually specifies (full read, every sheet)

Read via `openpyxl` (`markitdown` lacked the xlsx extra), all 11 sheets, every populated cell. Full dump kept at the scratchpad for this session only; the facts below are what matters for the build.

### 1.1 Entity model (workbook's own words, "Start Here" tab)

> Consolidated Banner Callers is the **profile**; Call Log stores **each call**; Site Visit Log **each visit**; Payments **each actual receipt**. Repeated events stay separate for auditable period counts.

This is exactly this app's own existing shape: `leads` (profile) / `activity_log` (each call, Phase 1 already real) / `site_visits` (each visit) / `payments` (each receipt). The workbook is not introducing a new model — it is validating the one already built. Sales stage vocabulary in the workbook: lead, contacted, qualified, scheduled, visited, negotiating, paying, purchased, lost, on hold. "Bought" = positive recorded payments OR stage in {Paying, Purchased}.

### 1.2 Dashboard sheet — exact layout

```
YEAR [2026]   MONTH (0 = ALL) [10]
"Month 0 shows the selected year; choose month 1-12 for day-by-day calls."

Row of 6 tiles:  CALLS LOGGED | AVG CALLS / ACTIVE DAY | SITE VISITS IN PERIOD |
                 CLIENTS EVER VISITED | BOUGHT CLIENTS | NOT YET BOUGHT
Row of 6 tiles:  CASH IN -- SELECTED PERIOD | OUTSTANDING AGREED BALANCE |
                 CLIENTS IN REGISTER | OPEN FOLLOW-UPS DUE | ACTIVE DEALS |
                 CALL DAYS IN PERIOD

Two charts side by side: CALL ACTIVITY -- DAY BY DAY   |   CALLS BY MONTH -- SELECTED YEAR
```

12 KPI tiles total, a single Year+Month selector pair (Month=0 means "whole year"), and exactly two charts. "Avg calls / active day" = calls in period ÷ count of distinct days in that period with ≥1 call (not ÷ calendar days — a weekend with zero calls doesn't drag the average down). "Call days in period" is that same distinct-day count, shown as its own tile too.

### 1.3 Analytics sheet — exact layout (three comparison tables, each feeding a chart)

| Day table (for the month picked on Dashboard) | Month table (for the year picked on Dashboard) | Year table (all years) |
|---|---|---|
| Day, Calls, Date | Month, Calls, Active Days, **Avg Calls / Active Day**, Site Visits, Cash In | Year, New Clients, Calls, Site Visits, Cash In |
| one row per day 1-31 | one row per calendar month | one row per calendar year seen in the data |
| feeds "Daily calls — selected month" chart | feeds "Monthly comparison" chart | feeds "Year-over-year" chart |

This is the exact shape of the "full filter system with averages per day/week/month/year" the brief asks for — the workbook already proves which breakdowns matter (day, month, year) and which don't (it has no week table; weekly is a derived view the brief asks for in addition, not instead).

### 1.4 Call Log sheet

Columns: Call Date, Call Time, Client ID, Call Type (Initial call / Follow-up), Outcome, Follow-Up Due, Follow-Up Status (Open/Completed/Rescheduled), Staff, Call Notes. One row per call, every call — exactly `activity_log`'s real shape today (Phase 1 already gives us method/outcome/note/follow; `action` doubles as "Call Type").

### 1.5 Site Visit Log sheet

Visit Date, Client ID/Name/Contact, Purpose, Visit Type (New/Existing), Lead Source, Plot/Land Reference, Initial Feedback, Follow-Up Action, Visit Outcome, Payment Status. Summary tiles: Total Visit Events, Clients Marked Visited, Visited Clients Who Bought, Visited Clients Not Yet Bought — i.e. exactly the "how many have gone to site out of the company leads, how many bought, how many didn't" the brief asks for by name.

### 1.6 Payments / Client Finance sheets

Payments: one row per real receipt (date/time, amount, method, reference, received by, notes) — matches `payments` already. Client Finance is a read-only rollup per client (Agreed/Paid/Balance/Bought?/Stage) — matches what `leads.grandTotal`/`amtPaid` + `payments` already compute; no new table needed.

### 1.7 Data Quality sheet

A flat review queue: Priority / Source / Issue / Record, flagging future-dated records, narrative-only (unreconciled) payment notes, and formula defects. Directly reusable shape for Company Leads' own Data Quality tab (Phase 4, already planned in `28-company-leads-engagement-upgrade-plan.md`), scoped to `agent_key='company'` rows: duplicate name+phone, missing lead source, missing next action/follow-up, stale (no activity in N days), future-dated site visits.

---

## 2. What already exists in this codebase (read before building anything — avoids a second nextcrm-style over-build)

| Brief's ask | Already real, confirmed live | Gap |
|---|---|---|
| Call Log (every call, outcome, follow-up) | `activity_log` + Phase 1's `logCall()`/`listCompanyWide()`/Call Log page | No filter system, no trend chart, "Follow-ups due" only |
| Dashboard with period KPIs | `CompanyLeadsScreen.tsx` list header has none of this | Everything in §1.2 is new |
| Analytics with day/month/year breakdown | Phase 3's `CompanyLeadsAnalyticsScreen` — fixed 6-month trend only, no day table, no year table, no filter | Full rebuild per §1.3 |
| Site visits vs purchases | Phase 3 computed a snapshot count; no list, no filter | Needs its own real section |
| Payment History with downloadable receipts | **Already fully real** — `PipelineDetailScreen.tsx`'s `ClientSection` (`useDownloadReceipt`, `useIssueReceiptLink`, `receipt_share_links` table, `/receipt/[token]` public page, `get-receipt` edge function) | Needs to become its own tab on a Company-Leads-specific client page, not just inline in the generic pipeline screen |
| Site Visit / Allocation records | **Already real** — `SiteVisitsSection`, `AllocationEligibilitySection`, `useSiteVisitsForLead`, `useAllocationRequests` | Same — needs its own tab |
| KYC intake | **Already fully real** — `LeadKycDialog.tsx`, `lead.kyc` jsonb, AI completeness summary (`useKycCompletenessSummary`) | None — reuse verbatim |
| Contract request | **Already real** — `useCreateContractRequest`/`useContractRequests`, `contract_requests` table, RLS-gated `fulfil()` | `fulfil()` only flips a status flag — it does not generate anything or notify the client |
| Contract generation | **Already real** — `ContractGeneratorScreen`, `contractPdf.ts`, `contractGenerations.create()`/`uploadPdf()` writing to the private `contract-pdfs` bucket | No public share link, no SMS, no surfacing back on the lead's own page — it dead-ends in the generator screen |
| "Contract lands on client's page, downloadable, SMS with link" | **Does not exist** | New: `contract_share_links` table + `/contract/[token]` page + `get-contract` edge function, byte-for-byte mirroring the already-real `receipt_share_links`/`/receipt/[token]`/`get-receipt` pattern (and the near-identical `sve_report_links`/`/sve-report/[token]` one) |
| No emoji icons | Violated already in three places: this session's own Call Log/Analytics header buttons (📞/📊/⬇/⬆ on `CompanyLeadsScreen.tsx`), and a pre-existing one in `PipelineDetailScreen.tsx`'s receipt row (⬇/🔗/✓) | Replace all four with `lucide-react` icons as part of this build, not a separate pass |

**Conclusion**: the single biggest piece of real NEW work is wiring the contract pipeline end-to-end (nothing today turns a fulfilled request into something the client can download and gets texted). Payment History and Site Visits/Allocation are "move existing real UI into a new tab," not new features. Dashboard, Analytics, and Call Log filters are real new UI driven by a shared period-filter engine, but every number they show already has a real column to read from.

---

## 3. Real repos adapted (continuing this session's own precedent — pattern-translate, never literal-copy into this Next.js/Supabase stack)

- **`pdovhomilja/nextcrm-app`** (already adopted for Company Leads' Phase 1 Call Log) — `crm_Activities`'s typed/outcome activity shape remains the donor pattern for the Call Log; no new pattern needed from it here.
- **`marmelab/atomic-crm`** (MIT, React + Supabase, via its `copilotkit/atomic-crm` mirror and the official `marmelab/atomic-crm` repo) — reviewed for its "aggregated activity history" and dashboard-tile pattern. Real, relevant idea adopted: group a client's activity into a single reverse-chronological timeline per entity rather than several disconnected lists — exactly the shape of the new layered client page's tabs (each tab is one entity-scoped timeline: payments, visits, contract). **Not adopted**: Atomic CRM's react-admin/data-provider architecture and its Kanban deal-pipeline UI — this shell already has its own pipeline (Master Pipeline) and its own data-source layer; importing a second one would be the inconsistent choice, exactly the same judgment this plan's predecessor (`28-...-plan.md §1`) already made about nextcrm's polymorphic links table.
- **This app's own `receipt_share_links` / `/receipt/[token]` / `get-receipt` edge function** is the literal template for the new contract-share pipeline — not an external repo, but a real, already-shipped, already-proven-in-production pattern in this exact codebase, which is the most faithful "existing resource" available for this specific gap.

---

## 4. Database

Three real, additive changes — no existing table's shape changes.

### 4.1 `contract_share_links` (new table, mirrors `receipt_share_links` exactly)

```sql
create table public.contract_share_links (
  id uuid primary key default gen_random_uuid(),
  token uuid not null default gen_random_uuid() unique,
  contract_generation_id uuid not null references public.contract_generations(id),
  lead_id uuid not null references public.leads(id),
  storage_path text not null,
  created_by text not null,
  created_by_name text,
  created_at timestamptz not null default now()
);
-- RLS: insert restricted to the same contracts.generate permission
-- (manager/elizabeth); select is public via the get-contract edge function
-- only (same pattern as receipt_share_links/sve_report_links: the table
-- itself has no public SELECT policy, the edge function uses the service
-- role to resolve token -> signed URL).
```

### 4.2 `contract_requests` — no schema change, new transition

`fulfil()` stays as the manual "we've started working on this" flag (kept — a request can be fulfilled by hand-delivering a contract outside the system too, and that distinction is real). A **new** `generated_at`/`contract_generation_id` pair of columns on `contract_requests` records which generation satisfied which request, so the request list can show "Generated ✓" instead of just "Fulfilled":

```sql
alter table public.contract_requests
  add column if not exists contract_generation_id uuid references public.contract_generations(id),
  add column if not exists generated_at timestamptz;
```

### 4.3 No new tables for Dashboard/Analytics/Call Log filters

Every metric in §1.2/§1.3 is computable client-side from `leads`/`activity_log`/`site_visits`/`payments`, already fetched by the existing hooks (`useCompanyLeads`, `useCompanyWideActivity`, `siteVisits.listAll()`, `payments.listAll()`). A period filter is a pure function over data already in memory — no new RPC, no new table. (If/when Company Leads grows past roughly 2-3k rows this client-side approach should move server-side; not yet needed — real row count today is 169.)

---

## 5. Security

- `contract_share_links` insert: same `contracts.generate`-equivalent gate already enforced client-side via `useCanFulfilContracts()` (`manager` or `elizabeth`) — the real hard gate is server-side RLS on `contract_generations`/`contract-pdfs` bucket, already live; the new table just needs the same insert policy, not a new concept.
- `get-contract` edge function: service-role resolve of `token -> signed URL`, same as `get-receipt` — no session required to open the public link (the client isn't a staff account), token itself is the capability, consistent with how `/receipt/[token]` already works.
- No new PII exposure: KYC data (`lead.kyc`) is already written into the generated PDF today via the existing generator; nothing new is exposed by this plan, only *delivered* differently (a signed link instead of a manual download by staff).

---

## 6. AI touchpoints

None new. `useKycCompletenessSummary` (already real) continues to gate whether "Request contract" should be enabled from the new layered client page — if KYC is incomplete, the button explains what's missing instead of silently failing later in the generator.

---

## 7. UI

### 7.1 Shared period-filter engine (new, `src/webnext/features/company-leads/lib/periodFilter.ts`)

One real module, reused by Dashboard, Analytics and Call Log — not three separate filter implementations:

```ts
type Granularity = 'day' | 'week' | 'month' | 'year' | 'custom';
interface PeriodFilter { granularity: Granularity; year: number; month: number | 'all'; from?: string; to?: string }
function periodToRange(filter: PeriodFilter): { from: string; to: string }
function activeDays(entries: { createdAt: string }[], range): number        // distinct calendar days with >=1 entry
function avgPerActiveDay(count: number, activeDaysCount: number): number
function bucketByDay/Week/Month/Year(entries, range): { label: string; count: number }[]
```

A single `<PeriodFilterBar />` component (real shadcn `Select`/`Popover`+`Calendar` date-range picker, both primitives already in `src/components/ui/`) renders a Year select, a Month select (with an explicit "All months" option mirroring the workbook's Month=0), a Granularity toggle (Day/Week/Month/Year), and a custom-range calendar for power filtering — used identically in all three screens.

### 7.2 `/dashboard/company-leads` — dashboard redesign

Replace the current shallow header with the real §1.2 layout: `<PeriodFilterBar />` + 12 KPI tiles (two rows of 6, matching the workbook's own grouping) + two charts (`Call activity — day by day` for the selected month, `Calls by month` for the selected year). The existing client list/table stays below, unchanged.

### 7.3 `/dashboard/company-leads/analytics` — full rebuild

Replace Phase 3's fixed-6-month screen with three real tabs (shadcn `Tabs`, matching the general Analytics app's own established pattern): **Day** (table + chart, scoped to the selected month), **Month** (table + chart, scoped to the selected year, columns = Calls / Active Days / Avg Calls per Active Day / Site Visits / Cash In), **Year** (table + chart, all years, columns = New Clients / Calls / Site Visits / Cash In). Same `<PeriodFilterBar />` drives all three.

### 7.4 `/dashboard/company-leads/calls` — Call Log rebuild

Add `<PeriodFilterBar />` above the existing KPI strip. Add a **Trends** section: a calls-by-period bar chart (granularity-aware — day/week/month/year) plus three new real stat cards reusing the existing scoped `site_visits`/`leads` data: **Site visits (period)**, **Bought** (period, positive payment or stage in {Paying, Purchased}), **Not yet bought**. Keep the existing quick filters (All/Mine/Follow-ups) as a second-level filter alongside period.

### 7.5 New layered Company-Leads client page — `/dashboard/company-leads/[id]`

Today this route renders the generic, single-scroll `PipelineDetailScreen` (shared with Master Pipeline). Company Leads gets its **own** page component, `CompanyLeadClientScreen.tsx`, reusing the same underlying hooks/sections but composed as real tabs (shadcn `Tabs`, not a redirect-based sub-route — this is one client's profile, switching tabs shouldn't lose scroll position or refetch):

```
Overview          -- the existing ClientSection/LeadDetailsSection content, trimmed
Payment History   -- the real, already-built receipt list + download + share-link
                     buttons from PipelineDetailScreen's ClientSection, lifted into
                     its own tab (icons swapped from emoji to lucide-react)
Site Visits & Allocation -- SiteVisitsSection + AllocationEligibilitySection, as-is
Contract of Sale  -- NEW real section (see 7.6)
```

Master Pipeline keeps using `PipelineDetailScreen` exactly as it is today — this is a Company-Leads-specific presentation of the same real data, not a replacement of the shared screen.

### 7.6 Contract of Sale tab — the real new pipeline

```
If no contract exists for this lead:
  - "KYC details" status (complete/incomplete, from useKycCompletenessSummary)
  - "Fill KYC" button -> LeadKycDialog (reused verbatim)
  - "Request contract" button (useCreateContractRequest) -- disabled with an
    explanatory tooltip while KYC is incomplete
  - Once a request exists: its status (Pending / Fulfilled)

Management/elizabeth view of the SAME tab additionally shows:
  - "Generate & send to client" button, enabled once a template+fields resolve
    cleanly (findUnresolvedTokens() == []) -- this is the one real new
    end-to-end action:
      1. Generate the PDF (existing contractPdf.ts, unchanged)
      2. contractGenerations.create() + uploadPdf() (existing, unchanged)
      3. NEW: contractShareLinks.create() -> token
      4. NEW: sms.send(lead.contact, `Your Contract of Sale is ready: {link}`,
         'contract_ready', generatedBy) -- reuses the already-live Arkesel
         sms.send(), same fire-and-forget-never-throws contract as every
         other SMS trigger in this app
      5. contract_requests row updated: contract_generation_id, generated_at

If a contract exists:
  - Shows the generated date, template name
  - "Download" button (resolves the signed URL the same way /receipt/[token]
    does, just for staff viewing it in-app rather than the client's public
    link)
  - "Resend SMS" button (re-sends the same token link, no new PDF generated)
```

### 7.7 `/contract/[token]` — new public page

Byte-for-byte structural mirror of `/receipt/[token]`: a new `get-contract` edge function resolves `token -> signed URL` via the service role, the page shows the client's name and a single "Download Contract of Sale" button. No sign-in required — the token is the capability, exactly like the receipt and SVE-report links already in production.

### 7.8 Icons

Every icon this plan touches uses `lucide-react` (already the project's icon library everywhere else): `Phone` (Call Log), `BarChart3` (Analytics), `Download`/`ArrowDownToLine` (receipts, was ⬇), `Link2` (share, was 🔗), `Check` (copied, was ✓/✓), `Upload` (import, was ⬆). This replaces every emoji icon this session introduced *and* the pre-existing one in `PipelineDetailScreen.tsx`'s receipt row, since that exact UI is being lifted into the new Payment History tab anyway.

---

## 8. Phased build order (each phase fully built, typechecked, built, live-verified against real SQL, committed, deployed before the next)

1. **Phase A — shared period-filter engine + icon fixes.** `periodFilter.ts`, `<PeriodFilterBar />`, swap every emoji icon to lucide across Company Leads + the lifted payment-receipt row.
2. **Phase B — Dashboard redesign.** The real §1.2 12-tile + 2-chart layout on `/dashboard/company-leads`.
3. **Phase C — Analytics full rebuild.** Day/Month/Year tabs per §1.3, replacing Phase 3's shallow screen.
4. **Phase D — Call Log rebuild.** Period filter + trends (calls-by-period chart, visits/bought/not-bought cards).
5. **Phase E — layered client page.** `CompanyLeadClientScreen.tsx` with Overview/Payment History/Site Visits & Allocation tabs (lifting existing real sections, no new data logic).
6. **Phase F — contract pipeline.** `contract_share_links` table, `contract_requests` columns, `get-contract` edge function, `/contract/[token]` page, the Contract of Sale tab's full generate-and-send action.

Every phase gets a real SQL cross-check against the live `sbydzrlzqxcdbudjaube` project before being called done, matching every other slice built this session (e.g. Phase 1's `select count(*) from activity_log al join leads l on l.id = al.lead_id where l.agent_key='company'`-style verification).

## 9. QA

Per phase: log a real test call/visit/payment where relevant, confirm every tile/chart/table number matches a direct SQL query for the same period. For Phase F specifically: generate a real contract for a test lead, confirm the `/contract/[token]` link opens and downloads correctly in an incognito-equivalent fresh browser tab (no session), confirm the SMS fires via `sms_log`, then delete the test contract/share-link/SMS row and the test lead's KYC afterward.
