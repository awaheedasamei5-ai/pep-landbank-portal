import type ExcelJS from "exceljs";

import { type ExcelLead, LEADS_COLUMNS, SCHEMA_VERSION } from "@/lib/palmstead/pipeline-excel-workbook";
import {
  deriveStageFromPayment,
  type PaymentPlan,
  type PlotType,
  previewGrandTotal,
} from "@/lib/palmstead/pipeline-pricing-logic";
import type { AppConfigSubset } from "@/lib/palmstead/use-app-config";

// Real port of web-next's pipelineImportLogic.ts -- the "intelligent
// import" algorithm (Master Rebuild Spec Section 5.2): match by immutable
// Lead ID first (an unresolvable ID is held for review, never silently
// treated as new); a blank-ID row falls back to name+contact match (zero
// -> insert, exactly one -> update, more than one -> needs review); a
// duplicate Lead ID within the same file is blocked; a lead missing from
// the file is flagged possibly-deleted, never auto-archived; Amount Paid
// is never accepted as import input, full stop; a row edited live since
// export is held as a conflict, never silently overwritten.
export function normContact(c: unknown): string {
  return String(c ?? "").replace(/\D/g, "");
}

function xlCellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "object" && "text" in v && v.text != null) return String(v.text).trim();
  if (typeof v === "object" && "result" in v && v.result != null) return String(v.result).trim();
  return String(v).trim();
}
function xlCellNum(v: ExcelJS.CellValue): number | null {
  if (v == null || v === "") return null;
  const resolved = typeof v === "object" && "result" in v && v.result != null ? (v.result as ExcelJS.CellValue) : v;
  const n = Number.parseFloat(String(resolved));
  return Number.isNaN(n) ? null : n;
}

const HEADER_TO_KEY: Record<string, string> = Object.fromEntries(LEADS_COLUMNS.map((c) => [c.header, c.key]));

export function resolveLeadsColumns(ws: ExcelJS.Worksheet): Record<string, number> {
  const headerRowObj = ws.getRow(1);
  const found: Record<string, number> = {};
  for (let c = 1; c <= 40; c++) {
    const text = xlCellText(headerRowObj.getCell(c).value);
    const key = HEADER_TO_KEY[text];
    if (key) found[key] = c;
  }
  return found;
}

export function readWorkbookMeta(wb: ExcelJS.Workbook): {
  schemaVersion: string | null;
  exportedAt: string | null;
  sourceLabel: string | null;
} {
  const ws = wb.getWorksheet("_METADATA");
  if (!ws) return { schemaVersion: null, exportedAt: null, sourceLabel: null };
  const rows: Record<string, string> = {};
  for (let r = 1; r <= ws.rowCount; r++) {
    const key = xlCellText(ws.getRow(r).getCell(1).value);
    const value = xlCellText(ws.getRow(r).getCell(2).value);
    if (key) rows[key] = value;
  }
  return {
    schemaVersion: rows.schemaVersion || null,
    exportedAt: rows.exportedAt || null,
    sourceLabel: rows.sourceLabel || null,
  };
}

export interface ParsedImportRow {
  rowNumber: number;
  rowLabel: string;
  leadId: string;
  staffKey: string;
  name: string;
  contact: string;
  contactDigits: string;
  stage: string;
  plotType: string;
  noPlots: number | null;
  unitPrice: number | null;
  discount: number | null;
  paymentPlan: string;
  source: string;
  priority: string;
  nextAction: string;
  siteVisit: string;
  notes: string;
}

function parseRow(ws: ExcelJS.Worksheet, cols: Record<string, number>, r: number): ParsedImportRow | null {
  const row = ws.getRow(r);
  const get = (key: string) => (cols[key] ? row.getCell(cols[key]).value : null);
  const leadId = xlCellText(get("leadId"));
  const name = xlCellText(get("name"));
  const contact = xlCellText(get("contact"));
  if (!leadId && !name && !contact) return null;
  return {
    rowNumber: r,
    rowLabel: `Row ${r}${name ? ` (${name})` : ""}`,
    leadId,
    staffKey: xlCellText(get("staffKey")),
    name,
    contact,
    contactDigits: contact ? normContact(contact) : "",
    stage: xlCellText(get("stage")),
    plotType: xlCellText(get("plotType")),
    noPlots: xlCellNum(get("noPlots")),
    unitPrice: xlCellNum(get("unitPrice")),
    discount: xlCellNum(get("discount")),
    paymentPlan: xlCellText(get("paymentPlan")),
    source: xlCellText(get("source")),
    priority: xlCellText(get("priority")),
    nextAction: xlCellText(get("nextAction")),
    siteVisit: xlCellText(get("siteVisit")),
    notes: xlCellText(get("notes")),
  };
}

