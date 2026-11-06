-- Phase I (client-ID integration plan, docs/plans/43 §5.2/§5.3): a real
-- overpayment-driven schedule recalculation, held as a pending proposal
-- for Management to review before the client ever hears about it.
--
-- Design choice, documented here because it's not obvious: the REAL money
-- allocation (apply_finance_monthly_payment's existing loop, which rolls
-- an overpayment forward into future installments in due-date order) is
-- NOT held pending -- it still applies immediately and deterministically,
-- exactly as it already did before this migration. Holding the real
-- installment numbers pending would be actively harmful: it would leave a
-- client who genuinely overpaid looking "still overdue" to Phase H's
-- missed-payment SMS system in the meantime. The only thing genuinely
-- risky enough to gate behind a human is the CLIENT-FACING NOTIFICATION
-- of the change -- so that is the only thing this proposal holds back.

create table public.finance_schedule_recalc_proposals (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.finance_monthly_payment_schedules(id),
  lead_id uuid not null references public.leads(id),
  payment_id uuid not null references public.payments(id),
  overpayment_amount numeric(14,2) not null,
  old_installments jsonb not null,
  new_installments jsonb not null,
  sms_draft text,
  status text not null default 'pending' check (status in ('pending','confirmed','dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users(id),
  dismissed_at timestamptz,
  dismissed_by uuid references auth.users(id),
  unique (payment_id)
);

alter table public.finance_schedule_recalc_proposals enable row level security;

-- Same read shape as finance_monthly_payment_schedules itself: Management
-- sees everything, an agent sees only their own clients'.
create policy finance_schedule_recalc_proposals_read
  on public.finance_schedule_recalc_proposals for select
  using (
    my_role() = 'manager'
    or exists (
      select 1 from public.leads l
      where l.id = finance_schedule_recalc_proposals.lead_id
        and l.agent_key = my_key()
        and l.deleted_at is null
    )
  );
-- No insert/update/delete policy: all writes go through the
-- SECURITY DEFINER functions below (row_security off), same convention
-- already used by finance_monthly_payment_schedules/_installments.

-- Extend the existing, already-proven payment-allocation trigger to also
-- detect a genuine overpayment and record a real pending proposal. The
-- allocation loop itself is byte-for-byte unchanged.
create or replace function public.apply_finance_monthly_payment()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
declare
  v_schedule public.finance_monthly_payment_schedules%rowtype;
  v_installment record;
  v_remaining numeric(14,2);
  v_apply numeric(14,2);
  v_old_snapshot jsonb;
  v_new_snapshot jsonb;
  v_first_remaining numeric(14,2);
  v_overpay numeric(14,2);
  v_payment_amount numeric(14,2);
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

  v_payment_amount := greatest(coalesce(new.amount, 0), 0);
  v_remaining := v_payment_amount;

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'installmentNo', installment_no, 'dueDate', due_date,
      'dueAmount', due_amount, 'paidAmount', paid_amount, 'status', status
    ) order by installment_no), '[]'::jsonb),
    (array_agg(due_amount - paid_amount order by installment_no))[1]
  into v_old_snapshot, v_first_remaining
  from public.finance_monthly_payment_installments
  where schedule_id = v_schedule.id and status in ('scheduled','part_paid');

  v_overpay := greatest(v_payment_amount - coalesce(v_first_remaining, 0), 0);

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

  if v_overpay > 0 then
    select coalesce(jsonb_agg(jsonb_build_object(
      'installmentNo', installment_no, 'dueDate', due_date,
      'dueAmount', due_amount, 'paidAmount', paid_amount, 'status', status
    ) order by installment_no), '[]'::jsonb)
    into v_new_snapshot
    from public.finance_monthly_payment_installments
    where schedule_id = v_schedule.id;

    insert into public.finance_schedule_recalc_proposals(
      schedule_id, lead_id, payment_id, overpayment_amount, old_installments, new_installments
    ) values (
      v_schedule.id, new.lead_id, new.id, v_overpay, v_old_snapshot, v_new_snapshot
    )
    on conflict (payment_id) do nothing;
  end if;

  return new;
end;
$function$;

create or replace function public.save_finance_schedule_recalc_sms_draft(p_id uuid, p_sms_draft text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
set row_security to 'off'
as $function$
declare
  v_row record;
begin
  if coalesce(public.my_role(), '') <> 'manager' then
    raise exception 'Only Management can edit this draft';
  end if;
  select * into v_row from public.finance_schedule_recalc_proposals where id = p_id for update;
  if not found then raise exception 'Recalculation proposal not found'; end if;
  if v_row.status <> 'pending' then raise exception 'This proposal has already been %', v_row.status; end if;

  update public.finance_schedule_recalc_proposals
  set sms_draft = p_sms_draft, updated_at = now()
  where id = p_id;

  return jsonb_build_object('ok', true, 'id', p_id);
end;
$function$;

create or replace function public.confirm_finance_schedule_recalc_proposal(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
set row_security to 'off'
as $function$
declare
  v_row record;
  v_lead record;
begin
  if coalesce(public.my_role(), '') <> 'manager' then
    raise exception 'Only Management can confirm a payment-schedule recalculation';
  end if;
  select * into v_row from public.finance_schedule_recalc_proposals where id = p_id for update;
  if not found then raise exception 'Recalculation proposal not found'; end if;
  if v_row.status <> 'pending' then raise exception 'This proposal has already been %', v_row.status; end if;
  if v_row.sms_draft is null or btrim(v_row.sms_draft) = '' then
    raise exception 'Draft the SMS text before confirming';
  end if;

  select name, contact into v_lead from public.leads where id = v_row.lead_id;

  update public.finance_schedule_recalc_proposals
  set status = 'confirmed', confirmed_at = now(), confirmed_by = auth.uid(), updated_at = now()
  where id = p_id;

  return jsonb_build_object(
    'ok', true, 'id', p_id, 'lead_id', v_row.lead_id,
    'client_name', v_lead.name, 'client_contact', v_lead.contact, 'sms_draft', v_row.sms_draft
  );
end;
$function$;

create or replace function public.dismiss_finance_schedule_recalc_proposal(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
set row_security to 'off'
as $function$
declare
  v_row record;
begin
  if coalesce(public.my_role(), '') <> 'manager' then
    raise exception 'Only Management can dismiss a payment-schedule recalculation';
  end if;
  select * into v_row from public.finance_schedule_recalc_proposals where id = p_id for update;
  if not found then raise exception 'Recalculation proposal not found'; end if;
  if v_row.status <> 'pending' then raise exception 'This proposal has already been %', v_row.status; end if;

  update public.finance_schedule_recalc_proposals
  set status = 'dismissed', dismissed_at = now(), dismissed_by = auth.uid(), updated_at = now()
  where id = p_id;

  return jsonb_build_object('ok', true, 'id', p_id);
end;
$function$;
