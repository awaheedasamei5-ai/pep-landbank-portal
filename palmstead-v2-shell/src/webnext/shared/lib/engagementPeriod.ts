import { today } from "./format";

// docs/plans/29-company-leads-full-system-blueprint.md Section 7.1 -- the
// one real period-filter engine shared by every Dashboard/Analytics/Call
// Log screen across Company Leads, Pipeline (My + Master) and Client
// Database, translated from UNIFIED_CUSTOMER_ENGAGEMENT_SYSTEM.xlsx's own
// Dashboard/Analytics tabs (Year + Month(0=all) selector, day/month/year
// breakdown tables, "avg calls per ACTIVE day" -- never per calendar day).
//
// Deliberately a DIFFERENT tool from this same directory's own
// periodFilter.ts/usePeriodFilter() -- that one narrows a list to recent
// data with a simple mode+range (Site Visits/SVE/Enquiries/Complaints/
// Allocations' shared filter); this one drives bucketed breakdown tables
// and charts (day/week/month/year granularity, active-day counting) for
// engagement analytics screens. Different job, different shape -- kept
// separate rather than forcing one API to do both, hence the different
// name instead of colliding with periodFilter.ts.

export type Granularity = "day" | "week" | "month" | "year" | "custom";

export interface PeriodFilter {
  granularity: Granularity;
  year: number;
  month: number | "all";
  from?: string;
  to?: string;
}

export interface DateRange {
  from: string;
  to: string;
}

export function defaultPeriodFilter(): PeriodFilter {
  const t = today();
  return { granularity: "month", year: Number(t.slice(0, 4)), month: Number(t.slice(5, 7)) };
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function periodToRange(filter: PeriodFilter): DateRange {
  if (filter.granularity === "custom" && filter.from && filter.to) {
    return { from: filter.from, to: filter.to };
  }
  const y = filter.year;
  // "Year" granularity has no month selector (PeriodFilterBar hides it) --
  // the whole year is the period, regardless of whatever month was last
  // selected under Day/Week/Month granularity.
  if (filter.month === "all" || filter.granularity === "year") {
    return { from: `${y}-01-01`, to: `${y}-12-31` };
  }
  const m = filter.month;
  const from = `${y}-${String(m).padStart(2, "0")}-01`;
  const to = `${y}-${String(m).padStart(2, "0")}-${String(lastDayOfMonth(y, m)).padStart(2, "0")}`;
  return { from, to };
}

export function inRange(dateIso: string | null | undefined, range: DateRange): boolean {
  if (!dateIso) return false;
  const d = dateIso.slice(0, 10);
  return d >= range.from && d <= range.to;
}

export function filterDatesInRange(dates: (string | null | undefined)[], range: DateRange): string[] {
  return dates.filter((d): d is string => inRange(d, range));
}

// "Active day" = a calendar day with at least one real event -- the
// workbook's own definition, never calendar days in the period (a
// Sunday with zero calls doesn't drag the average down).
export function activeDaysCount(dates: (string | null | undefined)[]): number {
  const days = new Set<string>();
  for (const d of dates) {
    if (d) days.add(d.slice(0, 10));
  }
  return days.size;
}

export function avgPerActiveDay(count: number, activeDays: number): number {
  return activeDays > 0 ? count / activeDays : 0;
}

export interface BucketPoint {
  label: string;
  key: string;
  count: number;
}

// Day-of-month breakdown, for a single selected month (Analytics "Day" tab /
// Dashboard's "day by day" chart) -- one row per calendar day of that month,
// zero-filled, matching the workbook's own Day/Calls/Date table shape.
export function bucketByDayOfMonth(dates: (string | null | undefined)[], year: number, month: number): BucketPoint[] {
  const counts = new Map<string, number>();
  for (const d of dates) {
    if (!d) continue;
    const key = d.slice(0, 10);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const days = lastDayOfMonth(year, month);
  const points: BucketPoint[] = [];
  for (let day = 1; day <= days; day++) {
    const key = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    points.push({ label: String(day), key, count: counts.get(key) ?? 0 });
  }
  return points;
}

// ISO week (Mon-start) breakdown across an arbitrary range.
export function bucketByWeek(dates: (string | null | undefined)[], range: DateRange): BucketPoint[] {
  function weekStart(iso: string): string {
    const d = new Date(iso + "T00:00:00");
    const day = (d.getDay() + 6) % 7; // 0 = Monday
    d.setDate(d.getDate() - day);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  const counts = new Map<string, number>();
  for (const d of dates) {
    if (!d || !inRange(d, range)) continue;
    const key = weekStart(d.slice(0, 10));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const points: BucketPoint[] = [...counts.entries()]
    .map(([key, count]) => ({ key, count, label: `Wk of ${key.slice(5)}` }))
    .sort((a, b) => a.key.localeCompare(b.key));
  return points;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Month-of-year breakdown, for a single selected year (Analytics "Month"
// tab) -- one row per calendar month, zero-filled.
export function bucketByMonthOfYear(dates: (string | null | undefined)[], year: number): BucketPoint[] {
  const counts = new Map<number, number>();
  for (const d of dates) {
    if (!d) continue;
    if (d.slice(0, 4) !== String(year)) continue;
    const m = Number(d.slice(5, 7));
    counts.set(m, (counts.get(m) ?? 0) + 1);
  }
  return MONTH_NAMES.map((label, i) => ({ label, key: `${year}-${String(i + 1).padStart(2, "0")}`, count: counts.get(i + 1) ?? 0 }));
}

// Year breakdown, all-time -- the workbook's year table ignores the
// Dashboard's own Year/Month selector entirely, always spanning every year
// that appears in the real data (plus the current year, so an empty year
// still shows a zero bar instead of vanishing).
export function bucketByYear(dates: (string | null | undefined)[]): BucketPoint[] {
  const counts = new Map<number, number>();
  for (const d of dates) {
    if (!d) continue;
    const y = Number(d.slice(0, 4));
    if (!Number.isFinite(y)) continue;
    counts.set(y, (counts.get(y) ?? 0) + 1);
  }
  const years = [...counts.keys()];
  const thisYear = Number(today().slice(0, 4));
  const minYear = years.length > 0 ? Math.min(...years, thisYear) : thisYear;
  const maxYear = years.length > 0 ? Math.max(...years, thisYear) : thisYear;
  const points: BucketPoint[] = [];
  for (let y = minYear; y <= maxYear; y++) {
    points.push({ label: String(y), key: String(y), count: counts.get(y) ?? 0 });
  }
  return points;
}

export function bucketByGranularity(dates: (string | null | undefined)[], filter: PeriodFilter): BucketPoint[] {
  const range = periodToRange(filter);
  switch (filter.granularity) {
    case "day":
      return filter.month === "all" ? bucketByMonthOfYear(dates, filter.year) : bucketByDayOfMonth(dates, filter.year, filter.month);
    case "week":
      return bucketByWeek(dates, range);
    case "year":
      return bucketByYear(dates);
    case "month":
    case "custom":
    default:
      return filter.month === "all" || filter.granularity === "custom" ? bucketByMonthOfYear(dates, filter.year) : bucketByDayOfMonth(dates, filter.year, filter.month);
  }
}

export function availableYears(dates: (string | null | undefined)[]): number[] {
  const years = new Set<number>();
  for (const d of dates) {
    if (!d) continue;
    const y = Number(d.slice(0, 4));
    if (Number.isFinite(y)) years.add(y);
  }
  years.add(Number(today().slice(0, 4)));
  return [...years].sort((a, b) => b - a);
}
