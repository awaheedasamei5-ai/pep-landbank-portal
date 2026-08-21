# Schema baseline — 2026-08-21

A complete, point-in-time snapshot of the live production Supabase project (`lrahgcnftetnyxunaljs`), generated directly from `pg_catalog` introspection. This is Rebuild Phase 0 (Sec 13 / Sec 66's "Phase 0: backup and schema snapshot"): the repo's older `supabase_migrations/*.sql` files only ever defined 15 of the ~53 tables actually running in production — this baseline closes that gap with a reproducible, version-controlled record of everything.

Apply in order (each file depends on objects created by the ones before it):

1. `01_tables.sql` — all 53 base tables, columns, types, defaults, NOT NULL
2. `02_functions.sql` — all 33 functions, leaf-first (SQL-language functions are validated at CREATE time, so anything they call must already exist; plpgsql function bodies aren't validated until first execution, so their order doesn't matter)
3. `03_views.sql` — the 4 views (depend on functions from step 2, e.g. `plots_my_sales` calls `my_key()`)
4. `04_constraints.sql` — PK/UNIQUE/CHECK constraints, then FK constraints (added last so every referenced table already exists)
5. `05_indexes.sql` — indexes not already implied by a PK/UNIQUE constraint above
6. `06_sequences_and_triggers.sql` — the receipt-number sequence, then all triggers (public schema + the `on_auth_user_created` trigger on `auth.users`)
7. `07_rls_policies.sql` — `ENABLE ROW LEVEL SECURITY` on every RLS-protected table, then all 183 policies
8. `08_realtime_and_cron.sql` — realtime publication membership (16 tables) and the 5 pg_cron scheduled jobs

## Object counts (verified against the live project at generation time)

| Object type | Count |
|---|---|
| Tables | 53 |
| Views | 4 |
| PK/UNIQUE/CHECK constraints | 100 |
| Foreign key constraints | 24 |
| Indexes (beyond constraint-backed ones) | 10 |
| Functions | 33 |
| Triggers (public + auth) | 9 |
| RLS policies | 183 |
| Realtime publication tables | 16 |
| pg_cron scheduled jobs | 5 |
| Storage buckets | 0 |

## Verified by full replay

This baseline was replayed end-to-end into a disposable scratch Supabase project and the object counts above were confirmed to match production **exactly** (53/4/426/79/33/8/183/16, using the same broad `information_schema`/`pg_catalog` counting queries against both projects). The scratch project was deleted after verification; no data left the production project during this process (introspection is read-only).

An earlier version of this baseline had `03_views.sql`'s content bundled before `02_functions.sql` and failed to replay (`plots_my_sales` calls `my_key()`, which didn't exist yet) — the numbering above is the corrected, actually-tested order.

This baseline does not include table **data** (rows) — it is schema/security/automation structure only, per Sec 13's acceptance criterion ("running the system from a clean Supabase project using only version-controlled migrations must produce the same schema and permissions"). It also does not include Edge Functions (none exist in this project yet) or Storage bucket policies (no buckets exist yet).
