-- Replace the legacy all-app oversight grant with independent read controls.
insert into public.permissions (key, label, description) values
  ('payments.view_all', 'View all client payments', 'Read payment records across staff. Does not allow recording or changing a payment.'),
  ('contracts.view_all', 'View all contracts', 'Read Contract of Sale records across staff. Does not allow generating a contract.'),
  ('site_visits.view_all', 'View all site visits', 'Read site visit records across staff. Does not allow editing or cancelling another person''s visit.')
on conflict (key) do nothing;

insert into public.staff_permission_overrides (staff_key, permission_key, granted, granted_by, granted_at)
select old.staff_key, new_key.permission_key, old.granted, 'migration:ops.view_all', now()
from public.staff_permission_overrides old
cross join (values ('payments.view_all'), ('contracts.view_all'), ('site_visits.view_all')) as new_key(permission_key)
where old.permission_key = 'ops.view_all'
on conflict (staff_key, permission_key) do nothing;

update public.permissions
set description = 'Legacy grant retained for audit history. Use separate payments, contracts, and site visit access controls.'
where key = 'ops.view_all';

update public.permissions
set description = 'Record and change client payments you can view. Cross-staff viewing requires a separate grant.'
where key = 'payments.manage';

alter policy payments_sel on public.payments using (
  agent_key = public.my_key() or public.has_permission('payments.view_all')
);

alter policy contracts_sel on public.contracts using (
  agent_key = public.my_key()
  or public.has_permission('contracts.view_all')
  or (
    public.my_client_contact_digits() is not null
    and exists (
      select 1 from public.leads l
      where l.id = contracts.lead_id
        and right(regexp_replace(l.contact, '[^0-9]', '', 'g'), 9) = public.my_client_contact_digits()
        and lower(trim(l.name)) = public.my_client_name()
    )
  )
);

alter policy site_visits_sel on public.site_visits using (
  agent_key = public.my_key() or public.has_permission('site_visits.view_all')
);

-- The application records cancellation as an audited soft update. Browser
-- roles must never be able to hard-delete a visit through the Data API.
alter policy site_visits_del on public.site_visits using (false);

-- Cross-staff read access must not confer company-wide dismissal actions.
-- Staff with an oversight read grant must still be able to dismiss their own
-- Data Check alerts, which the previous equality rule accidentally blocked.
alter policy data_check_dismissals_del on public.data_check_dismissals using (
  dismissed_by = public.my_key() or public.my_role() = 'manager'
);
alter policy data_check_dismissals_ins on public.data_check_dismissals with check (
  dismissed_by = public.my_key()
  and (is_company_wide is false or public.my_role() = 'manager')
);

