-- Vendor obligations and evidenced disbursements extend, rather than replace,
-- the existing immutable two-line vault journal. No bank transfer is initiated.
alter table public.finance_vault_journals add column vendor_bill_id uuid references public.finance_vendor_bills(id);
alter table public.finance_vault_journals drop constraint finance_vault_journals_kind_check;
alter table public.finance_vault_journals add constraint finance_vault_journals_kind_check
  check (kind in ('opening','bank_to_cash','reversal','vendor_obligation','vendor_disbursement','vendor_disbursement_reversal'));
alter table public.finance_vault_journals drop constraint finance_vault_journals_check;
alter table public.finance_vault_journals add constraint finance_vault_journals_check check (
  (kind='opening' and source_vault_id is null and destination_vault_id is not null and reversal_of is null and vendor_bill_id is null)
  or (kind='bank_to_cash' and source_vault_id is not null and destination_vault_id is not null
    and source_vault_id<>destination_vault_id and reversal_of is null and vendor_bill_id is null)
  or (kind='reversal' and reversal_of is not null and vendor_bill_id is null)
  or (kind='vendor_obligation' and vendor_bill_id is not null and source_vault_id is null
    and destination_vault_id is null and reversal_of is null)
  or (kind='vendor_disbursement' and vendor_bill_id is not null and source_vault_id is not null
    and destination_vault_id is null and reversal_of is null)
  or (kind='vendor_disbursement_reversal' and vendor_bill_id is not null and source_vault_id is not null
    and destination_vault_id is null and reversal_of is not null)
);
create unique index finance_vendor_obligation_once on public.finance_vault_journals(vendor_bill_id)
  where kind='vendor_obligation';
create index finance_vault_journals_bill_idx on public.finance_vault_journals(vendor_bill_id,posted_at)
  where vendor_bill_id is not null;

alter table public.finance_vault_lines drop constraint finance_vault_lines_contra_account_check;
alter table public.finance_vault_lines add constraint finance_vault_lines_contra_account_check
  check (contra_account is null or contra_account in ('opening_equity','accounts_payable','vendor_expense'));

create table public.finance_vendor_payments (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.finance_vendor_bills(id),
  source_vault_id uuid not null references public.finance_vaults(id),
  journal_id uuid not null unique references public.finance_vault_journals(id),
  amount numeric(18,2) not null check(amount>0),
  paid_on date not null,
  evidence_reference text not null check(length(btrim(evidence_reference)) between 4 and 200),
  proof_path text not null unique check(length(proof_path) between 42 and 160),
  idempotency_key uuid not null unique,
  recorded_at timestamptz not null default now(),
  recorded_by uuid not null references public.profiles(id)
);
create index finance_vendor_payments_bill_idx on public.finance_vendor_payments(bill_id,recorded_at);
create unique index finance_vendor_payment_reference_idx on public.finance_vendor_payments(source_vault_id,lower(btrim(evidence_reference)));

create table public.finance_vendor_payment_reversals (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null unique references public.finance_vendor_payments(id),
  journal_id uuid not null unique references public.finance_vault_journals(id),
  evidence_reference text not null check(length(btrim(evidence_reference)) between 4 and 200),
  reason text not null check(length(btrim(reason)) between 8 and 500),
  recorded_at timestamptz not null default now(),
  recorded_by uuid not null references public.profiles(id)
);
alter table public.finance_vendor_payments enable row level security;
alter table public.finance_vendor_payment_reversals enable row level security;
revoke all on public.finance_vendor_payments,public.finance_vendor_payment_reversals from public,anon,authenticated;
grant select on public.finance_vendor_payments,public.finance_vendor_payment_reversals to authenticated;
create policy finance_vendor_payment_read on public.finance_vendor_payments for select to authenticated
  using (public.finance_can_view_treasury());
create policy finance_vendor_payment_reversal_read on public.finance_vendor_payment_reversals for select to authenticated
  using (public.finance_can_view_treasury());

create or replace function app_finance_private.block_vendor_payment_mutation()
returns trigger language plpgsql set search_path='' as $$
begin
  raise exception 'Posted vendor payments are immutable; record a reversal.' using errcode='42501';
end;
$$;
revoke all on function app_finance_private.block_vendor_payment_mutation() from public,anon,authenticated;
create trigger finance_vendor_payment_immutable before update or delete on public.finance_vendor_payments
  for each row execute function app_finance_private.block_vendor_payment_mutation();
create trigger finance_vendor_payment_reversal_immutable before update or delete on public.finance_vendor_payment_reversals
  for each row execute function app_finance_private.block_vendor_payment_mutation();

