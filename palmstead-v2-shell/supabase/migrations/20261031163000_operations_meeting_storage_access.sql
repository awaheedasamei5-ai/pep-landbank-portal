-- The private task-attachments bucket also stores meeting files under
-- schedule_item_id/file_name. Keep its existing participant checks and add
-- the same meeting capability checks used on attachment metadata.
create policy meeting_file_access_view on storage.objects as restrictive
for select to authenticated
using (
  bucket_id <> 'task-attachments'
  or not public.is_meeting_schedule_item(((storage.foldername(name))[1])::uuid)
  or public.has_permission('operations.meetings.view')
);

create policy meeting_file_access_insert on storage.objects as restrictive
for insert to authenticated
with check (
  bucket_id <> 'task-attachments'
  or not public.is_meeting_schedule_item(((storage.foldername(name))[1])::uuid)
  or (public.has_permission('operations.meetings.view') and public.has_permission('operations.meetings.manage'))
);

create policy meeting_file_access_delete on storage.objects as restrictive
for delete to authenticated
using (
  bucket_id <> 'task-attachments'
  or not public.is_meeting_schedule_item(((storage.foldername(name))[1])::uuid)
  or (public.has_permission('operations.meetings.view') and public.has_permission('operations.meetings.manage'))
);

