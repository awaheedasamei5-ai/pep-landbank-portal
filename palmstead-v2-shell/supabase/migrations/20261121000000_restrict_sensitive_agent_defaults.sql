-- The test-era permission repair copied every permission to the agent role.
-- Existing named staff overrides already identify the people who need these
-- cross-staff and financial actions. Keep those overrides and Management's
-- built-in access while removing the blanket Staff grants.
delete from public.role_permissions
where role = 'agent'
  and permission_key in (
    'allocations.manage',
    'contracts.generate',
    'payments.manage',
    'ops.view_all'
  );

update public.permissions set description =
  'Review and change allocation requests across staff. Staff can still work on their own requests.'
where key = 'allocations.manage';

update public.permissions set description =
  'Create Contract of Sale records for authorized client transactions.'
where key = 'contracts.generate';

update public.permissions set description =
  'Record, edit, and delete approved client payments. Grant only to designated finance staff.'
where key = 'payments.manage';

update public.permissions set description =
  'Read cross-staff payments, contracts, and site visits. Grant only to designated oversight staff.'
where key = 'ops.view_all';

update public.permissions set description =
  'Create a company poll for staff to vote on.'
where key = 'polls.create';