// Scans every row up to the sheet's real extent -- the export deliberately
// extends dropdown validation ~51 rows past the last real lead so a human
// has room to add a new client anywhere in that range.
export function readImportRows(ws: ExcelJS.Worksheet, cols: Record<string, number>): ParsedImportRow[] {
  const rows: ParsedImportRow[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const parsed = parseRow(ws, cols, r);
    if (parsed) rows.push(parsed);
  }
  return rows;
}

const STAGE_SET = new Set(["1", "2A", "2B", "3", "4", "Lost"]);
const PLOT_TYPE_SET = new Set(["Full Plot", "Half Plot"]);
const PAYMENT_PLAN_SET = new Set(["Full Payment", "3 Months", "6 Months", "9 Months", "12 Months"]);
const PRIORITY_SET = new Set(["High", "Medium", "Low"]);
const SITE_VISIT_SET = new Set(["Yes", "No"]);

export type MatchResult =
  | { kind: "insert" }
  | { kind: "update"; existing: ExcelLead }
  | { kind: "needsReview"; reason: string };

export function matchRow(row: ParsedImportRow, freshLeads: ExcelLead[]): MatchResult {
  if (row.leadId) {
    const existing = freshLeads.find((x) => x.id === row.leadId);
    return existing
      ? { kind: "update", existing }
      : {
          kind: "needsReview",
          reason: `Lead ID "${row.leadId}" was not found -- it may have been mistyped, or this client no longer exists.`,
        };
  }
  const name = row.name.trim().toLowerCase();
  const candidates = freshLeads.filter((x) => {
    const sameName = (x.name || "").trim().toLowerCase() === name;
    const sameContact = row.contactDigits ? normContact(x.contact) === row.contactDigits : false;
    return name && sameName && (sameContact || !row.contactDigits);
  });
  if (candidates.length === 0) return { kind: "insert" };
  if (candidates.length === 1) return { kind: "update", existing: candidates[0] };
  return {
    kind: "needsReview",
    reason: `"${row.name}" matches ${candidates.length} existing clients by name -- add the Lead ID to pick the right one.`,
  };
}

export interface RowValidation {
  valid: boolean;
  errors: string[];
}

export function validateRow(row: ParsedImportRow, validStaffKeys: Set<string>): RowValidation {
  const errors: string[] = [];
  if (!row.name) errors.push("Client Name is required.");
  if (row.contact && row.contactDigits.length < 7)
    errors.push(`Contact number looks too short to be valid ("${row.contact}").`);
  if (row.staffKey && !validStaffKeys.has(row.staffKey))
    errors.push(`Staff Key "${row.staffKey}" does not match any real staff member.`);
  if (row.stage && !STAGE_SET.has(row.stage))
    errors.push(`Stage "${row.stage}" is not one of: ${[...STAGE_SET].join(", ")}.`);
  if (row.plotType && !PLOT_TYPE_SET.has(row.plotType))
    errors.push(`Plot Type "${row.plotType}" is not one of: ${[...PLOT_TYPE_SET].join(", ")}.`);
  if (row.paymentPlan && !PAYMENT_PLAN_SET.has(row.paymentPlan))
    errors.push(`Payment Plan "${row.paymentPlan}" is not one of: ${[...PAYMENT_PLAN_SET].join(", ")}.`);
  if (row.priority && !PRIORITY_SET.has(row.priority))
    errors.push(`Priority "${row.priority}" is not one of: ${[...PRIORITY_SET].join(", ")}.`);
  if (row.siteVisit && !SITE_VISIT_SET.has(row.siteVisit))
    errors.push(`Site Visit "${row.siteVisit}" is not one of: ${[...SITE_VISIT_SET].join(", ")}.`);
  if (row.noPlots != null && row.noPlots <= 0) errors.push("No. Plots must be greater than zero.");
  if (row.unitPrice != null && row.unitPrice < 0) errors.push("Unit Price cannot be negative.");
  if (row.discount != null && row.discount < 0) errors.push("Discount cannot be negative.");
  return { valid: errors.length === 0, errors };
}

export interface ScanBuckets {
  toAdd: number;
  toUpdate: number;
  unchanged: number;
  needsReview: number;
  invalid: number;
  skipped: number;
  duplicateIdsInFile: number;
  possiblyDeleted: number;
  conflicts: number;
}

