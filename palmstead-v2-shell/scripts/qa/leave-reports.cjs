const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText,
    filename,
  );
const { buildLeaveReport, comparison, periodBounds, leaveReportCsv } = require(
  path.resolve(__dirname, "../../src/webnext/features/leave/reports/leaveReport.ts"),
);
const req = (id, patch = {}) => ({
  id,
  requestNo: id,
  agentKey: "a",
  agentName: "Alice",
  year: 2026,
  dates: ["2026-01-30", "2026-02-02"],
  daysCount: 2,
  status: "approved",
  deductQuota: true,
  isEmergency: false,
  createdAt: "2026-01-01T00:00:00Z",
  decidedAt: null,
  decidedByName: null,
  autoSubmittedAt: null,
  usedConfirmedAt: null,
  ...patch,
});
const snapshot = (requests, patch = {}) => ({
  generatedAt: "2026-10-15T10:00:00Z",
  scope: "management",
  annualDays: 20,
  year: 2026,
  roster: [
    { key: "a", name: "Alice", department: "Ops", active: true, policyEligible: true },
    { key: "b", name: "Bob", department: null, active: true, policyEligible: true },
  ],
  requests,
  totalRequests: requests.length,
  complete: true,
  availableYears: [2026, 2025],
  events: [],
  eventsComplete: true,
  ...patch,
});
const filter = { year: 2026, fromMonth: 2, toMonth: 2, employee: "all", status: "all", cohort: "all" };
const report = (requests, overrides = {}, snapshotOverrides = {}) =>
  buildLeaveReport(snapshot(requests, snapshotOverrides), { ...filter, ...overrides });
const r = report([
  req("approved", { usedConfirmedAt: "2026-03-01T00:00:00Z" }),
  req("pending", { status: "pending" }),
  req("planned", { status: "planned" }),
  req("rescheduled", { status: "rescheduled" }),
  req("declined", { status: "declined" }),
  req("exempt", { deductQuota: false, isEmergency: true }),
  req("prior", { year: 2025, dates: ["2025-02-03"], daysCount: 1 }),
]);
assert.equal(r.balances[0].reserved, 8);
assert.equal(r.balances[0].confirmedUsed, 2);
assert.equal(r.balances[0].available, 12, "Confirmed usage is not subtracted twice");
assert.equal(r.balances[1].available, 20, "Zero-activity staff get independent allowance");
assert.equal(r.balances[0].exempt, 2);
assert.equal(r.register.length, 6, "A request starting before February still intersects February");
assert.equal(r.register[0].datesInPeriod.length, 1, "Do not count the bounding date range");
assert.equal(r.approvedComparison.current, 1, "Employee-date totals deduplicate concurrent records");
assert.equal(r.approvedComparison.previous, 1);
assert.equal(
  report([req("a")], { status: "pending" }).balances[0].reserved,
  2,
  "Register filters do not change annual balances",
);
assert.equal(report([req("a")], {}, { annualDays: 0 }).balances[0].available, 0);
assert.equal(report([req("a")], {}, { annualDays: 25 }).balances[0].available, 23);
assert.equal(report([req("a", { daysCount: 25 })]).balances[0].overReserved, 5);
assert.equal(
  report([req("a", { dates: ["2026-02-02", "2026-01-30"], usedConfirmedAt: "2026-03-01" })]).balances[0].confirmedUsed,
  2,
  "Unsorted dates are handled",
);
for (const dates of [["2026-02-30"], null, ["bad"], ["2026-02-02", "2026-02-02"], ["2025-02-03"]]) {
  const invalid = report([req("invalid", { dates, usedConfirmedAt: "2026-03-01" })]);
  assert.equal(invalid.qualityCount, 1);
  assert.equal(invalid.balances[0].confirmedUsed, 0, "Invalid dates cannot certify usage");
  assert.ok(invalid.exceptions.length);
}
assert.equal(
  report([req("future", { dates: ["2026-12-01"], daysCount: 1, usedConfirmedAt: "2026-01-01" })]).balances[0]
    .confirmedUsed,
  0,
);
assert.equal(
  report([req("orphan", { agentKey: "missing" })]).balances.find((p) => p.key === "missing").allowance,
  null,
);
assert.equal(report([req("a"), req("b", { agentKey: "b" })]).coverage[0].overlap, true);
assert.equal(report([req("a"), req("b", { agentKey: "b" })], { employee: "a" }).coverage[0].overlap, false);
assert.equal(report([req("unknown", { status: "unknown" })]).qualityCount, 1);
assert.equal(comparison(4, 0).percentage, null);
assert.equal(comparison(6, 3).percentage, 100);
assert.equal(periodBounds(2028, 2, 2).end, "2028-02-29");
assert.equal(periodBounds(2027, 2, 2).end, "2027-02-28");
assert.throws(() => periodBounds(2026, 12, 1), /valid year/);
assert.throws(() => report([], {}, { complete: false }), /incomplete/);
assert.throws(() => report([], {}, { totalRequests: 1 }), /incomplete/);
const csv = leaveReportCsv(report([req('=HYPERLINK("x")', { agentName: "\t=private", letterText: "SECRET REASON" })]));
assert.ok(csv.startsWith("\uFEFF"));
assert.ok(csv.includes("'=HYPERLINK"));
assert.ok(csv.includes("'\t=private"));
assert.ok(!csv.includes("SECRET REASON"));
assert.ok(csv.includes("\r\n"));
console.log(
  "Leave report fixtures passed: balances, overlap periods, comparison, malformed data, role-cohort filtering, completeness and safe CSV.",
);
