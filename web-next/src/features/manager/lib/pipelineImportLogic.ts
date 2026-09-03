import type ExcelJS from 'exceljs';
import type { Config, Lead, LeadUpdate, NewLead, PaymentPlan, PlotType, Stage } from '../../../types/domain';
import { normContact, num } from '../../../shared/lib/format';
import { STAGES } from '../../pipeline/lib/pipelineLogic';
import { interestFor, pricingFor } from '../../quotation/lib/quotationLogic';
import { PL_DATA_END, PL_DATA_START, PL_HEADER_ROW, PL_INPUT_COLS } from './pipelineTemplateExcel';

// Faithful port of index.html's pipeline Excel import (resolveImportColumns/
// scanImportFile/importPipelineExcel, index.html:20196-20450) -- the master
// spec flagged this exact class of bug ("Excel import/restore creating
// duplicates instead of reconciling"), and web-next had no import path at
// all yet to reintroduce it in. Every design choice below exists because
// legacy's own comments document the real bug it fixes:
//
// - Column position is read from the ACTUAL header row (resolveImportColumns),
//   never a fixed offset -- inserting/deleting a column in Excel used to
//   silently read the wrong cell, which was the root cause of leads
//   duplicating on re-import instead of updating (index.html:20196-20200).
// - Matching against existing leads always uses a FRESH server fetch, never
//   whatever happens to already be in memory -- a stale/out-of-scope list is
//   what silently doubled whole pipelines on re-import: every existing row
//   looked "new" because it wasn't found (index.html:20319-20323).
// - Match by name+contact first (most reliable, survives a shifted/cleared
//   Lead ID column), Lead ID as fallback, name-only as last resort
//   (index.html:20370-20383).

const PL_HEADER_TEXT: Record<string, string> = {
  name: 'Lead Name',
  contact: 'Contact',
  date: 'Date Added',
  stage: 'Stage',
  plotType: 'Plot Type',
  noPlots: 'No. Plots',
  discount: 'Discount (GHS)',
  paymentPlan: 'Payment Plan',
  siteVisit: 'Site Visit',
  priority: 'Priority',
  amtPaid: 'Amt Paid (GHS)',
  nextAction: 'Next Action',
  notes: 'Notes',
  leadId: 'Lead ID (do not edit)',
};

function xlCellText(v: ExcelJS.CellValue): string {
  if (v == null) return '';
  if (typeof v === 'object' && 'text' in v && v.text != null) return String(v.text).trim();
  if (typeof v === 'object' && 'result' in v && v.result != null) return String(v.result).trim();
  return String(v).trim();
}
function xlCellDate(v: ExcelJS.CellValue): string {
  if (v == null || v === '') return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object' && 'result' in v && v.result != null) return xlCellDate(v.result as ExcelJS.CellValue);
  return String(v).trim();
}
function xlCellNum(v: ExcelJS.CellValue): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'object' && 'result' in v && v.result != null) v = v.result as ExcelJS.CellValue;
  const n = parseFloat(String(v));
  return Number.isNaN(n) ? null : n;
}

export function resolveImportColumns(ws: ExcelJS.Worksheet): Record<string, number> {
  const headerRow = ws.getRow(PL_HEADER_ROW);
  const found: Record<string, number> = {};
  for (let c = 1; c <= 60; c++) {
    const text = xlCellText(headerRow.getCell(c).value);
    if (!text) continue;
    Object.keys(PL_HEADER_TEXT).forEach((key) => {
      if (text === PL_HEADER_TEXT[key]) found[key] = c;
    });
  }
  Object.keys(PL_INPUT_COLS).forEach((key) => {
    if (!found[key]) found[key] = PL_INPUT_COLS[key];
  });
  return found;
}

export interface ParsedImportRow {
  rowNumber: number;
  rowLabel: string;
  name: string;
  leadId: string;
  contact: string;
  contactDigits: string;
  date: string;
  stage: Stage;
  plotType: PlotType;
  noPlots: number;
  discount: number;
  paymentPlan: PaymentPlan;
  siteVisit: string;
  priority: string;
  amtPaid: number;
  nextAction: string;
  notes: string;
  // Master Pipeline exports tag each row's Notes with "[Agent Name] ..."
  // (buildMasterPipelineExcel's tagAgentInNotes, index.html:20338-20342) so
  // a re-import can put a brand-new row back under the RIGHT agent instead
  // of re-attributing everyone to whoever happens to be doing the
  // importing. The prefix is stripped from `notes` above; the resolved key
  // (or null if the tag didn't match a real agent) lives here.
  taggedAgentKey: string | null;
}

