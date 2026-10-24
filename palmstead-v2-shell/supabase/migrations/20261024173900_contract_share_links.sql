-- docs/plans/29-company-leads-full-system-blueprint.md Phase F -- mirrors
-- receipt_share_links exactly (same token/storage_path/created_by shape,
-- same closed-to-anon RLS resolved only via a service-role edge function).
create table public.contract_share_links (
  id uuid primary key default gen_random_uuid(),
  contract_generation_id uuid not null references public.contract_generations(id),
  lead_id uuid not null references public.leads(id),
  token text not null default encode(gen_random_bytes(24), 'hex') unique,
  storage_path text not null,
  created_by text,
  created_at timestamptz not null default now()
);

alter table public.contract_share_links enable row level security;

create policy contract_share_links_staff_all on public.contract_share_links
  for all
  using (has_permission('contracts.generate'))
  with check (has_permission('contracts.generate'));

-- Records which generation satisfied a request, so the request list can
-- show "Generated" rather than just "Fulfilled" (fulfil() stays a manual
-- "we've started working on this" flag -- a contract can be hand-delivered
-- outside the system too, that distinction is real and unchanged).
alter table public.contract_requests
  add column if not exists contract_generation_id uuid references public.contract_generations(id),
  add column if not exists generated_at timestamptz;
