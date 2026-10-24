alter table public.payments
  add column if not exists approval_snapshot_is_legacy boolean not null default false;

comment on column public.payments.approval_snapshot_is_legacy is
  'True when receipt balances were reconstructed at rollout from the current approved ledger rather than recorded atomically at approval.';

update public.payments
set approval_snapshot_is_legacy = true
where status = 'approved';

create or replace function public.capture_payment_contract_snapshot()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.status = 'approved' and old.status is distinct from new.status then
    select grand_total
      into new.contract_total_at_approval
    from public.leads
    where id = new.lead_id;
    new.approval_snapshot_is_legacy := false;
  end if;
  return new;
end;
$function$;