function parseRow(ws: ExcelJS.Worksheet, cols: Record<string, number>, r: number, nameToAgentKey: Record<string, string>): ParsedImportRow | null {
  const row = ws.getRow(r);
  const get = (key: string) => row.getCell(cols[key]).value;
  const name = xlCellText(get('name'));
  const leadId = xlCellText(get('leadId'));
  if (!name && !leadId) return null;
  const contact = xlCellText(get('contact'));
  const stageRaw = xlCellText(get('stage'));
  const stage = (STAGES as string[]).includes(stageRaw) ? (stageRaw as Stage) : '1';
  let notes = xlCellText(get('notes'));
  let taggedAgentKey: string | null = null;
  const tagMatch = notes.match(/^\[([^\]]+)\]\s*/);
  if (tagMatch) {
    taggedAgentKey = nameToAgentKey[tagMatch[1].trim().toLowerCase()] || null;
    notes = notes.slice(tagMatch[0].length);
  }
  return {
    rowNumber: r,
    rowLabel: `Row ${r}${name ? ` (${name})` : ''}`,
    name,
    leadId,
    contact,
    contactDigits: contact ? normContact(contact) : '',
    date: xlCellDate(get('date')),
    stage,
    plotType: (xlCellText(get('plotType')) || 'Full Plot') as PlotType,
    noPlots: xlCellNum(get('noPlots')) || 1,
    discount: xlCellNum(get('discount')) || 0,
    paymentPlan: (xlCellText(get('paymentPlan')) || 'Full Payment') as PaymentPlan,
    siteVisit: xlCellText(get('siteVisit')) || 'No',
    priority: xlCellText(get('priority')) || 'Low',
    amtPaid: xlCellNum(get('amtPaid')) || 0,
    nextAction: xlCellText(get('nextAction')),
    notes,
    taggedAgentKey,
  };
}

// Walks every data row, same bounded-but-tolerant loop as legacy
// (index.html:20236-20242/20345-20351) -- stop at the template's real
// range unless rows were genuinely added, but give up 5 rows past that
// once blank rows (no name, no Lead ID) start appearing. nameToAgentKey
// (lowercased agent name -> agent key) resolves the "[Agent Name]" Notes
// tag Master Pipeline exports write -- pass {} for a plain agent's own-
// pipeline import, which never carries that tag anyway.
export function readImportRows(ws: ExcelJS.Worksheet, cols: Record<string, number>, nameToAgentKey: Record<string, string> = {}): ParsedImportRow[] {
  const rows: ParsedImportRow[] = [];
  let r = PL_DATA_START;
  const lastPossible = Math.max(ws.rowCount, PL_DATA_END) + 1;
  while (r <= lastPossible) {
    const parsed = parseRow(ws, cols, r, nameToAgentKey);
    if (!parsed) {
      if (r > PL_DATA_END + 5) break;
      r++;
      continue;
    }
    rows.push(parsed);
    r++;
  }
  return rows;
}

export function findExistingLead(row: ParsedImportRow, freshLeads: Lead[]): Lead | undefined {
  const name = row.name.trim().toLowerCase();
  if (row.contact) {
    const byNameContact = freshLeads.find((x) => (x.name || '').trim().toLowerCase() === name && normContact(x.contact) === row.contactDigits);
    if (byNameContact) return byNameContact;
  }
  if (row.leadId) {
    const byId = freshLeads.find((x) => x.id === row.leadId);
    if (byId) return byId;
  }
  if (!row.contact) {
    return freshLeads.find((x) => (x.name || '').trim().toLowerCase() === name);
  }
  return undefined;
}

export interface ImportScanResult {
  toAdd: number;
  toUpdate: number;
  skipped: number;
  warnings: string[];
}

// Read-only pre-import scan -- mirrors the real matching/validation without
// writing anything, so a bad file can be reviewed before it ever touches
// real client data (index.html:20213-20217's exact reasoning).
export function scanImportRows(rows: ParsedImportRow[], freshLeads: Lead[]): ImportScanResult {
  let toAdd = 0;
  let toUpdate = 0;
  let skipped = 0;
  const warnings: string[] = [];
  const seenInFile = new Set<string>();
  for (const row of rows) {
    if (!row.name) {
      skipped++;
      continue;
    }
    if (row.contact && row.contactDigits.length < 7) warnings.push(`${row.rowLabel}: contact number looks too short to be valid ("${row.contact}")`);
    if (row.discount < 0) warnings.push(`${row.rowLabel}: negative discount (${row.discount})`);
    if (row.amtPaid < 0) warnings.push(`${row.rowLabel}: negative amount paid (${row.amtPaid})`);
    if (row.noPlots <= 0) warnings.push(`${row.rowLabel}: plot count is zero or negative`);
    const dupKey = row.name.trim().toLowerCase() + '|' + row.contactDigits;
    if (row.contact && seenInFile.has(dupKey)) warnings.push(`${row.rowLabel}: appears more than once in this file (same name + contact)`);
    seenInFile.add(dupKey);
    if (findExistingLead(row, freshLeads)) toUpdate++;
    else toAdd++;
  }
  return { toAdd, toUpdate, skipped, warnings };
}

