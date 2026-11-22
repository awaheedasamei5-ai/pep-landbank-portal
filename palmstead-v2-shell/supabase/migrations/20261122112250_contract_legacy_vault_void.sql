-- Legacy contract records have no stored PDF. Keep their history while
-- allowing Management to remove an erroneous entry from the active vault.
alter table public.contracts
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by text,
  add column if not exists void_reason text;

create or replace function public.stamp_legacy_contract_void()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if old.voided_at is not null or new.voided_at is null then
    raise exception 'A contract can only be removed from the active vault once';
  end if;
  if length(trim(coalesce(new.void_reason, ''))) < 5 then
    raise exception 'A reason of at least five characters is required';
  end if;
  new.voided_at := now();
  new.voided_by := public.my_key();
  return new;
end;
$$;

drop trigger if exists legacy_contract_void_stamp on public.contracts;
create trigger legacy_contract_void_stamp before update on public.contracts
for each row execute function public.stamp_legacy_contract_void();

drop policy if exists contracts_ins on public.contracts;
create policy contracts_ins on public.contracts
for insert to authenticated with check (
  public.has_permission('contracts.generate')
  and voided_at is null and voided_by is null and void_reason is null
);

drop policy if exists contracts_void on public.contracts;
create policy contracts_void on public.contracts
for update to authenticated
using (public.my_role() = 'manager' and voided_at is null)
with check (
  public.my_role() = 'manager'
  and voided_at is not null
  and voided_by = public.my_key()
  and length(trim(coalesce(void_reason, ''))) >= 5
);

revoke update, delete on public.contracts from anon, authenticated;
grant update (voided_at, void_reason) on public.contracts to authenticated;

