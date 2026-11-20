-- Denying Company Leads view must also stop shared-record creation.
-- Keep the trusted team's existing non-company lead access intact.
drop policy if exists leads_ins on public.leads;
create policy leads_ins on public.leads for insert to authenticated
with check (
  (
    agent_key = public.my_key()
    or public.my_role() = 'manager'
    or (agent_key = 'company' and public.has_permission('company_leads.view') and public.has_permission('company_leads.create'))
    or (agent_key <> 'company' and public.my_key() = any (array['elias', 'emmanuel', 'elizabeth']))
  )
  and (
    amt_paid is null or amt_paid = 0
    or public.my_key() = any (array['elias', 'emmanuel', 'elizabeth'])
    or public.my_role() = 'manager'
  )
);

drop policy if exists leads_sel on public.leads;
create policy leads_sel on public.leads for select to authenticated
using (
  (
    agent_key = public.my_key()
    or public.my_role() = 'manager'
    or (agent_key = 'company' and public.has_permission('company_leads.view'))
    or (agent_key <> 'company' and public.my_key() = any (array['elias', 'emmanuel', 'elizabeth']))
  )
  and (deleted_at is null or public.my_role() = 'manager')
);

