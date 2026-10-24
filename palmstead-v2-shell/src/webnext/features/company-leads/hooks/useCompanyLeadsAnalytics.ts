"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDataSource } from "../../../data/source";
import { useSessionStore } from "../../../auth/useSessionStore";
import { useCompanyLeads } from "./useCompanyLeads";
import { useCompanyWideActivity } from "./useCallLog";
import { today, shiftMonth, monthKey, monthLabel } from "../../../shared/lib/format";

// docs/plans/28-company-leads-engagement-upgrade-plan.md Phase 3 -- real
// Company-Leads-scoped Analytics: calls, leads by source, funnel by
// stage, visits vs purchases, cash receipts -- all scoped to the real
// agent_key='company' pool, reusing the already-real activity_log
// (Phase 1), site_visits, and payments tables rather than inventing new
// ones.
export function useCompanyLeadsAnalytics() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const { data: companyLeads, isLoading: leadsLoading } = useCompanyLeads();
  const { data: activity, isLoading: activityLoading } = useCompanyWideActivity();

  const siteVisitsQuery = useQuery({
    queryKey: ["companyLeadsSiteVisits"],
    queryFn: () => getDataSource(demoMode).siteVisits.listAll(),
  });
  const paymentsQuery = useQuery({
    queryKey: ["companyLeadsPayments"],
    queryFn: () => getDataSource(demoMode).payments.listAll(),
  });

  const isLoading = leadsLoading || activityLoading || siteVisitsQuery.isLoading || paymentsQuery.isLoading;

  const metrics = useMemo(() => {
    const leads = companyLeads ?? [];
    const leadIds = new Set(leads.map((l) => l.id));
    const thisM = today().slice(0, 7);
    const months = Array.from({ length: 6 }, (_, i) => shiftMonth(thisM, i - 5));

    // Calls by month (real activity_log rows, already company-leads-scoped).
    const callsByMonth = months.map((mk) => (activity ?? []).filter((e) => monthKey(e.createdAt) === mk).length);
    const callsToday = (activity ?? []).filter((e) => e.createdAt.slice(0, 10) === today()).length;

    // Leads by source (real leadSource field, company leads only).
    const bySourceMap = new Map<string, number>();
    leads.forEach((l) => {
      const src = l.leadSource || "Unspecified";
      bySourceMap.set(src, (bySourceMap.get(src) ?? 0) + 1);
    });
    const bySource = [...bySourceMap.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count);

    // Funnel by stage (real stage field, company leads only).
    const stageOrder = ["1", "2A", "2B", "3", "4", "Lost"] as const;
    const byStage = stageOrder.map((stage) => ({ stage, count: leads.filter((l) => l.stage === stage).length }));

    // Site visits vs purchases, company leads only.
    const visitedLeadIds = new Set((siteVisitsQuery.data ?? []).filter((v) => v.leadId && leadIds.has(v.leadId)).map((v) => v.leadId as string));
    const visitedCount = visitedLeadIds.size;
    const purchasedAmongVisited = leads.filter((l) => visitedLeadIds.has(l.id) && l.grandTotal > 0 && l.amtPaid >= l.grandTotal).length;
    const visitedNotPurchased = visitedCount - purchasedAmongVisited;

    // Cash receipts, company leads only, approved payments, 6-month trend.
    const companyPayments = (paymentsQuery.data ?? []).filter((p) => p.leadId && leadIds.has(p.leadId) && (p.status ?? "approved") === "approved");
    const cashByMonth = months.map((mk) => companyPayments.filter((p) => monthKey(p.date) === mk).reduce((s, p) => s + p.amount, 0));

    return {
      totalLeads: leads.length,
      callsToday,
      callsByMonth,
      bySource,
      byStage,
      visitedCount,
      purchasedAmongVisited,
      visitedNotPurchased,
      cashByMonth,
      cashThisMonth: cashByMonth[cashByMonth.length - 1] ?? 0,
    };
  }, [companyLeads, activity, siteVisitsQuery.data, paymentsQuery.data]);

  const monthLabels = useMemo(() => {
    const thisM = today().slice(0, 7);
    return Array.from({ length: 6 }, (_, i) => monthLabel(shiftMonth(thisM, i - 5)));
  }, []);

  return { isLoading, metrics, monthLabels };
}