function fieldsChanged(row: ParsedImportRow, existing: ExcelLead): boolean {
  return (
    (!!row.staffKey && row.staffKey !== existing.agentKey) ||
    existing.name !== row.name ||
    existing.contact !== row.contact ||
    existing.stage !== row.stage ||
    existing.plotType !== row.plotType ||
    (row.noPlots != null && existing.noPlots !== row.noPlots) ||
    (row.unitPrice != null && existing.unitPrice !== row.unitPrice) ||
    (row.discount != null && (existing.discount ?? 0) !== row.discount) ||
    existing.paymentPlan !== row.paymentPlan ||
    (existing.leadSource ?? "") !== row.source ||
    // biome-ignore-start lint/nursery/useNullishCoalescing: an empty-string existing value should also fall through to the same default the row itself falls back to, matching web-next's exact comparison.
    (existing.priority || "Low") !== (row.priority || "Low") ||
    (existing.nextAction || "") !== row.nextAction ||
    (existing.siteVisit || "No") !== (row.siteVisit || "No") ||
    (existing.notes || "") !== row.notes
    // biome-ignore-end lint/nursery/useNullishCoalescing: see above
  );
}

function checkForeignId(
  row: ParsedImportRow,
  foreignLeadIds?: Set<string>,
): { kind: "needsReview"; reason: string } | null {
  if (row.leadId && foreignLeadIds?.has(row.leadId)) {
    return {
      kind: "needsReview",
      reason: `Lead ID "${row.leadId}" belongs to another staff member's pipeline -- you can only import changes to your own leads.`,
    };
  }
  return null;
}

export function scanImportRows(
  rows: ParsedImportRow[],
  freshLeads: ExcelLead[],
  validStaffKeys: Set<string>,
  exportedAt: Date | null,
  foreignLeadIds?: Set<string>,
): ScanBuckets {
  const buckets: ScanBuckets = {
    toAdd: 0,
    toUpdate: 0,
    unchanged: 0,
    needsReview: 0,
    invalid: 0,
    skipped: 0,
    duplicateIdsInFile: 0,
    possiblyDeleted: 0,
    conflicts: 0,
  };
  const seenIds = new Map<string, number>();
  for (const row of rows) if (row.leadId) seenIds.set(row.leadId, (seenIds.get(row.leadId) ?? 0) + 1);

  const coveredIds = new Set<string>();
  for (const row of rows) {
    if (row.leadId && (seenIds.get(row.leadId) ?? 0) > 1) {
      buckets.duplicateIdsInFile++;
      continue;
    }
    if (!row.name && !row.leadId) {
      buckets.skipped++;
      continue;
    }
    const validation = validateRow(row, validStaffKeys);
    if (!validation.valid) {
      buckets.invalid++;
      continue;
    }
    if (checkForeignId(row, foreignLeadIds)) {
      buckets.needsReview++;
      continue;
    }
    const match = matchRow(row, freshLeads);
    if (match.kind === "needsReview") {
      buckets.needsReview++;
    } else if (match.kind === "insert") {
      buckets.toAdd++;
    } else {
      coveredIds.add(match.existing.id);
      if (!fieldsChanged(row, match.existing)) {
        buckets.unchanged++;
      } else if (exportedAt && match.existing.lastModifiedAt && new Date(match.existing.lastModifiedAt) > exportedAt) {
        buckets.conflicts++;
      } else {
        buckets.toUpdate++;
      }
    }
  }
  buckets.possiblyDeleted = freshLeads.filter(
    (l) => !coveredIds.has(l.id) && !rows.some((r) => r.leadId === l.id),
  ).length;
  return buckets;
}

export interface NewLeadPlan {
  name: string;
  contact: string;
  plotType: PlotType;
  noPlots: number;
  unitPrice: number;
  notes: string;
}
export interface LeadPatchPlan {
  name: string;
  contact: string;
  stage: string;
  plotType: PlotType;
  noPlots: number;
  unitPrice: number;
  discount: number;
  paymentPlan: PaymentPlan;
  siteVisit: string;
  priority: string;
  nextAction: string;
  notes: string;
  leadSource: string;
  netTotal: number;
  grandTotal: number;
}

export type ImportPlanItem =
  | {
      kind: "insert";
      row: ParsedImportRow;
      input: NewLeadPlan;
      followupPatch: {
        stage: string;
        discount: number;
        siteVisit: string;
        priority: string;
        nextAction: string;
        netTotal: number;
        grandTotal: number;
      };
      agentKey: string;
    }
  | {
      kind: "update";
      row: ParsedImportRow;
      existing: ExcelLead;
      patch: LeadPatchPlan;
      reassignToAgentKey: string | null;
    }
  | { kind: "unchanged"; row: ParsedImportRow }
  | { kind: "needsReview"; row: ParsedImportRow; reason: string }
  | { kind: "invalid"; row: ParsedImportRow; errors: string[] }
  | { kind: "conflict"; row: ParsedImportRow; existing: ExcelLead }
  | { kind: "duplicateId"; row: ParsedImportRow }
  | { kind: "skip"; row: ParsedImportRow };

