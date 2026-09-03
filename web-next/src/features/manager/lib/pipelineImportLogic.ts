import type ExcelJS from 'exceljs';
import type { Config, Lead, LeadUpdate, NewLead, PaymentPlan, PlotType, Stage } from '../../../types/domain';
import { normContact, num } from '../../../shared/lib/format';
import { STAGES } from '../../pipeline/lib/pipelineLogic';
import { interestFor, pricingFor } from '../../quotation/lib/quotationLogic';
import { LEADS_COLUMNS, SCHEMA_VERSION } from './pipelineCanonicalWorkbook';

// Import algorithm for the canonical workbook (pipelineCanonicalWorkbook.ts),
// built per the Master Rebuild Specification, Section 5.2 ("Intelligent
// import algorithm") -- a real, materially different design from a naive
// "diff and apply" import, because the spec calls out specific failure
// modes a naive version produces:
//
//  1. Match by immutable Lead ID FIRST -- not name+contact first with ID as
//     a fallback. A row with a Lead ID that doesn't resolve to a real lead
//     is NOT silently treated as new (that would create a duplicate the
//     moment someone's Lead ID cell got mistyped/corrupted) -- it's held
//     for manual review instead.
//  2. A row with NO Lead ID (a human-added brand-new client, or a legacy
//     row) is matched by normalized name+contact. Zero matches -> genuinely
//     new. Exactly one match -> that's the row's real target. More than
//     one -> genuinely ambiguous, and per spec "put the row into Needs
//     Review instead of guessing."
//  3. Payments are locked, full stop -- confirmed directly with the user,
//     overriding the spec's own "correction/reversal workflow requiring
//     authorization" language for a changed payment amount. No account,
//     including Management, can change Amount Paid through this workbook.
//     Payments are only ever logged through the Log Payment screen. The
//     PAYMENTS sheet is reference-only and this algorithm never reads it
//     for writing; the LEADS sheet's Amount Paid/Net/Grand/Balance columns
//     are read for the row's context but never accepted as input (see
//     LEADS_COLUMNS[].editable).
//  4. A duplicate Lead ID within the SAME file is blocked outright (spec
//     5.3's own acceptance test), not silently processed twice.
//  5. A lead present in the database but absent from the file is flagged
//     as possibly deleted -- never auto-deleted (spec 5.2.8) -- and needs
//     an explicit archive decision per row at commit time.
//  6. A row that fails validation (bad number, an enum value outside the
//     dropdown's real options) is held as Invalid and never partially
//     committed -- the whole row is rejected, not just the bad field.

const HEADER_TO_KEY: Record<string, string> = Object.fromEntries(LEADS_COLUMNS.map((c) => [c.header, c.key]));

function xlCellText(v: ExcelJS.CellValue): string {
  if (v == null) return '';
  if (typeof v === 'object' && 'text' in v && v.text != null) return String(v.text).trim();
  if (typeof v === 'object' && 'result' in v && v.result != null) return String(v.result).trim();
  return String(v).trim();
}
function xlCellNum(v: ExcelJS.CellValue): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'object' && 'result' in v && v.result != null) v = v.result as ExcelJS.CellValue;
  const n = parseFloat(String(v));
  return Number.isNaN(n) ? null : n;
}

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

export function readWorkbookMeta(wb: ExcelJS.Workbook): { schemaVersion: string | null; exportedAt: string | null; sourceLabel: string | null } {
  const ws = wb.getWorksheet('_METADATA');
  if (!ws) return { schemaVersion: null, exportedAt: null, sourceLabel: null };
  const rows: Record<string, string> = {};
  for (let r = 1; r <= ws.rowCount; r++) {
    const key = xlCellText(ws.getRow(r).getCell(1).value);
    const value = xlCellText(ws.getRow(r).getCell(2).value);
    if (key) rows[key] = value;
  }
  return { schemaVersion: rows.schemaVersion || null, exportedAt: rows.exportedAt || null, sourceLabel: rows.sourceLabel || null };
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
  const leadId = xlCellText(get('leadId'));
  const name = xlCellText(get('name'));
  const contact = xlCellText(get('contact'));
  if (!leadId && !name && !contact) return null;
  return {
    rowNumber: r,
    rowLabel: `Row ${r}${name ? ` (${name})` : ''}`,
    leadId,
    staffKey: xlCellText(get('staffKey')),
    name,
    contact,
    contactDigits: contact ? normContact(contact) : '',
    stage: xlCellText(get('stage')),
    plotType: xlCellText(get('plotType')),
    noPlots: xlCellNum(get('noPlots')),
    unitPrice: xlCellNum(get('unitPrice')),
    discount: xlCellNum(get('discount')),
    paymentPlan: xlCellText(get('paymentPlan')),
    source: xlCellText(get('source')),
    priority: xlCellText(get('priority')),
    nextAction: xlCellText(get('nextAction')),
    siteVisit: xlCellText(get('siteVisit')),
    notes: xlCellText(get('notes')),
  };
}

