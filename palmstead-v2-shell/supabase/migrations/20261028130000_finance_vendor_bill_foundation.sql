-- Vendor bills are a separate reviewed obligation register. Approval here is
-- neither a ledger posting nor a payment; settlement arrives in a later slice.
create table public.finance_vendors (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null check (length(btrim(legal_name)) between 3 and 160),
  contact_name text,
  contact_email text,
  contact_phone text,
  tax_reference text,
  status text not null default 'pending' check (status in ('pending','active','inactive')),
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id),
  activated_at timestamptz,
  activated_by uuid references public.profiles(id)
);
create unique index finance_vendor_legal_name_key on public.finance_vendors (lower(btrim(legal_name)));

create table public.finance_vendor_events (
  id bigint generated always as identity primary key,
  vendor_id uuid not null references public.finance_vendors(id),
  actor_id uuid not null references public.profiles(id),
  action text not null check (action in ('created','activated')),
  occurred_at timestamptz not null default now(),
  vendor_snapshot jsonb not null
);
create index finance_vendor_events_vendor_idx on public.finance_vendor_events(vendor_id,occurred_at,id);

create table public.finance_vendor_bills (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.finance_vendors(id),
  vendor_name_snapshot text,
  invoice_number text not null check (length(btrim(invoice_number)) between 2 and 80),
  invoice_date date not null,
  due_date date not null,
  category text not null check (length(btrim(category)) between 2 and 80),
  description text not null check (length(btrim(description)) between 8 and 2000),
  amount numeric(18,2) not null check (amount > 0),
  status text not null default 'draft' check (status in ('draft','submitted','approved','rejected','cancelled')),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id),
  submitted_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references public.profiles(id),
  check (due_date >= invoice_date)
);
create unique index finance_vendor_bill_reference_key on public.finance_vendor_bills (vendor_id,lower(btrim(invoice_number)));
create index finance_vendor_bill_due_idx on public.finance_vendor_bills (status,due_date,vendor_id);

create table public.finance_vendor_bill_events (
  id bigint generated always as identity primary key,
  bill_id uuid not null references public.finance_vendor_bills(id),
  actor_id uuid not null references public.profiles(id),
  action text not null check (action in ('created','edited','submitted','approved','rejected','cancelled')),
  from_status text,
  to_status text not null,
  note text not null default '',
  bill_revision integer not null,
  bill_snapshot jsonb not null,
  occurred_at timestamptz not null default now()
);
create index finance_vendor_bill_events_bill_idx on public.finance_vendor_bill_events (bill_id,occurred_at,id);

alter table public.finance_vendors enable row level security;
alter table public.finance_vendor_events enable row level security;
alter table public.finance_vendor_bills enable row level security;
alter table public.finance_vendor_bill_events enable row level security;
revoke all on public.finance_vendors, public.finance_vendor_events, public.finance_vendor_bills, public.finance_vendor_bill_events from anon;
grant select on public.finance_vendors, public.finance_vendor_events, public.finance_vendor_bills, public.finance_vendor_bill_events to authenticated;
create policy finance_vendor_read on public.finance_vendors for select to authenticated using (public.finance_can_view_treasury());
create policy finance_vendor_event_read on public.finance_vendor_events for select to authenticated using (public.finance_can_view_treasury());
create policy finance_vendor_bill_read on public.finance_vendor_bills for select to authenticated using (public.finance_can_view_treasury());
create policy finance_vendor_bill_event_read on public.finance_vendor_bill_events for select to authenticated using (public.finance_can_view_treasury());

create or replace function app_finance_private.require_ap_clerk()
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null or not exists (select 1 from public.profiles p where p.id=v_actor and p.active and
    (p.role='manager' or exists(select 1 from public.finance_role_assignments a where a.profile_id=v_actor
      and a.finance_role='finance_operator' and a.revoked_at is null))) then
    raise exception 'An active Management or Finance Operator role is required.' using errcode='42501';
  end if;
  return v_actor;
end;
$$;
revoke all on function app_finance_private.require_ap_clerk() from public,anon,authenticated;

