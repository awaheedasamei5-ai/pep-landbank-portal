# Operations Tracker — raw duplicate of makeplane/plane, Supabase replica backend

**Status: Phase 1 of 7 in progress. This is a multi-session build — do not report
"done" on anything short of the full checklist at the bottom, per the standing
"no shallow done claims" rule.**

## What was asked

User's explicit instruction (2026-10-08, after seeing the Attendance/Leave raw
duplicate): duplicate the FULL plane frontend — UI, data structure, and
architecture, "not just the frontend without the deep layer structure" — and
build a complete Supabase replica of its backend (plane's real backend is
Django/Python, incompatible as-is). No surface-only work. Full functionality,
both frontend and backend and database and settings, tested, and fitting
Palmstead's operations, before moving to the next app.

## Real scope, measured, not estimated

`makeplane/plane` is a pnpm monorepo, not a single app:

- `apps/web` — 1,847 TypeScript/TSX files (the actual product UI)
- 11 separate `@plane/*` workspace packages it depends on: `types`, `constants`,
  `utils`, `hooks`, `i18n`, `editor` (a full rich-text editor), `services` (API
  client shaped around plane's own Django REST contract), `shared-state`,
  `blocks`, `decorators`, `codemods`
- Core data model (from `packages/types/src/`): workspaces, projects, issues
  (+ epics, intake/inbox, sub-issues, relations, attachments, links, activity),
  cycles, modules, states, labels, estimates, views (workspace + project level),
  pages (rich-text docs), dashboards, stickies, notifications, favorites,
  webhooks, API tokens, instance/admin settings, payment/billing, AI features,
  publish/public-sites.

This is an enterprise project-management SaaS, not a single screen. Matching
Attendance/Leave's pace (verify-live-then-commit each slice) is still the
right method; the SCALE per slice is just much larger.

## What Palmstead actually needs vs. what plane ships

Plane ships billing/subscription, multi-workspace SaaS admin, AI chat, public
site publishing, and OAuth app integrations — none of which serve a single
internal company (same "Remove: features that do not serve Palmstead"
principle already applied to OpenHRApp's SaaS trial gate). The "twist to fit"
pass (after the raw duplicate, per the user's own two-phase instruction) will
drop these. The raw-duplicate phase still copies them if they're load-bearing
for files we do need (e.g. don't break an import by deleting a type), but
doesn't build them out into working screens against real data.

## Phase plan

1. **Foundation packages (type-only, zero runtime deps) — IN PROGRESS**
   `@plane/types` (119 files) + `@plane/constants` (58 files) copied verbatim
   into `src/openplane/types/` and `src/openplane/constants/`, aliased via
   `next.config.mjs` `resolveAlias` + `tsconfig.json` `paths` (same pattern as
   the existing `react-router` shim for the web-next port) so their own
   internal `"@plane/types"` imports resolve unedited. `npx tsc -b` clean.
   Committed this file alongside; NOT yet pushed — see note at bottom.

2. **Logic packages**: `@plane/utils`, `@plane/i18n`, `@plane/hooks`,
   `@plane/shared-state` — still framework-light, should copy cleanly with the
   same aliasing approach. `@plane/decorators` only needed if the copied
   service layer uses its decorators.

3. **Supabase schema replica**: design real tables for the core entities
   (workspaces, projects, members, states, labels, cycles, modules, issues +
   issue relations/attachments/links/activity, views, pages) informed by
   `packages/types/src/*` field shapes — a real schema, not a guess, but
   ADAPTED to a single-workspace company (Palmstead doesn't need
   multi-tenant workspace billing/invites the way plane's SaaS does) rather
   than copied 1:1 if that would build dead multi-tenancy machinery. **This
   touches shared production infrastructure (`sbydzrlzqxcdbudjaube`) — surface
   the concrete CREATE TABLE statements for sign-off before applying**, same
   standard as the open Attendance/Leave schema question.

4. **Data layer rebuild**: `@plane/services`'s ~25 service files are shaped
   around plane's own Django REST endpoints (`/api/workspaces/...`). These get
   REWRITTEN (not duplicated — there's no Supabase equivalent to copy) against
   the Phase 3 schema, keeping the same service method signatures/shapes the
   UI layer (`apps/web`) already expects, so the UI code above them stays a
   true raw duplicate.

5. **`@plane/editor`**: plane's issue/page descriptions use a real rich-text
   editor package. Duplicate if the UI needs it for issue descriptions/pages;
   evaluate size before committing to it (it's likely hundreds of files on its
   own).

6. **`apps/web` UI surface**, in priority order matching what Palmstead
   actually tracks operationally: workspace shell/nav → projects →
   issues (list/kanban/calendar views, issue detail) → cycles → modules →
   states/labels/estimates settings → views → pages. Each gets the same
   treatment as Attendance/Leave: duplicate, wire to the real Phase 3/4
   backend, verify live signed in as a real test account, THEN commit.

7. **Twist to fit Palmstead's operations**: once the raw duplicate is fully
   working end-to-end, revisit terminology/workflow against how Palmstead
   actually tracks field/sales operations (this is explicitly phase 2 per the
   user's own instruction, not bundled into the steps above).

## Honest status checklist (update as phases complete — do not mark done early)

- [x] Phase 1: types + constants copied, aliased, `tsc -b` clean
- [x] Phase 2: utils/i18n/hooks/shared-state copied, aliased, `tsc -b` clean
      (new deps installed: clsx, lodash-es, tailwind-merge, uuid, mobx,
      mobx-utils, chroma-js, hast/mdast + remark/rehype unified toolchain,
      sanitize-html, i18next + react-i18next, @makeplane/propel; i18n's
      `keys.generated.ts` is normally produced by a `tsx` build script at
      package-build time -- ported that script to plain Node
      (`src/openplane/i18n/scripts/generate-types.mjs`) and ran it against
      the copied locale JSON since this isn't a separate pnpm package with
      its own build step)
- [ ] Phase 3: Supabase schema replica designed + applied (needs user sign-off)
- [ ] Phase 4: service layer rebuilt against real schema
- [ ] Phase 5: editor evaluated/copied if needed
- [ ] Phase 6: UI surface — workspace shell
- [ ] Phase 6: UI surface — projects
- [ ] Phase 6: UI surface — issues (list/kanban/calendar/detail)
- [ ] Phase 6: UI surface — cycles
- [ ] Phase 6: UI surface — modules
- [ ] Phase 6: UI surface — states/labels/estimates settings
- [ ] Phase 6: UI surface — views
- [ ] Phase 6: UI surface — pages
- [ ] Verified live end-to-end (staff + management) signed in as a real test account
- [ ] Phase 7: twist to fit Palmstead's operations
