-- APPLIED 2026-10-13 after owner approval. Target: V2 Supabase project
-- sbydzrlzqxcdbudjaube. Kept here as the source record for the live change.
--
-- This reuses the existing schedule_items / schedule_item_invitees model.
-- It does not create calendar tables, mutate schedule data, or touch V1.
-- Direct invitee UPDATE currently lets a row owner edit identity fields as
-- well as RSVP state. Restrict client updates and expose a narrowly scoped
-- self-response function instead.

begin;

revoke update on table public.schedule_item_invitees from anon, authenticated;

create or replace function public.respond_to_schedule_invite(
  p_invitee_id uuid,
  p_response text
)
returns public.schedule_item_invitees
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_invitee public.schedule_item_invitees;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_response not in ('accepted', 'declined') then
    raise exception 'Response must be accepted or declined' using errcode = '22023';
  end if;

  update public.schedule_item_invitees as invitee
     set status = p_response,
         responded_at = pg_catalog.now()
    from public.schedule_items as item
   where invitee.id = p_invitee_id
     and invitee.staff_key = public.my_key()
     and item.id = invitee.schedule_item_id
     and item.kind = 'meeting'
  returning invitee.* into v_invitee;

  if not found then
    raise exception 'Invitation not found or not yours' using errcode = '42501';
  end if;

  return v_invitee;
end;
$function$;

revoke all on function public.respond_to_schedule_invite(uuid, text) from public;
revoke all on function public.respond_to_schedule_invite(uuid, text) from anon;
grant execute on function public.respond_to_schedule_invite(uuid, text) to authenticated;

comment on function public.respond_to_schedule_invite(uuid, text) is
  'Allows an authenticated meeting invitee to accept or decline only their own invitation.';

commit;