function freshTotals(
  config: AppConfigSubset,
  unitPrice: number,
  noPlots: number,
  discount: number,
  paymentPlan: PaymentPlan,
  plotType: PlotType,
): { net: number; grand: number } {
  const preview = previewGrandTotal(config, plotType, noPlots || 1, unitPrice, discount, paymentPlan);
  return { net: preview.net, grand: preview.grand };
}

export function planImportRows(
  rows: ParsedImportRow[],
  freshLeads: ExcelLead[],
  config: AppConfigSubset,
  validStaffKeys: Set<string>,
  importerKey: string,
  exportedAt: Date | null,
  foreignLeadIds?: Set<string>,
  lockedStaffKey?: string | null,
): ImportPlanItem[] {
  const seenIds = new Map<string, number>();
  for (const row of rows) if (row.leadId) seenIds.set(row.leadId, (seenIds.get(row.leadId) ?? 0) + 1);

  return rows.map((row): ImportPlanItem => {
    if (row.leadId && (seenIds.get(row.leadId) ?? 0) > 1) return { kind: "duplicateId", row };
    if (!row.name && !row.leadId) return { kind: "skip", row };

    const validation = validateRow(row, validStaffKeys);
    if (!validation.valid) return { kind: "invalid", row, errors: validation.errors };

    const foreignCheck = checkForeignId(row, foreignLeadIds);
    if (foreignCheck) return { kind: "needsReview", row, reason: foreignCheck.reason };

    const match = matchRow(row, freshLeads);
    if (match.kind === "needsReview") return { kind: "needsReview", row, reason: match.reason };

    const plotType = (row.plotType || "Full Plot") as PlotType;
    const paymentPlan = (row.paymentPlan || "Full Payment") as PaymentPlan;
    const noPlots = row.noPlots ?? 1;

    if (match.kind === "insert") {
      const unitPrice = row.unitPrice ?? (plotType === "Half Plot" ? config.halfPrice : config.fullPrice);
      const totals = freshTotals(config, unitPrice, noPlots, row.discount ?? 0, paymentPlan, plotType);
      const input: NewLeadPlan = {
        name: row.name,
        contact: row.contact,
        plotType,
        noPlots,
        unitPrice,
        notes: row.notes,
      };
      const followupPatch = {
        stage: row.stage || "1",
        discount: row.discount ?? 0,
        siteVisit: row.siteVisit || "No",
        priority: row.priority || "Low",
        nextAction: row.nextAction,
        netTotal: totals.net,
        grandTotal: totals.grand,
      };
      const agentKey =
        lockedStaffKey ?? (row.staffKey && validStaffKeys.has(row.staffKey) ? row.staffKey : importerKey);
      return { kind: "insert", row, input, followupPatch, agentKey };
    }

    const existing = match.existing;
    if (!fieldsChanged(row, existing)) return { kind: "unchanged", row };

    const isStaleConflict = !!(exportedAt && existing.lastModifiedAt && new Date(existing.lastModifiedAt) > exportedAt);
    if (isStaleConflict) return { kind: "conflict", row, existing };

    const wantsReassign = !lockedStaffKey && row.staffKey && row.staffKey !== existing.agentKey;
    const reassignToAgentKey = wantsReassign ? row.staffKey : null;
    const unitPrice = row.unitPrice ?? existing.unitPrice;
    const discount = row.discount ?? existing.discount ?? 0;
    const totals = freshTotals(config, unitPrice, noPlots, discount, paymentPlan, plotType);
    const patch: LeadPatchPlan = {
      name: row.name,
      contact: row.contact,
      stage: row.stage || existing.stage,
      plotType,
      noPlots,
      unitPrice,
      discount,
      paymentPlan,
      siteVisit: row.siteVisit || "No",
      priority: row.priority || "Low",
      nextAction: row.nextAction,
      notes: row.notes,
      leadSource: row.source,
      netTotal: totals.net,
      grandTotal: totals.grand,
    };
    return { kind: "update", row, existing, patch, reassignToAgentKey };
  });
}

export { deriveStageFromPayment };
export const IMPORT_SCHEMA_VERSION = SCHEMA_VERSION;
