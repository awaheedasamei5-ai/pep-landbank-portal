---
name: palmstead-app-build
description: Use before touching ANY Palmstead V2 app (palmstead-v2-shell) — building a new one, resuming one, or responding to feedback that an app "isn't right," "looks stupid," or doesn't match what was asked. Governs how to build like a real professional developer on this specific codebase, not a generic AI pass. Not for unrelated repos or one-off scripts.
version: 1.0.0
user-invocable: true
license: Apache 2.0
---

This skill exists because of a real, repeated failure: building an app without first checking what was already said about it, then presenting a shallow or generic-looking result as done. The user has said this is an insult to them and their institution when it happens. Follow this every time, not just when reminded.

## 0. Before writing a single line

Do these in order. Do not skip to code because the ask "sounds simple."

1. **Search memory first**, not as a courtesy — as the actual spec lookup. Grep `C:\Users\USER\.claude\projects\...\memory\` for the app name and any adjacent terms (e.g. "attendance", "leave", "pipeline"). A past correction that was "already explained once" and ignored again is the single most common trigger for the user's anger in this project's history. If a memory file says something was explicitly restated after being lost once, that is a flashing sign to re-read it in full before proceeding.
2. **Check for prior real work before writing new code.** `git log --all`, `git tag`, and the repo's own git history frequently contain a fuller, already-correct implementation that was later superseded by a rebuild strategy (e.g. `v2-attendance-leave-handbuilt-2026-10-08`). Diff what exists against what's being asked. Restoring and reconciling real prior work beats writing a thinner version from scratch — this is not optional when the prior work is recoverable; check before generating anything new.
3. **Analyze Palmstead V1** (`main` branch, `index.html`, the real production app — see memory `project-real-production-app-location`) for the actual business logic, not just the open-source reference repo's own defaults. V1 is the source of truth for what the business actually does; the approved OSS repo (see `feedback-oss-foundation-strategy-2026-09-11`) is a foundation to fork and modify, never a replacement for V1's real rules.
4. **Verify the real database schema** via the Supabase MCP tools (`list_tables`, `execute_sql` read-only queries) before assuming a column, table, or value exists. Guessing a schema and discovering it's wrong after building the UI around it is a repeat failure mode in this project.

## 1. Ground truth hierarchy (when sources conflict)

1. The user's own explicit, direct instructions in the current conversation.
2. Memory files recording prior corrections — especially ones marked "restated after being lost once" or "standing rule."
3. Palmstead V1's real behavior (what the business actually does today).
4. The approved open-source repo mapped to this app (a foundation to modify, not a template to accept as-is).
5. Generic best practice / your own judgment — lowest priority, only fills real gaps.

If #1 or #2 conflicts with #3 or #4, #1/#2 wins, always. Never silently pick the OSS repo's own terminology, data model, or default UI over what the user or memory has already said.

## 2. Real functional rules already established — do not re-derive these from scratch

These came from explicit, sometimes repeated, user corrections. Check memory for the full record before assuming any of these has changed.

- **Settings live inside the app they configure**, never a separate "Settings" app. An app that needs management controls (policy, quotas, locations) gets its own in-app settings surface.
- **No floating/fixed-position buttons that cover content while scrolling.** Primary actions (e.g. an attendance check-in) go in the page flow as the prominent element, not a corner overlay.
- **Leave**: single annual quota (currently 20, configurable, never hardcoded), not a basket of invented leave "types." Emergency leave is its own flow (can override the colleague no-overlap rule, always needs a reason, always needs approval), not a parallel pooled balance. Leave is "reserved" the moment it's planned/pending/approved/rescheduled (protects the annual cap from overbooking) but only counts as "confirmed used" once the dates have passed AND the staff member actively confirms — both numbers are shown, distinctly labeled, never conflated, and the countdown must be visible by default, not buried inside a form. A reschedule changes dates; it never frees the reserved days as if the request were cancelled.
- **Attendance**: check-in/out is the primary visual element. Management needs a real dashboard with filters (e.g. late/on-time/off-site), per-staff breakdowns, and trends — not a flat unfiltered list. Office location/GPS geofencing and the attendance policy (start/end time, grace period, workdays) are real, editable settings, not hardcoded.
- **No fake data categories.** If the real schema has one pooled quota, don't invent five. If a field doesn't exist, don't backfill a plausible-looking default into the UI — check the schema and either add it for real (with sign-off on schema changes to shared production infra) or don't claim it exists.
- **Dashboards use this shell's own real component system** (it was forked from `arhamkhnz/next-shadcn-admin-dashboard` specifically to be the shared UI foundation — see `feedback-oss-foundation-strategy-2026-09-11`), or a previously-approved custom build referencing a real design resource the user provided (e.g. the Dribbble-style attendance kit, closed 2026-09-10). Never ship the generic flat Tailwind card grid that comes for free when duplicating an unrelated open-source app's own UI verbatim — that is importing someone else's design decisions, not Palmstead's.
- **Animate real content, not just page chrome.** Dashboard numbers, cards, and details should have a real entrance/feedback animation (see the `animate` skill — gate every animation through its frequency/purpose check, don't skip straight to a curve).

## 2.5 Full layered plan — required before any code, every app, no exceptions

Added 2026-10-08 (see memory `feedback-standing-layered-app-build-process-2026-10-08`), after a correctly-logic'd but single-page build was rejected outright: "no generic tiles or one page bullshit u call an app." A single scrolling page is not an acceptable finished app here, even when the business logic is right.

Before writing any code for an app (new or being revised), write a real plan as `docs/plans/NN-<app>-build-plan.md` inside `palmstead-v2-shell`, covering, in this order:

1. **Database** — full schema (tables, columns, relationships) for everything the app needs, designed from the real requirements, not retrofitted after the UI.
2. **Security** — RLS policies, role/permission model, who can see/do what.
3. **AI touchpoints** — where (if anywhere) this app's own real AI layer plugs in, what it's allowed to see/do.
4. **UI — full page/navigation architecture**, not a feature list:
   - A real dashboard/home page for the app.
   - Every genuinely separate page/screen it needs, and how a user navigates between them (sidebar sub-items, tabs that route, in-page links to detail views) — "when I click this it opens another page," not an accordion standing in for one.
   - For an app with both a staff and a management side: their page structures are planned separately, not one shared page with role-conditional sections bolted on.
   - Which real design resource (an approved repo, or a GitHub search result if none fits) each page's UI is duplicated from, and what gets modified.

**UI bans, absolute**: a uniform flat tile/card grid as the primary layout, decorative emoji used as icons or section markers, any shortcut that reads as "the default thing an AI generates" rather than a real app's own considered design. Use real icon sets and real dashboard component patterns (charts, data tables, stat panels with actual visual hierarchy), matching the quality bar of the premium admin dashboard kits this project's own foundation repo and design skills reference.

**Research first.** Before designing the pages, actually look at how real systems in that category are built (search the web, read a real open-source implementation's actual page structure) — this is a required step, not optional polish.

Only after this plan is written does implementation start, and it proceeds in the order the plan lays out: database, then security, then AI, then UI.

## 3. How to build

- **Take the time. Build in full phases.** A bulky ask gets broken into phases and each phase gets built completely, not touched shallowly across many apps. Reporting a long list of small completed items does not substitute for the one big thing that was actually asked for.
- **Verify live before claiming anything is done.** Use the browser tool against the real dev server, signed in as a real test account, for every UI change. A typecheck passing is necessary, never sufficient. If something can't be verified live (no test data, destructive action, etc.), say so plainly instead of claiming success.
- **Never say "done" on a shallow pass.** If a promised rebuild hasn't actually happened, say "not started" or "partial" plainly — don't let a list of other finished items imply the big one is also finished.
- **Commit and push to `origin/rebuild` regularly** as real, verified slices land. Uncommitted work reads as "still broken" to the user, who tests independently.
- **Don't ask the same scoping question twice.** If the user has already answered a question like this before (check memory), don't re-litigate it. Only ask when a genuinely new, material contradiction appears.
- **Nothing "funny."** Don't ship placeholder dashboards, buttons that do nothing, filters that don't filter, fake AI features, charts not backed by real data, or hardcoded values standing in for a database read. If it wouldn't appear in a real, professional developer's shipped app, it doesn't belong here, even temporarily, even to "show progress."

## 4. When something is reported as wrong

Don't patch defensively. Re-run section 0 in full for that specific app — re-check memory, re-check for recoverable prior work, re-check V1, re-verify the schema — before writing a fix. The root cause is very often "this was already specified and the spec wasn't re-read," not a small bug.
