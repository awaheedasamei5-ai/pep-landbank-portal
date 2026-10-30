-- A payroll run can be prepared before every payee has salary components,
-- but a blank or non-positive run must never be signed as a payment order.
create or replace function app_finance_private.check_payroll_signoff()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.payroll_run_lines where payroll_run_id = new.id
  ) then
    raise exception 'Cannot sign off an empty payroll run';
  end if;

  if exists (
    select 1
      from public.payroll_run_lines
     where payroll_run_id = new.id
     group by payroll_staff_id
    having sum(case when component_type = 'earning' then amount else -amount end) <= 0
  ) then
    raise exception 'Every payee must have positive net pay before sign-off';
  end if;
  return new;
end;
$$;

revoke all on function app_finance_private.check_payroll_signoff() from public, anon, authenticated;
drop trigger if exists finance_payroll_signoff_guard on public.payroll_runs;
create trigger finance_payroll_signoff_guard
before update of status on public.payroll_runs
for each row
when (new.status = 'signed_off' and old.status is distinct from new.status)
execute function app_finance_private.check_payroll_signoff();
