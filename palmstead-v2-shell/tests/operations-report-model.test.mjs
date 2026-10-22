import {
  buildTrend,
  comparePeriods,
  displayDate,
  previousDateRange,
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

