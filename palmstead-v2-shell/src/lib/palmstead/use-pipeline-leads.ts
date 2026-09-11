"use client";

import { useQuery } from "@tanstack/react-query";

import { requireSupabase } from "@/lib/supabase.client";

// Real company-wide lead list (the same `leads` table Master Pipeline
// queries in web-next, src/features/pipeline/screens/PipelineListScreen.tsx)
// -- real RLS already scopes this to whatever the signed-in session is
// actually allowed to see, so this select('*') is a real unfiltered
// company-wide read for a manager session, not a client-side illusion.
export type Stage = "1" | "2A" | "2B" | "3" | "4" | "Lost";

export interface PipelineLead {
  id: string;
  agentKey: string;
  agentName: string;
  name: string;
  contact: string;
  plotType: string;
  noPlots: number;
  grandTotal: number;
  amtPaid: number;
  stage: Stage;
  priority: string | null;
  nextAction: string | null;
  nextActionDate: string | null;
  dateAdded: string;
}

async function fetchPipelineLeads(): Promise<PipelineLead[]> {
  const client = requireSupabase();
  const [leadsRes, staffRes] = await Promise.all([
    client
      .from("leads")
      .select(
        "id,agent_key,name,contact,plot_type,no_plots,grand_total,amt_paid,stage,priority,next_action,next_action_date,date_added",
      )
      .order("date_added", { ascending: false }),
    client.from("profiles").select("agent_key,name"),
  ]);
  if (leadsRes.error) throw leadsRes.error;
  if (staffRes.error) throw staffRes.error;

  const staffByKey = new Map((staffRes.data ?? []).map((s) => [s.agent_key as string, s.name as string]));

  return (leadsRes.data ?? []).map((r) => ({
    id: r.id as string,
    agentKey: r.agent_key as string,
    agentName: staffByKey.get(r.agent_key as string) ?? (r.agent_key as string),
    name: r.name as string,
    contact: (r.contact as string | null | undefined) ?? "",
    plotType: (r.plot_type as string | null | undefined) ?? "Full Plot",
    noPlots: Number((r.no_plots as number | null | undefined) ?? 1),
    grandTotal: Number((r.grand_total as number | null | undefined) ?? 0),
    amtPaid: Number((r.amt_paid as number | null | undefined) ?? 0),
    stage: (r.stage as Stage | null | undefined) ?? "1",
    priority: (r.priority as string | null | undefined) ?? null,
    nextAction: (r.next_action as string | null | undefined) ?? null,
    nextActionDate: (r.next_action_date as string | null | undefined) ?? null,
    dateAdded: r.date_added as string,
  }));
}

export function usePipelineLeads() {
  return useQuery({ queryKey: ["pipelineLeads"], queryFn: fetchPipelineLeads });
}
