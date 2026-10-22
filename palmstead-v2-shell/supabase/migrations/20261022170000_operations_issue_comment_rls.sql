-- Comments are read through RLS and written only through guarded RPCs.
-- The RPCs are SECURITY DEFINER at the private function layer and enforce
-- active actor, work-item access, ownership, archived state and stale versions.
drop policy if exists op_issue_comments_all on public.op_issue_comments;

create policy op_issue_comments_read
on public.op_issue_comments
for select
to authenticated
using (public.my_key() is not null);

revoke insert, update, delete on table public.op_issue_comments from public, anon, authenticated;
grant select on table public.op_issue_comments to authenticated;
