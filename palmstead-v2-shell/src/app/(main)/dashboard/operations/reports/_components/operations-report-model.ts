export type DateRange = { start: string; end: string };
export type ComparisonMode = "previous-period" | "previous-year";
export type TrendBucket = "day" | "week" | "month";

export type OperationsReportType = "work-summary" | "completed" | "created" | "due" | "open-overdue";
export type OperationsReportFilters = {
	report: OperationsReportType;
	project: string;
	person: string;
	status: string;
	priority: string;
	from: string;
	to: string;
	compare: ComparisonMode;
};

const reportTypes = new Set<OperationsReportType>(["work-summary", "completed", "created", "due", "open-overdue"]);
const statusGroups = new Set(["backlog", "unstarted", "started", "completed", "cancelled"]);
const priorities = new Set(["urgent", "high", "medium", "low", "none"]);

function isDateOnly(value: string | null): value is string {
	if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const [year, month, day] = value.split("-").map(Number);
	const date = new Date(year, month - 1, day);
	return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

/** Reads only allow-listed report parameters; manager-only dimensions are discarded for Staff. */
export function parseReportFilters(params: URLSearchParams, defaults: Pick<OperationsReportFilters, "from" | "to">, manager: boolean): OperationsReportFilters {
	const one = (key: string) => {
		const values = params.getAll(key);
		return values.length === 1 ? values[0] : null;
	};
	const reportValue = one("report");
	const statusValue = one("status");
	const priorityValue = one("priority");
	const compareValue = one("compare");
	const fromValue = one("from");
	const toValue = one("to");
	const from = isDateOnly(fromValue) ? fromValue : defaults.from;
	const to = isDateOnly(toValue) ? toValue : defaults.to;
	const rangeValid = from <= to;
	return {
		report: reportValue && reportTypes.has(reportValue as OperationsReportType) ? reportValue as OperationsReportType : "work-summary",
		project: manager ? (one("project")?.slice(0, 100) || "all") : "all",
		person: manager ? (one("person")?.slice(0, 100) || "all") : "all",
		status: statusValue && statusGroups.has(statusValue) ? statusValue : "all",
		priority: priorityValue && priorities.has(priorityValue) ? priorityValue : "all",
		from: rangeValid ? from : defaults.from,
		to: rangeValid ? to : defaults.to,
		compare: compareValue === "previous-year" ? "previous-year" : "previous-period",
	};
}

/** Replaces only this report's allow-listed filters and preserves other portal context. */
export function writeReportFilters(params: URLSearchParams, filters: OperationsReportFilters, manager: boolean): URLSearchParams {
	const next = new URLSearchParams(params);
	for (const key of ["report", "project", "person", "status", "priority", "from", "to", "compare"]) next.delete(key);
	if (filters.report !== "work-summary") next.set("report", filters.report);
	if (manager && filters.project !== "all") next.set("project", filters.project);
	if (manager && filters.person !== "all") next.set("person", filters.person);
	if (filters.status !== "all") next.set("status", filters.status);
	if (filters.priority !== "all") next.set("priority", filters.priority);
	next.set("from", filters.from);
	next.set("to", filters.to);
	if (filters.compare !== "previous-period") next.set("compare", filters.compare);
	return next;
}

export type ReportRecord = {
	created_at: string;
	completed_at: string | null;
	target_date: string | null;
};

export type PeriodCounts = {
	created: number;
	completed: number;
};

export type PeriodComparison = {
	currentRange: DateRange;
	previousRange: DateRange;
	current: PeriodCounts;
	previous: PeriodCounts;
	delta: PeriodCounts;
	percent: { created: number | null; completed: number | null };
};

export type TrendPoint = {
	key: string;
	label: string;
	created: number;
	completed: number;
};

export function displayDate(value: string | null | undefined): string {
	if (!value) return "";
	if (!value.includes("T")) return value.slice(0, 10);
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseDate(value: string): Date {
	const [year, month, day] = value.slice(0, 10).split("-").map(Number);
	return new Date(year, month - 1, day);
}

function dateKey(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number): number {
	return new Date(year, month + 1, 0).getDate();
}

export function previousDateRange(range: DateRange, mode: ComparisonMode): DateRange {
	const start = parseDate(range.start);
	const end = parseDate(range.end);
	if (mode === "previous-year") {
		const priorStart = new Date(start.getFullYear() - 1, start.getMonth(), Math.min(start.getDate(), daysInMonth(start.getFullYear() - 1, start.getMonth())));
		const priorEnd = new Date(end.getFullYear() - 1, end.getMonth(), Math.min(end.getDate(), daysInMonth(end.getFullYear() - 1, end.getMonth())));
		return { start: dateKey(priorStart), end: dateKey(priorEnd) };
	}
	const lengthDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
	const priorEnd = new Date(start);
	priorEnd.setDate(priorEnd.getDate() - 1);
	const priorStart = new Date(priorEnd);
	priorStart.setDate(priorStart.getDate() - lengthDays + 1);
	return { start: dateKey(priorStart), end: dateKey(priorEnd) };
}

function dateInRange(value: string | null | undefined, range: DateRange): boolean {
	const date = displayDate(value);
	return Boolean(date && date >= range.start && date <= range.end);
}

function percentChange(current: number, previous: number): number | null {
	return previous === 0 ? null : Math.round(((current - previous) / previous) * 100);
}

function countsForRange(records: ReportRecord[], range: DateRange): PeriodCounts {
	return records.reduce(
		(counts, record) => {
			if (dateInRange(record.created_at, range)) counts.created += 1;
			if (dateInRange(record.completed_at, range)) counts.completed += 1;
			return counts;
		},
		{ created: 0, completed: 0 },
	);
}

export function comparePeriods(
	records: ReportRecord[],
	range: DateRange,
	mode: ComparisonMode,
): PeriodComparison {
	const previousRange = previousDateRange(range, mode);
	const current = countsForRange(records, range);
	const previous = countsForRange(records, previousRange);
	return {
		currentRange: range,
		previousRange,
		current,
		previous,
		delta: {
			created: current.created - previous.created,
			completed: current.completed - previous.completed,
		},
		percent: {
			created: percentChange(current.created, previous.created),
			completed: percentChange(current.completed, previous.completed),
		},
	};
}

function mondayOf(date: Date): Date {
	const result = new Date(date);
	const offset = (result.getDay() + 6) % 7;
	result.setDate(result.getDate() - offset);
	return result;
}

export function buildTrend(records: ReportRecord[], range: DateRange): { bucket: TrendBucket; points: TrendPoint[] } {
	const start = parseDate(range.start);
	const end = parseDate(range.end);
	const span = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
	let bucket: TrendBucket;
	if (span <= 31) bucket = "day";
	else if (span <= 120) bucket = "week";
	else bucket = "month";
	const points = new Map<string, TrendPoint>();
	let cursor: Date;
	if (bucket === "week") cursor = mondayOf(start);
	else if (bucket === "month") cursor = new Date(start.getFullYear(), start.getMonth(), 1);
	else cursor = new Date(start);
	while (cursor <= end) {
		const key = bucket === "month"
			? `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`
			: dateKey(cursor);
		const label = bucket === "month"
			? cursor.toLocaleDateString(undefined, { month: "short", year: "2-digit" })
			: cursor.toLocaleDateString(undefined, { month: "short", day: "numeric" });
		points.set(key, { key, label, created: 0, completed: 0 });
		if (bucket === "month") cursor.setMonth(cursor.getMonth() + 1);
		else cursor.setDate(cursor.getDate() + (bucket === "week" ? 7 : 1));
	}
	for (const record of records) {
		for (const [field, metric] of [["created_at", "created"], ["completed_at", "completed"]] as const) {
			const date = displayDate(record[field]);
			if (!date || date < range.start || date > range.end) continue;
			const parsed = parseDate(date);
			const key = bucket === "month"
				? date.slice(0, 7)
				: dateKey(bucket === "week" ? mondayOf(parsed) : parsed);
			const point = points.get(key);
			if (point) point[metric] += 1;
		}
	}
	return { bucket, points: [...points.values()] };
}

export function formatDelta(delta: number, percent: number | null): string {
	const absolute = `${delta > 0 ? "+" : ""}${delta}`;
	return percent === null ? `${absolute} · no prior baseline` : `${absolute} · ${percent > 0 ? "+" : ""}${percent}%`;
}

