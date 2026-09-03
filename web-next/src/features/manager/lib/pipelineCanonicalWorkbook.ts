import ExcelJS from 'exceljs';
import type { AllocationRequest, Lead, Payment } from '../../../types/domain';

// Canonical pipeline export/import workbook, generated entirely in code --
// per the Master Rebuild Specification, Section 5 ("Pipeline Excel Import /
// Export -- rebuild from first principles"): "Do not use the supplied
// reference workbook as the live interchange schema. It is a useful
// business reference and seed-data source, but its formulas, dashboards,
// manual conventions and inconsistent fields are not a safe synchronization
// protocol." The previous version of this file (and the import it fed)
// loaded and populated public/pipeline-template.xlsx -- exactly the thing
// this section forbids. This is a clean rebuild: no template file is
// loaded, every sheet/column/style is built here.
//
// Four sheets, per spec 5.1:
//   1. LEADS       -- one row per lead, the only two-way reconciled sheet.
//   2. PAYMENTS    -- one row per payment, reference-only (see below).
//   3. ALLOCATIONS -- allocation request/plot-unit state, reference-only.
//   4. INSTRUCTIONS -- which fields are editable vs system-generated.
// Plus workbook metadata (export ID, exported_at/by, schema version,
// checksum) written to a fifth, hidden sheet -- Excel has no first-class
// "workbook properties a human edits" surface, so a hidden METADATA sheet
// is the plain, inspectable equivalent import can read back without
// depending on ExcelJS's own custom-properties API (which round-trips
// unreliably across Excel/Sheets/LibreOffice saves).
//
// PAYMENTS and ALLOCATIONS are deliberately reference-only, not import
// targets -- confirmed with the user directly: payment amounts must never
// be changeable via this workbook by anyone, staff log payments through
// the Log Payment screen only, full stop, no exceptions and no "correction
// via import" path. Allocations carry the same treatment for the same
// reason: a multi-step workflow (suggest/confirm/revert/flag) with real
// plot-inventory consequences has no safe "diff a spreadsheet cell" story
// either -- it stays a screen, not a spreadsheet column.

export const SCHEMA_VERSION = '1.0';

export interface LeadsColumn {
  key: string;
  header: string;
  width: number;
  editable: boolean;
  numFmt?: string;
}

// Order matters: column A is Lead ID (the immutable match key, per spec
// 5.2's "match by immutable Lead ID first") so it's always the first thing
// a human sees, not buried at the far right the way the old template hid
// it in column U. Locked/system-generated columns are visually distinct
// (see applyProfessionalStyling below) and never accepted from an import.
export const LEADS_COLUMNS: LeadsColumn[] = [
  { key: 'leadId', header: 'Lead ID', width: 14, editable: false },
  // Editable (unlike Lead ID): reassigning a client to a different staff
  // member is a real, legitimate reconciliation target -- spec 5.1 lists
  // Staff Key as a plain LEADS field, not an immutable one like Lead ID.
  // Applied via the dedicated leads.assign() call, not a plain field patch
  // -- see usePipelineImport.ts.
  { key: 'staffKey', header: 'Staff Key', width: 12, editable: true },
  { key: 'staffName', header: 'Staff Name', width: 20, editable: false },
  { key: 'name', header: 'Client Name', width: 24, editable: true },
  { key: 'contact', header: 'Contact', width: 16, editable: true },
  { key: 'stage', header: 'Stage', width: 10, editable: true },
  { key: 'plotType', header: 'Plot Type', width: 12, editable: true },
  { key: 'noPlots', header: 'No. Plots', width: 10, editable: true },
  { key: 'unitPrice', header: 'Unit Price (GHS)', width: 16, editable: true, numFmt: '#,##0' },
  { key: 'discount', header: 'Discount (GHS)', width: 15, editable: true, numFmt: '#,##0' },
  { key: 'netTotal', header: 'Net Total (GHS)', width: 15, editable: false, numFmt: '#,##0' },
  { key: 'grandTotal', header: 'Grand Total (GHS)', width: 16, editable: false, numFmt: '#,##0' },
  { key: 'paymentPlan', header: 'Payment Plan', width: 14, editable: true },
  { key: 'amtPaid', header: 'Amount Paid (GHS) -- LOCKED', width: 22, editable: false, numFmt: '#,##0' },
  { key: 'balance', header: 'Balance (GHS)', width: 15, editable: false, numFmt: '#,##0' },
  { key: 'source', header: 'Source', width: 16, editable: true },
  { key: 'priority', header: 'Priority', width: 10, editable: true },
  { key: 'nextAction', header: 'Next Action', width: 22, editable: true },
  { key: 'siteVisit', header: 'Site Visit', width: 10, editable: true },
  { key: 'notes', header: 'Notes', width: 30, editable: true },
  { key: 'dateAdded', header: 'Date Added', width: 13, editable: false },
  { key: 'lastModifiedAt', header: 'Last Modified At', width: 20, editable: false },
];

