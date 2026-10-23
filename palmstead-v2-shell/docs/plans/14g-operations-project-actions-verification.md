# Operations project actions and recovery verification

Date: 2026-10-16

## Released scope

- Atomic project creation now creates the project, five starting states, the default state and creator membership in one server transaction.
- Project edits use a guarded server function with stale-write detection and audit evidence.
- Project deletion is a Management-only recoverable archive action. It preserves project work.
- Management can see archived projects in the Operations **Deleted** area and restore them.
- Staff project settings are read-only unless the staff member is the project creator or lead. Adams cannot save/delete projects or change states and labels.
- Project settings rows collapse without horizontal page overflow on narrow screens.

## Database and source evidence

- Migration: `supabase/migrations/20261016212000_operations_project_actions.sql`
- Source commit: `c6d9ede4ff60f43b7f1ca7f670f23180272b9fdd`
- Staff settings correction: `fb680affd516ae338aa779f9db9b0ff49ddaff6b`
- Project recovery UI: `eaed8fbecd32fa9779b039287ecc82e92b6c4a4e`
- Rollback-only database checks covered Management update, Staff archive denial and atomic create with five states and one project administrator. The temporary project was rolled back and does not exist.

## Build and production evidence

- Exact isolated release TypeScript check passed.
- Vercel cloud build compiled, type checked and generated all 87 routes.
- Production deployment: `dpl_5NvW6Ws7mBfj2jmi5DBmZ4wTMHLV`
- Production alias: `https://palmstead-v2-shell.vercel.app`
- Management live check: project fields enabled; Save project, Delete project, state and label controls present.
- Adams live check: project fields, states and labels disabled; create/save/delete controls absent.
- Management Deleted view loaded the combined project/work-item archive and its real empty state. No production project was archived or restored for QA.
- Adams direct `?view=archive` access showed the Management access gate and no restore control.
- Management project settings at a 360 px document viewport had equal body/root scroll width and viewport width; no horizontal page overflow.

## Boundaries and next work

- State and label mutations still use older direct table services. The UI role leak is closed, but server-side guarded RPCs and audit coverage remain the next security slice.
- Cycle, module and view mutation contracts remain legacy.
- Operations reports remain a separate programme and are not complete.
- No live business data was edited, archived or restored during production verification.

