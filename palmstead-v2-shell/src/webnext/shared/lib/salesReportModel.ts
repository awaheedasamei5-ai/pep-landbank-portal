import type { ActivityLogEntry, Lead, Payment, SiteVisit } from "../../types/domain";
import { isPaymentPlan } from "../../types/domain.ts";
import type { SalesClientCost, SalesConversation, SalesReportData } from "./salesReportData";

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
  pool: string;
  clientId: string;
}

export interface SalesPeriodComparison {
  from: string;
  to: string;
  rows: { label: string; current: number; previous: number; unit: "count" | "money" }[];
}

export function precedingSalesPeriod(filters: SalesReportFilters): SalesReportFilters {
  const day = 86_400_000;
  const from = Date.parse(`${filters.from}T00:00:00Z`);
  const to = Date.parse(`${filters.to}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) {
    throw new Error("Choose a valid report date range.");
  }
  const days = Math.round((to - from) / day) + 1;
  return {
    ...filters,
    from: new Date(from - days * day).toISOString().slice(0, 10),
    to: new Date(from - day).toISOString().slice(0, 10),
  };
}

// Compare only dated events. Current stage, pipeline value, outstanding balance,
// and cost attribution have no historical snapshots and cannot be backdated.
export function compareSalesPeriods(current: SalesReport, previous: SalesReport): SalesPeriodComparison {
  const sumReceipts = (report: SalesReport) =>
    report.approvedPayments.reduce((sum, payment) => sum + payment.amount, 0);
  return {
    from: previous.filters.from,
    to: previous.filters.to,
    rows: [
      { label: "New leads", current: current.newLeads.length, previous: previous.newLeads.length, unit: "count" },
      { label: "Genuine calls", current: current.calls.length, previous: previous.calls.length, unit: "count" },
      { label: "Reached calls", current: current.reached, previous: previous.reached, unit: "count" },
      {
        label: "Visit requests",
        current: current.requestedVisits.length,
        previous: previous.requestedVisits.length,
        unit: "count",
      },
      {
        label: "Conversations",
        current: current.conversations.length,
        previous: previous.conversations.length,
        unit: "count",
      },
      { label: "Approved receipts", current: sumReceipts(current), previous: sumReceipts(previous), unit: "money" },
    ],
  };
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
  clients: number;
  needingContact: number;
  conversations: number;
  attendedVisits: number;
  payingClients: number;
  pipelineValue: number;
  outstanding: number;
  attributedVisitCost: number;
  visitToPayingRate: number | null;
  knownCostPerPayingClient: number | null;
}

export interface SalesClientRow {
  lead: Lead;
  ownerName: string;
  calls: ActivityLogEntry[];
  activities: ActivityLogEntry[];
  conversations: SalesConversation[];
  visits: SiteVisit[];
  approvedPayments: Payment[];
  paidInPeriod: number;
  paidToDate: number;
  outstanding: number;
  costs: SalesClientCost[];
  attributedVisitCost: number;
  lastContactAt: string | null;
  daysSinceContact: number | null;
  needsContact: boolean;
}

export interface SalesMonthRow {
  month: string;
  newLeads: number;
  calls: number;
  visitRequests: number;
  approvedCash: number;
}

export interface SalesQualityIssue {
  id: string;
  kind: "Missing call outcome" | "Unlinked visit" | "Company lead without handler" | "Unverified payment plan";
  date: string;
  client: string;
  owner: string;
  recordUrl: string;
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
  conversations: SalesConversation[];
  costs: SalesClientCost[];
  clients: SalesClientRow[];
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
  qualityIssues: SalesQualityIssue[];
  excludedImportPlaceholders: number;
  payingClients: number;
  needingContact: number;
  pipelineValue: number;
  outstanding: number;
  attributedVisitCost: number;
  sourceCounts: { name: string; count: number }[];
  stageCounts: { name: string; count: number }[];
  outcomeCounts: { name: string; count: number }[];
  loadedAt: string;
}

export const GHANA_TIME_ZONE = "Africa/Accra";

export function salesPaymentPlanLabel(value: string): string {
  return isPaymentPlan(value) ? value : "Unverified payment plan";
}

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

// The allocation document was imported as company lead names. Names and
// import notes alone are not sales evidence. Preserve any record that was
// subsequently worked, valued, assigned or linked to an actual event.
export function reportableSalesLeads(data: SalesReportData): Lead[] {
  const importFollowUp = "confirm contact details and real payment history with client";
  const workedIds = new Set([
    ...data.activity.map((entry) => entry.leadId),
    ...data.visits.map((visit) => visit.leadId),
    ...data.payments.map((payment) => payment.leadId),
    ...data.conversations.map((entry) => entry.leadId),
    ...data.costs.map((entry) => entry.leadId),
  ]);
  return data.leads.filter((lead) => {
    if (lead.agent !== "company" || lead.leadSource?.trim().toLowerCase() !== "plot allocation import") return true;
    return (
      lead.grandTotal > 0 ||
      lead.unitPrice > 0 ||
      lead.amtPaid > 0 ||
      lead.stage !== "1" ||
      !!lead.assignedAgentKey ||
      !!lead.contact?.trim() ||
      (!!lead.nextAction?.trim() && lead.nextAction.trim().toLowerCase() !== importFollowUp) ||
      !!lead.nextActionDate ||
      workedIds.has(lead.id)
    );
  });
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
  const selectedLeads = cohort.filter(
    (lead) =>
      (!filters.pool ||
        scope !== "master" ||
        (filters.pool === "company" ? lead.agent === "company" : lead.agent !== "company")) &&
      (!filters.clientId || lead.id === filters.clientId) &&
      (!filters.staffKey ||
        !isManager ||
        (lead.agent === "company" ? lead.assignedAgentKey === filters.staffKey : lead.agent === filters.staffKey)) &&
      (!filters.source || (lead.leadSource ?? "") === filters.source) &&
      (!filters.stage || lead.stage === filters.stage) &&
      (!filters.paymentPlan || salesPaymentPlanLabel(lead.paymentPlan) === filters.paymentPlan),
  );
  const reportableIds = new Set(reportableSalesLeads(data).map((lead) => lead.id));
  const excludedImportPlaceholders = selectedLeads.filter((lead) => !reportableIds.has(lead.id)).length;
  const leads = selectedLeads.filter((lead) => reportableIds.has(lead.id));
  const leadIds = new Set(leads.map((lead) => lead.id));
  const activities = data.activity.filter(
    (entry) =>
      entry.leadId &&
      leadIds.has(entry.leadId) &&
      within(entry.createdAt, filters) &&
      (!filters.action || entry.action === filters.action) &&
      (!filters.outcome || entry.outcome === filters.outcome),
  );
  const calls = activities.filter(isCall);
  const visits = data.visits.filter(
    (visit) => visit.leadId && leadIds.has(visit.leadId) && (!filters.site || visit.site === filters.site),
  );
  const payments = data.payments.filter((payment) => leadIds.has(payment.leadId));
  const conversations = data.conversations.filter(
    (entry) => leadIds.has(entry.leadId) && within(entry.createdAt, filters),
  );
  const costs = data.costs.filter((entry) => leadIds.has(entry.leadId) && entry.sourceType === "site_visit");
  const unlinkedVisits = data.visits.filter((visit) => {
    if (visit.leadId || !within(visit.createdAt, filters)) return false;
    if (filters.clientId || filters.source || filters.stage || filters.paymentPlan) return false;
    if (filters.site && visit.site !== filters.site) return false;
    if (scope === "master")
      return isManager && filters.pool !== "company" && (!filters.staffKey || visit.agentKey === filters.staffKey);
    if (scope === "mine") return visit.agentKey === viewerKey;
    return false;
  });
  const leadById = new Map(leads.map((lead) => [lead.id, lead]));
  const qualityIssues: SalesQualityIssue[] = [
    ...calls.filter((entry) => !entry.outcome?.trim()).map((entry) => {
      const lead = leadById.get(entry.leadId ?? "");
      return {
        id: entry.id,
        kind: "Missing call outcome" as const,
        date: ghanaDate(entry.createdAt),
        client: lead?.name ?? entry.client,
        owner: entry.agentName ?? names[entry.agentKey] ?? entry.agentKey,
        recordUrl: `${lead?.agent === "company" ? "/dashboard/company-leads" : "/dashboard/pipeline"}/${entry.leadId}`,
      };
    }),
    ...unlinkedVisits.map((visit) => ({
      id: visit.id,
      kind: "Unlinked visit" as const,
      date: ghanaDate(visit.createdAt),
      client: visit.name,
      owner: visit.agentName ?? names[visit.agentKey] ?? visit.agentKey,
      recordUrl: `/dashboard/site-visits/${visit.id}`,
    })),
    ...leads.filter((lead) => lead.agent === "company" && !lead.assignedAgentKey).map((lead) => ({
      id: lead.id,
      kind: "Company lead without handler" as const,
      date: ghanaDate(lead.date),
      client: lead.name,
      owner: "Company pool",
      recordUrl: `/dashboard/company-leads/${lead.id}`,
    })),
    ...leads.filter((lead) => salesPaymentPlanLabel(lead.paymentPlan) === "Unverified payment plan").map((lead) => ({
      id: lead.id,
      kind: "Unverified payment plan" as const,
      date: ghanaDate(lead.date),
      client: lead.name,
      owner: lead.agent === "company" ? "Company pool" : (names[lead.agent] ?? lead.agent),
      recordUrl: `${lead.agent === "company" ? "/dashboard/company-leads" : "/dashboard/pipeline"}/${lead.id}`,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date) || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
  const newLeads = leads.filter((lead) => within(lead.date, filters));
  const requestedVisits = visits.filter((visit) => within(visit.createdAt, filters));
  const scheduledVisits = visits.filter((visit) => within(visit.visitDate, filters));
  const approvedPayments = payments.filter((payment) => payment.status === "approved" && within(payment.date, filters));
  // Current contact recency uses the full visible history, even when the
  // report's event window is narrow. Pipeline updates and automated payment
  // events are not evidence that someone actually spoke with the client.
  const asOf = ghanaDate(data.loadedAt);
  const latestContact = new Map<string, string>();
  for (const entry of [...data.activity.filter(isCall), ...data.conversations]) {
    if (!leadIds.has(entry.leadId ?? "") || ghanaDate(entry.createdAt) > asOf) continue;
    const leadId = entry.leadId as string;
    if (entry.createdAt > (latestContact.get(leadId) ?? "")) latestContact.set(leadId, entry.createdAt);
  }
  const daysSince = (date: string) => {
    const elapsed = Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${ghanaDate(date)}T00:00:00Z`);
    return Number.isFinite(elapsed) ? Math.max(0, Math.floor(elapsed / 86_400_000)) : null;
  };
  const reached = calls.filter(isReached).length;
  const visitedLeadIds = new Set(visits.map((visit) => visit.leadId));
  const newLeadsVisited = newLeads.filter((lead) => visitedLeadIds.has(lead.id)).length;
  const newLeadsPaid = newLeads.filter((lead) => lead.grandTotal > 0 && lead.amtPaid >= lead.grandTotal).length;
  const ownerByLead = new Map(leads.map((lead) => [lead.id, lead.agent]));
  const clients: SalesClientRow[] = leads
    .map((lead) => {
      const leadActivities = activities.filter((entry) => entry.leadId === lead.id);
      const leadPayments = payments.filter((payment) => payment.leadId === lead.id && payment.status === "approved");
      const leadCosts = costs.filter((entry) => entry.leadId === lead.id);
      const lastContactAt = latestContact.get(lead.id) ?? null;
      const daysSinceContact = lastContactAt ? daysSince(lastContactAt) : null;
      const openDeal = lead.grandTotal <= 0 || lead.amtPaid < lead.grandTotal;
      return {
        lead,
        ownerName: lead.agent === "company" ? "Company pool" : (names[lead.agent] ?? lead.agent),
        calls: leadActivities.filter(isCall),
        activities: leadActivities,
        conversations: conversations.filter((entry) => entry.leadId === lead.id),
        visits: visits.filter((visit) => visit.leadId === lead.id && within(visit.visitDate, filters)),
        approvedPayments: leadPayments.filter((payment) => within(payment.date, filters)),
        paidInPeriod: leadPayments
          .filter((payment) => within(payment.date, filters))
          .reduce((sum, payment) => sum + payment.amount, 0),
        paidToDate: leadPayments.reduce((sum, payment) => sum + payment.amount, 0),
        outstanding: Math.max(lead.grandTotal - lead.amtPaid, 0),
        costs: leadCosts,
        attributedVisitCost: leadCosts.reduce((sum, entry) => sum + entry.amount, 0),
        lastContactAt,
        daysSinceContact,
        needsContact: openDeal && (daysSinceContact ?? daysSince(lead.date) ?? 0) >= 14,
      };
    })
    .sort((a, b) => a.lead.name.localeCompare(b.lead.name) || a.lead.id.localeCompare(b.lead.id));
  const keys = new Set(leads.map((lead) => lead.agent));
  const staff = [...keys]
    .filter(Boolean)
    .map((key) => {
      const ownLeads = newLeads.filter((lead) => lead.agent === key);
      const ownClients = clients.filter((client) => client.lead.agent === key);
      const ownActivity = activities.filter((entry) => !!entry.leadId && ownerByLead.get(entry.leadId) === key);
      const ownCalls = ownActivity.filter(isCall);
      const ownVisits = visits.filter((visit) => !!visit.leadId && ownerByLead.get(visit.leadId) === key);
      const ownApproved = approvedPayments.filter((payment) => ownerByLead.get(payment.leadId) === key);
      const ownReached = ownCalls.filter(isReached).length;
      const visitedIds = new Set(ownVisits.filter((visit) => visit.attended === true).map((visit) => visit.leadId));
      const payingClients = ownClients.filter((client) => client.paidToDate > 0);
      const attributedVisitCost = ownClients.reduce((sum, client) => sum + client.attributedVisitCost, 0);
      return {
        key,
        name: names[key] ?? (key === "company" ? "Company pool" : key),
        newLeads: ownLeads.length,
        contactActivities: ownActivity.length,
        calls: ownCalls.length,
        reached: ownReached,
        reachedRate: rate(ownReached, ownCalls.length),
        visitRequests: ownVisits.filter((visit) => within(visit.createdAt, filters)).length,
        scheduledVisits: ownVisits.filter((visit) => within(visit.visitDate, filters)).length,
        approvedPayments: ownApproved.length,
        approvedCash: ownApproved.reduce((sum, payment) => sum + payment.amount, 0),
        clients: ownClients.length,
        needingContact: ownClients.filter((client) => client.needsContact).length,
        conversations: conversations.filter((entry) => ownerByLead.get(entry.leadId) === key).length,
        attendedVisits: ownVisits.filter((visit) => visit.attended === true && within(visit.visitDate, filters)).length,
        payingClients: payingClients.length,
        pipelineValue: ownClients.reduce((sum, client) => sum + client.lead.grandTotal, 0),
        outstanding: ownClients.reduce((sum, client) => sum + client.outstanding, 0),
        attributedVisitCost,
        visitToPayingRate: rate(
          payingClients.filter((client) => visitedIds.has(client.lead.id)).length,
          visitedIds.size,
        ),
        knownCostPerPayingClient: payingClients.length ? attributedVisitCost / payingClients.length : null,
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
    conversations,
    costs,
    clients,
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
    visitRequestWithoutLead: unlinkedVisits.length,
    callsWithoutOutcome: qualityIssues.filter((entry) => entry.kind === "Missing call outcome").length,
    unassignedCompanyLeads: leads.filter((lead) => lead.agent === "company" && !lead.assignedAgentKey).length,
    qualityIssues,
    excludedImportPlaceholders,
    payingClients: clients.filter((client) => client.paidToDate > 0).length,
    needingContact: clients.filter((client) => client.needsContact).length,
    pipelineValue: clients.reduce((sum, client) => sum + client.lead.grandTotal, 0),
    outstanding: clients.reduce((sum, client) => sum + client.outstanding, 0),
    attributedVisitCost: clients.reduce((sum, client) => sum + client.attributedVisitCost, 0),
    sourceCounts: countBy(newLeads.map((lead) => lead.leadSource ?? "")),
    stageCounts: countBy(leads.map((lead) => lead.stage)),
    outcomeCounts: countBy(calls.map((entry) => entry.outcome ?? "")),
    loadedAt: data.loadedAt,
  };
}


