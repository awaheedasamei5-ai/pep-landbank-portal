import type { ActivityLogEntry, Lead, Payment, SiteVisit } from "../../types/domain";
import type { SalesReportData } from "./salesReportData";

export type SalesReportScope = "mine" | "master" | "company";

export interface SalesReportFilters {
  from: string;
  to: string;
  staffKey: string;
  source: string;
  stage: string;
  action: string;
  outcome: string;
  site: string;
  paymentPlan: string;
}

export interface SalesStaffRow {
  key: string;
  name: string;
  newLeads: number;
  contactActivities: number;
  calls: number;
  reached: number;
  reachedRate: number | null;
  visitRequests: number;
  scheduledVisits: number;
  approvedPayments: number;
  approvedCash: number;
}

export interface SalesMonthRow {
  month: string;
  newLeads: number;
  calls: number;
  visitRequests: number;
  approvedCash: number;
}

export interface SalesReport {
  filters: SalesReportFilters;
  scope: SalesReportScope;
  canCompareStaff: boolean;
  leads: Lead[];
  calls: ActivityLogEntry[];
  activities: ActivityLogEntry[];
  visits: SiteVisit[];
  payments: Payment[];
  newLeads: Lead[];
  requestedVisits: SiteVisit[];
  scheduledVisits: SiteVisit[];
  approvedPayments: Payment[];
  staff: SalesStaffRow[];
  months: SalesMonthRow[];
  reached: number;
  reachedRate: number | null;
  newLeadToVisitRate: number | null;
  newLeadToPaidRate: number | null;
  visitRequestWithoutLead: number;
  callsWithoutOutcome: number;
  unassignedCompanyLeads: number;
  sourceCounts: { name: string; count: number }[];
  stageCounts: { name: string; count: number }[];
  outcomeCounts: { name: string; count: number }[];
  loadedAt: string;
}

export const GHANA_TIME_ZONE = "Africa/Accra";

export function ghanaDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: GHANA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function within(date: string, filters: SalesReportFilters): boolean {
  const day = ghanaDate(date);
  return day >= filters.from && day <= filters.to;
}

