import ExcelJS from "exceljs";

// Real port of web-next's pipelineCanonicalWorkbook.ts -- a canonical,
// code-generated export/import workbook (Master Rebuild Spec Section 5:
// "Do not use a supplied reference workbook as the live interchange
// schema... this is a clean rebuild"). Four visible sheets (LEADS the
// only two-way reconciled one, PAYMENTS/ALLOCATIONS reference-only,
// INSTRUCTIONS) plus a hidden _METADATA sheet (export id/checksum/schema
// version) import reads back.
export const SCHEMA_VERSION = "1.0";

export interface LeadsColumn {
  key: string;
  header: string;
  width: number;
  editable: boolean;
  numFmt?: string;
}

export const LEADS_COLUMNS: LeadsColumn[] = [
  { key: "leadId", header: "Lead ID", width: 14, editable: false },
  { key: "staffKey", header: "Staff Key", width: 12, editable: true },
  { key: "staffName", header: "Staff Name", width: 20, editable: false },
  { key: "name", header: "Client Name", width: 24, editable: true },
  { key: "contact", header: "Contact", width: 16, editable: true },
  { key: "stage", header: "Stage", width: 10, editable: true },
  { key: "plotType", header: "Plot Type", width: 12, editable: true },
  { key: "noPlots", header: "No. Plots", width: 10, editable: true },
  { key: "unitPrice", header: "Unit Price (GHS)", width: 16, editable: true, numFmt: "#,##0" },
  { key: "discount", header: "Discount (GHS)", width: 15, editable: true, numFmt: "#,##0" },
  { key: "netTotal", header: "Net Total (GHS)", width: 15, editable: false, numFmt: "#,##0" },
  { key: "grandTotal", header: "Grand Total (GHS)", width: 16, editable: false, numFmt: "#,##0" },
  { key: "paymentPlan", header: "Payment Plan", width: 14, editable: true },
  { key: "amtPaid", header: "Amount Paid (GHS) -- LOCKED", width: 22, editable: false, numFmt: "#,##0" },
  { key: "balance", header: "Balance (GHS)", width: 15, editable: false, numFmt: "#,##0" },
  { key: "source", header: "Source", width: 16, editable: true },
  { key: "priority", header: "Priority", width: 10, editable: true },
  { key: "nextAction", header: "Next Action", width: 22, editable: true },
  { key: "siteVisit", header: "Site Visit", width: 10, editable: true },
  { key: "notes", header: "Notes", width: 30, editable: true },
  { key: "dateAdded", header: "Date Added", width: 13, editable: false },
  { key: "lastModifiedAt", header: "Last Modified At", width: 20, editable: false },
];

export const PAYMENTS_COLUMNS: { key: string; header: string; width: number }[] = [
  { key: "paymentId", header: "Payment ID", width: 14 },
  { key: "leadId", header: "Lead ID", width: 14 },
  { key: "clientName", header: "Client Name", width: 24 },
  { key: "amount", header: "Amount (GHS)", width: 15 },
  { key: "date", header: "Date", width: 13 },
  { key: "status", header: "Status", width: 12 },
  { key: "decidedAt", header: "Decided At", width: 20 },
];

export const ALLOCATIONS_COLUMNS: { key: string; header: string; width: number }[] = [
  { key: "id", header: "Allocation ID", width: 14 },
  { key: "leadId", header: "Lead ID", width: 14 },
  { key: "clientName", header: "Client Name", width: 24 },
  { key: "staffName", header: "Staff Name", width: 20 },
  { key: "status", header: "Status", width: 18 },
  { key: "plotNumber", header: "Plot Number", width: 14 },
  { key: "percentPaid", header: "% Paid", width: 10 },
  { key: "createdAt", header: "Created At", width: 20 },
];

const BRAND_INK = "FF151A33";
const BRAND_GOLD = "FF7C3AED";
const LOCKED_BG = "FFF3F1EA";
const THIN_LINE: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FFE5E1D6" } };

function headerRow(ws: ExcelJS.Worksheet, columns: { header: string; width: number }[], accent: string) {
  columns.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width;
  });
  const row = ws.getRow(1);
  columns.forEach((c, i) => {
    const cell = row.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: accent } };
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: accent } } };
  });
  row.height = 20;
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

