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
   **Scope correction (measured, not estimated):** `apps/web` doesn't call
   `@plane/services` directly — it goes through its own 78 MobX store files
   (`apps/web/store/`, e.g. `store/issue/` alone has 6 subdirectories:
   archived/cycle/helpers/issue-details/module/profile/project/project-views/
   workspace/workspace-draft). Rewriting `@plane/services` against Supabase
   is still the right layer to target (keeps the store layer UNTOUCHED,
   true raw duplicate), but "the data layer" is two layers deep, not one —
   both need to exist and agree on shape before any screen renders real data.

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
- [x] Phase 3a: Supabase schema replica DESIGNED — see
      `docs/plans/03-operations-tracker-schema-draft.sql`. 17 tables
      (workspaces/projects/project_members/states/labels/cycles/modules/
      module_members/issues + 7 issue-relation tables/activity), grounded in
      the real copied type shapes, RLS + realtime publication included.
      Verified against the live `sbydzrlzqxcdbudjaube` schema before writing
      the final version — caught and fixed a wrong column name
      (`profiles.key` doesn't exist; the real column is `profiles.agent_key`,
      confirmed via `my_key()`'s own definition) and confirmed the `op_*`
      table-name namespace is free. NOT YET APPLIED — needs sign-off (just the
      seed workspace name is a placeholder; everything else is ready).
- [x] Phase 3b: schema APPLIED to production (migration
      `operations_tracker_schema_replica`). Purely additive -- 17 new `op_*`
      tables, nothing existing touched. Verified after apply: 17/17 tables
      present, 17/17 RLS policies created, 1 seed workspace row
      ("Palmstead"), zero security advisories on any `op_*` table.
- [x] Phase 4a: the REST of `apps/web`'s own data layer raw-duplicated --
      `store/` (full MobX store tree, ~75 files), `services/` (53 files,
      still axios/Django-backed), the real `@plane/services` base package
      (58 files, `packages/services/src/`), plus the small `hooks/`/`lib/`
      cluster the store layer actually needs (`use-multiple-select`,
      `store-context`, `local-storage`). Copied into
      `src/openplane/web/{store,services,hooks,lib}` and
      `src/openplane/services/`, aliased via `next.config.mjs`
      `resolveAlias` + `tsconfig.json` `paths` as `@openplane-web/*` and
      `@plane/services` (same pattern as Phase 1/2). `npx tsc -b` clean
      against this project's strict config -- installed `axios` and
      `mobx-react@^9` (pinned below `mobx-react@10`'s `mobx@7` peer dep,
      since this repo is on real `mobx@6.16.1` from Phase 2).
      **Deferred, explicitly, not silently dropped**: Power K (command
      palette) and the Gantt/Timeline view -- `store/base-power-k.store.ts`,
      `store/timeline/`, `store/issue/issue_gantt_view.store.ts` -- and
      Pages (rich-text docs, needs the real `@plane/editor` package,
      hundreds of files on its own, same as Phase 5 already flagged) --
      `store/pages/`. All three are outside Phase 6's own priority order
      (workspace -> projects -> issues -> cycles -> modules -> settings ->
      views -> pages) and nothing else in the copied tree needed them once
      removed from `root.store.ts`'s composition (confirmed via grep before
      cutting, not guessed).
      **Still axios/Django-shaped, not yet real**: all 53 `services/*.ts`
      files still call `/api/workspaces/...` endpoints -- they raw-duplicate
      cleanly and typecheck, but nothing in them talks to Supabase yet.
      That rewrite (Phase 4b below) is the actual unblocking work; this
      checkpoint is "the data layer exists and compiles," not "the data
      layer works."
- [x] Phase 4b: rewrote the smallest closed set of service files' real
      methods against the applied `op_*` schema -- `services/
      workspace.service.ts` (`userWorkspaces`/`getWorkspace`/
      `updateWorkspace`; `createWorkspace`/`deleteWorkspace` throw on
      purpose, Palmstead is single-company), `services/project/
      project.service.ts` (full CRUD + `checkProjectIdentifierAvailability`
      + `updateProjectUserProperties` simplified to a direct `sort_order`
      column patch -- plane's own per-user view-prefs table doesn't exist
      here), `services/project/project-state.service.ts` (full CRUD +
      `markDefault`), `services/issue/issue_label.service.ts` (full CRUD).
      New `src/openplane/web/lib/palmstead-adapters.ts` translates between
      `op_*` rows / the real `profiles` table and plane's own TS shapes
      (`IWorkspace`, `IProject`, `IState`, `IIssueLabel`) -- SaaS-only fields
      plane expects (owner, role, total_members, url) get explicit, flagged
      fill values, never fabricated as if read from a real table. All other
      methods on these 4 files, and all ~49 other service files, are
      untouched/still axios-shaped -- non-functional until their own
      screen's turn.
      **Verified live**, not just typechecked: built a first real screen,
      `src/app/(main)/dashboard/operations/` (NOT yet linked from the
      sidebar -- `sidebar-items.ts`'s `operations-tracker` entry stays on
      `NOT_BUILT_YET`, a bare project list isn't the real experience asked
      for). Round-tripped through the actual raw-duplicated MobX store
      (`workspaceRoot.fetchWorkspaces()` -> `projectRoot.project.
      fetchProjects()`) against the real `sbydzrlzqxcdbudjaube` project:
      inserted a real test project via direct SQL, confirmed it rendered
      live in the browser through the full store/service/Supabase chain,
      then deleted it. Zero console errors. `npx tsc -b` clean.
- [ ] Phase 5: editor evaluated/copied if needed
- [x] Phase 6: UI surface — workspace shell (minimal: `fetchWorkspaces` wired, no settings UI yet)
- [x] Phase 6: UI surface — projects (list + create, `/dashboard/operations`)
- [~] Phase 6: UI surface — issues (list + create only, `/dashboard/operations/[projectId]`) —
      rewrote `services/issue/issue.service.ts`'s `createIssue`/
      `getIssuesFromServer`/`retrieve`/`patchIssue`/`deleteIssue` and
      `services/issue/issue_archive.service.ts`'s `archiveIssue`/
      `restoreIssue` against `op_issues` + `op_issue_assignees`/
      `op_issue_labels`/`op_issue_modules`. `getIssuesFromServer` is a
      deliberate simplification: returns every non-archived issue for the
      project UNGROUPED (`grouped_by: ""`), ignoring plane's own group_by/
      order_by/cursor params — real data, just not paginated/grouped the
      way plane's Django backend would; kanban/grouped views are still
      open. `palmstead-adapters.ts` gained `toPlaneIssue`/`OpIssueRow`;
      `attachment_count`/`link_count` stay 0 (not yet computed, flagged in
      a comment, not fabricated) while `sub_issues_count` is a real grouped
      count. **Verified live**: created a real issue through the UI
      (`OPS-1`, real sequence number from `op_projects.
      next_work_item_sequence`), confirmed it round-tripped through the
      actual plane `ProjectIssues`/`IssueStore` MobX classes, zero console
      errors, then deleted the test project (cascaded the test issue).
      `npx tsc -b` clean. Issue DETAIL screen, kanban/calendar views,
      cycles, modules are still open.
- [ ] Phase 6: UI surface — cycles
- [ ] Phase 6: UI surface — modules
- [ ] Phase 6: UI surface — states/labels/estimates settings
- [ ] Phase 6: UI surface — views
- [ ] Phase 6: UI surface — pages
- [ ] Verified live end-to-end (staff + management) signed in as a real test account
- [ ] Phase 7: twist to fit Palmstead's operations
