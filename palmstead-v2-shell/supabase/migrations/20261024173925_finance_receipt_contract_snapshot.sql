alter table public.payments
  add column if not exists contract_total_at_approval numeric;

comment on column public.payments.contract_total_at_approval is
  'Client contract amount at the time this payment was approved; used as an immutable receipt snapshot.';

update public.payments p
set contract_total_at_approval = l.grand_total
from public.leads l
where l.id = p.lead_id
  and p.status = 'approved'
  and p.contract_total_at_approval is null;

create or replace function public.capture_payment_contract_snapshot()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.status = 'approved'
     and old.status is distinct from new.status
     and new.contract_total_at_approval is null then
    select grand_total
      into new.contract_total_at_approval
    from public.leads
    where id = new.lead_id;
  end if;
  return new;
end;
$function$;

drop trigger if exists capture_payment_contract_snapshot on public.payments;
create trigger capture_payment_contract_snapshot
before update of status on public.payments
for each row execute function public.capture_payment_contract_snapshot();

