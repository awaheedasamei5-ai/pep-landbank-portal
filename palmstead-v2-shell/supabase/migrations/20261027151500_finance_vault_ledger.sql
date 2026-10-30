-- Only confirmed, balanced journal lines affect these vault balances.
-- Legacy payments/expenses are deliberately not imported as cash movements.
create policy finance_roles_self_read on public.finance_role_assignments for select to authenticated
  using (profile_id = (select auth.uid()) and exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.active
  ));

create or replace function public.finance_can_view_treasury()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.active and p.role = 'manager')
    or exists (select 1 from public.finance_role_assignments a
      join public.profiles p on p.id=a.profile_id
      where a.profile_id = (select auth.uid()) and a.revoked_at is null and p.active
        and a.finance_role in ('finance_head','finance_operator','auditor'));
$$;
revoke all on function public.finance_can_view_treasury() from public, anon;
grant execute on function public.finance_can_view_treasury() to authenticated;

create table public.finance_vaults (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_-]{2,24}$'),
  name text not null check (length(btrim(name)) between 3 and 100),
  kind text not null check (kind in ('bank','cash')),
  currency text not null default 'GHS' check (currency = 'GHS'),
  bank_name text,
  account_last4 text check (account_last4 is null or account_last4 ~ '^[0-9]{4}$'),
  custodian_profile_id uuid references public.profiles(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id),
  check ((kind = 'bank' and bank_name is not null and length(btrim(bank_name)) >= 2)
    or (kind = 'cash' and custodian_profile_id is not null and bank_name is null))
);
create table public.finance_vault_journals (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('opening','bank_to_cash','reversal')),
  source_vault_id uuid references public.finance_vaults(id),
  destination_vault_id uuid references public.finance_vaults(id),
  amount numeric(18,2) not null check (amount > 0),
  evidence_reference text not null check (length(btrim(evidence_reference)) between 4 and 200),
  note text not null default '',
  idempotency_key uuid not null unique,
  reversal_of uuid unique references public.finance_vault_journals(id),
  posted_at timestamptz not null default now(),
  posted_by uuid not null references public.profiles(id),
  check (
    (kind = 'opening' and source_vault_id is null and destination_vault_id is not null and reversal_of is null)
    or (kind = 'bank_to_cash' and source_vault_id is not null and destination_vault_id is not null
      and source_vault_id <> destination_vault_id and reversal_of is null)
    or (kind = 'reversal' and reversal_of is not null)
  )
);
create table public.finance_vault_lines (
  id uuid primary key default gen_random_uuid(),
  journal_id uuid not null references public.finance_vault_journals(id),
  vault_id uuid references public.finance_vaults(id),
  contra_account text check (contra_account is null or contra_account = 'opening_equity'),
  side text not null check (side in ('debit','credit')),
  amount numeric(18,2) not null check (amount > 0),
  check ((vault_id is null) <> (contra_account is null))
);
create index finance_vault_lines_vault_idx on public.finance_vault_lines(vault_id,journal_id) where vault_id is not null;
create index finance_vault_journals_date_idx on public.finance_vault_journals(posted_at desc);

alter table public.finance_vaults enable row level security;
alter table public.finance_vault_journals enable row level security;
alter table public.finance_vault_lines enable row level security;
revoke all on public.finance_vaults, public.finance_vault_journals, public.finance_vault_lines from anon;
grant select on public.finance_vaults, public.finance_vault_journals, public.finance_vault_lines to authenticated;
create policy finance_vault_read on public.finance_vaults for select to authenticated using (public.finance_can_view_treasury());
create policy finance_vault_journal_read on public.finance_vault_journals for select to authenticated using (public.finance_can_view_treasury());
create policy finance_vault_line_read on public.finance_vault_lines for select to authenticated using (public.finance_can_view_treasury());

create or replace function app_finance_private.require_finance_head()
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null or not exists (
    select 1 from public.finance_role_assignments a join public.profiles p on p.id=a.profile_id
    where a.profile_id=v_actor and a.finance_role='finance_head' and a.revoked_at is null and p.active
  ) then raise exception 'An active Head of Finance assignment is required.' using errcode='42501'; end if;
  return v_actor;
