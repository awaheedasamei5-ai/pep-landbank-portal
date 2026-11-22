import type { SalesReportData } from "./salesReportData.ts";
import { buildSalesReport, compareSalesPeriods, ghanaDate, precedingSalesPeriod } from "./salesReportModel.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

const data = {
  loadedAt: "2026-11-05T12:00:00Z",
  leads: [
    {
      id: "a",
      agent: "adams",
      name: "Client A",
      date: "2026-11-01",
      stage: "3",
      grandTotal: 100,
      amtPaid: 100,
      leadSource: "Referral",
      paymentPlan: "3 Months",
    },
    {
      id: "b",
      agent: "elias",
      name: "Client B",
      date: "2026-11-02",
      stage: "1",
      grandTotal: 200,
      amtPaid: 0,
      leadSource: "Banner",
      paymentPlan: "Full Payment",
    },
    {
      id: "c",
      agent: "company",
      assignedAgentKey: "adams",
      name: "Client C",
      date: "2026-11-03",
      stage: "2A",
      grandTotal: 300,
      amtPaid: 0,
      leadSource: "Website",
      paymentPlan: "6 Months",
    },
  ],
  activity: [
    {
      id: "call-a",
      leadId: "a",
      agentKey: "adams",
      action: "Call",
      outcome: "Reached — interested",
      createdAt: "2026-11-01T11:00:00Z",
    },
    {
      id: "legacy-call-a",
      leadId: "a",
      agentKey: "adams",
      action: "Pipeline update",
      method: "Phone Call",
      outcome: null,
      createdAt: "2026-11-01T11:30:00Z",
    },
    {
      id: "stage-a",
      leadId: "a",
      agentKey: "adams",
      action: "Payment approved",
      outcome: null,
      createdAt: "2026-11-01T12:00:00Z",
    },
    {
      id: "call-b",
      leadId: "b",
      agentKey: "elias",
      action: "Call",
      outcome: "No answer",
      createdAt: "2026-11-02T09:00:00Z",
    },
    { id: "call-c", leadId: "c", agentKey: "adams", action: "Call", outcome: null, createdAt: "2026-11-03T09:00:00Z" },
  ],
  visits: [
    {
      id: "visit-a",
      leadId: "a",
      agentKey: "adams",
      agentName: "Adams",
      createdAt: "2026-11-01T08:00:00Z",
      visitDate: "2026-11-10",
      site: "North",
      status: "scheduled",
    },
    {
      id: "unlinked",
      leadId: null,
      agentKey: "elias",
      agentName: "Elias",
      createdAt: "2026-11-01T08:00:00Z",
      visitDate: "2026-11-11",
      site: "North",
      status: "scheduled",
    },
  ],
  payments: [
    { id: "paid-a", leadId: "a", agentKey: "elias", status: "approved", date: "2026-11-04", amount: 100 },
    { id: "pending-b", leadId: "b", agentKey: "elias", status: "pending", date: "2026-11-04", amount: 200 },
  ],
  conversations: [
    {
      id: "talk-a",
      leadId: "a",
      authorKey: "adams",
      channel: "call",
      body: "Will visit",
      nextAction: "Confirm time",
      nextActionDate: "2026-11-08",
      createdAt: "2026-11-03T10:00:00Z",
    },
    {
      id: "talk-c",
      leadId: "c",
      authorKey: "adams",
      channel: "message",
      body: "Company prospect",
      nextAction: null,
      nextActionDate: null,
      createdAt: "2026-11-03T12:00:00Z",
    },
  ],
  costs: [
    {
      id: "cost-a",
      leadId: "a",
      sourceType: "site_visit",
      amount: 25,
      note: "Shared visit cost",
      createdAt: "2026-11-11T12:00:00Z",
    },
  ],
} as unknown as SalesReportData;
const filters = {
  from: "2026-11-01",
  to: "2026-11-30",
  staffKey: "",
  source: "",
  stage: "",
  action: "",
  outcome: "",
  site: "",
  paymentPlan: "",
  pool: "",
  clientId: "",
};

