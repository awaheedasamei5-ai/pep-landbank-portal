-- Phase D (SMS engine rebuild, blueprint-driven): shadow-mode AI review log.
-- Does NOT gate any real send -- purely logs what the AI reviewer + deterministic
-- validator would have decided, for later measurement before trusting either to
-- gate a real send in Phase E.

create table if not exists public.sms_review_shadow_log (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  outbox_table text,
  outbox_row_id uuid,
  generated_text text not null,
  trusted_fields jsonb not null default '{}'::jsonb,
  ai_decision text,
  ai_reason_codes jsonb not null default '[]'::jsonb,
  ai_used_fields jsonb not null default '[]'::jsonb,
  ai_tone text,
  ai_raw jsonb,
  validator_verdict text not null,
  validator_issues jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists sms_review_shadow_log_kind_idx on public.sms_review_shadow_log(kind);
create index if not exists sms_review_shadow_log_outbox_idx on public.sms_review_shadow_log(outbox_table, outbox_row_id);

alter table public.sms_review_shadow_log enable row level security;

create policy sms_review_shadow_log_sel on public.sms_review_shadow_log
  for select to authenticated
  using (true);

-- Deterministic server-side validator (blueprint section 7): compares every
-- GHS amount and Ghana-format phone number actually present in generated_text
-- against the real trusted_fields payload the message was built from, and
-- flags anything unaccounted for. This is independent of, and does not trust,
-- the AI's own self-reported decision.
create or replace function public.validate_sms_review_tokens(p_generated_text text, p_trusted jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_issues jsonb := '[]'::jsonb;
  v_amount_matches text[];
  v_phone_matches text[];
  v_amt text;
  v_amt_num numeric;
  v_phone text;
  v_trusted_amounts numeric[];
  v_trusted_phones text[];
  v_must_contain text[];
  v_must_not_contain text[];
  v_item text;
begin
  select array_agg(m[1]) into v_amount_matches
  from regexp_matches(p_generated_text, 'GHS\s*([\d,]+(?:\.\d+)?)', 'gi') as m;

  select array_agg(m[1]) into v_phone_matches
  from regexp_matches(p_generated_text, '(0\d{9})', 'g') as m;

  select array_agg((x)::numeric) into v_trusted_amounts
  from jsonb_array_elements_text(coalesce(p_trusted->'amounts', '[]'::jsonb)) as x;

  select array_agg(x) into v_trusted_phones
  from jsonb_array_elements_text(coalesce(p_trusted->'phones', '[]'::jsonb)) as x;

  select array_agg(x) into v_must_contain
  from jsonb_array_elements_text(coalesce(p_trusted->'must_contain', '[]'::jsonb)) as x;

  select array_agg(x) into v_must_not_contain
  from jsonb_array_elements_text(coalesce(p_trusted->'must_not_contain', '[]'::jsonb)) as x;

  if v_amount_matches is not null and v_trusted_amounts is not null then
    foreach v_amt in array v_amount_matches loop
      v_amt_num := replace(v_amt, ',', '')::numeric;
      if not (v_amt_num = any (v_trusted_amounts)) then
        v_issues := v_issues || jsonb_build_object('code', 'unverified_amount', 'value', v_amt);
      end if;
    end loop;
  end if;

  if v_phone_matches is not null and v_trusted_phones is not null then
    foreach v_phone in array v_phone_matches loop
      if not (v_phone = any (v_trusted_phones)) then
        v_issues := v_issues || jsonb_build_object('code', 'unverified_phone', 'value', v_phone);
      end if;
    end loop;
  end if;

  if v_must_contain is not null then
    foreach v_item in array v_must_contain loop
      if position(lower(v_item) in lower(p_generated_text)) = 0 then
        v_issues := v_issues || jsonb_build_object('code', 'missing_required_field', 'value', v_item);
      end if;
    end loop;
  end if;

  if v_must_not_contain is not null then
    foreach v_item in array v_must_not_contain loop
      if position(lower(v_item) in lower(p_generated_text)) > 0 then
        v_issues := v_issues || jsonb_build_object('code', 'forbidden_phrase', 'value', v_item);
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'verdict', case when jsonb_array_length(v_issues) = 0 then 'PASS' else 'FAIL' end,
    'issues', v_issues
  );
end;
$$;
