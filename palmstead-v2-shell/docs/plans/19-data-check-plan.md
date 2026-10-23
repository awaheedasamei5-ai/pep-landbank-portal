# Data Check — build plan (palmstead-v2-shell)

Second of 7 apps in the "Insights" build order (`docs/plans/18-smart-insights-plan.md` was the first — same precedent applies: port already-correct logic, rebuild the UI natively).

## 0. This is a real v1 port

Real v1 feature, `runDataIntegrityCheck()` at `index.html:19180-19271`, sidebar label `'Data Check':'Spot leads missing a next action, contact, or plot details'`. `web-next/src/features/data-check/` already has a correct, substantial logic layer (`lib/dataIntegrityCheck.ts`, `hooks/useDataCheck.ts`, `hooks/useDataCheckSummary.ts`) with real documented corrections already made against the literal v1 port (not blind copies):
- **Ledger mismatch** now filters payments to `approved`-only before summing (the literal v1 check summed every payment regardless of status, which would false-positive on any lead with a payment still pending approval — a real bug the prior port already caught and fixed, confirmed against this project's own `payments_sel` RLS and `applyApprovedPaymentToLead` precedent).
- **Half Plot quantity check removed** — `noPlots` is a full-plot-equivalent count project-wide now (0.5 IS one standard Half Plot), so the literal v1 check would wrongly flag every real half-plot lead.
- Two literal v1 checks correctly left out, not silently dropped: "missing payment plan" (masked upstream by a real default) and "unresolved task" (the real schema this check depended on has no lead linkage).

**Confirmed already live in this shell, zero new backend work needed**: `leads`/`payments`/`site_visits` and their real RLS (`payments_sel`/`site_visits_sel`: `agent_key = my_key() OR has_permission('ops.view_all')`, confirmed via `pg_policies` — a plain unfiltered `listAll()` call is already correctly scoped server-side, same reliance-on-RLS pattern this shell already uses elsewhere), `ds.leads.listAll()/listForAgent()`, `ds.payments.listAll()`, `ds.siteVisits.listAll()`, `useStaffDirectory()` (`features/memos/hooks/useMemos.ts`, for agent-key → display-name), `computeLeadQuotationTotals()`, and every real `Lead` field the checks read. **The `data_check_summary` kind is already live on the shared `ai-insights` Edge Function** (confirmed by reading its real deployed source this session) — no redeploy needed, just wire the client call.

## 1. Database

None. The one real schema dependency (`leads.last_modified_at`, for the "Stale lead" check) already exists and is already trigger-maintained.

**One real decision to make, not silently copied**: the literal port's dismiss state lives in client-side `localStorage` (`pep_webnext_dismissed_issues`), meaning a dismissal doesn't survive a device change and isn't visible to anyone else — for a manager running a company-wide scan, that means dismissing a false-positive on one device leaves it reappearing on every other login. Given this app is explicitly company-facing for a manager (not just a personal single-device tool), **this gets upgraded to a real, small server-side table** (`data_check_dismissals`: `id`, `lead_id` FK, `issue_type` text, `dismissed_by`, `dismissed_by_name`, `dismissed_at`, `is_company_wide` boolean) rather than ported as a localStorage hack — the honest fix, not a cosmetic one. `is_company_wide` records whether the dismisser *was a manager at the moment they dismissed it* — a real fact about that row, not a permission re-check against whoever is currently viewing (an early draft of this migration got that backwards — gated SELECT on the *viewer's* permission, which meant a manager's dismissal would never actually reach a staff member's own scan; caught and fixed before any UI was built on top of it).

## 2. Security

RLS on the new `data_check_dismissals` table: same owner-or-manager shape as this project's other small decision tables (`created_by`/`dismissed_by` = `my_key()`, or `has_permission('ops.view_all')` for company-wide manager access) — a staff member can dismiss a false-positive on their own pipeline; only a manager's dismissal should suppress it company-wide. Everything else (leads/payments/site_visits reads) reuses existing, already-correct RLS — no policy changes needed there.

## 3. AI touchpoints

One, already live: `data_check_summary` on the shared `ai-insights` Edge Function — a short narrated summary of the scan (which category most deserves attention, roughly how many leads), fed only aggregate category counts (type + severity + count), **never a lead name** — this is a deliberate real privacy boundary already built into the prior port (a data-hygiene finding is exactly the kind of thing that would otherwise carry a client's real name into a prompt unnecessarily) and stays exactly as-is.

## 4. UI — page architecture

**One real page**, not artificially split — unlike Smart Insights' category breakdown, a data-hygiene scan is genuinely one cohesive result set (a KPI header + one real filterable/sortable table), and forcing a second page here would be padding, not structure:

```
/dashboard/data-check    KPI row (hygiene score %, clean-leads count), the AI narration
                          callout, then every flagged issue as a real shadcn Table (not
                          web-next's flat div-list) -- sortable/filterable by severity and
                          type, danger-severity rows visually distinct from warn, each row
                          with a real "Fix this lead" link to Pipeline Detail and a
                          "Dismiss" action that writes to the new real table instead of
                          localStorage.
```

Zero-issue state matches the real tone already established ("Every lead's unit price, totals, payments and basic record fields are all in order") rather than a generic empty-state graphic.

## 5. Porting approach

1. Port `dataIntegrityCheck.ts`'s real check logic verbatim — only the dismiss mechanism changes (swap the `localStorage` read/write for a real Supabase table read + a `useMutation` insert, keeping the exact same `DataIssue`/`issueDismissKey` shape so the check logic itself needs zero modification).
2. Port `useDataCheck.ts`/`useDataCheckSummary.ts` with the dismiss-state source swapped from `useState` tick + localStorage to a real `useQuery` over `data_check_dismissals` + `invalidateQueries` on dismiss (replaces the manual `notifyDismissed()` re-render nudge with a real cache invalidation, consistent with how every other mutation in this shell already works).
3. Build one fresh native shadcn screen (`Card`/`Table`/`Badge`), no CSS modules.
4. Wire `sidebar-items.ts` only once verified live.

## 6. QA

Real test: create a lead with a deliberately wrong `unit_price` (or find one already flagged in real data), confirm it shows up with the right severity and detail text; dismiss it as a manager and confirm it disappears company-wide (a second manager session, or a staff login, no longer sees it); confirm a staff member's own dismissal does NOT suppress it for the manager (per the RLS scoping above) — this split is the one behavior most likely to need a real second-login check, same lesson as Smart Insights' scope-split verification. Confirm the hygiene score and clean-lead count match a hand count. Clean up any test lead data created for this after verification.
