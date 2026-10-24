export interface ScheduleConflictItem {
	id: string;
	title: string;
	date: string;
	startTime: string | null;
	endTime: string | null;
	status: string;
	kind: "task" | "meeting";
}

export interface ScheduleConflictInput {
	date: string;
	startTime: string | null;
	endTime: string | null;
	excludeId?: string;
}

function toMinutes(value: string): number | null {
	const [hour, minute] = value.split(":").map(Number);
	if (
		!Number.isInteger(hour) ||
		!Number.isInteger(minute) ||
		hour < 0 ||
		hour > 23 ||
		minute < 0 ||
		minute > 59
	) {
		return null;
	}
	return hour * 60 + minute;
}

export function findScheduleConflicts<T extends ScheduleConflictItem>(
	items: T[],
	input: ScheduleConflictInput,
): T[] {
	const start = input.startTime ? toMinutes(input.startTime) : 0;
	const end = input.endTime ? toMinutes(input.endTime) : 24 * 60;
	if (start === null || end === null || start >= end) return [];

	return items
		.filter((item) => {
			if (
				item.id === input.excludeId ||
				["done", "cancelled", "rescheduled"].includes(item.status) ||
				item.date !== input.date
			) {
				return false;
			}
			const itemStart = item.startTime ? toMinutes(item.startTime) : 0;
			const itemEnd = item.endTime ? toMinutes(item.endTime) : 24 * 60;
			return (
				itemStart !== null &&
				itemEnd !== null &&
				itemStart < end &&
				start < itemEnd
			);
		})
		.sort((a, b) => {
			const aStart = a.startTime ? (toMinutes(a.startTime) ?? 0) : 0;
			const bStart = b.startTime ? (toMinutes(b.startTime) ?? 0) : 0;
			return aStart - bStart || a.title.localeCompare(b.title);
		});
}
