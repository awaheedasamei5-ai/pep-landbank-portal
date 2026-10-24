alter table public.payments
  add column if not exists paid_after_approval numeric,
  add column if not exists balance_after_approval numeric;

comment on column public.payments.paid_after_approval is
  'Cumulative client amount paid immediately after this payment was approved; used as an immutable receipt snapshot.';
comment on column public.payments.balance_after_approval is
  'Client contract balance immediately after this payment was approved; used as an immutable receipt snapshot.';

with approved_totals as (
  select
    p.id,
    sum(p.amount) over (
      partition by p.lead_id
      order by p.decided_at nulls last, p.created_at nulls last, p.id
      rows between unbounded preceding and current row
    ) as paid_after_approval,
    greatest(coalesce(l.grand_total, 0) - sum(p.amount) over (
      partition by p.lead_id
      order by p.decided_at nulls last, p.created_at nulls last, p.id
      rows between unbounded preceding and current row
    ), 0) as balance_after_approval
  from public.payments p
  join public.leads l on l.id = p.lead_id
  where p.status = 'approved'
)
update public.payments p
set paid_after_approval = t.paid_after_approval,
    balance_after_approval = t.balance_after_approval
from approved_totals t
where p.id = t.id
  and (p.paid_after_approval is null or p.balance_after_approval is null);

create or replace function public.approve_payment(p_payment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_payment record;
  v_lead record;
  v_new_paid numeric;
  v_new_balance numeric;
  v_new_stage text;
  v_pct numeric;
  v_threshold numeric;
  v_allocation_exists boolean;
  v_caller_key text;
  v_caller_name text;
  v_agent_name text;
  v_agent_phone text;
  v_alloc_json jsonb;
  v_audit_id bigint;
begin
  if coalesce(public.my_role(), '') <> 'manager' then
    raise exception 'Only Management can approve a payment';
  end if;

  select * into v_payment
  from public.payments
  where id = p_payment_id
  for update;
  if not found then
    raise exception 'Payment not found';
  end if;
  if v_payment.status <> 'pending' then
    raise exception 'Payment is not pending (current status: %)', v_payment.status;
  end if;

  select * into v_lead
  from public.leads
  where id = v_payment.lead_id
  for update;
  if not found then
    raise exception 'Linked lead not found';
  end if;
  if v_lead.grand_total is null then
    raise exception 'Lead has no grand_total set -- cannot compute balance';
  end if;

  v_caller_key := public.my_key();
  select name into v_caller_name from public.profiles where id = auth.uid();

  v_new_paid := coalesce(v_lead.amt_paid, 0) + v_payment.amount;
  v_new_balance := greatest(v_lead.grand_total - v_new_paid, 0);
  v_pct := case when v_lead.grand_total > 0 then (v_new_paid / v_lead.grand_total) * 100 else 0 end;
  v_new_stage := case
    when v_lead.grand_total <= 0 then '1'
    when v_pct >= 100 then '4'
    when v_pct >= 70 then '3'
    when v_pct >= 30 then '2B'
    when v_pct > 0 then '2A'
    else '1'
  end;

  update public.payments
  set status = 'approved',
      decided_by = v_caller_key,
      decided_by_name = v_caller_name,
      decided_at = now(),
      paid_after_approval = v_new_paid,
      balance_after_approval = v_new_balance
  where id = p_payment_id;

  update public.leads
  set amt_paid = v_new_paid,
      balance = v_new_balance,
      stage = v_new_stage
  where id = v_lead.id;

  insert into public.activity_log(agent_key, agent_name, client, action, detail, lead_id)
  values (v_caller_key, v_caller_name, v_lead.name, 'Payment approved', 'GHS ' || v_payment.amount || ' approved by ' || v_caller_name, v_lead.id);

  insert into public.messages(sender_key, sender_name, recipient_key, body)
  values (v_caller_key, v_caller_name, v_payment.agent_key, 'Your payment of GHS ' || v_payment.amount || ' for ' || v_lead.name || ' was approved and the receipt has been sent.');

  v_audit_id := public.record_audit_event(
    'audit', 'payment.approved', 'info', 'payment', p_payment_id::text,
    v_caller_name || ' approved GHS ' || v_payment.amount || ' for ' || v_lead.name,
    jsonb_build_object('leadId', v_lead.id, 'amount', v_payment.amount, 'priorAmtPaid', v_lead.amt_paid, 'newAmtPaid', v_new_paid, 'newBalance', v_new_balance, 'newStage', v_new_stage)
  );

  select coalesce(allocation_threshold_pct, 30) into v_threshold from public.app_config limit 1;
  v_threshold := coalesce(v_threshold, 30);
  v_alloc_json := null;

  if v_pct >= v_threshold then
    select exists(select 1 from public.allocation_requests where lead_id = v_lead.id) into v_allocation_exists;
    if not v_allocation_exists then
      select name, phone into v_agent_name, v_agent_phone
      from public.profiles
      where agent_key = v_payment.agent_key
      limit 1;

      with inserted as (
        insert into public.allocation_requests(lead_id, client_name, agent_key, agent_name, percent_paid, grand_total, amt_paid, status, agent_seen)
        values (v_lead.id, v_lead.name, v_payment.agent_key, coalesce(v_agent_name, v_payment.agent_key), round(v_pct), v_lead.grand_total, v_new_paid, 'Pending', false)
        returning id, lead_id, client_name, agent_key, agent_name, percent_paid, grand_total, amt_paid, status, agent_seen, created_at
      )
      select jsonb_build_object(
        'id', id, 'leadId', lead_id, 'clientName', client_name,
        'agentKey', agent_key, 'agentName', agent_name, 'agentPhone', v_agent_phone, 'percent', percent_paid,
        'grandTotal', grand_total, 'amtPaid', amt_paid, 'status', status,
        'agentSeen', agent_seen, 'createdAt', to_char(created_at, 'YYYY-MM-DD HH24:MI')
      ) into v_alloc_json
      from inserted;

      insert into public.messages(sender_key, sender_name, recipient_key, body)
      values (v_caller_key, v_caller_name, v_payment.agent_key, v_lead.name || ' has crossed the allocation eligibility threshold (' || round(v_pct) || '% paid). An allocation request has been raised for them automatically.');
    end if;
  end if;

  return jsonb_build_object(
    'ok', true, 'payment_id', p_payment_id, 'lead_id', v_lead.id,
    'new_amt_paid', v_new_paid, 'new_balance', v_new_balance, 'new_stage', v_new_stage,
    'decided_by', v_caller_key, 'decided_by_name', v_caller_name,
    'audit_id', v_audit_id,
    'allocation', v_alloc_json
  );
end;
$function$;

