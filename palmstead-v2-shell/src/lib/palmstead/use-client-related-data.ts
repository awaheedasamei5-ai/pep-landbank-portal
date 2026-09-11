"use client";

import { useQuery } from "@tanstack/react-query";

import { requireSupabase } from "@/lib/supabase.client";

// Real port of web-next's useClientRelatedData.ts -- Master Rebuild Spec
// 17.2: "Open customer -> all related leads, payments, visits,
// allocations, contracts and complaints." Adapted to this shell's own
// established RLS-scoping pattern (company-wide select, real Postgres
// RLS decides what a session can actually see) rather than web-next's
// per-agent Promise.all, since Client Database here already reuses the
// same RLS-scoped `leads` read every other Sales screen does. Honestly
// not ported: Site visits/Contracts/Contract requests/Complaints
// sections -- those apps don't exist in this shell yet.
export interface ClientPayment {
  id: string;
  leadId: string;
  amount: number;
  date: string;
  status: string;
  paymentMethod: string | null;
}

export interface ClientAllocation {
  id: string;
  leadId: string;
  status: string;
  plotNumber: string | null;
  createdAt: string;
}

export interface ClientRelatedData {
  payments: ClientPayment[];
  allocations: ClientAllocation[];
}

export function useClientRelatedData(leadIds: string[]) {
  return useQuery({
    queryKey: ["clientRelatedData", [...leadIds].sort().join(",")],
    enabled: leadIds.length > 0,
    queryFn: async (): Promise<ClientRelatedData> => {
      const client = requireSupabase();
      const [paymentsRes, allocationsRes] = await Promise.all([
        client.from("payments").select("id,lead_id,amount,payment_date,status,payment_method").in("lead_id", leadIds),
        client.from("allocation_requests").select("id,lead_id,status,plot_number,created_at").in("lead_id", leadIds),
      ]);
      if (paymentsRes.error) throw paymentsRes.error;
      if (allocationsRes.error) throw allocationsRes.error;
      return {
        payments: (paymentsRes.data ?? []).map((r) => ({
          id: r.id as string,
          leadId: r.lead_id as string,
          amount: Number(r.amount ?? 0),
          date: r.payment_date as string,
          status: (r.status as string | null) ?? "approved",
          paymentMethod: (r.payment_method as string | null) ?? null,
        })),
        allocations: (allocationsRes.data ?? []).map((r) => ({
          id: r.id as string,
          leadId: r.lead_id as string,
          status: r.status as string,
          plotNumber: (r.plot_number as string | null) ?? null,
          createdAt: r.created_at as string,
        })),
      };
    },
  });
}
