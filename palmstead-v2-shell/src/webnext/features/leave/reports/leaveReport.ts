import { leaveSelectionYear } from "../lib/leaveDates";
import { leaveIsBlocking } from "../lib/leaveLogic";

// Reporting intentionally has no letter, reason, signature, phone or auth ID.
export interface ReportRequest {
  id: string;
  agentKey: string;
  agentName: string;
  requestNo: string | null;
  year: number;
  dates: unknown;
  daysCount: number;
  status: string;
  isEmergency: boolean;
  deductQuota: boolean;
  createdAt: string;
  decidedAt: string | null;
  decidedByName: string | null;
  autoSubmittedAt: string | null;
  usedConfirmedAt: string | null;
}

export interface ReportPerson {
  key: string;
  name: string;
  department: string | null;
  active: boolean;
  policyEligible: boolean;
}

export interface LeaveReportSnapshot {
  generatedAt: string;
  scope: "personal" | "management";
  annualDays: number;
  year: number;
  requests: ReportRequest[];
  roster: ReportPerson[];
  complete: boolean;
  totalRequests: number;
  availableYears: number[];
  events: {
    requestId: string;
    createdAt: string;
    actorKey: string | null;
    fromStatus: string | null;
    toStatus: string;
  }[];
  eventsComplete: boolean;
}

export interface ReportFilters {
  year: number;
  fromMonth: number;
  toMonth: number;
  employee: string;
  status: string;
  cohort: "active" | "inactive" | "all";
}

const statuses = ["planned", "pending", "approved", "declined", "rescheduled"] as const;
export interface ReportException {
  requestId: string;
  reference: string;
  employee: string;
  message: string;
}

function selectedDates(request: ReportRequest): { dates: string[]; problems: string[]; reliable: boolean } {
  const problems: string[] = [];
  const raw = Array.isArray(request.dates) ? request.dates : [];
  const valid = raw.filter((date): date is string => typeof date === "string" && leaveSelectionYear([date]) !== null);
  const dates = [...new Set(valid)].sort();
  if (!Array.isArray(request.dates) || !raw.length) problems.push("No valid selected-date array recorded");
  if (valid.length !== raw.length) problems.push("Invalid calendar date recorded");
  if (dates.length !== valid.length) problems.push("Repeated selected dates");
  if (dates.some((date) => Number(date.slice(0, 4)) !== request.year))
    problems.push("Selected dates do not match the request year");
  if (!Number.isInteger(request.daysCount) || request.daysCount < 0 || request.daysCount !== dates.length)
    problems.push("Declared days differ from valid distinct selected dates");
  if (!statuses.some((status) => status === request.status)) problems.push("Unrecognized request status");
  return { dates, problems, reliable: problems.length === 0 };
}

function isBlocking(status: string) {
  return statuses.some((value) => value === status) && leaveIsBlocking(status as (typeof statuses)[number]);
}

export function periodBounds(year: number, fromMonth: number, toMonth: number) {
  if (
    !Number.isInteger(year) ||
    year < 1901 ||
    year > 2199 ||
    !Number.isInteger(fromMonth) ||
    !Number.isInteger(toMonth) ||
    fromMonth < 1 ||
    toMonth > 12 ||
    toMonth < fromMonth
  )
    throw new Error("Choose a valid year and month range.");
  const start = `${year}-${String(fromMonth).padStart(2, "0")}-01`;
  const end = new Date(Date.UTC(year, toMonth, 0)).toISOString().slice(0, 10);
  return { start, end };
}

export function comparison(current: number, previous: number) {
  return {
    current,
    previous,
    difference: current - previous,
    percentage: previous === 0 ? null : ((current - previous) / previous) * 100,
  };
}

