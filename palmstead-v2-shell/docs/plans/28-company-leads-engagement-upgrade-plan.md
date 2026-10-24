# Company Leads — customer engagement upgrade

Real user brief (2026-10-24, pasted in full): a detailed "customer engagement system" spec, referencing `github.com/pdovhomilja/nextcrm-app` as a pattern donor and `UNIFIED_CUSTOMER_ENGAGEMENT_SYSTEM.xlsx` as "migration control totals." **User corrections mid-brief, both authoritative and both already applied below**: (1) "its referring to the company leads app" — this upgrades the real, already-shipped Company Leads app, not a new CRM; (2) "u are not using the data in the workbook but rather u are upgrading the company leads app with this feature and logic... not changing the apps logic this is just an upgrade" — no workbook migration, no new client table, purely additive on top of the real existing `leads`/`activity_log`/`site_visits`/`payments` schema.

## 0. Architecture map — what already exists (read this before building anything)

Company Leads (`src/webnext/features/company-leads/`) is **not a separate client table** — it is the real `leads` table filtered to `agent_key = 'company'` (`leads.listCompany()`), the exact same entity Master Pipeline uses. Its detail drill-down (`/dashboard/company-leads/[id]`) already reuses the real, shared `PipelineDetailScreen` wholesale. That screen already has, today, real and working:

| Brief's concept | Already real, as | Gap |
|---|---|---|
| Client | `leads` row | none — this IS the client record |
| Site visit event | `site_visits` table, `SiteVisitsSection`, real `lead_id` FK | none |
| Payment transaction | `payments` table, `DepositScheduleSection`/`AllocationEligibilitySection` | a raw payment-transaction list view, not just the deposit-schedule framing — minor |
| Follow-up task (single, current) | `leads.nextAction`/`nextActionDate` (`FollowUpSection`) | only ONE current next-action per lead, overwritten each time — no history |
| Audit event | `audit_events` table, `AuditTrailSection` (manager-only) | none |
| Data quality issue | Data Check app, general-purpose, not Company-Leads-scoped | needs a scoped view |
| **Call event** | **`activity_log` table — real, already has `method`/`note`/`follow` columns, confirmed live, but the app's own `activityLog.log()` method never writes them, and there is no manual "log a call" UI anywhere.** `ActivitySection` only ever displays system-auto-written rows (e.g. "Stage changed to Lost"). | **This is the one genuinely missing real capability.** |
| Follow-up queue / Call Log list | nothing — `activity_log` has no company-wide list view, only `listForLead()` | **genuinely new** |
| Analytics (calls/visits/funnel/cash) | the just-shipped general Analytics app, company-wide, not Company-Leads-scoped | needs a scoped view |
| Settings (lead sources etc.) | `LEAD_SOURCES` is a hardcoded `const` array in `CompanyLeadsScreen.tsx`, not configurable | needs to move to real config |

**Conclusion, stated plainly**: this upgrade is almost entirely about completing `activity_log` into a real Call Log (the one real gap), plus adding 3 new Company-Leads-scoped tabs (Analytics, Data Quality, Settings) that reuse logic already built elsewhere rather than inventing new systems. It is NOT a new CRM, NOT a new client table, and does NOT touch Master Pipeline, Accounting, Site Visits, or Data Check's own real apps — those stay exactly as they are; this only adds a Company-Leads-scoped lens on top.

## 1. Real GitHub reference (`pdovhomilja/nextcrm-app`, 724★, MIT, pinned)

Reviewed commit: `main` as of 2026-10-24 (`pushed_at: 2026-10-23T04:40:23Z`). Real stack match: Next.js 16/React 19/PostgreSQL/Prisma/shadcn — same generation as this shell. Relevant model reviewed directly (`prisma/schema.prisma`):

```prisma
model crm_Activities {
  type crm_Activity_Type   // call | email | meeting | note | task...
  title, description, date, duration, outcome
  status crm_Activity_Status @default(scheduled)
  metadata Json?
}
model crm_ActivityLinks { activityId, entityType, entityId }  // polymorphic link
model crm_AuditLog { entityType, entityId, action, changes Json, userId }
```

**Pattern adopted (translated, not copied verbatim)**: a typed, outcome-bearing activity entity with its own follow-up concept, feeding a combined entity timeline — exactly the shape `activity_log` already has (minus `type`/`outcome` as distinct columns; this repo's `action` free-text column already does double duty, kept as-is rather than adding new columns for a two-field distinction nextcrm needs and this app doesn't). **Pattern NOT adopted**: nextcrm's polymorphic `crm_ActivityLinks` table — every other real feature in this codebase (complaints, referrals, site_visits) uses a direct `lead_id` FK per table, not a generic polymorphic link table, and `activity_log.lead_id` already exists — introducing a second, generic linking mechanism alongside 15+ direct-FK tables would be the inconsistent choice, not the faithful one. This is exactly the brief's own §1 instruction in practice: "translate the patterns into its current architecture; do not introduce a second... duplicate client database."