export type ImportPlanItem =
  // leads.create()/NewLead only carry the fields every existing caller
  // (AddLeadScreen etc.) already needs -- no discount/stage/priority/
  // siteVisit/nextAction. Rather than widen that shared type for import's
  // sake (and touch every other create() call site), a brand-new row from
  // the file is created with the basics, then immediately patched with the
  // rest via the same update() path an existing row's reconciliation
  // already uses -- two calls, same net effect as legacy's single insert.
  | { kind: 'insert'; row: ParsedImportRow; input: NewLead; followupPatch: LeadUpdate; agentKey: string | null }
  | { kind: 'update'; row: ParsedImportRow; existing: Lead; patch: LeadUpdate; amtPaidIncrease: number }
  | { kind: 'unchanged'; row: ParsedImportRow }
  | { kind: 'conflict'; row: ParsedImportRow; existing: Lead }
  | { kind: 'skip'; row: ParsedImportRow };

// Computes net/grand exactly like index.html's computeLead(parsed) -- always
// FRESH from noPlots/plotType/discount/paymentPlan (never trusting a stale
// stored netTotal/grandTotal). Deliberately doesn't reuse
// computeLeadQuotationTotals(config, lead): that function treats ANY
// non-null lead.grandTotal (0 included -- Lead.grandTotal is a required
// number, not nullable, so there's no clean "unset" value to pass it) as an
// already-decided override and returns it unchanged instead of recomputing,
// which is exactly the wrong behavior for an import that must always
// derive fresh totals from the file's own numbers.
function freshTotals(config: Config, unitPrice: number, row: ParsedImportRow): { net: number; grand: number } {
  const p = pricingFor(config, row.plotType);
  const gross = unitPrice * row.noPlots;
  const net = Math.max(gross - row.discount, 0);
  const eq = p.eq * row.noPlots;
  const interestTotal = interestFor(config, row.paymentPlan) * eq;
  return { net, grand: net + interestTotal };
}

// Same conflict rule as index.html:20309-20316 (Sec 92: "conflicts are
// flagged") -- a row is a genuine conflict, not just an intentional bulk
// edit, only when the LIVE record was modified in the app AFTER this file
// was generated AND the file disagrees with the current values. Applying
// such a row blindly would silently clobber a newer edit nobody re-exported
// for; a row with no conflict, or untouched since export, applies as-is.
export function planImportRows(rows: ParsedImportRow[], freshLeads: Lead[], config: Config, canManagePayments: boolean, exportedAt: Date | null): ImportPlanItem[] {
  return rows.map((row): ImportPlanItem => {
    if (!row.name) return { kind: 'skip', row };
    const existing = findExistingLead(row, freshLeads);

    if (!existing) {
      const unitPrice = pricingFor(config, row.plotType).list;
      const amtPaid = canManagePayments ? row.amtPaid : 0;
      const input: NewLead = {
        name: row.name,
        contact: row.contact,
        plotType: row.plotType,
        noPlots: row.noPlots,
        unitPrice,
        paymentPlan: row.paymentPlan,
        amtPaid,
        notes: row.notes,
      };
      const totals = freshTotals(config, unitPrice, row);
      const followupPatch: LeadUpdate = {
        stage: row.stage,
        discount: row.discount,
        siteVisit: row.siteVisit,
        priority: row.priority,
        nextAction: row.nextAction,
        netTotal: totals.net,
        grandTotal: totals.grand,
      };
      return { kind: 'insert', row, input, followupPatch, agentKey: row.taggedAgentKey };
    }

    const amtPaidForCompare = canManagePayments ? row.amtPaid : num(existing.amtPaid);
    const changed =
      existing.name !== row.name ||
      existing.contact !== row.contact ||
      existing.stage !== row.stage ||
      existing.plotType !== row.plotType ||
      num(existing.noPlots) !== row.noPlots ||
      num(existing.discount) !== row.discount ||
      existing.paymentPlan !== row.paymentPlan ||
      (existing.siteVisit || 'No') !== row.siteVisit ||
      (existing.priority || 'Low') !== row.priority ||
      num(existing.amtPaid) !== amtPaidForCompare ||
      (existing.nextAction || '') !== row.nextAction ||
      (existing.notes || '') !== row.notes;

    if (!changed) return { kind: 'unchanged', row };

    const isStaleConflict = !!(exportedAt && existing.lastModifiedAt && new Date(existing.lastModifiedAt) > exportedAt);
    if (isStaleConflict) return { kind: 'conflict', row, existing };

    const totals = freshTotals(config, existing.unitPrice, row);
    const patch: LeadUpdate = {
      name: row.name,
      contact: row.contact,
      stage: row.stage,
      plotType: row.plotType,
      noPlots: row.noPlots,
      discount: row.discount,
      paymentPlan: row.paymentPlan,
      siteVisit: row.siteVisit,
      priority: row.priority,
      amtPaid: amtPaidForCompare,
      nextAction: row.nextAction,
      notes: row.notes,
      netTotal: totals.net,
      grandTotal: totals.grand,
    };
    const amtPaidIncrease = canManagePayments && amtPaidForCompare > num(existing.amtPaid) ? amtPaidForCompare - num(existing.amtPaid) : 0;
    return { kind: 'update', row, existing, patch, amtPaidIncrease };
  });
}
