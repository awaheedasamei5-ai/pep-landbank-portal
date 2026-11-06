-- Twelve imported Accra longitudes lost their decimal point. Keep the originals
-- for audit and only repair the recognisable seven-decimal Ghana pattern.
create table if not exists public.banner_coordinate_repairs (
  banner_id uuid primary key references public.banners(id),
  old_lat double precision not null,
  old_lng double precision not null,
  new_lat double precision not null,
  new_lng double precision not null,
  repaired_at timestamptz not null default now(),
  reason text not null
);
alter table public.banner_coordinate_repairs enable row level security;
revoke all on public.banner_coordinate_repairs from public, anon, authenticated;
grant select on public.banner_coordinate_repairs to authenticated;
create policy banner_coordinate_repairs_manager_read on public.banner_coordinate_repairs
for select to authenticated using (public.my_role() = 'manager');

with candidates as (
  select id,lat,lng,lng / 10000000.0 as corrected_lng
  from public.banners
  where lat between 5.5 and 5.8
    and lng between -2000000 and -500000
    and lng / 10000000.0 between -0.25 and -0.05
), logged as (
  insert into public.banner_coordinate_repairs(banner_id,old_lat,old_lng,new_lat,new_lng,reason)
  select id,lat,lng,lat,corrected_lng,'Imported longitude missing decimal point (7 places)'
  from candidates on conflict (banner_id) do nothing
  returning banner_id,new_lng
)
update public.banners b set lng = logged.new_lng, updated_at = now()
from logged where b.id = logged.banner_id;

alter table public.banners add constraint banners_valid_coordinates
  check ((lat is null and lng is null) or
    (lat between -90 and 90 and lng between -180 and 180));
