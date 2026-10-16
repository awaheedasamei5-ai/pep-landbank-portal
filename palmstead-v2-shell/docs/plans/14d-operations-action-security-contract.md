# Operations actions, ownership and synchronization

## 1. Order and current state

Plan 14 remains authoritative. Operations reset/recovery and the navigation foundation are deployed; neither proves the remaining Staff actions or reports complete. This contract covers the next Operations action slice. Keep the cross-app navigation/form matrix moving alongside it; Operations reports follow the action integrity work, then Accounting.

Start with the independently confirmed unsafe comment renderer. Then inventory every current mutation and replace partial client sequences with reviewed atomic operations, close excessive write policies, expose permitted editing/deletion, and verify both sessions/caches. Do not ship new destructive controls before their database authorization works.

## 2. Research and reusable sources — 16 October 2026

- [Plane work-item lifecycle](https://docs.plane.so/work-items/create-and-manage-work-items): project contributors can edit work and delete their own items; administrators have wider authority. Archive retains finished work and its history. This is a reference for Palmstead's documented role choices, not a claim that Plane's backend exists in this port.
- [Plane role reference](https://docs.plane.so/roles-and-permissions/member-roles): project roles and workspace roles have separate scopes. Do not turn a project membership into Palmstead Management authority.
- [Plane advisory: guest role changes](https://github.com/makeplane/plane/security/advisories/GHSA-494h-3rcq-5g3c) and [cross-project membership reads](https://github.com/makeplane/plane/security/advisories/GHSA-w2vf-m9x9-mvmc): upstream source must be reviewed for actual project scoping and current permission fixes. Do not copy an older unsafe permission decorator merely because it came from an OSS app.
- The actual AGPL-3.0-only Plane service/store code is already copied under `src/openplane/`. Reuse its models and store reconciliation where sound; replace the actual Palmstead Supabase service boundaries rather than adding cosmetic buttons over stub HTTP routes.
- The existing installed **sanitize-html 2.18.0** package and typings are available. Actual upstream source has moved from the archived repository to [apostrophecms/apostrophe/packages/sanitize-html](https://github.com/apostrophecms/apostrophe/tree/main/packages/sanitize-html). Its MIT licence and installed README/source were inspected. Reuse this parser/allowlist implementation for untrusted HTML display; do not invent a regular-expression HTML sanitizer. Browser display protection does not establish server-side write validation.
- Use existing Radix shell components and plan 14b's labelled Back/Close, pending/error and unsaved-draft contracts. No protected UI primitive is changed.

## 3. Fresh actual-code/database evidence

Read-only catalog inspection used only V2 `sbydzrlzqxcdbudjaube`; no business rows were mutated. `op_projects`, `op_issues`, `op_project_members`, `op_issue_assignees` and `op_issue_comments` have public ALL policies conditioned only on non-null my_key. That allows substantially more writes than a Staff ownership model. To-do update policies permit assignee/owner/Management in both USING and CHECK, without establishing field immutability. Meeting update/delete includes assigned/assigned-by/owner/Management. Do not infer safe fields or state transitions from those policies.

Observed service defects and working pieces:

1. `issue-detail-screen.tsx` interpolates plain comment text into HTML and renders saved comment_html with dangerouslySetInnerHTML. There is no sanitizer at that sink. Escape new plain text and allowlist every displayed saved comment, including legacy content. Preserve useful paragraphs/emphasis/lists/code and safe links; block executable markup, inline events/styles and remote media.
2. `ProjectService.createProject` inserts the project, then default states, then default_state_id in separate requests. A later failure can leave a partial project. Creation must be a transaction with server-derived actor and validated defaults.
3. `IssueService.createIssue` already uses **op_claim_issue_sequence**, so do not regress or claim the old duplicate-number race is unfixed. Claim/insertion/assignment/labels/activity still span requests; related failures are not consistently checked. Review the existing sequence RPC's grants and authority as part of the full write boundary.
4. `patchIssue` updates the item, deletes/reinserts assignee/label/module joins and adds selected activity fields in separate requests. Some join errors are ignored. The entire mutation must commit or roll back, with stale-edit detection and complete audit fields.
5. `deleteIssue`/`deleteProject` directly delete rows and depend on cascade FKs. Their full affected graph, history retention and permission must be previewed. Do not expose bulk project deletion to every signed-in staff member.
6. To-do reschedule inserts a replacement and separately marks the old row rescheduled; failure can leave a duplicate. The replacement currently recreates ownership from the current caller rather than explicitly preserving all assignment/series semantics. Review the complete reschedule/recurrence graph before replacing it.
7. To-do status changes set completion/cancellation timestamps only in selected branches; reopening can retain stale terminal markers. Issue completion timestamps and state groups also need one authoritative transition rule for truthful reports.
8. `Todo` is a mapped camelCase projection; TODO_COLUMNS omits some database fields and there is no updated_at column on op_todos. Do not pretend the existing model supplies a full raw-row version for compare-and-swap. Choose a reviewed server version/read contract before stale-edit protection.

All remaining relation/cycle/module/view/member/comment/attachment/escalation services, exposed SECURITY DEFINER functions, storage policies and workers must be included in the mutation inventory before closing shared table grants. Do not break unported callers by revoking writes before their replacements are wired.

## 4. Proposed Palmstead authority matrix

Use fresh authenticated UID → active profiles row on every server mutation. Actor, names, role, audit time and ownership come from trusted records, never client profile fields. Management is global company authority. Project administration remains scoped to that project and cannot grant Management.

| Resource/action | Staff default | Management default |
|---|---|---|
| Own to-do create/edit | Own records; validated date/time/content | Own or reviewed assignment workflow |
| Assigned to-do progress | Assigned participant may update permitted progress fields | All permitted transitions |
| To-do deletion | Creator/owner only; explicit scope/series effect | Reviewed company records |
| Project create | Allowed if retained as company policy; creator gets explicit scoped authority | Allowed |
| Project settings/members | Explicit project administrator/creator; cannot promote global role | Allowed |
| Work-item edit | Authorized contributor or assigned participant, with field limits | Allowed |
| Work-item delete | Own created work with dependency/impact checks | Reviewed item graph |
| Comments | Create on authorized work; edit/delete own; immutable actor/parent | Moderation with audit |
| Meetings | Organizer edit/cancel; invitees RSVP only | Reviewed organizer override |
| Unknown/inactive/missing identity | Denied | Denied |

Validate this against current project membership, creator, lead and assignment semantics. Existing projects may have no membership rows: avoid locking Adams out of assigned work merely by adding a membership-only rule. Define private/public project reads and work-item visibility deliberately, then align reports and exports. This proposed matrix is not applied yet.

## 5. Atomic mutation design

Prefer guarded server transactions for multi-table operations. Use public SECURITY INVOKER wrappers and narrowly granted private entry functions where the existing reset pattern fits; fresh active identity, fixed search_path, explicit allowlisted fields, bounded payloads, deterministic lock order and precise errors. Audit raw DML grants and other writable functions so the UI cannot be bypassed by direct requests.

Create/update/delete operations must validate workspace/project membership, every state/label/cycle/module/parent reference, active assignees, date ranges, terminal states and related graph limits. No caller-supplied created_by, workspace, owner, sequence or audit identity changes. Define pending/error/idempotency and stale-update behaviour before changing client retries. Persist activity and join changes in the same transaction. Do not promise an update succeeded merely because the first table changed.

Keep the current atomic sequence allocator or incorporate its project-row lock into the new create transaction. Gaps after failed claims are not duplicate IDs, and old identifiers are not recycled. Prevent parent cycles and cross-project references. Completion is derived from the selected state group, and reopen clears current completion markers while retaining history.

For individual deletion, choose and document recoverable trash versus explicit permanent deletion before UI exposure. Show the record identity and related impact, preserve required audit, and keep file objects out of orphaned/unauthorized states. If permanent deletion remains, label it honestly and test only synthetic records. Management app reset remains the separate server-bound reviewed graph/recovery feature.

## 6. Reset compatibility and synchronization

Reset adapters pin reviewed columns/constraints/triggers. If those change, explicitly review and update the adapter and old recovery compatibility. Pure policy/grant/function changes must still be tested against reset preview and isolated restore; do not silently unpin schema checks. Preserve the reset functions' own fresh Management gate and bounded locks. Concurrent editing and resetting must not produce partly restored or orphaned graphs.

Client updates must reconcile React Query and Plane MobX, list/board/detail counts, schedule entries, activity and both role sessions. UI failures preserve entered text. Permission loss or deleted records get clear recoverable navigation. Reopening/restore/reset must not trigger stale notifications. No notification is sent solely to test an edit, delete or export.

## 7. Tests, sequencing and release

1. **Comment display slice:** pure parser fixtures for plain text, Unicode, paragraphs, legacy formatting, malformed markup, script/events/styles, SVG/MathML, media/embed, URL schemes and idempotence. Use React/server-safe helpers; test the actual bundled page with both roles. Never write attack payloads into company records.
2. **Mutation catalog and contracts:** all direct and function-based writers, exact role/field/state matrix, current worker interactions and complete error handling.
3. **Isolated server implementation:** synthetic projects/staff/work items/to-dos, deny anon/inactive/foreign actor/role escalation/cross-project relations; stale edits, duplicate retries, graph rollback, sequence allocation, parent cycles and terminal timestamps. Multi-connection race tests need a genuine multi-connection Postgres environment; do not infer them from PGlite alone.
4. **Client action/layer wiring:** genuine edit/update/delete controls, destructive confirmation, unsaved/pending protection, permission-aware states, keyboard and narrow screens. Preserve real existing project settings and schedule features.
5. **Both-role verification and scoped release:** full build/typecheck, focused source review, correct reports/caches, no live destructive QA, exact committed V2 snapshot, publish rebuild, read DEPLOY_INSTRUCTIONS and deploy, reload live roles, record evidence.

No server policy migration or new destructive action is implemented by this document. Next-stage research also found that `/dashboard/profile` still imports static template profile data; the provisional navigation inventory must not be treated as proof of a real Staff profile app. Address that in the later whole-app audit instead of inventing employee details.
