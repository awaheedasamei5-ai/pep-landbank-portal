import {
  classifyProviderResponse,
  missedTaskMessage,
  normalizeGhanaPhone,
  taskDeadlineUtc,
  taskScheduledUtc,
} from "../supabase/functions/process-op-todo-missed-sms/delivery.ts";
import assert from "node:assert/strict";
import test from "node:test";

test("missed-task reminders use the scheduled end, falling back to start time", () => {
  assert.equal(taskDeadlineUtc("2026-10-24", "09:00:00", "11:30:00"), Date.parse("2026-10-24T11:30:00Z"));
  assert.equal(taskDeadlineUtc("2026-10-24", "09:00", null), Date.parse("2026-10-24T09:00:00Z"));
  assert.equal(taskDeadlineUtc("2026-10-24", null, null), null);
  assert.equal(taskScheduledUtc("2026-10-24", "09:00"), Date.parse("2026-10-24T09:00:00Z"));
  assert.match(missedTaskMessage("Review site plan", Date.parse("2026-10-24T11:30:00Z")), /24 Oct, 11:30/);
});

test("normalizes only valid Ghana mobile numbers", () => {
  assert.equal(normalizeGhanaPhone("024 123 4567"), "233241234567");
  assert.equal(normalizeGhanaPhone("+233 24 123 4567"), "233241234567");
  assert.equal(normalizeGhanaPhone("12345"), null);
});

test("records only an accepted provider response with a reference as delivered", () => {
  assert.deepEqual(
    classifyProviderResponse(
      200,
      { status: "success", data: [{ id: "sms-42", recipient: "233241234567" }] },
      "233241234567",
    ),
    { status: "accepted", providerReference: "sms-42", error: null },
  );
});

test("retries only an explicit rate-limit response", () => {
  assert.equal(classifyProviderResponse(429, { status: "error" }, "233241234567").status, "queued");
  assert.equal(classifyProviderResponse(503, { status: "error" }, "233241234567").status, "needs_review");
  assert.equal(classifyProviderResponse(200, { status: "success", data: [] }, "233241234567").status, "needs_review");
});

test("makes a permanent provider rejection terminal", () => {
  assert.equal(classifyProviderResponse(422, { status: "error" }, "233241234567").status, "failed");
});