function styleDataRow(ws: ExcelJS.Worksheet, rowNum: number, columns: LeadsColumn[]) {
  const row = ws.getRow(rowNum);
  const zebra = rowNum % 2 === 0;
  columns.forEach((c, i) => {
    const cell = row.getCell(i + 1);
    cell.border = { top: THIN_LINE, bottom: THIN_LINE, left: THIN_LINE, right: THIN_LINE };
    if (!c.editable) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LOCKED_BG } };
      cell.font = { color: { argb: "FF7A7566" }, italic: true };
    } else if (zebra) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFAFAF7" } };
    }
    if (c.numFmt) cell.numFmt = c.numFmt;
  });
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface WorkbookMeta {
  exportId: string;
  exportedAt: string;
  exportedByKey: string;
  exportedByName: string;
  schemaVersion: string;
  sourceLabel: string;
  checksum: string;
}

const STAGE_OPTIONS = ["1", "2A", "2B", "3", "4", "Lost"];
const PLOT_TYPE_OPTIONS = ["Full Plot", "Half Plot"];
const PAYMENT_PLAN_OPTIONS = ["Full Payment", "3 Months", "6 Months", "9 Months", "12 Months"];
const PRIORITY_OPTIONS = ["High", "Medium", "Low"];
const SITE_VISIT_OPTIONS = ["Yes", "No"];

function applyDropdown(ws: ExcelJS.Worksheet, columnIndex: number, options: string[], lastRow: number) {
  const formula = `"${options.join(",")}"`;
  for (let r = 2; r <= lastRow; r++) {
    ws.getRow(r).getCell(columnIndex).dataValidation = {
      type: "list",
      allowBlank: false,
      showErrorMessage: true,
      errorStyle: "stop",
      errorTitle: "Invalid value",
      error: `Must be one of: ${options.join(", ")}`,
      formulae: [formula],
    };
  }
}

function applyLeadsDropdowns(ws: ExcelJS.Worksheet, lastRow: number, staffKeys: string[]) {
  const colOf = (key: string) => LEADS_COLUMNS.findIndex((c) => c.key === key) + 1;
  applyDropdown(ws, colOf("stage"), STAGE_OPTIONS, lastRow);
  applyDropdown(ws, colOf("plotType"), PLOT_TYPE_OPTIONS, lastRow);
  applyDropdown(ws, colOf("paymentPlan"), PAYMENT_PLAN_OPTIONS, lastRow);
  applyDropdown(ws, colOf("priority"), PRIORITY_OPTIONS, lastRow);
  applyDropdown(ws, colOf("siteVisit"), SITE_VISIT_OPTIONS, lastRow);
  if (staffKeys.length) applyDropdown(ws, colOf("staffKey"), staffKeys, lastRow);
}

export interface ExcelLead {
  id: string;
  agentKey: string;
  name: string;
  contact: string;
  stage: string;
  plotType: string;
  noPlots: number;
  unitPrice: number;
  discount: number | null;
  netTotal: number | null;
  grandTotal: number;
  paymentPlan: string;
  amtPaid: number;
  leadSource: string | null;
  priority: string | null;
  nextAction: string | null;
  siteVisit: string | null;
  notes: string | null;
  dateAdded: string;
  lastModifiedAt: string | null;
}

export interface ExcelPayment {
  id: string;
  leadId: string;
  clientName: string;
  amount: number;
  date: string;
  status: string;
  decidedAt: string | null;
}

export interface ExcelAllocation {
  id: string;
  leadId: string;
  clientName: string;
  staffName: string;
  status: string;
  plotNumber: string | null;
  percentPaid: number | null;
  createdAt: string;
}

function writeLeadsSheet(
  ws: ExcelJS.Worksheet,
  leads: ExcelLead[],
  staffByKey: Map<string, string>,
  staffKeys: string[],
) {
  headerRow(ws, LEADS_COLUMNS, BRAND_INK);
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: LEADS_COLUMNS.length } };
  leads.forEach((l, i) => {
    const r = i + 2;
    const balance = Math.max((l.grandTotal ?? 0) - (l.amtPaid ?? 0), 0);
    const vals: Record<string, ExcelJS.CellValue> = {
      leadId: l.id,
      staffKey: l.agentKey,
      staffName: staffByKey.get(l.agentKey) ?? l.agentKey,
      name: l.name,
      contact: l.contact,
      stage: l.stage,
      plotType: l.plotType,
      noPlots: l.noPlots,
      unitPrice: l.unitPrice,
      discount: l.discount ?? 0,
      netTotal: l.netTotal ?? Math.max(l.grandTotal - (l.discount ?? 0), 0),
      grandTotal: l.grandTotal,
      paymentPlan: l.paymentPlan,
      amtPaid: l.amtPaid,
      balance,
      source: l.leadSource ?? "",
      priority: l.priority ?? "Low",
      nextAction: l.nextAction ?? "",
      siteVisit: l.siteVisit ?? "No",
      notes: l.notes ?? "",
      dateAdded: l.dateAdded ? new Date(l.dateAdded) : null,
      lastModifiedAt: l.lastModifiedAt ? new Date(l.lastModifiedAt) : null,
    };
    LEADS_COLUMNS.forEach((c, ci) => {
      ws.getRow(r).getCell(ci + 1).value = vals[c.key] ?? null;
    });
    styleDataRow(ws, r, LEADS_COLUMNS);
  });
  applyLeadsDropdowns(ws, leads.length + 51, staffKeys);
}

