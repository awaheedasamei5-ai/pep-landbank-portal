-- A signed-in staff member can inspect only their own device registrations.
-- The planner needs this to distinguish an active registration for the current
-- account from a previous account's browser subscription on a shared device.
create policy push_subscriptions_select_own_staff
on public.push_subscriptions
for select to authenticated
using (owner_kind = 'staff' and owner_id = (select public.my_key()));