// Scans every row up to the sheet's real extent, never stopping early on a
// run of blanks. A first draft stopped after 5 consecutive blank rows --
// wrong, and caught live: the export deliberately extends dropdown
// validation ~51 rows past the last real lead (writeLeadsSheet's own
// comment) so a human has room to add a new client anywhere in that
// range without hunting for "the exact next row". A new row placed more
// than 5 rows below the last real one -- completely normal given that
// range exists -- was silently never read.
export function readImportRows(ws: ExcelJS.Worksheet, cols: Record<string, number>): ParsedImportRow[] {
  const rows: ParsedImportRow[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const parsed = parseRow(ws, cols, r);
    if (parsed) rows.push(parsed);
  }
  return rows;
}

const STAGE_SET = new Set<string>(STAGES);
const PLOT_TYPE_SET = new Set(['Full Plot', 'Half Plot']);
const PAYMENT_PLAN_SET = new Set(['Full Payment', '3 Months', '6 Months', '9 Months', '12 Months']);
const PRIORITY_SET = new Set(['High', 'Medium', 'Low']);
const SITE_VISIT_SET = new Set(['Yes', 'No']);

export type MatchResult = { kind: 'insert' } | { kind: 'update'; existing: Lead } | { kind: 'needsReview'; reason: string };

// Spec 5.2.3-4: Lead ID first; name+contact confidence match only as a
// fallback for rows with no ID. A present-but-unresolvable ID is held for
// review rather than silently becoming a new (duplicate-risking) insert.
export function matchRow(row: ParsedImportRow, freshLeads: Lead[]): MatchResult {
  if (row.leadId) {
    const existing = freshLeads.find((x) => x.id === row.leadId);
    return existing ? { kind: 'update', existing } : { kind: 'needsReview', reason: `Lead ID "${row.leadId}" was not found -- it may have been mistyped, or this client no longer exists.` };
  }
  const name = row.name.trim().toLowerCase();
  const candidates = freshLeads.filter((x) => {
    const sameName = (x.name || '').trim().toLowerCase() === name;
    const sameContact = row.contactDigits ? normContact(x.contact) === row.contactDigits : false;
    return name && sameName && (sameContact || !row.contactDigits);
  });
  if (candidates.length === 0) return { kind: 'insert' };
  if (candidates.length === 1) return { kind: 'update', existing: candidates[0] };
  return { kind: 'needsReview', reason: `"${row.name}" matches ${candidates.length} existing clients by name -- add the Lead ID to pick the right one.` };
}

export interface RowValidation {
  valid: boolean;
  errors: string[];
}