## 2. Database

Migration `activity_log_call_log_upgrade`:
- No new table. `method`, `note`, `follow` already exist on `activity_log` (confirmed live) — just need to actually be written.
- Add `activity_log.outcome text null` — a short, real distinction nextcrm's own model keeps separate from `action` (e.g. action='Call', outcome='Reached — interested' / 'No answer' / 'Not interested'), genuinely useful for the Call Log's filters and the Analytics tab, and not representable cleanly in the free-text `detail` column today.
- RLS unchanged (`activity_log_ins`/`activity_log_sel` already correctly scope own-agent-or-manager).

## 3. Security

None new. Same real RLS already governs every read/write; Company-Leads-scoped views are a client-side filter (`lead_id in (company leads' ids)`) on top of data the caller could already see.

## 4. AI touchpoints

None new in this slice — call logging is a plain structured form, not a drafting surface (unlike `follow_up_draft`, already live elsewhere for a different flow). If a real need for AI-summarized call notes emerges once this ships, that's a genuine future addition, not invented here.

## 5. UI — real pages, all under `/dashboard/company-leads`

```
/dashboard/company-leads                 Existing list screen, unchanged logic.
                                           Adds: "Log a call" quick action per
                                           row (opens the same modal Call Log
                                           uses, pre-selecting that client).
/dashboard/company-leads/calls            NEW — company-wide Call Log. Real
                                           list of activity_log rows for every
                                           company lead, filterable by date
                                           range/client/staff/outcome/follow-up
                                           state. "My calls today" and
                                           "Follow-ups due" quick-filter chips.
                                           Primary action: Log a call (modal).
/dashboard/company-leads/analytics        NEW — Company-Leads-scoped Analytics,
                                           reusing the general Analytics app's
                                           real patterns (KPI strip, charts):
                                           calls by day/month, leads by source,
                                           funnel by stage, visits vs purchases,
                                           cash receipts -- filtered to
                                           agent_key='company' leads only.
/dashboard/company-leads/data-quality     NEW — Company-Leads-scoped Data
                                           Quality, reusing Data Check's real
                                           check patterns: likely duplicates
                                           (name+phone), missing lead source,
                                           missing next action, stale leads.
/dashboard/company-leads/settings         NEW, manager-only — lead source list
                                           management (replaces the hardcoded
                                           LEAD_SOURCES array with a real,
                                           editable config list).
/dashboard/company-leads/[id]             Existing PipelineDetailScreen,
                                           unchanged for every other section.
                                           ActivitySection extended: shows the
                                           real method/outcome/follow fields,
                                           gains its own "Log a call" button.
```

**Follow-up queue definition, stated precisely** (no new column needed): for a given lead, its "open follow-up" is the `follow` date on its most recent `activity_log` row, if any — logging a new call naturally supersedes the old one (the new row becomes "most recent"), exactly matching the real workflow of "I called, here's what's next" without needing a separate resolved/unresolved flag that could drift from reality.

## 6. Porting approach, phased (one phase fully built, verified live, deployed before the next)

1. **Phase 1 — Call Log core**: migration; extend `activityLog.log()` to accept `method`/`note`/`follow`/`outcome`; new `activityLog.listCompanyWide()`; "Log a call" modal component (reused from both the list screen and the detail screen); new `/calls` page; extend `ActivitySection` to show the richer fields.
2. **Phase 2 — Follow-ups view**: a tab or filter state within `/calls` surfacing the real derived open-follow-up list per lead, with overdue highlighting (reusing `isLeadOverdue`-style logic, adapted to a `follow` date instead of `nextActionDate`).
3. **Phase 3 — Analytics tab**: new Company-Leads-scoped hook + screen, adapting `useSalesActivityAnalytics`'s real pattern (6-month trend, KPI strip) to calls/leads-by-source/funnel/visits-vs-purchases/cash, scoped to company leads.
4. **Phase 4 — Data Quality tab**: new Company-Leads-scoped checks, adapting `dataIntegrityCheck.ts`'s real pattern.
5. **Phase 5 — Settings tab**: real lead-source config (new `app_config` field or small config table — decided when this phase starts, after checking whether `app_config` already has a similar precedent to extend).

## 7. QA

Real test per phase: log a real test call (method/outcome/note/follow-up date), confirm it appears in both the Call Log list and the client's own Activity section with every field intact. Confirm "My calls today"/"Follow-ups due" filters return correct real rows. Confirm the Analytics tab's calls-by-day count matches a direct SQL cross-check. Confirm Data Quality's duplicate/missing-field counts match SQL. Confirm Settings' lead-source list is genuinely editable and the list screen's own source filter picks up a new entry without a code change. Clean up any real test call/lead created for QA afterward.
