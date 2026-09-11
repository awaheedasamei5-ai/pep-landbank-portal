"use client";

import { useQuery } from "@tanstack/react-query";

import { monthKey, shiftMonth, today } from "@/lib/palmstead/format";
import { requireSupabase } from "@/lib/supabase.client";

// Direct port of web-next's src/data/source.ts manager.overview() (the
// real Supabase branch) -- same 5 real queries, same real aggregation.
// Confirmed live in web-next (2026-08-29 research) that a real
// manager-role session gets unrestricted SELECT on leads/payments/
// complaints via RLS itself, so this is a real unfiltered company-wide
// aggregation, not a client-side illusion.
const STAGES = ["1", "2A", "2B", "3", "4", "Lost"] as const;

export interface ManagerOverview {
  totalLeads: number;
  pipelineValue: number;
  collected: number;
  outstanding: number;
  fullyPaidCount: number;
  openComplaints: number;
  siteVisitsCount: number;
  stageFunnel: { stage: string; count: number }[];
  byAgent: { key: string; name: string; leadCount: number; value: number }[];
  collectedTrend: number[];
}

function computeMonthlyTrend(payments: { date: string; amount: number }[]): number[] {
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(today().slice(0, 7), i - 5));
  return months.map((mk) => payments.filter((p) => monthKey(p.date) === mk).reduce((s, p) => s + p.amount, 0));
}

async function fetchManagerOverview(): Promise<ManagerOverview> {
  const client = requireSupabase();
  const sixMonthsAgo = `${shiftMonth(today().slice(0, 7), -5)}-01`;
  const [leadsRes, complaintsRes, visitsRes, staffRes, paymentsRes] = await Promise.all([
    client.from("leads").select("agent_key,grand_total,amt_paid,stage").is("deleted_at", null),
    client.from("complaints").select("status"),
    client.from("site_visits").select("id"),
    client.from("profiles").select("agent_key,name").eq("active", true),
    client.from("payments").select("amount,payment_date").eq("status", "approved").gte("payment_date", sixMonthsAgo),
  ]);
  if (leadsRes.error) throw leadsRes.error;
  if (complaintsRes.error) throw complaintsRes.error;
  if (visitsRes.error) throw visitsRes.error;
  if (staffRes.error) throw staffRes.error;
  if (paymentsRes.error) throw paymentsRes.error;

  const leads = (leadsRes.data ?? []) as {
    agent_key: string;
    grand_total: number | null;
    amt_paid: number | null;
    stage: string;
  }[];
  const staff = (staffRes.data ?? []) as { agent_key: string; name: string }[];
  const pipelineValue = leads.reduce((s, l) => s + Number(l.grand_total ?? 0), 0);
  const collected = leads.reduce((s, l) => s + Number(l.amt_paid ?? 0), 0);
  const stageFunnel = STAGES.map((stage) => ({ stage, count: leads.filter((l) => l.stage === stage).length }));

  const byAgentMap = new Map<string, { key: string; name: string; leadCount: number; value: number }>();
  for (const l of leads) {
    const match = staff.find((s) => s.agent_key === l.agent_key);
    const name = l.agent_key === "company" ? "Company Leads" : (match?.name ?? l.agent_key);
    const existing = byAgentMap.get(l.agent_key);
    if (existing) {
      existing.leadCount += 1;
      existing.value += Number(l.grand_total ?? 0);
    } else {
      byAgentMap.set(l.agent_key, { key: l.agent_key, name, leadCount: 1, value: Number(l.grand_total ?? 0) });
    }
  }

  return {
    totalLeads: leads.length,
    pipelineValue,
    collected,
    outstanding: Math.max(pipelineValue - collected, 0),
    fullyPaidCount: leads.filter((l) => Number(l.grand_total) > 0 && Number(l.amt_paid) >= Number(l.grand_total))
      .length,
    openComplaints: (complaintsRes.data ?? []).filter((c) => (c as { status: string }).status !== "Resolved").length,
    siteVisitsCount: (visitsRes.data ?? []).length,
    stageFunnel,
    byAgent: [...byAgentMap.values()].sort((a, b) => b.value - a.value),
    collectedTrend: computeMonthlyTrend(
      (paymentsRes.data ?? []).map((r) => ({
        date: (r as { payment_date: string }).payment_date,
        amount: Number((r as { amount: number | null }).amount ?? 0),
      })),
    ),
  };
}

export function useManagerOverview() {
  return useQuery({ queryKey: ["managerOverview"], queryFn: fetchManagerOverview });
}