export function validateRow(row: ParsedImportRow, validStaffKeys: Set<string>): RowValidation {
  const errors: string[] = [];
  if (!row.name) errors.push('Client Name is required.');
  if (row.contact && row.contactDigits.length < 7) errors.push(`Contact number looks too short to be valid ("${row.contact}").`);
  if (row.staffKey && !validStaffKeys.has(row.staffKey)) errors.push(`Staff Key "${row.staffKey}" does not match any real staff member.`);
  if (row.stage && !STAGE_SET.has(row.stage)) errors.push(`Stage "${row.stage}" is not one of: ${[...STAGE_SET].join(', ')}.`);
  if (row.plotType && !PLOT_TYPE_SET.has(row.plotType)) errors.push(`Plot Type "${row.plotType}" is not one of: ${[...PLOT_TYPE_SET].join(', ')}.`);
  if (row.paymentPlan && !PAYMENT_PLAN_SET.has(row.paymentPlan)) errors.push(`Payment Plan "${row.paymentPlan}" is not one of: ${[...PAYMENT_PLAN_SET].join(', ')}.`);
  if (row.priority && !PRIORITY_SET.has(row.priority)) errors.push(`Priority "${row.priority}" is not one of: ${[...PRIORITY_SET].join(', ')}.`);
  if (row.siteVisit && !SITE_VISIT_SET.has(row.siteVisit)) errors.push(`Site Visit "${row.siteVisit}" is not one of: ${[...SITE_VISIT_SET].join(', ')}.`);
  if (row.noPlots != null && row.noPlots <= 0) errors.push('No. Plots must be greater than zero.');
  if (row.unitPrice != null && row.unitPrice < 0) errors.push('Unit Price cannot be negative.');
  if (row.discount != null && row.discount < 0) errors.push('Discount cannot be negative.');
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
}

function fieldsChanged(row: ParsedImportRow, existing: Lead): boolean {
  return (
    (!!row.staffKey && row.staffKey !== existing.agent) ||
    existing.name !== row.name ||
    existing.contact !== row.contact ||
    existing.stage !== row.stage ||
    existing.plotType !== row.plotType ||
    (row.noPlots != null && num(existing.noPlots) !== row.noPlots) ||
    (row.unitPrice != null && num(existing.unitPrice) !== row.unitPrice) ||
    (row.discount != null && num(existing.discount ?? 0) !== row.discount) ||
    existing.paymentPlan !== row.paymentPlan ||
    (existing.leadSource ?? '') !== row.source ||
    (existing.priority || 'Low') !== (row.priority || 'Low') ||
    (existing.nextAction || '') !== row.nextAction ||
    (existing.siteVisit || 'No') !== (row.siteVisit || 'No') ||
    (existing.notes || '') !== row.notes
  );
}

export function scanImportRows(rows: ParsedImportRow[], freshLeads: Lead[], validStaffKeys: Set<string>): ScanBuckets {
  const buckets: ScanBuckets = { toAdd: 0, toUpdate: 0, unchanged: 0, needsReview: 0, invalid: 0, skipped: 0, duplicateIdsInFile: 0, possiblyDeleted: 0 };
  const seenIds = new Map<string, number>();
  rows.forEach((row) => {
    if (row.leadId) seenIds.set(row.leadId, (seenIds.get(row.leadId) ?? 0) + 1);
  });

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
    const match = matchRow(row, freshLeads);
    if (match.kind === 'needsReview') {
      buckets.needsReview++;
    } else if (match.kind === 'insert') {
      buckets.toAdd++;
    } else {
      coveredIds.add(match.existing.id);
      if (fieldsChanged(row, match.existing)) buckets.toUpdate++;
      else buckets.unchanged++;
    }
  }
  buckets.possiblyDeleted = freshLeads.filter((l) => !coveredIds.has(l.id) && !rows.some((r) => r.leadId === l.id)).length;
  return buckets;
}

export type ImportPlanItem =
  | { kind: 'insert'; row: ParsedImportRow; input: NewLead; followupPatch: LeadUpdate; agentKey: string | null }
  | { kind: 'update'; row: ParsedImportRow; existing: Lead; patch: LeadUpdate; reassignToAgentKey: string | null }
  | { kind: 'unchanged'; row: ParsedImportRow }
  | { kind: 'needsReview'; row: ParsedImportRow; reason: string }
  | { kind: 'invalid'; row: ParsedImportRow; errors: string[] }
  | { kind: 'conflict'; row: ParsedImportRow; existing: Lead }
  | { kind: 'duplicateId'; row: ParsedImportRow }
  | { kind: 'skip'; row: ParsedImportRow };

