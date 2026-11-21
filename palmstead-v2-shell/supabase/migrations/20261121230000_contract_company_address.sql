-- Contract postal address is independent of the physical address on quotations.
alter table public.app_config
  add column if not exists contract_company_address text
  not null default E'Post Office Box CO 3644\nTema';

-- Preserve the current approved wording as a recovery point before future edits.
alter table public.app_config
  add column if not exists contract_standard_preamble text,
  add column if not exists contract_standard_definitions text,
  add column if not exists contract_standard_terms text;

update public.app_config
set contract_standard_preamble = coalesce(contract_standard_preamble, contract_preamble),
    contract_standard_definitions = coalesce(contract_standard_definitions, contract_definitions),
    contract_standard_terms = coalesce(contract_standard_terms, contract_terms);
