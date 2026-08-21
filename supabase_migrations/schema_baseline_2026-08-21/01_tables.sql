-- achievement_definitions
CREATE TABLE public.achievement_definitions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  key text NOT NULL,
  label text NOT NULL,
  description text,
  icon text,
  criteria_type text NOT NULL,
  criteria_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  points integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- activity_log
CREATE TABLE public.activity_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  agent_key text NOT NULL,
  agent_name text,
  client text,
  action text,
  detail text,
  note text,
  method text,
  follow date,
  created_at timestamp with time zone DEFAULT now()
);

-- allocation_requests
CREATE TABLE public.allocation_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  lead_id uuid,
  client_name text NOT NULL,
  agent_key text NOT NULL,
  agent_name text,
  percent_paid numeric,
  grand_total numeric,
  amt_paid numeric,
  status text NOT NULL DEFAULT 'Pending'::text,
  plot_number text,
  note text,
  allocated_by text,
  agent_seen boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  resolved_at timestamp with time zone,
  suggested_plots text,
  flag_reason text,
  flagged_by text,
  flagged_at timestamp with time zone
);

-- allowed_emails
CREATE TABLE public.allowed_emails (
  email text NOT NULL,
  name text,
  invited_by text,
  created_at timestamp with time zone DEFAULT now()
);

-- announcement_comments
CREATE TABLE public.announcement_comments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  announcement_id uuid,
  author_key text NOT NULL,
  author_name text NOT NULL,
  body text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- announcements
CREATE TABLE public.announcements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text,
  image_b64 text,
  active boolean NOT NULL DEFAULT true,
  created_by text,
  created_at timestamp with time zone DEFAULT now(),
  audience text NOT NULL DEFAULT 'staff'::text
);

-- app_config
CREATE TABLE public.app_config (
  id integer NOT NULL DEFAULT 1,
  full_price numeric DEFAULT 48000,
  half_price numeric DEFAULT 26500,
  full_discount numeric DEFAULT 8000,
  half_discount numeric DEFAULT 6500,
  int_3 numeric DEFAULT 750,
  int_6 numeric DEFAULT 1500,
  int_9 numeric DEFAULT 2250,
  int_12 numeric DEFAULT 3000,
  targets jsonb DEFAULT '{}'::jsonb,
  note text DEFAULT ''::text,
  updated_at timestamp with time zone DEFAULT now(),
  commission_pct numeric DEFAULT 3,
  target_plots_per_month numeric DEFAULT 2,
  commission_full_cap numeric DEFAULT 1000,
  commission_half_cap numeric DEFAULT 500,
  commission_pool_per_plot numeric DEFAULT 500,
  last_commission_month text,
  company_phone text,
  company_whatsapp text,
  company_email text,
  quote_company_name text,
  quote_site_name text,
  receipt_thanks_text text,
  quote_doc_type_text text,
  quote_notes_text text,
  quote_land_note_text text,
  quote_footer_address text,
  contract_ceo_name text,
  contract_preamble text,
  contract_terms text,
  contract_cover_image text,
  contract_wordmark_image text,
  contract_definitions text,
  company_tin text,
  leave_total_days integer NOT NULL DEFAULT 20,
  company_address text,
  eid_observing_staff jsonb DEFAULT '[]'::jsonb,
  leaderboard_weights jsonb,
  referral_points_per_referral integer DEFAULT 50,
  referral_rewards jsonb DEFAULT '[{"label": "Free Documentation", "points": 50}, {"label": "10% Cash Discount", "points": 150}, {"label": "Half Plot", "points": 500}, {"label": "Full Plot", "points": 1000}]'::jsonb,
  receipt_logo_image text,
  attendance_cutoff_time text,
  office_lat numeric,
  office_lng numeric,
  office_radius_meters numeric DEFAULT 150,
  work_days jsonb DEFAULT '[1, 2, 3, 4, 5]'::jsonb,
  work_start_time text DEFAULT '08:00'::text,
  work_end_time text DEFAULT '17:00'::text
);