-- The approval RPC is the only normal path to status=approved. Its update and
-- this trigger commit in one transaction, so an approval cannot exist without
-- the corresponding expense/payable journal.
create or replace function app_finance_private.post_vendor_obligation()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_journal uuid;
begin
  if old.status<>'submitted' or new.approved_by is null then
    raise exception 'Only an approved submitted bill can create a payable.' using errcode='23514';
  end if;
  insert into public.finance_vault_journals
    (kind,vendor_bill_id,amount,evidence_reference,note,idempotency_key,posted_by)
  values ('vendor_obligation',new.id,new.amount,'BILL-'||new.id::text,
    'Supplier obligation from approved bill',new.id,new.approved_by)
  returning id into v_journal;
  insert into public.finance_vault_lines(journal_id,contra_account,side,amount)
    values(v_journal,'vendor_expense','debit',new.amount),(v_journal,'accounts_payable','credit',new.amount);
  return new;
end;
$$;
revoke all on function app_finance_private.post_vendor_obligation() from public,anon,authenticated;
create trigger finance_vendor_bill_post_obligation after update of status on public.finance_vendor_bills
  for each row when (new.status='approved' and old.status is distinct from new.status)
  execute function app_finance_private.post_vendor_obligation();

-- Storage remains private. Object paths are <bill-id>/<random-uuid>.<pdf|jpg|jpeg|png>.
-- The bucket controls size/MIME; the policy ties uploads to an approved bill.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('finance-vendor-proofs','finance-vendor-proofs',false,5242880,
    array['application/pdf','image/jpeg','image/png'])
  on conflict(id) do nothing;
create policy finance_vendor_proof_read on storage.objects for select to authenticated
  using (bucket_id='finance-vendor-proofs' and public.finance_can_view_treasury()
    and exists(select 1 from public.finance_vendor_bills b
      where b.id::text=(storage.foldername(name))[1]));
create policy finance_vendor_proof_insert on storage.objects for insert to authenticated
  with check (bucket_id='finance-vendor-proofs'
    and storage.filename(name) ~ '^[0-9a-f-]{36}\.(pdf|jpg|jpeg|png)$'
    and exists(select 1 from public.finance_vendor_bills b
      join public.finance_role_assignments a on a.profile_id=auth.uid()
        and a.finance_role='finance_head' and a.revoked_at is null
      join public.profiles p on p.id=a.profile_id and p.active
      where b.id::text=(storage.foldername(name))[1] and b.status='approved'));
create policy finance_vendor_proof_delete_unlinked on storage.objects for delete to authenticated
  using (bucket_id='finance-vendor-proofs' and exists(
    select 1 from public.finance_vendor_bills b
    join public.finance_role_assignments a on a.profile_id=auth.uid()
      and a.finance_role='finance_head' and a.revoked_at is null
    join public.profiles p on p.id=a.profile_id and p.active
    where b.id::text=(storage.foldername(name))[1] and b.status='approved')
    and not exists(select 1 from public.finance_vendor_payments pay where pay.proof_path=name));

