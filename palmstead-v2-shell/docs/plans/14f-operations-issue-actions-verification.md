# Operations issue actions — verified release

**Date:** 2026-10-16  
**Source:** `6678c413b983a596511f6feaaba8f670ccbcd135` on `rebuild`  
**Production deployment:** `dpl_6VnQ958h7L3FUDn1gh84AbxsCSDM`  
**Production URL:** `https://palmstead-v2-shell.vercel.app`

## Delivered scope

This slice replaces direct client writes for the issue detail screen with guarded database actions. It covers editing, assignment changes, recoverable deletion, restoration support, stale-write detection and audit evidence.

- Active staff can edit ordinary fields on work items they are allowed to see.
- Management can change assignees and can use the visible **Delete** action.
- Delete is a recoverable archive action. It never performs a hard delete.
- An issue with active sub-items cannot be archived until those sub-items are moved or archived.
- The server rejects stale updates by comparing the last known `updated_at` value.
- Parent changes reject self-parenting, descendant cycles and inaccessible parents.
- Project changes reject inaccessible projects.
- Every accepted update, assignment change, archive and restore writes an operations activity record.
- The returned server row replaces the local store row so a second edit uses the new concurrency token.
- Staff cannot change assignees. Users without edit capability receive a read-only screen.
- Existing Back to Project / Back to Operations navigation remains available.

## Database and security

Migration `20261016165442_operations_issue_actions.sql` is applied to V2 Supabase project `sbydzrlzqxcdbudjaube`.

Public RPCs are `SECURITY INVOKER` wrappers. Private implementation functions validate the authenticated active actor and expose only the required public calls. Anonymous execution was revoked, including the legacy sequence-claim function.

The broader Operations schema still contains legacy direct-write policies and callers. Those grants were not removed in this bounded slice because every remaining mutation surface must first be moved to guarded actions. The new issue-detail path no longer relies on those direct writes.

## Automated verification

`scripts/qa/operations-issue-actions.mjs` passed **22 isolated PostgreSQL checks**. The suite covers:

- Management and assigned-staff capabilities.
- Ordinary staff field edits.
- Management-only assignment changes.
- stale-write rejection.
- invalid date ranges.
- inaccessible project references.
- parent self-reference and descendant-cycle rejection.
- active-child archive blocking.
- archive and restore behavior.
- audit events.
- anonymous and inactive-user denial.

The exact release stage passed `npx tsc --noEmit`. Vercel's production build compiled successfully, completed TypeScript validation and generated all 87 application pages. The shared working folder separately contains an unrelated unfinished Chat type error (`forwardTargets` in `chat-screen.tsx`); the release stage intentionally excluded that concurrent work.

## Live role verification

Production was checked with the Management and Adams staff accounts without changing business data.

**Management**

- The Operations dashboard loaded live data.
- An issue detail loaded with editable fields and enabled assignee controls.
- Delete was visible.
- The confirmation explained recoverable archive behavior and the active-sub-item rule.
- The confirmation was cancelled; no issue was archived.

**Staff**

- The same assigned issue loaded after sign-out/sign-in and after a hard reload.
- Ordinary editable fields remained available.
- Delete was absent.
- Assignee controls were disabled.
- Back to Project remained visible.

The production alias serves the referenced JavaScript asset as `200 application/javascript`. A fresh in-app browser tab recorded two HTML responses for that asset during the deployment handoff, while the issue screen still completed and direct production checks returned the correct asset. This is recorded as transient deployment/browser evidence, not as a failed application route. The one-off deployment URL is Vercel-protected and correctly returns an authentication page when fetched without its protection session.

No issue, project, comment, assignment or other business record was changed during live verification.

## Advisor findings and next work

The new functions do not appear in Supabase's anonymous security-definer warning. Existing project-wide advisor findings remain, including the `staff_directory` security-definer view, legacy anonymous-executable security-definer functions and multiple permissive-policy/performance warnings. They predate this slice and need a separate controlled hardening programme.

Next Operations work should add a Management archive/recovery screen, then continue porting remaining project, cycle, module and work-item mutations to the guarded contract before narrowing the legacy direct-write policies. Operations report completion remains after the action/security contract in the user's requested order.