function writePaymentsSheet(ws: ExcelJS.Worksheet, payments: ExcelPayment[]) {
  headerRow(ws, PAYMENTS_COLUMNS, BRAND_INK);
  payments.forEach((p, i) => {
    const r = i + 2;
    const vals: Record<string, ExcelJS.CellValue> = {
      paymentId: p.id,
      leadId: p.leadId,
      clientName: p.clientName,
      amount: p.amount,
      date: p.date ? new Date(p.date) : null,
      status: p.status,
      decidedAt: p.decidedAt ? new Date(p.decidedAt) : null,
    };
    PAYMENTS_COLUMNS.forEach((c, ci) => {
      const cell = ws.getRow(r).getCell(ci + 1);
      cell.value = vals[c.key] ?? null;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LOCKED_BG } };
      cell.font = { color: { argb: "FF7A7566" }, italic: true };
    });
  });
}

function writeAllocationsSheet(ws: ExcelJS.Worksheet, allocations: ExcelAllocation[]) {
  headerRow(ws, ALLOCATIONS_COLUMNS, BRAND_INK);
  allocations.forEach((a, i) => {
    const r = i + 2;
    const vals: Record<string, ExcelJS.CellValue> = {
      id: a.id,
      leadId: a.leadId,
      clientName: a.clientName,
      staffName: a.staffName,
      status: a.status,
      plotNumber: a.plotNumber ?? "",
      percentPaid: a.percentPaid ?? "",
      createdAt: a.createdAt ? new Date(a.createdAt) : null,
    };
    ALLOCATIONS_COLUMNS.forEach((c, ci) => {
      const cell = ws.getRow(r).getCell(ci + 1);
      cell.value = vals[c.key] ?? null;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LOCKED_BG } };
      cell.font = { color: { argb: "FF7A7566" }, italic: true };
    });
  });
}

function writeInstructionsSheet(ws: ExcelJS.Worksheet, meta: WorkbookMeta) {
  ws.getColumn(1).width = 100;
  const lines: [string, boolean][] = [
    ["Palmstead Pipeline Workbook", true],
    ["", false],
    [`Exported ${meta.exportedAt} by ${meta.exportedByName} (${meta.exportedByKey})`, false],
    [`Source: ${meta.sourceLabel}  ·  Schema v${meta.schemaVersion}  ·  Export ID: ${meta.exportId}`, false],
    ["", false],
    ["HOW THIS WORKBOOK WORKS", true],
    ["", false],
    [
      "LEADS is the only sheet you can edit and re-import. Every other sheet is a read-only snapshot for reference.",
      false,
    ],
    [
      "Grey, italic columns on LEADS (Lead ID, Staff Name, Net/Grand Total, Amount Paid, Balance, Date Added, Last Modified At) are system-generated. Any change you type into them is ignored on import.",
      false,
    ],
    [
      "White columns on LEADS (Staff Key, Client Name, Contact, Stage, Plot Type, No. Plots, Unit Price, Discount, Payment Plan, Source, Priority, Next Action, Site Visit, Notes) are the fields an import can actually change. Changing Staff Key reassigns the client to a different staff member -- type an exact staff key from the dropdown.",
      false,
    ],
    ["", false],
    [
      "AMOUNT PAID IS LOCKED. Payments are never accepted through this workbook, from any account, including Management. Log or correct a payment through the Log Payment screen only -- the PAYMENTS sheet here is reference-only, to help you cross-check figures while editing LEADS.",
      false,
    ],
    ["", false],
    [
      "ALLOCATIONS is also reference-only -- plot allocation is a multi-step approval workflow with real inventory consequences and has no safe spreadsheet-cell equivalent. Use the Allocations screen to change it.",
      false,
    ],
    ["", false],
    [
      "NEVER edit or delete the Lead ID column. It is how a re-imported row is matched back to the right client. A row with a blank Lead ID is treated as a brand-new client. A row whose Lead ID cannot be found is treated as ambiguous and held for manual review rather than guessed at.",
      false,
    ],
    ["", false],
    [
      "A row missing from this sheet when you re-import is NOT automatically deleted -- you will be asked whether to archive it.",
      false,
    ],
    ["", false],
    [
      "If someone else changed a client in the app after this file was generated, and your file disagrees, that row is held as a conflict for you to review rather than silently overwritten.",
      false,
    ],
  ];
  lines.forEach(([text, bold], i) => {
    const cell = ws.getRow(i + 1).getCell(1);
    cell.value = text;
    if (bold) cell.font = { bold: true, size: i === 0 ? 18 : 12, color: { argb: BRAND_INK } };
    cell.alignment = { wrapText: true, vertical: "top" };
  });
}

