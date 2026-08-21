# Schema baseline — 2026-08-21

A complete, point-in-time snapshot of the live production Supabase project (`lrahgcnftetnyxunaljs`), generated directly from `pg_catalog` introspection. This is Rebuild Phase 0 (Sec 13 / Sec 66's "Phase 0: backup and schema snapshot"): the repo's older `supabase_migrations/*.sql` files only ever defined 15 of the ~53 tables actually running in production — this baseline closes that gap with a reproducible, version-controlled record of everything.

Apply in order (each file depends on objects created by the ones before it):

1. `01_tables.sql` — all 53 base tables, columns, types, defaults, NOT NULL
2. `02_views_and_constraints.sql` — the 4 views, then PK/UNIQUE/CHECK constraints, then FK constraints (added last so every referenced table already exists)
3. `03_indexes.sql` — indexes not already implied by a PK/UNIQUE constraint above
4. `04_functions.sql` — all 33 functions (RLS helpers, business-logic RPCs, trigger functions)
5. `05_sequences_and_triggers.sql` — the receipt-number sequence, then all triggers (public schema + the `on_auth_user_created` trigger on `auth.users`)
6. `06_rls_policies.sql` — `ENABLE ROW LEVEL SECURITY` on every RLS-protected table, then all 183 policies
7. `07_realtime_and_cron.sql` — realtime publication membership (16 tables) and the 5 pg_cron scheduled jobs

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

## Verifying parity

Replay files 1–7 in order into a fresh, empty Supabase project, then re-run the same counting queries used to generate this baseline (grouped by object type, scoped to `schemaname/nspname = 'public'`) and confirm they match the table above. This mirrors the verification method already used for the PALMSTEAD schema replication earlier in this project.

This baseline does not include table **data** (rows) — it is schema/security/automation structure only, per Sec 13's acceptance criterion ("running the system from a clean Supabase project using only version-controlled migrations must produce the same schema and permissions"). It also does not include Edge Functions (none exist in this project yet) or Storage bucket policies (no buckets exist yet).