test("Ghana dates use the local day at a UTC boundary", () => {
  assert.equal(ghanaDate("2026-11-01T23:30:00Z"), "2026-11-01");
});

test("a genuine call excludes automatic activity; cash excludes pending payments", () => {
  const report = buildSalesReport(data, "master", "manager", true, filters);
  assert.equal(report.calls.length, 4);
  assert.equal(report.activities.length, 5);
  assert.equal(report.reachedRate, 25);
  assert.equal(report.callsWithoutOutcome, 2);
  assert.equal(report.approvedPayments.length, 1);
  assert.equal(report.approvedPayments[0].amount, 100);
  assert.equal(report.visitRequestWithoutLead, 1);
  assert.ok(Math.abs((report.newLeadToVisitRate ?? 0) - 100 / 3) < 0.00001);
});

test("personal and company cohorts stay separate and staff cannot widen to master", () => {
  assert.deepEqual(
    buildSalesReport(data, "mine", "adams", false, filters).leads.map((lead) => lead.id),
    ["a"],
  );
  assert.deepEqual(
    buildSalesReport(data, "company", "adams", false, filters).leads.map((lead) => lead.id),
    ["c"],
  );
  assert.equal(buildSalesReport(data, "master", "adams", false, filters).leads.length, 0);
  assert.equal(buildSalesReport(data, "mine", "adams", false, filters).canCompareStaff, false);
  assert.equal(buildSalesReport(data, "mine", "adams", false, filters).visitRequestWithoutLead, 0);
  assert.equal(buildSalesReport(data, "company", "adams", false, filters).visitRequestWithoutLead, 0);
});

test("date and staff filters retain explicit denominators", () => {
  const report = buildSalesReport(data, "master", "manager", true, { ...filters, staffKey: "elias", to: "2026-11-02" });
  assert.equal(report.newLeads.length, 1);
  assert.equal(report.calls.length, 1);
  assert.equal(report.reachedRate, 0);
  assert.equal(report.approvedPayments.length, 0);
});

test("client evidence stays in its pool and receipts follow deal owner, not payment recorder", () => {
  const personal = buildSalesReport(data, "mine", "adams", false, filters);
  assert.deepEqual(
    personal.clients.map((client) => client.lead.id),
    ["a"],
  );
  assert.deepEqual(
    personal.conversations.map((entry) => entry.id),
    ["talk-a"],
  );
  assert.equal(personal.clients[0].attributedVisitCost, 25);
  assert.equal(personal.staff.find((row) => row.key === "adams")?.approvedCash, 100);
  const master = buildSalesReport(data, "master", "manager", true, filters);
  assert.equal(master.staff.find((row) => row.key === "company")?.clients, 1);
  assert.equal(master.staff.find((row) => row.key === "adams")?.clients, 1);
  assert.deepEqual(
    buildSalesReport(data, "master", "manager", true, { ...filters, pool: "company" }).clients.map(
      (client) => client.lead.id,
    ),
    ["c"],
  );
  assert.equal(
    buildSalesReport(data, "master", "manager", true, { ...filters, clientId: "a" }).visitRequestWithoutLead,
    0,
  );
  assert.equal(
    buildSalesReport(data, "master", "manager", true, { ...filters, pool: "company" }).visitRequestWithoutLead,
    0,
  );
  assert.deepEqual(
    buildSalesReport(data, "mine", "adams", false, { ...filters, clientId: "c", pool: "company" }).clients,
    [],
  );
});