export const PAYMENTS_COLUMNS: { key: string; header: string; width: number }[] = [
  { key: 'paymentId', header: 'Payment ID', width: 14 },
  { key: 'leadId', header: 'Lead ID', width: 14 },
  { key: 'clientName', header: 'Client Name', width: 24 },
  { key: 'amount', header: 'Amount (GHS)', width: 15 },
  { key: 'date', header: 'Date', width: 13 },
  { key: 'method', header: 'Method', width: 14 },
  { key: 'status', header: 'Status', width: 12 },
  { key: 'receiptNumber', header: 'Receipt Number', width: 16 },
  { key: 'decidedAt', header: 'Decided At', width: 20 },
];

export const ALLOCATIONS_COLUMNS: { key: string; header: string; width: number }[] = [
  { key: 'id', header: 'Allocation ID', width: 14 },
  { key: 'leadId', header: 'Lead ID', width: 14 },
  { key: 'clientName', header: 'Client Name', width: 24 },
  { key: 'staffName', header: 'Staff Name', width: 20 },
  { key: 'status', header: 'Status', width: 18 },
  { key: 'plotNumber', header: 'Plot Number', width: 14 },
  { key: 'percentPaid', header: '% Paid', width: 10 },
  { key: 'createdAt', header: 'Created At', width: 20 },
  { key: 'resolvedAt', header: 'Resolved At', width: 20 },
];

const BRAND_INK = 'FF151A33'; // --c-ink
const BRAND_GOLD = 'FFC9A227'; // --c-accent
const LOCKED_BG = 'FFF3F1EA'; // muted neutral -- visually flags "don't type here" without alarm-red

function headerRow(ws: ExcelJS.Worksheet, columns: { header: string; width: number }[], accent: string) {
  columns.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width;
  });
  const row = ws.getRow(1);
  columns.forEach((c, i) => {
    const cell = row.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: accent } };
    cell.alignment = { vertical: 'middle', wrapText: true };
    cell.border = { bottom: { style: 'thin', color: { argb: accent } } };
  });
  row.height = 20;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

const THIN_LINE: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FFE5E1D6' } };

function styleDataRow(ws: ExcelJS.Worksheet, rowNum: number, columns: LeadsColumn[]) {
  const row = ws.getRow(rowNum);
  const zebra = rowNum % 2 === 0;
  columns.forEach((c, i) => {
    const cell = row.getCell(i + 1);
    cell.border = { top: THIN_LINE, bottom: THIN_LINE, left: THIN_LINE, right: THIN_LINE };
    if (!c.editable) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LOCKED_BG } };
      cell.font = { color: { argb: 'FF7A7566' }, italic: true };
    } else if (zebra) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFAF7' } };
    }
    if (c.numFmt) cell.numFmt = c.numFmt;
  });
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
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

