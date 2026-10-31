import { useMemo } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useSessionStore } from "../../../auth/useSessionStore";
import { getDataSource } from "../../../data/source";
import type { Lead, Payment } from "../../../types/domain";
import { useConfig } from "../../manager/hooks/useConfigSettings";
import { useStaffDirectory } from "../../memos/hooks/useMemos";
import type { DataIssue } from "../lib/dataIntegrityCheck";
import { runDataIntegrityCheck } from "../lib/dataIntegrityCheck";

export interface PaymentReconciliationItem {
  lead: Lead;
  ownerName: string;
  approvedPayments: Payment[];
  approvedTotal: number;
  difference: number;
}

// docs/plans/19-data-check-plan.md -- company-wide for a manager
// (matches renderDataCheck(null) in index.html, scans every agent's
// leads), agent-scoped otherwise (renderDataCheck(DB.leads), the
// agent's own pipeline only). Real server-side dismiss state (not
// localStorage) -- see data_check_dismissals' own RLS comment for why
// a manager's dismissal needs to carry a real is_company_wide flag.
export function useDataCheck() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const isManager = profile?.role === "manager";
  const agentKey = profile?.key ?? "";
  const queryClient = useQueryClient();

  const { data: config } = useConfig();
  const { data: staff } = useStaffDirectory();
  const nameFor = useMemo(() => new Map((staff ?? []).map((s) => [s.key, s.name])), [staff]);

  const leadsQuery = useQuery({
    queryKey: ["dataCheckLeads", isManager, agentKey],
    enabled: !!profile,
    queryFn: (): Promise<Lead[]> => {
      const ds = getDataSource(demoMode);
      return isManager ? ds.leads.listAll() : ds.leads.listForAgent(agentKey);
    },
  });
  const paymentsQuery = useQuery({
    queryKey: ["dataCheckPayments"],
    queryFn: () => getDataSource(demoMode).payments.listAll(),
  });
  const siteVisitsQuery = useQuery({
    queryKey: ["dataCheckSiteVisits"],
    queryFn: () => getDataSource(demoMode).siteVisits.listAll(),
  });
  // Phase 8 (C2.11) -- same scoping rule every other per-agent-owned
  // table on this screen already uses (isManager -> company-wide).
  const complaintsQuery = useQuery({
    queryKey: ["dataCheckComplaints", isManager, agentKey],
    enabled: !!profile,
    queryFn: () => {
      const ds = getDataSource(demoMode);
      return isManager ? ds.complaints.listAll() : ds.complaints.listForAgent(agentKey);
    },
  });
  const referralsQuery = useQuery({
    queryKey: ["dataCheckReferrals", isManager, agentKey],
    enabled: !!profile,
    queryFn: () => getDataSource(demoMode).referrals.listForAgent(agentKey, isManager),
  });
  const allocationRequestsQuery = useQuery({
    queryKey: ["dataCheckAllocations", isManager, agentKey],
    enabled: !!profile,
    queryFn: () => getDataSource(demoMode).allocationRequests.list(agentKey, isManager ? "manager" : "agent"),
  });
  const dismissalsQuery = useQuery({
    queryKey: ["dataCheckDismissals"],
    enabled: !!profile,
    queryFn: () => getDataSource(demoMode).dataCheckDismissals.list(),
  });

  const isLoading =
    leadsQuery.isLoading ||
    paymentsQuery.isLoading ||
    siteVisitsQuery.isLoading ||
    dismissalsQuery.isLoading ||
    !config;

  const allIssues = useMemo(() => {
    if (!config || !leadsQuery.data || !paymentsQuery.data || !siteVisitsQuery.data) return [];
    return runDataIntegrityCheck(
      leadsQuery.data,
      paymentsQuery.data,
      siteVisitsQuery.data,
      config,
      (key) => nameFor.get(key) ?? key,
      complaintsQuery.data ?? [],
      referralsQuery.data ?? [],
      allocationRequestsQuery.data ?? [],
    );
  }, [
    config,
    leadsQuery.data,
    paymentsQuery.data,
    siteVisitsQuery.data,
    nameFor,
    complaintsQuery.data,
    referralsQuery.data,
    allocationRequestsQuery.data,
  ]);

  const dismissedKeys = useMemo(
    () => new Set((dismissalsQuery.data ?? []).map((d) => `${d.leadId}_${d.issueType}`)),
    [dismissalsQuery.data],
  );
  const issues = useMemo(
    () => allIssues.filter((i) => !dismissedKeys.has(`${i.leadId}_${i.type}`)),
    [allIssues, dismissedKeys],
  );

  // This is an accounting exception queue, independent of dismissed hygiene issues.
  // A dismissed warning must never make an unexplained balance difference disappear.
  const paymentReconciliation = useMemo<PaymentReconciliationItem[]>(() => {
    if (!isManager || !leadsQuery.data || !paymentsQuery.data) return [];
    const approvedByLead = new Map<string, Payment[]>();
    for (const payment of paymentsQuery.data) {
      if ((payment.status ?? "approved") !== "approved") continue;
      const entries = approvedByLead.get(payment.leadId) ?? [];
      entries.push(payment);
      approvedByLead.set(payment.leadId, entries);
    }
    return leadsQuery.data
      .flatMap((lead) => {
        const approvedPayments = (approvedByLead.get(lead.id) ?? []).sort((a, b) => b.date.localeCompare(a.date));
        const approvedTotal = approvedPayments.reduce((sum, payment) => sum + payment.amount, 0);
        const difference = lead.amtPaid - approvedTotal;
        return Math.abs(difference) > 1
          ? [{ lead, ownerName: nameFor.get(lead.agent) ?? lead.agent, approvedPayments, approvedTotal, difference }]
          : [];
      })
      .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));
  }, [isManager, leadsQuery.data, paymentsQuery.data, nameFor]);

  const dismiss = useMutation({
    mutationFn: (issue: DataIssue) => {
      if (!profile) throw new Error("Not signed in");
      return getDataSource(demoMode).dataCheckDismissals.create(
        issue.leadId,
        issue.type,
        profile.key,
        profile.name,
        isManager,
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dataCheckDismissals"] }),
  });

  const totalLeads = leadsQuery.data?.length ?? 0;
  const flaggedCount = new Set(issues.map((i) => i.leadId)).size;
  const hygieneScore = totalLeads ? Math.round(((totalLeads - flaggedCount) / totalLeads) * 100) : 100;

  return {
    issues,
    totalLeads,
    hygieneScore,
    isLoading,
    dismiss,
    paymentReconciliation,
    reconciliationLoading: leadsQuery.isLoading || paymentsQuery.isLoading,
    reconciliationError: leadsQuery.error ?? paymentsQuery.error,
  };
}
