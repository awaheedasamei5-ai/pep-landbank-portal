-- ============ ENABLE RLS ============

ALTER TABLE public.achievement_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allocation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allowed_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banner_status_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_portal_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.downloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memo_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_reminders_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plot_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_item_invitees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_visit_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.target_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.todo_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_visit_forms ENABLE ROW LEVEL SECURITY;

-- Note: banner_status_log, backups, client_notifications, client_portal_access,
-- downloads, receipt_log, and a few others have RLS enabled but are read/written
-- exclusively through SECURITY DEFINER functions or narrow owner-scoped policies
-- below -- see each policy's USING/WITH CHECK clause for the exact rule.

-- ============ POLICIES (183) ============

CREATE POLICY achievement_definitions_del ON public.achievement_definitions FOR DELETE TO public USING ((my_role() = 'manager'::text));
CREATE POLICY achievement_definitions_ins ON public.achievement_definitions FOR INSERT TO public WITH CHECK ((my_role() = 'manager'::text));
CREATE POLICY achievement_definitions_sel ON public.achievement_definitions FOR SELECT TO public USING ((auth.uid() IS NOT NULL));
CREATE POLICY achievement_definitions_upd ON public.achievement_definitions FOR UPDATE TO public USING ((my_role() = 'manager'::text));
CREATE POLICY activity_log_ins ON public.activity_log FOR INSERT TO public WITH CHECK ((agent_key = my_key()));
CREATE POLICY activity_log_sel ON public.activity_log FOR SELECT TO public USING (((agent_key = my_key()) OR (my_role() = 'manager'::text)));
CREATE POLICY alloc_client_sel ON public.allocation_requests FOR SELECT TO public USING (((my_client_contact_digits() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM leads l
  WHERE ((l.id = allocation_requests.lead_id) AND ("right"(regexp_replace(l.contact, '[^0-9]'::text, ''::text, 'g'::text), 9) = my_client_contact_digits()) AND (lower(TRIM(BOTH FROM l.name)) = my_client_name()))))));
CREATE POLICY alloc_ins ON public.allocation_requests FOR INSERT TO public WITH CHECK (((agent_key = my_key()) OR (my_role() = 'manager'::text) OR (my_key() = ANY (ARRAY['elias'::text, 'emmanuel'::text]))));
CREATE POLICY alloc_sel ON public.allocation_requests FOR SELECT TO public USING (((agent_key = my_key()) OR (my_role() = 'manager'::text) OR (my_key() = ANY (ARRAY['elias'::text, 'emmanuel'::text]))));
CREATE POLICY alloc_upd ON public.allocation_requests FOR UPDATE TO public USING (((my_role() = 'manager'::text) OR (my_key() = ANY (ARRAY['elias'::text, 'emmanuel'::text])) OR (agent_key = my_key())));
CREATE POLICY p_allow_del ON public.allowed_emails FOR DELETE TO public USING ((my_role() = 'manager'::text));
CREATE POLICY p_allow_ins ON public.allowed_emails FOR INSERT TO public WITH CHECK ((my_role() = 'manager'::text));
CREATE POLICY p_allow_sel ON public.allowed_emails FOR SELECT TO public USING ((my_role() = 'manager'::text));
CREATE POLICY ancom_ins ON public.announcement_comments FOR INSERT TO public WITH CHECK (((auth.uid() IS NOT NULL) AND (author_key = my_key())));
CREATE POLICY ancom_sel ON public.announcement_comments FOR SELECT TO public USING ((auth.uid() IS NOT NULL));
CREATE POLICY announce_del ON public.announcements FOR DELETE TO public USING ((my_role() = 'manager'::text));
CREATE POLICY announce_ins ON public.announcements FOR INSERT TO public WITH CHECK ((my_role() = 'manager'::text));
CREATE POLICY announce_sel ON public.announcements FOR SELECT TO public USING ((auth.uid() IS NOT NULL));
CREATE POLICY announce_upd ON public.announcements FOR UPDATE TO public USING ((my_role() = 'manager'::text));
CREATE POLICY p_config_ins ON public.app_config FOR INSERT TO public WITH CHECK ((my_role() = 'manager'::text));
CREATE POLICY p_config_sel ON public.app_config FOR SELECT TO public USING ((auth.uid() IS NOT NULL));
CREATE POLICY p_config_upd ON public.app_config FOR UPDATE TO public USING ((my_role() = 'manager'::text));
CREATE POLICY al_del_mgr ON public.attendance_log FOR DELETE TO public USING ((my_role() = 'manager'::text));
CREATE POLICY al_ins_own ON public.attendance_log FOR INSERT TO public WITH CHECK ((staff_key = my_key()));
CREATE POLICY al_sel_own_or_mgr ON public.attendance_log FOR SELECT TO public USING (((staff_key = my_key()) OR (my_role() = 'manager'::text)));
CREATE POLICY al_upd_own_or_mgr ON public.attendance_log FOR UPDATE TO public USING (((staff_key = my_key()) OR (my_role() = 'manager'::text)));
CREATE POLICY backups_sel ON public.backups FOR SELECT TO public USING ((my_role() = 'manager'::text));
CREATE POLICY bsl_ins ON public.banner_status_log FOR INSERT TO public WITH CHECK ((my_key() IS NOT NULL));
CREATE POLICY bsl_sel ON public.banner_status_log FOR SELECT TO public USING ((my_key() IS NOT NULL));
CREATE POLICY banners_del ON public.banners FOR DELETE TO public USING (((created_by = my_key()) OR (my_role() = 'manager'::text)));
CREATE POLICY banners_ins ON public.banners FOR INSERT TO public WITH CHECK ((my_key() IS NOT NULL));
CREATE POLICY banners_sel ON public.banners FOR SELECT TO public USING ((my_key() IS NOT NULL));
CREATE POLICY banners_upd ON public.banners FOR UPDATE TO public USING ((my_key() IS NOT NULL));
CREATE POLICY cn_client_sel ON public.client_notifications FOR SELECT TO public USING (((my_client_contact_digits() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM leads l
  WHERE ((l.id = client_notifications.lead_id) AND ("right"(regexp_replace(l.contact, '[^0-9]'::text, ''::text, 'g'::text), 9) = my_client_contact_digits()) AND (lower(TRIM(BOTH FROM l.name)) = my_client_name()))))));