// Real dropdown lists (not free text) for every enum-shaped editable
// column -- a genuine correctness aid (typo-proof) as well as the
// "professional, not a raw dump" polish the spec asked for. Applied to a
// generous row range (not just today's row count) so a row someone adds
// by hand for a brand-new client still gets the same picker.
const STAGE_OPTIONS = ['1', '2A', '2B', '3', '4', 'Lost'];
const PLOT_TYPE_OPTIONS = ['Full Plot', 'Half Plot'];
const PAYMENT_PLAN_OPTIONS = ['Full Payment', '3 Months', '6 Months', '9 Months', '12 Months'];
const PRIORITY_OPTIONS = ['High', 'Medium', 'Low'];
const SITE_VISIT_OPTIONS = ['Yes', 'No'];

function applyDropdown(ws: ExcelJS.Worksheet, columnIndex: number, options: string[], lastRow: number) {
  const formula = `"${options.join(',')}"`;
  for (let r = 2; r <= lastRow; r++) {
    ws.getRow(r).getCell(columnIndex).dataValidation = {
      type: 'list',
      allowBlank: false,
      showErrorMessage: true,
      errorStyle: 'stop',
      errorTitle: 'Invalid value',
      error: `Must be one of: ${options.join(', ')}`,
      formulae: [formula],
    };
  }
}

function applyLeadsDropdowns(ws: ExcelJS.Worksheet, lastRow: number, staffKeys: string[]) {
  const colOf = (key: string) => LEADS_COLUMNS.findIndex((c) => c.key === key) + 1;
  applyDropdown(ws, colOf('stage'), STAGE_OPTIONS, lastRow);
  applyDropdown(ws, colOf('plotType'), PLOT_TYPE_OPTIONS, lastRow);
  applyDropdown(ws, colOf('paymentPlan'), PAYMENT_PLAN_OPTIONS, lastRow);
  applyDropdown(ws, colOf('priority'), PRIORITY_OPTIONS, lastRow);
  applyDropdown(ws, colOf('siteVisit'), SITE_VISIT_OPTIONS, lastRow);
  if (staffKeys.length) applyDropdown(ws, colOf('staffKey'), staffKeys, lastRow);
}

function writeLeadsSheet(ws: ExcelJS.Worksheet, leads: Lead[], staffByKey: Map<string, string>, staffKeys: string[]) {
  headerRow(ws, LEADS_COLUMNS, BRAND_INK);
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: LEADS_COLUMNS.length } };
  leads.forEach((l, i) => {
    const r = i + 2;
    const balance = Math.max((l.grandTotal ?? 0) - (l.amtPaid ?? 0), 0);
    const vals: Record<string, ExcelJS.CellValue> = {
      leadId: l.id,
      staffKey: l.agent,
      staffName: staffByKey.get(l.agent) ?? l.agent,
      name: l.name,
      contact: l.contact,
      // Deliberately the raw internal code (1/2A/2B/3/4/Lost), not
      // displayStageCode()'s human-facing renumbering that every read-only
      // report/chart in this app uses -- this cell is meant to be typed
      // into and parsed back by the system, and round-tripping a display
      // remap through free-text editing is exactly the kind of ambiguity
      // that produces a silently-wrong stage on import.
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
      source: l.leadSource ?? '',
      priority: l.priority ?? 'Low',
      nextAction: l.nextAction ?? '',
      siteVisit: l.siteVisit ?? 'No',
      notes: l.notes ?? '',
      dateAdded: l.date ? new Date(l.date) : null,
      lastModifiedAt: l.lastModifiedAt ? new Date(l.lastModifiedAt) : null,
    };
    LEADS_COLUMNS.forEach((c, ci) => {
      ws.getRow(r).getCell(ci + 1).value = vals[c.key] ?? null;
    });
    styleDataRow(ws, r, LEADS_COLUMNS);
  });
  // Extend dropdowns well past today's row count so a hand-added new-client
  // row (blank Lead ID, added at the bottom by a human) still gets pickers.
  applyLeadsDropdowns(ws, leads.length + 51, staffKeys);
}

