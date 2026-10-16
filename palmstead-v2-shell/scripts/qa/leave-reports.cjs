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
const { buildLeaveReport, comparison, periodBounds, leaveReportCsv, parseReportFilters, leaveReportUrl } = require(
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
const emergencyOnly = report([req("standard"), req("emergency", { isEmergency: true, deductQuota: false })], {
  emergency: "yes",
  quota: "exempt",
});
assert.equal(emergencyOnly.register.length, 1);
assert.equal(emergencyOnly.register[0].id, "emergency");
assert.equal(emergencyOnly.balances[0].reserved, 2, "Activity filters do not shrink annual reservations");
assert.equal(emergencyOnly.distribution.find((row) => row.status === "approved").requests, 1);
assert.equal(report([req("a"), req("b", { agentKey: "b" })], { department: "department:Ops" }).people.length, 1);
assert.equal(report([], { department: "missing" }).people[0].key, "b");
assert.equal(
  report([req("x", { daysCount: 25 })]).insights.some((row) => row.key === "over"),
  true,
);
assert.equal(
  report([req("x", { status: "rescheduled" })]).insights.some((row) => row.key === "reschedule"),
  true,
);
const malformed = parseReportFilters(
  {
    year: "bad",
    from: "13",
    to: ["2"],
    status: "forged",
    employee: "other",
    cohort: "inactive",
    department: "department:Private",
    emergency: "maybe",
    quota: "wrong",
  },
  2026,
  false,
);
assert.deepEqual(malformed, {
  year: 2026,
  fromMonth: 1,
  toMonth: 12,
  status: "all",
  employee: "all",
  cohort: "all",
  department: "all",
  emergency: "all",
  quota: "all",
  comparisonMode: "previous_year",
});
const remembered = parseReportFilters(
  {
    year: "2025",
    from: "8",
    to: "9",
    employee: "a",
    cohort: "active",
    department: "department:Ops",
    emergency: "yes",
    quota: "exempt",
    status: "approved",
  },
  2026,
  true,
);
const url = leaveReportUrl("/dashboard/leave/management/reports", remembered, "trends");
assert.deepEqual(
  parseReportFilters(Object.fromEntries(new URLSearchParams(url.split("?")[1])), 2026, true),
  remembered,
);
assert.equal(periodBounds(1900, 2, 2).end, "1900-02-28");
assert.equal(buildLeaveReport(snapshot([], { year: 1901 }), { ...filter, year: 1901 }).prior.start, "1900-02-01");
const { reportSectionCsv, reportSectionData } = require(
  path.resolve(__dirname, "../../src/webnext/features/leave/reports/leaveReportExports.ts"),
);
const periodReport = report(
  [req("oct", { dates: ["2026-10-02"], daysCount: 1 }), req("sept", { dates: ["2026-09-02"], daysCount: 1 })],
  { fromMonth: 10, toMonth: 10, comparisonMode: "previous_period" },
);
assert.equal(periodReport.prior.start, "2026-09-01");
assert.equal(periodReport.prior.end, "2026-09-30");
assert.equal(periodReport.months[0].previousMonth, "2026-09");
assert.equal(periodReport.approvedComparison.previous, 1);
const boundary = report([req("prior-q4", { year: 2025, dates: ["2025-12-01"], daysCount: 1 })], {
  fromMonth: 1,
  toMonth: 3,
  comparisonMode: "previous_period",
});
assert.equal(boundary.prior.start, "2025-10-01");
assert.equal(boundary.prior.end, "2025-12-31");
assert.equal(boundary.approvedComparison.previous, 1);
for (const section of ["overview", "balances", "requests", "coverage", "trends", "exceptions", "history"]) {
  const data = reportSectionData(periodReport, section);
  const csv = reportSectionCsv(periodReport, section);
  assert.ok(data.headers.length);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(!csv.includes("SECRET REASON"));
  assert.ok(csv.includes('"Report section"'));
  if (data.rows.length) assert.ok(csv.includes('"' + section + '"'));
}
assert.equal(reportSectionData(periodReport, "trends").rows[0][1], "2026-09");
const negativeComparison = {
  ...periodReport,
  months: periodReport.months.map((row) => ({ ...row, difference: -1, percentage: -50 })),
};
assert.ok(
  reportSectionCsv(negativeComparison, "trends").includes('"-1","-50"'),
  "Numeric changes stay numeric; formula neutralization applies to text only",
);
assert.throws(
  () => reportSectionCsv({ ...periodReport, snapshot: { ...periodReport.snapshot, eventsComplete: false } }, "history"),
  /incomplete/,
);
assert.ok(reportSectionCsv(report([req("=formula", { agentName: "@unsafe" })]), "requests").includes("'@unsafe"));
console.log(
  "Leave report fixtures passed: balances, overlap periods, comparison, malformed data, role-cohort filtering, completeness and safe CSV.",
);

const state = {
  year: 2026,
  dates: ["2026-02-02"],
  days: 1,
  status: "pending",
  isEmergency: false,
  deductQuota: true,
  decidedAt: null,
  autoSubmittedAt: null,
  usedConfirmedAt: null,
};
const journalRow = (eventId, patch = {}) => ({
  eventId,
  requestId: "removed-request",
  reference: "=QA-REMOVED",
  ownerKey: "former",
  ownerName: "Former employee",
  actorName: "Management",
  actorKind: "authenticated",
  kind: "baseline",
  capturedAt: "2026-10-15T10:00:00Z",
  beforeState: null,
  afterState: state,
  changedFields: ["baseline"],
  submissionEventId: null,
  cycleSubmittedAt: null,
  cycleSeconds: null,
  requestExists: false,
  ...patch,
});
const journalRows = [
  journalRow("1"),
  journalRow("2", {
    kind: "decision",
    beforeState: state,
    afterState: { ...state, status: "approved" },
    submissionEventId: "10",
    cycleSubmittedAt: "2026-10-15T09:00:00Z",
    cycleSeconds: 3600,
  }),
  journalRow("3", { kind: "decision", cycleSeconds: null }),
  journalRow("4", { ownerKey: "a", ownerName: "Alice", kind: "deleted", beforeState: state, afterState: null }),
];
const journalSnapshot = {
  journalStartedAt: "2026-10-15T08:00:00Z",
  journalEvents: journalRows,
  journalTotal: 4,
  journalComplete: true,
};
const journalReport = report([], {}, journalSnapshot);
assert.equal(journalReport.journal.events.length, 4);
assert.equal(journalReport.journal.timed.length, 1);
assert.equal(journalReport.journal.medianSeconds, 3600);
assert.equal(journalReport.journal.untimedDecisions, 1);
assert.equal(journalReport.people.find((person) => person.key === "former").policyEligible, false);
assert.equal(report([], { employee: "a" }, journalSnapshot).journal.events.length, 1);
assert.equal(
  report([], { fromMonth: 12, toMonth: 12, status: "declined" }, journalSnapshot).journal.events.length,
  4,
  "Annual history is independent of activity filters",
);
const historyData = reportSectionData(journalReport, "history");
assert.ok(historyData.rows.every((row) => row.length === historyData.headers.length));
assert.ok(reportSectionCsv(journalReport, "history").includes("'=QA-REMOVED"));
assert.ok(reportSectionCsv(journalReport, "history").includes("3600"));
const incompleteJournal = report([], {}, { ...journalSnapshot, journalComplete: false });
assert.equal(incompleteJournal.journal.timed.length, 0);
assert.throws(() => reportSectionCsv(incompleteJournal, "history"), /incomplete/);
const malformedCycle = report(
  [],
  {},
  {
    ...journalSnapshot,
    journalEvents: [
      journalRow("5", {
        kind: "decision",
        cycleSeconds: -3,
        cycleSubmittedAt: "2026-10-16T09:00:00Z",
        submissionEventId: "4",
      }),
    ],
    journalTotal: 1,
  },
);
assert.equal(malformedCycle.journal.timed.length, 0);
const mixedLegacy = report(
  [req("legacy")],
  {},
  {
    ...journalSnapshot,
    events: [
      { requestId: "legacy", createdAt: "2026-01-01T10:00:00Z", actorKey: "a", fromStatus: null, toStatus: "planned" },
    ],
  },
);
assert.ok(reportSectionData(mixedLegacy, "history").rows.every((row) => row.length === historyData.headers.length));
console.log(
  "Journal fixtures passed: deleted owners, exact snapshots, timing provenance, annual scope, completeness and safe rectangular history CSV.",
);