-- attendance_log
CREATE TABLE public.attendance_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  staff_key text NOT NULL,
  staff_name text,
  work_date date NOT NULL,
  sign_in_at timestamp with time zone,
  sign_in_lat double precision,
  sign_in_lng double precision,
  sign_out_at timestamp with time zone,
  sign_out_lat double precision,
  sign_out_lng double precision,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  late_reason text,
  sign_in_reason text,
  sign_out_reason text,
  is_off_site_in boolean,
  is_off_site_out boolean,
  sign_in_photo text
);

-- backups
CREATE TABLE public.backups (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  trigger_type text NOT NULL,
  triggered_by text,
  triggered_by_name text,
  snapshot jsonb NOT NULL,
  table_counts jsonb NOT NULL,
  size_bytes integer NOT NULL,
  checksum text NOT NULL
);

-- banner_status_log
CREATE TABLE public.banner_status_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  banner_id uuid NOT NULL,
  status text NOT NULL,
  note text,
  images jsonb NOT NULL DEFAULT '[]'::jsonb,
  changed_by text NOT NULL,
  changed_by_name text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- banners
CREATE TABLE public.banners (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  area text NOT NULL,
  status text NOT NULL DEFAULT 'placed'::text,
  lat double precision,
  lng double precision,
  image text,
  notes text,
  created_by text NOT NULL,
  created_by_name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- client_notifications
CREATE TABLE public.client_notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  read_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- client_portal_access
CREATE TABLE public.client_portal_access (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_name text NOT NULL,
  client_contact text NOT NULL,
  pin_hash text NOT NULL,
  pin_is_default boolean NOT NULL DEFAULT true,
  avatar text,
  auth_uid uuid,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  last_login_at timestamp with time zone,
  shadow_email text,
  shadow_password text,
  client_email text,
  client_whatsapp text
);

-- complaints
CREATE TABLE public.complaints (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  agent_key text NOT NULL,
  agent_name text,
  name text,
  contact text,
  plot text,
  category text,
  details text,
  owner text,
  priority text,
  resolution text,
  status text DEFAULT 'Open'::text,
  created_at timestamp with time zone DEFAULT now(),
  source text,
  sentiment text
);

-- contract_requests
CREATE TABLE public.contract_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  client_name text NOT NULL,
  requested_by text NOT NULL,
  requested_by_name text NOT NULL,
  note text,
  status text NOT NULL DEFAULT 'pending'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  fulfilled_at timestamp with time zone,
  read boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'staff'::text,
  client_address text,
  client_kyc jsonb
);

-- contracts
CREATE TABLE public.contracts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  client_name text NOT NULL,
  agent_key text NOT NULL,
  created_by text NOT NULL,
  created_by_name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- daily_balances
CREATE TABLE public.daily_balances (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  balance_date date NOT NULL,
  cash numeric NOT NULL DEFAULT 0,
  momo numeric NOT NULL DEFAULT 0,
  bank numeric NOT NULL DEFAULT 0,
  logged_by text,
  logged_by_name text,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- downloads
CREATE TABLE public.downloads (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_key text NOT NULL,
  user_name text NOT NULL,
  filename text NOT NULL,
  kind text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  file_data text
);

-- enquiries
CREATE TABLE public.enquiries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  agent_key text NOT NULL,
  agent_name text,
  name text,
  contact text,
  location text,
  types text,
  plot text,
  source text,
  details text,
  follow text,
  follow_date date,
  created_at timestamp with time zone DEFAULT now()
);

-- expense_categories
CREATE TABLE public.expense_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  monthly_budget numeric
);

-- expenses
CREATE TABLE public.expenses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  category text NOT NULL,
  amount numeric NOT NULL,
  payment_method text NOT NULL,
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  description text,
  receipt_data text,
  receipt_name text,
  logged_by text NOT NULL,
  logged_by_name text,
  status text NOT NULL DEFAULT 'pending'::text,
  decided_by text,
  decided_by_name text,
  decided_at timestamp with time zone,
  decision_note text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  fund_request_id uuid
);

