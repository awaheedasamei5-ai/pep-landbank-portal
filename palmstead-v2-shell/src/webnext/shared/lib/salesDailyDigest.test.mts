import { type DigestSnapshot, digestTotals } from "./salesDailyDigest.ts";
import assert from "node:assert/strict";
import test from "node:test";

test("daily totals separate planned work from completed work and approved cash", () => {
  const snapshot: DigestSnapshot = {
    date: "2026-11-05",
    kind: "evening",
    timezone: "Africa/Accra",
    generatedAt: "2026-11-05T18:00:00Z",
    staff: [
      {
        key: "a",
        name: "A",
        tasks: [{ id: "1", status: "done" }],
        followUps: [{ id: "2" }],
        leadNextActions: [{ id: "3" }],
        visitsScheduled: [],
        newLeads: [{ id: "4" }],
        calls: [{ id: "5" }],
        otherActivity: [],
        visitRequests: [],
        approvedReceipts: [{ id: "6", amount: 120.5 }],
        tasksCompletedToday: [{ id: "1" }],
        tasksMissed: [],
      },
      {
        key: "b",
        name: "B",
        tasks: [{ id: "7", status: "open" }],
        followUps: [],
        leadNextActions: [],
        visitsScheduled: [{ id: "8" }],
        newLeads: [],
        calls: [{ id: "9" }],
        otherActivity: [],
        visitRequests: [{ id: "8" }],
        approvedReceipts: [{ id: "10", amount: 40 }],
        tasksCompletedToday: [],
        tasksMissed: [{ id: "7" }],
      },
    ],
  };
  assert.deepEqual(digestTotals(snapshot), {
    tasks: 2,
    tasksOpenToday: 1,
    followUps: 2,
    visitsScheduled: 1,
    calls: 2,
    newLeads: 1,
    visitRequests: 1,
    tasksCompleted: 1,
    tasksMissed: 1,
    approvedReceipts: 2,
    approvedCash: 160.5,
  });
});