// Fresh net/grand, same reasoning as before: never trust a stale imported
// total, always derive from the row's own noPlots/unitPrice/discount/
// paymentPlan. Unlike the old template import, unitPrice is now a real,
// visible, editable column on the canonical sheet (not silently defaulted
// from the pricing config), so it's read straight from the row.
function freshTotals(config: Config, unitPrice: number, noPlots: number, discount: number, paymentPlan: PaymentPlan, plotType: PlotType): { net: number; grand: number } {
  const p = pricingFor(config, plotType);
  const gross = unitPrice * noPlots;
  const net = Math.max(gross - discount, 0);
  const eq = p.eq * noPlots;
  const interestTotal = interestFor(config, paymentPlan) * eq;
  return { net, grand: net + interestTotal };
}

export function planImportRows(rows: ParsedImportRow[], freshLeads: Lead[], config: Config, validStaffKeys: Set<string>, importerKey: string, exportedAt: Date | null): ImportPlanItem[] {
  const seenIds = new Map<string, number>();
  rows.forEach((row) => {
    if (row.leadId) seenIds.set(row.leadId, (seenIds.get(row.leadId) ?? 0) + 1);
  });

  return rows.map((row): ImportPlanItem => {
    if (row.leadId && (seenIds.get(row.leadId) ?? 0) > 1) return { kind: 'duplicateId', row };
    if (!row.name && !row.leadId) return { kind: 'skip', row };

    const validation = validateRow(row, validStaffKeys);
    if (!validation.valid) return { kind: 'invalid', row, errors: validation.errors };

    const match = matchRow(row, freshLeads);
    if (match.kind === 'needsReview') return { kind: 'needsReview', row, reason: match.reason };

    const plotType = (row.plotType || 'Full Plot') as PlotType;
    const paymentPlan = (row.paymentPlan || 'Full Payment') as PaymentPlan;
    const noPlots = row.noPlots ?? 1;

    if (match.kind === 'insert') {
      const unitPrice = row.unitPrice ?? pricingFor(config, plotType).list;
      const totals = freshTotals(config, unitPrice, noPlots, row.discount ?? 0, paymentPlan, plotType);
      const input: NewLead = { name: row.name, contact: row.contact, plotType, noPlots, unitPrice, paymentPlan, amtPaid: 0, notes: row.notes };
      const followupPatch: LeadUpdate = {
        stage: (row.stage || '1') as Stage,
        discount: row.discount ?? 0,
        siteVisit: row.siteVisit || 'No',
        priority: row.priority || 'Low',
        nextAction: row.nextAction,
        netTotal: totals.net,
        grandTotal: totals.grand,
      };
      // A brand-new row (blank Lead ID) with a real Staff Key attributes
      // straight to that agent; with no key, it defaults to whoever is
      // running the import, matching the old notes-tag fallback behavior.
      const agentKey = row.staffKey && validStaffKeys.has(row.staffKey) ? row.staffKey : importerKey;
      return { kind: 'insert', row, input, followupPatch, agentKey };
    }

    const existing = match.existing;
    if (!fieldsChanged(row, existing)) return { kind: 'unchanged', row };

    const isStaleConflict = !!(exportedAt && existing.lastModifiedAt && new Date(existing.lastModifiedAt) > exportedAt);
    if (isStaleConflict) return { kind: 'conflict', row, existing };

    const reassignToAgentKey = row.staffKey && row.staffKey !== existing.agent ? row.staffKey : null;
    const unitPrice = row.unitPrice ?? existing.unitPrice;
    const discount = row.discount ?? (existing.discount ?? 0);
    const totals = freshTotals(config, unitPrice, noPlots, discount, paymentPlan, plotType);
    const patch: LeadUpdate = {
      name: row.name,
      contact: row.contact,
      stage: (row.stage || existing.stage) as Stage,
      plotType,
      noPlots,
      unitPrice,
      discount,
      paymentPlan,
      siteVisit: row.siteVisit || 'No',
      priority: row.priority || 'Low',
      nextAction: row.nextAction,
      notes: row.notes,
      leadSource: row.source,
      netTotal: totals.net,
      grandTotal: totals.grand,
    };
    return { kind: 'update', row, existing, patch, reassignToAgentKey };
  });
}

export const IMPORT_SCHEMA_VERSION = SCHEMA_VERSION;