CREATE POLICY cn_client_upd ON public.client_notifications FOR UPDATE TO public USING (((my_client_contact_digits() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM leads l
  WHERE ((l.id = client_notifications.lead_id) AND ("right"(regexp_replace(l.contact, '[^0-9]'::text, ''::text, 'g'::text), 9) = my_client_contact_digits()) AND (lower(TRIM(BOTH FROM l.name)) = my_client_name()))))));
CREATE POLICY cn_staff_ins ON public.client_notifications FOR INSERT TO public WITH CHECK (((auth.uid() IS NOT NULL) AND (NOT (EXISTS ( SELECT 1
   FROM client_portal_access cpa
  WHERE (cpa.auth_uid = auth.uid()))))));
CREATE POLICY cpa_sel ON public.client_portal_access FOR SELECT TO public USING ((auth_uid = auth.uid()));
CREATE POLICY cpa_upd ON public.client_portal_access FOR UPDATE TO public USING ((auth_uid = auth.uid()));
CREATE POLICY complaints_client_ins ON public.complaints FOR INSERT TO public WITH CHECK (((my_client_contact_digits() IS NOT NULL) AND ("right"(regexp_replace(contact, '[^0-9]'::text, ''::text, 'g'::text), 9) = my_client_contact_digits())));
CREATE POLICY complaints_client_sel ON public.complaints FOR SELECT TO public USING (((my_client_contact_digits() IS NOT NULL) AND ("right"(regexp_replace(contact, '[^0-9]'::text, ''::text, 'g'::text), 9) = my_client_contact_digits()) AND (lower(TRIM(BOTH FROM name)) = my_client_name())));
CREATE POLICY complaints_del ON public.complaints FOR DELETE TO public USING (((agent_key = my_key()) OR (my_role() = 'manager'::text)));
CREATE POLICY complaints_ins ON public.complaints FOR INSERT TO public WITH CHECK ((agent_key = my_key()));
CREATE POLICY complaints_sel ON public.complaints FOR SELECT TO public USING (((agent_key = my_key()) OR (my_role() = 'manager'::text)));
CREATE POLICY complaints_upd ON public.complaints FOR UPDATE TO public USING (((agent_key = my_key()) OR (my_role() = 'manager'::text)));
CREATE POLICY contract_requests_client_sel ON public.contract_requests FOR SELECT TO public USING (((my_client_contact_digits() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM leads l
  WHERE ((l.id = contract_requests.lead_id) AND ("right"(regexp_replace(l.contact, '[^0-9]'::text, ''::text, 'g'::text), 9) = my_client_contact_digits()) AND (lower(TRIM(BOTH FROM l.name)) = my_client_name()))))));
