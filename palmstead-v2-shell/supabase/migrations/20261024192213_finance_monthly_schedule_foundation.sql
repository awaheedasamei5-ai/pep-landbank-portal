-- An explicit contract-backed schedule is required before a monthly client
-- can receive payment reminders. Legacy free-text plans are never enrolled
-- automatically. The same month-day is retained; short months use month-end.

create table if not exists public.finance_monthly_payment_schedules (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  plan_months smallint not null check (plan_months in (3, 6, 9, 12)),
  first_payment_date date not null,
  anchor_day smallint not null check (anchor_day between 1 and 31),
  contract_total numeric(14,2) not null check (contract_total > 0),
  deposit_target numeric(14,2) not null check (deposit_target >= 0),
  sms_reminders_enabled boolean not null default false,
  sms_consent_recorded_at timestamptz,
  sms_consent_recorded_by uuid references auth.users(id) on delete set null,
  sms_consent_phone text,
  sms_consent_revoked_at timestamptz,
  sms_consent_revoked_by uuid references auth.users(id) on delete set null,
  status text not null default 'active'
    check (status in ('active','paused','completed','review_required','superseded')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((sms_reminders_enabled and sms_consent_recorded_at is not null and sms_consent_phone is not null)
      or not sms_reminders_enabled)
);

create table if not exists public.finance_monthly_payment_installments (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.finance_monthly_payment_schedules(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  installment_no smallint not null check (installment_no between 1 and 12),
  due_date date not null,
  due_amount numeric(14,2) not null check (due_amount > 0),
  paid_amount numeric(14,2) not null default 0 check (paid_amount >= 0),
  status text not null default 'scheduled'
    check (status in ('scheduled','part_paid','paid','cancelled')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (schedule_id, installment_no),
  check (paid_amount <= due_amount)
);

create table if not exists public.finance_monthly_payment_reminder_outbox (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.finance_monthly_payment_schedules(id) on delete cascade,
  installment_id uuid not null references public.finance_monthly_payment_installments(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  idempotency_key text not null unique,
  status text not null default 'queued'
    check (status in ('queued','sending','accepted','failed','needs_review','blocked','cancelled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  provider_accepted_at timestamptz,
  provider_reference text,
  last_error text,
  provider_status jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.finance_monthly_payment_schedules enable row level security;
alter table public.finance_monthly_payment_installments enable row level security;
alter table public.finance_monthly_payment_reminder_outbox enable row level security;
revoke all on public.finance_monthly_payment_schedules,
  public.finance_monthly_payment_installments,
  public.finance_monthly_payment_reminder_outbox from public, anon, authenticated;
grant select on public.finance_monthly_payment_schedules,
  public.finance_monthly_payment_installments to authenticated;
grant select on public.finance_monthly_payment_reminder_outbox to authenticated;
grant all on public.finance_monthly_payment_schedules,
  public.finance_monthly_payment_installments,
  public.finance_monthly_payment_reminder_outbox to service_role;

drop policy if exists finance_monthly_schedule_manager_read on public.finance_monthly_payment_schedules;
create policy finance_monthly_schedule_manager_read on public.finance_monthly_payment_schedules
  for select to authenticated using (
    public.my_role() = 'manager'
    or exists (select 1 from public.leads lead where lead.id = lead_id and lead.agent_key = public.my_key() and lead.deleted_at is null)
  );
drop policy if exists finance_monthly_installment_manager_read on public.finance_monthly_payment_installments;
create policy finance_monthly_installment_manager_read on public.finance_monthly_payment_installments
  for select to authenticated using (
    public.my_role() = 'manager'
    or exists (select 1 from public.leads lead where lead.id = lead_id and lead.agent_key = public.my_key() and lead.deleted_at is null)
  );
drop policy if exists finance_monthly_reminder_manager_read on public.finance_monthly_payment_reminder_outbox;
create policy finance_monthly_reminder_manager_read on public.finance_monthly_payment_reminder_outbox
  for select to authenticated using (public.my_role() = 'manager');

create index if not exists finance_monthly_installments_due_idx
  on public.finance_monthly_payment_installments(due_date, schedule_id)
  where status in ('scheduled','part_paid');
create unique index if not exists finance_monthly_one_open_schedule_per_lead
  on public.finance_monthly_payment_schedules(lead_id)
  where status in ('active','paused','review_required');
create index if not exists finance_monthly_reminders_claim_idx
  on public.finance_monthly_payment_reminder_outbox(next_attempt_at, created_at)
  where status = 'queued';

create or replace function public.finance_month_anchor_date(p_anchor date, p_month_offset integer)
returns date
language plpgsql immutable strict
set search_path = public, pg_temp
as $$
declare v_month date; v_day integer;
begin
  if p_month_offset < 0 or p_month_offset > 120 then
    raise exception 'Month offset is out of range.';
  end if;
  v_month := (date_trunc('month', p_anchor)::date + make_interval(months => p_month_offset))::date;
  v_day := least(
    extract(day from p_anchor)::integer,
    extract(day from (v_month + interval '1 month - 1 day'))::integer
  );
  return v_month + (v_day - 1);
end;
$$;

create or replace function public.finance_normalize_ghana_mobile(p_raw text)
returns text
language plpgsql immutable
set search_path = public, pg_temp
as $$
declare v_digits text := regexp_replace(coalesce(p_raw, ''), '\D', '', 'g');
begin
  if v_digits ~ '^0[0-9]{9}$' then return '233' || substr(v_digits, 2); end if;
  if v_digits ~ '^233[0-9]{9}$' then return v_digits; end if;
  return null;
end;
$$;
revoke all on function public.finance_normalize_ghana_mobile(text) from public, anon, authenticated;

create or replace function public.create_finance_monthly_payment_schedule(
  p_lead_id uuid,
  p_sms_consent boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
declare
  v_lead public.leads%rowtype;
  v_months smallint;
  v_anchor date;
  v_schedule_id uuid;
  v_deposit numeric(14,2);
  v_installment_total numeric(14,2);
  v_base_amount numeric(14,2);
  v_remaining numeric(14,2);
  v_paid_to_installments numeric(14,2);
  v_installment_amount numeric(14,2);
  v_paid_amount numeric(14,2);
  v_due_date date;
  v_contact text;
begin
  if auth.uid() is null or public.my_role() is distinct from 'manager' then
    raise exception 'Only Management can create a monthly payment schedule.' using errcode = '42501';
  end if;

  select * into v_lead from public.leads where id = p_lead_id and deleted_at is null for update;
  if not found then raise exception 'Client not found.'; end if;
  v_months := case v_lead.payment_plan
    when '3 Months' then 3 when '6 Months' then 6 when '9 Months' then 9 when '12 Months' then 12 else null end;
  if v_months is null then raise exception 'Only a clear 3, 6, 9 or 12 month plan can be scheduled.'; end if;
  if v_lead.grand_total is null or v_lead.grand_total <= 0 then raise exception 'The contract total is missing.'; end if;
  if exists (select 1 from public.finance_monthly_payment_schedules where lead_id = p_lead_id and status in ('active','paused')) then
    raise exception 'An active schedule already exists for this client.';
  end if;
  update public.finance_monthly_payment_schedules
  set status = 'superseded', sms_reminders_enabled = false, updated_at = now()
  where lead_id = p_lead_id and status = 'review_required';
  update public.finance_monthly_payment_installments installment
  set status = 'cancelled', updated_at = now()
  from public.finance_monthly_payment_schedules schedule
  where schedule.lead_id = p_lead_id and schedule.status = 'superseded'
    and installment.schedule_id = schedule.id and installment.status in ('scheduled','part_paid');
  update public.finance_monthly_payment_reminder_outbox outbox
  set status = case when outbox.status = 'sending' then 'needs_review' else 'cancelled' end, lease_until = null,
      last_error = 'This schedule was replaced after a Management review.', updated_at = now()
  from public.finance_monthly_payment_schedules schedule
  where schedule.lead_id = p_lead_id and schedule.status = 'superseded'
    and outbox.schedule_id = schedule.id and outbox.status in ('queued','sending');
  if exists (select 1 from public.finance_monthly_payment_schedules where lead_id = p_lead_id and status = 'review_required') then
    raise exception 'The prior schedule must be reviewed before it can be replaced.';
  end if;
  select min(payment_date) into v_anchor
  from public.payments where lead_id = p_lead_id and status = 'approved';
  if v_anchor is null then raise exception 'An approved first payment is required before scheduling reminders.'; end if;

  v_contact := public.finance_normalize_ghana_mobile(v_lead.contact);
  if p_sms_consent and v_contact is null then
    raise exception 'A valid Ghana mobile number is required before SMS reminders can be enabled.';
  end if;

  v_deposit := least(
    greatest(coalesce(v_lead.deposit_target, round(coalesce(v_lead.net_total, v_lead.grand_total) * 0.30)), 0),
    v_lead.grand_total
  );
  v_installment_total := round(v_lead.grand_total - v_deposit, 2);
  if v_installment_total <= 0 then raise exception 'There is no installment balance left to schedule.'; end if;
  v_base_amount := round(v_installment_total / v_months);
  v_remaining := v_installment_total;
  v_paid_to_installments := greatest(coalesce(v_lead.amt_paid, 0) - v_deposit, 0);

  insert into public.finance_monthly_payment_schedules(
    lead_id, plan_months, first_payment_date, anchor_day, contract_total, deposit_target,
    sms_reminders_enabled, sms_consent_recorded_at, sms_consent_recorded_by, sms_consent_phone, created_by
  ) values (
    p_lead_id, v_months, v_anchor, extract(day from v_anchor)::smallint,
    v_lead.grand_total, v_deposit, coalesce(p_sms_consent, false),
    case when p_sms_consent then now() else null end,
    case when p_sms_consent then auth.uid() else null end,
    case when p_sms_consent then v_contact else null end, auth.uid()
  ) returning id into v_schedule_id;

  for i in 1..v_months loop
    v_installment_amount := case when i = v_months then v_remaining else least(v_base_amount, v_remaining) end;
    v_paid_amount := least(v_installment_amount, v_paid_to_installments);
    v_paid_to_installments := greatest(v_paid_to_installments - v_paid_amount, 0);
    v_due_date := public.finance_month_anchor_date(v_anchor, i);
    insert into public.finance_monthly_payment_installments(
      schedule_id, lead_id, installment_no, due_date, due_amount, paid_amount,
      status, paid_at
    ) values (
      v_schedule_id, p_lead_id, i, v_due_date, v_installment_amount, v_paid_amount,
      case when v_paid_amount >= v_installment_amount then 'paid'
           when v_paid_amount > 0 then 'part_paid' else 'scheduled' end,
      null
    );
    v_remaining := round(v_remaining - v_installment_amount, 2);
  end loop;

  if not exists (
    select 1 from public.finance_monthly_payment_installments
    where schedule_id = v_schedule_id and status <> 'paid'
  ) then
    update public.finance_monthly_payment_schedules set status = 'completed' where id = v_schedule_id;
  end if;
  return v_schedule_id;
end;
$$;

create or replace function public.set_finance_monthly_payment_reminders(p_schedule_id uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
declare v_contact text;
begin
  if auth.uid() is null or public.my_role() is distinct from 'manager' then
    raise exception 'Only Management can change monthly reminders.' using errcode = '42501';
  end if;
  if p_enabled then
    select public.finance_normalize_ghana_mobile(lead.contact) into v_contact
    from public.finance_monthly_payment_schedules schedule
    join public.leads lead on lead.id = schedule.lead_id
    where schedule.id = p_schedule_id and schedule.status = 'active' and lead.deleted_at is null;
    if v_contact is null then
      raise exception 'A valid Ghana mobile number is required before SMS reminders can be enabled.';
    end if;
    update public.finance_monthly_payment_schedules
    set sms_reminders_enabled = true, sms_consent_recorded_at = now(),
        sms_consent_recorded_by = auth.uid(), sms_consent_phone = v_contact, sms_consent_revoked_at = null,
        sms_consent_revoked_by = null, updated_at = now()
    where id = p_schedule_id and status = 'active';
    if not found then raise exception 'Active schedule not found.'; end if;
  else
    update public.finance_monthly_payment_schedules
    set sms_reminders_enabled = false, sms_consent_revoked_at = now(),
        sms_consent_revoked_by = auth.uid(), updated_at = now()
    where id = p_schedule_id and status in ('active','paused');
    update public.finance_monthly_payment_reminder_outbox
    set status = 'cancelled', lease_until = null,
        last_error = 'Management disabled client SMS reminders.', updated_at = now()
    where schedule_id = p_schedule_id and status = 'queued';
  end if;
end;
$$;
