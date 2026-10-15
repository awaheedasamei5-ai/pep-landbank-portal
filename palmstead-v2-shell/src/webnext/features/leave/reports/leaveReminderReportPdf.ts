import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { reminderSectionData, type ReminderReport, type ReminderView } from "./leaveReminderReport";

// Adapted from the existing Leave report layout and its OpenHRApp MIT
// projection/autoTable flow. See THIRD_PARTY_NOTICES for source provenance.
const ink: [number, number, number] = [11, 30, 61];
const muted: [number, number, number] = [78, 94, 111];
const plain = (value: unknown) =>
  String(value ?? "Not recorded")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"');
export function createReminderReportPdf(
  report: ReminderReport,
  logo: string | null,
  view: ReminderView | "full" = "full",
) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 16;
  let cursor = 57;
  const generated = new Date(report.snapshot.generatedAt).toLocaleString("en-GB", {
    timeZone: "Africa/Accra",
    hour12: false,
  });
  doc.setProperties({
    title: "Leave reminder report",
    subject: `${report.filters.from} to ${report.filters.to} - Management internal`,
    creator: "Palmstead",
  });
  function text(value: string, size = 9) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    doc.setTextColor(...muted);
    for (const line of doc.splitTextToSize(plain(value), width - margin * 2) as string[]) {
      if (cursor > height - 25) {
        doc.addPage();
        cursor = 57;
      }
      doc.text(line, margin, cursor);
      cursor += size * 0.45 + 1;
    }
    cursor += 3;
  }
  function heading(value: string) {
    if (cursor > height - 50) {
      doc.addPage();
      cursor = 57;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...ink);
    doc.text(value, margin, cursor);
    cursor += 8;
  }
  const dateColumns = new Set([
    "Queued Ghana UTC",
    "Provider accepted Ghana UTC",
    "Latest manual retry Ghana UTC",
    "Next attempt Ghana UTC",
  ]);
  function table(section: ReminderView, retryDetails = false) {
    const data = reminderSectionData(report, section);
    if (!data.rows.length) {
      text("No messages were queued in this period and scope.");
      return;
    }
    const time = (value: unknown) =>
      value ? new Date(String(value)).toLocaleString("en-GB", { timeZone: "Africa/Accra", hour12: false }) : null;
    // Split the wide register into readable operational and reference tables.
    const omit =
      section === "messages" ? new Set(retryDetails ? [2, 4, 5, 6, 7, 8, 9] : [0, 10, 11]) : new Set<number>();
    autoTable(doc, {
      startY: cursor,
      head: [data.headers.filter((_, i) => !omit.has(i))],
      body: data.rows.map((row) =>
        row.flatMap((value, i) => (omit.has(i) ? [] : [plain(dateColumns.has(data.headers[i]) ? time(value) : value)])),
      ),
      margin: { top: 57, bottom: 22, left: margin, right: margin },
      styles: {
        font: "helvetica",
        fontSize: 8,
        cellPadding: 2.3,
        overflow: "linebreak",
        textColor: ink,
        lineWidth: 0.1,
        lineColor: [222, 227, 232],
      },
      headStyles: { fillColor: ink, textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [246, 248, 250] },
      rowPageBreak: "avoid",
      showHead: "everyPage",
    });
    cursor = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  }
  heading("01 / Scope and evidence");
  text(
    `Queued from ${report.filters.from} to ${report.filters.to}, inclusive Ghana UTC dates. Owner: ${report.employeeLabel}. Current outcome: ${report.filters.status}; recipient relationship: ${report.filters.relationship}.`,
  );
  text(
    `Comparison: ${report.snapshot.previous.from} to ${report.snapshot.previous.to}; ${report.filters.compare === "previous_year" ? "same dates last year (leap-day clamp)" : "previous equal number of days"}. Included: ${view === "full" ? "Overview, Comparison and Messages" : view}. Generated ${generated} Ghana UTC.`,
  );
  text(
    "Provider acceptance does not establish handset delivery. This report sends no messages and does not approve or decline leave.",
  );
  if (view === "full" || view === "overview") {
    heading("02 / Reminder overview");
    table("overview");
  }
  if (view === "full" || view === "comparison") {
    heading("03 / Current outcomes compared");
    text(
      "Counts describe current outcomes of messages queued in each period, with the same filters. No percentage is available with a zero comparison base.",
    );
    table("comparison");
  }
  if (view === "full" || view === "messages") {
    heading("04 / Contributing message records");
    text(
      "One record per recipient message. Names and relationships are current metadata. Full message references and retry schedules follow in the supporting table.",
    );
    table("messages");
    heading("Message references and retry schedule");
    table("messages", true);
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  const definitionHeight =
    8 +
    report.definitions.reduce(
      (sum, value) =>
        sum + (doc.splitTextToSize(plain(value), width - margin * 2) as string[]).length * (8.5 * 0.45 + 1) + 3,
      0,
    );
  if (cursor + definitionHeight > height - 25) {
    doc.addPage();
    cursor = 57;
  }
  heading("05 / Definitions and limitations");
  for (const definition of report.definitions) text(definition, 8.5);
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    if (logo) {
      const dimensions = doc.getImageProperties(logo);
      const markWidth = 22;
      const markHeight = (markWidth * dimensions.height) / dimensions.width;
      doc.addImage(logo, "PNG", margin, 12, markWidth, markHeight);
    }
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...ink);
    doc.setFontSize(8);
    doc.text("PALMSTEAD / PEP LANDBANK", margin + 28, 18);
    doc.setFontSize(16);
    doc.text("Leave reminder report", margin + 28, 28);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    doc.text(`Management - internal | ${report.filters.from} to ${report.filters.to} | Ghana UTC`, margin, 43);
    doc.text(`Generated ${generated}`, width - margin, 43, { align: "right" });
    doc.setDrawColor(180, 157, 53);
    doc.setLineWidth(0.7);
    doc.line(margin, 49, width - margin, 49);
    doc.setDrawColor(210, 216, 224);
    doc.setLineWidth(0.2);
    doc.line(margin, height - 18, width - margin, height - 18);
    doc.setFontSize(8);
    doc.text("Current-state informational snapshot | Provider acceptance is not delivery", margin, height - 12);
    doc.text(`Page ${page} of ${pages}`, width - margin, height - 12, { align: "right" });
  }
  return doc;
}
