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
const {
  buildReminderReport,
  reminderFilterError,
  parseReminderFilters,
  reminderReportUrl,
  reminderSectionData,
  reminderReportCsv,
  validReportDate,
} = require(path.resolve(__dirname, "../../src/webnext/features/leave/reports/leaveReminderReport.ts"));
const filters = {
  from: "2026-07-01",
  to: "2026-07-31",
  employee: "all",
  status: "all",
  relationship: "all",
  compare: "previous_period",
};
const row = (id, status, patch = {}) => ({
  id,
  requestId: "request-" + id,
  reference: "QA-" + id,
  requestExists: true,
  ownerKey: "a",
  ownerName: "Alice",
  recipientName: "Alice",
  relationship: "owner",
  event: "Seven-day submission",
  status,
  attempts: 1,
  createdAt: "2026-07-01T00:00:00Z",
  acceptedAt: null,
  retriedAt: null,
  nextAttemptAt: null,
  ...patch,
});
const snapshot = {
  generatedAt: "2026-10-15T21:00:00Z",
  comparisonMode: "previous_period",
  current: {
    from: filters.from,
    to: filters.to,
    total: 3,
    complete: true,
    rows: [
      row("1", "accepted"),
      row("2", "failed", { ownerKey: "b", ownerName: "Bob", recipientName: "Management", relationship: "other" }),
      row("3", "needs_review", {
        ownerKey: null,
        ownerName: "Owner unavailable",
        relationship: "unavailable",
        requestExists: false,
      }),
    ],
  },
  previous: {
    from: "2026-05-31",
    to: "2026-06-30",
    total: 2,
    complete: true,
    rows: [row("4", "accepted"), row("5", "accepted")],
  },
};
const report = buildReminderReport(snapshot, filters);
assert.equal(report.current.length, 3);
assert.equal(report.attention, 2);
assert.equal(report.requests, 3);
assert.equal(report.comparison.find((item) => item.status === "accepted").percentage, -50);
assert.equal(report.comparison.find((item) => item.status === "failed").percentage, null);
assert.ok(Math.abs(report.acceptedPercentage - 100 / 3) < 1e-10);
assert.equal(buildReminderReport(snapshot, { ...filters, employee: "a" }).current.length, 1);
assert.equal(buildReminderReport(snapshot, { ...filters, relationship: "other" }).current.length, 1);
assert.equal(buildReminderReport(snapshot, { ...filters, status: "failed" }).previous.length, 0);
assert.equal(buildReminderReport(snapshot, { ...filters, employee: "unknown" }).current.length, 0);
assert.equal(reminderFilterError({ ...filters, from: "2026-02-30" }), "Choose valid start and end dates.");
assert.ok(reminderFilterError({ ...filters, from: "2026-08-01" }));
assert.ok(reminderFilterError({ ...filters, from: "2025-01-01" }));
assert.equal(reminderFilterError({ ...filters, from: "2024-01-01", to: "2024-12-31" }), "");
assert.equal(validReportDate("2024-02-29"), true);
assert.equal(validReportDate("2025-02-29"), false);
assert.throws(
  () => buildReminderReport({ ...snapshot, current: { ...snapshot.current, complete: false } }, filters),
  /incomplete/,
);
assert.throws(
  () => buildReminderReport({ ...snapshot, previous: { ...snapshot.previous, total: 3 } }, filters),
  /incomplete/,
);
assert.throws(() => buildReminderReport(snapshot, { ...filters, to: "2026-07-30" }), /does not match/);
const roundtrip = Object.fromEntries(
  new URL(reminderReportUrl(filters, "messages"), "https://example.test").searchParams,
);
assert.deepEqual(parseReminderFilters(roundtrip, "2026-10-15"), filters);
assert.equal(
  parseReminderFilters({ status: "delivered", recipient: "manager", compare: "fake" }, "2026-10-15").status,
  "all",
);
for (const view of ["overview", "comparison", "messages"]) {
  const data = reminderSectionData(report, view);
  assert.ok(data.rows.every((record) => record.length === data.headers.length));
  assert.ok(reminderReportCsv(report, view).startsWith("\uFEFF"));
}
assert.ok(reminderReportCsv(report, "comparison").includes('"-1","-50"'));
const unsafe = buildReminderReport(
  {
    ...snapshot,
    current: {
      ...snapshot.current,
      total: 1,
      rows: [row("formula", "failed", { ownerName: "=1+1", recipientName: "\t@unsafe" })],
    },
  },
  filters,
);
assert.ok(reminderReportCsv(unsafe, "messages").includes("'=1+1"));
assert.ok(reminderReportCsv(unsafe, "messages").includes("'\t@unsafe"));
console.log(
  "Reminder report fixtures passed: scopes, dates, comparison, missing owners, completeness, URL round-trip and CSV safety.",
);
