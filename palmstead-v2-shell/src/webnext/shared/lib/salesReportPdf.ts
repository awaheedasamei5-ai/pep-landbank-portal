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
import { sanitizePdfText } from "./pdfText";
import { salesPaymentPlanLabel, type SalesPeriodComparison, type SalesReport } from "./salesReportModel";

export type SalesPdfSection = "overview" | "comparison" | "trend" | "staff" | "mix" | "quality" | "registers" | "clients";
export const SALES_PDF_SECTIONS: { key: SalesPdfSection; label: string }[] = [
  { key: "overview", label: "Executive scorecard" },
  { key: "comparison", label: "Previous period" },
  { key: "trend", label: "Monthly trend" },
  { key: "staff", label: "Staff comparison" },
  { key: "mix", label: "Conversion and data quality" },
  { key: "quality", label: "Records needing attention" },
  { key: "registers", label: "Calls, visits and receipts" },
  { key: "clients", label: "Client records and discussions" },
];

function money(value: number): string {
  return `GHS ${value.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function percent(value: number | null): string {
  return value === null ? "N/A" : `${value.toFixed(1)}%`;
}

const safe = (value: unknown) => sanitizePdfText(String(value ?? "").trim() || "Not recorded");
const when = (value: string) =>
  new Date(value).toLocaleString("en-GB", { timeZone: "Africa/Accra", dateStyle: "medium", timeStyle: "short" });

function table(
  doc: jsPDF,
  y: number,
  headers: string[],
  rows: (string | number)[][],
  widths?: Record<number, number>,
  links?: string[],
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
      ? Object.fromEntries(
          Object.entries(widths).map(([key, cellWidth]) => [
            key,
            { cellWidth, ...(links && Number(key) === headers.length - 1 ? { textColor: PDF_LEAF } : {}) },
          ]),
        )
      : undefined,
    showHead: "everyPage",
    didDrawCell: links
      ? (cell) => {
          if (cell.section !== "body" || cell.column.index !== headers.length - 1) return;
          const href = links[cell.row.index];
          if (href) doc.link(cell.cell.x, cell.cell.y, cell.cell.width, cell.cell.height, { url: href });
        }
      : undefined,
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

export async function buildSalesReportPdf(
  report: SalesReport,
  generatedBy: string,
  options: { sections?: SalesPdfSection[]; comparison?: SalesPeriodComparison } = {},
): Promise<jsPDF> {
  const sections = new Set(options.sections ?? SALES_PDF_SECTIONS.map((section) => section.key));
  if (!sections.size) throw new Error("Select at least one PDF section.");
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
  const selectedStaff = report.filters.staffKey
    ? report.staff.find((row) => row.key === report.filters.staffKey)?.name ?? report.filters.staffKey
    : "all";
  const selectedClient = report.filters.clientId
    ? report.clients.find((row) => row.lead.id === report.filters.clientId)?.lead.name ?? "selected client unavailable"
    : "all";
  const scopeLines = [
    `Data loaded: ${new Date(report.loadedAt).toLocaleString("en-GB", { timeZone: "Africa/Accra" })} Ghana time`,
    `Filters: staff ${safe(selectedStaff)}; source ${report.filters.source || "all"}; stage ${report.filters.stage || "all"};`,
    `action ${report.filters.action || "all"}; outcome ${report.filters.outcome || "all"}; site ${report.filters.site || "all"}; plan ${report.filters.paymentPlan || "all"}.`,
    `Pool: ${report.filters.pool || "all"}; client: ${safe(selectedClient)}.`,
    "Activity and lead cohorts use their event dates; payment cash uses payment date and approved status.",
    "Current stage and paid-in-full conversion are snapshots, not historical stage transitions.",
    `${report.excludedImportPlaceholders} allocation-only names without sales evidence were excluded from this scope.`,
  ];
  for (const line of scopeLines) {
    const wrapped = doc.splitTextToSize(line, doc.internal.pageSize.getWidth() - 24);
    doc.text(wrapped, 12, y);
    y += 5.5 * wrapped.length;
  }
  y += 4;
  let bodyStarted = false;
  const openTopSection = (title: string, note?: string) => {
    if (bodyStarted) return newSection(doc, title, note);
    bodyStarted = true;
    return pdfSectionTitle(doc, y, doc.internal.pageSize.getWidth(), title, note);
  };
  if (sections.has("overview")) {
    bodyStarted = true;
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
      { label: "Lead to attended visit", value: percent(report.newLeadToVisitRate), accent: PDF_GOLD },
    ]);
    y += 3;
    y = pdfSectionTitle(doc, y, doc.internal.pageSize.getWidth(), "Value and activity scorecard");
    y = pdfAccentStatRow(doc, y, doc.internal.pageSize.getWidth(), [
      { label: "Clients", value: report.clients.length },
      { label: "Paying clients", value: report.payingClients },
      { label: "Pipeline value", value: money(report.pipelineValue) },
      { label: "Outstanding", value: money(report.outstanding) },
      { label: "Recorded visit cost", value: money(report.attributedVisitCost) },
      { label: "Conversations", value: report.conversations.length },
    ]);
    y = continuingSection(doc, y, "Contact follow-up", "Current snapshot from all visible calls and timestamped discussions", 30);
    y = table(doc, y, ["Open clients needing contact", "Definition"], [
      [report.needingContact, "No recorded call or discussion for 14 or more days"],
    ]);
  }
  if (sections.has("comparison") && options.comparison) {
    const comparison = options.comparison;
    y = openTopSection(
      "Previous period comparison",
      `${comparison.from} to ${comparison.to} | equal number of calendar days`,
    );
    y = table(
      doc,
      y,
      ["Dated measure", "Selected period", "Previous period", "Change"],
      comparison.rows.map((row) => {
        const format = (value: number) => (row.unit === "money" ? money(value) : value.toLocaleString("en-GH"));
        const delta = row.current - row.previous;
        return [row.label, format(row.current), format(row.previous), `${delta > 0 ? "+" : ""}${format(delta)}`];
      }),
    );
    y = continuingSection(doc, y, "Comparison basis", undefined, 30);
    doc.setFontSize(8);
    doc.text(
      doc.splitTextToSize(
        "Only dated events are compared. Deal stage, pipeline value, balance and attributed cost are current snapshots and have no prior-period history.",
        180,
      ),
      14,
      y,
    );
    y += 18;
    for (const label of ["New leads", "Genuine calls", "Visit requests"] as const) {
      const row = comparison.rows.find((item) => item.label === label);
      if (!row || (row.current === 0 && row.previous === 0)) continue;
      y = continuingSection(doc, y, label, "Previous versus selected period", 57);
      y = pdfBarChart(doc, 14, y, 180, 43, [
        { label: "Previous", value: row.previous, color: PDF_GOLD },
        { label: "Selected", value: row.current, color: PDF_LEAF },
      ]);
    }
  }
  if (sections.has("trend")) {
    y = openTopSection("Monthly activity trend", "Calls logged in the selected period");
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
    y = continuingSection(doc, y, "Monthly trend detail", undefined, 45);
    y = table(
      doc,
      y,
      ["Month", "New leads", "Calls", "Visit requests", "Approved cash"],
      trend.map((row) => [row.month, row.newLeads, row.calls, row.visitRequests, money(row.approvedCash)]),
    );
  }

  if (sections.has("staff") && report.canCompareStaff) {
    bodyStarted = true;
    y = continuingSection(doc, y, "Deal owner activity", "Company deals remain in the company pool", 45);
    y = table(
      doc,
      y,
      ["Owner", "Clients", "New", "Calls", "Reached", "Talks", "Visits", "Attended", "Paying"],
      report.staff.map((row) => [
        row.name,
        row.clients,
        row.newLeads,
        row.calls,
        percent(row.reachedRate),
        row.conversations,
        row.visitRequests,
        row.attendedVisits,
        row.payingClients,
      ]),
    );
    y = continuingSection(
      doc,
      y,
      "Contact recency by owner",
      "Open clients without a recorded call or discussion for 14+ days; current snapshot",
      35,
    );
    y = table(doc, y, ["Owner", "Clients", "Need contact"], report.staff.map((row) => [row.name, row.clients, row.needingContact]));
    y = continuingSection(
      doc,
      y,
      "Deal owner financial comparison",
      "Receipts use selected dates; balances and costs are current",
      40,
    );
    y = table(
      doc,
      y,
      [
        "Owner",
        "Pipeline value",
        "Approved receipts",
        "Outstanding",
        "Visit cost",
        "Visit to paying",
        "Known cost / payer",
      ],
      report.staff.map((row) => [
        row.name,
        money(row.pipelineValue),
        money(row.approvedCash),
        money(row.outstanding),
        money(row.attributedVisitCost),
        percent(row.visitToPayingRate),
        row.knownCostPerPayingClient === null ? "N/A" : money(row.knownCostPerPayingClient),
      ]),
    );
  }
  if (sections.has("mix")) {
    bodyStarted = true;
    y = continuingSection(doc, y, "Conversion and mix");
    y = pdfAccentStatRow(doc, y, doc.internal.pageSize.getWidth(), [
      { label: "Lead to attended visit", value: percent(report.newLeadToVisitRate) },
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
        ["Unverified payment plans", report.qualityIssues.filter((issue) => issue.kind === "Unverified payment plan").length],
        ["Reached denominator", `${report.reached} reached / ${report.calls.length} genuine calls`],
        ["Lead cohort denominator", `${report.newLeads.length} leads created within selection`],
        ["Sales definition", "Approved payment entries are client receipts, not booked sales or bank reconciliation."],
        ["Visit definition", "Scheduled visits do not prove attendance; historical completion is unavailable."],
        [
          "Cost coverage",
          "Only attended, linked visits with a matched actual-cost form have a cost attribution. Missing attribution does not mean zero spend.",
        ],
        [
          "Financial comparison",
          "Receipts are approved client payments; visit cost is an attributed cost snapshot. Their difference is not company profit.",
        ],
      ],
    );
  }
  if (sections.has("quality")) {
    y = openTopSection(
      "Records needing attention",
      "Dated call and visit gaps; company handlers and payment plans are current",
    );
    y = table(
      doc,
      y,
      ["Issue", "Ghana date", "Client", "Staff / pool", "Record"],
      report.qualityIssues.map((issue) => [
        issue.kind,
        issue.date,
        safe(issue.client),
        safe(issue.owner),
        "Open record",
      ]),
      { 0: 43, 1: 24, 2: 51, 3: 39, 4: 23 },
      report.qualityIssues.map((issue) => `https://palmstead-v2-shell.vercel.app${issue.recordUrl}`),
    );
  }
  if (sections.has("registers")) {
    bodyStarted = true;
    if (!report.calls.length && !report.requestedVisits.length && !report.approvedPayments.length) {
      y = continuingSection(doc, y, "Activity registers", "No dated records match the selected filters", 28);
      y = table(doc, y, ["Result"], [["No calls, visit requests or approved receipts in this period"]]);
    }
    if (report.calls.length) {
      y = continuingSection(doc, y, "Call register", `${report.calls.length} genuine calls in the selected period`, 38);
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
    }
    if (report.requestedVisits.length) {
      y = continuingSection(
        doc,
        y,
        "Visit request register",
        `${report.requestedVisits.length} requests created in the selected period`,
        38,
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
    }
    if (report.approvedPayments.length) {
      y = continuingSection(
        doc,
        y,
        "Approved receipt register",
        `${report.approvedPayments.length} approved payment entries`,
        38,
      );
      y = table(
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
    }
  }

  if (sections.has("clients")) {
    if (!report.clients.length) {
      y = openTopSection("Client records", "No clients match the selected filters");
      y = table(doc, y, ["Result"], [["No client records in this report scope"]]);
    }
    for (const client of report.clients) {
      y = openTopSection(
        `Client | ${safe(client.lead.name)}`,
        `${client.ownerName} | ${client.lead.agent === "company" ? "Company Leads" : "Staff pipeline"} | Added ${client.lead.date}`,
      );
      y = pdfAccentStatRow(doc, y, doc.internal.pageSize.getWidth(), [
        { label: "Deal value", value: money(client.lead.grandTotal) },
        { label: "Paid in period", value: money(client.paidInPeriod) },
        { label: "Paid to date", value: money(client.paidToDate) },
        { label: "Outstanding", value: money(client.outstanding) },
        { label: "Visit cost", value: money(client.attributedVisitCost) },
        { label: "Calls / talks", value: `${client.calls.length} / ${client.conversations.length}` },
      ]);
      y = continuingSection(doc, y, "Deal and next step", undefined, 28);
      y = table(
        doc,
        y,
        ["Field", "Recorded value"],
        [
          ["Stage / plan", `${client.lead.stage} / ${salesPaymentPlanLabel(client.lead.paymentPlan)}`],
          ["Last recorded contact", client.lastContactAt ? `${when(client.lastContactAt)} (${client.daysSinceContact} days ago)${client.needsContact ? " - follow-up needed" : ""}` : `No call or discussion recorded${client.needsContact ? " - follow-up needed" : ""}`],
          ["Plot / quantity", `${client.lead.plotType} / ${client.lead.noPlots}`],
          [
            "Source / handler",
            `${client.lead.leadSource || "Not recorded"} / ${client.lead.assignedAgentKey || "Not assigned"}`,
          ],
          [
            "Next action",
            `${safe(client.lead.nextAction)}${client.lead.nextActionDate ? ` (due ${client.lead.nextActionDate})` : ""}`,
          ],
          [
            "Earlier lead notes",
            client.lead.notes ? `${safe(client.lead.notes)} (individual timestamps unavailable)` : "Not recorded",
          ],
        ],
      );
      if (client.conversations.length) {
        y = continuingSection(doc, y, "Timestamped discussions", "Recorded words and agreed next step", 38);
        y = table(
          doc,
          y,
          ["Recorded (Ghana)", "By / channel", "Discussion and next action"],
          client.conversations.map((entry) => [
            when(entry.createdAt),
            `${entry.authorKey} / ${entry.channel}`,
            `${safe(entry.body)}${entry.nextAction ? `\nNext: ${safe(entry.nextAction)}${entry.nextActionDate ? ` (due ${entry.nextActionDate})` : ""}` : ""}`,
          ]),
          { 0: 35, 1: 32 },
        );
      }
      if (client.activities.length) {
        y = continuingSection(doc, y, "Calls and activity", "Selected-date entries linked to this deal", 38);
        y = table(
          doc,
          y,
          ["Recorded (Ghana)", "By / action", "Outcome, notes and follow-up"],
          client.activities.map((entry) => [
            when(entry.createdAt),
            `${entry.agentName || entry.agentKey} / ${entry.action}`,
            [entry.outcome, entry.detail, entry.note, entry.follow ? `Follow-up: ${entry.follow}` : null]
              .filter(Boolean)
              .map(safe)
              .join("\n") || "Not recorded",
          ]),
          { 0: 35, 1: 35 },
        );
      }
      if (client.visits.length) {
        y = continuingSection(doc, y, "Site visits", "Selected dates; attendance shown only when recorded", 38);
        y = table(
          doc,
          y,
          ["Date / site", "Status", "Visit discussion and next steps"],
          client.visits.map((visit) => [
            `${visit.visitDate} / ${safe(visit.site)}`,
            `${visit.status}; ${visit.attended === true ? "attended" : visit.attended === false ? "did not attend" : "attendance unconfirmed"}`,
            [visit.discussionSoFar, visit.feedbackAfter, visit.keyNextSteps].filter(Boolean).map(safe).join("\n") ||
              "Not recorded",
          ]),
          { 0: 40, 1: 33 },
        );
      }
      if (client.approvedPayments.length) {
        y = continuingSection(doc, y, "Approved payments", "Receipts dated within the selection", 38);
        y = table(
          doc,
          y,
          ["Date", "Amount", "Method / receipt / note"],
          client.approvedPayments.map((payment) => [
            payment.date,
            money(payment.amount),
            [payment.paymentMethod, payment.receiptNumber, payment.note].filter(Boolean).map(safe).join(" / ") ||
              "Not recorded",
          ]),
          { 0: 27, 1: 35 },
        );
      }
      if (client.costs.length) {
        y = continuingSection(doc, y, "Attributed site visit costs", "Current ledger snapshot", 38);
        table(
          doc,
          y,
          ["Recorded (Ghana)", "Amount", "Basis"],
          client.costs.map((cost) => [when(cost.createdAt), money(cost.amount), safe(cost.note)]),
          { 0: 35, 1: 35 },
        );
      }
    }
  }

  pdfReportFooter(doc, "PEP Landbank | Sales performance");
  return doc;
}


