# Smart Insights v2 — cross-app signals + professional rebuild

User feedback (2026-10-24, verbatim): "the smart insight also, u need to get an ai powered powerful version on github and clone it making sure u take your time analyzing the codebase for all the apps in the system and make sure u clone the smart insight app to sync with all the apps." Supersedes `docs/plans/18-smart-insights-plan.md`'s scope (still correct for what it covered) — a deliberate deepening, not a fix for broken work.

## 0. Real GitHub research (done this session)

**Finding, stated honestly**: no real open-source "AI-powered insights dashboard for an internal business app" exists to clone wholesale — this space is either closed-source SaaS or generic BI tools. What's real and usable:
- **`qahtann/ai-powered-react-dashboard`** (real GitHub repo) — Next.js/TypeScript/Tailwind/shadcn/TanStack Query/Recharts, the closest stack match to this app of anything found this session. Worth duplicating: its animated KPI-card treatment and its clean separation between plain KPI cards and a distinct "AI insight card" component — exactly the shape this app needs to generalize across many data domains.
- **`CopilotKit/CopilotKit`** (~38.2k★, MIT, real and legitimate) — not installable here (it drives its own agent protocol, overkill for one Groq-backed Edge Function), but its sidebar/chat component source is the right reference for an "ask anything about your data" affordance, reference-only.

**Primary adaptation target**: `qahtann/ai-powered-react-dashboard`'s card distinction + severity pattern, hand-built natively (not npm-installed) against this app's own `ai-insights` Edge Function architecture.

## 1. What "sync with all the apps" means, grounded in the real schema

Current coverage: Sales pipeline only (`leads`/`payments` — cold leads, allocation-trigger proximity, stalled-high-priority, collection momentum, forecast). Real, clean, RLS-confirmed signals that exist in apps **not yet connected**, each verified against real columns and real RLS this session:

| New insight | Real app | Table / columns | Scope |
|---|---|---|---|
| Complaint aging | Complaints | `complaints.status`, `created_at`, `agent_key` | Staff: own. Manager: company-wide. |
| Referral aging | Referrals | `referrals.status`, `created_at`, `created_by_key` | Staff: own. Manager: company-wide. |
| Allocation request aging | Allocations | `allocation_requests.status`, `created_at`, `agent_key` | Staff: own. Manager: company-wide. |
| Contract request aging | Contract of Sale | `contract_requests.status`/`fulfilled_at`, `created_at`, `requested_by` | Staff: own. Manager: company-wide. |
| Leave request pending decision | Leave | `leave_requests.status`, `created_at`, `agent_key` | Manager-only (manager is who decides). |
| Banner zero-lead performance | Banner Tracking | `banners.status`, `created_at`; `leads.banner_id` | Manager-only (`banners_sel` RLS is company-wide visible to everyone, but reviewing campaign spend is a Management concern, same reasoning Analytics already applies). |

**Real scope boundary, stated honestly**: Operations Tracker, Site Visit Authorization, Directory, Notes, Memorandum, Chat are deliberately NOT added. Operations Tracker already has its own in-app overdue/status indicators (duplicating them here would be a redundant second alerting surface, the same discipline Commission's plan already applied against a redundant AI surface). The rest have no natural "something is stuck/aging and needs attention" signal that isn't already a status the app itself surfaces inline. Six real new domains connected (Complaints, Referrals, Allocations, Contract of Sale, Leave, Banner Tracking) on top of the original Sales/Payments is a genuine, honest expansion — not a claim of covering literally all ~20 apps, which would mean inventing signals for apps that don't have one.

## 2. Database

None. Every new signal reads already-live tables with RLS already confirmed to scope correctly for both roles (`alloc_sel`, `complaints_sel`, `contract_requests_sel`, `referrals_sel_staff`, `leave_requests_sel` — all read this session via `pg_policy`).

## 3. Security

None new — same client-side role branch `useSmartInsights.ts` already uses (`isManager` picks the company-wide query vs the own-records query), backed by real RLS underneath exactly as today.

## 4. AI touchpoints

**New**: a short AI-drafted one-line "what to do about it" suggestion per insight card, reusing the `ai-insights` Edge Function's discriminated-kind pattern with a new kind `smart_insight_action` — given the insight's real type and real count/detail, draft ONE actionable sentence (e.g. "Follow up with these 3 clients today, starting with the one paid longest ago"). Deterministic insight generation stays 100% in TypeScript (as today); AI only adds the suggested-action sentence, same split as every other AI surface in this app. Gracefully absent if unconfigured (same pattern throughout).

## 5. UI — real rebuild

Two real pages, mirroring the already-established overview + drill-down split (same shape as My Portfolio/Smart Insights v1):

```
/dashboard/smart-insights           Real insight-feed layout (qahtann-style
                                      card distinction): a digest grouped by
                                      app/domain (Sales, Complaints,
                                      Referrals, Allocations, Contract of
                                      Sale, + Leave/Banners for managers),
                                      each card: icon, tone, headline, detail,
                                      one AI action sentence, a "View all →"
                                      link into the drill-down.
/dashboard/smart-insights/[kind]    Existing drill-down list, extended to
                                      handle the 6 new kinds alongside the
                                      original 4.
```

Visual language: same staggered entrance + danger-tone glow-pulse already established (`SmartInsightsScreen.module.css`, reused not forked), grouped into real domain sections instead of one flat grid, closer to the "digest" shape the research confirmed as the real pattern worth adopting.

## 6. Porting approach

1. Extend `smartInsightsLogic.ts`: 6 new pure check functions (`getComplaintAging`, `getReferralAging`, `getAllocationAging`, `getContractRequestAging`, `getLeavePending`, `getBannerZeroLeads`), each returning a typed list same shape as the existing 4.
2. Extend `useSmartInsights.ts`: fetch the 6 new tables (role-scoped query per the table above), merge into `computeSmartInsights()`.
3. New AI hook `useSmartInsightAction` (kind `smart_insight_action`), called per-card.
4. Rebuild `SmartInsightsScreen.tsx` with the domain-grouped digest layout.
5. Extend `[kind]/page.tsx` drill-down for the 6 new kinds.
6. New Edge Function kind deployed to the live `ai-insights` function (read-then-verify-byte-for-byte per the standing deploy-placeholder-incident lesson).

## 7. QA

Real test: confirm each new insight's count matches a direct SQL cross-check for a real test account (both as staff and as Management). Confirm the AI action sentence is grounded in the real numbers given. Confirm an insight with 0 matches doesn't render its card. Confirm drill-down works for all 10 kinds now.
