-- Memorandum retains the existing sender, recipient and Management scope.
-- This layer adds per-staff app access and prevents read acknowledgements from
-- being used to alter a sent letter or another person's Cc entry.
insert into public.permissions (key, label, description) values
  ('memorandum.view', 'View Memorandum', 'Read addressed, sent and draft memoranda within your existing scope.'),
  ('memorandum.manage', 'Manage Memorandum', 'Compose, send and delete memoranda within your existing scope.')
on conflict (key) do update set label = excluded.label, description = excluded.description;

insert into public.role_permissions (role, permission_key)
select 'agent', key from public.permissions
where key in ('memorandum.view', 'memorandum.manage')
on conflict do nothing;

create policy memos_access_view on public.memos as restrictive
for select to authenticated using (public.has_permission('memorandum.view'));
create policy memos_access_insert on public.memos as restrictive
for insert to authenticated
with check (public.has_permission('memorandum.view') and public.has_permission('memorandum.manage'));
create policy memos_access_update on public.memos as restrictive
for update to authenticated
using (public.has_permission('memorandum.view'))
with check (public.has_permission('memorandum.view'));
create policy memos_access_delete on public.memos as restrictive
for delete to authenticated
using (public.has_permission('memorandum.view') and public.has_permission('memorandum.manage'));

create policy memo_recipients_access_view on public.memo_recipients as restrictive
for select to authenticated using (public.has_permission('memorandum.view'));
create policy memo_recipients_access_insert on public.memo_recipients as restrictive
for insert to authenticated
with check (public.has_permission('memorandum.view') and public.has_permission('memorandum.manage'));
create policy memo_recipients_access_update on public.memo_recipients as restrictive
for update to authenticated
using (public.has_permission('memorandum.view'))
with check (public.has_permission('memorandum.view'));
create policy memo_recipients_access_delete on public.memo_recipients as restrictive
for delete to authenticated
using (public.has_permission('memorandum.view') and public.has_permission('memorandum.manage')
  and exists (select 1 from public.memos m where m.id = memo_id and m.from_key = public.my_key() and m.status = 'draft'));
create policy memo_recipients_del on public.memo_recipients
for delete to authenticated
using (exists (select 1 from public.memos m where m.id = memo_id and m.from_key = public.my_key() and m.status = 'draft'));

create function public.guard_memo_update() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if auth.role() = 'service_role' then return new; end if;
  if old.status = 'sent' and old.to_key = public.my_key()
    and old.read is false and new.read is true
    and (to_jsonb(new) - 'read') = (to_jsonb(old) - 'read') then
    return new;
  end if;
  if old.status = 'draft' and (old.from_key = public.my_key() or public.my_role() = 'manager')
    and public.has_permission('memorandum.manage')
    and new.id = old.id and new.from_key = old.from_key and new.from_name = old.from_name
    and new.parent_id is not distinct from old.parent_id and new.kind = old.kind
    and new.created_at = old.created_at and new.read = old.read then
    return new;
  end if;
  raise exception 'This memorandum cannot be changed.' using errcode = '42501';
end;
$$;

create trigger guard_memo_update before update on public.memos
for each row execute function public.guard_memo_update();

create function public.guard_memo_recipient_update() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if auth.role() = 'service_role' then return new; end if;
  if old.staff_key = public.my_key() and old.read is false and new.read is true
    and (to_jsonb(new) - 'read') = (to_jsonb(old) - 'read') then
    return new;
  end if;
  raise exception 'This recipient entry cannot be changed.' using errcode = '42501';
end;
$$;

create trigger guard_memo_recipient_update before update on public.memo_recipients
for each row execute function public.guard_memo_recipient_update();

revoke all on function public.guard_memo_update() from public, anon, authenticated;
revoke all on function public.guard_memo_recipient_update() from public, anon, authenticated;
