## 2026-10-31 System settings and identity continuation

### 31 October verified update

**Production release after this checkpoint:** PR #55 was squash-merged to V2 `rebuild` as `a07a62374471fc254619df64954ce0b8d4b7fb8b`; Vercel deployment `dpl_GM3yaBaRebqUjbf1UmSssdQRpNWA` is READY and the production alias resolves to that exact SHA. Management signed in to production and opened the eight-person roster. Adams signed in, opened personal Settings and was denied the Management roster by direct URL. No live profile edits, invites, password changes or SMS were made during production QA. The password-reset email-link journey remains unverified.

With user approval, the V2 Supabase Email provider minimum for **new passwords** was set to 12 characters; the dashboard showed 12 after save. Leaked-password rejection was attempted with approval, but the Free project remained disabled because Supabase marks it Pro-only. Do not claim that feature enabled or upgrade the plan without separate authorization.

The signed `send-auth-sms` Edge Function source was deployed to V2 as version 1 (`6aa3bc83-d1de-4ec0-9c40-3edd00cf1fc9`) and Supabase lists it ACTIVE. `ARKESEL_API_KEY` exists as a server-side secret; `SEND_SMS_HOOK_SECRET` does not. The Auth Send SMS hook and Phone provider remain disabled, so this function is dormant and no OTP or SMS was sent. The sandbox and in-app browser blocked a direct HTTP invocation, so signature rejection and provider delivery remain unverified. Configure the signing secret in Auth and the Edge Function, then test a wrong signature and a consented verified test phone before enabling Staff phone login.

The user explicitly approved publishing the V2 Settings/auth feature branch and applying the V2 permission repair. The feature branch `codex/system-settings-20261031` is published at `1bb54563a67551934f40f4c9970041ca42be3464`, based on `rebuild` at `5f514ec5aa07f7d830d5ea4d11bb39730f32e436`. Its exact Vercel preview `https://palmstead-v2-shell-72gtbigx9-dnm-garments.vercel.app` is READY. Management and Adams signed in on that preview: Management saw Settings and the eight-person Team roster; Adams saw personal Settings and was denied direct Management Team access. A 320px dark viewport had no page-width overflow. No data was edited or SMS sent during browser QA. This is not yet a V2 production source release.

Six V2 Supabase migrations are applied and verified: permission contract, active-staff identity boundary, invoker-only staff directory, 14-day invite expiry, Management profile-change audit, and verified Auth phone-to-profile sync. Rollback-only checks covered active/inactive Management and Staff, client portal and anonymous boundaries, explicit Staff deny, audit, and unverified phone rejection. The earlier approval-block notes below describe a prior checkpoint and are superseded by this paragraph. The Management Access screen remains disabled because only five legacy feature keys have end-to-end enforcement; company-wide app access is still unfinished.

Auth provider review on V2: email is enabled; Google and Phone are disabled. The user approved changing V2 Auth URLs; the Site URL is now `https://palmstead-v2-shell.vercel.app`, and the allowlist contains exactly `/auth/v1/reset-password` and `/auth/v1/oauth/callback` under that production origin. The dashboard confirmed both saved entries. CAPTCHA and leaked-password rejection are off. The password-reset screen is prepared but its email-link journey is not yet verified. The Arkesel Auth Send SMS hook remains source-only and unconfigured, and no staff account has an Auth-verified phone. Do not enable Google or phone UI until provider setup and controlled journeys pass.

The user paused Accounting and prioritized complete Staff/Management Settings, app access, onboarding, recovery, Google sign-in and Arkesel-backed phone OTP. Current isolated worktree: `work/system-settings-20261031`, branch `codex/system-settings-20261031`; initial source commit `9fc8406`, most recent local source commit `a488098` plus later Staff-menu and reminder fixes. See `docs/plans/36-system-settings-access-auth-2026-10-31.md` for the full architecture, current implementation and exact remaining work. Do not resume Accounting until this pivot is handled. Never touch V1/main.

The safe profile self-update guard was applied to V2 Supabase and rollback tested. Access, phone OTP and Google UI are behind default-off feature flags. `has_permission` on live V2 still returns true because automatic approval review rejected the permission-restoration migration. A connected GitHub upload of the settings/security code to the public repo was also rejected by automatic review. Do not bypass either rejection; request explicit approval for the concrete migration/source publication after review. No settings source was pushed or deployed. The GitHub branch ref created from `rebuild` contains no settings source. Focused auth/settings TypeScript validation passed using dependencies from the existing Accounting worktree; full build and live browser verification remain open.

