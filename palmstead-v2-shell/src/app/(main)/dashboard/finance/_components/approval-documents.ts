import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

type ApprovalEvent = {
  event_type: string;
  from_status: string | null;
  to_status: string;
  note: string;
  occurred_at: string;
  actor_name: string;
};

type RequestDocument = {
  id: string;
  requester: string;
  department: string;
  category: string;
  purpose: string;
  amount: number;
  needed_by: string;
  status: string;
  revision: number;
  created_at: string;
  approved_budget_revision: number | null;
  approved_at: string | null;
  events: ApprovalEvent[];
};

type BudgetDocument = {
  id: string;
  department: string;
  category: string;
  fiscal_year: number;
  revision: number;
  amount: number;
  status: string;
  reason: string;
  activated_at: string | null;
  committed: number | null;
};

const money = (amount: number) => `GHS ${amount.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const stamp = (value: string | null) => value ? new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—";
const pretty = (value: string) => value.replaceAll("_", " ");

function cover(doc: jsPDF, title: string, reference: string, subtitle: string) {
  doc.setFillColor(18, 35, 49);
  doc.rect(0, 0, 210, 39, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("PALMSTEAD", 17, 18);
  doc.setFontSize(9);
  doc.text("INTERNAL FINANCE  /  CONTROLLED COPY", 17, 28);
  doc.setTextColor(18, 35, 49);
  doc.setFontSize(17);
  doc.text(title, 17, 53);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(85, 95, 104);
  doc.text(subtitle, 17, 60);
  doc.text(`Reference ${reference}`, 17, 67);
  doc.text(`Generated ${new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}`, 193, 67, { align: "right" });
  doc.setDrawColor(214, 222, 228);
  doc.line(17, 72, 193, 72);
}

function footer(doc: jsPDF) {
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setDrawColor(214, 222, 228);
    doc.line(17, 279, 193, 279);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(90, 98, 106);
    doc.text("Palmstead · Internal finance record · Not proof of payment", 17, 285);
    doc.text(`${page} / ${pages}`, 193, 285, { align: "right" });
  }
}

function keyValues(doc: jsPDF, rows: [string, string][], y: number) {
  autoTable(doc, {
    startY: y,
    margin: { left: 17, right: 17 },
    theme: "plain",
    body: rows,
    styles: { font: "helvetica", fontSize: 9, cellPadding: 3, textColor: [26, 40, 51] },
    columnStyles: { 0: { cellWidth: 49, fontStyle: "bold", textColor: [84, 96, 105] } },
    didDrawCell: (data) => {
      if (data.section === "body") {
        doc.setDrawColor(228, 234, 238);
        doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
      }
    },
  });
  return (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

export function buildFinanceRequestPdf(record: RequestDocument) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  cover(doc, "Staff fund request", record.id.slice(0, 8).toUpperCase(), "Request, review trail and current decision");
  let y = keyValues(doc, [
    ["Requester", record.requester],
    ["Department / route", record.department],
    ["Budget category", record.category],
    ["Requested amount", money(record.amount)],
    ["Needed by", record.needed_by],
    ["Status", pretty(record.status).toUpperCase()],
    ["Request revision", String(record.revision)],
    ["Created", stamp(record.created_at)],
    ["Finance approval", stamp(record.approved_at)],
    ["Approved budget revision", record.approved_budget_revision ? String(record.approved_budget_revision) : "—"],
  ], 79);
  y += 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(18, 35, 49);
  doc.text("Purpose and deliverable", 17, y);
  autoTable(doc, {
    startY: y + 2,
    margin: { left: 17, right: 17, bottom: 23 },
    body: [[record.purpose]],
    theme: "plain",
    styles: { font: "helvetica", fontSize: 9, cellPadding: { top: 3, right: 0, bottom: 4, left: 0 }, overflow: "linebreak" },
  });
  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 9;
  if (y > 237) { doc.addPage(); y = 22; }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Approval history", 17, y);
  autoTable(doc, {
    startY: y + 5,
    margin: { left: 17, right: 17, bottom: 23 },
    head: [["Date / time", "Actor", "Action / status", "Decision note"]],
    body: [...record.events].reverse().map((event) => [
      stamp(event.occurred_at), event.actor_name, `${pretty(event.event_type)} / ${pretty(event.to_status)}`, event.note || "—",
    ]),
    theme: "striped",
    headStyles: { fillColor: [18, 35, 49], fontSize: 8 },
    styles: { font: "helvetica", fontSize: 8, cellPadding: 2.5, overflow: "linebreak" },
    columnStyles: { 0: { cellWidth: 36 }, 1: { cellWidth: 35 }, 2: { cellWidth: 49 } },
  });
  footer(doc);
  return doc;
}

export function buildFinanceBudgetPdf(record: BudgetDocument) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  cover(doc, "Department budget", record.id.slice(0, 8).toUpperCase(), "Approved plan and current commitment position");
  keyValues(doc, [
    ["Department", record.department],
    ["Fiscal year", String(record.fiscal_year)],
    ["Category", record.category],
    ["Plan revision", String(record.revision)],
    ["Status", pretty(record.status).toUpperCase()],
    ["Planned amount", money(record.amount)],
    ["Committed", record.committed === null ? "Not available to this role" : money(record.committed)],
    ["Uncommitted", record.committed === null ? "Not available to this role" : money(record.amount - record.committed)],
    ["Activated", stamp(record.activated_at)],
    ["Revision reason", record.reason],
  ], 79);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(85, 95, 104);
  doc.text("Commitments are approved requests. Actual expenditure and cash settlement are separate records.", 17, 241, { maxWidth: 175 });
  footer(doc);
  return doc;
}
