# Chat — full WhatsApp feature + visual replica

## Research

WhatsApp's own app isn't open source, so "research" here means: its real, stable, well-documented color system (consistent across multiple independent color-reference sources: deep teal `#075E54`, teal `#128C7E`, brand green `#25D366`, light-mode outgoing bubble `#D9FDD3` (classic `#DCF8C6`), light wallpaper `#ECE5DD`; dark-mode header `#202C33`, outgoing bubble `#005C4B`, incoming bubble `#202C33`, wallpaper `#0B141A`) and its real, stable feature set (group chats with admin roles, quote-reply, forward, star, delete-for-everyone, per-chat search/archive/mute/pin, disappearing messages). Sources: [designpieces.com](https://www.designpieces.com/palette/whatsapp-color-palette-hex-and-rgb), [brandpalettes.com](https://brandpalettes.com/whatsapp-color-codes/), [color.codes.in](https://color.codes.in/brands/whatsapp).

Everything already shipped this session (real-time, presence, typing, read ticks, attachments, calls, Status, reactions, AI smart-reply) stays. This phase covers what's still missing: the visual skin, and group chats plus the remaining per-message/per-chat features.

## 1. Visual — a real WhatsApp skin, scoped to Chat only

Chat gets its own CSS custom properties (`--wa-*`), defined once and switched by the existing theme toggle, so the rest of the dashboard's own design system is untouched (per AGENTS.md: this is the explicit "user asked for a specific non-theme color" case). Bubbles, header, composer, and chat background all draw from these tokens instead of the shared `bg-primary`/`bg-muted` tokens.

## 2. Database — group chats (the real structural gap)

```sql
chat_groups (id, name, description, avatar_url, created_by, created_at, only_admins_can_send boolean, only_admins_can_edit_info boolean)
chat_group_members (group_id, staff_key, staff_name, role text check (role in ('admin','member')), joined_at)
```

`messages` gets a nullable `group_id` column (alternative to `recipient_key` — a message has exactly one of the two). RLS: a group message is visible to current members of that group; only a member can insert; only the group creator or an admin can remove another member or change settings. Groups reuse the exact same `messages` row shape, attachment columns, reactions table (reaction RLS extended to also check group membership), and realtime wiring already built — no parallel message pipeline.

## 3. Per-message features

- **Quote-reply**: `messages.reply_to_id` already exists in the schema (unused until now) — wire it: compose with an active "replying to" preview, render the quoted snippet inside the bubble.
- **Forward**: pick a thread/group, insert a new message copying body/attachment reference, tagged `forwarded: true` (new boolean column) so the UI can show "Forwarded" like the real app.
- **Star**: a `chat_starred_messages (message_id, staff_key)` table — personal, not shared, matching real WhatsApp (starring is per-device/account, not visible to the other party).
- **Delete for everyone**: already-built delete does a hard delete; add a real time-window check (WhatsApp's real limit is about 2 days) client-side before allowing it, otherwise fall back to "delete for me" (a personal-hide, new `chat_message_hides (message_id, staff_key)` table) since the row must stay visible to the other party past that window.

## 4. Per-chat features

- **Search within a chat**: client-side filter over the already-loaded thread (real, instant, no new backend).
- **Archive / mute / pin**: a new `chat_conversation_settings (staff_key, partner_key_or_group_id, archived boolean, muted boolean, pinned boolean)` table, personal per-user settings (archiving a chat only hides it from your own list).

## Delivery sequence

1. Visual skin (fast, highest visible impact).
2. Group chats: schema, RLS, create-group UI, group thread view (reusing `ChatThreadView` with a `group` prop instead of `thread`), member management, admin settings.
3. Quote-reply + forward.
4. Star + delete-for-everyone/for-me.
5. Search + archive/mute/pin.
6. Verify every piece live, clean up test data, commit in phases (not one giant commit), deploy after each verified phase.

## Explicitly out of scope, named not dropped

Group voice/video calls (the existing 1:1 WebRTC signaling doesn't extend to N-way without an SFU — real infrastructure this project doesn't have), disappearing messages (lower real value for a business system with audit/compliance needs than for a consumer app — a deliberate call, not an oversight), broadcast lists, per-chat wallpaper customization.
