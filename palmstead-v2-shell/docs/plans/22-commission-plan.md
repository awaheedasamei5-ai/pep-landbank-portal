# Commission — build plan (palmstead-v2-shell)

Fifth of 7 apps in the "Insights" build order. Shorter than the prior four plans in this queue because, unlike Smart Insights/Data Check/Document Vault/My Portfolio, **the real business logic, the AI touchpoint, and the one gap this memo's own research flagged (the dispute flow) are already fully built and live** — this app is a navigation/architecture decision, not new feature work, and padding it with invented work would be the dishonest move, not the careful one.

## 0. Correcting the 2026-10-23 research memo

That memo said Commission "has a real dispute flow in v1 (`openCommissionDisputeModal`) not yet confirmed built anywhere in this shell." Reading the real source this session shows that's wrong: `src/app/(main)/dashboard/finance/_components/commission-panel.tsx` + `use-finance-commission.ts` (built under `docs/plans/05-accounting-app-blueprint.md` Part B.4/B.9) already has:
- `get_commission_breakdown()` — a real server-side RPC, "a direct extraction of `run_monthly_commission_check()`'s own real formula" (same frozen personal-capped + pool-share math as v1's `computeCommissionForMonth()`/`computeMyCommissionBreakdown()`, index.html:26104-26174).
- A **manager view** (pool total/eligible-agent count/total payable KPIs, per-agent breakdown, a branded PDF report) and, for everyone else, an **agent-scoped view** of their own personal + pool total for the selected month — the exact same row the RPC already scopes server-side.
- `ConcernDialog` / `useRaiseCommissionConcern` — the real "This doesn't look right — raise a concern" flow, already wired to send a real message to Management (not a stub).
- `CommissionCalculatorPanel` — a staff-facing what-if calculator, manager-only tab.

**The one real, honest gap**: this entire feature only has one entry point, `/dashboard/finance?tab=commission` — tab 4 of a 7-tab Accounting workspace. v1 deliberately gave staff a *separate*, one-click `myCommission` route (index.html:8404, dispatched independently of the manager-only `commission` route) rather than nesting it inside Office Desk. This shell's sidebar already reserves exactly that slot — the Insights group's "Commission" item, still `NOT_BUILT_YET`. Building this app honestly means giving that slot a real destination, **not** re-implementing logic that already exists and already works.

## 1. Database

None. `get_commission_breakdown()` and the `messages` table (the concern flow's real send target) are already live and already correctly scoped by RLS — confirmed via the already-shipped Accounting build, not re-verified from scratch here since nothing about the data layer changes.

## 2. Security

None new. The RPC already returns only the caller's own row for a non-manager (server-side scoping, same as every other RPC in this shell); `messages` INSERT is already real staff-to-staff per Chat's existing RLS.

## 3. AI touchpoints

None new for this slice — `commission_explainer` (web-next's `useCommissionExplainer.ts`, kind already live on the shared `ai-insights` function) exists as a *different*, narrower "this month vs last month" personal-only view that was deliberately never wired to a screen in this shell. The already-built Accounting `AutomatedCommissionPanel` take (a monthly cursor a staff member can page back through, not fixed to "this month") is the real, shipped, tested design decision for this shell — reusing it as-is rather than introducing a second, slightly different Commission surface with its own AI sentence would be the duplication this queue's own standing rule warns against. No new AI work here.

## 4. UI — page architecture

**One real page**, not artificially split — same reasoning as Data Check: there is exactly one already-complete component to point this nav slot at, and inventing a second page around it would be padding, not structure.

```
/dashboard/commission   Staff: renders the real, already-built <CommissionPanel />
                         directly (which itself already renders the agent-scoped
                         AutomatedCommissionPanel with month cursor, personal/pool
                         breakdown, and the real ConcernDialog "raise a concern"
                         flow -- zero new component code).
                         Manager: v1-parity redirect message (same pattern as
                         My Portfolio -> Leaderboard) pointing to the full
                         Accounting Commission tab, since the company-wide pool
                         view + PDF report already live there and a second copy
                         would just be a stale duplicate to maintain.
```

## 5. Porting approach

1. New route `src/app/(main)/dashboard/commission/page.tsx` that imports and renders the existing, unmodified `CommissionPanel` export from `finance/_components/commission-panel.tsx` for a non-manager profile, and a plain redirect card for a manager.
2. Wire `sidebar-items.ts` (`commission` entry, currently `NOT_BUILT_YET`) only once verified live.
3. Zero changes to `commission-panel.tsx`/`use-finance-commission.ts` — reused verbatim, which is the whole point.

## 6. QA

Real test: load as a real staff test account, confirm the dedicated route shows the same personal commission total and pool-eligibility badge as `/dashboard/finance?tab=commission` does for that same account (must be byte-identical, since it's literally the same component). Confirm "raise a concern" sends a real message visible in Management's Chat inbox for that staff member, then note it was a real test message in the conversation (no cleanup mechanism exists for a sent chat message — delete is the user's own call, not something to do silently). Confirm a manager visiting `/dashboard/commission` sees the redirect message, not the panel.
