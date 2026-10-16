# Chat — Full Attachments (Media, Files, Audio, Location) — Implementation Plan

## Why this exists

The first Chat build (`docs/plans/11-chat-plan.md`) shipped real 1:1 messaging but deliberately scoped out attachments. The user wants a real WhatsApp-grade experience: photos, video, any file, voice notes, and location, sent and received for real — not a text-only DM tool with that functionality named but missing.

## Research — no exact stack match exists, so this is a researched rebuild, not a literal merge

Searched for an open-source WhatsApp clone on this project's own stack (Next.js + Supabase) with real media/audio/location support. None exists cleanly: the closest hits (Stream's WhatsApp-Web-clone tutorial series, `codewarnab/connectly`, `lra8dev/whatsapp-clone`) each swap in a different realtime/storage layer (Stream, Convex, Pusher) incompatible with this project's Supabase-only backend — the same "frontend patterns real, backend incompatible" situation already logged for `RocketChat/Rocket.Chat` in `CONTINUE_HERE.md`'s own repo table. Per that precedent, the real move is the same one already used for every other app here: take the real *interaction patterns* (attachment picker, bubble layout per media type, voice-note record flow, location share) from how real WhatsApp-style chat UIs work, and wire them for real against this project's own already-vendored `Message`/`Bubble`/`MessageScroller` primitives and the live Supabase schema — not invent a generic file-upload widget.

## Real V1/current schema — verified live, 2026-10-16

`messages` already carries legacy attachment columns, in real use (100 of 116 production rows have one): `attachment_data` (base64, up to 1.4MB in some rows — V1's actual PDFs/images), `attachment_type`, `attachment_name`. No `chat-attachments` storage bucket exists yet (checked `storage.buckets` — 7 buckets exist, none for chat). Base64-in-Postgres is what V1 did; it is not what a WhatsApp-grade app should keep doing for video/audio, so new sends go through real Supabase Storage instead, while every existing base64 row keeps rendering exactly as before (no backfill, no data loss).

## 1. Database — migration

Add to `messages` (all nullable, additive, zero impact on existing rows):

- `attachment_url text` — Storage object path for new uploads (images, video, audio, files). Null for legacy base64 rows and for messages with no attachment.
- `attachment_size_bytes bigint`
- `attachment_duration_seconds integer` — voice notes and video.
- `location_lat double precision`, `location_lng double precision`, `location_label text` — a shared-location message.

`kind` (already `text`, already free-form, no constraint to touch) gets real values going forward: `image`, `video`, `audio`, `file`, `location`, alongside the existing `site_visit_logged` and plain text (`kind is null`).

## 2. Storage — new bucket, real RLS

New private bucket `chat-attachments`. Object path convention: `{participantKeyA}/{participantKeyB}/{messageId}-{filename}`, with the two keys written in a fixed sort order so either participant's key always lands in a known path segment — this lets a storage policy authorize a 1:1 conversation's two members without joining back to `messages` (the same shape already proven for `attendance-photos` et al. in this project).

```sql
create policy "chat_attachments_participants_select"
on storage.objects for select to authenticated
using (
  bucket_id = 'chat-attachments'
  and (my_key() = (storage.foldername(name))[1] or my_key() = (storage.foldername(name))[2])
);

create policy "chat_attachments_sender_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'chat-attachments'
  and (my_key() = (storage.foldername(name))[1] or my_key() = (storage.foldername(name))[2])
);
```

Files are fetched via short-lived signed URLs (`createSignedUrl`), generated client-side only after the `messages` row itself is readable under its own already-correct RLS — the storage policy is a second, independent gate, not the only one.

## 3. Security

`messages` RLS is already correct and untouched (sender/recipient select, sender insert/delete, recipient update for read-state). The new storage policies above are the only new security surface, and they mirror the same sender/recipient boundary the table already enforces.

## 4. AI touchpoints

None for this slice — attachments are a transport/UI feature, not an AI one. (Out of scope here, not silently dropped: a future "summarize this voice note" or "describe this image" pass could hang off the existing `ai-insights` function later.)

## 5. UI — real send/receive flow per media type

**Composer**: a `+` attachment-menu button opens four real actions — Photo/Video (native file picker, `accept="image/*,video/*"`), Document (any file), Location (real `navigator.geolocation`, no fake coordinates), and a mic button for a real press-to-record voice note via `MediaRecorder`. Each produces a real upload to `chat-attachments` before the message row is inserted, with a real upload-progress state (no fake spinner standing in for a synchronous call).

**Bubble rendering**, by `kind`:
- `image` — inline thumbnail, click to open full-size (a simple lightbox, reusing `Dialog`).
- `video` — inline `<video controls>`.
- `audio` — real `<audio controls>` with the real recorded duration shown.
- `file` — a download card: file-type icon, name, size, a real download link (signed URL).
- `location` — a static OpenStreetMap tile preview (no API key needed) linking out to `https://www.openstreetmap.org/?mlat=...&mlon=...`, with `location_label` as the caption when reverse geocoding succeeds, plain coordinates when it doesn't (never a fake address).
- Legacy base64 rows (`attachment_data` set, `attachment_url` null) render the same `image`/`file` bubble shapes directly from the data URI — no migration needed, no visual regression for the 100 real existing rows.

**Out of scope, named not dropped**: end-to-end encryption (V1 never had it, this schema doesn't support it, a real future project not invented here), message reactions/forwarding, group chats (schema is 1:1 by design).

## Delivery sequence

1. Migration: new columns + `chat-attachments` bucket + storage policies.
2. `use-chat.ts`: extend `ChatMessage`, add `uploadAttachment()`, `useSendLocation()`, recording helpers.
3. Attachment menu + voice recorder components.
4. Bubble-rendering variants per `kind` in `chat-thread.tsx`.
5. Verify live: send one real message of each kind (image, file, voice note, location) between real accounts, confirm render on both sides, confirm signed URLs actually gate access, clean up test data/files.
6. Commit, push to `rebuild`, deploy only after live verification.
