-- Site Visit booking and authorization are shared company workflows.
-- Keep personal leads and their RLS unchanged. A Management override can
-- still revoke this cross-staff read for an individual agent.
insert into public.role_permissions (role, permission_key)
values ('agent', 'site_visits.view_all')
on conflict do nothing;

-- The Experience screen is available to every active staff account, but
-- the legacy insert policy only allowed three named staff to send invites.
drop policy if exists svei_staff_ins on public.site_visit_experience_invites;
create policy svei_staff_ins on public.site_visit_experience_invites
for insert to authenticated
with check (
  coalesce(public.my_key(), '') <> ''
  and sent_by = public.my_key()
  and exists (
    select 1 from public.site_visits v
    where v.id = site_visit_id and v.deleted_at is null
  )
);