CREATE POLICY contract_requests_ins ON public.contract_requests FOR INSERT TO public WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY contract_requests_sel ON public.contract_requests FOR SELECT TO public USING (((requested_by = my_key()) OR (my_role() = 'manager'::text) OR (my_key() = 'elizabeth'::text)));
CREATE POLICY contract_requests_upd ON public.contract_requests FOR UPDATE TO public USING (((my_role() = 'manager'::text) OR (my_key() = 'elizabeth'::text)));
CREATE POLICY contracts_ins ON public.contracts FOR INSERT TO public WITH CHECK (((my_key() = 'elizabeth'::text) OR (my_role() = 'manager'::text)));
CREATE POLICY contracts_sel ON public.contracts FOR SELECT TO public USING (((agent_key = my_key()) OR (my_role() = 'manager'::text) OR (my_key() = ANY (ARRAY['elias'::text, 'emmanuel'::text, 'elizabeth'::text])) OR ((my_client_contact_digits() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM leads l
  WHERE ((l.id = contracts.lead_id) AND ("right"(regexp_replace(l.contact, '[^0-9]'::text, ''::text, 'g'::text), 9) = my_client_contact_digits()) AND (lower(TRIM(BOTH FROM l.name)) = my_client_name())))))));
CREATE POLICY dailybal_ins ON public.daily_balances FOR INSERT TO public WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY dailybal_sel ON public.daily_balances FOR SELECT TO public USING ((auth.uid() IS NOT NULL));
CREATE POLICY dailybal_upd ON public.daily_balances FOR UPDATE TO public USING ((auth.uid() IS NOT NULL));
CREATE POLICY downloads_ins ON public.downloads FOR INSERT TO public WITH CHECK (((auth.uid() IS NOT NULL) AND (user_key = my_key())));
CREATE POLICY downloads_sel ON public.downloads FOR SELECT TO public USING (((user_key = my_key()) OR (my_role() = 'manager'::text)));
CREATE POLICY downloads_upd ON public.downloads FOR UPDATE TO public USING (((user_key = my_key()) OR (my_role() = 'manager'::text)));
CREATE POLICY enquiries_client_ins ON public.enquiries FOR INSERT TO public WITH CHECK (((my_client_contact_digits() IS NOT NULL) AND ("right"(regexp_replace(contact, '[^0-9]'::text, ''::text, 'g'::text), 9) = my_client_contact_digits())));
CREATE POLICY enquiries_client_sel ON public.enquiries FOR SELECT TO public USING (((my_client_contact_digits() IS NOT NULL) AND ("right"(regexp_replace(contact, '[^0-9]'::text, ''::text, 'g'::text), 9) = my_client_contact_digits()) AND (lower(TRIM(BOTH FROM name)) = my_client_name())));
CREATE POLICY enquiries_del ON public.enquiries FOR DELETE TO public USING (((agent_key = my_key()) OR (my_role() = 'manager'::text)));
CREATE POLICY enquiries_ins ON public.enquiries FOR INSERT TO public WITH CHECK ((agent_key = my_key()));
CREATE POLICY enquiries_sel ON public.enquiries FOR SELECT TO public USING (((agent_key = my_key()) OR (my_role() = 'manager'::text)));
CREATE POLICY enquiries_upd ON public.enquiries FOR UPDATE TO public USING (((agent_key = my_key()) OR (my_role() = 'manager'::text)));
CREATE POLICY expcat_ins ON public.expense_categories FOR INSERT TO public WITH CHECK ((my_role() = 'manager'::text));
CREATE POLICY expcat_sel ON public.expense_categories FOR SELECT TO public USING ((auth.uid() IS NOT NULL));
CREATE POLICY expcat_upd ON public.expense_categories FOR UPDATE TO public USING ((my_role() = 'manager'::text));
CREATE POLICY expenses_ins ON public.expenses FOR INSERT TO public WITH CHECK ((logged_by = my_key()));
CREATE POLICY expenses_sel ON public.expenses FOR SELECT TO public USING (((logged_by = my_key()) OR (my_role() = 'manager'::text)));
CREATE POLICY expenses_upd ON public.expenses FOR UPDATE TO public USING (((logged_by = my_key()) OR (my_role() = 'manager'::text)));
CREATE POLICY feedback_del ON public.feedback FOR DELETE TO public USING (((author_key = my_key()) OR (my_role() = 'manager'::text)));
CREATE POLICY feedback_ins ON public.feedback FOR INSERT TO public WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY feedback_sel ON public.feedback FOR SELECT TO public USING ((auth.uid() IS NOT NULL));
CREATE POLICY fbcom_ins ON public.feedback_comments FOR INSERT TO public WITH CHECK (((auth.uid() IS NOT NULL) AND (author_key = my_key())));
CREATE POLICY fbcom_sel ON public.feedback_comments FOR SELECT TO public USING ((auth.uid() IS NOT NULL));
CREATE POLICY fundreq_ins ON public.fund_requests FOR INSERT TO public WITH CHECK ((requested_by = my_key()));
CREATE POLICY fundreq_sel ON public.fund_requests FOR SELECT TO public USING (((requested_by = my_key()) OR (my_role() = 'manager'::text)));
CREATE POLICY fundreq_upd ON public.fund_requests FOR UPDATE TO public USING (((requested_by = my_key()) OR (my_role() = 'manager'::text)));
CREATE POLICY leads_client_sel ON public.leads FOR SELECT TO public USING (((my_client_contact_digits() IS NOT NULL) AND ("right"(regexp_replace(contact, '[^0-9]'::text, ''::text, 'g'::text), 9) = my_client_contact_digits()) AND (lower(TRIM(BOTH FROM name)) = my_client_name())));
CREATE POLICY leads_del ON public.leads FOR DELETE TO public USING (((agent_key = my_key()) OR (my_role() = 'manager'::text)));
CREATE POLICY leads_ins ON public.leads FOR INSERT TO public WITH CHECK ((((agent_key = my_key()) OR (my_key() = ANY (ARRAY['elias'::text, 'emmanuel'::text, 'elizabeth'::text])) OR (my_role() = 'manager'::text)) AND ((amt_paid IS NULL) OR (amt_paid = (0)::numeric) OR (my_key() = ANY (ARRAY['elias'::text, 'emmanuel'::text, 'elizabeth'::text])) OR (my_role() = 'manager'::text))));
CREATE POLICY leads_sel ON public.leads FOR SELECT TO public USING (((agent_key = my_key()) OR (my_role() = 'manager'::text) OR (my_key() = ANY (ARRAY['elias'::text, 'emmanuel'::text, 'elizabeth'::text]))));
CREATE POLICY leads_upd ON public.leads FOR UPDATE TO public USING (((agent_key = my_key()) OR (my_role() = 'manager'::text) OR (my_key() = 'elias'::text)));
CREATE POLICY leads_upd_company ON public.leads FOR UPDATE TO public USING (((agent_key = 'company'::text) AND ((my_role() = 'manager'::text) OR (my_key() = ANY (ARRAY['elias'::text, 'emmanuel'::text, 'elizabeth'::text]))))) WITH CHECK (((my_role() = 'manager'::text) OR (my_key() = ANY (ARRAY['elias'::text, 'emmanuel'::text, 'elizabeth'::text]))));
CREATE POLICY leave_requests_del ON public.leave_requests FOR DELETE TO public USING (((agent_key = my_key()) OR (my_role() = 'manager'::text)));
CREATE POLICY leave_requests_ins ON public.leave_requests FOR INSERT TO public WITH CHECK (((agent_key = my_key()) OR (my_role() = 'manager'::text)));
CREATE POLICY leave_requests_sel ON public.leave_requests FOR SELECT TO public USING ((auth.uid() IS NOT NULL));
CREATE POLICY leave_requests_upd ON public.leave_requests FOR UPDATE TO public USING (((agent_key = my_key()) OR (my_role() = 'manager'::text)));
CREATE POLICY memo_recipients_ins ON public.memo_recipients FOR INSERT TO public WITH CHECK (is_memo_sender(memo_id));
CREATE POLICY memo_recipients_sel ON public.memo_recipients FOR SELECT TO public USING (((staff_key = my_key()) OR (my_role() = 'manager'::text) OR is_memo_sender(memo_id)));
CREATE POLICY memo_recipients_upd ON public.memo_recipients FOR UPDATE TO public USING (((staff_key = my_key()) OR (my_role() = 'manager'::text)));
CREATE POLICY memos_del ON public.memos FOR DELETE TO public USING (((from_key = my_key()) OR (my_role() = 'manager'::text)));
CREATE POLICY memos_ins ON public.memos FOR INSERT TO public WITH CHECK ((from_key = my_key()));
CREATE POLICY memos_sel ON public.memos FOR SELECT TO public USING (((from_key = my_key()) OR ((to_key = my_key()) AND (status <> 'draft'::text)) OR (my_role() = 'manager'::text) OR is_memo_cc_recipient(id)));
CREATE POLICY memos_upd ON public.memos FOR UPDATE TO public USING (((to_key = my_key()) OR ((from_key = my_key()) AND (status = 'draft'::text)) OR (my_role() = 'manager'::text)));
CREATE POLICY messages_del ON public.messages FOR DELETE TO public USING ((sender_key = my_key()));
CREATE POLICY messages_ins ON public.messages FOR INSERT TO public WITH CHECK (((auth.uid() IS NOT NULL) AND (sender_key = my_key())));
CREATE POLICY messages_sel ON public.messages FOR SELECT TO public USING (((sender_key = my_key()) OR (recipient_key = my_key())));
CREATE POLICY notes_del ON public.notes FOR DELETE TO public USING ((owner_key = my_key()));
CREATE POLICY notes_ins ON public.notes FOR INSERT TO public WITH CHECK ((owner_key = my_key()));
CREATE POLICY notes_sel ON public.notes FOR SELECT TO public USING (((owner_key = my_key()) OR (my_role() = 'manager'::text)));
CREATE POLICY notes_upd ON public.notes FOR UPDATE TO public USING ((owner_key = my_key())) WITH CHECK ((owner_key = my_key()));
CREATE POLICY pr_ins ON public.payment_reminders_log FOR INSERT TO public WITH CHECK (((my_role() = 'manager'::text) OR (my_key() = 'elias'::text)));
CREATE POLICY pr_sel ON public.payment_reminders_log FOR SELECT TO public USING (((my_role() = 'manager'::text) OR (my_key() = 'elias'::text)));
CREATE POLICY payments_client_sel ON public.payments FOR SELECT TO public USING (((status = 'approved'::text) AND (my_client_contact_digits() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM leads l
  WHERE ((l.id = payments.lead_id) AND ("right"(regexp_replace(l.contact, '[^0-9]'::text, ''::text, 'g'::text), 9) = my_client_contact_digits()) AND (lower(TRIM(BOTH FROM l.name)) = my_client_name()))))));
