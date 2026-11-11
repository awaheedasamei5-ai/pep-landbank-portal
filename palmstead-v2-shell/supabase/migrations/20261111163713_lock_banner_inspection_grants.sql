-- Supabase default table privileges include UPDATE and DELETE for authenticated.
-- RLS had no policies for these operations, but remove the grants as an additional boundary.
revoke all on public.banner_inspections from authenticated;
grant select, insert on public.banner_inspections to authenticated;

