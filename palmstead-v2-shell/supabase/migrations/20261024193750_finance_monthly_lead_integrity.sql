create or replace function public.review_finance_monthly_schedule_on_lead_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
declare v_terms_changed boolean; v_phone_changed boolean;
begin
  v_terms_changed := new.payment_plan is distinct from old.payment_plan
    or new.grand_total is distinct from old.grand_total
    or new.net_total is distinct from old.net_total
    or new.deposit_target is distinct from old.deposit_target;
  v_phone_changed := public.finance_normalize_ghana_mobile(new.contact)
    is distinct from public.finance_normalize_ghana_mobile(old.contact);
  if not v_terms_changed and not v_phone_changed then return new; end if;

  update public.finance_monthly_payment_schedules
  set status = case when v_terms_changed then 'review_required' else status end,
      sms_reminders_enabled = false,
      sms_consent_revoked_at = case when v_phone_changed then now() else sms_consent_revoked_at end,
      sms_consent_revoked_by = case when v_phone_changed then null else sms_consent_revoked_by end,
      updated_at = now()
  where lead_id = new.id and status in ('active','paused','review_required');
  update public.finance_monthly_payment_reminder_outbox
  set status = case when status = 'sending' then 'needs_review' else 'cancelled' end,
      lease_until = null,
      last_error = case when v_terms_changed
        then 'The client contract terms changed. Management must review the payment schedule.'
        else 'The client contact number changed. Confirm permission for the new number before sending reminders.' end,
      updated_at = now()
  where lead_id = new.id and status in ('queued','sending');
  return new;
end;
$$;

drop trigger if exists leads_review_finance_monthly_schedule on public.leads;
create trigger leads_review_finance_monthly_schedule after update of contact, payment_plan, grand_total, net_total, deposit_target on public.leads for each row execute function public.review_finance_monthly_schedule_on_lead_change();
revoke all on function public.review_finance_monthly_schedule_on_lead_change() from public, anon, authenticated;

