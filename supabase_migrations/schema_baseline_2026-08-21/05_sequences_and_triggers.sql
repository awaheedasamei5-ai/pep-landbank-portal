-- ============ SEQUENCES ============

CREATE SEQUENCE public.receipt_number_seq START WITH 1 INCREMENT BY 1;

-- ============ TRIGGERS (public schema) ============

CREATE TRIGGER trg_notify_complaint AFTER INSERT ON public.complaints FOR EACH ROW EXECUTE FUNCTION notify_staff_on_client_submission('complaint');

CREATE TRIGGER trg_notify_enquiry AFTER INSERT ON public.enquiries FOR EACH ROW EXECUTE FUNCTION notify_staff_on_client_submission('enquiry');

CREATE TRIGGER trg_expense_status_guard BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION prevent_non_manager_expense_approval();

CREATE TRIGGER trg_fundreq_status_guard BEFORE UPDATE ON public.fund_requests FOR EACH ROW EXECUTE FUNCTION prevent_non_manager_expense_approval();

CREATE TRIGGER trg_guard_leads_amt_paid BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION guard_leads_amt_paid();

CREATE TRIGGER trg_payment_status_guard BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION prevent_non_manager_payment_approval();

CREATE TRIGGER trg_notify_plot_request AFTER INSERT ON public.plot_requests FOR EACH ROW EXECUTE FUNCTION notify_staff_on_plot_request();

CREATE TRIGGER trg_notify_sitevisit AFTER INSERT ON public.site_visits FOR EACH ROW EXECUTE FUNCTION notify_staff_on_client_submission('site visit request');

-- ============ TRIGGERS (auth schema -- fires the moment a new auth user
-- is created, whether via the app's signUp() or directly in the Supabase
-- dashboard, so the matching profiles row always exists) ============

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();
