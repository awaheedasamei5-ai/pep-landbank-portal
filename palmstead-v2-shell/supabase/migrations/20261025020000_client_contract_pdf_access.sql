-- Contract PDFs are stored under <lead-id>/<generation>.pdf in the private
-- contract-pdfs bucket. Resolve ownership from the storage object path, not
-- from the lead's display name; the old expression accidentally inspected
-- leads.name and denied the lead's agent access to their own generated PDF.
drop policy if exists contract_pdfs_storage_sel on storage.objects;

create policy contract_pdfs_storage_sel
on storage.objects
for select
using (
  bucket_id = 'contract-pdfs'
  and (
    public.my_role() = 'manager'
    or public.my_key() = 'elizabeth'
    or exists (
      select 1
      from public.leads as l
      where l.id::text = (storage.foldername(storage.objects.name))[1]
        and l.agent_key = public.my_key()
    )
  )
);