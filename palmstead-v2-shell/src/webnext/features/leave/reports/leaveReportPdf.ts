import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { LeaveReport } from "./leaveReport";

// Export projection and autoTable flow adapted from OpenHRApp Reports.tsx,
// blob 231d35b343af228f5cdf4e794c2e4fda23518719, MIT (see notices).
// Palmstead changes: Leave-only reconciliations, exact dates, privacy,
// aspect-preserving logo, repeated headers/footers and history qualifications.
const ink: [number, number, number] = [11, 30, 61];
const muted: [number, number, number] = [78, 94, 111];
const plain = (value: unknown) =>
  String(value ?? "Not recorded")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"');

export function createLeaveReportPdf(report: LeaveReport, logo: string | null) {
  if (!report.snapshot.eventsComplete)
    throw new Error("The workflow event response is incomplete. A full PDF pack cannot be generated.");
  const management = report.snapshot.scope === "management";
  const doc = new jsPDF({ orientation: management ? "landscape" : "portrait", unit: "mm", format: "a4", compress: true });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 16;
  const scope = management ? "Management - internal" : "Personal - private";
  const title = management ? "Company leave report" : "Personal leave statement";
  const generated = new Date(report.snapshot.generatedAt).toLocaleString("en-GB", {
    timeZone: "Africa/Accra",
    hour12: false,
  });
  let cursor = 61;
  doc.setProperties({ title, subject: `${report.filters.year} Leave report - ${scope}`, creator: "Palmstead" });
  const text = (value: string, size = 9) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    doc.setTextColor(...muted);
    const lines = doc.splitTextToSize(plain(value), width - margin * 2) as string[];
    for (const line of lines) {
      if (cursor > height - 24) {
        doc.addPage();
        cursor = 61;
      }
      doc.text(line, margin, cursor);
      cursor += size * 0.45 + 1;
    }
    cursor += 3;
  };
  const section = (name: string, description: string) => {
    if (cursor > height - 58) {
      doc.addPage();
      cursor = 61;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...ink);
    doc.text(name, margin, cursor);
    cursor += 7;
    text(description, 8.5);
  };
  const table = (headers: string[], rows: unknown[][]) => {
    if (!rows.length) {
      text("No matching records.");
      return;
    }
    autoTable(doc, {
      startY: cursor,
      head: [headers],
      body: rows.map((row) => row.map(plain)),
      margin: { top: 61, bottom: 21, left: margin, right: margin },
      styles: {
        font: "helvetica",
        fontSize: 8,
        cellPadding: 2.3,
        overflow: "linebreak",
        textColor: ink,
        lineColor: [222, 227, 232],
        lineWidth: 0.1,
      },
      headStyles: { fillColor: ink, textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [246, 248, 250] },
      rowPageBreak: "avoid",
      showHead: "everyPage",
    });
    cursor = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  };

  section(
    "01 / Scope and reconciliation",
    "Current-state report. Figures below are informational and do not approve or decline leave.",
  );
  text(
    `Activity window: ${report.bounds.start} to ${report.bounds.end} (inclusive selected dates). Cohort: ${report.filters.cohort}; employee: ${report.filters.employee === "all" ? "All authorized employees" : report.people.map((person) => person.name).join(", ")}; register status: ${report.filters.status}.`,
  );
  text(
    `Annual policy: ${report.snapshot.annualDays} days per eligible employee. Current company policy is shown; historical allocations are unavailable. Annual balances cover the full year ${report.filters.year}, independently of activity filters.`,
  );
  table(
    [
      "Employees in scope",
      "Annual reserved days",
      "Confirmed-used quota days",
      "Requests in activity window",
      "Records with data issues",
    ],
    [[report.people.length, report.totalReserved, report.totalConfirmed, report.register.length, report.qualityCount]],
  );
  section(
    "02 / Annual balance statement",
    "Confirmed used is included within reserved days. It is not deducted a second time. Blank historical eligibility is shown as 'Not recorded'.",
  );
  if (management)
    table(
      [
        "Employee / current department",
        "Policy",
        "Planned",
        "Pending",
        "Approved",
        "Rescheduled",
        "Reserved",
        "Used",
        "Available",
        "Exempt",
        "Over",
      ],
      report.balances.map((row) => [
        `${row.name}\n${row.department ?? "Department not recorded"}${row.active ? "" : " / inactive or former"}`,
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
      ]),
    );
  else
    for (const row of report.balances)
      table(
        [row.name, "Days"],
        [
          ["Current annual policy", row.allowance],
          ["Planned", row.planned],
          ["Pending", row.pending],
          ["Approved", row.approved],
          ["Rescheduled", row.rescheduled],
          ["Total reserved", row.reserved],
          ["Confirmed used (within reserved)", row.confirmedUsed],
          ["Available", row.available],
          ["Quota-exempt", row.exempt],
          ["Over-reserved", row.overReserved],
        ],
      );
  section(
    "03 / Request register",
    "Exact selected dates are listed. Gaps between dates are not leave. Total is the recorded number of leave days; window is the number of valid distinct dates inside the selected period.",
  );
  table(
    [
      "Reference / employee",
      "Current status",
      "Selected dates",
      "Total / window days",
      "Quota / emergency",
      "Latest decision",
    ],
    report.register.map((row) => [
      `${row.requestNo ?? row.id}\n${row.agentName}`,
      row.status,
      row.dates.join(", "),
      `${row.daysCount} / ${row.datesInPeriod.length}`,
      `${row.deductQuota === false ? "Exempt" : "Deducting"}${row.isEmergency ? " / emergency" : ""}`,
      row.decidedAt ? `${row.decidedAt}\n${row.decidedByName ?? "Actor not recorded"}` : "Not recorded",
    ]),
  );
  section(
    "04 / Monthly comparison",
    `Approved scheduled employee-dates, deduplicated per employee and date. Same month range in ${report.filters.year - 1}. Current statuses apply; future schedules may be included. This is not a performance ranking.`,
  );
  table(
    ["Month", `${report.filters.year}`, `${report.filters.year - 1}`, "Change (days)", "Change (%)"],
    report.months.map((row) => [
      String(row.month).padStart(2, "0"),
      row.current,
      row.previous,
      row.difference,
      row.percentage === null ? "No prior base" : `${row.percentage.toFixed(1)}%`,
    ]),
  );
  section(
    "05 / Selected-date coverage",
    "Approved and tentative are distinct employee counts. Tentative includes planned, pending and rescheduled records. Overlap may be intentional for an emergency.",
  );
  const personName = (key: string) => report.people.find((person) => person.key === key)?.name ?? key;
  table(
    ["Date", "Employees", "Approved", "Tentative", "Overlap"],
    report.coverage.map((row) => [
      row.date,
      row.employees.map(personName).join(", "),
      row.approved,
      row.tentative,
      row.overlap ? "Review coverage" : "No",
    ]),
  );
  section(
    "06 / Exceptions and actions",
    "Annual review items. A missing usage confirmation is not proof of absence. Data issues qualify date-based figures; recorded reservation counts are retained.",
  );
  table(
    ["Reference", "Employee", "Review item"],
    report.exceptions.map((row) => [row.reference, row.employee, row.message]),
  );
  section(
    "07 / Recorded workflow history",
    "Legacy event coverage is incomplete. These are available recorded events, not a complete leave ledger. Private notes are excluded.",
  );
  if (!report.snapshot.eventsComplete)
    text("Event response limit reached. The history table is incomplete; do not treat it as a full audit export.");
  table(
    ["Request", "Timestamp", "Actor key", "From", "To"],
    report.events.map((event) => [
      report.snapshot.requests.find((request) => request.id === event.requestId)?.requestNo ?? event.requestId,
      event.createdAt,
      event.actorKey,
      event.fromStatus ?? "Created",
      event.toStatus,
    ]),
  );
  section("08 / Definitions and limitations", "Read these together with the figures and source records.");
  for (const definition of report.definitions) text(definition, 8.5);
  text(
    "Reminder dispatch reliability is available to Management in Leave > Management > Reminders. Its all-time totals are separate from this activity window. Provider acceptance does not prove delivery to a handset.",
    8.5,
  );
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    let textX = margin;
    if (logo)
      try {
        const image = doc.getImageProperties(logo);
        const factor = Math.min(22 / image.width, 22 / image.height);
        doc.addImage(logo, "PNG", margin, 12, image.width * factor, image.height * factor);
        textX += 28;
      } catch {
        /* Text identity remains available when the asset cannot be decoded. */
      }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...ink);
    doc.text("PALMSTEAD / PEP LANDBANK", textX, 18);
    doc.setFontSize(18);
    doc.text(title, textX, 28);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    doc.text(`${scope} | Year ${report.filters.year} | Ghana time (UTC)`, margin, 43);
    doc.text(`Generated ${generated}`, width - margin, 43, { align: "right" });
    doc.setDrawColor(201, 162, 39);
    doc.setLineWidth(0.8);
    doc.line(margin, 49, width - margin, 49);
    doc.setDrawColor(211, 217, 223);
    doc.setLineWidth(0.2);
    doc.line(margin, height - 16, width - margin, height - 16);
    doc.setFontSize(7.5);
    doc.text(`${scope} | Informational snapshot`, margin, height - 10);
    doc.text(`Page ${page} of ${pages}`, width - margin, height - 10, { align: "right" });
  }
  return doc;
}
