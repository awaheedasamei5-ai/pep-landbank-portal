-- sms_templates body text is read by several client-side SMS-sending flows
-- (quotation thank-you, SVE feedback thank-you, receipt thank-you) that run
-- under any authenticated staff member's own session, not just Management's.
-- The original sms_templates_sel policy restricted SELECT to manager only,
-- which would silently prevent an agent's own quotation/SVE/receipt SMS
-- from ever picking up an edited template. Widen SELECT to any authenticated
-- staff member (read-only -- the template text itself isn't sensitive);
-- UPDATE stays manager-only, unchanged.
drop policy if exists sms_templates_sel on public.sms_templates;
create policy sms_templates_sel on public.sms_templates for select to authenticated using (true);
