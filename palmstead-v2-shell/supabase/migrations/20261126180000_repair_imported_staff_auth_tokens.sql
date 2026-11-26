-- One V1-imported V2 staff account had NULL token fields. Supabase Auth's
-- recovery endpoint returns HTTP 500 when scanning confirmation_token NULL.
-- Preserve any real token and repair only this account's missing sentinels.
update auth.users u
set confirmation_token = coalesce(u.confirmation_token, ''),
    recovery_token = coalesce(u.recovery_token, ''),
    email_change = coalesce(u.email_change, ''),
    email_change_token_new = coalesce(u.email_change_token_new, '')
where u.id in (
  select p.id from public.profiles p where p.agent_key = 'bajeianatu'
)
and (
  u.confirmation_token is null or u.recovery_token is null
  or u.email_change is null or u.email_change_token_new is null
);