export function buildLeaveReport(snapshot: LeaveReportSnapshot, filters: ReportFilters) {
  if (!snapshot.complete || snapshot.requests.length !== snapshot.totalRequests)
    throw new Error("The report dataset is incomplete. Refresh or narrow the server report scope before exporting.");
  if (filters.year !== snapshot.year) throw new Error("The selected year does not match the loaded report.");
  const bounds = periodBounds(filters.year, filters.fromMonth, filters.toMonth);
  const prior = periodBounds(filters.year - 1, filters.fromMonth, filters.toMonth);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Accra",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(snapshot.generatedAt));
  const known = new Map(snapshot.roster.map((person) => [person.key, person]));
  for (const request of snapshot.requests) {
    if (!known.has(request.agentKey))
      known.set(request.agentKey, {
        key: request.agentKey,
        name: request.agentName || request.agentKey,
        department: null,
        active: false,
        policyEligible: false,
      });
  }
  const people = [...known.values()]
    .filter(
      (person) =>
        (filters.employee === "all" || person.key === filters.employee) &&
        (filters.cohort === "all" || (filters.cohort === "active" ? person.active : !person.active)),
    )
    .sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
  const keys = new Set(people.map((person) => person.key));
  const scoped = snapshot.requests
    .filter((request) => keys.has(request.agentKey))
    .map((request) => ({ ...request, ...selectedDates(request) }));
  const annual = scoped.filter((request) => request.year === filters.year);
  const confirmed = (request: (typeof annual)[number]) =>
    request.reliable &&
    request.status === "approved" &&
    !!request.usedConfirmedAt &&
    request.dates.length > 0 &&
    request.dates[request.dates.length - 1] < today;
  const balances = people.map((person) => {
    const requests = annual.filter((request) => request.agentKey === person.key);
    const sum = (predicate: (request: (typeof annual)[number]) => boolean) =>
      requests
        .filter(predicate)
        .reduce(
          (total, request) =>
            total + (Number.isFinite(request.daysCount) && request.daysCount >= 0 ? request.daysCount : 0),
          0,
        );
    const reserved = sum((request) => request.deductQuota !== false && isBlocking(request.status));
    const allowance = person.policyEligible ? snapshot.annualDays : null;
    return {
      ...person,
      allowance,
      reserved,
      confirmedUsed: sum((request) => request.deductQuota !== false && confirmed(request)),
      available: allowance === null ? null : Math.max(0, allowance - reserved),
      overReserved: allowance === null ? null : Math.max(0, reserved - allowance),
      exempt: sum((request) => request.deductQuota === false && isBlocking(request.status)),
      planned: sum((request) => request.deductQuota !== false && request.status === "planned"),
      pending: sum((request) => request.deductQuota !== false && request.status === "pending"),
      approved: sum((request) => request.deductQuota !== false && request.status === "approved"),
      rescheduled: sum((request) => request.deductQuota !== false && request.status === "rescheduled"),
      qualityIssues: requests.filter((request) => !request.reliable).length,
    };
  });
  const statusMatches = (request: ReportRequest) => filters.status === "all" || request.status === filters.status;
  const windowDates = (request: (typeof scoped)[number], start: string, end: string) =>
    request.dates.filter((date) => date >= start && date <= end);
  const register = annual
    .filter(statusMatches)
    .map((request) => ({ ...request, datesInPeriod: windowDates(request, bounds.start, bounds.end) }))
    .filter((request) => request.datesInPeriod.length > 0)
    .sort((a, b) => a.datesInPeriod[0].localeCompare(b.datesInPeriod[0]) || a.id.localeCompare(b.id));
  const exceptions: ReportException[] = [];
  for (const request of annual) {
    const messages = [...request.problems];
    if (request.status === "rescheduled") messages.push("Replacement schedule awaiting action");
    if (request.reliable && request.status === "pending" && request.dates[0] <= today)
      messages.push("Pending decision: scheduled start has arrived");
    if (
      request.reliable &&
      request.status === "approved" &&
      !request.usedConfirmedAt &&
      (request.dates.at(-1) ?? today) < today
    )
      messages.push("Past approved leave awaiting usage confirmation");
    if (request.usedConfirmedAt && !confirmed(request))
      messages.push("Usage confirmation cannot be included in confirmed-used totals");
    for (const message of messages)
      exceptions.push({
        requestId: request.id,
        reference: request.requestNo ?? request.id,
        employee: request.agentName,
        message,
      });
  }
  const occupied = new Map<
    string,
    { date: string; employees: Set<string>; approved: Set<string>; tentative: Set<string>; references: Set<string> }
  >();
  for (const request of register.filter((row) => isBlocking(row.status)))
    for (const date of request.datesInPeriod) {
      const row = occupied.get(date) ?? {
        date,
        employees: new Set<string>(),
        approved: new Set<string>(),
        tentative: new Set<string>(),
        references: new Set<string>(),
      };
      const duplicateKey = `${request.agentKey}:${date}`;
      if (row.references.has(duplicateKey))
        exceptions.push({
          requestId: request.id,
          reference: request.requestNo ?? request.id,
          employee: request.agentName,
          message: `Employee date is reserved by multiple requests: ${date}`,
        });
      row.references.add(duplicateKey);
      row.employees.add(request.agentKey);
      (request.status === "approved" ? row.approved : row.tentative).add(request.agentKey);
      occupied.set(date, row);
    }
  const coverage = [...occupied.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => ({
      date: row.date,
      employees: [...row.employees],
      approved: row.approved.size,
      tentative: row.tentative.size,
      overlap: row.employees.size > 1,
    }));
  const dateCount = (year: number, start: string, end: string, approvedOnly: boolean) =>
    new Set(
      scoped
        .filter(
          (request) =>
            request.year === year && statusMatches(request) && (!approvedOnly || request.status === "approved"),
        )
        .flatMap((request) => windowDates(request, start, end).map((date) => `${request.agentKey}:${date}`)),
    ).size;
  const months = Array.from({ length: filters.toMonth - filters.fromMonth + 1 }, (_, index) => {
    const month = filters.fromMonth + index;
    const current = periodBounds(filters.year, month, month);
    const previous = periodBounds(filters.year - 1, month, month);
    return {
      month,
      ...comparison(
        dateCount(filters.year, current.start, current.end, true),
        dateCount(filters.year - 1, previous.start, previous.end, true),
      ),
    };
  });
  const approvedComparison = comparison(
    dateCount(filters.year, bounds.start, bounds.end, true),
    dateCount(filters.year - 1, prior.start, prior.end, true),
  );
  const annualIds = new Set(annual.map((request) => request.id));
  return {
    snapshot,
    filters,
    bounds,
    prior,
    people,
    balances,
    register,
    exceptions,
    coverage,
    months,
    approvedComparison,
    events: snapshot.events.filter((event) => annualIds.has(event.requestId)),
    totalReserved: balances.reduce((sum, row) => sum + row.reserved, 0),
    totalConfirmed: balances.reduce((sum, row) => sum + row.confirmedUsed, 0),
    qualityCount: annual.filter((request) => !request.reliable).length,
    definitions: [
      "Current company policy is applied independently to each eligible employee. Historical policy allocations are not recorded.",
      "Reserved includes quota-deducting planned, pending, approved and rescheduled requests. Confirmed used is a subset, never deducted twice.",
      "Annual balances use the full selected year, regardless of activity-month or status filters. Declared counts are retained; data issues are flagged.",
      "Activity uses valid distinct selected employee-dates. Non-contiguous dates do not imply a continuous absence. Current statuses and departments apply.",
      "Comparison is the same complete month range in the previous year; future scheduled dates may be included. This is not a productivity score.",
      "Recorded workflow history is incomplete for legacy records. Latest decision timestamps do not establish submission-to-decision turnaround.",
    ],
  };
}

