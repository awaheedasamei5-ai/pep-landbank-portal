# Continue Here — Handoff for Any AI Tool

## Latest active request — 2026-10-16

The user now prioritizes Management test-data reset/recovery, permitted Staff edit/update/delete and missing Back controls across apps; then Operations reports/completion; then Accounting workflows/reports/all PDFs. Follow `docs/plans/14-management-reset-actions-navigation-and-app-completion.md` for the current order. The first Operations reset slice was published as `9553ebe` and deployed READY as `dpl_52P3acMf7rFQRpMGES6MRTe6qeqA`; exact migrations, 55 isolated checks, live role/preview checks and limitations are in `docs/plans/14a-operations-reset-verification.md`. No live data reset was performed. Next: cross-app return navigation and Operations action/security contracts. Do not mistake the earlier “next” ordering below or a completed Leave slice for completion of this programme. Preserve concurrent Notes/Memorandum/Chat work and stay within V2/rebuild.

Navigation foundation is now **published/deployed as `926b2f1`, READY `dpl_6DZQXce2iSqJz3ddTsjQmpTtMyAk`**: shared safe Back trail, Operations/project/Accounting URL tabs, Operations drill-through return context, missing Reports/Attendance-corrections controls and safe copied CRM navigate(-1). Plan `14b-return-navigation-contract.md`, provisional route CSV and `14c-navigation-verification.md` record scope, 121 isolated assertions, passing production build, real local and production Management/Staff journeys and 320px light/dark checks. Operations initial version checks now run in background tabs, with request cancellation. This is a bounded slice: the remaining cross-app overlays/forms/guards, Staff action security, Operations reports and Accounting programme are still outstanding. Preserve concurrent uncommitted Chat-attachment work; deploy only the verified committed V2 source snapshot.

This file exists so that **any AI coding tool** working on this repo — Claude Code, Codex, GitHub Copilot, or a model routed through OmniRoute — picks up the same standing rules and project context that governed every prior decision here. Claude Code also keeps a private, session-spanning memory store outside this repo; this file is the durable, repo-committed subset of that memory a different tool actually needs. Read this in full before writing any code.

## 1. Three things named "Palmstead" — do not confuse them

