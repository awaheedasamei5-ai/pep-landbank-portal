create or replace function public.apply_finance_monthly_payment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
declare
  v_schedule public.finance_monthly_payment_schedules%rowtype;
  v_installment record;
  v_remaining numeric(14,2);
  v_apply numeric(14,2);
begin
  if tg_op = 'UPDATE' and old.status = 'approved'
    and (new.status <> 'approved' or new.amount is distinct from old.amount) then
    update public.finance_monthly_payment_schedules
    set status = 'review_required', sms_reminders_enabled = false, updated_at = now()
    where lead_id = old.lead_id and status in ('active','paused');
    update public.finance_monthly_payment_reminder_outbox
    set status = case when status = 'sending' then 'needs_review' else 'cancelled' end, lease_until = null,
        last_error = 'An approved payment changed. Management must review the schedule.', updated_at = now()
    where lead_id = old.lead_id and status in ('queued','sending');
    return new;
  end if;
  if new.status <> 'approved' or (tg_op = 'UPDATE' and old.status = 'approved') then return new; end if;

  select * into v_schedule from public.finance_monthly_payment_schedules
  where lead_id = new.lead_id and status = 'active' for update;
  if not found then return new; end if;
  v_remaining := greatest(coalesce(new.amount, 0), 0);
  for v_installment in
    select id, due_amount, paid_amount from public.finance_monthly_payment_installments
    where schedule_id = v_schedule.id and status in ('scheduled','part_paid')
    order by installment_no for update
  loop
    exit when v_remaining <= 0;
    v_apply := least(v_remaining, v_installment.due_amount - v_installment.paid_amount);
    update public.finance_monthly_payment_installments
    set paid_amount = paid_amount + v_apply,
        status = case when paid_amount + v_apply >= due_amount then 'paid' else 'part_paid' end,
        paid_at = case when paid_amount + v_apply >= due_amount then now() else null end,
        updated_at = now()
    where id = v_installment.id;
    update public.finance_monthly_payment_reminder_outbox
    set status = 'cancelled', lease_until = null,
        last_error = 'This installment was paid before its reminder was sent.', updated_at = now()
    where installment_id = v_installment.id and status = 'queued'
      and v_installment.paid_amount + v_apply >= v_installment.due_amount;
    v_remaining := round(v_remaining - v_apply, 2);
  end loop;

  if not exists (
    select 1 from public.finance_monthly_payment_installments
    where schedule_id = v_schedule.id and status <> 'paid'
  ) then
    update public.finance_monthly_payment_schedules set status = 'completed', updated_at = now()
    where id = v_schedule.id;
    update public.finance_monthly_payment_reminder_outbox
    set status = 'cancelled', lease_until = null, last_error = 'Client payment plan is complete.', updated_at = now()
    where schedule_id = v_schedule.id and status = 'queued';
  end if;
  return new;
end;
$$;