-- feedback
CREATE TABLE public.feedback (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  author_key text NOT NULL,
  author_name text NOT NULL,
  category text NOT NULL DEFAULT 'Suggestion'::text,
  body text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- feedback_comments
CREATE TABLE public.feedback_comments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  feedback_id uuid,
  author_key text NOT NULL,
  author_name text NOT NULL,
  body text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- fund_requests
CREATE TABLE public.fund_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  req_type text NOT NULL,
  amount numeric NOT NULL,
  purpose text NOT NULL,
  requested_by text NOT NULL,
  requested_by_name text,
  status text NOT NULL DEFAULT 'pending'::text,
  decided_by text,
  decided_by_name text,
  decided_at timestamp with time zone,
  decision_note text,
  approval_signature text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  receipt_data text,
  receipt_name text
);

-- leads
CREATE TABLE public.leads (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  agent_key text NOT NULL,
  name text NOT NULL,
  contact text,
  date_added date DEFAULT CURRENT_DATE,
  stage text,
  plot_type text,
  no_plots numeric,
  unit_price numeric,
  discount numeric,
  net_total numeric,
  payment_plan text,
  grand_total numeric,
  site_visit text,
  priority text,
  amt_paid numeric DEFAULT 0,
  balance numeric,
  next_action text,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  tags text,
  deposit_target numeric,
  doc_stage text,
  doc_stage_updated_at timestamp with time zone,
  lead_source text,
  banner_id uuid,
  address text,
  kyc jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- leave_requests
CREATE TABLE public.leave_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  agent_key text NOT NULL,
  agent_name text NOT NULL,
  year integer NOT NULL,
  dates jsonb NOT NULL DEFAULT '[]'::jsonb,
  days_count integer NOT NULL DEFAULT 0,
  letter_text text,
  status text NOT NULL DEFAULT 'pending'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  decided_at timestamp with time zone,
  decided_by text,
  decided_by_name text,
  decided_signature text,
  is_emergency boolean NOT NULL DEFAULT false,
  deduct_quota boolean NOT NULL DEFAULT true,
  reschedule_note text
);

-- memo_recipients
CREATE TABLE public.memo_recipients (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  memo_id uuid NOT NULL,
  staff_key text NOT NULL,
  staff_name text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- memos
CREATE TABLE public.memos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  from_key text NOT NULL,
  from_name text NOT NULL,
  to_key text NOT NULL,
  to_name text NOT NULL,
  subject text NOT NULL,
  body_html text NOT NULL,
  parent_id uuid,
  kind text NOT NULL DEFAULT 'memo'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  read boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'sent'::text
);

-- messages
CREATE TABLE public.messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  sender_key text NOT NULL,
  sender_name text NOT NULL,
  body text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  recipient_key text,
  read boolean NOT NULL DEFAULT false,
  attachment_data text,
  attachment_type text,
  attachment_name text,
  kind text,
  ref_type text,
  ref_id uuid
);

-- notes
CREATE TABLE public.notes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_key text NOT NULL,
  title text,
  body text NOT NULL DEFAULT ''::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- payment_reminders_log
CREATE TABLE public.payment_reminders_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  month_key text NOT NULL,
  sent_at timestamp with time zone NOT NULL DEFAULT now(),
  kind text NOT NULL DEFAULT 'due'::text
);

-- payments
CREATE TABLE public.payments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  lead_id uuid,
  agent_key text NOT NULL,
  client_name text NOT NULL,
  amount numeric NOT NULL,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  note text,
  created_at timestamp with time zone DEFAULT now(),
  payment_method text,
  status text NOT NULL DEFAULT 'approved'::text,
  decided_by text,
  decided_by_name text,
  decided_at timestamp with time zone,
  receipt_number text
);

