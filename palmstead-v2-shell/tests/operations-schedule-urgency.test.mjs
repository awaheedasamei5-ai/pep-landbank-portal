import assert from "node:assert/strict";
import test from "node:test";

import { getScheduleUrgency } from "../src/app/(main)/dashboard/operations/_components/schedule-urgency.ts";

test("schedule triage uses task times and catches overdue work from the requested date range", () => {
	const now = new Date(2026, 9, 24, 12, 0, 0);
	const soonThrough = new Date(2026, 9, 27, 12, 0, 0);
	const items = [
		{ id: "missed-today", date: "2026-10-24", startTime: "08:00", endTime: "09:00", status: "open" },
		{ id: "due-later", date: "2026-10-24", startTime: "14:00", endTime: "15:00", status: "open" },
		{ id: "all-day", date: "2026-10-25", startTime: null, endTime: null, status: "open" },
		{ id: "done", date: "2026-10-23", startTime: "08:00", endTime: "09:00", status: "done" },
	];

	const result = getScheduleUrgency(items, now, soonThrough);

	assert.deepEqual(result.overdue.map((item) => item.id), ["missed-today"]);
	assert.deepEqual(result.dueSoon.map((item) => item.id), ["due-later", "all-day"]);
});

test("all-day tasks become overdue only after their due date ends", () => {
	const item = { id: "all-day", date: "2026-10-24", startTime: null, endTime: null, status: "open" };
	const beforeEnd = new Date(2026, 9, 24, 23, 59, 0);
	const afterEnd = new Date(2026, 9, 25, 0, 0, 0);

	assert.equal(getScheduleUrgency([item], beforeEnd, beforeEnd).overdue.length, 0);
	assert.equal(getScheduleUrgency([item], afterEnd, afterEnd).overdue.length, 1);
});