end;
$$;
revoke all on function app_finance_private.require_finance_head() from public, anon, authenticated;

create or replace function app_finance_private.check_vault_journal()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_id uuid := case when tg_table_name='finance_vault_journals' then new.id else new.journal_id end;
declare v_count integer; v_debit numeric; v_credit numeric;
begin
  select count(*),coalesce(sum(amount) filter(where side='debit'),0),coalesce(sum(amount) filter(where side='credit'),0)
    into v_count,v_debit,v_credit from public.finance_vault_lines where journal_id=v_id;
  if v_count <> 2 or v_debit <> v_credit then
    raise exception 'Vault journal must have two balanced lines.' using errcode='23514';
  end if;
  return new;
end;
$$;
revoke all on function app_finance_private.check_vault_journal() from public, anon, authenticated;
create constraint trigger finance_vault_journal_balance after insert on public.finance_vault_journals
  deferrable initially deferred for each row execute function app_finance_private.check_vault_journal();

create or replace function app_finance_private.keep_vault_journal_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Posted vault journals and lines are immutable; record a reversal.' using errcode='42501';
end;
$$;
revoke all on function app_finance_private.keep_vault_journal_immutable() from public, anon, authenticated;
create trigger finance_vault_journal_immutable before update or delete on public.finance_vault_journals
  for each row execute function app_finance_private.keep_vault_journal_immutable();
create trigger finance_vault_line_immutable before update or delete on public.finance_vault_lines
  for each row execute function app_finance_private.keep_vault_journal_immutable();

