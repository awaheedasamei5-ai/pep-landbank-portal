-- Explicitly deny browser writes even where project default privileges are broad.
revoke all on public.finance_vendors, public.finance_vendor_events,
  public.finance_vendor_bills, public.finance_vendor_bill_events from public,anon,authenticated;
grant select on public.finance_vendors, public.finance_vendor_events,
  public.finance_vendor_bills, public.finance_vendor_bill_events to authenticated;

create or replace function app_finance_private.keep_approved_vendor_bill_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status='approved' then
    raise exception 'Approved vendor bills are immutable; record an adjustment in a future controlled flow.' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function app_finance_private.keep_approved_vendor_bill_immutable() from public,anon,authenticated;
create trigger finance_approved_vendor_bill_immutable before update or delete on public.finance_vendor_bills
  for each row execute function app_finance_private.keep_approved_vendor_bill_immutable();

create or replace function public.finance_decide_vendor_bill(
  p_bill_id uuid,p_action text,p_expected_revision integer,p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_bill public.finance_vendor_bills%rowtype; v_vendor public.finance_vendors%rowtype; v_before text;
begin
  -- Authorize before looking up the record so unauthorised callers cannot probe IDs.
  if p_action in ('approve','reject') then
    perform app_finance_private.require_finance_head();
  elsif p_action in ('submit','cancel') then
    perform app_finance_private.require_ap_clerk();
  else
    raise exception 'Unsupported bill decision.' using errcode='22023';
  end if;
  select * into v_bill from public.finance_vendor_bills where id=p_bill_id for update;
  if not found or v_bill.revision<>p_expected_revision then raise exception 'Bill changed; refresh before deciding.' using errcode='40001'; end if;
  v_before:=v_bill.status;
  if p_action='submit' then
    if v_bill.status<>'draft' or v_bill.created_by<>v_actor then raise exception 'Only the creator can submit a draft.' using errcode='42501'; end if;
    select * into v_vendor from public.finance_vendors where id=v_bill.vendor_id and status='active';
    if not found then raise exception 'Vendor is no longer active.' using errcode='22023'; end if;
    update public.finance_vendor_bills set status='submitted',submitted_at=now(),vendor_name_snapshot=v_vendor.legal_name,
      revision=revision+1,updated_at=now() where id=p_bill_id returning * into v_bill;
  elsif p_action in ('approve','reject') then
    if v_bill.status<>'submitted' or v_bill.created_by=v_actor then raise exception 'An independent Finance Head must decide a submitted bill.' using errcode='42501'; end if;
    if p_action='reject' and length(btrim(coalesce(p_note,'')))<3 then raise exception 'Add a reason for rejection.' using errcode='22023'; end if;
    update public.finance_vendor_bills set status=case when p_action='approve' then 'approved' else 'rejected' end,
      approved_at=case when p_action='approve' then now() else null end,
      approved_by=case when p_action='approve' then v_actor else null end,
      revision=revision+1,updated_at=now() where id=p_bill_id returning * into v_bill;
  else
    if v_bill.status<>'draft' or v_bill.created_by<>v_actor then raise exception 'Only the creator can cancel a draft.' using errcode='42501'; end if;
    update public.finance_vendor_bills set status='cancelled',revision=revision+1,updated_at=now()
      where id=p_bill_id returning * into v_bill;
  end if;
  perform app_finance_private.record_vendor_bill_event(v_bill,v_actor,
    case when p_action='approve' then 'approved' when p_action='reject' then 'rejected' when p_action='submit' then 'submitted' else 'cancelled' end,
    v_before,btrim(coalesce(p_note,'')));
end;
$$;
revoke all on function public.finance_decide_vendor_bill(uuid,text,integer,text) from public,anon;
grant execute on function public.finance_decide_vendor_bill(uuid,text,integer,text) to authenticated;
