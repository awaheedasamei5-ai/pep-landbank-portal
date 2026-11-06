-- Temporary QA backloop (user request, 2026-11-06): CC every recurring
-- Management-facing SMS digest to this real phone too, so the user can
-- watch each report land and refine wording/data over time. Nullable,
-- single config value -- set it back to null to remove the backloop
-- once the reports are trusted; every digest worker already checks for
-- a non-null value before sending the extra copy.
alter table public.app_config add column if not exists sms_qa_backloop_phone text;
update public.app_config set sms_qa_backloop_phone = '233546416566' where id = (select id from public.app_config limit 1);
