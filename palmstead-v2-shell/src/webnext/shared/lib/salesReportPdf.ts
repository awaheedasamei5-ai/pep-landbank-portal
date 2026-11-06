import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import { loadImageAsDataUri } from "./image";
import {
  PDF_GOLD,
  PDF_INK,
  PDF_LEAF,
  pdfAccentStatRow,
  pdfBarChart,
  pdfBrandedHeader,
  pdfReportFooter,
  pdfSectionTitle,
} from "./pdfReport";
import type { SalesReport } from "./salesReportModel";

function money(value: number): string {
  return `GHS ${value.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function percent(value: number | null): string {
  return value === null ? "N/A" : `${value.toFixed(1)}%`;
}

function table(
  doc: jsPDF,
  y: number,
  headers: string[],
  rows: (string | number)[][],
  widths?: Record<number, number>,
): number {
  autoTable(doc, {
    startY: y,
    head: [headers],
    body: rows.length ? rows : [["No records in the selected scope"]],
    margin: { left: 12, right: 12, top: 15, bottom: 19 },
    styles: { fontSize: 7.3, cellPadding: 2.3, overflow: "linebreak", valign: "top" },
    headStyles: { fillColor: PDF_INK, textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [246, 248, 250] },
    columnStyles: widths
      ? Object.fromEntries(Object.entries(widths).map(([key, cellWidth]) => [key, { cellWidth }]))
      : undefined,
    showHead: "everyPage",
  });
  return (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
}

function newSection(doc: jsPDF, title: string, note?: string): number {
  doc.addPage();
  let y = 20;
  y = pdfSectionTitle(doc, y, doc.internal.pageSize.getWidth(), title, note);
  return y;
}

function continuingSection(doc: jsPDF, y: number, title: string, note?: string, requiredHeight = 55): number {
  if (y + requiredHeight > 265) return newSection(doc, title, note);
  return pdfSectionTitle(doc, y + 7, doc.internal.pageSize.getWidth(), title, note);
}

export async function buildSalesReportPdf(report: SalesReport, generatedBy: string): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  let logo: string | null = null;
  try {
    logo = await loadImageAsDataUri("/trulander-logo.png");
  } catch {
    /* Brand text remains. */
  }
  const title = { company: "Company Leads", master: "Master Pipeline", mine: "My Pipeline" }[report.scope];
  let y = pdfBrandedHeader(
    doc,
    "SALES PERFORMANCE",
    `${title}  |  ${report.filters.from} to ${report.filters.to}`,
    ["PEP Landbank", `Prepared by ${generatedBy}`],
    logo,
  );
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...PDF_INK);
  const scopeLines = [
    `Data loaded: ${new Date(report.loadedAt).toLocaleString("en-GB", { timeZone: "Africa/Accra" })} Ghana time`,
    `Filters: staff ${report.filters.staffKey || "all"}; source ${report.filters.source || "all"}; stage ${report.filters.stage || "all"};`,
    `action ${report.filters.action || "all"}; outcome ${report.filters.outcome || "all"}; site ${report.filters.site || "all"}; plan ${report.filters.paymentPlan || "all"}.`,
    "Activity and lead cohorts use their event dates; payment cash uses payment date and approved status.",
    "Current stage and paid-in-full conversion are snapshots, not historical stage transitions.",
  ];
  for (const line of scopeLines) {
    doc.text(line, 12, y);
    y += 5.5;
  }
  y += 4;
  y = pdfSectionTitle(doc, y, doc.internal.pageSize.getWidth(), "Executive scorecard");
  y = pdfAccentStatRow(doc, y, doc.internal.pageSize.getWidth(), [
    { label: "New leads", value: report.newLeads.length, accent: PDF_LEAF },
    { label: "Genuine calls", value: report.calls.length, accent: PDF_GOLD },
    { label: "Reached rate", value: percent(report.reachedRate), accent: PDF_LEAF },
    { label: "Visit requests", value: report.requestedVisits.length, accent: PDF_GOLD },
    {
      label: "Approved receipts",
      value: money(report.approvedPayments.reduce((sum, payment) => sum + payment.amount, 0)),
      accent: PDF_LEAF,
    },
    { label: "Lead to visit", value: percent(report.newLeadToVisitRate), accent: PDF_GOLD },
  ]);
  y += 3;
  y = pdfSectionTitle(doc, y, doc.internal.pageSize.getWidth(), "Monthly activity trend");
  const trend = report.months.slice(-12);
  if (trend.length) {
    y = pdfBarChart(
      doc,
      14,
      y,
      180,
      43,
      trend.map((row) => ({ label: row.month.slice(2), value: row.calls })),
    );
    doc.setFontSize(7.8);
    doc.text("Genuine phone calls by month. Full activity and approved receipts follow.", 14, y);
  }
  y = newSection(doc, "Monthly trend detail");
  y = table(
    doc,
    y,
    ["Month", "New leads", "Calls", "Visit requests", "Approved cash"],
    trend.map((row) => [row.month, row.newLeads, row.calls, row.visitRequests, money(row.approvedCash)]),
  );

  if (report.canCompareStaff) {
    y = continuingSection(doc, y, "Staff comparison", "Activity actor and payment recorder attribution");
    y = table(
      doc,
      y,
      ["Staff", "Leads", "Calls", "Reached", "Rate", "Visits requested", "Approved cash"],
      report.staff.map((row) => [
        row.name,
        row.newLeads,
        row.calls,
        row.reached,
        percent(row.reachedRate),
        row.visitRequests,
        money(row.approvedCash),
      ]),
    );
  }
  y = continuingSection(doc, y, "Conversion and mix");
  y = pdfAccentStatRow(doc, y, doc.internal.pageSize.getWidth(), [
    { label: "Lead to visit", value: percent(report.newLeadToVisitRate) },
    { label: "Lead to paid in full", value: percent(report.newLeadToPaidRate) },
    { label: "Scheduled visits", value: report.scheduledVisits.length },
    { label: "Other recorded events", value: report.activities.length - report.calls.length },
  ]);
  y = continuingSection(doc, y, "Lead sources", undefined, 18 + report.sourceCounts.length * 7);
  y = table(
    doc,
    y,
    ["Source", "New leads"],
    report.sourceCounts.map((row) => [row.name, row.count]),
  );
  y = continuingSection(doc, y, "Current stage composition");
  y = table(
    doc,
    y,
    ["Stage", "Current leads"],
    report.stageCounts.map((row) => [row.name, row.count]),
  );
  y = continuingSection(doc, y, "Call outcomes");
  y = table(
    doc,
    y,
    ["Outcome", "Calls"],
    report.outcomeCounts.map((row) => [row.name, row.count]),
  );
  y = continuingSection(doc, y, "Data quality and interpretation");
  y = table(
    doc,
    y,
    ["Check", "Count / definition"],
    [
      ["Calls without outcome", report.callsWithoutOutcome],
      ["Unlinked visit requests", report.visitRequestWithoutLead],
      ["Company leads without handler", report.unassignedCompanyLeads],
      ["Reached denominator", `${report.reached} reached / ${report.calls.length} genuine calls`],
      ["Lead cohort denominator", `${report.newLeads.length} leads created within selection`],
      ["Sales definition", "Approved payment entries are client receipts, not booked sales or bank reconciliation."],
      ["Visit definition", "Scheduled visits do not prove attendance; historical completion is unavailable."],
    ],
  );
  y = newSection(doc, "Call register", `${report.calls.length} genuine calls in the selected period`);
  y = table(
    doc,
    y,
    ["Ghana date", "Staff", "Client", "Outcome", "Next follow-up"],
    report.calls.map((entry) => [
      new Date(entry.createdAt).toLocaleString("en-GB", { timeZone: "Africa/Accra" }),
      entry.agentName ?? entry.agentKey,
      entry.client,
      entry.outcome ?? "Unspecified",
      entry.follow ?? "",
    ]),
  );
  y = newSection(
    doc,
    "Visit request register",
    `${report.requestedVisits.length} requests created in the selected period`,
  );
  y = table(
    doc,
    y,
    ["Requested", "Staff", "Client", "Site", "Scheduled", "Status"],
    report.requestedVisits.map((visit) => [
      new Date(visit.createdAt).toLocaleDateString("en-GB", { timeZone: "Africa/Accra" }),
      visit.agentName,
      visit.name,
      visit.site,
      visit.visitDate,
      visit.status,
    ]),
  );
  y = newSection(doc, "Approved receipt register", `${report.approvedPayments.length} approved payment entries`);
  table(
    doc,
    y,
    ["Payment date", "Staff", "Client", "Amount", "Receipt"],
    report.approvedPayments.map((payment) => [
      payment.date,
      payment.agentKey,
      payment.clientName ?? "",
      money(payment.amount),
      payment.receiptNumber ?? "",
    ]),
  );

  pdfReportFooter(doc, "PEP Landbank | Sales performance");
  return doc;
}