CREATE POLICY payments_del ON public.payments FOR DELETE TO public USING (((my_key() = 'elias'::text) OR (my_role() = 'manager'::text)));
CREATE POLICY payments_ins ON public.payments FOR INSERT TO public WITH CHECK ((((my_key() = 'elias'::text) OR (my_role() = 'manager'::text)) AND (agent_key = ( SELECT l.agent_key
   FROM leads l
  WHERE (l.id = payments.lead_id)))));
CREATE POLICY payments_sel ON public.payments FOR SELECT TO public USING (((agent_key = my_key()) OR (my_role() = 'manager'::text) OR (my_key() = ANY (ARRAY['elias'::text, 'emmanuel'::text, 'elizabeth'::text]))));
CREATE POLICY payments_upd ON public.payments FOR UPDATE TO public USING (((my_key() = 'elias'::text) OR (my_role() = 'manager'::text)));
CREATE POLICY pr_client_ins ON public.plot_requests FOR INSERT TO public WITH CHECK (((my_client_contact_digits() IS NOT NULL) AND ("right"(regexp_replace(client_contact, '[^0-9]'::text, ''::text, 'g'::text), 9) = my_client_contact_digits())));
CREATE POLICY pr_client_sel ON public.plot_requests FOR SELECT TO public USING (((my_client_contact_digits() IS NOT NULL) AND ("right"(regexp_replace(client_contact, '[^0-9]'::text, ''::text, 'g'::text), 9) = my_client_contact_digits()) AND (lower(TRIM(BOTH FROM client_name)) = my_client_name())));
CREATE POLICY pr_staff_sel ON public.plot_requests FOR SELECT TO public USING (((agent_key = my_key()) OR (my_role() = 'manager'::text) OR (my_key() = ANY (ARRAY['elias'::text, 'emmanuel'::text, 'elizabeth'::text]))));
CREATE POLICY pr_staff_upd ON public.plot_requests FOR UPDATE TO public USING (((agent_key = my_key()) OR (my_role() = 'manager'::text) OR (my_key() = ANY (ARRAY['elias'::text, 'emmanuel'::text, 'elizabeth'::text]))));
CREATE POLICY plots_del ON public.plots FOR DELETE TO public USING (((my_role() = 'manager'::text) OR (my_key() = ANY (ARRAY['elias'::text, 'emmanuel'::text]))));
CREATE POLICY plots_ins ON public.plots FOR INSERT TO public WITH CHECK (((my_role() = 'manager'::text) OR (my_key() = ANY (ARRAY['elias'::text, 'emmanuel'::text]))));
CREATE POLICY plots_sel ON public.plots FOR SELECT TO public USING (((my_role() = 'manager'::text) OR (my_key() = ANY (ARRAY['elias'::text, 'emmanuel'::text]))));
CREATE POLICY plots_upd ON public.plots FOR UPDATE TO public USING (((my_role() = 'manager'::text) OR (my_key() = ANY (ARRAY['elias'::text, 'emmanuel'::text]))));
CREATE POLICY pricing_history_ins ON public.pricing_history FOR INSERT TO public WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY pricing_history_sel ON public.pricing_history FOR SELECT TO public USING ((auth.uid() IS NOT NULL));
CREATE POLICY p_profiles_ins ON public.profiles FOR INSERT TO public WITH CHECK (((id = auth.uid()) AND (role = 'agent'::text)));
CREATE POLICY p_profiles_sel ON public.profiles FOR SELECT TO public USING (((auth.uid() IS NOT NULL) AND ((NOT (EXISTS ( SELECT 1
   FROM client_portal_access cpa
  WHERE (cpa.auth_uid = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (client_portal_access cpa
     JOIN leads l ON (("right"(regexp_replace(l.contact, '[^0-9]'::text, ''::text, 'g'::text), 9) = "right"(regexp_replace(cpa.client_contact, '[^0-9]'::text, ''::text, 'g'::text), 9))))
  WHERE ((cpa.auth_uid = auth.uid()) AND (l.agent_key = profiles.agent_key)))))));
CREATE POLICY p_profiles_upd ON public.profiles FOR UPDATE TO public USING (((id = auth.uid()) OR (my_role() = 'manager'::text)));
CREATE POLICY ps_del_client ON public.push_subscriptions FOR DELETE TO public USING (((owner_kind = 'client'::text) AND (owner_id = ( SELECT (cpa.id)::text AS id
   FROM client_portal_access cpa
  WHERE (cpa.auth_uid = auth.uid())))));
CREATE POLICY ps_del_staff ON public.push_subscriptions FOR DELETE TO public USING (((owner_kind = 'staff'::text) AND (owner_id = my_key())));
CREATE POLICY ps_ins_client ON public.push_subscriptions FOR INSERT TO public WITH CHECK (((owner_kind = 'client'::text) AND (owner_id = ( SELECT (cpa.id)::text AS id
   FROM client_portal_access cpa
  WHERE (cpa.auth_uid = auth.uid())))));
CREATE POLICY ps_ins_staff ON public.push_subscriptions FOR INSERT TO public WITH CHECK (((owner_kind = 'staff'::text) AND (owner_id = my_key())));
CREATE POLICY ps_upd_client ON public.push_subscriptions FOR UPDATE TO public USING (((owner_kind = 'client'::text) AND (owner_id = ( SELECT (cpa.id)::text AS id
   FROM client_portal_access cpa
  WHERE (cpa.auth_uid = auth.uid())))));
CREATE POLICY ps_upd_staff ON public.push_subscriptions FOR UPDATE TO public USING (((owner_kind = 'staff'::text) AND (owner_id = my_key())));
CREATE POLICY pt_ins_client ON public.push_tokens FOR INSERT TO public WITH CHECK (((owner_kind = 'client'::text) AND (owner_id = ( SELECT (cpa.id)::text AS id
   FROM client_portal_access cpa
  WHERE (cpa.auth_uid = auth.uid())))));
CREATE POLICY pt_ins_staff ON public.push_tokens FOR INSERT TO public WITH CHECK (((owner_kind = 'staff'::text) AND (owner_id = my_key())));
CREATE POLICY pt_upd_client ON public.push_tokens FOR UPDATE TO public USING (((owner_kind = 'client'::text) AND (owner_id = ( SELECT (cpa.id)::text AS id
   FROM client_portal_access cpa
  WHERE (cpa.auth_uid = auth.uid())))));
CREATE POLICY pt_upd_staff ON public.push_tokens FOR UPDATE TO public USING (((owner_kind = 'staff'::text) AND (owner_id = my_key())));
CREATE POLICY quotation_ins ON public.quotation_requests FOR INSERT TO public WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY quotation_sel ON public.quotation_requests FOR SELECT TO public USING (((requested_by = my_key()) OR (my_role() = 'manager'::text)));
CREATE POLICY rl_ins_staff ON public.receipt_log FOR INSERT TO public WITH CHECK ((my_key() IS NOT NULL));
CREATE POLICY rl_sel ON public.receipt_log FOR SELECT TO public USING ((my_key() IS NOT NULL));
CREATE POLICY recurexp_del ON public.recurring_expenses FOR DELETE TO public USING ((my_role() = 'manager'::text));
CREATE POLICY recurexp_ins ON public.recurring_expenses FOR INSERT TO public WITH CHECK ((my_role() = 'manager'::text));
CREATE POLICY recurexp_sel ON public.recurring_expenses FOR SELECT TO public USING ((auth.uid() IS NOT NULL));
CREATE POLICY recurexp_upd ON public.recurring_expenses FOR UPDATE TO public USING ((my_role() = 'manager'::text));
CREATE POLICY referrals_del_staff ON public.referrals FOR DELETE TO public USING ((((my_role() = 'manager'::text) OR (my_key() = ANY (ARRAY['elias'::text, 'emmanuel'::text, 'elizabeth'::text]))) AND (status <> 'Cleared'::text)));
CREATE POLICY referrals_ins ON public.referrals FOR INSERT TO public WITH CHECK (true);
CREATE POLICY referrals_sel_client ON public.referrals FOR SELECT TO public USING (((my_client_contact_digits() IS NOT NULL) AND ("right"(regexp_replace(referrer_contact, '[^0-9]'::text, ''::text, 'g'::text), 9) = my_client_contact_digits()) AND (lower(TRIM(BOTH FROM referrer_name)) = my_client_name())));
CREATE POLICY referrals_sel_staff ON public.referrals FOR SELECT TO public USING (((my_role() = 'manager'::text) OR (my_key() = ANY (ARRAY['elias'::text, 'emmanuel'::text, 'elizabeth'::text])) OR (referrer_lead_id IN ( SELECT leads.id
   FROM leads
  WHERE (leads.agent_key = my_key())))));
CREATE POLICY referrals_upd_staff ON public.referrals FOR UPDATE TO public USING (((my_role() = 'manager'::text) OR (my_key() = ANY (ARRAY['elias'::text, 'emmanuel'::text, 'elizabeth'::text]))));
CREATE POLICY schedule_item_invitees_del ON public.schedule_item_invitees FOR DELETE TO public USING (((my_role() = 'manager'::text) OR (EXISTS ( SELECT 1
   FROM schedule_items si
  WHERE ((si.id = schedule_item_invitees.schedule_item_id) AND ((si.owner_key = my_key()) OR (si.assigned_to = my_key()) OR (si.assigned_by = my_key())))))));
CREATE POLICY schedule_item_invitees_ins ON public.schedule_item_invitees FOR INSERT TO public WITH CHECK (((my_role() = 'manager'::text) OR (EXISTS ( SELECT 1
   FROM schedule_items si
  WHERE ((si.id = schedule_item_invitees.schedule_item_id) AND ((si.owner_key = my_key()) OR (si.assigned_to = my_key()) OR (si.assigned_by = my_key())))))));
CREATE POLICY schedule_item_invitees_sel ON public.schedule_item_invitees FOR SELECT TO public USING (((staff_key = my_key()) OR (my_role() = 'manager'::text) OR (EXISTS ( SELECT 1
   FROM schedule_items si
  WHERE ((si.id = schedule_item_invitees.schedule_item_id) AND ((si.owner_key = my_key()) OR (si.assigned_to = my_key()) OR (si.assigned_by = my_key())))))));
CREATE POLICY schedule_item_invitees_upd ON public.schedule_item_invitees FOR UPDATE TO public USING (((staff_key = my_key()) OR (my_role() = 'manager'::text) OR (EXISTS ( SELECT 1
   FROM schedule_items si
  WHERE ((si.id = schedule_item_invitees.schedule_item_id) AND ((si.owner_key = my_key()) OR (si.assigned_to = my_key()) OR (si.assigned_by = my_key())))))));
CREATE POLICY schedule_items_del ON public.schedule_items FOR DELETE TO public USING (((owner_key = my_key()) OR (assigned_to = my_key()) OR (assigned_by = my_key()) OR (my_role() = 'manager'::text)));
CREATE POLICY schedule_items_ins ON public.schedule_items FOR INSERT TO public WITH CHECK ((owner_key = my_key()));
CREATE POLICY schedule_items_sel ON public.schedule_items FOR SELECT TO public USING (((owner_key = my_key()) OR (assigned_to = my_key()) OR (assigned_by = my_key()) OR (my_role() = 'manager'::text) OR task_event_participant(id)));
CREATE POLICY schedule_items_sel_invitee ON public.schedule_items FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM schedule_item_invitees sii
  WHERE ((sii.schedule_item_id = schedule_items.id) AND (sii.staff_key = my_key())))));
