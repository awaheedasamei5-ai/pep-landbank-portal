-- Company notices are visible to newly joined active staff while still active.
-- Staff may be made view-only; publishing remains Management-only under the
-- existing role policies. Read receipts are personal except for Management.
insert into public.permissions (key, label, description) values
  ('announcements.view', 'View announcements', 'Read active company notices and their comments.'),
  ('announcements.comment', 'Comment on announcements', 'Post comments on active company notices.')
on conflict (key) do update set label = excluded.label, description = excluded.description;

insert into public.role_permissions (role, permission_key)
select 'agent', key from public.permissions
where key in ('announcements.view', 'announcements.comment')
on conflict do nothing;

drop policy announce_sel on public.announcements;
create policy announce_sel on public.announcements
for select to authenticated
using (auth.uid() is not null and (active or public.my_role() = 'manager'));
create policy announcements_access_view on public.announcements as restrictive
for select to authenticated using (public.has_permission('announcements.view'));
create policy announcements_access_insert on public.announcements as restrictive
for insert to authenticated with check (public.has_permission('announcements.view'));
create policy announcements_access_update on public.announcements as restrictive
for update to authenticated using (public.has_permission('announcements.view'))
with check (public.has_permission('announcements.view'));
create policy announcements_access_delete on public.announcements as restrictive
for delete to authenticated using (public.has_permission('announcements.view'));

drop policy announcement_reads_sel on public.announcement_reads;
create policy announcement_reads_sel on public.announcement_reads
for select to authenticated
using (staff_key = public.my_key() or public.my_role() = 'manager');
create policy announcement_reads_access_view on public.announcement_reads as restrictive
for select to authenticated using (public.has_permission('announcements.view'));
create policy announcement_reads_access_insert on public.announcement_reads as restrictive
for insert to authenticated with check (
  public.has_permission('announcements.view')
  and exists (select 1 from public.announcements a where a.id = announcement_id and a.active)
);

create policy announcement_comments_access_view on public.announcement_comments as restrictive
for select to authenticated using (
  public.has_permission('announcements.view')
  and exists (select 1 from public.announcements a where a.id = announcement_id)
);
create policy announcement_comments_access_insert on public.announcement_comments as restrictive
for insert to authenticated with check (
  public.has_permission('announcements.view')
  and public.has_permission('announcements.comment')
  and exists (select 1 from public.announcements a where a.id = announcement_id and a.active)
);
