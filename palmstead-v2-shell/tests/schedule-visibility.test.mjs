import assert from "node:assert/strict";
import test from "node:test";
import {
  isVisibleScheduleMeeting,
  isVisibleScheduleTodo,
} from "../src/app/(main)/dashboard/operations/_components/schedule-visibility.ts";

test("cancelled and superseded to-dos stay out of the active calendar", () => {
  assert.equal(isVisibleScheduleTodo("open"), true);
  assert.equal(isVisibleScheduleTodo("done"), true);
  assert.equal(isVisibleScheduleTodo("cancelled"), false);
  assert.equal(isVisibleScheduleTodo("rescheduled"), false);
});

test("cancelled meetings stay out of the active calendar", () => {
  assert.equal(isVisibleScheduleMeeting("open"), true);
  assert.equal(isVisibleScheduleMeeting("cancelled"), false);
});