CREATE POLICY schedule_items_upd ON public.schedule_items FOR UPDATE TO public USING (((owner_key = my_key()) OR (assigned_to = my_key()) OR (assigned_by = my_key()) OR (my_role() = 'manager'::text)));
CREATE POLICY site_visit_feedback_client_ins ON public.site_visit_feedback FOR INSERT TO public WITH CHECK (((my_client_contact_digits() IS NOT NULL) AND ("right"(regexp_replace(client_contact, '[^0-9]'::text, ''::text, 'g'::text), 9) = my_client_contact_digits())));
CREATE POLICY site_visit_feedback_client_sel ON public.site_visit_feedback FOR SELECT TO public USING (((my_client_contact_digits() IS NOT NULL) AND ("right"(regexp_replace(client_contact, '[^0-9]'::text, ''::text, 'g'::text), 9) = my_client_contact_digits())));
CREATE POLICY site_visit_feedback_client_upd ON public.site_visit_feedback FOR UPDATE TO public USING (((my_client_contact_digits() IS NOT NULL) AND ("right"(regexp_replace(client_contact, '[^0-9]'::text, ''::text, 'g'::text), 9) = my_client_contact_digits())));
CREATE POLICY site_visit_feedback_staff_sel ON public.site_visit_feedback FOR SELECT TO public USING (((my_role() = 'manager'::text) OR (my_key() = ANY (ARRAY['elias'::text, 'emmanuel'::text, 'elizabeth'::text]))));
CREATE POLICY site_visits_client_ins ON public.site_visits FOR INSERT TO public WITH CHECK (((my_client_contact_digits() IS NOT NULL) AND ("right"(regexp_replace(contact, '[^0-9]'::text, ''::text, 'g'::text), 9) = my_client_contact_digits())));
CREATE POLICY site_visits_client_sel ON public.site_visits FOR SELECT TO public USING (((my_client_contact_digits() IS NOT NULL) AND ("right"(regexp_replace(contact, '[^0-9]'::text, ''::text, 'g'::text), 9) = my_client_contact_digits()) AND (lower(TRIM(BOTH FROM name)) = my_client_name())));
CREATE POLICY site_visits_del ON public.site_visits FOR DELETE TO public USING (((agent_key = my_key()) OR (my_role() = 'manager'::text) OR (my_key() = ANY (ARRAY['elias'::text, 'emmanuel'::text, 'elizabeth'::text]))));
CREATE POLICY site_visits_ins ON public.site_visits FOR INSERT TO public WITH CHECK ((agent_key = my_key()));
CREATE POLICY site_visits_sel ON public.site_visits FOR SELECT TO public USING (((agent_key = my_key()) OR (my_role() = 'manager'::text) OR (my_key() = ANY (ARRAY['elias'::text, 'emmanuel'::text, 'elizabeth'::text]))));
CREATE POLICY site_visits_upd ON public.site_visits FOR UPDATE TO public USING (((agent_key = my_key()) OR (my_role() = 'manager'::text)));
CREATE POLICY sms_log_ins ON public.sms_log FOR INSERT TO public WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY sms_log_sel ON public.sms_log FOR SELECT TO public USING (((my_role() = 'manager'::text) OR (sent_by = my_key())));
CREATE POLICY staff_achievements_ins ON public.staff_achievements FOR INSERT TO public WITH CHECK (((staff_key = my_key()) OR (my_role() = 'manager'::text)));
CREATE POLICY staff_achievements_sel ON public.staff_achievements FOR SELECT TO public USING ((auth.uid() IS NOT NULL));
CREATE POLICY target_sel_del ON public.target_selections FOR DELETE TO public USING ((agent_key = my_key()));
CREATE POLICY target_sel_ins ON public.target_selections FOR INSERT TO public WITH CHECK ((agent_key = my_key()));
CREATE POLICY target_sel_sel ON public.target_selections FOR SELECT TO public USING (((agent_key = my_key()) OR (my_role() = 'manager'::text)));
CREATE POLICY target_sel_upd ON public.target_selections FOR UPDATE TO public USING ((agent_key = my_key()));
CREATE POLICY task_events_ins ON public.task_events FOR INSERT TO public WITH CHECK (((auth.uid() IS NOT NULL) AND can_see_task(task_id)));
CREATE POLICY task_events_sel ON public.task_events FOR SELECT TO public USING (can_see_task(task_id));
CREATE POLICY tasks_del ON public.tasks FOR DELETE TO public USING (((assigned_to = my_key()) OR (assigned_by = my_key()) OR (my_role() = 'manager'::text)));
CREATE POLICY tasks_ins ON public.tasks FOR INSERT TO public WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY tasks_sel ON public.tasks FOR SELECT TO public USING (((assigned_to = my_key()) OR (assigned_by = my_key()) OR (my_role() = 'manager'::text) OR task_event_participant(id)));
CREATE POLICY tasks_upd ON public.tasks FOR UPDATE TO public USING (((assigned_to = my_key()) OR (assigned_by = my_key()) OR (my_role() = 'manager'::text) OR task_event_participant(id)));
CREATE POLICY todo_del ON public.todo_items FOR DELETE TO public USING ((owner_key = my_key()));
CREATE POLICY todo_ins ON public.todo_items FOR INSERT TO public WITH CHECK ((owner_key = my_key()));
CREATE POLICY todo_sel ON public.todo_items FOR SELECT TO public USING (((owner_key = my_key()) OR (my_role() = 'manager'::text)));
CREATE POLICY todo_upd ON public.todo_items FOR UPDATE TO public USING ((owner_key = my_key()));
CREATE POLICY wvf_staff_ins ON public.weekly_visit_forms FOR INSERT TO public WITH CHECK (((my_role() = 'manager'::text) OR (my_key() = ANY (ARRAY['elias'::text, 'emmanuel'::text, 'elizabeth'::text]))));
CREATE POLICY wvf_staff_sel ON public.weekly_visit_forms FOR SELECT TO public USING (((my_role() = 'manager'::text) OR (my_key() = ANY (ARRAY['elias'::text, 'emmanuel'::text, 'elizabeth'::text]))));
CREATE POLICY wvf_staff_upd ON public.weekly_visit_forms FOR UPDATE TO public USING (((my_role() = 'manager'::text) OR (my_key() = ANY (ARRAY['elias'::text, 'emmanuel'::text, 'elizabeth'::text]))));