function writePaymentsSheet(ws: ExcelJS.Worksheet, payments: Payment[], leadNameById: Map<string, string>) {
  headerRow(ws, PAYMENTS_COLUMNS, BRAND_INK);
  payments.forEach((p, i) => {
    const r = i + 2;
    const vals: Record<string, ExcelJS.CellValue> = {
      paymentId: p.id,
      leadId: p.leadId,
      clientName: p.clientName ?? leadNameById.get(p.leadId) ?? '',
      amount: p.amount,
      date: p.date ? new Date(p.date) : null,
      method: p.paymentMethod ?? '',
      status: p.status ?? '',
      receiptNumber: p.receiptNumber ?? '',
      decidedAt: p.decidedAt ? new Date(p.decidedAt) : null,
    };
    PAYMENTS_COLUMNS.forEach((c, ci) => {
      const cell = ws.getRow(r).getCell(ci + 1);
      cell.value = vals[c.key] ?? null;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LOCKED_BG } };
      cell.font = { color: { argb: 'FF7A7566' }, italic: true };
    });
  });
}

function writeAllocationsSheet(ws: ExcelJS.Worksheet, allocations: AllocationRequest[], staffByKey: Map<string, string>) {
  headerRow(ws, ALLOCATIONS_COLUMNS, BRAND_INK);
  allocations.forEach((a, i) => {
    const r = i + 2;
    const vals: Record<string, ExcelJS.CellValue> = {
      id: a.id,
      leadId: a.leadId,
      clientName: a.clientName,
      staffName: a.agentName ?? staffByKey.get(a.agentKey) ?? a.agentKey,
      status: a.status,
      plotNumber: a.plotNumber ?? '',
      percentPaid: a.percentPaid ?? '',
      createdAt: a.createdAt ? new Date(a.createdAt) : null,
      resolvedAt: a.resolvedAt ? new Date(a.resolvedAt) : null,
    };
    ALLOCATIONS_COLUMNS.forEach((c, ci) => {
      const cell = ws.getRow(r).getCell(ci + 1);
      cell.value = vals[c.key] ?? null;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LOCKED_BG } };
      cell.font = { color: { argb: 'FF7A7566' }, italic: true };
    });
  });
}

function writeInstructionsSheet(ws: ExcelJS.Worksheet, meta: WorkbookMeta) {
  ws.getColumn(1).width = 100;
  const lines: [string, boolean][] = [
    ['Palmstead Pipeline Workbook', true],
    ['', false],
    [`Exported ${meta.exportedAt} by ${meta.exportedByName} (${meta.exportedByKey})`, false],
    [`Source: ${meta.sourceLabel}  ·  Schema v${meta.schemaVersion}  ·  Export ID: ${meta.exportId}`, false],
    ['', false],
    ['HOW THIS WORKBOOK WORKS', true],
    ['', false],
    ['LEADS is the only sheet you can edit and re-import. Every other sheet is a read-only snapshot for reference.', false],
    ['Grey, italic columns on LEADS (Lead ID, Staff Name, Net/Grand Total, Amount Paid, Balance, Date Added, Last Modified At) are system-generated. Any change you type into them is ignored on import.', false],
    ['White columns on LEADS (Staff Key, Client Name, Contact, Stage, Plot Type, No. Plots, Unit Price, Discount, Payment Plan, Source, Priority, Next Action, Site Visit, Notes) are the fields an import can actually change. Changing Staff Key reassigns the client to a different staff member -- type an exact staff key from the dropdown.', false],
    ['', false],
    ['AMOUNT PAID IS LOCKED. Payments are never accepted through this workbook, from any account, including Management. Log or correct a payment through the Log Payment screen only -- the PAYMENTS sheet here is reference-only, to help you cross-check figures while editing LEADS.', false],
    ['', false],
    ['ALLOCATIONS is also reference-only -- plot allocation is a multi-step approval workflow with real inventory consequences and has no safe spreadsheet-cell equivalent. Use the Allocations screen to change it.', false],
    ['', false],
    ['NEVER edit or delete the Lead ID column. It is how a re-imported row is matched back to the right client. A row with a blank Lead ID is treated as a brand-new client. A row whose Lead ID cannot be found is treated as ambiguous and held for manual review rather than guessed at.', false],
    ['', false],
    ['A row missing from this sheet when you re-import is NOT automatically deleted -- you will be asked whether to archive it.', false],
    ['', false],
    ['If someone else changed a client in the app after this file was generated, and your file disagrees, that row is held as a conflict for you to review rather than silently overwritten.', false],
  ];
  lines.forEach(([text, bold], i) => {
    const cell = ws.getRow(i + 1).getCell(1);
    cell.value = text;
    if (bold) cell.font = { bold: true, size: i === 0 ? 18 : 12, color: { argb: BRAND_INK } };
    cell.alignment = { wrapText: true, vertical: 'top' };
  });
}

