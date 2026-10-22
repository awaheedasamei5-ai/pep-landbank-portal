-- Server-enforced own-comment create, update and delete for Operations.
-- Add RPCs first; direct table writes are restricted only after all callers use these.
create or replace function app_operations_private.create_issue_comment(
  p_issue_id uuid,
  p_comment_html text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype := app_operations_private.current_actor();
  v_issue public.op_issues%rowtype;
  v_comment public.op_issue_comments%rowtype;
begin
  if p_comment_html is null or length(btrim(p_comment_html)) = 0 or length(p_comment_html) > 120000 then
    raise exception 'Comment must contain text and be no longer than 20,000 characters.' using errcode = '22023';
  end if;

  select i.* into v_issue
  from public.op_issues i
  where i.id = p_issue_id
  for share;

  if not found then raise exception 'Work item not found.' using errcode = 'P0002'; end if;
  if v_issue.archived_at is not null then raise exception 'Restore this work item before commenting.' using errcode = '22023'; end if;
  if not app_operations_private.can_edit_issue(v_actor, v_issue) then
    raise exception 'You do not have permission to comment on this work item.' using errcode = '42501';
  end if;

  insert into public.op_issue_comments(issue_id, comment_html, actor_key)
  values (v_issue.id, p_comment_html, v_actor.agent_key)
  returning * into v_comment;

  return to_jsonb(v_comment);
end;
$$;

create or replace function app_operations_private.update_issue_comment(
  p_comment_id uuid,
  p_expected_updated_at timestamptz,
  p_comment_html text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype := app_operations_private.current_actor();
  v_comment public.op_issue_comments%rowtype;
  v_issue public.op_issues%rowtype;
begin
  if p_comment_html is null or length(btrim(p_comment_html)) = 0 or length(p_comment_html) > 120000 then
    raise exception 'Comment must contain text and be no longer than 20,000 characters.' using errcode = '22023';
  end if;

  select c.* into v_comment
  from public.op_issue_comments c
  where c.id = p_comment_id
  for update;

  if not found then raise exception 'Comment not found.' using errcode = 'P0002'; end if;
  if v_comment.actor_key is distinct from v_actor.agent_key then
    raise exception 'You can edit only your own comments.' using errcode = '42501';
  end if;
  if p_expected_updated_at is null or v_comment.updated_at is distinct from p_expected_updated_at then
    raise exception 'This comment changed after you opened it. Reload and try again.' using errcode = '40001';
  end if;

  select i.* into v_issue from public.op_issues i where i.id = v_comment.issue_id for share;
  if not found then raise exception 'Work item not found.' using errcode = 'P0002'; end if;
  if v_issue.archived_at is not null then raise exception 'Restore this work item before editing its comment.' using errcode = '22023'; end if;

  update public.op_issue_comments
  set comment_html = p_comment_html, updated_at = clock_timestamp()
  where id = v_comment.id
  returning * into v_comment;

  return to_jsonb(v_comment);
end;
$$;

create or replace function app_operations_private.delete_issue_comment(
  p_comment_id uuid,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype := app_operations_private.current_actor();
  v_comment public.op_issue_comments%rowtype;
  v_issue public.op_issues%rowtype;
begin
  select c.* into v_comment
  from public.op_issue_comments c
  where c.id = p_comment_id
  for update;

  if not found then raise exception 'Comment not found.' using errcode = 'P0002'; end if;
  if v_comment.actor_key is distinct from v_actor.agent_key then
    raise exception 'You can delete only your own comments.' using errcode = '42501';
  end if;
  if p_expected_updated_at is null or v_comment.updated_at is distinct from p_expected_updated_at then
    raise exception 'This comment changed after you opened it. Reload and try again.' using errcode = '40001';
  end if;

  select i.* into v_issue from public.op_issues i where i.id = v_comment.issue_id for share;
  if not found then raise exception 'Work item not found.' using errcode = 'P0002'; end if;
  if v_issue.archived_at is not null then raise exception 'Restore this work item before deleting its comment.' using errcode = '22023'; end if;

  delete from public.op_issue_comments where id = v_comment.id;
  return to_jsonb(v_comment);
end;
$$;

create or replace function public.create_operation_issue_comment(p_issue_id uuid, p_comment_html text)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select app_operations_private.create_issue_comment(p_issue_id, p_comment_html) $$;

create or replace function public.update_operation_issue_comment(
  p_comment_id uuid,
  p_expected_updated_at timestamptz,
  p_comment_html text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select app_operations_private.update_issue_comment(p_comment_id, p_expected_updated_at, p_comment_html) $$;

create or replace function public.delete_operation_issue_comment(p_comment_id uuid, p_expected_updated_at timestamptz)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select app_operations_private.delete_issue_comment(p_comment_id, p_expected_updated_at) $$;

revoke all on function app_operations_private.create_issue_comment(uuid, text) from public, anon;
revoke all on function app_operations_private.update_issue_comment(uuid, timestamptz, text) from public, anon;
revoke all on function app_operations_private.delete_issue_comment(uuid, timestamptz) from public, anon;
grant execute on function app_operations_private.create_issue_comment(uuid, text) to authenticated;
grant execute on function app_operations_private.update_issue_comment(uuid, timestamptz, text) to authenticated;
grant execute on function app_operations_private.delete_issue_comment(uuid, timestamptz) to authenticated;

revoke all on function public.create_operation_issue_comment(uuid, text) from public, anon;
revoke all on function public.update_operation_issue_comment(uuid, timestamptz, text) from public, anon;
revoke all on function public.delete_operation_issue_comment(uuid, timestamptz) from public, anon;
grant execute on function public.create_operation_issue_comment(uuid, text) to authenticated;
grant execute on function public.update_operation_issue_comment(uuid, timestamptz, text) to authenticated;
grant execute on function public.delete_operation_issue_comment(uuid, timestamptz) to authenticated;
