-- ============ VIEWS ============

CREATE OR REPLACE VIEW public.agent_month_stats AS
 WITH first_pay AS (
         SELECT DISTINCT ON (payments.lead_id) payments.lead_id,
            payments.agent_key,
            payments.payment_date AS first_date
           FROM payments
          ORDER BY payments.lead_id, payments.payment_date, payments.id
        ), new_sales AS (
         SELECT first_pay.agent_key,
            to_char((first_pay.first_date)::timestamp with time zone, 'YYYY-MM'::text) AS month,
            count(*) AS new_sales_count
           FROM first_pay
          GROUP BY first_pay.agent_key, (to_char((first_pay.first_date)::timestamp with time zone, 'YYYY-MM'::text))
        ), collected AS (
         SELECT payments.agent_key,
            to_char((payments.payment_date)::timestamp with time zone, 'YYYY-MM'::text) AS month,
            sum(payments.amount) AS total_collected
           FROM payments
          GROUP BY payments.agent_key, (to_char((payments.payment_date)::timestamp with time zone, 'YYYY-MM'::text))
        )
 SELECT COALESCE(c.agent_key, n.agent_key) AS agent_key,
    COALESCE(c.month, n.month) AS month,
    COALESCE(c.total_collected, (0)::numeric) AS total_collected,
    COALESCE(n.new_sales_count, (0)::bigint) AS new_sales_count
   FROM (collected c
     FULL JOIN new_sales n ON (((c.agent_key = n.agent_key) AND (c.month = n.month))));

CREATE OR REPLACE VIEW public.plots_availability AS
 SELECT id,
    site,
    plot_number,
    plot_type,
    status,
    price,
    updated_at
   FROM plots;

CREATE OR REPLACE VIEW public.plots_my_sales AS
 SELECT id,
    site,
    plot_number,
    plot_type,
    status,
    price,
    client_name,
    client_contact,
    agent_key,
    notes,
    created_at,
    updated_at
   FROM plots
  WHERE (agent_key = my_key());

CREATE OR REPLACE VIEW public.staff_directory AS
 SELECT name,
    email,
    role,
    agent_key,
    active
   FROM profiles
  WHERE (active = true);

-- ============ PRIMARY KEY / UNIQUE / CHECK CONSTRAINTS ============

