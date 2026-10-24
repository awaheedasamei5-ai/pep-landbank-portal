-- Real gap found before contract_share_links saw any use:
-- useGenerateContract()'s common no-template (v1-parity) path writes a
-- `contracts` row, not a `contract_generations` row -- only the
-- template-studio path does that. A share link must be able to point at
-- either, so contract_generation_id becomes optional and a sibling
-- contract_id (-> contracts) is added; the real constraint is "exactly
-- one of the two is set," not "generation_id always set."
alter table public.contract_share_links
  alter column contract_generation_id drop not null,
  add column if not exists contract_id uuid references public.contracts(id);

alter table public.contract_share_links
  add constraint contract_share_links_one_source
  check ((contract_generation_id is not null) <> (contract_id is not null));