Subsequent read-only audit found that inactive managers still pass `my_role()` Management checks, direct `p_profiles_ins` can create an `agent` profile outside an invitation, and anonymous users can read `staff_directory` (active staff names and email addresses) through a definer view. Source-only migrations `20261031050000_active_staff_identity_boundary.sql` and `20261031051000_lock_staff_directory_view.sql` prepare repairs; neither has been applied. The user was informed. Staff settings now has an account-menu entry; Leave and Operations SMS workers use active staff biodata at send time in local source. No live SMS or deployment occurred. Do not claim complete app access controls: only five legacy feature keys are wired, and that screen stays disabled until DB enforcement and app-by-app checks pass.

## 2026-10-28 Accounting continuation — vendor register released

V2 production `rebuild` now includes the separate vendor and bill register from PR #52, squash commit `79b8ea09077412818c418dd9b6d7e8284dbce99b`, deployment `dpl_BxniJTTv49dWUpTCQFiSd5cxNued` READY. Exact preview and production alias were checked as Management and Adams. Management created a named QA vendor, saved and submitted a GHS25 QA bill through the browser; the fixture and its events were removed, with zero vendor/bill QA rows retained. Staff saw the Finance access gate. Rollback-only DB checks covered independent vendor activation and bill approval, duplicate invoice prevention, self-approval/activation denial, Staff denial, direct table write denial and approved-bill immutability. A trigger bug discovered during QA cleanup was corrected in `20261028140000_finance_vendor_delete_trigger_fix.sql`; both event immutability triggers were confirmed enabled after cleanup. No vendor payment, vault posting, bank action or SMS occurred. Approved bills remain unsettled.

The next Accounting slice is **vendor settlement**, not another redesign of the same register. Extend the balanced vault ledger to record an approved bill obligation separately from a verified part/full payment, then add a private payment-proof attachment, reference/date, idempotent posting, overpayment/overdraft guards, reversal, and outstanding/aging views. Research and tests must preserve the distinction between approval, obligation and cash movement. The current local branch is `codex/accounting-vendor-settlement-20261028`, starting from a source tree identical to the #52 production tree; the remote squash commit is the deployment base for the next PR. `tmp/` directories remain pre-existing and untouched. Do not touch V1/main.

---

## 2026-10-28 Accounting continuation — verified releases and vendor slice

