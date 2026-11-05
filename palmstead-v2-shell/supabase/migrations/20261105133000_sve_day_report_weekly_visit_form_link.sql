-- Phase C, docs/plans/43 section 2.2: link each Day Report to the
-- Site Visit Authorization form covering the same real visit_date, so the
-- Day Report can show a real, computed budget section (actual spend vs.
-- who actually came) instead of nothing at all. Nullable: not every
-- visit_date has had a weekly_visit_forms row created yet.
alter table public.sve_day_reports
  add column if not exists weekly_visit_form_id uuid references public.weekly_visit_forms(id);
