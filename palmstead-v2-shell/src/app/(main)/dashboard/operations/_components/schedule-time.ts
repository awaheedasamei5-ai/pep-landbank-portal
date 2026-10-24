export const SCHEDULE_TIME_ZONE = "Africa/Accra";

function partsInWorkspace(date: Date) {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: SCHEDULE_TIME_ZONE,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(date);
}

export function workspaceDateOnly(date: Date): string {
	const parts = Object.fromEntries(
		partsInWorkspace(date).map((part) => [part.type, part.value]),
	);
	return `${parts.year}-${parts.month}-${parts.day}`;
}

// The calendar uses UTC as its rendering zone. Ghana uses UTC year-round,
// so FullCalendar's UTC dates correspond to Palmstead's Africa/Accra times
// without requiring a client machine's local zone to match the workspace.
export function calendarDateOnly(date: Date): string {
	return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function addScheduleDays(date: string, days: number): string {
	const [year, month, day] = date.split("-").map(Number);
	const next = new Date(Date.UTC(year, month - 1, day + days));
	return calendarDateOnly(next);
}

export function workspaceMonthRange(date: Date) {
	const [year, month] = workspaceDateOnly(date).split("-").map(Number);
	const from = `${year}-${String(month).padStart(2, "0")}-01`;
	const endDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
	const to = `${year}-${String(month).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;
	return {
		from,
		to,
		title: new Intl.DateTimeFormat("en", {
			timeZone: SCHEDULE_TIME_ZONE,
			month: "long",
			year: "numeric",
		}).format(date),
	};
}

export function calendarTime(date: Date): string {
	return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
}

export function workspaceDeadline(date: string, time: string | null): number | null {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
	const clock = time?.slice(0, 5) ?? "23:59";
	if (!/^\d{2}:\d{2}$/.test(clock)) return null;
	const [year, month, day] = date.split("-").map(Number);
	const [hour, minute] = clock.split(":").map(Number);
	if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
	const value = Date.UTC(year, month - 1, day, hour, minute);
	const parsed = new Date(value);
	if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
	return value;
}
