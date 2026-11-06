import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSalesReport, ghanaDate } from "./salesReportModel.ts";
import type { SalesReportData } from "./salesReportData.ts";

const data = {
  loadedAt: "2026-11-05T12:00:00Z",
  leads: [
    { id: "a", agent: "adams", name: "Client A", date: "2026-11-01", stage: "3", grandTotal: 100, amtPaid: 100, leadSource: "Referral", paymentPlan: "3 Months" },
    { id: "b", agent: "elias", name: "Client B", date: "2026-11-02", stage: "1", grandTotal: 200, amtPaid: 0, leadSource: "Banner", paymentPlan: "Full Payment" },
    { id: "c", agent: "company", assignedAgentKey: "adams", name: "Client C", date: "2026-11-03", stage: "2A", grandTotal: 300, amtPaid: 0, leadSource: "Website", paymentPlan: "6 Months" },
  ],
  activity: [
    { id: "call-a", leadId: "a", agentKey: "adams", action: "Call", outcome: "Reached — interested", createdAt: "2026-11-01T11:00:00Z" },
    { id: "legacy-call-a", leadId: "a", agentKey: "adams", action: "Pipeline update", method: "Phone Call", outcome: null, createdAt: "2026-11-01T11:30:00Z" },
    { id: "stage-a", leadId: "a", agentKey: "adams", action: "Payment approved", outcome: null, createdAt: "2026-11-01T12:00:00Z" },
    { id: "call-b", leadId: "b", agentKey: "elias", action: "Call", outcome: "No answer", createdAt: "2026-11-02T09:00:00Z" },
    { id: "call-c", leadId: "c", agentKey: "adams", action: "Call", outcome: null, createdAt: "2026-11-03T09:00:00Z" },
  ],
  visits: [
    { id: "visit-a", leadId: "a", agentKey: "adams", agentName: "Adams", createdAt: "2026-11-01T08:00:00Z", visitDate: "2026-11-10", site: "North", status: "scheduled" },
    { id: "unlinked", leadId: null, agentKey: "elias", agentName: "Elias", createdAt: "2026-11-01T08:00:00Z", visitDate: "2026-11-11", site: "North", status: "scheduled" },
  ],
  payments: [
    { id: "paid-a", leadId: "a", agentKey: "adams", status: "approved", date: "2026-11-04", amount: 100 },
    { id: "pending-b", leadId: "b", agentKey: "elias", status: "pending", date: "2026-11-04", amount: 200 },
  ],
} as unknown as SalesReportData;
const filters = { from: "2026-11-01", to: "2026-11-30", staffKey: "", source: "", stage: "", action: "", outcome: "", site: "", paymentPlan: "" };

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
  assert.deepEqual(buildSalesReport(data, "mine", "adams", false, filters).leads.map((lead) => lead.id), ["a"]);
  assert.deepEqual(buildSalesReport(data, "company", "adams", false, filters).leads.map((lead) => lead.id), ["c"]);
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
