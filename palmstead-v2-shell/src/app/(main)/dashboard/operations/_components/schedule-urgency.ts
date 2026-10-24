import { workspaceDeadline } from "./schedule-time.ts";

export interface ScheduleUrgencyItem {
	date: string;
	startTime: string | null;
	endTime: string | null;
	status: string;
}

export interface ScheduleUrgency<T extends ScheduleUrgencyItem> {
	overdue: T[];
	dueSoon: T[];
}

function taskDeadline(item: ScheduleUrgencyItem): number | null {
	const time = item.endTime || item.startTime;
	return workspaceDeadline(item.date, time ? `${time.slice(0, 5)}:00` : "23:59");
}

export function getScheduleUrgency<T extends ScheduleUrgencyItem>(
	items: T[],
	now: Date,
	soonThrough: Date,
): ScheduleUrgency<T> {
	const nowTime = now.getTime();
	const soonTime = soonThrough.getTime();
	const overdue: T[] = [];
	const dueSoon: T[] = [];

	for (const item of items) {
		if (item.status !== "open") continue;
		const deadline = taskDeadline(item);
		if (deadline === null) continue;
		if (deadline < nowTime) overdue.push(item);
		else if (deadline <= soonTime) dueSoon.push(item);
	}

	const byDeadline = (a: T, b: T) =>
		(taskDeadline(a) ?? Number.POSITIVE_INFINITY) -
		(taskDeadline(b) ?? Number.POSITIVE_INFINITY);
	overdue.sort(byDeadline);
	dueSoon.sort(byDeadline);
	return { overdue, dueSoon };
}

