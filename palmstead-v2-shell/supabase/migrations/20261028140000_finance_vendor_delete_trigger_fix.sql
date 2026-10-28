-- A BEFORE DELETE trigger must return OLD to permit an authorised delete.
-- The earlier function returned NEW, which is null on DELETE and silently
-- cancelled even an administrator's cleanup of a non-approved QA bill.
create or replace function app_finance_private.keep_approved_vendor_bill_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status='approved' then
    raise exception 'Approved vendor bills are immutable; record an adjustment in a future controlled flow.' using errcode='42501';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
