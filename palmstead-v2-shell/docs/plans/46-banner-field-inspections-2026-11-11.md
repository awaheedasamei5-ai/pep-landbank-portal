# Banner field inspections — V2

Status: implementation plan, 11 November 2026. Scope is the V2 `rebuild` app and Supabase project `sbydzrlzqxcdbudjaube` only. This extends the Banner field map and report plan 45.

## Research and existing truth

The live V2 database has 63 banners and 93 generic status-log entries. A status change is not evidence that a staff member visited a banner. The existing status form permits an optional note and data-URI photos; its broad RLS allows active staff to insert a log with client-supplied actor text. The separate inspection record must derive the actor from Auth on the server. The current private Storage buckets do not include banner inspection evidence.

The open-source [AuditM Field](https://github.com/nigdanil/AuditM-Field) demonstrates photo-first inspections, review roles and an evidence timeline. [Folder IT's field-inspections reference](https://github.com/FolderITDev/mobile-field-inspections) demonstrates a focused checklist, a required finding explanation/evidence, resumable drafts and read-only completed records. Their local/mock backends cannot be copied as Palmstead authorization; we adapt the field workflow and use V2 Supabase RLS. [Supabase Storage](https://supabase.com/docs/guides/storage/buckets/fundamentals) requires private-bucket RLS for reads, and its [access-control guide](https://supabase.com/docs/guides/storage/security/access-control) separates INSERT from SELECT/UPDATE. The current Supabase changelog notes that new tables may need explicit Data API grants.

## Information and trust model

1. An inspection belongs to exactly one banner. The inspector chooses observed condition, a short finding, one camera/gallery photo, and may optionally capture device latitude, longitude and reported accuracy. An inability to obtain GPS must never falsely mark the inspection as geolocation verified. The server records the inspector and submission timestamp. Captured coordinates are supporting evidence, not proof of presence; they may be absent or imprecise. No geofence gate is imposed because the test browser cannot supply a reliable fix and the source banner coordinates were historically repaired.
2. The photo goes to a new **private** `banner-inspections` Storage bucket, resized to WebP before upload, with a 5 MB limit. Object path is `<inspector-auth-uid>/<inspection-id>.webp`. Uploads never overwrite evidence. Active staff can read only photos linked to a committed inspection; only the uploader can create an object in their Auth UID folder. No client update/delete policy exists. Management evidence retention and orphan cleanup require a later controlled procedure.
3. `banner_inspections` is append-only to the client: authenticated active staff may read company-wide history and insert only their own inspection. No direct update/delete grant or policy. A server-side trigger validates that the private photo object exists, checks actor/path, and sets server time. Another trigger changes the banner's current condition and appends the legacy status timeline in the same database transaction. The inspection table is the authoritative record; the legacy status timeline remains a separate display and older status entries are not inspections. The banner cannot be deleted while inspections exist, preserving evidence. The existing Delete screen must explain that constraint.
4. Each inspection receives a client-generated UUID before photo upload. If the database write fails after upload, the form retains the UUID and retries the same record. It checks for a committed record first, so a lost response cannot create a second inspection. An unlinked uploaded object may remain after a permanently failed write; Management cleanup is a later retention task, not an automatic deletion of possible evidence.

## UI and navigation

The Banner detail screen gains an **Inspect on site** section distinct from **Log a status update**. It shows the selected banner, observed condition, finding, optional device position/accuracy, photo preview, a clear Submit action, progress and recovery messages. Camera capture and file selection are available on phone and desktop. Validation requires a photo and a finding for maintenance/replacement; normal condition may use an optional note. After save, a recent-inspections list shows date, inspector, observation, location-quality label and a private View photo action. Staff and Management share the company-wide record view; only the actual inspector is attached to their row. The Banner report can add inspection recency and outcome filters in a subsequent report slice.

## Verification and release

- Database: a rollback-only test with active Staff, Management, inactive account and anonymous context; reject spoofed inspector, fake photo path, missing object, direct update/delete, and unlinked image reads. Check a successful synthetic inspection updates exactly one banner row and one linked status-log row, then roll back. Confirm existing 63 banners and 93 logs remain unchanged.
- App: typecheck and focused UI validation. Exact Vercel preview in Staff and Management, phone layout, required fields, GPS unavailable path, and private evidence access. Do not claim a physical inspection was performed during QA or create a false real-world inspection for a production banner.
- Deploy only after reading `docs/DEPLOY_INSTRUCTIONS.md`, merge to V2 `rebuild`, confirm production READY and fresh reload. The actual phone camera/location and a real inspection submission still require a controlled field visit.

## Follow-on work

Management review/correction without rewriting the original record; retention and orphan-photo cleanup; offline draft/retry queue; report inspection metrics and stale-inspection flags; service-hosted map tiles/road routing; real phone field test. These are outside this first append-only slice and remain explicitly open.

