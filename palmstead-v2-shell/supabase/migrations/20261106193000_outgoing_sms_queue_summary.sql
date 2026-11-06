-- SMS engine rebuild Phase B, item 5 (docs/plans/48 Sec 9): a read-only
-- cross-source view of every real SMS outbox/queue in the system, so
-- Management can see pending/problem counts in one place without a full
-- schema unification of the 6 separate tables. Management-only, matching
-- the rest of the Outgoing SMS app's own access gate.
create or replace function public.get_outgoing_sms_queue_summary()
returns table(
  source_label text,
  pending_count integer,
  problem_count integer,
  last_activity_at timestamptz
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $$
begin
  if auth.uid() is null or public.my_role() is distinct from 'manager' then
    raise exception 'Only Management can view the outgoing SMS queue summary.' using errcode = '42501';
  end if;
  return query
  select 'Payment reminders (due-soon / due-today / missed)' as source_label,
    count(*) filter (where status in ('queued','sending'))::int as pending_count,
    count(*) filter (where status in ('failed','needs_review','blocked'))::int as problem_count,
    max(updated_at) as last_activity_at
  from public.finance_monthly_payment_reminder_outbox
  union all
  select 'Allocation-ready notices (staff)',
    count(*) filter (where status in ('pending'))::int,
    count(*) filter (where status in ('failed','needs_review','blocked'))::int,
    max(updated_at)
  from public.allocation_sms_outbox
  union all
  select 'Leave transitions (staff)',
    count(*) filter (where status in ('queued','sending'))::int,
    count(*) filter (where status in ('failed','needs_review'))::int,
    max(coalesce(provider_accepted_at, created_at))
  from public.leave_sms_outbox
  union all
  select 'Sales daily digest (Management)',
    count(*) filter (where status in ('queued','sending'))::int,
    count(*) filter (where status in ('failed','needs_review','blocked'))::int,
    max(updated_at)
  from public.sales_daily_digest_deliveries
  union all
  select 'Closing / nurture SMS (awaiting your review)',
    count(*) filter (where status = 'pending')::int,
    0,
    max(created_at)
  from public.outbound_sms_drafts
  union all
  select 'Overpayment schedule-change proposals (awaiting your review)',
    count(*) filter (where status = 'pending')::int,
    0,
    max(created_at)
  from public.finance_schedule_recalc_proposals;
end;
$$;
revoke all on function public.get_outgoing_sms_queue_summary() from public, anon;
grant execute on function public.get_outgoing_sms_queue_summary() to authenticated;
