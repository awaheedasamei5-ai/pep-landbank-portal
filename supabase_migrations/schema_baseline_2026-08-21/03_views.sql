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
