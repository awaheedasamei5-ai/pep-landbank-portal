-- A permitted commenter or publisher must still use their own staff identity.
drop policy announcement_comments_access_insert on public.announcement_comments;
create policy announcement_comments_access_insert on public.announcement_comments as restrictive
for insert to authenticated with check (
  public.has_permission('announcements.view')
  and public.has_permission('announcements.comment')
  and author_key = public.my_key()
  and author_name = (select p.name from public.profiles p where p.id = auth.uid())
  and exists (select 1 from public.announcements a where a.id = announcement_id and a.active)
);

drop policy announcements_access_insert on public.announcements;
create policy announcements_access_insert on public.announcements as restrictive
for insert to authenticated with check (
  public.has_permission('announcements.view') and created_by = public.my_key()
);