-- plot_requests
CREATE TABLE public.plot_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_name text NOT NULL,
  client_contact text NOT NULL,
  agent_key text,
  plot_type text NOT NULL,
  no_plots numeric NOT NULL DEFAULT 1,
  payment_plan text NOT NULL DEFAULT 'Full Payment'::text,
  combine_with_lead_id uuid,
  notes text,
  status text NOT NULL DEFAULT 'Pending'::text,
  resulting_lead_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  resolved_at timestamp with time zone,
  resolved_by text
);

-- plots
CREATE TABLE public.plots (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  site text NOT NULL,
  plot_number text NOT NULL,
  plot_type text DEFAULT 'Full Plot'::text,
  status text NOT NULL DEFAULT 'Available'::text,
  price numeric,
  client_name text,
  client_contact text,
  agent_key text,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- pricing_history
CREATE TABLE public.pricing_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  changed_by text NOT NULL,
  changed_by_name text NOT NULL,
  field text NOT NULL,
  field_label text NOT NULL,
  old_value numeric,
  new_value numeric,
  changed_at timestamp with time zone NOT NULL DEFAULT now()
);

-- profiles
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  email text NOT NULL,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'agent'::text,
  agent_key text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  avatar text,
  birthday date,
  phone text,
  whatsapp text,
  social_handles jsonb,
  signature_data text,
  "position" text,
  address text,
  id_number text,
  last_seen_at timestamp with time zone
);

-- push_subscriptions
CREATE TABLE public.push_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_kind text NOT NULL,
  owner_id text NOT NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  last_seen_at timestamp with time zone NOT NULL DEFAULT now()
);

-- push_tokens
CREATE TABLE public.push_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_kind text NOT NULL,
  owner_id text NOT NULL,
  token text NOT NULL,
  platform text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- quotation_requests
CREATE TABLE public.quotation_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  requested_by text,
  requested_by_name text,
  client_name text NOT NULL,
  client_address text,
  client_contact text,
  plot_type text NOT NULL,
  no_plots numeric NOT NULL DEFAULT 1,
  payment_period text NOT NULL,
  list_total numeric,
  discount_total numeric,
  interest_total numeric,
  grand_total numeric,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  client_email text
);

-- receipt_log
CREATE TABLE public.receipt_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL,
  receipt_number text NOT NULL,
  actor_kind text NOT NULL,
  actor_key text,
  actor_name text,
  channel text NOT NULL DEFAULT 'download'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- recurring_expenses
CREATE TABLE public.recurring_expenses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  category text NOT NULL,
  amount numeric NOT NULL,
  method text NOT NULL DEFAULT 'cash'::text,
  description text,
  "interval" text NOT NULL,
  day_of_period integer NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_by text NOT NULL,
  created_by_name text,
  last_reminded_period text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- referrals
CREATE TABLE public.referrals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  referrer_lead_id uuid,
  referrer_name text NOT NULL,
  referrer_contact text,
  referred_name text NOT NULL,
  referred_contact text NOT NULL,
  referred_location text,
  referred_no_plots numeric DEFAULT 1,
  referred_lead_id uuid,
  status text NOT NULL DEFAULT 'Pending'::text,
  points_awarded numeric NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'staff'::text,
  created_by_key text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  cleared_at timestamp with time zone,
  archived boolean NOT NULL DEFAULT false
);

-- schedule_item_invitees
CREATE TABLE public.schedule_item_invitees (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  schedule_item_id uuid NOT NULL,
  staff_key text NOT NULL,
  staff_name text,
  status text NOT NULL DEFAULT 'invited'::text,
  responded_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- schedule_items
CREATE TABLE public.schedule_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  owner_key text NOT NULL,
  owner_name text,
  title text NOT NULL,
  description text,
  notes text,
  contact text,
  category text NOT NULL DEFAULT 'General'::text,
  priority text NOT NULL DEFAULT 'Medium'::text,
  assigned_to text,
  assigned_to_name text,
  assigned_by text,
  assigned_by_name text,
  status text NOT NULL DEFAULT 'open'::text,
  due_date date,
  item_date date,
  start_time time without time zone,
  end_time time without time zone,
  rescheduled_to_id uuid,
  escalated_to text,
  escalated_to_name text,
  escalated_by text,
  escalated_by_name text,
  escalated_at timestamp with time zone,
  escalation_note text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  opened_at timestamp with time zone,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  cancelled_at timestamp with time zone,
  push_notified_at timestamp with time zone,
  recurs_freq text,
  recurs_interval integer,
  recurs_until date,
  recurs_parent_id uuid
);