function countBy(values: string[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    const name = value.trim() || "Unspecified";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function rate(part: number, whole: number): number | null {
  return whole ? (part / whole) * 100 : null;
}

function isCall(entry: ActivityLogEntry): boolean {
  const action = entry.action.trim().toLowerCase();
  const method = (entry.method ?? "").trim().toLowerCase();
  // Current Log Call writes action=Call; historical pipeline edits wrote
  // action=Pipeline update + method=Phone Call. Both represent real calls.
  return action === "call" || (action === "pipeline update" && (method === "phone call" || method === "phone"));
}

function isReached(entry: ActivityLogEntry): boolean {
  return (entry.outcome ?? "").toLowerCase().startsWith("reached");
}

export function buildSalesReport(
  data: SalesReportData,
  scope: SalesReportScope,
  viewerKey: string,
  isManager: boolean,
  filters: SalesReportFilters,
  names: Record<string, string> = {},
): SalesReport {
  if (filters.from > filters.to) throw new Error("The start date must be before the end date.");
  const cohort = data.leads.filter((lead) => {
    if (scope === "mine") return lead.agent === viewerKey;
    if (scope === "company") return lead.agent === "company";
    return isManager;
  });
  const leads = cohort.filter(
    (lead) =>
      (!filters.staffKey ||
        !isManager ||
        lead.agent === filters.staffKey ||
        lead.assignedAgentKey === filters.staffKey) &&
      (!filters.source || (lead.leadSource ?? "") === filters.source) &&
      (!filters.stage || lead.stage === filters.stage) &&
      (!filters.paymentPlan || lead.paymentPlan === filters.paymentPlan),
  );
  const leadIds = new Set(leads.map((lead) => lead.id));
  const activities = data.activity.filter(
    (entry) =>
      entry.leadId &&
      leadIds.has(entry.leadId) &&
      within(entry.createdAt, filters) &&
      (!filters.staffKey || !isManager || entry.agentKey === filters.staffKey) &&
      (!filters.action || entry.action === filters.action) &&
      (!filters.outcome || entry.outcome === filters.outcome),
  );
  const calls = activities.filter(isCall);
  const visits = data.visits.filter(
    (visit) =>
      visit.leadId &&
      leadIds.has(visit.leadId) &&
      (!filters.staffKey || !isManager || visit.agentKey === filters.staffKey) &&
      (!filters.site || visit.site === filters.site),
  );
  const payments = data.payments.filter(
    (payment) =>
      leadIds.has(payment.leadId) && (!filters.staffKey || !isManager || payment.agentKey === filters.staffKey),
  );
  const newLeads = leads.filter((lead) => within(lead.date, filters));
  const requestedVisits = visits.filter((visit) => within(visit.createdAt, filters));
  const scheduledVisits = visits.filter((visit) => within(visit.visitDate, filters));
  const approvedPayments = payments.filter((payment) => payment.status === "approved" && within(payment.date, filters));
  const reached = calls.filter(isReached).length;
  const visitedLeadIds = new Set(visits.map((visit) => visit.leadId));
  const newLeadsVisited = newLeads.filter((lead) => visitedLeadIds.has(lead.id)).length;
  const newLeadsPaid = newLeads.filter((lead) => lead.grandTotal > 0 && lead.amtPaid >= lead.grandTotal).length;
  const keys = new Set<string>();
  for (const lead of leads) keys.add(lead.agent === "company" ? (lead.assignedAgentKey ?? "company") : lead.agent);
  for (const item of [...activities, ...visits]) keys.add(item.agentKey);
  for (const payment of approvedPayments) keys.add(payment.agentKey);
  if (filters.staffKey) keys.add(filters.staffKey);
  const staff = [...keys]
    .filter(Boolean)
    .map((key) => {
      const ownLeads = newLeads.filter(
        (lead) => (lead.agent === "company" ? (lead.assignedAgentKey ?? "company") : lead.agent) === key,
      );
      const ownActivity = activities.filter((entry) => entry.agentKey === key);
      const ownCalls = ownActivity.filter(isCall);
      const ownVisits = visits.filter((visit) => visit.agentKey === key);
      const ownApproved = approvedPayments.filter((payment) => payment.agentKey === key);
      const ownReached = ownCalls.filter(isReached).length;
      return {
        key,
        name: names[key] ?? (key === "company" ? "Company / unassigned" : key),
        newLeads: ownLeads.length,
        contactActivities: ownActivity.length,
        calls: ownCalls.length,
        reached: ownReached,
        reachedRate: rate(ownReached, ownCalls.length),
        visitRequests: ownVisits.filter((visit) => within(visit.createdAt, filters)).length,
        scheduledVisits: ownVisits.filter((visit) => within(visit.visitDate, filters)).length,
        approvedPayments: ownApproved.length,
        approvedCash: ownApproved.reduce((sum, payment) => sum + payment.amount, 0),
      };
    })
    .sort((a, b) => b.approvedCash - a.approvedCash || b.calls - a.calls || a.name.localeCompare(b.name));
  const months = new Map<string, SalesMonthRow>();
  const monthOf = (date: string) => {
    const month = ghanaDate(date).slice(0, 7);
    const existing = months.get(month);
    if (existing) return existing;
    const created = { month, newLeads: 0, calls: 0, visitRequests: 0, approvedCash: 0 };
    months.set(month, created);
    return created;
  };
  for (const lead of newLeads) monthOf(lead.date).newLeads++;
  for (const call of calls) monthOf(call.createdAt).calls++;
  for (const visit of requestedVisits) monthOf(visit.createdAt).visitRequests++;
  for (const payment of approvedPayments) monthOf(payment.date).approvedCash += payment.amount;
  return {
    filters,
    scope,
    canCompareStaff: isManager,
    leads,
    calls,
    activities,
    visits,
    payments,
    newLeads,
    requestedVisits,
    scheduledVisits,
    approvedPayments,
    staff,
    months: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
    reached,
    reachedRate: rate(reached, calls.length),
    newLeadToVisitRate: rate(newLeadsVisited, newLeads.length),
    newLeadToPaidRate: rate(newLeadsPaid, newLeads.length),
    visitRequestWithoutLead: data.visits.filter((visit) => {
      if (visit.leadId || !within(visit.createdAt, filters)) return false;
      if (scope === "master") return isManager;
      if (scope === "mine") return visit.agentKey === viewerKey;
      return false;
    }).length,
    callsWithoutOutcome: calls.filter((entry) => !entry.outcome).length,
    unassignedCompanyLeads: leads.filter((lead) => lead.agent === "company" && !lead.assignedAgentKey).length,
    sourceCounts: countBy(newLeads.map((lead) => lead.leadSource ?? "")),
    stageCounts: countBy(leads.map((lead) => lead.stage)),
    outcomeCounts: countBy(calls.map((entry) => entry.outcome ?? "")),
    loadedAt: data.loadedAt,
  };
}