test("equal-length preceding period compares dated events within the same lead pool", () => {
  const selected = { ...filters, from: "2026-11-03", to: "2026-11-04", pool: "company" };
  const prior = precedingSalesPeriod(selected);
  assert.equal(prior.from, "2026-11-01");
  assert.equal(prior.to, "2026-11-02");
  const current = buildSalesReport(data, "master", "manager", true, selected);
  const previous = buildSalesReport(data, "master", "manager", true, prior);
  const compared = compareSalesPeriods(current, previous);
  assert.equal(compared.rows.find((row) => row.label === "New leads")?.current, 1);
  assert.equal(compared.rows.find((row) => row.label === "New leads")?.previous, 0);
  assert.equal(compared.rows.find((row) => row.label === "Genuine calls")?.current, 1);
  assert.equal(compared.rows.find((row) => row.label === "Approved receipts")?.current, 0);
  assert.equal(
    compared.rows.some((row) => row.label === "Pipeline value"),
    false,
  );
});

test("quality register identifies records without crossing personal and company pools", () => {
  const master = buildSalesReport(data, "master", "manager", true, filters);
  assert.deepEqual(
    master.qualityIssues.map((issue) => issue.id),
    ["call-c", "legacy-call-a", "unlinked"],
  );
  assert.equal(master.qualityIssues.find((issue) => issue.id === "unlinked")?.recordUrl, "/dashboard/site-visits/unlinked");
  assert.deepEqual(
    buildSalesReport(data, "mine", "adams", false, filters).qualityIssues.map((issue) => issue.id),
    ["legacy-call-a"],
  );
  assert.deepEqual(
    buildSalesReport(data, "company", "adams", false, filters).qualityIssues.map((issue) => issue.id),
    ["call-c"],
  );
  assert.equal(buildSalesReport(data, "master", "manager", true, { ...filters, site: "North" }).visitRequestWithoutLead, 1);
  assert.equal(buildSalesReport(data, "master", "manager", true, { ...filters, site: "South" }).visitRequestWithoutLead, 0);
});

test("unassigned company leads appear as current quality issues only in company scope", () => {
  const unassigned = {
    ...data,
    leads: [
      ...data.leads,
      { ...data.leads[2], id: "d", name: "Client D", date: "2026-10-01", assignedAgentKey: undefined },
    ],
  } as SalesReportData;
  const company = buildSalesReport(unassigned, "company", "adams", false, filters);
  assert.equal(company.unassignedCompanyLeads, 1);
  assert.equal(company.qualityIssues.find((issue) => issue.id === "d")?.kind, "Company lead without handler");
  assert.equal(buildSalesReport(unassigned, "mine", "adams", false, filters).qualityIssues.some((issue) => issue.id === "d"), false);
});

test("allocation-only names stay out of sales figures until valued or worked", () => {
  const source = data.leads[2];
  const allocation = {
    ...source,
    leadSource: "Plot allocation import",
    assignedAgentKey: undefined,
    contact: "",
    stage: "1",
    unitPrice: 0,
    grandTotal: 0,
    amtPaid: 0,
    notes: "Imported from allocation document",
    nextAction: "Confirm contact details and real payment history with client",
  };
  const imported = {
    ...data,
    leads: [
      ...data.leads,
      { ...allocation, id: "placeholder" },
      { ...allocation, id: "valued", grandTotal: 500 },
      { ...allocation, id: "worked" },
    ],
    conversations: [
      ...data.conversations,
      { id: "worked-note", leadId: "worked", authorKey: "adams", channel: "call", body: "Discussed plots", createdAt: "2026-11-04T09:00:00Z" },
    ],
  } as SalesReportData;
  const report = buildSalesReport(imported, "company", "adams", false, { ...filters, source: "Plot allocation import" });
  assert.deepEqual(report.leads.map((lead) => lead.id), ["valued", "worked"]);
  assert.equal(report.excludedImportPlaceholders, 1);
  assert.equal(report.qualityIssues.some((issue) => issue.id === "placeholder"), false);
  assert.equal(buildSalesReport(imported, "mine", "adams", false, filters).excludedImportPlaceholders, 0);
});

