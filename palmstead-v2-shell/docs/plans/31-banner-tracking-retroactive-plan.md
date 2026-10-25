# Banner Tracking — retroactive plan (palmstead-v2-shell)

Written retroactively, 2026-10-25, as part of `docs/plans/30-master-system-audit-and-unification-plan.md` Phase 9: this app was built and shipped (2026-09-11/12, a literal port of V1's real `viewBannerApp`/`paintBannerApp`) without ever getting its own plan doc. This documents what's real, as it stands today — not a forward-looking design.

## 1. What it does

Tracks every physical banner/location placement the company has in the field (currently NUNGUA and SPINTEX, plus a few named micro-areas), who placed it, its condition over time, and how many Pipeline leads trace back to it.

**Staff and Management see the exact same app** — `banners_sel` RLS (`my_key() is not null`) is open to any authenticated staff member, no role gate. The only asymmetry is `banners_del` (creator or manager only).

## 2. Real database schema

- `banners`: `id, name, area, status, lat, lng, image, notes, created_by, created_by_name, created_at, updated_at`. `status` is one of `placed | needs_maintenance | being_replaced | location_only`. `image` is a base64 data URI (resized client-side before upload — see `useBanners.ts`/`BannerAddModal.tsx`), not a storage-bucket path.
- `banner_status_log`: `id, banner_id, status, note, images (jsonb array), changed_by, changed_by_name, created_at` — an append-only audit trail; `useLogBannerStatusUpdate()` writes a row here AND updates the parent `banners` row's `status`/`image`/`updated_at` in the same logical action, matching V1's `apiLogBannerStatusUpdate`.
- `leads.banner_id` (nullable FK, no DB-level constraint) links a Pipeline lead back to the banner that generated it — this is how "Leads generated"/"leads from banners" counts are computed (`leadBannerCounts()` in `data/source.ts`, a `group by banner_id` over `leads`).

**RLS** (confirmed live, `sbydzrlzqxcdbudjaube`):
- `banners_sel`: `my_key() is not null` — any signed-in staff.
- `banners_ins`: `my_key() is not null` — any signed-in staff can add a banner/location.
- `banners_upd`: `my_key() is not null` — any signed-in staff can update any banner (not creator-scoped).
- `banners_del`: `created_by = my_key() or my_role() = 'manager'`.
- `banner_status_log` (`bsl_sel`/`bsl_ins`): both just `my_key() is not null`.

No `has_permission()` gate on this table — access control is purely the policies above, unaffected by the temporary testing-phase `has_permission()` override elsewhere in this plan.

## 3. Real screens

Four tabs in `BannerTrackingScreen.tsx` (`src/webnext/features/banners/screens/`), a literal port of V1's own 4-tab layout:

1. **Dashboard** — a "Banner Health" hero (donut gauge = `placed / (placed+maintenance+replacing)`, areas-covered/leads-generated sub-stats), a 6-card KPI grid (perfect condition, needs maintenance, being replaced, new locations, total areas, leads from banners), a dark "placements over time" panel (6-month line chart + 3 status cards), and a recent-activity list (last 8, by `updatedAt`/`createdAt`).
2. **Banners** (list) — search by name/area, status chips, area chips (each showing a lead count), each row opens `BannerDetailScreen` (`/dashboard/banners/[id]`).
3. **Map & Routes** — `BannerMapPanel.tsx`, plots every banner with real `lat`/`lng` on a map.
4. **Reports** — period chips (All time/This week/This month/Last month/This year/Last year/Custom range) combinable with area/status filters, drives both the on-screen filtered list and a PDF export (`useDownloadBannerReportPdf`).

`BannerDetailScreen.tsx` (`/dashboard/banners/[id]`): single banner's full record, its `banner_status_log` history, a "Log a status update" form (status + note + photos, writes both tables), area is editable here too (a real production fix — area used to be create-only), and a hard-delete action gated by `banners_del`.

## 4. Realtime sync

Wired into `useDashboardRealtime.ts` (confirmed): `banners` and `banner_status_log` both invalidate `['banners']`, `['leadBannerCounts']`, `['bannerStatusLog']` on any change, for every signed-in user (not role-filtered, matching the open `banners_sel` RLS).

## 5. AI integration

None. No `ai-insights` function call anywhere in `src/webnext/features/banners/`.

## 6. Known gaps (found reading the real code, not exhaustive)

- `banner_status_log.images` and `banners.image` are base64 blobs stored directly in Postgres columns, not Supabase Storage — fine at today's volume, but will bloat `pg_dump`/replication size as more photos accumulate. Not an active problem, worth knowing.
- V1→V2 migration gap (closed in this same Phase 9 session, `docs/plans/30-...` Phase 4): 54 of 63 real banners and 75 of 93 `banner_status_log` rows were missing until this session's migration; the migrated rows' `image`/`images` were deliberately left null (binary-transfer cost through the migration tool was impractical) — those specific historical photos are gone unless re-uploaded from V1 by hand.
- No AI touchpoint exists for this app (e.g. an LLM-drafted "which areas are underperforming" read) — not a bug, just unbuilt; mentioned here only because Phase 9's brief asked AI integration to be stated plainly either way.
