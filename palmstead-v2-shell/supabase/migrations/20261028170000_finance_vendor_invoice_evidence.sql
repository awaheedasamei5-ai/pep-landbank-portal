-- A supplier invoice is private evidence for a draft vendor obligation.
alter table public.finance_vendor_bills add column invoice_proof_path text unique;
alter table public.finance_vendor_bills add constraint finance_vendor_invoice_path_format
  check (invoice_proof_path is null or invoice_proof_path ~ ('^'||id::text||'/[0-9a-f-]{36}\.(pdf|jpg|jpeg|png)$'));
alter table public.finance_vendor_bill_events drop constraint finance_vendor_bill_events_action_check;
alter table public.finance_vendor_bill_events add constraint finance_vendor_bill_events_action_check
  check (action in ('created','edited','invoice_attached','submitted','approved','rejected','cancelled'));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('finance-vendor-invoices','finance-vendor-invoices',false,5242880,
  array['application/pdf','image/jpeg','image/png']) on conflict(id) do nothing;

create policy finance_vendor_invoice_read on storage.objects for select to authenticated
  using (bucket_id='finance-vendor-invoices' and public.finance_can_view_treasury()
    and exists(select 1 from public.finance_vendor_bills b
      where b.id::text=(storage.foldername(name))[1]));
create policy finance_vendor_invoice_insert on storage.objects for insert to authenticated
  with check (bucket_id='finance-vendor-invoices'
    and storage.filename(name) ~ '^[0-9a-f-]{36}\.(pdf|jpg|jpeg|png)$'
    and exists(select 1 from public.finance_vendor_bills b
      where b.id::text=(storage.foldername(name))[1] and b.status='draft'
        and b.created_by=auth.uid() and b.invoice_proof_path is null
        and exists(select 1 from public.profiles p where p.id=auth.uid() and p.active)
        and (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='manager')
          or exists(select 1 from public.finance_role_assignments a where a.profile_id=auth.uid()
            and a.finance_role='finance_operator' and a.revoked_at is null))));
create policy finance_vendor_invoice_delete_unlinked on storage.objects for delete to authenticated
  using (bucket_id='finance-vendor-invoices' and exists(select 1 from public.finance_vendor_bills b
    where b.id::text=(storage.foldername(name))[1] and b.status='draft'
      and b.created_by=auth.uid() and b.invoice_proof_path is distinct from name));

create or replace function public.finance_attach_vendor_invoice(
  p_bill_id uuid,p_path text,p_expected_revision integer)
returns void language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=app_finance_private.require_ap_clerk();
declare v_bill public.finance_vendor_bills%rowtype;
begin
  select * into v_bill from public.finance_vendor_bills where id=p_bill_id for update;
  if not found or v_bill.status<>'draft' or v_bill.created_by<>v_actor
    or v_bill.revision<>p_expected_revision or v_bill.invoice_proof_path is not null then
    raise exception 'Only the creator can attach one invoice to the current draft.' using errcode='42501';
  end if;
  if p_path is null or p_path !~ ('^'||p_bill_id::text||'/[0-9a-f-]{36}\.(pdf|jpg|jpeg|png)$')
    or not exists(select 1 from storage.objects where bucket_id='finance-vendor-invoices' and name=p_path) then
    raise exception 'Upload a private PDF or image for this bill first.' using errcode='22023';
  end if;
  update public.finance_vendor_bills set invoice_proof_path=p_path,revision=revision+1,updated_at=now()
    where id=p_bill_id returning * into v_bill;
  perform app_finance_private.record_vendor_bill_event(v_bill,v_actor,'invoice_attached','draft','Supplier invoice attached');
end;
$$;
revoke all on function public.finance_attach_vendor_invoice(uuid,text,integer) from public,anon;
grant execute on function public.finance_attach_vendor_invoice(uuid,text,integer) to authenticated;

create or replace function app_finance_private.require_vendor_invoice_before_submit()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.status='draft' and new.status='submitted' and
    (new.invoice_proof_path is null or not exists(select 1 from storage.objects
      where bucket_id='finance-vendor-invoices' and name=new.invoice_proof_path)) then
    raise exception 'Attach the supplier invoice before submitting this bill.' using errcode='22023';
  end if;
  return new;
end;
$$;
revoke all on function app_finance_private.require_vendor_invoice_before_submit() from public,anon,authenticated;
create trigger finance_vendor_invoice_required before update of status on public.finance_vendor_bills
  for each row execute function app_finance_private.require_vendor_invoice_before_submit();
