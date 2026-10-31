-- The old default definer view bypasses profile RLS and is SELECTable by
-- anon, exposing active staff names and email addresses without sign-in.
alter view public.staff_directory set (security_invoker = true);
revoke all on public.staff_directory from public, anon;
grant select on public.staff_directory to authenticated;
