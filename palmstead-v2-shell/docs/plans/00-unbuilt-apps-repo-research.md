# Unbuilt Apps — Repo Research & Build Order

Source: the real live sidebar at `https://palmstead-v2-shell.vercel.app` (2026-10-10). Every app below still routes to `/dashboard/coming-soon`. This doc maps each one to a real, verified open-source repo (stack/size/stars confirmed via `gh api`, not README claims) with concrete integration instructions — the research step required before any of this project's own mandatory build process (`docs/CONTINUE_HERE.md` §2) can begin.

**This doc does NOT replace the 15+ page layered blueprint each app still needs.** That gets written fresh, immediately before building, following the proven process — never all 17 upfront. This doc is the research input that blueprint draws on.

**Build order** (sidebar's own listed order, Office → Communication → Insights → Management; adjust only if the user asks):

1. Memorandum
2. Contract of Sale
3. Notes
4. Staff Report
5. Notifications
6. Chat
7. Smart Insights
8. Data Check
9. Document Vault
10. My Portfolio
11. Commission (staff-facing — distinct from Accounting's manager-facing Commission Calculator)
12. Analytics
13. Reports (company-wide, distinct from Accounting's own Report Builder)
14. Leaderboard
15. Team Roster
16. System Health
17. Settings (global/company-wide — distinct from each app's own in-app settings)

---

## 1. Memorandum

Internal memo drafting/circulation — draft, route for sign-off, publish, staff acknowledge-receipt.

- **Repo**: [`docmost/docmost`](https://github.com/docmost/docmost) — TypeScript, 21.9k stars, 17MB, actively maintained (pushed within the last day). Open-source Notion/Confluence alternative with a real TipTap-based rich-text editor, document versioning, and permission model.
- **Feasibility**: MEDIUM. Its own backend (NestJS + Postgres) is architecturally closer to this stack than most of the original 10 repos, but still not Supabase-native — port its real editor component and document/workflow data model (draft → review → published states, versioning), re-implement persistence against Supabase.
- **Instructions**: clone, study `apps/client/src/features/editor/` for the real TipTap setup (don't hand-roll a rich-text editor), study `apps/server/src/core/page/` for its draft/version/permission data model, translate that schema to a Supabase `memoranda` table with RLS. V1's actual memo logic (if any exists — check `main` branch first per the mandatory process) still governs the real workflow requirements.

## 2. Contract of Sale

- **Not a fresh search** — already built once (11/11, web-next, see `project-contract-of-sale-blueprint-2026-09-11` prior session work), but that build predates the OSS-foundation strategy and is not the current deliverable.
- **Instructions**: read that prior web-next implementation first (`git log --all` / check `web-next/` folder) — it already used real Documenso/DocuSign-pattern research for e-signature flow. Re-ground it: port its proven logic into `palmstead-v2-shell`, re-verify against the current schema (`sbydzrlzqxcdbudjaube` may have moved on), rebuild the UI against this shell's own component system rather than web-next's.

## 3. Notes

Personal/shared/team notes, linkable to clients/projects/tasks.

- **Repo**: same as Memorandum — [`docmost/docmost`](https://github.com/docmost/docmost). Its editor and "space"-based sharing model (personal/team/shared) map directly onto this app's real requirements (see the full OSS-foundation instruction doc's Notes section, quoted in full in `CONTINUE_HERE.md` origin memory — personal/shared/team/meeting/project/client notes, tags, linking to other Palmstead records).
- **Alternative**: [`toeverything/AFFiNE`](https://github.com/toeverything/AFFiNE) — TypeScript, 73.4k stars, 455MB. Far larger and more ambitious (block-based, Notion+Miro hybrid); only worth the size if Notes needs a canvas/whiteboard dimension V1 doesn't call for. Default to Docmost unless V1's real notes requirements justify the bigger surface.
- **Instructions**: reuse the same editor port as Memorandum (one real editor component serving both apps is appropriate — Docmost's own architecture already separates the editor from the page/workflow logic). Add the "link to a client/project/task/report" relation V1 and the OSS-foundation instructions both require.

## 4. Staff Report

Per-staff activity/performance report, likely cross-pulling Attendance + Leave + Operations + Commission data (same pattern as Accounting's own Report Builder, §B.10 of `05-accounting-app-blueprint.md`).

- **No dedicated repo** — this is a data-aggregation + PDF-export feature on top of already-built apps, not a standalone product category. Reuse the exact pattern already proven and shipped: `pdfReport.ts`'s `pdfLedgerSection` toolkit, the section-picker + date-range-filter UX from Accounting's `reports-panel.tsx`.
- **Instructions**: research real per-employee performance report formats (same depth as Accounting's Xero-P&L research — look at real HR platforms' staff report exports) before building: what sections a real staff report has (attendance summary, leave summary, task/commission output, manager notes), not just a copy of Accounting's layout with different data.

## 5. Notifications

In-app + push notification center.

- **Repo**: [`novuhq/novu`](https://github.com/novuhq/novu) — TypeScript, 40.1k stars, 509MB, very actively maintained. Real, modern open-source notification infrastructure: in-app notification center UI components, multi-channel (in-app/email/SMS/push) orchestration, subscriber/preference model.
- **Feasibility**: MEDIUM-HIGH. Novu's own backend is a full orchestration platform (heavier than needed here), but its **React notification center UI package** (`@novu/notification-center`) is real, embeddable, and directly usable — study `packages/notification-center/` for the actual bell-icon/feed/preferences component pattern rather than running Novu's full backend. Pair it with Supabase Realtime for the actual delivery mechanism (already proven in this project for cross-app sync).
- **Instructions**: don't stand up Novu's own server — extract its UI component patterns and preference-center data model, re-implement delivery against Supabase's existing realtime channels (the ones already wired for Attendance/Leave/Pipeline per `CONTINUE_HERE.md` §5).

## 6. Chat

- **No strong single-repo match found.** Checked `RocketChat/Rocket.Chat` (already in the original 10, Meteor/MongoDB, LOW feasibility — confirmed still true), `chatwoot/chatwoot` (37.7k stars, but Ruby/Rails, 303MB — also LOW feasibility), and searched specifically for Supabase-native chat references — nothing with real adoption (best hits had under 10 stars).
- **Honest recommendation**: build this one custom on Supabase Realtime (already the project's proven real-time backbone) rather than forcing a weak or incompatible fork. Use Rocket.Chat's real UI/UX as a *reference only* (message grouping, typing indicators, read receipts, thread patterns) — study its `client/views/room/` for those interaction patterns, don't touch its Meteor backend.
- **Instructions**: research real lightweight Supabase+Next.js chat implementations via Supabase's own official examples/guides (not GitHub stars-ranked search, which surfaced nothing credible) before designing the schema.

## 7. Smart Insights

Already scoped once before — see `feedback-companion-scoping` in prior session memory: a rule-based nudge/checklist panel linked across apps, explicitly **not** an LLM feature.

- **Repo**: [`danny-avila/LibreChat`](https://github.com/danny-avila/LibreChat) — already repo #5 in the original approved 10. Its agent/tool-calling pattern is the real reference if this evolves into the AI Assistant the OSS-foundation instruction doc describes (a Palmstead-wide intelligence layer, not an isolated chatbot).
- **Instructions**: re-read the full verbatim AI Assistant requirements (quoted in `CONTINUE_HERE.md`'s origin memory) before building — it must respect role-based permissions and pull real authorized data across Tasks/Operations/CRM/Attendance/Leave/Finance, not give generic responses.

## 8. Data Check

Likely a data-quality/validation surface (flagging incomplete client records, mismatched financial figures, stale data) — name suggests an internal QA tool, not client-facing.

- **No direct open-source product match** (data-quality tools like Great Expectations are Python data-pipeline tools, not admin-dashboard UI — reference only, not a fork candidate).
- **Instructions**: this one needs V1 analysis first more than repo research — confirm what "Data Check" actually means in V1 before assuming scope. If V1 has no equivalent, ask the user to clarify intended scope before researching further; don't guess and build the wrong thing.

## 9. Document Vault

Company document storage/archive (contracts, IDs, certificates), not the same as Notes.

- **Repo**: [`paperless-ngx/paperless-ngx`](https://github.com/paperless-ngx/paperless-ngx) — Python/Django, 46.5k stars, 226MB, very actively maintained, the real industry-standard self-hosted document management system (OCR, tagging, full-text search, retention).
- **Feasibility**: LOW as literal backend merge (Django, not Supabase) — but its tagging/correspondent/document-type data model and the actual UX of its document list/preview/search UI are real and worth adapting. Supabase Storage + pgvector/full-text search replaces its Django+Elasticsearch backend.
- **Instructions**: study its `src-ui/src/app/components/document-list/` for the real list/filter/tag UX, translate its document/tag/correspondent schema to Supabase tables + Storage buckets with RLS.

## 10. My Portfolio

Staff-facing personal performance/earnings dashboard (their own sales, commission history, streaks) — distinct from Accounting's management-side views.

- **No dedicated repo** — this is a personal-dashboard composition over already-built data (Pipeline, Commission, Attendance), same category as Staff Report. Use [`tremorlabs/tremor`](https://github.com/tremorlabs/tremor) (TypeScript, 3.7k stars, React chart/stat-tile component library, copy-paste install like shadcn itself) for the actual chart/KPI-tile components rather than hand-rolling them — it's built for exactly this kind of personal analytics surface and fits the shadcn-based stack directly.
- **Instructions**: confirm with the user or V1 what data belongs here vs. in the separate "Commission" app (#11) before building both — likely overlapping scope that needs disambiguating first.

## 11. Commission (staff-facing)

- Likely the staff-side mirror of Accounting's manager-only Commission tab (view your own commission history/breakdown, not calculate others'). Reuse the real `get_commission_breakdown()` RPC already proven in Accounting (`use-finance-commission.ts`), scoped to the logged-in staff member's own `agent_key` (the RPC already supports this server-side restriction).
- **No new repo needed** — this is a staff-scoped read view of data Accounting already manages. Flag the scope overlap with My Portfolio (#10) to the user before building either.

## 12. Analytics

Company-wide BI/analytics surface.

- **Repo reference**: [`apache/superset`](https://github.com/apache/superset) — already repo #9 in the original 10, LOW feasibility as literal merge (confirmed, 1.1GB Python/Flask).
- **Component repo**: [`tremorlabs/tremor`](https://github.com/tremorlabs/tremor) (see #10) — the real, directly-integrable chart/dashboard component library for this stack.
- **Instructions**: Superset for dashboard-composition UX patterns (drag-arrange panels, saved views), Tremor for the actual chart components, Supabase for the real data. Don't attempt to run Superset's own backend.

## 13. Reports (company-wide)

- **No new repo needed.** This is the same pattern as Accounting's own Report Builder (`05-accounting-app-blueprint.md` Part B.10/E.1), generalized across the whole system rather than just Accounting's sections. Reuse `pdfReport.ts` and the section-picker+date-range UX directly; the real research already done for Accounting's reports (Xero P&L structure, grouped-ledger PDF primitive) is the template — extend its section list to cover every app, not just Accounting.

## 14. Leaderboard

- **Already substantially built once before** (prior session: "Leaderboard V3 audit + plan — Phases 1-3 CLOSED" — server-side scoring, admin workspace, 2 AI capabilities, in web-next). Searched GitHub for a fresh leaderboard/gamification repo — nothing with real adoption surfaced (best hits had single-digit stars).
- **Instructions**: don't search further for a fresh repo — port the prior real logic (server-authoritative scoring, the two real AI capabilities already built) from web-next into palmstead-v2-shell, rebuilding only the UI against this shell's own components. Check `web-next/` and git history for the actual prior implementation before writing anything new.

## 15. Team Roster

Staff directory/org chart.

- **Repo**: [`mimnets/OpenHRApp`](https://github.com/mimnets/OpenHRApp) — already repo #7, HIGH feasibility (same Supabase backend), already partially mined for Attendance/Leave. Its staff directory/profile components are the real match here — study what wasn't already ported during the Attendance/Leave build.
- **Alternative**: [`sarmakska/staff-portal`](https://github.com/sarmakska/staff-portal) — already repo #10, HIGH feasibility, tiny enough to read in full.
- **Instructions**: check what OpenHRApp directory/profile code is still unused from the earlier Attendance/Leave port before reaching for staff-portal — avoid introducing a second source pattern for the same staff-profile concept.

## 16. System Health

Internal ops/monitoring dashboard (app status, error rates, background job health).

- **Repo**: [`louislam/uptime-kuma`](https://github.com/louislam/uptime-kuma) — JavaScript, 92.3k stars (the most popular self-hosted monitoring tool that exists), 39MB, extremely active.
- **Feasibility**: MEDIUM — its own backend (Node + SQLite, Vue frontend) isn't a literal merge target (different frontend framework entirely), but its real monitor/incident/status-page UX is the honest reference for what this page should show and how it should be laid out.
- **Instructions**: study its status-page and monitor-detail layouts for UX only; implement the actual health checks against this project's real infrastructure (Supabase project health via its own API, Vercel deployment status, scheduled-job success/failure if any exist).

## 17. Settings (global/company-wide)

Distinct from every app's own in-app settings (Accounting Settings, Attendance Policy, etc. — those stay where they are per the standing rule).

- **No new repo needed.** This is company identity, global roles/permissions, and cross-app configuration not owned by any single app (the standing rule explicitly carves this one out as its own dedicated surface — see `CONTINUE_HERE.md` §2 point 11). Reference the shell's own existing settings patterns (Accounting's Settings tab, just shipped) as the internal template for layout/component choices — no external repo needed, this is pure composition of already-established patterns.

---

## Honest gaps in this research pass

- **Chat, Data Check, My Portfolio/Commission overlap**: no strong repo match or clear scope exists yet — these need either a V1 check or a direct question to the user before a real blueprint can be written, flagged above per-app rather than guessed past.
- **Pinterest / live UI reference boards**: not done in this pass (repo recon prioritized first, given it's the harder-to-fake, more durable research). Each app's actual blueprint-writing phase should still include a real Pinterest/established-app UI pass before design, per the standing process — this doc covers the code/architecture research input only.