function writeMetadataSheet(ws: ExcelJS.Worksheet, meta: WorkbookMeta) {
  ws.state = 'hidden';
  const entries: [string, string][] = [
    ['exportId', meta.exportId],
    ['exportedAt', meta.exportedAt],
    ['exportedByKey', meta.exportedByKey],
    ['exportedByName', meta.exportedByName],
    ['schemaVersion', meta.schemaVersion],
    ['sourceLabel', meta.sourceLabel],
    ['checksum', meta.checksum],
  ];
  entries.forEach(([k, v], i) => {
    ws.getRow(i + 1).getCell(1).value = k;
    ws.getRow(i + 1).getCell(2).value = v;
  });
}

export interface CanonicalWorkbookInput {
  leads: Lead[];
  payments: Payment[];
  allocations: AllocationRequest[];
  staff: { key: string; name: string }[];
  exportedByKey: string;
  exportedByName: string;
  sourceLabel: string;
}

export async function buildCanonicalPipelineWorkbook(input: CanonicalWorkbookInput): Promise<{ buffer: ExcelJS.Buffer; meta: WorkbookMeta }> {
  const staffByKey = new Map(input.staff.map((s) => [s.key, s.name]));
  const leadNameById = new Map(input.leads.map((l) => [l.id, l.name]));
  const sortedLeads = input.leads.slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  // Checksum covers the LEADS sheet's real content (the only sheet import
  // reads) so a corrupted/hand-edited-outside-Excel file can be detected --
  // not a security boundary, just a "does this still look like a real
  // export" sanity check per spec 5.1's "Workbook metadata... checksum".
  const checksumSource = JSON.stringify(sortedLeads.map((l) => [l.id, l.name, l.contact, l.stage, l.plotType, l.noPlots, l.discount, l.paymentPlan, l.priority, l.siteVisit, l.nextAction, l.notes]));
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
  wb.creator = 'Palmstead';
  wb.created = new Date(meta.exportedAt);

  const leadsSheet = wb.addWorksheet('LEADS', { properties: { tabColor: { argb: BRAND_GOLD } } });
  // 'company' (Company Leads -- clients who came to the company directly,
  // not through a specific agent) is a real, legitimate agent_key that
  // isn't a staff profile, so it's added explicitly -- otherwise the
  // dropdown wouldn't offer the one value those rows actually carry, and
  // import's own validation has to accept it too (see usePipelineImport.ts).
  writeLeadsSheet(leadsSheet, sortedLeads, staffByKey, [...input.staff.map((s) => s.key), 'company']);

  const paymentsSheet = wb.addWorksheet('PAYMENTS', { properties: { tabColor: { argb: 'FF9CA3AF' } } });
  writePaymentsSheet(paymentsSheet, input.payments, leadNameById);

  const allocationsSheet = wb.addWorksheet('ALLOCATIONS', { properties: { tabColor: { argb: 'FF9CA3AF' } } });
  writeAllocationsSheet(allocationsSheet, input.allocations, staffByKey);

  const instructionsSheet = wb.addWorksheet('INSTRUCTIONS', { properties: { tabColor: { argb: BRAND_INK } } });
  writeInstructionsSheet(instructionsSheet, meta);

  const metaSheet = wb.addWorksheet('_METADATA');
  writeMetadataSheet(metaSheet, meta);

  const buffer = await wb.xlsx.writeBuffer();
  return { buffer, meta };
}

export function canonicalPipelineFilename(sourceLabel: string, dateStr: string): string {
  const safe = sourceLabel.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `Palmstead_Pipeline_${safe}_${dateStr}.xlsx`;
}