create or replace function app_finance_private.record_vendor_bill_event(
  p_bill public.finance_vendor_bills,p_actor uuid,p_action text,p_from text,p_note text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.finance_vendor_bill_events
    (bill_id,actor_id,action,from_status,to_status,note,bill_revision,bill_snapshot)
  values (p_bill.id,p_actor,p_action,p_from,p_bill.status,coalesce(p_note,''),p_bill.revision,
    jsonb_build_object('vendor_id',p_bill.vendor_id,'vendor_name',p_bill.vendor_name_snapshot,
      'invoice_number',p_bill.invoice_number,'invoice_date',p_bill.invoice_date,'due_date',p_bill.due_date,
      'category',p_bill.category,'description',p_bill.description,'amount',p_bill.amount,'status',p_bill.status,
      'revision',p_bill.revision));
end;
$$;
revoke all on function app_finance_private.record_vendor_bill_event(public.finance_vendor_bills,uuid,text,text,text)
  from public,anon,authenticated;

create or replace function app_finance_private.block_vendor_event_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Vendor bill history is append only.' using errcode='42501';
end;
$$;
revoke all on function app_finance_private.block_vendor_event_mutation() from public,anon,authenticated;
create trigger finance_vendor_bill_event_immutable before update or delete on public.finance_vendor_bill_events
  for each row execute function app_finance_private.block_vendor_event_mutation();
create trigger finance_vendor_event_immutable before update or delete on public.finance_vendor_events
  for each row execute function app_finance_private.block_vendor_event_mutation();

create or replace function public.finance_create_vendor(
  p_legal_name text,p_contact_name text,p_contact_email text,p_contact_phone text,p_tax_reference text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := app_finance_private.require_manager(); v_id uuid;
begin
  if length(btrim(coalesce(p_legal_name,''))) < 3 then raise exception 'Enter the vendor legal name.' using errcode='22023'; end if;
  insert into public.finance_vendors(legal_name,contact_name,contact_email,contact_phone,tax_reference,created_by)
  values (btrim(p_legal_name),nullif(btrim(p_contact_name),''),nullif(btrim(p_contact_email),''),
    nullif(btrim(p_contact_phone),''),nullif(btrim(p_tax_reference),''),v_actor) returning id into v_id;
  insert into public.finance_vendor_events(vendor_id,actor_id,action,vendor_snapshot)
  select id,v_actor,'created',jsonb_build_object('legal_name',legal_name,'status',status) from public.finance_vendors where id=v_id;
  return v_id;
end;
$$;
revoke all on function public.finance_create_vendor(text,text,text,text,text) from public,anon;
grant execute on function public.finance_create_vendor(text,text,text,text,text) to authenticated;

create or replace function public.finance_activate_vendor(p_vendor_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := app_finance_private.require_finance_head(); v_vendor public.finance_vendors%rowtype;
begin
  select * into v_vendor from public.finance_vendors where id=p_vendor_id for update;
  if not found or v_vendor.status <> 'pending' then raise exception 'Vendor is not pending review.' using errcode='22023'; end if;
  if v_vendor.created_by=v_actor then raise exception 'The creator cannot activate this vendor.' using errcode='42501'; end if;
  update public.finance_vendors set status='active',activated_at=now(),activated_by=v_actor where id=p_vendor_id;
  insert into public.finance_vendor_events(vendor_id,actor_id,action,vendor_snapshot)
  select id,v_actor,'activated',jsonb_build_object('legal_name',legal_name,'status',status) from public.finance_vendors where id=p_vendor_id;
end;
$$;
revoke all on function public.finance_activate_vendor(uuid) from public,anon;
grant execute on function public.finance_activate_vendor(uuid) to authenticated;

create or replace function public.finance_save_vendor_bill(
  p_bill_id uuid,p_vendor_id uuid,p_invoice_number text,p_invoice_date date,p_due_date date,
  p_category text,p_description text,p_amount numeric,p_expected_revision integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := app_finance_private.require_ap_clerk(); v_vendor public.finance_vendors%rowtype;
declare v_bill public.finance_vendor_bills%rowtype; v_before text;
begin
  if p_amount is null or p_amount<=0 or round(p_amount,2)<>p_amount or p_due_date<p_invoice_date
    or length(btrim(coalesce(p_invoice_number,'')))<2 or length(btrim(coalesce(p_category,'')))<2
    or length(btrim(coalesce(p_description,'')))<8 then
    raise exception 'Complete the invoice reference, dates, category, description and positive amount.' using errcode='22023';
  end if;
  select * into v_vendor from public.finance_vendors where id=p_vendor_id and status='active';
  if not found then raise exception 'Choose an active vendor.' using errcode='22023'; end if;
  if p_bill_id is null then
    insert into public.finance_vendor_bills(vendor_id,invoice_number,invoice_date,due_date,category,description,amount,created_by)
    values(p_vendor_id,btrim(p_invoice_number),p_invoice_date,p_due_date,btrim(p_category),btrim(p_description),p_amount,v_actor)
    returning * into v_bill;
    perform app_finance_private.record_vendor_bill_event(v_bill,v_actor,'created',null,'');
  else
    select * into v_bill from public.finance_vendor_bills where id=p_bill_id for update;
    if not found or v_bill.status<>'draft' or v_bill.created_by<>v_actor or v_bill.revision<>p_expected_revision then
      raise exception 'Bill is not your current editable draft.' using errcode='42501';
    end if;
    v_before:=v_bill.status;
    update public.finance_vendor_bills set vendor_id=p_vendor_id,invoice_number=btrim(p_invoice_number),
      invoice_date=p_invoice_date,due_date=p_due_date,category=btrim(p_category),description=btrim(p_description),
      amount=p_amount,revision=revision+1,updated_at=now() where id=p_bill_id returning * into v_bill;
    perform app_finance_private.record_vendor_bill_event(v_bill,v_actor,'edited',v_before,'');
  end if;
  return v_bill.id;
end;
$$;
revoke all on function public.finance_save_vendor_bill(uuid,uuid,text,date,date,text,text,numeric,integer) from public,anon;
grant execute on function public.finance_save_vendor_bill(uuid,uuid,text,date,date,text,text,numeric,integer) to authenticated;

create or replace function public.finance_decide_vendor_bill(
  p_bill_id uuid,p_action text,p_expected_revision integer,p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_bill public.finance_vendor_bills%rowtype; v_vendor public.finance_vendors%rowtype; v_before text;
begin
  select * into v_bill from public.finance_vendor_bills where id=p_bill_id for update;
  if not found or v_bill.revision<>p_expected_revision then raise exception 'Bill changed; refresh before deciding.' using errcode='40001'; end if;
  v_before:=v_bill.status;
  if p_action='submit' then
    perform app_finance_private.require_ap_clerk();
    if v_bill.status<>'draft' or v_bill.created_by<>v_actor then raise exception 'Only the creator can submit a draft.' using errcode='42501'; end if;
    select * into v_vendor from public.finance_vendors where id=v_bill.vendor_id and status='active';
    if not found then raise exception 'Vendor is no longer active.' using errcode='22023'; end if;
    update public.finance_vendor_bills set status='submitted',submitted_at=now(),vendor_name_snapshot=v_vendor.legal_name,
      revision=revision+1,updated_at=now() where id=p_bill_id returning * into v_bill;
  elsif p_action in ('approve','reject') then
    perform app_finance_private.require_finance_head();
    if v_bill.status<>'submitted' or v_bill.created_by=v_actor then raise exception 'An independent Finance Head must decide a submitted bill.' using errcode='42501'; end if;
    if p_action='reject' and length(btrim(coalesce(p_note,'')))<3 then raise exception 'Add a reason for rejection.' using errcode='22023'; end if;
    update public.finance_vendor_bills set status=case when p_action='approve' then 'approved' else 'rejected' end,
      approved_at=case when p_action='approve' then now() else null end,
      approved_by=case when p_action='approve' then v_actor else null end,
      revision=revision+1,updated_at=now() where id=p_bill_id returning * into v_bill;
  elsif p_action='cancel' then
    perform app_finance_private.require_ap_clerk();
    if v_bill.status<>'draft' or v_bill.created_by<>v_actor then raise exception 'Only the creator can cancel a draft.' using errcode='42501'; end if;
    update public.finance_vendor_bills set status='cancelled',revision=revision+1,updated_at=now()
      where id=p_bill_id returning * into v_bill;
  else raise exception 'Unsupported bill decision.' using errcode='22023'; end if;
  perform app_finance_private.record_vendor_bill_event(v_bill,v_actor,
    case when p_action='approve' then 'approved' when p_action='reject' then 'rejected' when p_action='submit' then 'submitted' else 'cancelled' end,
    v_before,btrim(coalesce(p_note,'')));
end;
$$;
revoke all on function public.finance_decide_vendor_bill(uuid,text,integer,text) from public,anon;
grant execute on function public.finance_decide_vendor_bill(uuid,text,integer,text) to authenticated;
