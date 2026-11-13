-- Shared, append-only client conversation history. Personal notes remain in public.notes.
create table public.lead_conversations (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete restrict,
  author_key text not null default public.my_key(),
  channel text not null check (channel in ('call', 'meeting', 'site_visit', 'message', 'other')),
  body text not null check (length(btrim(body)) between 1 and 5000),
  next_action text check (next_action is null or length(next_action) <= 500),
  next_action_date date,
  created_at timestamptz not null default now()
);

create index lead_conversations_lead_created_idx
  on public.lead_conversations (lead_id, created_at desc, id desc);

-- The database, rather than a browser clock or editable form value, stamps each entry.
create function public.stamp_lead_conversation()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.author_key := public.my_key();
  new.created_at := now();
  return new;
end;
$$;
revoke all on function public.stamp_lead_conversation() from public, anon, authenticated;
create trigger stamp_lead_conversation_before_insert
  before insert on public.lead_conversations
  for each row execute function public.stamp_lead_conversation();

alter table public.lead_conversations enable row level security;
revoke all on public.lead_conversations from public, anon, authenticated;
grant select, insert on public.lead_conversations to authenticated;

create policy lead_conversations_read on public.lead_conversations
  for select to authenticated
  using (
    public.my_role() in ('agent', 'manager')
    and exists (
      select 1 from public.leads l
      where l.id = lead_conversations.lead_id
        and (l.deleted_at is null or public.my_role() = 'manager')
    )
  );

create policy lead_conversations_add on public.lead_conversations
  for insert to authenticated
  with check (
    public.my_role() in ('agent', 'manager')
    and author_key = public.my_key()
    and exists (
      select 1 from public.leads l
      where l.id = lead_conversations.lead_id and l.deleted_at is null
    )
  );

alter publication supabase_realtime add table public.lead_conversations;