| What | Where | Database | Status |
|---|---|---|---|
| **Real production app** (what staff use daily, right now) | This repo's own `main` branch, single `index.html` file, no build step, deployed via GitHub Pages at `https://awaheedasamei5-ai.github.io/pep-landbank-portal/` | Supabase `lrahgcnftetnyxunaljs` ("PEP LANDBANK LTD") | Live, real data |
| **palmstead-v2-shell/** (this folder) | `rebuild` branch of this same repo | Supabase `sbydzrlzqxcdbudjaube` | **The active deliverable — this is what you are building** |
| **web-next/** (sibling folder) | `rebuild` branch | Supabase `sbydzrlzqxcdbudjaube` (same as v2-shell) | Superseded — an earlier rebuild attempt, kept as reference only, not extended |

Never treat `web-next/`'s own implementations as "done" or build on top of them. Never assume the `PALMSTEAD` repo at `C:\Users\USER\Desktop\PALMSTEAD` is production — it isn't; `main` on this repo is.

To read real production's actual logic: `git fetch origin main && git show origin/main:index.html` (don't check it out over this working tree — `rebuild` has an entirely different structure under `palmstead-v2-shell/` and `web-next/`).

### CRITICAL — a stale copy of V1 sits in this same working tree

**Verified 2026-10-13, correcting an earlier wrong assumption in this file**: `index.html`, `android/`, and `www/` also exist at this repo's own root **on the `rebuild` branch itself** (a stale mirror of V1, last touched 2026-08-29) — not only on `main`. `supabase_migrations/` at the root is V1-era legacy SQL, not V2's. An agent exploring from the repo root, rather than starting inside `palmstead-v2-shell/`, can easily stumble into and edit real V1 files by mistake, since they sit right alongside the actual project with no visual distinction.

**The rule, absolute, for any agent working in this repo**:
- Work **only** inside `palmstead-v2-shell/`. Never read or write `index.html`, `android/`, `www/`, or `supabase_migrations/` at the repo root, or anything in `web-next/` unless explicitly told to reference it.
- Never run `git checkout main` or modify the `main` branch in any way.
- Only ever use Supabase project `sbydzrlzqxcdbudjaube`. Never `lrahgcnftetnyxunaljs` (V1's real production data) — these are two fully separate Supabase projects with separate credentials, so scope any Supabase access (API keys, MCP tool access) to `sbydzrlzqxcdbudjaube` only before granting it to any agent.

## 2. What this project actually is

`palmstead-v2-shell` is a Next.js 16 / React 19 / TypeScript / Tailwind v4 / shadcn (`radix-nova` style) admin dashboard, forked from `arhamkhnz/next-shadcn-admin-dashboard` and rebuilt into Palmstead V2. See `AGENTS.md` in this folder for coding conventions (file structure, commands, code style) — this doc covers the *process* and *history* AGENTS.md doesn't.

### The strategy: fork and modify real open-source repos, grounded in V1's logic

The user's standing instruction (2026-09-11, never rescinded): every app is built by taking a real, approved open-source repo and modifying its actual source code — not hand-rolled from scratch. Palmstead V1 (`main` branch) supplies the *logic and requirements* (what problem it solves, who uses it, what data flows where) — never its UI or architecture, except where explicitly approved.

**The 10 approved repos** (feasibility assessed via real `gh api` stack/size recon, not README claims):

| # | Repo | Stack | Likely app | Literal-merge feasibility |
|---|---|---|---|---|
| 1 | `arhamkhnz/next-shadcn-admin-dashboard` | Next.js/React/TS/shadcn | Dashboard shell (already forked as this repo) | HIGH |
| 2 | `RocketChat/Rocket.Chat` | Meteor/MongoDB | Chat | LOW — reference only |
| 3 | `makeplane/plane` | Next.js + Django | Operations Tracker | MEDIUM — frontend patterns real, backend incompatible |
| 4 | `frappe/erpnext` | Frappe/Python | ERP reference (Finance/HR/CRM) | LOW — workflow reference only |
| 5 | `danny-avila/LibreChat` | React + Node/Mongo | AI Assistant | MEDIUM — frontend/agent-pattern real |
| 6 | `twentyhq/twenty` | React + NestJS + Postgres | CRM | MEDIUM — closest data-layer match |
| 7 | `mimnets/OpenHRApp` | TypeScript + **Supabase** | Attendance/Leave/Staff | HIGH — same backend as this stack |
| 8 | `InlitX/streak` | Dart/Flutter | Streak system | LOW — wrong platform, concept-only |
| 9 | `apache/superset` | Python/Flask | Report Builder | LOW — chart/UX reference only |
| 10 | `sarmakska/staff-portal` | TS + PLpgSQL, tiny | General staff portal | HIGH — small, Postgres-native |

For LOW/MEDIUM-feasibility repos, the honest reading of "modify the source" is: fork what's realistically portable (components, data models translated to Postgres/Supabase, workflow logic re-implemented), treat the rest as an architecture/UX reference — never claim a literal merge that isn't real.

### The mandatory process, every app, no exceptions

1. **Search this file + `docs/plans/` first.** If a plan doc already exists for the app, read it in full before assuming anything.
2. **Check git history** (`git log --all`, `git tag`) for recoverable prior work before writing new code — a fuller, already-correct implementation sometimes already exists.
3. **Read V1's real logic** (`main` branch `index.html`) for that exact app — every function, field, flow. V1 is the source of truth for business rules, not UI.
4. **Verify the real database schema** via Supabase MCP tools (`list_tables`, `execute_sql`) before assuming any column/table exists.
5. **Research real UI/UX** — browse established live apps in the same category, and search GitHub for real open-source implementations (web and mobile versions separately where they exist) to adapt rather than hand-roll.
6. **Write a full layered plan before any code**, saved as `docs/plans/NN-<app>-plan.md`, minimum ~15 pages of real substance, covering in this order:
   - **Database** — full schema, designed from real requirements, not retrofitted.
   - **Security** — RLS policies, role/permission model.
   - **AI touchpoints** — where this app's AI layer plugs in, if anywhere.
   - **UI** — full multi-page navigation architecture (never a single scrolling page), separate Staff and Management page structures, which real design resource each page is duplicated from.
7. **Build in that order**: database → security → AI → UI.
8. **No generic AI UI.** Banned, always: flat uniform tile/card grids as the primary layout, decorative emoji as icons/section markers, anything that reads as "the default thing an AI generates." Use real icon sets and real dashboard patterns (charts, data tables, stat panels with real hierarchy).
9. **Verify everything live** in the browser against real test accounts (see §4) before calling anything done. Create real test data, verify, clean it up after — never leave test artifacts in production data.
10. **Never claim "done" on a shallow pass.** If something isn't actually finished, say "partial" or "not started" plainly.
11. **Settings live inside the app they configure**, never a separate Settings app (except the dedicated Staff Settings app itself).
12. **No floating/fixed-position buttons that cover content while scrolling.**
13. **Fit the page, don't just center it** — list pages get no max-width cap; forms get a cap + `margin: auto`. Never force-stretch a card/textarea to fill leftover space.
14. **Never redesign a provided logo or asset** — extract the real file losslessly instead.
15. **Commit and push to `origin/rebuild` regularly** as real, verified slices land. Uncommitted work reads as "still broken" since the user tests independently.
16. **Never merge `rebuild` into `main`** without the user explicitly saying "deploy." Vercel production deploys (`npx vercel deploy --prod --yes --scope dnm-garments` → `https://palmstead-v2-shell.vercel.app`) are separate from that — those happen routinely after a verified slice, but a `main`-branch merge does not.
17. **Hard-reload when verifying a fresh deploy** (`location.reload(true)`) — a stale CDN/browser cache gives false negatives otherwise.

The `.claude/skills/palmstead-app-build/SKILL.md` file (repo root, already committed) encodes this process in Claude Code's own skill format — read it directly if your tool can't auto-invoke skills.

## 3. Current state (as of 2026-10-10)

**Done and verified live:**
- Attendance + Leave (both Staff and Management sides) — `docs/plans/01-attendance-leave-plan.md`, `docs/plans/05-attendance-shadcn-rebuild-plan.md`
- Accounting app (renamed from "Finance") — Payments, Expenses, Commission (automated + a staff-first what-if Calculator), Payroll, Settings, cross-section Report Builder — `docs/plans/05-accounting-app-blueprint.md`. This is the most recently shipped work; read its Part E for two real corrections made against user feedback (report design research, Commission Calculator's real bank-payment-advice-letter format).
- Various earlier slices: General Staff Portal (partial, see `docs/plans/02-general-staff-portal-plan.md`), Operations Tracker foundation (`docs/plans/03-operations-tracker-plane-port.md`).

**Next, in the user's own explicit sequence (do not reorder without asking):**
1. **Operations Tracker reports system** — staff + management views, staff-to-staff comparisons, task reports, detailed filters, downloadable PDF.
2. **Leave letters rebuild** — re-analyze V1's real letter drafting/format first, rebuild more professionally (current letter logic was ported from an earlier session, not yet re-researched against this standard).
3. **Leave reports.**
4. **Attendance reports.**

Each of these needs its own full research pass (§2, steps 3–6) before any code — not assumed complete because a related app already shipped.

## 4. Real test accounts

Seven real staff test accounts exist in the real `sbydzrlzqxcdbudjaube` Supabase project (agent_keys: `manager`, `elias`, `elizabeth`, `emmanuel`, `adams`, `bridgetopokuagyemang`, `saleslead`), covering Management and every staff role, all created at the user's own explicit request so they can log in and test progress.

**Do not commit real credentials to this file or anywhere in git history.** Ask the user directly for the current login details when you need to test as a specific role — they already have them and can share them outside version control. Log in at `http://localhost:3000/auth/v1/login` (dev) or the deployed Vercel URL once you have them.

## 5. Infrastructure facts

- Supabase project for this app: `sbydzrlzqxcdbudjaube`. Treat it as real, not staging — schema changes are real changes.
- Typecheck with `npx tsc -b` (NOT `tsc --noEmit -p .`, which silently no-ops against the root solution tsconfig and always exits 0).
- RLS testing pattern (no real login needed): `set local role authenticated; set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}';` inside a transaction, then roll back.
- Deploy: `git push origin rebuild` (routine, does not go live), then `npx vercel deploy --prod --yes --scope dnm-garments` (this one does — only after a verified slice) → `https://palmstead-v2-shell.vercel.app`. **Read `docs/DEPLOY_INSTRUCTIONS.md` in full before running any deploy command** — it covers the one mistake (pushing to `main`) that would instantly redeploy real V1 production live.

## 6. Tooling already set up in this repo for any AI tool

Committed and pushed to `origin/rebuild` — available immediately to whatever tool opens this repo next:

- `.claude/skills/` + `.agents/skills/` (mirrored) — a shared skill library (animate, impeccable design suite, pick-ui-library, frontend-design, `palmstead-app-build`, and more).
- `.claude/agents/` + `.github/agents/` — Impeccable's subagents, in Claude Code and GitHub Copilot coding-agent formats respectively.
- `.codex/hooks.json` + `.github/hooks/impeccable.json` — live design-review hooks for Codex CLI and GitHub Copilot.
- `.mcp.json` — shared MCP servers (playwright, ui-skills).
- `skills-lock.json` — the `npx skills` manifest to reproduce the installed set.

If you're a tool that can't auto-invoke skills, read `.claude/skills/palmstead-app-build/SKILL.md` directly — it's the single most load-bearing file for staying consistent with everything in this doc.

## 7. Working style the user expects

- Minimize check-ins — build continuously, batch changes, don't narrate without shipped, verified progress.
- Take real time on research; a rushed pass that skips V1/plan/research steps gets rejected and redone, which costs more time than doing it right once.
- When corrected, the root cause is almost always "this was already specified and the spec wasn't re-read" — re-run the mandatory process (§2) in full for that app rather than patching defensively.

### 2026-10-15 verified section exports and shared workspace repair

The section/filter/comparison continuation is implemented; see plans 11 and 13 for boundaries. The final Next production build (sections-theme-verified-build) completed with type checking. Pure report fixtures passed. Five synthetic PDF variants (29-page company, 5-page personal, 4-page empty, 2-page filtered Requests, 2-page comparison only) were regenerated, all 42 layouts inspected in rendered sheets and exact references/sections/page numbers checked. Actual local Management comparison PDF and Staff October Requests PDF/CSV downloaded and checked for selected scope and colleague exclusion. Staff Management report route remains denied; spoofed Staff employee/department selectors are ignored. No business records were changed for this QA.

Shared legacy theme variables now inherit shell semantic colors/fonts, and the workspace background is transparent. Shrinkable headers, stacked mobile actions and Leave identity/status layouts address the reported separate white canvas and escaped cards. Local Management Leave checked at 320/390/768/1440 widths with no body or card overflow; dark Tangerine and light Default checked, original local preferences and viewport restored. Accounting loaded six cards at 320 with no escaped cards. Structural narrow-route checks also covered dashboard, Operations, Attendance, Pipeline and Plots, but not every screen/interaction is a completed mobile audit.

Report filters are collapsible on mobile, persist in validated URLs and survive refresh/section navigation. New section-only exports include filter metadata, actual comparison periods and timestamps; annual balances remain full-year for the selected cohort. Outstanding: immutable schedule/workflow/effective policy history, cycle-level turnaround, period-scoped reminder analytics, remaining page-specific responsive audits, Attendance and other app report implementations. Do not claim whole-system completion. Publish this verified slice to rebuild and deploy V2 only under DEPLOY_INSTRUCTIONS, then hard-refresh both account roles and record production evidence.

### Production verification — 2026-10-15, section exports/theme repair

Published source commit 78c87352327b21c7097697da1ea7063e3557a8bc, tree 6d8029c15199878b51528196016f71f741758348. V2 deployment dpl_FcQPD1XRETbMRUznDA5moPfJjK77 reached READY and production alias (36-second cloud build). Hard-refreshed live Management and Adams Staff sessions. Downloaded actual Management October Trends PDF/CSV against September previous period and Staff October Requests PDF/CSV; parsed exports confirmed sections/date scopes and Staff-only request, with known colleague names absent. Both downloaded PDF first pages rendered and inspected. Staff management report route denied. Production mobile Management Leave: dark cards, transparent workspace, viewport/body 375px, zero escaped cards; screenshot saved. Restored original light theme and browser dimensions. Production error-log query returned no captured logs, which is not complete monitoring coverage. Local loaded Operations overview (13 cards), schedule and Attendance (6 cards) at 320 also stayed within workspace. No real requests changed or SMS sent for this release QA. Remaining historical/turnaround/reminder reporting and other app audits remain explicitly open.

### Period reminder reporting verification — 2026-10-15

Implemented separate Management reminder reports at `/dashboard/leave/management/reports/reminders` with Overview/Comparison/Messages URLs, queue-date range, request-owner/current-outcome/recipient filters, prior equal-day or prior-year comparison, full reminder PDF and section PDF/CSV. Main Leave report passes selected month bounds/employee; operational monitor links back. Reminder reports intentionally have a different time basis and do not pretend to inherit Leave-date/status/emergency/quota filters. Historical workflow/policy reconstruction and Attendance reports remain open.

V2 migration `20261015204947_leave_period_reminder_reports.sql` applied: private guarded definer, public invoker wrapper, active Manager required, no raw queue grants or phone/message/provider payload/error exposure. Isolated PostgreSQL suite expanded to 55 checks, including boundary timestamps, deleted source references, direct-private Staff denial, inactive Management, leap comparison and 10,000-row completeness disclosure. Pure report fixtures and existing Leave report fixtures passed. Real rollback-only authorization SQL passed against active Management/Adams; live queue remains empty. No actual messages sent.

Four synthetic PDF variants (120-message full pack 23 pages, filtered 12-message register 4 pages, comparison 2 pages, empty 3 pages) were generated, all 32 layouts inspected, exact IDs/scope/sections/page numbers/CSV checked; representative long-name and definitions pages inspected at reading size. Final pagination keeps definitions together rather than leaving a near-empty continuation. Browser comparison PDF/CSV and full reminder PDF downloaded and parsed for actual dates, status filter, exclusion and complete section coverage. UI browser caught a controlled date-field submission mismatch; fixed using native FormData and reverified invalid-range error, valid August scope, prior-year switch, URL persistence and refresh.

Final Next production build and standalone full typecheck passed; new modules lint clean. Local Management/Staff browser authorization verified; 320px dark comparison screen and expanded controls have pageWidth=viewportWidth=305 and no escaped cards. Preferences and viewport restored. Existing Supabase advisor findings elsewhere remain, including guarded/legacy public definers and staff_directory view; no new report function advisory was found. Queue/counter tables intentionally have deny-by-default RLS without client policies (https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy). No blanket security-clean claim. Publish rebuild and deploy V2, then hard-refresh both roles before recording live release complete.

### Reminder report release — verified live 2026-10-15

Source commit a1a624edadfa191f7d879316318404e04b60c22b (tree 2f836d39c74a3ec1fe0c16a4285e5d5b5435f46b), V2 deployment dpl_DziTcZjEJHN9zwJM52R1L4M2Sa9d READY, production alias https://palmstead-v2-shell.vercel.app (cloud build reported 1 minute). Hard-refreshed Management and Adams Staff. Management comparison PDF/CSV downloaded and parsed: August 2026 queued cohort, August 2025 comparison, failed filter, five status count rows, unrelated register excluded. Staff route denied with personal-report return link. Live 320px dark view including expanded controls has body/viewport 305px and zero escaped cards; restored light theme and viewport. Screenshot: workspace output/screenshots/leave-reminder-reports-production.jpg. Production error query returned no captured logs; not a complete monitoring audit. Queue still has zero actual records, populated behavior verified with isolated synthetic data only. No SMS sent. Remaining Leave report gaps: prospective immutable schedule/workflow/policy history and trustworthy decision-cycle timing; Attendance reporting remains next app in the agreed sequence.

### Request change journal — local verification 2026-10-16

Plan 11 now documents the prospective immutable request journal and captured submission/amendment-to-decision cycles. V2 migration `20261015211435_leave_request_change_journal.sql` applied. Existing 3 requests have installation baseline observations, not reconstructed history. Journal stores exact before/after state, trusted actor, server time, cycle links and deletions; excludes private letter/note/signature content. Staff journal RLS is owner-key scoped, reassignment does not expose a prior owner's state to a new owner. Application journal writes are denied. Existing report RPC remains backwards compatible and adds journal data with completeness/available-year handling.

67 isolated PostgreSQL checks and pure report/CSV fixtures passed. Real Management/Adams read-only authorization script passed and rolled back. Local Management History shows 3 baselines, Adams 2; actual downloaded History PDF/CSV checked for exact references and colleague exclusion, employee filter works, Staff company report denied. Stored historical labels are preserved even where existing data labels differ from current owner profile. 320px dark tables scroll locally without page overflow; theme/viewport restored. Seven PDF variants/55 rendered pages inspected, including 10-page Management and 3-page Staff synthetic History fixtures; orphan heading/paragraph fixed. Next build/typecheck passed; rebuild current shared checkout again because newer committed Memorandum work appeared while this slice was in progress. No real request changes or SMS sent. Publish only this slice on top of existing `rebuild` commits; never overwrite concurrent work. Deploy/read full DEPLOY_INSTRUCTIONS, hard-refresh both roles and record actual production evidence before marking released. Remaining next gap: company policy/effective annual allocation history, followed by Attendance reporting. Earlier history remains explicitly unavailable.

### Request journal release and latest priority — 2026-10-16

Journal source 17b726cb8c609543c766b50a5baed29dd69f0025, followed by link-target correction 185d935f17d5ca1a5071a2948a012d533b48bfd0 (tree 792aa031dd6ed08f7cd79bab5ebd809eea25ac12). V2 deployment dpl_ESgauquPxWWvV9UWVYGoAYozCapT READY at the production alias; 58-second cloud build. Release used isolated archives verified against all 1,929 committed V2 blobs, preserving concurrent Memorandum edits/commits. Refreshed expired CLI device login; separate Vercel connector token remains unauthorized, so inspection/logs use the explicitly scoped CLI.

Reloaded live Management and Adams Staff. History PDF/CSV downloads reconcile 3 versus 2 owned baselines plus the legacy status log. Staff company report denied. Source reference clicked through to the actual request after enlarging wrapped link targets. Full Management PDF (9 pages) and Staff PDF (6 pages) include every section and journal evidence; Staff excludes colleague request/reference. All 15 full-pack layouts rendered/inspected. This inspection caught a header-only change table at a Staff page boundary; follow-up PDF preflight keeps that heading with its first row, preserves 6 pages, and was rerendered with the real authorized snapshot. Its final build/release follows this note. Both sampled production error queries returned no captured errors; not a blanket monitoring certification. Local 320px dark containment passed earlier; the production viewport tool remained 1280px in the later attempt, so do not claim a new production 320px test. Restored light theme and viewport. No real business rows reset/edited or SMS sent.

**User's latest explicit priority supersedes the earlier next-app sequence:** build Management reset controls, staff edit/update/delete where permitted, and missing back navigation across apps; then revisit Operations reports and the full Operations feature gaps (projects/tasks/todos including editing and deletion/reset); then Accounting completeness, reports and every generated PDF. Research real product behavior/UI/PDF and GitHub source, save a detailed phased plan before each app implementation. Reset is a requested feature, not an instruction to execute a live wipe during development. Use explicit scope, impact preview, application confirmation and recovery. Preserve identities, biodata, permissions, company setup and audit evidence. Financial corrections must retain balance integrity and posted-history rules. Leave effective policy history and Attendance reporting remain outstanding but are deferred behind this new priority. Cross-app audit/research has started; new reset/CRUD/navigation work is not yet delivered.
