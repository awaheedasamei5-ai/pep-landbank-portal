import assert from "node:assert/strict";
import test from "node:test";
import { classifyProviderResponse, normalizeGhanaPhone } from "../supabase/functions/process-op-todo-missed-sms/delivery.ts";

test("normalizes only valid Ghana mobile numbers", () => {
  assert.equal(normalizeGhanaPhone("024 123 4567"), "233241234567");
  assert.equal(normalizeGhanaPhone("+233 24 123 4567"), "233241234567");
  assert.equal(normalizeGhanaPhone("12345"), null);
});

test("records only an accepted provider response with a reference as delivered", () => {
  assert.deepEqual(
    classifyProviderResponse(200, { status: "success", data: [{ id: "sms-42", recipient: "233241234567" }] }, "233241234567"),
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