function writeMetadataSheet(ws: ExcelJS.Worksheet, meta: WorkbookMeta) {
  ws.state = "hidden";
  const entries: [string, string][] = [
    ["exportId", meta.exportId],
    ["exportedAt", meta.exportedAt],
    ["exportedByKey", meta.exportedByKey],
    ["exportedByName", meta.exportedByName],
    ["schemaVersion", meta.schemaVersion],
    ["sourceLabel", meta.sourceLabel],
    ["checksum", meta.checksum],
  ];
  entries.forEach(([k, v], i) => {
    ws.getRow(i + 1).getCell(1).value = k;
    ws.getRow(i + 1).getCell(2).value = v;
  });
}

export interface CanonicalWorkbookInput {
  leads: ExcelLead[];
  payments: ExcelPayment[];
  allocations: ExcelAllocation[];
  staff: { key: string; name: string }[];
  exportedByKey: string;
  exportedByName: string;
  sourceLabel: string;
}

export async function buildCanonicalPipelineWorkbook(
  input: CanonicalWorkbookInput,
): Promise<{ buffer: ExcelJS.Buffer; meta: WorkbookMeta }> {
  const staffByKey = new Map(input.staff.map((s) => [s.key, s.name]));
  const sortedLeads = input.leads
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  const checksumSource = JSON.stringify(
    sortedLeads.map((l) => [
      l.id,
      l.name,
      l.contact,
      l.stage,
      l.plotType,
      l.noPlots,
      l.discount,
      l.paymentPlan,
      l.priority,
      l.siteVisit,
      l.nextAction,
      l.notes,
    ]),
  );
  const checksum = await sha256Hex(checksumSource);

  const meta: WorkbookMeta = {
    exportId: crypto.randomUUID(),
    exportedAt: new Date().toISOString(),
    exportedByKey: input.exportedByKey,
    exportedByName: input.exportedByName,
    schemaVersion: SCHEMA_VERSION,
    sourceLabel: input.sourceLabel,
    checksum,
  };

  const wb = new ExcelJS.Workbook();
  wb.creator = "Palmstead";
  wb.created = new Date(meta.exportedAt);

  const leadsSheet = wb.addWorksheet("LEADS", { properties: { tabColor: { argb: BRAND_GOLD } } });
  writeLeadsSheet(leadsSheet, sortedLeads, staffByKey, [...input.staff.map((s) => s.key), "company"]);

  const paymentsSheet = wb.addWorksheet("PAYMENTS", { properties: { tabColor: { argb: "FF9CA3AF" } } });
  writePaymentsSheet(paymentsSheet, input.payments);

  const allocationsSheet = wb.addWorksheet("ALLOCATIONS", { properties: { tabColor: { argb: "FF9CA3AF" } } });
  writeAllocationsSheet(allocationsSheet, input.allocations);

  const instructionsSheet = wb.addWorksheet("INSTRUCTIONS", { properties: { tabColor: { argb: BRAND_INK } } });
  writeInstructionsSheet(instructionsSheet, meta);

  const metaSheet = wb.addWorksheet("_METADATA");
  writeMetadataSheet(metaSheet, meta);

  const buffer = await wb.xlsx.writeBuffer();
  return { buffer, meta };
}

export function canonicalPipelineFilename(sourceLabel: string, dateStr: string): string {
  const safe = sourceLabel.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `Palmstead_Pipeline_${safe}_${dateStr}.xlsx`;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
