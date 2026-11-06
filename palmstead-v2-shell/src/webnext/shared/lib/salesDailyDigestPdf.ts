import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import { loadImageAsDataUri } from "./image";
import { PDF_INK, pdfAccentStatRow, pdfBrandedHeader, pdfReportFooter, pdfSectionTitle } from "./pdfReport";
import { type DigestItem, type DigestRun, type DigestStaff, digestTotals } from "./salesDailyDigest";

const text = (item: DigestItem, field: string) => String(item[field] ?? "—");
const ghanaStamp = (item: DigestItem, field: string) => {
  const value = item[field];
  if (typeof value !== "string" || !value) return "—";
  const time = new Date(value);
  return Number.isNaN(time.getTime())
    ? "—"
    : time.toLocaleString("en-GB", {
        timeZone: "Africa/Accra",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
};
const money = (amount: number) =>
  `GHS ${amount.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function table(doc: jsPDF, headers: string[], body: string[][]): void {
  autoTable(doc, {
    startY: 27,
    head: [headers],
    body: body.length ? body : [["No records", ...headers.slice(1).map(() => "—")]],
    margin: { left: 12, right: 12, top: 18, bottom: 20 },
    styles: { fontSize: 8, cellPadding: 2.7, overflow: "linebreak", valign: "top" },
    headStyles: { fillColor: PDF_INK, textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [246, 248, 250] },
    showHead: "everyPage",
  });
}

function section(doc: jsPDF, title: string, headers: string[], body: string[][]): void {
  doc.addPage();
  pdfSectionTitle(doc, 19, doc.internal.pageSize.getWidth(), title);
  table(doc, headers, body);
}

const rows = (
  staff: DigestStaff[],
  field: keyof DigestStaff,
  render: (person: DigestStaff, item: DigestItem) => string[],
) => staff.flatMap((person) => (person[field] as DigestItem[]).map((item) => render(person, item)));

export async function buildSalesDailyDigestPdf(run: DigestRun, author: string): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  let logo: string | null = null;
  try {
    logo = await loadImageAsDataUri("/trulander-logo.png");
  } catch {
    /* Text brand remains. */
  }
  let y = pdfBrandedHeader(
    doc,
    "DAILY MANAGEMENT REPORT",
    `${run.local_date}  |  ${run.kind === "morning" ? "Morning plan" : "Evening results"}`,
    ["PEP Landbank", `Prepared by ${author}`],
    logo,
  );
  const total = digestTotals(run.snapshot);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...PDF_INK);
  doc.text(
    `Snapshot captured ${new Date(run.generated_at).toLocaleString("en-GB", { timeZone: "Africa/Accra" })} Ghana time.`,
    12,
    y + 5,
  );
  y += 15;
  y = pdfAccentStatRow(doc, y, doc.internal.pageSize.getWidth(), [
    { label: "STAFF", value: String(run.snapshot.staff.length) },
    {
      label: run.kind === "morning" ? "TASKS PLANNED" : "TASKS COMPLETED",
      value: String(run.kind === "morning" ? total.tasks : total.tasksCompleted),
    },
    {
      label: run.kind === "morning" ? "FOLLOW-UPS DUE" : "GENUINE CALLS",
      value: String(run.kind === "morning" ? total.followUps : total.calls),
    },
    {
      label: run.kind === "morning" ? "SITE VISITS" : "NEW LEADS",
      value: String(run.kind === "morning" ? total.visitsScheduled : total.newLeads),
    },
    ...(run.kind === "evening" ? [{ label: "OPEN TODAY", value: String(total.tasksOpenToday) }] : []),
  ]);
  y = pdfSectionTitle(
    doc,
    y + 10,
    doc.internal.pageSize.getWidth(),
    "Staff overview",
    "Values are attributed to the staff who owns or recorded each item.",
  );
  autoTable(doc, {
    startY: y + 3,
    head: [["Staff", "Planned", "Done", "Overdue", "Calls", "Leads", "Visits", "Receipts"]],
    body: run.snapshot.staff.map((person) => [
      person.name,
      person.tasks.length,
      person.tasksCompletedToday.length,
      person.tasksMissed.length,
      person.calls.length,
      person.newLeads.length,
      person.visitRequests.length,
      money(person.approvedReceipts.reduce((sum, item) => sum + Number(item.amount || 0), 0)),
    ]),
    margin: { left: 12, right: 12, top: 18, bottom: 20 },
    styles: { fontSize: 7.2, cellPadding: 2.2, overflow: "linebreak" },
    headStyles: { fillColor: PDF_INK, textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [246, 248, 250] },
  });
  if (run.kind === "morning") {
    section(
      doc,
      "Scheduled tasks",
      ["Staff", "Task", "Start", "Status"],
      rows(run.snapshot.staff, "tasks", (person, item) => [
        person.name,
        text(item, "title"),
        text(item, "start"),
        text(item, "status"),
      ]),
    );
    section(
      doc,
      "Follow-ups and next actions",
      ["Staff", "Client", "Action"],
      [
        ...rows(run.snapshot.staff, "followUps", (person, item) => [
          person.name,
          text(item, "client"),
          text(item, "action"),
        ]),
        ...rows(run.snapshot.staff, "leadNextActions", (person, item) => [
          person.name,
          text(item, "client"),
          text(item, "action"),
        ]),
      ],
    );
    section(
      doc,
      "Site visits scheduled",
      ["Staff", "Client", "Time", "Status"],
      rows(run.snapshot.staff, "visitsScheduled", (person, item) => [
        person.name,
        text(item, "client"),
        text(item, "time"),
        text(item, "status"),
      ]),
    );
    section(
      doc,
      "Sales activity so far",
      ["Staff", "Client", "Event", "Detail"],
      [
        ...rows(run.snapshot.staff, "calls", (person, item) => [
          person.name,
          text(item, "client"),
          "Call",
          text(item, "outcome"),
        ]),
        ...rows(run.snapshot.staff, "newLeads", (person, item) => [
          person.name,
          text(item, "client"),
          "New lead",
          text(item, "source"),
        ]),
        ...rows(run.snapshot.staff, "approvedReceipts", (person, item) => [
          person.name,
          text(item, "client"),
          "Approved receipt",
          money(Number(item.amount ?? 0)),
        ]),
      ],
    );
  } else {
    section(
      doc,
      "Genuine calls logged",
      ["Staff", "Client", "Outcome", "Time"],
      rows(run.snapshot.staff, "calls", (person, item) => [
        person.name,
        text(item, "client"),
        text(item, "outcome"),
        ghanaStamp(item, "at"),
      ]),
    );
    section(
      doc,
      "New leads and visit requests",
      ["Staff", "Client", "Event", "Detail"],
      [
        ...rows(run.snapshot.staff, "newLeads", (person, item) => [
          person.name,
          text(item, "client"),
          "New lead",
          text(item, "source"),
        ]),
        ...rows(run.snapshot.staff, "visitRequests", (person, item) => [
          person.name,
          text(item, "client"),
          "Visit requested",
          text(item, "visitDate"),
        ]),
      ],
    );
    section(
      doc,
      "Other logged activity",
      ["Staff", "Client", "Event", "Time"],
      rows(run.snapshot.staff, "otherActivity", (person, item) => [
        person.name,
        text(item, "client"),
        text(item, "action"),
        ghanaStamp(item, "at"),
      ]),
    );
    section(
      doc,
      "Tasks completed, open and overdue",
      ["Staff", "Task", "Result", "Timestamp"],
      [
        ...rows(run.snapshot.staff, "tasksCompletedToday", (person, item) => [
          person.name,
          text(item, "title"),
          "Completed",
          ghanaStamp(item, "completedAt"),
        ]),
        ...run.snapshot.staff.flatMap((person) =>
          person.tasks
            .filter((item) => item.status === "open")
            .map((item) => [person.name, text(item, "title"), "Open today", text(item, "start")]),
        ),
        ...rows(run.snapshot.staff, "tasksMissed", (person, item) => [
          person.name,
          text(item, "title"),
          "Overdue",
          text(item, "dueDate"),
        ]),
      ],
    );
    section(
      doc,
      "Approved client receipts",
      ["Staff", "Client", "Amount", "Receipt"],
      rows(run.snapshot.staff, "approvedReceipts", (person, item) => [
        person.name,
        text(item, "client"),
        money(Number(item.amount ?? 0)),
        text(item, "receipt"),
      ]),
    );
  }
  pdfReportFooter(doc, "PEP Landbank | Daily management report");
  return doc;
}
