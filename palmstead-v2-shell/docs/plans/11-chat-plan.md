# Chat — Implementation Plan

## Real V1 logic (verified directly, `main` branch `index.html`)

V1 already has a real, extensive internal messaging system backing both a dedicated Chat app and cross-app notifications (task handoffs, payment approvals, birthday messages, PDF shares) — all through one shared `messages` table and `apiSendMessage`/`apiLoadMessages`/`subscribeToChat`. This is real 1:1 direct messaging: `sender_key`/`sender_name`, `recipient_key`, `body`, `read`, optional `attachment_data`/`attachment_type`/`attachment_name` (files shared in-thread), `kind`/`ref_type`/`ref_id` (linking a message to the record it's about), `reply_to_id` (threading). Realtime via `subscribeToChat`.

## Database and security — already exists, verified live, no changes needed

`messages` already exists in the live `sbydzrlzqxcdbudjaube` project with V1's exact schema and is already in the `supabase_realtime` publication. RLS, verified via `pg_policies`, is already correct: a user sees messages where they are sender or recipient; only the sender can insert (as themselves) or delete; only the recipient can mark a message read. This is a fully real, production-ready backend — this app is UI-layer work only.

## UI — real clone from this repo's own already-vendored chat example

First attempt cloned `jakobhoeg/shadcn-chat` (1,621 stars, a real purpose-built external kit) — correct in spirit, but wrong resource: this repo already has a full, real, more polished chat example vendored at `src/app/(main)/chat/` (sibling to the equally-real `mail/` example Memorandum was built from), using this project's own `Message`/`Bubble`/`MessageScroller` primitives (`src/components/ui/message.tsx`, `bubble.tsx`, `message-scroller.tsx`) rather than an external dependency. Per the same standing rule that corrected Memorandum's first pass — check this repo's own already-integrated resources before reaching outside it — the external clone was discarded in favor of properly cloning and editing the real local one:

- `chat-conversation-list.tsx` — cloned from the local example's own file, `Conversation` replaced with the real `ChatThread` (derived from the live `messages` table), presence/online badge and Open/Snoozed/Closed tabs/Pin/Filter dropped (no real backing state for those in this schema — left out rather than wired to nothing, per the standing rule against fake controls).
- `chat-thread.tsx` — cloned from the local example's own file, same real `Message`/`Bubble`/`MessageScroller` composition; Call/Tag/Snooze/Block/copy-email actions, reactions, and the Reply/Internal-note tab split dropped for the same reason.
- `chat-screen.tsx` — cloned from the local example's own `chat.tsx`, same real responsive grid/slide-transition pattern for collapsing to one pane on mobile; the contact-profile side panel dropped (no real contact-detail data for an internal staff DM).

## Architecture

**Route**: `/dashboard/chat`, replacing the `NOT_BUILT_YET` sidebar entry.

**Threads are derived, not stored**: there is no separate `chat_threads` table — a thread is just every message where the signed-in user is sender or recipient, grouped client-side by the other party. The real security boundary is the RLS policy on `messages` itself (already correct); grouping is presentation only, matching how V1 already treats this data.

**Layout**: two-pane — a thread list (every staff member with history, most-recent-message first, unread badge) and the active conversation (`ChatMessageList` of `ChatBubble`s + `ChatInput` + send). New conversation: pick any staff member from the real directory (`useDirectory`, same source Memorandum's recipient picker already proven to work live).

**Realtime**: subscribed to all `messages` changes scoped to rows the user can see (RLS already filters this server-side) — new messages and read-state changes appear without reload, same real pattern already proven in Memorandum and Notes.

**Deliberately out of scope for this pass**: file attachments (the schema supports them, V1 uses them for PDF/allocation shares elsewhere — a real future slice, not invented here) and reply-threading UI (the `reply_to_id` column exists and is unused by this first pass). Both are real gaps, named rather than silently dropped.

## Delivery sequence

1. Hooks layer (`use-chat.ts`): all-my-messages query, client-side thread grouping, send, mark-read, delete, realtime subscription.
2. Clone the real shadcn-chat primitives into `src/components/ui/chat/`.
3. Build the thread-list panel and the active-conversation panel, composing the cloned primitives.
4. Wire route + sidebar.
5. Verify live: send a real message between two real test accounts, confirm it appears in both sessions, confirm unread badge and mark-read-on-open, confirm a third account cannot see the conversation (RLS), clean up test data.
6. Commit, push to `rebuild`. Deploy only after live verification, per `DEPLOY_INSTRUCTIONS.md`.

## Acceptance criteria

- Thread list shows every real conversation the signed-in user is part of, sorted by most recent activity, with an accurate unread count.
- Opening a thread marks the partner's unread messages as read and clears the badge.
- Sending a message persists it and it is visible to the recipient's own session without a reload (real Realtime, not simulated).
- A staff member who isn't part of a conversation cannot see it (RLS, not client-side filtering).
- No console errors across thread list / open thread / send / mark-read, light and dark mode, desktop and mobile widths.
