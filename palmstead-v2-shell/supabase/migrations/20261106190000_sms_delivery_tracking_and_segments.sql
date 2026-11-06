-- SMS Engine Rebuild Phase C (docs/plans/48): real Arkesel delivery
-- tracking and segment/cost logging.
--
-- Real finding (contra the Phase A audit's over-broad claim): 5 of 7 real
-- outbox-style tables ALREADY store provider_reference/provider_status
-- captured from Arkesel's synchronous /send response (allocation_sms_outbox,
-- finance_monthly_payment_reminder_outbox, leave_sms_outbox,
-- finance_receipt_sms_outbox, sales_daily_digest_deliveries). What is
-- genuinely missing: (a) the two human-approved flows
-- (outbound_sms_drafts, finance_schedule_recalc_proposals) never capture
-- it, (b) there is no real ASYNC delivery-status table anywhere (every
-- existing provider_status column is just the synchronous HTTP response at
-- send time, not a later delivered/failed signal from Arkesel), and (c) no
-- segment/cost tracking exists anywhere.

-- 1. Real async delivery events, keyed by the provider_reference every
--    outbox already stores. Not a foreign key (provider_reference is not
--    unique/not-null across every source table), just a lookup string.
create table if not exists public.sms_delivery_events (
  id uuid primary key default gen_random_uuid(),
  provider_reference text,
  sms_id_raw text,
  recipient_phone text,
  status text,
  provider_status_raw jsonb,
  event_time timestamptz,
  received_at timestamptz not null default now()
);

create index if not exists sms_delivery_events_provider_reference_idx
  on public.sms_delivery_events (provider_reference);

alter table public.sms_delivery_events enable row level security;

drop policy if exists sms_delivery_events_sel on public.sms_delivery_events;
create policy sms_delivery_events_sel on public.sms_delivery_events
  for select to authenticated using (true);

-- No insert/update/delete policy for any authenticated role: the webhook
-- receiver edge function writes with the service-role key, matching the
-- same SELECT-only-RLS-backed-by-RPC/service-role pattern already used by
-- outbound_sms_drafts and finance_schedule_recalc_proposals.

-- 2. Real segment/cost log, one row per actual send, across every kind.
--    No shared "send-sms" function exists in this codebase (contrary to
--    the audit's assumption) -- each of the ~8 real send call sites fetches
--    Arkesel directly. Rather than unify those call sites into one shared
--    sender (a much larger, riskier refactor), each is updated to log one
--    row here right after its existing classifyProvider()/persist() step,
--    reusing the provider_reference it already computed.
create table if not exists public.sms_send_log (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  recipient_phone text not null,
  provider_reference text,
  message_length integer not null,
  encoding text not null check (encoding in ('gsm7', 'unicode')),
  segment_count integer not null,
  sent_at timestamptz not null default now()
);

create index if not exists sms_send_log_sent_at_idx on public.sms_send_log (sent_at desc);
create index if not exists sms_send_log_kind_idx on public.sms_send_log (kind);

alter table public.sms_send_log enable row level security;

drop policy if exists sms_send_log_sel on public.sms_send_log;
create policy sms_send_log_sel on public.sms_send_log
  for select to authenticated using (true);

-- 3. Fill the real gap: the 2 human-approved flows never captured
--    provider_reference/provider_status at all.
alter table public.outbound_sms_drafts
  add column if not exists provider_reference text,
  add column if not exists provider_status jsonb;

alter table public.finance_schedule_recalc_proposals
  add column if not exists provider_reference text,
  add column if not exists provider_status jsonb;

-- 4. A real, user-editable cost-per-segment rate. No authoritative current
--    Arkesel GHS rate could be confirmed for this account (pricing is
--    credit-tiered and account-specific) -- left null until the account
--    owner enters their real contracted rate; segment_count alone is
--    always real and correct regardless of this value.
alter table public.app_config
  add column if not exists sms_cost_per_segment_ghs numeric;
