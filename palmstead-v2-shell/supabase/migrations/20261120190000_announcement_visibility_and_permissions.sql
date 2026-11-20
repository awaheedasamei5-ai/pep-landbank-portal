-- Announcements had permissive policies composed with OR. A view grant
-- accidentally permitted INSERT/UPDATE/DELETE and a read receipt could
-- be written for another staff member. Replace them with one rule per
-- operation before adding targeted and scheduled publishing.
alter table public.announcements
  add column if not exists publish_at timestamptz not null default now();

alter table public.announcements
  drop constraint if exists announcements_audience_check;
alter table public.announcements
  add constraint announcements_audience_check check (audience in ('staff', 'all', 'management'));

drop policy if exists announcements_access_insert on public.announcements;
drop policy if exists announcements_access_update on public.announcements;
drop policy if exists announcements_access_delete on public.announcements;
drop policy if exists announcements_access_view on public.announcements;
drop policy if exists announce_sel on public.announcements;
create policy announce_sel on public.announcements for select to authenticated
using (
  public.my_role() = 'manager'
  or (
    public.has_permission('announcements.view')
    and active
    and publish_at <= now()
    and (expires_at is null or expires_at > now())
    and audience in ('staff', 'all')
  )
);

drop policy if exists announcement_reads_access_insert on public.announcement_reads;
drop policy if exists announcement_reads_access_view on public.announcement_reads;
drop policy if exists announcement_reads_own on public.announcement_reads;
create policy announcement_reads_own on public.announcement_reads for insert to authenticated
with check (
  staff_key = public.my_key()
  and exists (
    select 1 from public.announcements a
    where a.id = announcement_id and a.active
      and a.publish_at <= now() and (a.expires_at is null or a.expires_at > now())
  )
);

drop policy if exists ancom_sel on public.announcement_comments;
drop policy if exists ancom_ins on public.announcement_comments;
drop policy if exists announcement_comments_access_view on public.announcement_comments;
drop policy if exists announcement_comments_access_insert on public.announcement_comments;
create policy announcement_comments_access_view on public.announcement_comments for select to authenticated
using (
  exists (
    select 1 from public.announcements a where a.id = announcement_id
  )
);
create policy announcement_comments_access_insert on public.announcement_comments for insert to authenticated
with check (
  author_key = public.my_key()
  and author_name = (select name from public.profiles where id = auth.uid())
  and (public.my_role() = 'manager' or public.has_permission('announcements.comment'))
  and exists (
    select 1 from public.announcements a
    where a.id = announcement_id and a.active
      and a.publish_at <= now() and (a.expires_at is null or a.expires_at > now())
  )
);

