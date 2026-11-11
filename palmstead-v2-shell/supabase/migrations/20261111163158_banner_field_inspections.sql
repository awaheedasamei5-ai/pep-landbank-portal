-- Physical inspections are distinct from generic banner status changes.
-- The evidence image is private, and the browser cannot change a completed record.
create schema if not exists app_banner_private;
revoke all on schema app_banner_private from public, anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('banner-inspections', 'banner-inspections', false, 5242880, array['image/webp'])
on conflict (id) do nothing;

create table public.banner_inspections (
  id uuid primary key,
  banner_id uuid not null references public.banners(id) on delete restrict,
  inspector_id uuid not null references public.profiles(id) on delete restrict,
  observed_condition text not null check (observed_condition in
    ('placed', 'needs_maintenance', 'location_only', 'being_replaced')),
  finding text not null default '' check (length(finding) <= 2000),
  photo_path text not null unique,
  observed_lat double precision,
  observed_lng double precision,
  gps_accuracy_m double precision,
  recorded_at timestamptz not null default now(),
  constraint banner_inspection_photo_path check
    (photo_path = inspector_id::text || '/' || id::text || '.webp'),
  constraint banner_inspection_finding check
    (observed_condition not in ('needs_maintenance', 'being_replaced') or length(btrim(finding)) >= 5),
  constraint banner_inspection_coordinates check
    ((observed_lat is null and observed_lng is null and gps_accuracy_m is null)
      or (observed_lat is not null and observed_lng is not null and gps_accuracy_m is not null
        and observed_lat between -90 and 90 and observed_lng between -180 and 180
        and gps_accuracy_m between 0 and 50000))
);

create index banner_inspections_banner_date_idx
  on public.banner_inspections (banner_id, recorded_at desc);
create index banner_inspections_inspector_date_idx
  on public.banner_inspections (inspector_id, recorded_at desc);

alter table public.banner_inspections enable row level security;
revoke all on public.banner_inspections from authenticated;
grant select, insert on public.banner_inspections to authenticated;
revoke all on public.banner_inspections from anon;

create policy banner_inspections_read on public.banner_inspections
  for select to authenticated using ((select public.my_key()) is not null);
create policy banner_inspections_insert on public.banner_inspections
  for insert to authenticated
  with check (inspector_id = (select auth.uid()) and (select public.my_key()) is not null);

-- Upload permissions are confined to an active employee's Auth UID folder.
-- Reads require a committed inspection; orphan uploads are not public.
create policy banner_inspection_photo_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'banner-inspections'
    and (select public.my_key()) is not null
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and array_length(storage.foldername(name), 1) = 1
    and storage.filename(name) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$'
  );
create policy banner_inspection_photo_read on storage.objects
  for select to authenticated using (
    bucket_id = 'banner-inspections'
    and (select public.my_key()) is not null
    and exists (select 1 from public.banner_inspections bi where bi.photo_path = name)
  );

-- A definer is required only to verify the private uploaded object and to
-- append the existing banner timeline and current status in one transaction.
-- Both functions live in an unexposed schema, with no direct EXECUTE grant.
create function app_banner_private.validate_inspection()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or new.inspector_id is distinct from auth.uid()
     or public.my_key() is null then
    raise exception 'Only active staff can record their own inspection.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from storage.objects obj
    where obj.bucket_id = 'banner-inspections' and obj.name = new.photo_path
      and obj.owner_id = auth.uid()::text
  ) then
    raise exception 'Upload a new private inspection photo first.' using errcode = '22023';
  end if;
  new.recorded_at := now();
  return new;
end;
$$;
revoke all on function app_banner_private.validate_inspection() from public, anon, authenticated;
create trigger banner_inspection_validate
  before insert on public.banner_inspections for each row
  execute function app_banner_private.validate_inspection();

create function app_banner_private.apply_inspection()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_agent_key text;
  v_agent_name text;
begin
  select p.agent_key, p.name into v_agent_key, v_agent_name
    from public.profiles p where p.id = new.inspector_id and p.active is true;
  if v_agent_key is null then
    raise exception 'Inspector is no longer an active staff member.' using errcode = '42501';
  end if;
  update public.banners
    set status = new.observed_condition, updated_at = new.recorded_at
    where id = new.banner_id;
  if not found then
    raise exception 'Banner no longer exists.' using errcode = '23503';
  end if;
  insert into public.banner_status_log
    (banner_id, status, note, images, changed_by, changed_by_name)
  values
    (new.banner_id, new.observed_condition,
      case when btrim(new.finding) = '' then 'Field inspection recorded'
           else 'Field inspection: ' || btrim(new.finding) end,
      '[]'::jsonb, v_agent_key, v_agent_name);
  return new;
end;
$$;
revoke all on function app_banner_private.apply_inspection() from public, anon, authenticated;
create trigger banner_inspection_apply
  after insert on public.banner_inspections for each row
  execute function app_banner_private.apply_inspection();

