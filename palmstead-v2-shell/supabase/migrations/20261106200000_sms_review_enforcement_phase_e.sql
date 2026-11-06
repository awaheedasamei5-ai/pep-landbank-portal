-- Phase E (docs/plans/48 §9): feature-flag the Phase D validator/reviewer
-- per SMS kind, enforced for lead_closing_sms first (the kind this was
-- built around and tested most this session) -- the other 8 kinds stay in
-- shadow mode. "Enforced" here means: approve_outbound_sms_draft runs the
-- deterministic validator (the AI reviewer's DO_NOT_SEND verdict stays
-- advisory/shadow only, per the Phase D audit's own explicit recommendation
-- -- too few real samples yet to trust it as a hard gate) against a FRESH
-- read of the lead/agent/company data at approval time (not the draft's
-- stale creation-time snapshot), and blocks the send if it fails, routing
-- the draft to a new 'needs_review' state instead of reaching Arkesel.

alter table public.sms_templates
  add column if not exists review_enforced boolean not null default false;

update public.sms_templates set review_enforced = true where kind = 'lead_closing_sms';

alter table public.outbound_sms_drafts drop constraint if exists outbound_sms_drafts_status_check;
alter table public.outbound_sms_drafts add constraint outbound_sms_drafts_status_check
  check (status = any (array['pending','approved','sent','dismissed','needs_review']));

drop function if exists public.approve_outbound_sms_draft(uuid, text);

-- Real bug found and fixed while building this: the function's own
-- RETURNS TABLE(recipient_phone, body, ...) OUT parameters are implicitly
-- visible as plpgsql variables throughout the function body, which made
-- the original UPDATE ... RETURNING recipient_phone, body genuinely
-- ambiguous against the table's own columns of the same name (Postgres
-- raises 42702 rather than guessing). This likely pre-dates Phase E --
-- same structure existed in the original function -- and may never have
-- been exercised by a real approval click. Fixed by table-qualifying the
-- RETURNING list below.
create function public.approve_outbound_sms_draft(p_id uuid, p_body text)
 returns table(recipient_phone text, body text, blocked boolean, block_reason text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_phone text;
  v_body text;
  v_lead_id uuid;
  v_recipient_name text;
  v_kind text;
  v_enforced boolean;
  v_company_phone text;
  v_agent_phone text;
  v_agent_key text;
  v_trusted jsonb;
  v_validation jsonb;
begin
  if public.my_role() <> 'manager' then
    raise exception 'Only Management can approve outgoing SMS.' using errcode = '42501';
  end if;
  if p_body is null or btrim(p_body) = '' then
    raise exception 'The message cannot be empty.';
  end if;

  select d.lead_id, d.recipient_name, d.recipient_phone, d.kind
    into v_lead_id, v_recipient_name, v_phone, v_kind
  from public.outbound_sms_drafts d
  where d.id = p_id and d.status in ('pending','needs_review');

  if not found then
    raise exception 'This draft is no longer pending.';
  end if;

  select t.review_enforced into v_enforced from public.sms_templates t where t.kind = v_kind;

  if coalesce(v_enforced, false) then
    select coalesce(c.company_phone, '') into v_company_phone from public.app_config c limit 1;

    if v_lead_id is not null then
      select l.agent_key into v_agent_key from public.leads l where l.id = v_lead_id;
      if v_agent_key is distinct from 'company' then
        select p.phone into v_agent_phone from public.profiles p where p.agent_key = v_agent_key;
      end if;
    end if;

    v_trusted := jsonb_build_object(
      'amounts', '[]'::jsonb,
      'phones', to_jsonb(array_remove(array[v_company_phone, v_agent_phone, v_phone], null)),
      'must_contain', to_jsonb(array_remove(array[v_recipient_name], null)),
      'must_not_contain', to_jsonb(array['{', 'PEP Landbank'])
    );

    v_validation := public.validate_sms_review_tokens(p_body, v_trusted);

    insert into public.sms_review_shadow_log(kind, outbox_table, outbox_row_id, generated_text, trusted_fields, validator_verdict, validator_issues)
    values (v_kind, 'outbound_sms_drafts', p_id, p_body, v_trusted, v_validation->>'verdict', v_validation->'issues');

    if v_validation->>'verdict' = 'FAIL' then
      update public.outbound_sms_drafts
      set status = 'needs_review', body = p_body
      where id = p_id;
      return query select
        null::text,
        null::text,
        true,
        ('This message failed an automatic accuracy check and was held for review: ' || (v_validation->'issues')::text);
      return;
    end if;
  end if;

  update public.outbound_sms_drafts as d
  set body = p_body, status = 'approved', approved_by = public.my_key(), approved_at = now()
  where d.id = p_id and d.status in ('pending','needs_review')
  returning d.recipient_phone, d.body into v_phone, v_body;

  if not found then
    raise exception 'This draft is no longer pending.';
  end if;

  return query select v_phone, v_body, false, null::text;
end;
$function$;

create or replace function public.dismiss_outbound_sms_draft(p_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if public.my_role() <> 'manager' then
    raise exception 'Only Management can dismiss outgoing SMS.' using errcode = '42501';
  end if;
  update public.outbound_sms_drafts set status = 'dismissed'
  where id = p_id and status in ('pending','approved','needs_review');
end;
$function$;

-- Acceptance test T5 ("same webhook/event received twice -> one logical
-- notification") found a real gap: sms_delivery_events had no dedupe at
-- all, so a replayed Arkesel callback created a duplicate row every time.
-- A genuine status transition (e.g. submitted -> delivered) for the same
-- sms_id is a different real event and must still insert, so the dedupe
-- key is (provider_reference, status), not provider_reference alone -- the
-- webhook function (arkesel-delivery-webhook, redeployed v2) upserts on
-- this pair with ignoreDuplicates instead of a bare insert.
create unique index if not exists sms_delivery_events_ref_status_uidx
  on public.sms_delivery_events (provider_reference, status)
  where provider_reference is not null and status is not null;
