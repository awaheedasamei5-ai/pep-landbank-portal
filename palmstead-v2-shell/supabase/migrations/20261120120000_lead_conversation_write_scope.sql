-- Match the existing lead-edit boundary for each shared conversation.
-- Personal pipeline owners write to their own leads; Management and the
-- current company-lead editors may write to the shared book.
drop policy if exists lead_conversations_add on public.lead_conversations;

create policy lead_conversations_add on public.lead_conversations
  for insert to authenticated
  with check (
    public.my_role() in ('agent', 'manager')
    and author_key = public.my_key()
    and exists (
      select 1 from public.leads l
      where l.id = lead_conversations.lead_id
        and l.deleted_at is null
        and (
          public.my_role() = 'manager'
          or l.agent_key = public.my_key()
          or public.my_key() = any (array['elias', 'emmanuel', 'elizabeth'])
        )
    )
  );