ALTER TABLE public.achievement_definitions ADD CONSTRAINT achievement_definitions_pkey PRIMARY KEY (id);
ALTER TABLE public.activity_log ADD CONSTRAINT activity_log_pkey PRIMARY KEY (id);
ALTER TABLE public.allocation_requests ADD CONSTRAINT allocation_requests_pkey PRIMARY KEY (id);
ALTER TABLE public.allowed_emails ADD CONSTRAINT allowed_emails_pkey PRIMARY KEY (email);
ALTER TABLE public.announcement_comments ADD CONSTRAINT announcement_comments_pkey PRIMARY KEY (id);
ALTER TABLE public.announcements ADD CONSTRAINT announcements_pkey PRIMARY KEY (id);
ALTER TABLE public.app_config ADD CONSTRAINT app_config_pkey PRIMARY KEY (id);
ALTER TABLE public.attendance_log ADD CONSTRAINT attendance_log_pkey PRIMARY KEY (id);
ALTER TABLE public.backups ADD CONSTRAINT backups_pkey PRIMARY KEY (id);
ALTER TABLE public.banner_status_log ADD CONSTRAINT banner_status_log_pkey PRIMARY KEY (id);
ALTER TABLE public.banners ADD CONSTRAINT banners_pkey PRIMARY KEY (id);
ALTER TABLE public.client_notifications ADD CONSTRAINT client_notifications_pkey PRIMARY KEY (id);
ALTER TABLE public.client_portal_access ADD CONSTRAINT client_portal_access_pkey PRIMARY KEY (id);
ALTER TABLE public.complaints ADD CONSTRAINT complaints_pkey PRIMARY KEY (id);
ALTER TABLE public.contract_requests ADD CONSTRAINT contract_requests_pkey PRIMARY KEY (id);
ALTER TABLE public.contracts ADD CONSTRAINT contracts_pkey PRIMARY KEY (id);
ALTER TABLE public.daily_balances ADD CONSTRAINT daily_balances_pkey PRIMARY KEY (id);
ALTER TABLE public.downloads ADD CONSTRAINT downloads_pkey PRIMARY KEY (id);
ALTER TABLE public.enquiries ADD CONSTRAINT enquiries_pkey PRIMARY KEY (id);
ALTER TABLE public.expense_categories ADD CONSTRAINT expense_categories_pkey PRIMARY KEY (id);
ALTER TABLE public.expenses ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);
ALTER TABLE public.feedback ADD CONSTRAINT feedback_pkey PRIMARY KEY (id);
ALTER TABLE public.feedback_comments ADD CONSTRAINT feedback_comments_pkey PRIMARY KEY (id);
ALTER TABLE public.fund_requests ADD CONSTRAINT fund_requests_pkey PRIMARY KEY (id);
ALTER TABLE public.leads ADD CONSTRAINT leads_pkey PRIMARY KEY (id);
ALTER TABLE public.leave_requests ADD CONSTRAINT leave_requests_pkey PRIMARY KEY (id);
ALTER TABLE public.memo_recipients ADD CONSTRAINT memo_recipients_pkey PRIMARY KEY (id);
ALTER TABLE public.memos ADD CONSTRAINT memos_pkey PRIMARY KEY (id);
ALTER TABLE public.messages ADD CONSTRAINT messages_pkey PRIMARY KEY (id);
ALTER TABLE public.notes ADD CONSTRAINT notes_pkey PRIMARY KEY (id);
ALTER TABLE public.payment_reminders_log ADD CONSTRAINT payment_reminders_log_pkey PRIMARY KEY (id);
ALTER TABLE public.payments ADD CONSTRAINT payments_pkey PRIMARY KEY (id);
ALTER TABLE public.plot_requests ADD CONSTRAINT plot_requests_pkey PRIMARY KEY (id);
ALTER TABLE public.plots ADD CONSTRAINT plots_pkey PRIMARY KEY (id);
ALTER TABLE public.pricing_history ADD CONSTRAINT pricing_history_pkey PRIMARY KEY (id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE public.push_subscriptions ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE public.push_tokens ADD CONSTRAINT push_tokens_pkey PRIMARY KEY (id);
ALTER TABLE public.quotation_requests ADD CONSTRAINT quotation_requests_pkey PRIMARY KEY (id);
ALTER TABLE public.receipt_log ADD CONSTRAINT receipt_log_pkey PRIMARY KEY (id);
ALTER TABLE public.recurring_expenses ADD CONSTRAINT recurring_expenses_pkey PRIMARY KEY (id);
ALTER TABLE public.referrals ADD CONSTRAINT referrals_pkey PRIMARY KEY (id);
ALTER TABLE public.schedule_item_invitees ADD CONSTRAINT schedule_item_invitees_pkey PRIMARY KEY (id);
ALTER TABLE public.schedule_items ADD CONSTRAINT schedule_items_pkey PRIMARY KEY (id);
ALTER TABLE public.site_visit_feedback ADD CONSTRAINT site_visit_feedback_pkey PRIMARY KEY (id);
ALTER TABLE public.site_visits ADD CONSTRAINT site_visits_pkey PRIMARY KEY (id);
ALTER TABLE public.sms_log ADD CONSTRAINT sms_log_pkey PRIMARY KEY (id);
ALTER TABLE public.staff_achievements ADD CONSTRAINT staff_achievements_pkey PRIMARY KEY (id);
ALTER TABLE public.target_selections ADD CONSTRAINT target_selections_pkey PRIMARY KEY (id);
ALTER TABLE public.task_events ADD CONSTRAINT task_events_pkey PRIMARY KEY (id);
ALTER TABLE public.tasks ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);
ALTER TABLE public.todo_items ADD CONSTRAINT todo_items_pkey PRIMARY KEY (id);
ALTER TABLE public.weekly_visit_forms ADD CONSTRAINT weekly_visit_forms_pkey PRIMARY KEY (id);
ALTER TABLE public.achievement_definitions ADD CONSTRAINT achievement_definitions_key_key UNIQUE (key);
ALTER TABLE public.attendance_log ADD CONSTRAINT attendance_log_staff_key_work_date_key UNIQUE (staff_key, work_date);
ALTER TABLE public.client_portal_access ADD CONSTRAINT client_portal_access_auth_uid_key UNIQUE (auth_uid);
ALTER TABLE public.client_portal_access ADD CONSTRAINT client_portal_access_shadow_email_key UNIQUE (shadow_email);
ALTER TABLE public.daily_balances ADD CONSTRAINT daily_balances_balance_date_key UNIQUE (balance_date);
ALTER TABLE public.expense_categories ADD CONSTRAINT expense_categories_name_key UNIQUE (name);
ALTER TABLE public.payment_reminders_log ADD CONSTRAINT payment_reminders_log_lead_id_month_key_kind_key UNIQUE (lead_id, month_key, kind);
ALTER TABLE public.payments ADD CONSTRAINT payments_receipt_number_key UNIQUE (receipt_number);
ALTER TABLE public.plots ADD CONSTRAINT plots_site_plot_number_key UNIQUE (site, plot_number);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_agent_key_key UNIQUE (agent_key);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_email_key UNIQUE (email);
ALTER TABLE public.push_subscriptions ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);
ALTER TABLE public.push_tokens ADD CONSTRAINT push_tokens_token_key UNIQUE (token);
ALTER TABLE public.schedule_item_invitees ADD CONSTRAINT schedule_item_invitees_schedule_item_id_staff_key_key UNIQUE (schedule_item_id, staff_key);
ALTER TABLE public.site_visit_feedback ADD CONSTRAINT site_visit_feedback_site_visit_id_key UNIQUE (site_visit_id);
ALTER TABLE public.staff_achievements ADD CONSTRAINT staff_achievements_staff_key_achievement_id_key UNIQUE (staff_key, achievement_id);
ALTER TABLE public.allocation_requests ADD CONSTRAINT allocation_requests_status_check CHECK ((status = ANY (ARRAY['Pending'::text, 'Awaiting Authorization'::text, 'Allocated'::text])));
ALTER TABLE public.app_config ADD CONSTRAINT app_config_single_row CHECK ((id = 1));
ALTER TABLE public.backups ADD CONSTRAINT backups_trigger_type_check CHECK ((trigger_type = ANY (ARRAY['scheduled'::text, 'manual'::text, 'pre_restore'::text])));
ALTER TABLE public.contract_requests ADD CONSTRAINT contract_requests_source_check CHECK ((source = ANY (ARRAY['staff'::text, 'client'::text])));
ALTER TABLE public.expenses ADD CONSTRAINT expenses_payment_method_check CHECK ((payment_method = ANY (ARRAY['cash'::text, 'momo'::text, 'bank'::text])));
ALTER TABLE public.expenses ADD CONSTRAINT expenses_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));
ALTER TABLE public.feedback ADD CONSTRAINT feedback_category_check CHECK ((category = ANY (ARRAY['Bug'::text, 'Suggestion'::text, 'Feature Request'::text, 'Other'::text])));
ALTER TABLE public.fund_requests ADD CONSTRAINT fund_requests_req_type_check CHECK ((req_type = ANY (ARRAY['budget'::text, 'specific'::text])));
ALTER TABLE public.fund_requests ADD CONSTRAINT fund_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));
ALTER TABLE public.leads ADD CONSTRAINT leads_doc_stage_check CHECK (((doc_stage IS NULL) OR (doc_stage = ANY (ARRAY['allocation'::text, 'picking'::text, 'site_plan'::text, 'indentures'::text, 'court_stamping'::text, 'ready_pickup'::text]))));
ALTER TABLE public.payments ADD CONSTRAINT payments_amount_check CHECK ((amount > (0)::numeric));
ALTER TABLE public.plot_requests ADD CONSTRAINT plot_requests_status_check CHECK ((status = ANY (ARRAY['Pending'::text, 'Approved'::text, 'Rejected'::text])));
ALTER TABLE public.plots ADD CONSTRAINT plots_plot_type_check CHECK ((plot_type = ANY (ARRAY['Full Plot'::text, 'Half Plot'::text])));
ALTER TABLE public.plots ADD CONSTRAINT plots_status_check CHECK ((status = ANY (ARRAY['Available'::text, 'Running Search'::text, 'Allocated'::text])));
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['agent'::text, 'manager'::text])));
ALTER TABLE public.push_subscriptions ADD CONSTRAINT push_subscriptions_owner_kind_check CHECK ((owner_kind = ANY (ARRAY['staff'::text, 'client'::text])));
ALTER TABLE public.push_tokens ADD CONSTRAINT push_tokens_owner_kind_check CHECK ((owner_kind = ANY (ARRAY['staff'::text, 'client'::text])));
ALTER TABLE public.receipt_log ADD CONSTRAINT receipt_log_actor_kind_check CHECK ((actor_kind = ANY (ARRAY['staff'::text, 'client'::text])));
ALTER TABLE public.recurring_expenses ADD CONSTRAINT recurring_expenses_interval_check CHECK (("interval" = ANY (ARRAY['monthly'::text, 'weekly'::text])));
ALTER TABLE public.schedule_item_invitees ADD CONSTRAINT schedule_item_invitees_status_check CHECK ((status = ANY (ARRAY['invited'::text, 'accepted'::text, 'declined'::text])));
ALTER TABLE public.schedule_items ADD CONSTRAINT schedule_items_kind_check CHECK ((kind = ANY (ARRAY['task'::text, 'todo'::text])));
ALTER TABLE public.schedule_items ADD CONSTRAINT schedule_items_recurs_freq_check CHECK ((recurs_freq = ANY (ARRAY['daily'::text, 'weekly'::text, 'monthly'::text])));
ALTER TABLE public.schedule_items ADD CONSTRAINT schedule_items_status_check CHECK ((status = ANY (ARRAY['open'::text, 'in_progress'::text, 'done'::text, 'cancelled'::text, 'rescheduled'::text])));
ALTER TABLE public.site_visit_feedback ADD CONSTRAINT site_visit_feedback_rating_cleanliness_check CHECK (((rating_cleanliness >= 1) AND (rating_cleanliness <= 5)));
ALTER TABLE public.site_visit_feedback ADD CONSTRAINT site_visit_feedback_rating_overall_check CHECK (((rating_overall >= 1) AND (rating_overall <= 5)));
ALTER TABLE public.site_visit_feedback ADD CONSTRAINT site_visit_feedback_rating_staff_helpfulness_check CHECK (((rating_staff_helpfulness >= 1) AND (rating_staff_helpfulness <= 5)));
ALTER TABLE public.target_selections ADD CONSTRAINT target_selections_payment_type_check CHECK ((payment_type = ANY (ARRAY['30% Deposit'::text, 'Outright'::text, 'Partial'::text])));
ALTER TABLE public.tasks ADD CONSTRAINT tasks_priority_check CHECK ((priority = ANY (ARRAY['Low'::text, 'Medium'::text, 'High'::text, 'Critical'::text])));
ALTER TABLE public.tasks ADD CONSTRAINT tasks_status_check CHECK ((status = ANY (ARRAY['Open'::text, 'In Progress'::text, 'Done'::text, 'Cancelled'::text])));
ALTER TABLE public.todo_items ADD CONSTRAINT todo_items_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text, 'rescheduled'::text])));
ALTER TABLE public.weekly_visit_forms ADD CONSTRAINT weekly_visit_forms_status_check CHECK ((status = ANY (ARRAY['Open'::text, 'Finalized'::text])));