create or replace function public.finance_record_vendor_payment(
  p_bill_id uuid,p_vault_id uuid,p_amount numeric,p_paid_on date,p_evidence_reference text,
  p_proof_path text,p_idempotency_key uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=app_finance_private.require_finance_head();
declare v_bill public.finance_vendor_bills%rowtype; v_vault public.finance_vaults%rowtype;
declare v_existing public.finance_vendor_payments%rowtype; v_id uuid; v_journal uuid;
declare v_paid numeric; v_balance numeric; v_object uuid;
begin
  if p_idempotency_key is null or p_bill_id is null or p_vault_id is null or p_amount is null
    or p_amount<=0 or round(p_amount,2)<>p_amount or p_paid_on is null or p_paid_on>current_date
    or length(btrim(coalesce(p_evidence_reference,''))) not between 4 and 200
    or p_proof_path is null or p_proof_path !~ ('^'||p_bill_id::text||'/[0-9a-f-]{36}\.(pdf|jpg|jpeg|png)$') then
    raise exception 'Choose an approved bill, vault, positive amount, payment date, reference and PDF/image proof.' using errcode='22023';
  end if;
  select * into v_existing from public.finance_vendor_payments where idempotency_key=p_idempotency_key;
  if found then
    if v_existing.bill_id<>p_bill_id or v_existing.source_vault_id<>p_vault_id or v_existing.amount<>p_amount
      or v_existing.paid_on<>p_paid_on or v_existing.evidence_reference<>btrim(p_evidence_reference)
      or v_existing.proof_path<>p_proof_path then
      raise exception 'Payment key was reused for different details.' using errcode='22023';
    end if;
    return v_existing.id;
  end if;
  select * into v_bill from public.finance_vendor_bills where id=p_bill_id for update;
  if not found or v_bill.status<>'approved' or p_paid_on<v_bill.invoice_date then
    raise exception 'Choose an approved bill and a date on or after its invoice date.' using errcode='22023';
  end if;
  select * into v_vault from public.finance_vaults where id=p_vault_id for update;
  if not found or not v_vault.active then raise exception 'Choose an active funding vault.' using errcode='22023'; end if;
  select * into v_existing from public.finance_vendor_payments where idempotency_key=p_idempotency_key;
  if found then
    if v_existing.bill_id<>p_bill_id or v_existing.source_vault_id<>p_vault_id or v_existing.amount<>p_amount
      or v_existing.paid_on<>p_paid_on or v_existing.evidence_reference<>btrim(p_evidence_reference)
      or v_existing.proof_path<>p_proof_path then
      raise exception 'Payment key was reused for different details.' using errcode='22023';
    end if;
    return v_existing.id;
  end if;
  select coalesce(sum(pay.amount),0) into v_paid from public.finance_vendor_payments pay
    where pay.bill_id=p_bill_id and not exists(
      select 1 from public.finance_vendor_payment_reversals rev where rev.payment_id=pay.id);
  if v_paid+p_amount>v_bill.amount then raise exception 'Payment exceeds the bill outstanding amount.' using errcode='22023'; end if;
  select coalesce(sum(case when side='debit' then amount else -amount end),0) into v_balance
    from public.finance_vault_lines where vault_id=p_vault_id;
  if v_balance<p_amount then raise exception 'Insufficient recorded vault balance.' using errcode='22023'; end if;
  select id into v_object from storage.objects where bucket_id='finance-vendor-proofs' and name=p_proof_path;
  if not found or exists(select 1 from public.finance_vendor_payments where proof_path=p_proof_path) then
    raise exception 'Upload a new, private payment proof for this bill.' using errcode='22023';
  end if;
  insert into public.finance_vault_journals
    (kind,vendor_bill_id,source_vault_id,amount,evidence_reference,note,idempotency_key,posted_by)
  values('vendor_disbursement',p_bill_id,p_vault_id,p_amount,btrim(p_evidence_reference),
    'Confirmed vendor payment with private proof',p_idempotency_key,v_actor) returning id into v_journal;
  insert into public.finance_vault_lines(journal_id,contra_account,side,amount)
    values(v_journal,'accounts_payable','debit',p_amount);
  insert into public.finance_vault_lines(journal_id,vault_id,side,amount)
    values(v_journal,p_vault_id,'credit',p_amount);
  insert into public.finance_vendor_payments
    (bill_id,source_vault_id,journal_id,amount,paid_on,evidence_reference,proof_path,idempotency_key,recorded_by)
  values(p_bill_id,p_vault_id,v_journal,p_amount,p_paid_on,btrim(p_evidence_reference),
    p_proof_path,p_idempotency_key,v_actor) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.finance_record_vendor_payment(uuid,uuid,numeric,date,text,text,uuid) from public,anon;
grant execute on function public.finance_record_vendor_payment(uuid,uuid,numeric,date,text,text,uuid) to authenticated;

create or replace function public.finance_reverse_vendor_payment(
  p_payment_id uuid,p_evidence_reference text,p_reason text,p_idempotency_key uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=app_finance_private.require_manager();
declare v_payment public.finance_vendor_payments%rowtype; v_existing public.finance_vendor_payment_reversals%rowtype;
declare v_journal uuid; v_id uuid;
begin
  if p_idempotency_key is null or length(btrim(coalesce(p_evidence_reference,''))) not between 4 and 200
    or length(btrim(coalesce(p_reason,''))) not between 8 and 500 then
    raise exception 'A unique key, evidence reference and reversal reason are required.' using errcode='22023';
  end if;
  select * into v_payment from public.finance_vendor_payments where id=p_payment_id;
  if not found then raise exception 'Payment not found.' using errcode='22023'; end if;
  if v_payment.recorded_by=v_actor then raise exception 'The payment recorder cannot reverse it.' using errcode='42501'; end if;
  perform 1 from public.finance_vendor_bills where id=v_payment.bill_id for update;
  perform 1 from public.finance_vaults where id=v_payment.source_vault_id for update;
  select * into v_existing from public.finance_vendor_payment_reversals where payment_id=p_payment_id;
  if found then
    if exists(select 1 from public.finance_vault_journals j where j.id=v_existing.journal_id
      and j.idempotency_key=p_idempotency_key and j.evidence_reference=btrim(p_evidence_reference)) then
      return v_existing.id;
    end if;
    raise exception 'This payment has already been reversed.' using errcode='22023';
  end if;
  insert into public.finance_vault_journals
    (kind,vendor_bill_id,source_vault_id,amount,evidence_reference,note,idempotency_key,reversal_of,posted_by)
  values('vendor_disbursement_reversal',v_payment.bill_id,v_payment.source_vault_id,v_payment.amount,
    btrim(p_evidence_reference),btrim(p_reason),p_idempotency_key,v_payment.journal_id,v_actor)
  returning id into v_journal;
  insert into public.finance_vault_lines(journal_id,vault_id,side,amount)
    values(v_journal,v_payment.source_vault_id,'debit',v_payment.amount);
  insert into public.finance_vault_lines(journal_id,contra_account,side,amount)
    values(v_journal,'accounts_payable','credit',v_payment.amount);
  insert into public.finance_vendor_payment_reversals
    (payment_id,journal_id,evidence_reference,reason,recorded_by)
  values(p_payment_id,v_journal,btrim(p_evidence_reference),btrim(p_reason),v_actor) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.finance_reverse_vendor_payment(uuid,text,text,uuid) from public,anon;
grant execute on function public.finance_reverse_vendor_payment(uuid,text,text,uuid) to authenticated;
