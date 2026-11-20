-- The first publish_at migration set its new default to the migration
-- time for legacy rows. Restore their actual publication chronology.
-- All pre-existing V2 notices were created before 20 November 2026;
-- newer scheduled posts keep the publish time chosen by Management.
update public.announcements
set publish_at = created_at
where created_at is not null
  and created_at < timestamptz '2026-11-20 00:00:00+00';

