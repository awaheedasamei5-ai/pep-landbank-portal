# Continue Here — Handoff for Any AI Tool

This file exists so that **any AI coding tool** working on this repo — Claude Code, Codex, GitHub Copilot, or a model routed through OmniRoute — picks up the same standing rules and project context that governed every prior decision here. Claude Code also keeps a private, session-spanning memory store outside this repo; this file is the durable, repo-committed subset of that memory a different tool actually needs. Read this in full before writing any code.

## 1. Three things named "Palmstead" — do not confuse them

| What | Where | Database | Status |
|---|---|---|---|
| **Real production app** (what staff use daily, right now) | This repo's own `main` branch, single `index.html` file, no build step, deployed via GitHub Pages at `https://awaheedasamei5-ai.github.io/pep-landbank-portal/` | Supabase `lrahgcnftetnyxunaljs` ("PEP LANDBANK LTD") | Live, real data |
| **palmstead-v2-shell/** (this folder) | `rebuild` branch of this same repo | Supabase `sbydzrlzqxcdbudjaube` | **The active deliverable — this is what you are building** |
| **web-next/** (sibling folder) | `rebuild` branch | Supabase `sbydzrlzqxcdbudjaube` (same as v2-shell) | Superseded — an earlier rebuild attempt, kept as reference only, not extended |

Never treat `web-next/`'s own implementations as "done" or build on top of them. Never assume the `PALMSTEAD` repo at `C:\Users\USER\Desktop\PALMSTEAD` is production — it isn't; `main` on this repo is.

To read real production's actual logic: `git fetch origin main && git show origin/main:index.html` (don't check it out over this working tree — `rebuild` has an entirely different structure).

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
- Deploy: `git push origin rebuild` (routine, does not go live), then `npx vercel deploy --prod --yes --scope dnm-garments` (this one does — only after a verified slice) → `https://palmstead-v2-shell.vercel.app`.

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
