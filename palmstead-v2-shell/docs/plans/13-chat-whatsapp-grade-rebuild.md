# Chat — WhatsApp-grade rebuild (real-time, presence, calls, visual redesign)

## Why

Three rounds of real user feedback on the same app: (1) no emoji picker, no calls, no real-time sync, slow after sending, no status updates; (2) bubbles are ugly and sometimes unreadable. This is a full-scope correction, not another incremental patch.

## Research — no literal-merge candidate exists

Searched GitHub for a WhatsApp clone on Next.js + Supabase with presence/typing/calls already built. None qualifies:
- `GetStream/fullstack-nextjs-whatsapp-clone` (91 stars) — real, professional, but messaging/calls run on Stream's SDKs, not Supabase. Backend incompatible, same situation as `RocketChat/Rocket.Chat` already logged in `CONTINUE_HERE.md`.
- `garu2/Whatsapp-Clone-React-Supabase` (3 stars) — the only Supabase-native hit; plain Vite+JS, no TypeScript, no calls, no typing/presence, minimal styling. Too thin to literal-merge.
- `minast1/Chatapp` (0 stars), `hetref/whatsapp-chat` (Supabase + WhatsApp Business Cloud API, typing explicitly listed as "future", wrong use case) — not viable sources either.

Per the standing rule already applied to RocketChat: when no compatible literal-merge source exists, build against the real primitives the backend actually offers — here, Supabase's own documented Realtime Broadcast + Presence + Postgres Changes — rather than inventing an ad-hoc polling scheme. The UI direction is WhatsApp's own real, well-known interaction patterns (bubble shape/color, inline timestamp+ticks, typing dots, online/last-seen text, call screens), not copied from any specific repo.

## Root cause of "slow after sending"

`useAllMyMessages` selects up to 1000 rows across every conversation the user has, and both `useSendMessage`'s `onSuccess` and the realtime subscription call `invalidateQueries` on that same key — so sending one message, or any realtime event anywhere, re-fetches and re-parses the entire cross-thread message history before the UI updates. Fix: optimistic local cache append on send (no refetch needed for the sender's own message), and realtime events patch the cache directly instead of invalidating wholesale.

## Root cause of "no real-time sync end to end"

`useChatRealtime` subscribes with no filter and has been observed failing to establish (`WebSocket is closed before the connection is established` in console) without any reconnect/backoff logic — a dropped socket means the recipient never finds out about a new message until they manually reload. Fix: add retry/backoff on the channel subscription (matching the pattern already fixed project-wide for other realtime channels per `project-prod-fixes-2026-10-07-round2` in memory), and move to a channel scoped by conversation pair rather than a single global one per user.

## Scope

1. **Performance**: optimistic send, targeted cache patches instead of full invalidation, scoped realtime channel with reconnect/backoff.
2. **Presence**: real Supabase Presence channel — online/offline, "last seen" timestamp, shown in the thread header and conversation list.
3. **Typing indicator**: real Supabase Broadcast (not a DB write — ephemeral, matches Supabase's own documented pattern) — "X is typing…" shown live while the other party types.
4. **Read receipts**: single/double/blue-tick equivalents next to the sender's own outbound messages, driven by the real `read` column already in use.
5. **Emoji picker**: a real emoji picker library in the composer (`emoji-picker-react`, MIT, actively maintained), inserting at cursor position.
6. **Visual redesign**: WhatsApp-style bubble shapes (tail, rounded corners), outbound tinted / incoming neutral-surface colors drawn from this project's own theme tokens (not hardcoded hex, per AGENTS.md), inline bottom-right timestamp + read-tick instead of a separate footer line, explicit safe text-color pairing on every custom element (attachment cards, location caption) instead of relying on inheritance — this is also the fix for the reported unreadable-text cases.
7. **Voice/video calls**: real WebRTC, 1:1, using Supabase Realtime Broadcast as the signaling channel (offer/answer/ICE candidates) and Google's public STUN server (`stun:stun.l.google.com:19302`) for NAT traversal, per explicit user decision — no TURN relay, so a call between two staff on especially strict/symmetric NATs can fail to connect; this is a named, accepted limitation, not a silent gap. Call UI: outgoing/incoming call screens, mute/camera toggle, hang up, matching real WebRTC call-screen conventions.

## Delivery sequence

1. Performance + real-time reliability fix (optimistic send, scoped/reconnecting channel).
2. Visual redesign of bubbles/thread view (also closes the contrast bug).
3. Presence (online/last seen) + typing indicator (Broadcast).
4. Read ticks.
5. Emoji picker.
6. WebRTC calling (signaling hook, call UI, STUN-only connection).
7. Verify every piece live with real accounts; clean up test data.

## Acceptance criteria

- Sending a message appears in the sender's own view instantly (no refetch wait) and in the recipient's view within ~1s via realtime, without a manual reload, confirmed across two real sessions.
- Typing shows live on the other party's screen within ~1s of keystrokes, clears a few seconds after typing stops.
- Online/last-seen reflects real presence, not a stale guess.
- Every bubble variant (outbound/inbound, text/image/file/location) passes a real contrast check in both light and dark theme.
- A real audio/video call connects between two staff on the same network; the STUN-only limitation on stricter NATs is documented, not hidden.