create or replace function public.finance_create_vault(p_code text,p_name text,p_kind text,p_bank_name text,p_account_last4 text,p_custodian_profile_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := app_finance_private.require_manager(); v_id uuid;
begin
  if p_kind = 'cash' and not exists (
    select 1 from public.profiles p where p.id=p_custodian_profile_id and p.active
  ) then raise exception 'Choose an active cash custodian.' using errcode='22023'; end if;
  insert into public.finance_vaults(code,name,kind,bank_name,account_last4,custodian_profile_id,created_by)
  values(upper(btrim(p_code)),btrim(p_name),p_kind,nullif(btrim(p_bank_name),''),nullif(btrim(p_account_last4),''),p_custodian_profile_id,v_actor)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.finance_create_vault(text,text,text,text,text,uuid) from public, anon;
grant execute on function public.finance_create_vault(text,text,text,text,text,uuid) to authenticated;

create or replace function public.finance_list_vault_balances()
returns table(id uuid,code text,name text,kind text,currency text,bank_name text,account_last4 text,custodian_profile_id uuid,active boolean,balance numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.finance_can_view_treasury() then raise exception 'Finance access required.' using errcode='42501'; end if;
  return query select v.id,v.code,v.name,v.kind,v.currency,v.bank_name,v.account_last4,v.custodian_profile_id,v.active,
    coalesce(sum(case when l.side='debit' then l.amount else -l.amount end),0)::numeric(18,2)
  from public.finance_vaults v left join public.finance_vault_lines l on l.vault_id=v.id
  group by v.id order by v.kind,v.name;
end;
$$;
revoke all on function public.finance_list_vault_balances() from public, anon;
grant execute on function public.finance_list_vault_balances() to authenticated;

create or replace function public.finance_record_vault_opening(p_vault_id uuid,p_amount numeric,p_evidence_reference text,p_note text,p_idempotency_key uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := app_finance_private.require_finance_head(); v_id uuid; v_existing public.finance_vault_journals%rowtype;
begin
  if p_idempotency_key is null or p_amount is null or p_amount <= 0 or round(p_amount,2) <> p_amount
    or length(btrim(coalesce(p_evidence_reference,''))) < 4 then raise exception 'A positive amount, evidence reference and unique key are required.' using errcode='22023'; end if;
  select * into v_existing from public.finance_vault_journals where idempotency_key=p_idempotency_key;
  if found then
    if v_existing.kind <> 'opening' or v_existing.destination_vault_id <> p_vault_id or v_existing.amount <> p_amount
      or v_existing.evidence_reference <> btrim(p_evidence_reference) then raise exception 'Idempotency key reused for different opening.' using errcode='22023'; end if;
    return v_existing.id;
  end if;
  perform 1 from public.finance_vaults where id=p_vault_id and active for update;
  if not found then raise exception 'Choose an active vault.' using errcode='22023'; end if;
  select * into v_existing from public.finance_vault_journals where idempotency_key=p_idempotency_key;
  if found then
    if v_existing.kind <> 'opening' or v_existing.destination_vault_id <> p_vault_id or v_existing.amount <> p_amount
      or v_existing.evidence_reference <> btrim(p_evidence_reference) then raise exception 'Idempotency key reused for different opening.' using errcode='22023'; end if;
    return v_existing.id;
  end if;
  if exists(select 1 from public.finance_vault_lines where vault_id=p_vault_id) then
    raise exception 'An opening can only be recorded before vault movements.' using errcode='22023';
  end if;
  insert into public.finance_vault_journals(kind,destination_vault_id,amount,evidence_reference,note,idempotency_key,posted_by)
  values('opening',p_vault_id,p_amount,btrim(p_evidence_reference),coalesce(p_note,''),p_idempotency_key,v_actor) returning id into v_id;
  insert into public.finance_vault_lines(journal_id,vault_id,side,amount) values(v_id,p_vault_id,'debit',p_amount);
  insert into public.finance_vault_lines(journal_id,contra_account,side,amount) values(v_id,'opening_equity','credit',p_amount);
  return v_id;
end;
$$;
revoke all on function public.finance_record_vault_opening(uuid,numeric,text,text,uuid) from public, anon;
grant execute on function public.finance_record_vault_opening(uuid,numeric,text,text,uuid) to authenticated;

create or replace function public.finance_transfer_bank_to_cash(p_source_id uuid,p_destination_id uuid,p_amount numeric,p_evidence_reference text,p_note text,p_idempotency_key uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := app_finance_private.require_finance_head(); v_existing public.finance_vault_journals%rowtype; v_id uuid; v_source public.finance_vaults%rowtype; v_target public.finance_vaults%rowtype; v_balance numeric;
begin
  if p_idempotency_key is null or p_source_id is null or p_destination_id is null or p_source_id=p_destination_id
    or p_amount is null or p_amount <= 0 or round(p_amount,2) <> p_amount
    or length(btrim(coalesce(p_evidence_reference,''))) < 4 then raise exception 'Choose two vaults, a positive amount, evidence reference and unique key.' using errcode='22023'; end if;
  select * into v_existing from public.finance_vault_journals where idempotency_key=p_idempotency_key;
  if found then
    if v_existing.kind <> 'bank_to_cash' or v_existing.source_vault_id <> p_source_id
      or v_existing.destination_vault_id <> p_destination_id or v_existing.amount <> p_amount
      or v_existing.evidence_reference <> btrim(p_evidence_reference) then raise exception 'Idempotency key reused for different transfer.' using errcode='22023'; end if;
    return v_existing.id;
  end if;
  -- Stable lock order prevents opposing transfers from deadlocking.
  perform 1 from public.finance_vaults where id in (p_source_id,p_destination_id) order by id for update;
  select * into v_source from public.finance_vaults where id=p_source_id;
  select * into v_target from public.finance_vaults where id=p_destination_id;
  if v_source.id is null or v_target.id is null or v_source.kind <> 'bank' or v_target.kind <> 'cash'
    or not v_source.active or not v_target.active then
    raise exception 'Transfer requires an active bank source and cash destination.' using errcode='22023';
  end if;
  select * into v_existing from public.finance_vault_journals where idempotency_key=p_idempotency_key;
  if found then
    if v_existing.kind <> 'bank_to_cash' or v_existing.source_vault_id <> p_source_id
      or v_existing.destination_vault_id <> p_destination_id or v_existing.amount <> p_amount
      or v_existing.evidence_reference <> btrim(p_evidence_reference) then raise exception 'Idempotency key reused for different transfer.' using errcode='22023'; end if;
    return v_existing.id;
  end if;
  select coalesce(sum(case when side='debit' then amount else -amount end),0) into v_balance
    from public.finance_vault_lines where vault_id=p_source_id;
  if v_balance < p_amount then raise exception 'Insufficient recorded bank balance.' using errcode='22023'; end if;
  insert into public.finance_vault_journals(kind,source_vault_id,destination_vault_id,amount,evidence_reference,note,idempotency_key,posted_by)
  values('bank_to_cash',p_source_id,p_destination_id,p_amount,btrim(p_evidence_reference),coalesce(p_note,''),p_idempotency_key,v_actor) returning id into v_id;
  insert into public.finance_vault_lines(journal_id,vault_id,side,amount) values(v_id,p_destination_id,'debit',p_amount);
  insert into public.finance_vault_lines(journal_id,vault_id,side,amount) values(v_id,p_source_id,'credit',p_amount);
  return v_id;
end;
$$;
revoke all on function public.finance_transfer_bank_to_cash(uuid,uuid,numeric,text,text,uuid) from public, anon;
grant execute on function public.finance_transfer_bank_to_cash(uuid,uuid,numeric,text,text,uuid) to authenticated;

create or replace function public.finance_reverse_vault_journal(p_original_id uuid,p_evidence_reference text,p_note text,p_idempotency_key uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := app_finance_private.require_finance_head(); v_original public.finance_vault_journals%rowtype;
declare v_existing public.finance_vault_journals%rowtype; v_id uuid; v_negative_vault uuid; v_balance numeric;
begin
  if p_idempotency_key is null or length(btrim(coalesce(p_evidence_reference,''))) < 4
    or length(btrim(coalesce(p_note,''))) < 5 then
    raise exception 'Reversal needs an evidence reference, reason and unique key.' using errcode='22023';
  end if;
  select * into v_existing from public.finance_vault_journals where idempotency_key=p_idempotency_key;
  if found then
    if v_existing.kind <> 'reversal' or v_existing.reversal_of <> p_original_id
      or v_existing.evidence_reference <> btrim(p_evidence_reference) then
      raise exception 'Idempotency key reused for different reversal.' using errcode='22023';
    end if;
    return v_existing.id;
  end if;
  select * into v_original from public.finance_vault_journals where id=p_original_id;
  if v_original.id is null or v_original.kind='reversal' then
    raise exception 'Choose an original opening or transfer.' using errcode='22023';
  end if;
  perform 1 from public.finance_vaults
    where id in (v_original.source_vault_id,v_original.destination_vault_id) order by id for update;
  if exists(select 1 from public.finance_vault_journals where reversal_of=p_original_id) then
    raise exception 'This journal has already been reversed.' using errcode='22023';
  end if;
  v_negative_vault := v_original.destination_vault_id;
  select coalesce(sum(case when side='debit' then amount else -amount end),0) into v_balance
    from public.finance_vault_lines where vault_id=v_negative_vault;
  if v_balance < v_original.amount then
    raise exception 'Reversal would make a vault balance negative.' using errcode='22023';
  end if;
  insert into public.finance_vault_journals(kind,source_vault_id,destination_vault_id,amount,evidence_reference,note,idempotency_key,reversal_of,posted_by)
  values('reversal',v_original.source_vault_id,v_original.destination_vault_id,v_original.amount,
    btrim(p_evidence_reference),btrim(p_note),p_idempotency_key,p_original_id,v_actor) returning id into v_id;
  insert into public.finance_vault_lines(journal_id,vault_id,contra_account,side,amount)
    select v_id,vault_id,contra_account,case when side='debit' then 'credit' else 'debit' end,amount
    from public.finance_vault_lines where journal_id=p_original_id;
  return v_id;
end;
$$;
revoke all on function public.finance_reverse_vault_journal(uuid,text,text,uuid) from public, anon;
grant execute on function public.finance_reverse_vault_journal(uuid,text,text,uuid) to authenticated;
