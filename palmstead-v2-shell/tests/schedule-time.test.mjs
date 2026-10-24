import assert from "node:assert/strict";
import test from "node:test";
import {
	addScheduleDays,
	calendarDateOnly,
	calendarTime,
	workspaceDateOnly,
	workspaceDeadline,
	workspaceMonthRange,
} from "../src/app/(main)/dashboard/operations/_components/schedule-time.ts";

test("workspace dates follow Africa/Accra around midnight", () => {
	assert.equal(workspaceDateOnly(new Date("2026-10-24T23:30:00.000Z")), "2026-10-24");
	assert.equal(workspaceDateOnly(new Date("2026-10-25T01:30:00.000+02:00")), "2026-10-24");
});

test("workspace month range follows the Accra calendar month", () => {
	assert.deepEqual(workspaceMonthRange(new Date("2026-10-24T23:30:00.000Z")), {
		from: "2026-10-01",
		to: "2026-10-31",
		title: "October 2026",
	});
});

test("date-only recurrence arithmetic crosses month and leap-day boundaries", () => {
	assert.equal(addScheduleDays("2026-03-01", -1), "2026-02-28");
	assert.equal(addScheduleDays("2024-02-28", 1), "2024-02-29");
	assert.equal(addScheduleDays("2024-02-29", 1), "2024-03-01");
});

test("calendar date and time values stay in UTC workspace coordinates", () => {
	const date = new Date("2026-10-24T09:35:00.000Z");
	assert.equal(calendarDateOnly(date), "2026-10-24");
	assert.equal(calendarTime(date), "09:35");
});

test("task deadlines use workspace clock and reject invalid date/time values", () => {
	assert.equal(workspaceDeadline("2026-10-24", "09:30"), Date.parse("2026-10-24T09:30:00.000Z"));
	assert.equal(workspaceDeadline("2026-02-30", "09:30"), null);
	assert.equal(workspaceDeadline("2026-10-24", "24:00"), null);
});
