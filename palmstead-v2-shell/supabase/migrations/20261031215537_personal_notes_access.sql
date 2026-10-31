-- Personal Notes remain owner-scoped by the existing policies. These
-- restrictive grants add Management-configurable view and write access.
insert into public.permissions(key,label,description) values
  ('notes.view','View personal Notes','Read your own saved Notes.'),
  ('notes.manage','Manage personal Notes','Create, edit and delete your own Notes.')
on conflict (key) do update set label=excluded.label,description=excluded.description;

insert into public.role_permissions(role,permission_key)
select 'agent',key from public.permissions
where key in ('notes.view','notes.manage')
on conflict do nothing;

create policy notes_access_view on public.notes as restrictive
for select to authenticated using (public.has_permission('notes.view'));
create policy notes_access_insert on public.notes as restrictive
for insert to authenticated
with check (public.has_permission('notes.view') and public.has_permission('notes.manage'));
create policy notes_access_update on public.notes as restrictive
for update to authenticated
using (public.has_permission('notes.view') and public.has_permission('notes.manage'))
with check (public.has_permission('notes.view') and public.has_permission('notes.manage'));
create policy notes_access_delete on public.notes as restrictive
for delete to authenticated
using (public.has_permission('notes.view') and public.has_permission('notes.manage'));