V2 `rebuild` now includes department budgets and Staff → HOD → Head of Finance request approval in production commit `33fb318a2d2fc724793c7180754fb3a52c1734a5` (#50), followed by budget/request PDF downloads in `3a0de4da6df7c4270bf09ab0088c62ac46c11bec` (#51). Exact previews and the production alias were checked. Browser QA completed a GHS100 budget / GHS25 approval chain, role isolation and PDF downloads; all temporary finance rows were removed. Approvals are commitments, not payments. No SMS or bank action occurred. The PDF sample downloads in the local Downloads folder are synthetic QA records.

The active next slice is **vendor accounts payable**: separate vendor directory and invoice review, followed by private invoice/payment evidence and actual vault settlement in a later release. Current local branch is `codex/accounting-approval-documents-20261028` at `5866dbb` plus in-progress vendor changes; its source tree matches the #51 production release before these new changes. Do not reset V2 data or touch `main`/V1. Existing unrelated `tmp/` folders remain untracked and untouched. V2 Supabase `sbydzrlzqxcdbudjaube`; Vercel `prj_gY7vGFLflbYScHn6Z6eirvVVJ1wQ`; `rebuild` auto deploys V2. Read `docs/DEPLOY_INSTRUCTIONS.md` before release. Continue the full roadmap in `docs/plans/16-accounting-management-system-2026-10-27.md`; do not treat the narrow release as the complete Accounting app.

---

## 2026-10-27 Accounting management rebuild — current release state

The governing scope is `docs/plans/16-accounting-management-system-2026-10-27.md`, which deliberately goes beyond this handoff and the older Accounting blueprint. Two V2 `rebuild` releases are live: `879618bf229f90d2d0f56b9cf8adfb8731351440` (#46) links active profiles to payroll payees, adds setup indicators and prevents empty/nonpositive payroll signoff; `3e1eccc724d08a34c435b55106fdc64c4f36eccb` (#47) adds Management department and scoped finance-role setup with historical assignments and Staff denial. Both exact previews and production alias were verified with Management and Adams. The V2 Supabase migrations are applied. Eight active profiles are linked to payroll, with zero salary components, bank details, payroll runs, departments, staff-department assignments or finance role assignments created by this work. Rollback-only DB authorization checks left zero QA rows. No real payment or SMS was sent.

The next two releases also reached production: `e955eb4ba83d632cc1780c81b1e38eca64696a86` (#48) introduced guarded bank/cash vaults, a balanced immutable opening/transfer/reversal ledger and a Vaults UI; `57b2f2f87250c0cece2081dac2664c22ecfb02e4` (#49) fixed stale browser sessions that could make a saved Management shell call treasury RPCs anonymously. Both exact previews and production were checked as Management and Adams. The vault migration's rollback-only checks covered balanced opening → transfer → reversal, duplicate retry, overdraft, invalid reversal and role denial. The production alias is READY at `57b2f2f`; there are **zero** live vaults, journals, ledger lines, finance roles and departments. Management must set these up from real records. This app records verified movements; it does not initiate a bank payment.

Next Accounting work: versioned department budgets and the HOD → Finance approval chain, separate vendor payables, payroll settlement and the sample-shaped bank instruction/payslip PDFs, staff transport, and complete filtered reports. Also add private evidence uploads, bank reconciliation and legacy payment/expense cutover before treating vault balances as company cash truth. Do not infer real balances from legacy client payments or expenses, and do not mark approved requests as paid. The active local continuation branch starts from production `rebuild` at `57b2f2f` as `codex/accounting-budget-workflow-20261027`; unrelated untracked `tmp/` directories are pre-existing and must be left alone. V2 Supabase is `sbydzrlzqxcdbudjaube`, Vercel project `prj_gY7vGFLflbYScHn6Z6eirvVVJ1wQ`; never touch V1 `main` or its database.

---

## 2026-10-23 Operations reports release and next priorities

The Operations Reports analytics/comparison/export slice has been implemented and verified on the exact current-base Vercel preview. Release candidate commit `c5722976bf7b204a680e0768fdcb9386b18d9a4b` is on `codex/operations-reports-release-current` (parent `ed8f6ad`, current `rebuild` at verification). Management and Staff live preview checks, CSV exports, A4 PDFs, typecheck, and 10/10 report model tests passed. Management PDF pagination was corrected so workload and issue register share the final page. **Production merge/deployment and fresh production-role checks are the remaining immediate step.** See the verification addendum at the top of `docs/plans/14i-operations-reports-analytics-comparison-plan.md`.

Next, per the user’s latest request: research and implement the Operations schedule/daily planner with reliable due/missed reminders for staff when the app is closed; then redesign client receipts and implement monthly-plan due reminders and payment thank-you messages with secure receipt links; then close the cross-app client/payment/pipeline/allocation/inventory sync gaps. Start by reading the existing calendar, finance, client, allocation and pipeline plans and source, inspect the V2 Supabase schema/RLS only, and research the current push/SMS limits and provider configuration before coding. Preserve the user’s earlier requirement for a phase plan, real source references and separate Management/Staff tests. Do not send any live SMS while testing.

---

# Continue Here — Handoff for Any AI Tool

## 2026-10-22 release-path correction

Vercel's project API confirms the user's authorized GitHub integration: production branch `rebuild`, root `palmstead-v2-shell`, team `dnm-garments`, project `prj_gY7vGFLflbYScHn6Z6eirvVVJ1wQ`. A rebuild push now deploys V2 production automatically; historical source-only-push statements below are superseded. Verify a slice before pushing, then verify its exact READY deployment and production behavior. Read the current notice in DEPLOY_INSTRUCTIONS. Never touch main/V1. The 14m verification plan records the current login/PDF repair boundary.

## Latest active request — 2026-10-16

**Latest Operations release:** guarded project lifecycle and Management project recovery are published through `eaed8fb` and deployed READY as `dpl_5NvW6Ws7mBfj2jmi5DBmZ4wTMHLV`. Project create is atomic; update is role/stale guarded; delete is Management-only archive; the Deleted view now restores projects and work items. Live Management and Adams checks passed without changing business data, and the Management project settings page had no horizontal page overflow at 360 px. Adams project/state/label controls are read-only with mutation actions absent. Evidence: `docs/plans/14g-operations-project-actions-verification.md`. Next: replace legacy direct state/label writes with guarded audited server actions, then cycles/modules/views and the Operations reports programme. Preserve concurrent work.

**Operations recovery release:** Management now has a responsive **Deleted** tab in Operations with searchable archived work, recoverable Restore confirmation and empty state. Staff do not see the tab and a direct `?view=archive` URL shows the Management access gate. The isolated release typecheck and Vercel cloud build passed; deployed READY as `dpl_CPRAF8TLDoV8CuBu2oWDA8H4JBkn` at the production alias. Live Management and Adams checks passed without restoring or changing any business record. Source commit follows this note. Continue the remaining Operations mutation contracts, then Operations reports. Preserve concurrent Chat work.

Operations guarded issue actions are now **published as `6678c41` and deployed READY as `dpl_6VnQ958h7L3FUDn1gh84AbxsCSDM`**. The issue detail now uses guarded RPCs for field edits and Management assignment changes, enforces stale-write/reference/date/parent-cycle checks, writes activity evidence, and exposes Management-only recoverable Delete/archive with active-child protection. Management and Adams were verified live without mutating business data; 22 isolated database checks and the exact Vercel production build passed. Full evidence and bounded limitations are in `docs/plans/14f-operations-issue-actions-verification.md`. Next: build the Management archive/recovery surface, then port the remaining Operations mutations before narrowing legacy direct-write policies and returning to Operations reports. Preserve concurrent Chat work.

The user now prioritizes Management test-data reset/recovery, permitted Staff edit/update/delete and missing Back controls across apps; then Operations reports/completion; then Accounting workflows/reports/all PDFs. Follow `docs/plans/14-management-reset-actions-navigation-and-app-completion.md` for the current order. The first Operations reset slice was published as `9553ebe` and deployed READY as `dpl_52P3acMf7rFQRpMGES6MRTe6qeqA`; exact migrations, 55 isolated checks, live role/preview checks and limitations are in `docs/plans/14a-operations-reset-verification.md`. No live data reset was performed. Next: cross-app return navigation and Operations action/security contracts. Do not mistake the earlier “next” ordering below or a completed Leave slice for completion of this programme. Preserve concurrent Notes/Memorandum/Chat work and stay within V2/rebuild.

Operations comment display slice is now **deployed READY as `dpl_GBxkxuDmQzMQ1BDYyHBfHzz2Q8Ub`** (source `4df321f`; production snapshot plus the five comment-slice files). Management and Adams were verified on the live issue; empty submit disabled, no comment posted. Build/test details and limits: `docs/plans/14e-operations-comment-verification.md`. Continue with the Operations mutation/security contract; this did not solve server authorization or CRUD. Preserve concurrent Chat changes.

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
## 2026-10-27 current priority: Accounting management rebuild

The user's latest request supersedes the narrow earlier Accounting blueprint. Read `docs/plans/16-accounting-management-system-2026-10-27.md` before further Accounting work. It records the researched finance truth model, bank/cash vault and double-entry architecture, versioned department budgets, HOD → Finance approval chain with direct-route exceptions, separate vendor payments, staff transport targets with variable exact-sum weekly allocations, payroll/bank-instruction design based on the user's private September sample, roles, RLS, reports and phased verification. Do not copy the sample's bank accounts or salaries into source control. Do not treat the plan as implemented. V2 project and `rebuild` branch only; never touch V1 `main` or its database.

Immediate implementation slice in progress: migration `20261027104045_finance_payroll_profile_sync.sql` has been applied to V2 to auto-link active staff to `payroll_staff` without inventing salary or bank data. Initial read-back: 8 eligible active profiles, 8 linked payees, zero salary components and zero bank details. Payroll roster UI now shows setup gaps and lets Management edit payee details; typecheck has passed. This slice still needs authorization/trigger verification, exact preview browser checks, and V2 release/production read-back before it can be called delivered. Later vaults, approvals, vendors, transport and reporting remain unbuilt. Preserve user data; never execute a reset while implementing.

The previous Operations slice is complete: task-specific device alert settings and overdue-task guard merged as PRs #44/#45; exact V2 production deployment `dpl_GJ1WVm1pJKfi5FCuQebExvYxwujd` READY, source `3d044baab2e7b2df1426b7e6b43df41eba1c50a9`, Management and Staff verified. Actual handset delivery with page closed remains unverified without an opted-in device. Continue Accounting from plan 16; do not repeat the Operations slice.

---

