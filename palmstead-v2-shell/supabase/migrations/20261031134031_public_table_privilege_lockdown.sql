-- Row security cannot guard table-wide TRUNCATE, REFERENCES or TRIGGER.
-- Keep ordinary reads and writes under their existing RLS policies, and
-- preserve the service_role grants used by trusted server-side jobs.
revoke truncate, references, trigger on all tables in schema public
  from public, anon, authenticated;

-- New tables created by our migrations run as postgres. Supabase also has
-- supabase_admin defaults, which this role cannot alter; inspect new tables
-- owned by that role before exposing them through the Data API.
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables
  from public, anon, authenticated;

