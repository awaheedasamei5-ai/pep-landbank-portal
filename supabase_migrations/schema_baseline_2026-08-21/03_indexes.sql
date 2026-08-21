-- Indexes not already created implicitly by a PRIMARY KEY/UNIQUE constraint in 02_views_and_constraints.sql

CREATE INDEX banner_status_log_banner_id_idx ON public.banner_status_log USING btree (banner_id, created_at DESC);
CREATE INDEX expenses_date_idx ON public.expenses USING btree (expense_date DESC);
CREATE INDEX memo_recipients_memo_id_idx ON public.memo_recipients USING btree (memo_id);
CREATE INDEX memo_recipients_staff_key_idx ON public.memo_recipients USING btree (staff_key);
CREATE INDEX notes_owner_idx ON public.notes USING btree (owner_key, updated_at DESC);
CREATE INDEX idx_referrals_referred_lead ON public.referrals USING btree (referred_lead_id);
CREATE INDEX idx_referrals_referrer_lead ON public.referrals USING btree (referrer_lead_id);
CREATE INDEX idx_referrals_status ON public.referrals USING btree (status);
CREATE INDEX todo_owner_date_idx ON public.todo_items USING btree (owner_key, item_date);
CREATE UNIQUE INDEX weekly_visit_forms_week_day_key ON public.weekly_visit_forms USING btree (week_start, visit_date);
