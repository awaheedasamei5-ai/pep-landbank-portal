import assert from "node:assert/strict";
import test from "node:test";

import { findScheduleConflicts } from "../src/app/(main)/dashboard/operations/_components/schedule-conflicts.ts";

test("finds overlapping tasks and meetings in chronological order", () => {
	const items = [
		{ id: "meeting", title: "Team meeting", date: "2026-10-24", startTime: "10:00", endTime: "11:00", status: "open", kind: "meeting" },
		{ id: "task", title: "Prepare notes", date: "2026-10-24", startTime: "09:00", endTime: "10:30", status: "open", kind: "task" },
		{ id: "later", title: "Later task", date: "2026-10-24", startTime: "14:00", endTime: "15:00", status: "open", kind: "task" },
	];

	const result = findScheduleConflicts(items, {
		date: "2026-10-24",
		startTime: "10:15",
		endTime: "10:45",
	});

	assert.deepEqual(result.map((item) => item.id), ["task", "meeting"]);
});

test("all-day tasks conflict with timed and all-day entries on that date", () => {
	const items = [
		{ id: "timed", title: "Site visit", date: "2026-10-24", startTime: "14:00", endTime: "15:00", status: "open", kind: "meeting" },
		{ id: "other-day", title: "Tomorrow", date: "2026-10-25", startTime: null, endTime: null, status: "open", kind: "task" },
	];

	const result = findScheduleConflicts(items, {
		date: "2026-10-24",
		startTime: null,
		endTime: null,
	});

	assert.deepEqual(result.map((item) => item.id), ["timed"]);
});

test("all-day existing entries conflict with timed work and terminal items are ignored", () => {
	const items = [
		{ id: "all-day", title: "Company holiday", date: "2026-10-24", startTime: null, endTime: null, status: "open", kind: "task" },
		{ id: "done", title: "Completed", date: "2026-10-24", startTime: "09:00", endTime: "10:00", status: "done", kind: "task" },
		{ id: "cancelled", title: "Cancelled", date: "2026-10-24", startTime: "09:00", endTime: "10:00", status: "cancelled", kind: "meeting" },
	];

	const result = findScheduleConflicts(items, {
		date: "2026-10-24",
		startTime: "09:00",
		endTime: "09:30",
	});

	assert.deepEqual(result.map((item) => item.id), ["all-day"]);
});

test("touching endpoints do not overlap and the edited item can be excluded", () => {
	const items = [
		{ id: "adjacent", title: "Starts at finish", date: "2026-10-24", startTime: "10:00", endTime: "11:00", status: "open", kind: "meeting" },
		{ id: "self", title: "Current item", date: "2026-10-24", startTime: "09:00", endTime: "10:00", status: "open", kind: "task" },
	];

	const result = findScheduleConflicts(items, {
		date: "2026-10-24",
		startTime: "09:00",
		endTime: "10:00",
		excludeId: "self",
	});

	assert.deepEqual(result, []);
});

