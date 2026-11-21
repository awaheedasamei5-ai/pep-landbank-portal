-- Keep the existing lead-owner and Management access, and let the staff
-- member who issued an unlinked walk-in contract retrieve its snapshot.
drop policy if exists contract_generations_sel on public.contract_generations;
create policy contract_generations_sel on public.contract_generations
for select to authenticated
using (
  public.my_role() = 'manager'
  or public.my_key() = 'elizabeth'
  or exists (
    select 1 from public.leads as l
    where l.id = contract_generations.lead_id
      and l.agent_key = public.my_key()
  )
  or (lead_id is null and generated_by = public.my_key())
);

-- New walk-in PDFs live under walk-in/<issuer-key>/<random-id>.pdf.
-- The path check is essential: table access alone never grants a signed URL.
drop policy if exists contract_pdfs_storage_sel on storage.objects;
create policy contract_pdfs_storage_sel on storage.objects
for select to authenticated
using (
  bucket_id = 'contract-pdfs'
  and (
    public.my_role() = 'manager'
    or public.my_key() = 'elizabeth'
    or exists (
      select 1 from public.leads as l
      where l.id::text = (storage.foldername(storage.objects.name))[1]
        and l.agent_key = public.my_key()
    )
    or (
      (storage.foldername(storage.objects.name))[1] = 'walk-in'
      and (storage.foldername(storage.objects.name))[2] = public.my_key()
    )
  )
);
