import { validDailyReportReturn } from "./auth-return.ts";
import assert from "node:assert/strict";
import test from "node:test";

test("only a Management daily-report path can be restored after login", () => {
  const path = "/dashboard/pipeline/daily-reports/abd443a8-9b92-460b-949a-a08eb00ceb1e";
  assert.equal(validDailyReportReturn(path, "manager"), path);
  assert.equal(validDailyReportReturn(path, "agent"), null);
  assert.equal(validDailyReportReturn("https://example.org/steal", "manager"), null);
  assert.equal(validDailyReportReturn(`${path}?redirect=https://example.org`, "manager"), null);
  assert.equal(validDailyReportReturn("/dashboard/finance", "manager"), null);
});