-- site_visit_feedback
CREATE TABLE public.site_visit_feedback (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  site_visit_id uuid NOT NULL,
  client_name text NOT NULL,
  client_contact text NOT NULL,
  rating_cleanliness integer NOT NULL,
  rating_staff_helpfulness integer NOT NULL,
  rating_overall integer NOT NULL,
  comments text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- site_visits
CREATE TABLE public.site_visits (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  agent_key text,
  agent_name text,
  name text,
  contact text,
  plot text,
  site text,
  visit_date date,
  visit_time text,
  people numeric,
  transport text,
  pickup text,
  notes text,
  status text DEFAULT 'Pending'::text,
  created_at timestamp with time zone DEFAULT now(),
  place_of_work text,
  "position" text,
  nationality text,
  purpose text,
  discussion_so_far text,
  key_understanding text,
  feedback_after text,
  key_next_steps text,
  source text,
  accompanied text
);

-- sms_log
CREATE TABLE public.sms_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  recipient text NOT NULL,
  message text NOT NULL,
  trigger text,
  sent_by text,
  status text NOT NULL DEFAULT 'sent'::text,
  error text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- staff_achievements
CREATE TABLE public.staff_achievements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  staff_key text NOT NULL,
  staff_name text,
  achievement_id uuid NOT NULL,
  earned_at timestamp with time zone NOT NULL DEFAULT now(),
  progress jsonb
);

-- target_selections
CREATE TABLE public.target_selections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  agent_key text NOT NULL,
  month text NOT NULL,
  lead_id uuid,
  client_name text NOT NULL,
  payment_type text NOT NULL,
  expected_amount numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

-- task_events
CREATE TABLE public.task_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL,
  type text NOT NULL,
  actor_key text,
  actor_name text,
  from_key text,
  from_name text,
  to_key text,
  to_name text,
  note text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- tasks
CREATE TABLE public.tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'General'::text,
  priority text NOT NULL DEFAULT 'Medium'::text,
  assigned_to text NOT NULL,
  assigned_to_name text,
  assigned_by text NOT NULL,
  assigned_by_name text,
  status text NOT NULL DEFAULT 'Open'::text,
  due_date date,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone,
  escalated_to text,
  escalated_to_name text,
  escalated_by text,
  escalated_by_name text,
  escalated_at timestamp with time zone,
  escalation_note text,
  opened_at timestamp with time zone,
  started_at timestamp with time zone,
  cancelled_at timestamp with time zone
);

-- todo_items
CREATE TABLE public.todo_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_key text NOT NULL,
  owner_name text,
  title text NOT NULL,
  notes text,
  contact text,
  item_date date NOT NULL,
  start_time time without time zone NOT NULL,
  end_time time without time zone NOT NULL,
  status text NOT NULL DEFAULT 'open'::text,
  rescheduled_to_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  closed_at timestamp with time zone
);

-- weekly_visit_forms
CREATE TABLE public.weekly_visit_forms (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  week_start date NOT NULL,
  vehicle_rental_est numeric DEFAULT 0,
  drivers_tip_est numeric DEFAULT 0,
  fuel_est numeric DEFAULT 0,
  refreshment_est numeric DEFAULT 0,
  tnt_est numeric DEFAULT 0,
  vehicle_rental_act numeric DEFAULT 0,
  drivers_tip_act numeric DEFAULT 0,
  fuel_act numeric DEFAULT 0,
  refreshment_act numeric DEFAULT 0,
  tnt_act numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'Open'::text,
  approved_by text,
  approved_by_name text,
  approved_signature text,
  finalized_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  visit_date date
);