export type LeaveReport = ReturnType<typeof buildLeaveReport>;

// Adapted from OpenHRApp Reports.tsx getCleanReportData/downloadCSV (MIT).
// Projection is Leave-only; cells additionally neutralize spreadsheet formulas.
export function leaveReportCsv(report: LeaveReport): string {
  const cells: unknown[][] = [
    [
      "Reference",
      "Employee",
      "Status",
      "Selected dates",
      "Declared days",
      "Dates in period",
      "Emergency",
      "Quota treatment",
      "Created",
      "Latest decision",
      "Auto submitted",
      "Usage confirmed",
    ],
  ];
  for (const row of report.register)
    cells.push([
      row.requestNo ?? row.id,
      row.agentName,
      row.status,
      row.dates.join("; "),
      row.daysCount,
      row.datesInPeriod.length,
      row.isEmergency ? "Yes" : "No",
      row.deductQuota === false ? "Exempt" : "Deducting",
      row.createdAt,
      row.decidedAt,
      row.autoSubmittedAt,
      row.usedConfirmedAt,
    ]);
  const csvCell = (value: unknown) => {
    let text = String(value ?? "");
    const firstVisible = Array.from(text).find((character) => character.charCodeAt(0) > 32 && character.trim() !== "");
    if ((firstVisible && "=+@-".includes(firstVisible)) || ["\t", "\r", "\n"].includes(text.charAt(0)))
      text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  return `\uFEFF${cells.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}
