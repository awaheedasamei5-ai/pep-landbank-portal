-- Security hardening: restrict EXECUTE on internal/admin RPC functions to
-- authenticated/service_role only, per a live security-advisor audit.
-- These functions are cron-triggered, trigger-only, or staff-only in real
-- usage; none are called by the app as the `anon` role. Public pre-login
-- flows (client_portal_login, client_portal_search_names, email_is_allowed,
-- get_site_visit_invite, submit_site_visit_experience) are untouched -- they
-- are genuinely gated by a token/PIN/secret parameter.
--
-- Note: these functions were never granted EXECUTE individually to `anon`;
-- they were reachable only via the default implicit grant to `PUBLIC`
-- (every role inherits EXECUTE from PUBLIC unless revoked). `authenticated`
-- and `service_role` already hold their own separate, explicit grants, so
-- revoking PUBLIC does not affect them.

revoke execute on function public.check_schedule_conflicts(text[], date, time, time, uuid) from public;
revoke execute on function public.check_schedule_conflicts_multi(text[], date, time, time, uuid) from public;
revoke execute on function public.claim_finance_missed_payment_digest(date) from public;
revoke execute on function public.compute_finance_missed_payment_digest_clients() from public;
revoke execute on function public.compute_lead_closing_candidates() from public;
revoke execute on function public.compute_lead_closing_candidates(integer) from public;
revoke execute on function public.create_backup(text, text, text) from public;
revoke execute on function public.dispatch_finance_missed_payment_digest() from public;
revoke execute on function public.dispatch_lead_closing_drafts() from public;
revoke execute on function public.insert_lead_closing_draft(uuid, text, text, text, text) from public;
revoke execute on function public.insert_lead_closing_skip(uuid, text, text) from public;
revoke execute on function public.is_chat_group_admin(uuid, text) from public;
revoke execute on function public.is_chat_group_member(uuid, text) from public;
revoke execute on function public.list_finance_missed_payment_digest_recipients() from public;
revoke execute on function public.notify_staff_on_client_submission() from public;
revoke execute on function public.notify_staff_on_plot_request() from public;
revoke execute on function public.queue_finance_due_today_reminders() from public;
revoke execute on function public.queue_finance_missed_payment_reminders() from public;
revoke execute on function public.record_finance_missed_payment_digest_counts(date, integer, integer) from public;
revoke execute on function public.run_monthly_commission_check() from public;
revoke execute on function public.send_site_visit_reminders() from public;
revoke execute on function public.staff_referral_conversions(date, date) from public;
revoke execute on function public.sync_site_visit_cost_attribution(date) from public;
revoke execute on function public.sync_sva_actual_costs_to_expenses() from public;

-- Defensive: ensure authenticated keeps working explicitly even though
-- proacl already showed each of these granted to `authenticated`
-- independently of PUBLIC.
grant execute on function public.check_schedule_conflicts(text[], date, time, time, uuid) to authenticated;
grant execute on function public.create_backup(text, text, text) to authenticated;
grant execute on function public.staff_referral_conversions(date, date) to authenticated;
