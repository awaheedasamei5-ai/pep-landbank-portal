-- Branding fix: "Palmstead" is the admin system's own name, never the
-- company. The real company is Trulander (JSF Limited, per
-- app_config.quote_company_name). "PEP Landbank" was a leftover,
-- incorrect sign-off with no basis in app_config. Client-facing
-- templates only -- payment_staff_digest is an internal staff
-- notification ("Palmstead will be sending...") and is correctly left
-- as-is, since it genuinely refers to the system acting, not the company.

update sms_templates
set ai_system_prompt = replace(
      replace(
        replace(ai_system_prompt, 'a Ghanaian land-sales agency called Palmstead', 'a Ghanaian land-sales agency called Trulander'),
        'that Palmstead wants to help them achieve', 'that Trulander wants to help them achieve'
      ),
      'ask them to kindly contact Trulander or reach out to Palmstead on {companyPhone}',
      'ask them to kindly contact Trulander or reach out to us on {companyPhone}'
    ),
    updated_at = now()
where kind = 'lead_closing_sms';

update sms_templates
set ai_system_prompt = replace(ai_system_prompt, 'a Ghanaian land-sales agency called Palmstead', 'a Ghanaian land-sales agency called Trulander'),
    updated_at = now()
where kind = 'payment_schedule_change_sms';

update sms_templates
set body_template = replace(body_template, '- PEP Landbank', '- Trulander JSF'),
    updated_at = now()
where kind in ('payment_due_soon', 'payment_missed_first', 'payment_missed_escalated', 'receipt_issued_thank_you');

-- Real, already-drafted pending closing-SMS rows (93 at the time of this
-- fix) carried the same wrong wording baked into their stored text --
-- corrected in place rather than regenerated, since the substitution is
-- mechanically consistent across every real draft.
update outbound_sms_drafts
set body = replace(replace(body, 'reach out to Palmstead on', 'reach out to us on'), 'Palmstead', 'Trulander')
where kind = 'lead_closing_sms' and status = 'pending' and body ilike '%Palmstead%';
