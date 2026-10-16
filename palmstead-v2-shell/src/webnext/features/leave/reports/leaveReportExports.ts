import type { LeaveReport, ReportSection } from "./leaveReport";
import { changedFieldLabels, journalDates, journalKindLabels } from "./leaveJournal";

export function reportSectionData(
  report: LeaveReport,
  section: ReportSection,
): { headers: string[]; rows: unknown[][] } {
  if (section === "balances")
    return {
      headers: [
        "Employee",
        "Current department",
        "Active",
        "Current policy",
        "Planned",
        "Pending",
        "Approved",
        "Rescheduled",
        "Reserved",
        "Confirmed used",
        "Available",
        "Exempt",
        "Over reserved",
        "Quality records",
      ],
      rows: report.balances.map((row) => [
        row.name,
        row.department,
        row.active,
        row.allowance,
        row.planned,
        row.pending,
        row.approved,
        row.rescheduled,
        row.reserved,
        row.confirmedUsed,
        row.available,
        row.exempt,
        row.overReserved,
        row.qualityIssues,
      ]),
    };
  if (section === "requests")
    return {
      headers: [
        "Reference",
        "Employee",
        "Status",
        "Exact selected dates",
        "Declared days",
        "Days in period",
        "Emergency",
        "Quota treatment",
        "Created",
        "Auto submitted",
        "Latest decision",
        "Decision by",
        "Usage confirmed",
      ],
      rows: report.register.map((row) => [
        row.requestNo ?? row.id,
        row.agentName,
        row.status,
        row.dates.join("; "),
        row.daysCount,
        row.datesInPeriod.length,
        row.isEmergency,
        row.deductQuota === false ? "Exempt" : "Deducting",
        row.createdAt,
        row.autoSubmittedAt,
        row.decidedAt,
        row.decidedByName,
        row.usedConfirmedAt,
      ]),
    };
  if (section === "trends")
    return {
      headers: [
        "Current month",
        "Comparison month",
        "Current approved employee dates",
        "Comparison approved employee dates",
        "Difference days",
        "Percentage change",
      ],
      rows: report.months.map((row) => [
        `${report.filters.year}-${String(row.month).padStart(2, "0")}`,
        row.previousMonth,
        row.current,
        row.previous,
        row.difference,
        row.percentage,
      ]),
    };
  if (section === "coverage")
    return {
      headers: ["Selected date", "Employees", "Approved employees", "Tentative employees", "Overlap"],
      rows: report.coverage.map((row) => [
        row.date,
        row.employees.map((key) => report.people.find((person) => person.key === key)?.name ?? key).join("; "),
        row.approved,
        row.tentative,
        row.overlap,
      ]),
    };
  if (section === "exceptions")
    return {
      headers: ["Reference", "Employee", "Annual review item"],
      rows: report.exceptions.map((row) => [row.reference, row.employee, row.message]),
    };
  if (section === "history") {
    if (!report.snapshot.eventsComplete || !report.journal.complete)
      throw new Error("Recorded history is incomplete. Refresh or narrow the server history scope before exporting.");
    return {
      headers: [
        "Evidence source",
        "Event reference",
        "Request reference",
        "Stored owner",
        "Recorded timestamp",
        "Actor",
        "Change",
        "Changed fields",
        "Before status",
        "After status",
        "Before year",
        "After year",
        "Before selected dates",
        "After selected dates",
        "Before declared days",
        "After declared days",
        "Before quota deduction",
        "After quota deduction",
        "Before emergency",
        "After emergency",
        "Before decision timestamp",
        "After decision timestamp",
        "Before automatic submission",
        "After automatic submission",
        "Before usage confirmation",
        "After usage confirmation",
        "Submission event",
        "Cycle submitted",
        "Cycle calendar seconds",
      ],
      rows: [
        ...report.journal.events.map((event) => [
          event.kind === "baseline"
            ? "Installation observation; earlier history unknown"
            : "Transactional change journal",
          event.eventId,
          event.reference,
          event.ownerName,
          event.capturedAt,
          event.actorName,
          journalKindLabels[event.kind] ?? event.kind,
          changedFieldLabels(event),
          event.beforeState?.status,
          event.afterState?.status,
          event.beforeState?.year,
          event.afterState?.year,
          journalDates(event.beforeState),
          journalDates(event.afterState),
          event.beforeState?.days,
          event.afterState?.days,
          event.beforeState?.deductQuota,
          event.afterState?.deductQuota,
          event.beforeState?.isEmergency,
          event.afterState?.isEmergency,
          event.beforeState?.decidedAt,
          event.afterState?.decidedAt,
          event.beforeState?.autoSubmittedAt,
          event.afterState?.autoSubmittedAt,
          event.beforeState?.usedConfirmedAt,
          event.afterState?.usedConfirmedAt,
          event.submissionEventId,
          event.cycleSubmittedAt,
          report.journal.timedIds.has(event.eventId) ? event.cycleSeconds : null,
        ]),
        ...report.events.map((event) => [
          "Legacy status log; no schedule snapshot",
          null,
          report.snapshot.requests.find((row) => row.id === event.requestId)?.requestNo ?? event.requestId,
          report.snapshot.requests.find((row) => row.id === event.requestId)?.agentName,
          event.createdAt,
          event.actorKey,
          "Legacy status change",
          null,
          event.fromStatus,
          event.toStatus,
          ...Array.from({ length: 19 }, () => null),
        ]),
      ],
    };
  }
  return {
    headers: ["Measure or insight", "Value", "Explanation"],
    rows: [
      ["Annual reserved days", report.totalReserved, "Full selected year and employee/department cohort"],
      ["Confirmed used quota days", report.totalConfirmed, "Subset of reserved; not deducted twice"],
      [
        "Approved activity employee dates",
        report.approvedComparison.current,
        `${report.bounds.start} to ${report.bounds.end}`,
      ],
      ["Comparison employee dates", report.approvedComparison.previous, `${report.prior.start} to ${report.prior.end}`],
      ...report.insights.map((row) => [row.title, null, row.detail]),
    ],
  };
}

export function reportSectionCsv(report: LeaveReport, section: ReportSection) {
  const data = reportSectionData(report, section);
  const metaHeaders = [
    "Report section",
    "Generated Ghana UTC",
    "Report year",
    "Activity from",
    "Activity to",
    "Employee cohort",
    "Current department filter",
    "Status filter",
    "Emergency filter",
    "Quota filter",
    "Comparison from",
    "Comparison to",
    "History qualification",
  ];
  const meta = [
    section,
    report.snapshot.generatedAt,
    report.filters.year,
    report.bounds.start,
    report.bounds.end,
    report.filters.employee,
    report.filters.department ?? "all",
    report.filters.status,
    report.filters.emergency ?? "all",
    report.filters.quota ?? "all",
    report.prior.start,
    report.prior.end,
    "Current snapshot; legacy workflow and policy history incomplete",
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
  return `\uFEFF${[[...metaHeaders, ...data.headers], ...data.rows.map((row) => [...meta, ...row])].map((row) => row.map(cell).join(",")).join("\r\n")}`;
}
