-- A Management mobile number activates the existing morning/evening report schedule.
-- Do not queue a snapshot before its scheduled time; the first report is due the same day.
create or replace function public.activate_sales_digest_on_manager_phone()
returns trigger language plpgsql security definer set search_path = public, pg_temp set row_security = off
as $$
declare
  v_valid_now boolean;
  v_valid_before boolean := false;
  v_time time;
  v_morning time;
  v_evening time;
begin
  v_valid_now := new.role = 'manager' and new.active
    and regexp_replace(coalesce(new.phone,''),'[^0-9]','','g') ~ '^(0[0-9]{9}|233[0-9]{9})$';
  if tg_op = 'UPDATE' then
    v_valid_before := old.role = 'manager' and old.active
      and regexp_replace(coalesce(old.phone,''),'[^0-9]','','g') ~ '^(0[0-9]{9}|233[0-9]{9})$';
  end if;
  if v_valid_now and not v_valid_before then
    update public.sales_daily_digest_settings set enabled = true, updated_at = now() where singleton;
    select morning_time, evening_time into v_morning, v_evening
      from public.sales_daily_digest_settings where singleton;
    v_time := (now() at time zone 'Africa/Accra')::time;
    if v_time >= v_evening then
      perform public.queue_sales_daily_digest((now() at time zone 'Africa/Accra')::date,'evening',true);
    elsif v_time >= v_morning then
      perform public.queue_sales_daily_digest((now() at time zone 'Africa/Accra')::date,'morning',true);
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.activate_sales_digest_on_manager_phone() from public, anon, authenticated;
drop trigger if exists activate_sales_digest_on_manager_phone on public.profiles;
create trigger activate_sales_digest_on_manager_phone
after insert or update of phone,role,active on public.profiles
for each row execute function public.activate_sales_digest_on_manager_phone();

-- Existing Management biodata was completed before this trigger was installed.
update public.sales_daily_digest_settings set enabled = true, updated_at = now()
where singleton and not enabled and exists (
  select 1 from public.profiles where role = 'manager' and active
    and regexp_replace(coalesce(phone,''),'[^0-9]','','g') ~ '^(0[0-9]{9}|233[0-9]{9})$'
);
