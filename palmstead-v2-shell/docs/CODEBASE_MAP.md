# Palmstead V2 Codebase Map

Last reviewed: 2026-10-22. This is a navigation index for future work, not a substitute for reading the owner plan and the relevant implementation before editing. The V2 tree contains about 1,878 files under `src/`; much of it is the copied Plane frontend plus Palmstead's Next.js application.

## Safety and project boundaries

- Active product: this folder, `palmstead-v2-shell/`, on GitHub branch `rebuild`.
- V2 database: Supabase project `sbydzrlzqxcdbudjaube` only.
- V1 is a separate live GitHub Pages app and Supabase project. Do not edit/deploy its root files or push to `main`.
- V2 production URL: `https://palmstead-v2-shell.vercel.app`. Deployment instructions are in `docs/DEPLOY_INSTRUCTIONS.md`; read that file in full immediately before any deployment.
- Process, priorities and account-role constraints are in `docs/CONTINUE_HERE.md`. Coding conventions are in `AGENTS.md`.

## App routes and feature entry points

All authenticated application pages are under `src/app/(main)/dashboard/`. The route group `(main)` supplies the shared application shell; route-specific components live in a sibling `_components/` directory.

| App | Route | Useful entry points |
|---|---|---|
| Home | `/dashboard/default` | `src/app/(main)/dashboard/default/` |
| Operations Tracker | `/dashboard/operations` | `page.tsx`, `_components/operations-tracker-screen.tsx`, `_components/operations-command-center.tsx`, `_components/operations-work-queue-page.tsx`, `_components/my-schedule-screen.tsx`, `_components/use-my-schedule.ts`, `_components/use-schedule-meetings.ts` |
| Operations projects/issues | `/dashboard/operations/[projectId]`, `/dashboard/operations/[projectId]/issues/[issueId]` | project route `_components/project-issues-screen.tsx`, `issue-kanban-board.tsx`, `cycles-panel.tsx`, `modules-panel.tsx`, `views-panel.tsx`; issue route `_components/issue-detail-screen.tsx` |
| Operations reports | `/dashboard/operations/reports` | `_components/operations-reports-screen.tsx` |
| Operations reset | `/dashboard/operations/settings/data` | `_components/operations-reset-screen.tsx`, `_components/operations-reset-data.ts` |
| Accounting | `/dashboard/finance` | `_components/accounting-tabs.tsx`; section hooks `use-finance-{overview,payments,expenses,commission,payroll,reports,settings}.ts`; PDF modules `reports-pdf.ts`, `payroll-pdf.ts`, `commission-calculator-pdf.ts` |
| Leave | `/dashboard/leave`, `/dashboard/leave/requests`, `/dashboard/leave/plan`, `/dashboard/leave/management/*`, `/dashboard/leave/reports` | route-local clients/components plus Leave-specific service/report modules; follow plans 09–12 before changing letters/reports |
| Other implemented apps | See sidebar route definitions | `src/navigation/sidebar/sidebar-items.ts` is the source for the shell's current app list and honest “not built yet” destinations |

Before adding routes, use `rg --files 'src/app/(main)/dashboard'` and inspect the closest current route. Do not rely on memory for route names.

## Shared application layers

- **Navigation:** `src/navigation/sidebar/sidebar-items.ts` defines grouped dashboard links; app-level return/back affordances are shared under `src/app/(main)/dashboard/_components/`.
- **Shell, authentication and profile:** inspect `src/app/(main)/layout.tsx`, `src/stores/auth/`, `src/lib/supabase.client.ts`, and route middleware/guards before changing session or role behavior. The authenticated `profile.role` and `profile.key`/agent key are the basis for UI scoping; UI filtering alone is never a database security boundary.
- **Shared UI:** `src/components/`, `src/components/ui/`, and `src/styles/`. Keep the local shadcn wrappers and calendar implementation intact; customize at call sites and use semantic theme tokens.
- **Domain utilities:** `src/lib/palmstead/` holds Palmstead formatting and feature helpers. Search for an existing helper before introducing a new one.
- **Data fetching:** app routes use React Query hooks or route-local hooks around the Supabase client. Follow existing query-key, loading/error/empty, pagination, and stale-write patterns.
- **Operations' Plane-derived layer:** `src/openplane/web/services/` contains copied/adapted data services; `src/openplane/web/store/` contains feature stores; `src/openplane/web/components/` contains the adapted feature UI. Keep this layer's existing conventions where practical, while routing mutations through Palmstead's guarded Supabase RPCs.
- **Database:** `supabase/migrations/` is the V2 migration history. Inspect migrations and the live V2 schema before assuming tables, columns, triggers, policies, or RPC signatures. Never run legacy root-level V1 SQL.
- **PDFs:** shared report helpers are in `src/webnext/shared/lib/pdfReport`; report-specific PDF modules live beside their app (for example Accounting `_components/*pdf.ts`). Reuse installed jsPDF/autotable; inspect the final rendered PDF pages, not only the generated file.

## Operations Tracker file map

- App shell/navigation: `src/app/(main)/dashboard/operations/layout.tsx`, `page.tsx`, `_components/operations-tracker-screen.tsx`.
- Issue domain: `src/openplane/web/services/issue/` and `src/openplane/web/store/issue/`.
- Project domain: `src/openplane/web/services/project/` and `src/openplane/web/store/project/`.
- Cycles/modules/views: `cycle.service.ts`, `module.service.ts`, `view.service.ts`, their archive services, and `cycle.store.ts`, `module.store.ts`, `project-view.store.ts`.
- People/roles: `src/openplane/web/services/user.service.ts`, `src/openplane/web/store/member/`, and the Palmstead auth/profile store. Confirm exact identity mapping before writing authorization logic.
- Reports: `src/app/(main)/dashboard/operations/reports/_components/operations-reports-screen.tsx`; semantics, limitations and report requirements are in `docs/plans/06-operations-reports-plan.md` and the Operations follow-up plans.
- Meetings/reminders: `src/app/(main)/dashboard/operations/_components/use-schedule-meetings.ts` and `schedule-meetings-dialogs.tsx`; inspect database migrations and notification delivery configuration before claiming device/SMS reminders work.
- Reset: `src/app/(main)/dashboard/operations/_components/operations-reset-data.ts`, UI in `operations-reset-screen.tsx`, and guarded backend procedures in migrations.

## Fast investigation commands

Run from this V2 folder:

```powershell
rg -n "<feature term>|<route>|<table or rpc>" src supabase/migrations docs/plans
rg --files 'src/app/(main)/dashboard' | Sort-Object
rg --files src/openplane/web/services src/openplane/web/store
npx tsc -b
```

`npx tsc -b` is the reliable TypeScript check here; the root solution config can make `tsc --noEmit -p .` appear successful without checking the app. Before validation, read the route's plan and `AGENTS.md`; Next.js APIs in this project are version-specific, so consult the installed `node_modules/next/dist/docs/` guides before changing Next conventions.

## Current release context

The cycle/module/saved-view action slice has guarded backend routines, select-only table policies, audited writes, and passing rollback-only database checks. Its eight service/store files and migration are published to `rebuild`; the exact release copy typechecks. Production deployment is currently blocked because the Vercel connector returns a team-scope 403 and does not expose its prescribed `authorize_team_access` operation, while CLI device approval remains disabled. Do not describe that slice as live until it is deployed, hard-refreshed, and role-verified.

## How to keep this map useful

After a material route or data-layer change, update the corresponding table/entry point and release context in the same verified slice. Keep business rules and acceptance criteria in the app's plan; keep this file as the short index that gets the next investigator to the right plan and files quickly.

