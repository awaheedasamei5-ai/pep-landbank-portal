"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { deriveStageFromPayment, type PaymentPlan, type PlotType } from "@/lib/palmstead/pipeline-pricing-logic";
import { requireSupabase } from "@/lib/supabase.client";
import { useAuthStore } from "@/stores/auth/auth-store";

// Real port of web-next's useLeads.ts useCreateLead -- one real INSERT
// (amt_paid always starts at 0, matching leads_ins RLS/Master Spec 4.4's
// own rule that amt_paid is never a free field), then a SEPARATE real
// Payment row for any opening deposit (only Management/Elias can log one
// at all -- matches payments_ins RLS). Honestly not ported: the
// auto-created "Follow up in 3 days" task (Operations Tracker doesn't
// exist in this shell yet) and the Referral-source auto-link (Referrals
// app not built yet either) -- both real, both separable, both deferred.
export interface NewLeadInput {
  name: string;
  contact: string;
  date?: string;
  address?: string;
  plotType: PlotType;
  noPlots: number;
  unitPrice: number;
  discount?: number;
  paymentPlan: PaymentPlan;
  priority?: string;
  nextAction?: string;
  notes?: string;
  leadSource?: string;
  amtPaid: number;
  netTotal: number;
  grandTotal: number;
  depositTarget?: number;
}

export function useCreateLead() {
  const profile = useAuthStore((s) => s.profile);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewLeadInput) => {
      const client = requireSupabase();
      const agentKey = profile?.key ?? "";
      const { data: leadRow, error: leadError } = await client
        .from("leads")
        .insert({
          agent_key: agentKey,
          name: input.name,
          contact: input.contact,
          // biome-ignore lint/nursery/useNullishCoalescing: an empty-string date should also fall through to the DB default (today), same as web-next's own `input.date || undefined`.
          date_added: input.date || undefined,
          plot_type: input.plotType,
          no_plots: input.noPlots,
          unit_price: input.unitPrice,
          payment_plan: input.paymentPlan,
          amt_paid: 0,
          grand_total: input.grandTotal,
          net_total: input.netTotal,
          discount: input.discount ?? null,
          balance: input.grandTotal,
          stage: deriveStageFromPayment(0, input.grandTotal),
          notes: input.notes ?? null,
          lead_source: input.leadSource ?? null,
          priority: input.priority ?? null,
          address: input.address ?? null,
          next_action: input.nextAction ?? null,
          deposit_target: input.depositTarget ?? null,
        })
        .select("id,name,agent_key")
        .single();
      if (leadError) throw leadError;

      let depositError: string | null = null;
      if (input.amtPaid > 0) {
        const canLog = profile?.role === "manager" || profile?.key === "elias";
        if (canLog) {
          const status = profile?.role === "manager" ? "approved" : "pending";
          const { error: payError } = await client.from("payments").insert({
            lead_id: leadRow.id,
            agent_key: agentKey,
            client_name: leadRow.name,
            amount: input.amtPaid,
            payment_date: new Date().toISOString().slice(0, 10),
            status,
          });
          if (payError) {
            depositError =
              "The lead was saved, but the opening deposit could not be recorded. Log it as a payment from the lead's page.";
          } else if (status === "approved") {
            const { error: updError } = await client
              .from("leads")
              .update({
                amt_paid: input.amtPaid,
                balance: Math.max(input.grandTotal - input.amtPaid, 0),
                stage: deriveStageFromPayment(input.amtPaid, input.grandTotal),
              })
              .eq("id", leadRow.id);
            if (updError)
              depositError = "The lead was saved, but the opening deposit could not be applied to the balance.";
          }
        } else {
          depositError =
            "The lead was saved, but only Elias or Management can log a payment -- ask them to record the opening deposit.";
        }
      }
      return { id: leadRow.id as string, depositError };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["pipelineLeads"] });
      void qc.invalidateQueries({ queryKey: ["lead"] });
    },
  });
}
