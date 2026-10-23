import {
  buildTrend,
  comparePeriods,
  displayDate,
  isCurrentOpen,
  parseReportFilters,
  previousDateRange,
  summarizeIssueMetrics,
  writeReportFilters,
} from "../src/app/(main)/dashboard/operations/reports/_components/operations-report-model.ts";
import assert from "node:assert/strict";
import test from "node:test";

test("previous equal period has the same inclusive day count and ends before current", () => {
  const current = { start: "2026-05-04", end: "2026-05-10" };
  assert.deepEqual(previousDateRange(current, "previous-period"), {
    start: "2026-04-27",
    end: "2026-05-03",
  });
});

test("previous-year range clamps leap day to the last valid day", () => {
  assert.deepEqual(
    previousDateRange(
      { start: "2024-02-29", end: "2024-03-31" },
      "previous-year",
    ),
    { start: "2023-02-28", end: "2023-03-31" },
  );
});

test("comparison counts created and completed events independently and handles zero baselines", () => {
  const rows = [
    { created_at: "2026-05-05T10:00:00Z", completed_at: "2026-04-29T10:00:00Z", target_date: null },
    { created_at: "2026-04-28T10:00:00Z", completed_at: "2026-05-06T10:00:00Z", target_date: null },
  ];
  const result = comparePeriods(rows, { start: "2026-05-04", end: "2026-05-10" }, "previous-period");
  assert.deepEqual(result.current, { created: 1, completed: 1 });
  assert.deepEqual(result.previous, { created: 1, completed: 1 });
  assert.deepEqual(result.delta, { created: 0, completed: 0 });
  const noBaseline = comparePeriods(
    [{ created_at: "2026-05-05", completed_at: null, target_date: null }],
    { start: "2026-05-04", end: "2026-05-10" },
    "previous-period",
  );
  assert.equal(noBaseline.percent.created, null);
});

test("trend keeps every bucket and does not skip a month when the range starts on month end", () => {
  const result = buildTrend([], { start: "2026-10-31", end: "2027-03-31" });
  assert.equal(result.bucket, "month");
  assert.deepEqual(
    result.points.map((point) => point.key),
    ["2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03"],
  );
});

test("trend groups longer ranges weekly and counts only events in the selected range", () => {
  const rows = [
    { created_at: "2026-04-01", completed_at: null, target_date: null },
    { created_at: "2026-04-08", completed_at: "2026-04-09", target_date: null },
    { created_at: "2026-03-31", completed_at: null, target_date: null },
  ];
  const result = buildTrend(rows, { start: "2026-04-01", end: "2026-06-01" });
  assert.equal(result.bucket, "week");
  assert.equal(result.points.reduce((sum, point) => sum + point.created, 0), 2);
  assert.equal(result.points.reduce((sum, point) => sum + point.completed, 0), 1);
});

test("date-only values are stable and invalid timestamps do not enter reports", () => {
  assert.equal(displayDate("2026-07-09"), "2026-07-09");
  assert.equal(displayDate("not-a-dateTxx"), "");
});


test("open snapshot excludes completed and cancelled groups", () => {
  assert.equal(isCurrentOpen("started"), true);
  assert.equal(isCurrentOpen("backlog"), true);
  assert.equal(isCurrentOpen("completed"), false);
  assert.equal(isCurrentOpen("cancelled"), false);
});

test("current workload snapshots stay separate from the selected event-period counts", () => {
  const metrics = summarizeIssueMetrics(
    [
      { created_at: "2025-03-01", completed_at: null, target_date: "2026-10-02", stateGroup: "started", assignees: [] },
      { created_at: "2026-10-10", completed_at: null, target_date: "2026-11-10", stateGroup: "unstarted", assignees: ["adams"] },
      { created_at: "2025-03-01", completed_at: "2026-10-12", target_date: "2026-10-05", stateGroup: "completed", assignees: ["adams"] },
      { created_at: "2026-10-05", completed_at: null, target_date: "2026-10-08", stateGroup: "cancelled", assignees: ["adams"] },
    ],
    { start: "2026-10-01", end: "2026-10-31" },
    "2026-10-23",
  );
  assert.deepEqual(metrics, {
    openNow: 2,
    overdueNow: 1,
    createdInRange: 2,
    completedInRange: 1,
    dueInRange: 1,
    unassignedOpen: 1,
  });
});

test("report filters round trip through a URL while preserving portal return context", () => {
  const params = new URLSearchParams("returnTo=%2Fdashboard%2Foperations%3Fview%3Dqueue&report=completed&project=project-1&person=staff-1&status=started&priority=high&from=2026-05-01&to=2026-05-31&compare=previous-year");
  const filters = parseReportFilters(params, { from: "2026-10-01", to: "2026-10-31" }, true);
  assert.deepEqual(filters, {
    report: "completed",
    project: "project-1",
    person: "staff-1",
    status: "started",
    priority: "high",
    from: "2026-05-01",
    to: "2026-05-31",
    compare: "previous-year",
  });
  const next = writeReportFilters(new URLSearchParams("returnTo=%2Fdashboard%2Foperations%3Fview%3Dqueue&keep=1"), filters, true);
  assert.equal(next.get("returnTo"), "/dashboard/operations?view=queue");
  assert.equal(next.get("keep"), "1");
  assert.deepEqual(parseReportFilters(next, { from: "2026-10-01", to: "2026-10-31" }, true), filters);
});

test("report URL parsing rejects ambiguous and invalid filters and drops staff-only dimensions", () => {
  const defaults = { from: "2026-10-01", to: "2026-10-31" };
  const params = new URLSearchParams("report=unknown&project=a&person=colleague&status=forged&priority=extreme&from=2026-02-30&to=2026-02-01&compare=anything");
  assert.deepEqual(parseReportFilters(params, defaults, false), {
    report: "work-summary",
    project: "all",
    person: "all",
    status: "all",
    priority: "all",
    from: defaults.from,
    to: defaults.to,
    compare: "previous-period",
  });
  params.append("report", "created");
  assert.equal(parseReportFilters(params, defaults, true).report, "work-summary");
});
