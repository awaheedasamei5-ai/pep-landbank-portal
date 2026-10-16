-- Fail closed after ANY unreviewed Operations schema change, including a new
-- generated/identity column which this fixed recordset recovery cannot insert.
-- Does not alter business rows or existing recovery snapshots.
create table app_reset_private.reviewed_adapters (
  adapter_key text primary key check (adapter_key='operations-v1'),
  schema_fingerprint text not null,
  reviewed_at timestamptz not null default clock_timestamp()
);
alter table app_reset_private.reviewed_adapters enable row level security;
revoke all on app_reset_private.reviewed_adapters from public, anon, authenticated;
insert into app_reset_private.reviewed_adapters(adapter_key,schema_fingerprint)
  values('operations-v1',app_reset_private.operations_schema());

alter function app_reset_private.operations_blockers(text[]) rename to operations_dependency_blockers;
create function app_reset_private.operations_blockers(p_scopes text[]) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare v_reasons jsonb := app_reset_private.operations_dependency_blockers(p_scopes);
begin
  if not exists (select 1 from app_reset_private.reviewed_adapters a
    where a.adapter_key='operations-v1' and a.schema_fingerprint=app_reset_private.operations_schema()) then
    v_reasons := v_reasons || jsonb_build_array('The Operations database structure changed. Reset and recovery need an adapter review before continuing.');
  end if;
  return v_reasons;
end;
$$;
revoke all on function app_reset_private.operations_dependency_blockers(text[]),
  app_reset_private.operations_blockers(text[]) from public, anon, authenticated;
