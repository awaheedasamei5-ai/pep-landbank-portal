# Batch 5 — Test Sweep + Cross-App Sync Findings

**Apps**: Operations Tracker, Memorandum, Announcements, Chat, Notes.
**Tested**: live, both roles (Adams/agent, Management), at `http://localhost:3000`, Supabase project `sbydzrlzqxcdbudjaube`.

## Functional testing

All 5 apps render correctly for both Adams and Management, with correct role-gating (Management gets "New announcement", Operations Tracker's "Reset test data"/Deleted tab/Team workload table; Adams does not). No console errors beyond harmless HMR websocket noise.

**One false alarm, documented so it isn't re-chased**: Operations Tracker's Overview KPI tiles render with no numbers on Management's very first paint after navigation — a loading race (second read a couple seconds later shows the correct real numbers: 1 open issue, Team workload table with Adams/Elias). Same class of false alarm Batch 3 found in Leave. Not a bug.

## Security (RLS)

Checked `memos`, `memo_recipients`, `announcements`, `announcement_comments`, `announcement_reads`, `messages`, `notes`. All sound:
- `announcements` insert/update/delete correctly `my_role()='manager'` only (matches the UI only showing "New announcement" to Management).
- `memos`/`memo_recipients` correctly scoped by sender/recipient/cc (via `is_memo_sender`/`is_memo_cc_recipient` helper functions) plus manager oversight.
- `messages` correctly scoped by sender/recipient, plus a separate, correct set of group-membership policies (`is_chat_group_member`/`is_chat_group_admin`) for group chat.
- `notes` correctly owner-scoped (`owner_key = my_key()`) plus manager read access.

No hardcoded-wrong policies found. `has_permission()` testing-phase override not relevant to this batch (none of these tables route through it).

## Realtime — real bug found and fixed

`memos`/`memo_recipients`/`announcements`/`announcement_comments`/`chat_status_updates`/`chat_status_views` were all already correctly wired into `useDashboardRealtime.ts`. `messages` has its own dedicated, more sophisticated realtime hook (`useChatRealtime` in `use-chat.ts`, with reconnect/backoff and in-place cache patching rather than a blunt invalidate) — that's by design, not a gap.

**Real gap found**: `chat_message_reactions`, `chat_group_members`, and `chat_groups` were all three already in the `supabase_realtime` publication but subscribed **nowhere** in the codebase. A reaction someone else added to a message, or being added to/removed from a group, never reached an already-open Chat screen without a manual refresh. `chat_starred_messages`/`chat_conversation_settings` are correctly *not* wired — both are purely personal, per-device settings (`eq("staff_key", myKey)` on every query), never modified by another user, so there's nothing cross-user to sync.

**Fixed**: added three more `postgres_changes` listeners onto the same existing realtime channel in `use-chat.ts`'s `useChatRealtime`, prefix-invalidating `["chat-reactions"]` and `["chat-my-groups"]` on change (matching the existing TanStack Query key shapes used by `use-chat-reactions.ts`/`use-chat-groups.ts`). `npx tsc -b` clean, verified live (no console errors, Chat still renders/functions normally for both roles).

## Data quality

Checked `memo_recipients` (orphaned staff_key), `announcement_comments` (orphaned announcement_id), `messages` (sender_key not resolving to a real profile), `notes` (owner_key not resolving). Only one hit: 4 `messages` rows with `sender_key = 'system'` — this is the real "Palmstead System" bot sender (seen live in Management's conversation list posting a plot-allocation-eligibility nudge), not a data defect.

## Cross-app sync mapping — the deep part

### Chat is already the system's real cross-app notification hub

This was the single most important finding of this batch. Chat already receives real, working, auto-generated messages from multiple other apps, confirmed live in both test accounts' conversation lists:
- **Pipeline → Chat**: "Priscilla Darkoa Assan has reached 65% paid and is due for plot allocation. Review the request in Palmstead Allocations." (sent from `Palmstead System`, visible to Management) — a real payment-threshold trigger that already closes the loop between Pipeline and Allocations via a Chat notification.
- **Site Visits → Chat**: "Adams logged a site visit for Abdul waheed abdul samei on 2026-09-11..." and "...has requested a site visit for their client..." messages between agents and Management.
- **Memorandum → Chat**: "You were cc'd on a memo from Abdul Waheed..." / "New memo from Abdul Waheed..." — every memo send/cc already echoes into Chat.
- **Operations Tracker → Chat**: "Management escalated 'WORK STALLED' to you: Site boundary dispute needs your sign-off..." — issue escalations already reach Chat.
- **Pipeline (restore) → Chat**: "Emmanuel Anane has requested a restore of their pipeline." — an admin-action request already surfaces here too.

**Implication for the user's "1000 ways to sync" ask**: the real, proven, already-working mechanism for "app A's event should notify app B's owner" in this codebase is exactly this pattern — insert a `messages` row from a conventionally-named system sender (`system`/`Palmstead System`) with real `recipient_key` targeting, triggered from whatever RPC/mutation fired the event. This is a *cheap, already-proven, horizontally reusable mechanism* — any future cross-app sync that's "notify the right person when X happens elsewhere" should reuse this exact pattern rather than inventing a new one. It is also now properly realtime-complete after this batch's fix (reactions/groups were the only gaps; the base `messages` stream itself was already solid).

### Memorandum ↔ Announcements: correctly two different tools, not a gap

Memorandum (formal, addressed, one-to-one/cc'd internal letters with a reply/PDF/approval flow) and Announcements (broadcast, company-wide, commented-on notices) are genuinely different tools for genuinely different real use cases — confirmed both are real and distinct, not a naming collision or redundant silo (same category of check Batch 3 did for Staff Hub vs Sales Complaints).

### Commission → Announcements: real, working, confirmed live

Every "Commission ready: <Month>" announcement seen in both test accounts' lists is machine-generated from the real Commission app's own payout run ("Jul 2026 commission is ready to pay today — GHS 1,966 total across 4 agents... Full breakdown downloaded as a PDF"). This is a second real, working instance of the same "system event → Announcements/Chat" pattern — worth noting as deliberate prior art, not a gap.

### Notes → Memorandum: real, working, confirmed by UI copy

Notes' own subtitle states "jot something down, save it, send it as a memo, or download it" — a direct, already-built bridge from a personal scratch note into a formal Memorandum send. Not independently re-verified by actually sending one (would create a real memo), but the UI control is real and present for both roles.

### Real gap: Notes has zero linkage to any business entity

`notes` table columns: `id, owner_key, title, body, created_at, updated_at` — no `lead_id`, `client_id`, or any foreign key at all. Purely personal scratch space. **Concrete, buildable enhancement** (not built, flagged for the master plan): add a nullable `lead_id uuid references leads(id)` column plus an optional "Attach to a lead" picker in the Notes compose UI — this would let a quick thought about a specific client become visible from that lead's own Pipeline detail page (same shared-entity pattern already used successfully for payments/site_visits/contracts on the lead detail screen), instead of living only in a flat personal list a staff member has to remember to go check.

### Real gap, analysis-only per this batch's hard boundary: Operations Tracker has zero linkage to leads/clients

`op_issues` has no `lead_id`/`client_id`/similar column at all — confirmed via `information_schema.columns`. An ops task that is genuinely about a specific client's paperwork or site has no structured way to reference that lead; any such connection today can only live in free-text. **This is a real, concrete cross-app sync gap** (same shape as the Notes one above), but Operations Tracker is under active concurrent development in this same branch throughout today's sweep (its own commits — todo reminders, push overrides, device preferences — merged in mid-batch) — per this batch's explicit hard rule, **not touched, fix proposal only**: a nullable `related_lead_id uuid references leads(id)` on `op_issues`, surfaced as an optional field on issue creation/detail, and (once set) shown as a real "Ops tasks" section on that lead's own Pipeline detail page, same shared-entity display pattern as Payment History/Site Visits/Contract of Sale already use there.

## Summary of real deliverables this batch
- **Fixed**: Chat realtime gap (`chat_message_reactions`/`chat_group_members`/`chat_groups` now live).
- **Confirmed working, not a bug**: Operations Tracker loading race, Commission→Announcements, Memorandum→Chat, Site Visits→Chat, Notes→Memorandum, Pipeline(payment threshold)→Chat.
- **Flagged, not fixed** (for the master findings/phased plan): Notes has no lead/client linkage; Operations Tracker (`op_issues`) has no lead/client linkage, deliberately left for the concurrent session owning that app.
