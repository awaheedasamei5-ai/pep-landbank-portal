import { getSupabaseClient } from "../../data/client";
import { mapActivityLogRow, mapLeadRow, mapPaymentRow, mapSiteVisitRow } from "../../data/mappers";
import type { ActivityLogEntry, Lead, Payment, SiteVisit } from "../../types/domain";

export interface SalesReportData {
  leads: Lead[];
  activity: ActivityLogEntry[];
  visits: SiteVisit[];
  payments: Payment[];
  loadedAt: string;
}

const PAGE_SIZE = 500;
const MAX_ROWS = 50000;

// The ordinary screen loaders use Supabase's default page size (and the
// activity loader explicitly stops at 1,000). Reports must either read all
// authorized rows or fail, never silently publish a partial company total.
async function allRows(
  table: "leads" | "activity_log" | "site_visits" | "payments",
  columns: string,
): Promise<Record<string, unknown>[]> {
  const client = getSupabaseClient();
  if (!client) throw new Error("The reporting data service is unavailable.");
  const rows: Record<string, unknown>[] = [];
  for (let start = 0; start < MAX_ROWS; start += PAGE_SIZE) {
    let query = client
      .from(table)
      .select(columns)
      .order("id", { ascending: true })
      .range(start, start + PAGE_SIZE - 1);
    if (table === "leads" || table === "site_visits") query = query.is("deleted_at", null);
    if (table === "activity_log") query = query.not("lead_id", "is", null);
    const { data, error } = await query;
    if (error) throw new Error(`Could not load complete ${table} report data: ${error.message}`);
    const page = (data ?? []) as unknown as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
  throw new Error(`${table} exceeds the current report limit. No partial report was produced.`);
}

export async function loadSalesReportData(): Promise<SalesReportData> {
  // PostgREST/RLS scopes each source to the signed-in user. The report model
  // applies the narrower My Pipeline and Company Leads cohorts afterward.
  const [leadRows, activityRows, visitRows, paymentRows] = await Promise.all([
    allRows(
      "leads",
      "id,agent_key,name,contact,date_added,plot_type,no_plots,unit_price,payment_plan,amt_paid,grand_total,stage,lead_source,assigned_agent_key,priority,deleted_at",
    ),
    allRows(
      "activity_log",
      "id,agent_key,agent_name,client,action,detail,note,method,follow,outcome,created_at,lead_id",
    ),
    allRows(
      "site_visits",
      "id,agent_key,agent_name,name,contact,site,plot,visit_date,visit_time,people,transport,pickup,place_of_work,position,nationality,purpose,discussion_so_far,key_understanding,feedback_after,key_next_steps,source,accompanied,notes,status,created_at,lead_id,deleted_at,deleted_by,deleted_by_name,cancellation_reason,advance_reminder_sent_at,final_reminder_sent_at,rescheduled_at,rescheduled_by,rescheduled_by_name,previous_visit_date",
    ),
    allRows(
      "payments",
      "id,lead_id,agent_key,amount,payment_date,client_name,payment_method,note,status,decided_at,receipt_number",
    ),
  ]);
  return {
    leads: leadRows.map(mapLeadRow),
    activity: activityRows.map(mapActivityLogRow),
    visits: visitRows.map(mapSiteVisitRow),
    payments: paymentRows.map(mapPaymentRow),
    loadedAt: new Date().toISOString(),
  };
}