-- ============ FOREIGN KEY CONSTRAINTS (added after all tables exist) ============

ALTER TABLE public.allocation_requests ADD CONSTRAINT allocation_requests_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;
ALTER TABLE public.announcement_comments ADD CONSTRAINT announcement_comments_announcement_id_fkey FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE;
ALTER TABLE public.banner_status_log ADD CONSTRAINT banner_status_log_banner_id_fkey FOREIGN KEY (banner_id) REFERENCES banners(id) ON DELETE CASCADE;
ALTER TABLE public.client_notifications ADD CONSTRAINT client_notifications_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_fund_request_id_fkey FOREIGN KEY (fund_request_id) REFERENCES fund_requests(id);
ALTER TABLE public.feedback_comments ADD CONSTRAINT feedback_comments_feedback_id_fkey FOREIGN KEY (feedback_id) REFERENCES feedback(id) ON DELETE CASCADE;
ALTER TABLE public.memo_recipients ADD CONSTRAINT memo_recipients_memo_id_fkey FOREIGN KEY (memo_id) REFERENCES memos(id) ON DELETE CASCADE;
ALTER TABLE public.memos ADD CONSTRAINT memos_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES memos(id);
ALTER TABLE public.payment_reminders_log ADD CONSTRAINT payment_reminders_log_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;
ALTER TABLE public.payments ADD CONSTRAINT payments_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL;
ALTER TABLE public.plot_requests ADD CONSTRAINT plot_requests_combine_with_lead_id_fkey FOREIGN KEY (combine_with_lead_id) REFERENCES leads(id) ON DELETE SET NULL;
ALTER TABLE public.plot_requests ADD CONSTRAINT plot_requests_resulting_lead_id_fkey FOREIGN KEY (resulting_lead_id) REFERENCES leads(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.receipt_log ADD CONSTRAINT receipt_log_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE;
ALTER TABLE public.referrals ADD CONSTRAINT referrals_referred_lead_id_fkey FOREIGN KEY (referred_lead_id) REFERENCES leads(id) ON DELETE SET NULL;
ALTER TABLE public.referrals ADD CONSTRAINT referrals_referrer_lead_id_fkey FOREIGN KEY (referrer_lead_id) REFERENCES leads(id) ON DELETE SET NULL;
ALTER TABLE public.schedule_item_invitees ADD CONSTRAINT schedule_item_invitees_schedule_item_id_fkey FOREIGN KEY (schedule_item_id) REFERENCES schedule_items(id) ON DELETE CASCADE;
ALTER TABLE public.schedule_items ADD CONSTRAINT schedule_items_recurs_parent_id_fkey FOREIGN KEY (recurs_parent_id) REFERENCES schedule_items(id);
ALTER TABLE public.schedule_items ADD CONSTRAINT schedule_items_rescheduled_to_id_fkey FOREIGN KEY (rescheduled_to_id) REFERENCES schedule_items(id);
ALTER TABLE public.site_visit_feedback ADD CONSTRAINT site_visit_feedback_site_visit_id_fkey FOREIGN KEY (site_visit_id) REFERENCES site_visits(id);
ALTER TABLE public.staff_achievements ADD CONSTRAINT staff_achievements_achievement_id_fkey FOREIGN KEY (achievement_id) REFERENCES achievement_definitions(id);
ALTER TABLE public.target_selections ADD CONSTRAINT target_selections_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;
ALTER TABLE public.task_events ADD CONSTRAINT task_events_task_id_fkey FOREIGN KEY (task_id) REFERENCES schedule_items(id);
ALTER TABLE public.todo_items ADD CONSTRAINT todo_items_rescheduled_to_id_fkey FOREIGN KEY (rescheduled_to_id) REFERENCES todo_items(id);
