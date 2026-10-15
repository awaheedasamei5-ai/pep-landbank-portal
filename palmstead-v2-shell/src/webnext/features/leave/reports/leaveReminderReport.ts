import type { ReportQuery } from "./leaveReport";

export const reminderStatuses = ["queued", "sending", "accepted", "failed", "needs_review"] as const;
export type ReminderStatus = (typeof reminderStatuses)[number];
export const reminderStatusLabels: Record<ReminderStatus, string> = {
  queued: "Queued",
  sending: "Sending",
  accepted: "Provider accepted",
  failed: "Failed",
  needs_review: "Uncertain — review required",
};
export type ReminderView = "overview" | "comparison" | "messages";
export interface ReminderRow {
  id: string;
  requestId: string;
  reference: string;
  requestExists: boolean;
  ownerKey: string | null;
  ownerName: string;
  recipientName: string;
  relationship: "owner" | "other" | "unavailable";
  event: string;
  status: ReminderStatus;
  attempts: number;
  createdAt: string;
  acceptedAt: string | null;
  retriedAt: string | null;
  nextAttemptAt: string | null;
}
interface ReminderCohort {
  from: string;
  to: string;
  total: number;
  complete: boolean;
  rows: ReminderRow[];
}
export interface ReminderSnapshot {
  generatedAt: string;
  comparisonMode: "previous_period" | "previous_year";
  current: ReminderCohort;
  previous: ReminderCohort;
}
export interface ReminderFilters {
  from: string;
  to: string;
  employee: string;
  status: "all" | ReminderStatus;
  relationship: "all" | ReminderRow["relationship"];
  compare: ReminderSnapshot["comparisonMode"];
}
export const relationshipLabels = {
  all: "All recipients",
  owner: "Request owner",
  other: "Other recipient",
  unavailable: "Relationship unavailable",
};
export function validReportDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number(value.slice(0, 4)) >= 1900 &&
    Number(value.slice(0, 4)) <= 2199 &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
  );
}
export function reminderFilterError(filters: ReminderFilters): string {
  if (!validReportDate(filters.from) || !validReportDate(filters.to) || filters.from < "1901-01-01")
    return "Choose valid start and end dates.";
  const days = (Date.parse(filters.to) - Date.parse(filters.from)) / 86400000;
  return days < 0 || days > 365 ? "The end date must follow the start, within a maximum of 366 days." : "";
}
export function parseReminderFilters(query: ReportQuery, today: string): ReminderFilters {
  const one = (key: string) => (typeof query[key] === "string" ? String(query[key]) : "");
  return {
    from: one("from") || `${today.slice(0, 4)}-01-01`,
    to: one("to") || today,
    employee: one("employee").slice(0, 120) || "all",
    status: reminderStatuses.find((status) => status === one("status")) ?? "all",
    relationship: (["owner", "other", "unavailable"] as const).find((value) => value === one("recipient")) ?? "all",
    compare: one("compare") === "previous_year" ? "previous_year" : "previous_period",
  };
}
export function reminderReportUrl(filters: ReminderFilters, view: ReminderView = "overview") {
  return `/dashboard/leave/management/reports/reminders?${new URLSearchParams({ ...filters, recipient: filters.relationship, view })}`;
}
export function buildReminderReport(snapshot: ReminderSnapshot, filters: ReminderFilters) {
  const error = reminderFilterError(filters);
  if (error) throw new Error(error);
  if (
    !snapshot.current.complete ||
    !snapshot.previous.complete ||
    snapshot.current.total !== snapshot.current.rows.length ||
    snapshot.previous.total !== snapshot.previous.rows.length
  )
    throw new Error("The reminder response is incomplete. Narrow the dates before reporting or downloading.");
  if (
    snapshot.current.from !== filters.from ||
    snapshot.current.to !== filters.to ||
    snapshot.comparisonMode !== filters.compare
  )
    throw new Error("The reminder snapshot does not match the selected dates. Refresh the report.");
  const matches = (row: ReminderRow) =>
    (filters.employee === "all" || row.ownerKey === filters.employee) &&
    (filters.status === "all" || row.status === filters.status) &&
    (filters.relationship === "all" || row.relationship === filters.relationship);
  const current = snapshot.current.rows.filter(matches);
  const previous = snapshot.previous.rows.filter(matches);
  const count = (rows: ReminderRow[], status: ReminderStatus) => rows.filter((row) => row.status === status).length;
  const comparison = reminderStatuses.map((status) => {
    const now = count(current, status);
    const prior = count(previous, status);
    return {
      status,
      current: now,
      previous: prior,
      difference: now - prior,
      percentage: prior ? ((now - prior) / prior) * 100 : null,
    };
  });
  const accepted = count(current, "accepted");
  const attention = current.filter((row) => row.status === "failed" || row.status === "needs_review").length;
  const employeeOptions = [
    ...new Map(
      [...snapshot.current.rows, ...snapshot.previous.rows]
        .filter((row) => row.ownerKey)
        .map((row) => [row.ownerKey as string, row.ownerName]),
    ).entries(),
  ]
    .map(([key, name]) => ({ key, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const employeeLabel =
    filters.employee === "all"
      ? "All request owners"
      : (employeeOptions.find((person) => person.key === filters.employee)?.name ??
        "Selected owner (no matching messages)");
  return {
    snapshot,
    filters,
    current,
    previous,
    comparison,
    accepted,
    attention,
    employeeOptions,
    employeeLabel,
    acceptedPercentage: current.length ? (accepted / current.length) * 100 : null,
    requests: new Set(current.map((row) => row.requestId)).size,
    definitions: [
      "Cohorts use message creation (queue) timestamps in Ghana time, inclusive of both dates. These are not leave dates or send-time cohorts.",
      "Each recipient message counts separately. All statuses are current at the snapshot time; they may change after the cohort period.",
      "Provider accepted means accepted by the SMS service, not handset delivery. No delivery or read receipts are recorded here.",
      "Names are current profile labels. Recipient relationship is based on the current request owner; historical roles and schedule snapshots are unavailable.",
      "Attempts are current-cycle counters and can reset when a failed message is queued again. They are not lifetime attempts or a send-history ledger.",
      "The same employee, recipient and status filters apply to both comparison cohorts. Status-filtered percentages describe the filtered cohort, not overall reliability.",
      "Previous period uses the immediately preceding equal number of days. Same dates last year clamps February 29 to February 28; exact bounds are printed.",
      "Messages whose source request is missing remain in all-owner totals under an unavailable owner. An employee filter excludes those unassignable messages.",
    ],
  };
}
export type ReminderReport = ReturnType<typeof buildReminderReport>;
export function reminderSectionData(report: ReminderReport, view: ReminderView) {
  if (view === "messages")
    return {
      headers: [
        "Message reference",
        "Request reference",
        "Request owner",
        "Recipient",
        "Relationship",
        "Event",
        "Current status",
        "Queued Ghana UTC",
        "Current-cycle attempts",
        "Provider accepted Ghana UTC",
        "Latest manual retry Ghana UTC",
        "Next attempt Ghana UTC",
      ],
      rows: report.current.map((row) => [
        row.id,
        row.reference,
        row.ownerName,
        row.recipientName,
        relationshipLabels[row.relationship],
        row.event,
        reminderStatusLabels[row.status],
        row.createdAt,
        row.attempts,
        row.acceptedAt,
        row.retriedAt,
        row.nextAttemptAt,
      ]) as unknown[][],
    };
  if (view === "comparison")
    return {
      headers: ["Current status", "Current messages", "Comparison messages", "Change messages", "Change percent"],
      rows: report.comparison.map((row) => [
        reminderStatusLabels[row.status],
        row.current,
        row.previous,
        row.difference,
        row.percentage,
      ]) as unknown[][],
    };
  return {
    headers: ["Measure", "Value", "Meaning"],
    rows: [
      ["Messages in scope", report.current.length, "One row per recipient message"],
      ["Source requests", report.requests, "Distinct stored request references"],
      ["Provider accepted", report.accepted, "No handset delivery evidence"],
      ["Provider acceptance percent", report.acceptedPercentage, "Among matched current-status records"],
      ["Needs attention", report.attention, "Failed or uncertain; review operational monitor"],
      [
        "Comparison messages",
        report.previous.length,
        `${report.snapshot.previous.from} to ${report.snapshot.previous.to}`,
      ],
    ] as unknown[][],
  };
}
export function reminderReportCsv(report: ReminderReport, view: ReminderView) {
  const data = reminderSectionData(report, view);
  const metadata = [
    view,
    report.snapshot.generatedAt,
    report.filters.from,
    report.filters.to,
    report.snapshot.previous.from,
    report.snapshot.previous.to,
    report.employeeLabel,
    report.filters.status,
    relationshipLabels[report.filters.relationship],
  ];
  const rows = [
    [
      "Report section",
      "Generated Ghana UTC",
      "Queued from",
      "Queued to",
      "Comparison from",
      "Comparison to",
      "Owner filter",
      "Status filter",
      "Recipient filter",
      ...data.headers,
    ],
    ...data.rows.map((row) => [...metadata, ...row]),
  ];
  const cell = (value: unknown) => {
    let text = String(value ?? "");
    const firstVisible = Array.from(text).find((character) => character.charCodeAt(0) > 32 && character.trim() !== "");
    if (
      typeof value !== "number" &&
      ((firstVisible && "=+@-".includes(firstVisible)) || ["\t", "\r", "\n"].includes(text.charAt(0)))
    )
      text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  return `\uFEFF${rows.map((row) => row.map(cell).join(",")).join("\r\n")}`;
}
