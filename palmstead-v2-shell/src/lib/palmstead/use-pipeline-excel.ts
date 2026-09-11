"use client";

import { useMutation } from "@tanstack/react-query";

import { today } from "@/lib/palmstead/format";
import {
  buildCanonicalPipelineWorkbook,
  canonicalPipelineFilename,
  downloadBlob,
  type ExcelAllocation,
  type ExcelLead,
  type ExcelPayment,
} from "@/lib/palmstead/pipeline-excel-workbook";
import { requireSupabase } from "@/lib/supabase.client";
import { useAuthStore } from "@/stores/auth/auth-store";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function useIsViewAll(): boolean {
  const profile = useAuthStore((s) => s.profile);
  return !!profile && (profile.role === "manager" || ["elias", "emmanuel", "elizabeth"].includes(profile.key));
}

// Real port of web-next's usePipelineExcel.ts -- one real canonical
// workbook builder, scoped the same way this shell already scopes every
// other pipeline read: company-wide for manager/elias/emmanuel/elizabeth
// (real RLS already allows it), the signed-in agent's own leads
// otherwise. web-next's separate Master/CompanyLeads/per-agent export
// variants collapse into this one real scope rule since this shell has a
// single unified Master Pipeline route rather than three separate ones.
export function useDownloadPipelineExcel() {
  const profile = useAuthStore((s) => s.profile);
  const viewAll = useIsViewAll();
  return useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error("Not signed in.");
      const client = requireSupabase();
      let leadsQuery = client
        .from("leads")
        .select(
          "id,agent_key,name,contact,stage,plot_type,no_plots,unit_price,discount,net_total,grand_total,payment_plan,amt_paid,lead_source,priority,next_action,site_visit,notes,date_added,last_modified_at",
        )
        .is("deleted_at", null);
      if (!viewAll) leadsQuery = leadsQuery.eq("agent_key", profile.key);
      const [leadsRes, staffRes] = await Promise.all([leadsQuery, client.from("profiles").select("agent_key,name")]);
      if (leadsRes.error) throw leadsRes.error;
      if (staffRes.error) throw staffRes.error;

      const leads: ExcelLead[] = (leadsRes.data ?? []).map((r) => ({
        id: r.id as string,
        agentKey: r.agent_key as string,
        name: r.name as string,
        contact: (r.contact as string | null) ?? "",
        stage: (r.stage as string | null) ?? "1",
        plotType: (r.plot_type as string | null) ?? "Full Plot",
        noPlots: Number(r.no_plots ?? 1),
        unitPrice: Number(r.unit_price ?? 0),
        discount: r.discount != null ? Number(r.discount) : null,
        netTotal: r.net_total != null ? Number(r.net_total) : null,
        grandTotal: Number(r.grand_total ?? 0),
        paymentPlan: (r.payment_plan as string | null) ?? "Full Payment",
        amtPaid: Number(r.amt_paid ?? 0),
        leadSource: (r.lead_source as string | null) ?? null,
        priority: (r.priority as string | null) ?? null,
        nextAction: (r.next_action as string | null) ?? null,
        siteVisit: (r.site_visit as string | null) ?? null,
        notes: (r.notes as string | null) ?? null,
        dateAdded: r.date_added as string,
        lastModifiedAt: (r.last_modified_at as string | null) ?? null,
      }));
      const leadIds = leads.map((l) => l.id);
      const staff = (staffRes.data ?? []).map((r) => ({ key: r.agent_key as string, name: r.name as string }));

      const [paymentsRes, allocationsRes] = await Promise.all([
        leadIds.length
          ? client
              .from("payments")
              .select("id,lead_id,client_name,amount,payment_date,status,decided_at")
              .in("lead_id", leadIds)
          : Promise.resolve({ data: [], error: null }),
        leadIds.length
          ? client
              .from("allocation_requests")
              .select("id,lead_id,client_name,agent_name,agent_key,status,plot_number,percent_paid,created_at")
              .in("lead_id", leadIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (paymentsRes.error) throw paymentsRes.error;
      if (allocationsRes.error) throw allocationsRes.error;

      const staffByKey = new Map(staff.map((s) => [s.key, s.name]));
      const payments: ExcelPayment[] = (paymentsRes.data ?? []).map((r) => ({
        id: r.id as string,
        leadId: r.lead_id as string,
        clientName: r.client_name as string,
        amount: Number(r.amount ?? 0),
        date: r.payment_date as string,
        status: (r.status as string | null) ?? "approved",
        decidedAt: (r.decided_at as string | null) ?? null,
      }));
      const allocations: ExcelAllocation[] = (allocationsRes.data ?? []).map((r) => ({
        id: r.id as string,
        leadId: r.lead_id as string,
        clientName: r.client_name as string,
        staffName: (r.agent_name as string | null) ?? staffByKey.get(r.agent_key as string) ?? (r.agent_key as string),
        status: r.status as string,
        plotNumber: (r.plot_number as string | null) ?? null,
        percentPaid: r.percent_paid != null ? Number(r.percent_paid) : null,
        createdAt: r.created_at as string,
      }));

      const sourceLabel = viewAll ? "Master Pipeline (company-wide)" : `${profile.name}'s pipeline`;
      const { buffer } = await buildCanonicalPipelineWorkbook({
        leads,
        payments,
        allocations,
        staff,
        exportedByKey: profile.key,
        exportedByName: profile.name,
        sourceLabel,
      });
      const filename = canonicalPipelineFilename(viewAll ? "Master" : profile.name, today());
      downloadBlob(new Blob([buffer], { type: XLSX_MIME }), filename);
      return leads.length;
    },
  });
}
