drop trigger if exists payments_apply_finance_monthly_schedule on public.payments;
create trigger payments_apply_finance_monthly_schedule after update of status, amount on public.payments for each row execute function public.apply_finance_monthly_payment();
revoke all on function public.apply_finance_monthly_payment() from public, anon, authenticated;

