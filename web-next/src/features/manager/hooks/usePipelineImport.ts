import ExcelJS from 'exceljs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useConfig } from './useConfigSettings';
import { friendlyError, friendlyErrorObj } from '../../../shared/lib/friendlyError';
import type { Config, Lead } from '../../../types/domain';
import {
  IMPORT_SCHEMA_VERSION,
  planImportRows,
  readImportRows,
  readWorkbookMeta,
  resolveLeadsColumns,
  scanImportRows,
  type ImportPlanItem,
  type ParsedImportRow,
  type ScanBuckets,
} from '../lib/pipelineImportLogic';

// Scan (read-only preview) and commit mutations for the canonical-workbook
// import, per spec 5.2's numbered algorithm. Both re-fetch leads AND the
// staff roster fresh (never share one array between scan and commit, and
// never trust whatever's already in the query cache) -- an import
// reviewed in the preview card must be re-validated against whatever's
// actually live by the time the user confirms, not a snapshot that might
// already be stale.

async function loadLeadsWorksheet(file: File) {
  const buf = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.getWorksheet('LEADS');
  if (!ws) throw friendlyErrorObj('Could not find the LEADS sheet in that file -- is this a Palmstead pipeline export?');
  const meta = readWorkbookMeta(wb);
  if (meta.schemaVersion && meta.schemaVersion !== IMPORT_SCHEMA_VERSION) {
    throw friendlyErrorObj(`This file was exported from an older/newer version of the workbook (schema v${meta.schemaVersion}, expected v${IMPORT_SCHEMA_VERSION}). Please re-export a fresh copy.`);
  }
  const exportedAt = meta.exportedAt ? new Date(meta.exportedAt) : null;
  return { ws, exportedAt, sourceLabel: meta.sourceLabel };
}

export interface ImportScanOutcome {
  rows: ParsedImportRow[];
  exportedAt: Date | null;
  possiblyDeletedLeads: Lead[];
  buckets: ScanBuckets;
}

export function useScanPipelineImport() {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useMutation({
    mutationFn: async (file: File): Promise<ImportScanOutcome> => {
      const { ws, exportedAt } = await loadLeadsWorksheet(file);
      const cols = resolveLeadsColumns(ws);
      if (!cols.leadId || !cols.name) throw friendlyErrorObj('This file is missing expected LEADS columns -- is this a Palmstead pipeline export?');
      const rows = readImportRows(ws, cols);
      const ds = getDataSource(demoMode);
      const [freshLeads, staff] = await Promise.all([ds.leads.listAll(), ds.staff.listAll()]);
      // 'company' is a real, legitimate agent_key (Company Leads -- clients
      // who came to the company directly, not through a specific agent),
      // not a staff profile -- staff.listAll() never returns it, so it must
      // be added explicitly or every unedited Company Leads row would be
      // wrongly flagged Invalid on a plain re-upload. Real bug caught live
      // while testing, not by inspection.
      const validStaffKeys = new Set([...staff.map((s) => s.key), 'company']);
      const buckets = scanImportRows(rows, freshLeads, validStaffKeys, exportedAt);
      const fileIds = new Set(rows.map((r) => r.leadId).filter(Boolean));
      const possiblyDeletedLeads = freshLeads.filter((l) => !fileIds.has(l.id));
      return { rows, exportedAt, possiblyDeletedLeads, buckets };
    },
  });
}

export interface ImportCommitResult {
  added: number;
  updated: number;
  unchanged: number;
  needsReview: number;
  invalid: number;
  duplicateIds: number;
  archived: number;
  errors: string[];
}

export interface FieldChange {
  leadId: string;
  name: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

function diffFields(row: ParsedImportRow, existing: Lead): FieldChange[] {
  const pairs: [string, unknown, unknown][] = [
    ['staffKey', existing.agent, row.staffKey || existing.agent],
    ['name', existing.name, row.name],
    ['contact', existing.contact, row.contact],
    ['stage', existing.stage, row.stage || existing.stage],
    ['plotType', existing.plotType, row.plotType || existing.plotType],
    ['noPlots', existing.noPlots, row.noPlots ?? existing.noPlots],
    ['unitPrice', existing.unitPrice, row.unitPrice ?? existing.unitPrice],
    ['discount', existing.discount ?? 0, row.discount ?? existing.discount ?? 0],
    ['paymentPlan', existing.paymentPlan, row.paymentPlan || existing.paymentPlan],
    ['source', existing.leadSource ?? '', row.source],
    ['priority', existing.priority || 'Low', row.priority || 'Low'],
    ['nextAction', existing.nextAction || '', row.nextAction],
    ['siteVisit', existing.siteVisit || 'No', row.siteVisit || 'No'],
    ['notes', existing.notes || '', row.notes],
  ];
  return pairs.filter(([, before, after]) => before !== after).map(([field, before, after]) => ({ leadId: existing.id, name: existing.name, field, oldValue: before, newValue: after }));
}

export function useCommitPipelineImport() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  const { data: config } = useConfig();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ rows, exportedAt, archiveMissing }: { rows: ParsedImportRow[]; exportedAt: Date | null; archiveMissing: boolean }): Promise<ImportCommitResult> => {
      if (!config) throw friendlyErrorObj('Pricing configuration is not loaded yet -- try again in a moment.');
      if (!profile) throw friendlyErrorObj('Not signed in.');
      const ds = getDataSource(demoMode);
      const [freshLeads, staff] = await Promise.all([ds.leads.listAll(), ds.staff.listAll()]);
      // 'company' is a real, legitimate agent_key (Company Leads -- clients
      // who came to the company directly, not through a specific agent),
      // not a staff profile -- staff.listAll() never returns it, so it must
      // be added explicitly or every unedited Company Leads row would be
      // wrongly flagged Invalid on a plain re-upload. Real bug caught live
      // while testing, not by inspection.
      const validStaffKeys = new Set([...staff.map((s) => s.key), 'company']);
      const plan = planImportRows(rows, freshLeads, config as Config, validStaffKeys, profile.key, exportedAt);

      let added = 0;
      let updated = 0;
      let unchanged = 0;
      let needsReview = 0;
      let invalid = 0;
      let duplicateIds = 0;
      let archived = 0;
      const errors: string[] = [];
      const fieldChanges: FieldChange[] = [];
      const needsReviewDetails: { row: number; name: string; reason: string }[] = [];
      const invalidDetails: { row: number; name: string; errors: string[] }[] = [];
      const conflictDetails: { leadId: string; name: string }[] = [];

      for (const item of plan) {
        try {
          if (item.kind === 'skip') continue;
          if (item.kind === 'duplicateId') {
            duplicateIds++;
          } else if (item.kind === 'invalid') {
            invalid++;
            invalidDetails.push({ row: item.row.rowNumber, name: item.row.name, errors: item.errors });
          } else if (item.kind === 'needsReview') {
            needsReview++;
            needsReviewDetails.push({ row: item.row.rowNumber, name: item.row.name, reason: item.reason });
          } else if (item.kind === 'unchanged') {
            unchanged++;
          } else if (item.kind === 'conflict') {
            conflictDetails.push({ leadId: item.existing.id, name: item.existing.name });
          } else if (item.kind === 'insert') {
            // Phase 2 punch-list item 4: one merged insert instead of
            // create()-then-update() -- a mid-row failure can no longer
            // leave a real lead sitting half-written (created, but with
            // none of its stage/discount/priority follow-up fields set).
            // See createWithFollowup's own comment in data/source.ts.
            const created = await ds.leads.createWithFollowup(item.agentKey || profile.key, item.input, item.followupPatch);
            added++;
            fieldChanges.push({ leadId: created.id, name: item.row.name, field: '(new client)', oldValue: null, newValue: item.row.name });
          } else if (item.kind === 'update') {
            fieldChanges.push(...diffFields(item.row, item.existing));
            // One merged update instead of assign()-then-update() -- same
            // reasoning as the insert path above.
            await ds.leads.reassignAndUpdate(item.existing.id, item.reassignToAgentKey, item.patch);
            updated++;
          }
        } catch (e) {
          errors.push(`${item.row.rowLabel}: ${friendlyError(e)}`);
        }
      }

      const archivedLeads: { id: string; name: string }[] = [];
      if (archiveMissing) {
        const fileIds = new Set(rows.map((r) => r.leadId).filter(Boolean));
        const toArchive = freshLeads.filter((l) => !fileIds.has(l.id));
        for (const lead of toArchive) {
          try {
            await ds.leads.remove(lead.id, 'Missing from a reconciled pipeline import', profile?.key ?? '', profile?.name ?? '');
            archived++;
            archivedLeads.push({ id: lead.id, name: lead.name });
          } catch (e) {
            errors.push(`Archiving ${lead.name}: ${friendlyError(e)}`);
          }
        }
      }

      await ds.importBatches.create(profile.key, profile.name, {
        sourceLabel: 'Master Pipeline (company-wide, canonical workbook)',
        addedCount: added,
        updatedCount: updated,
        unchangedCount: unchanged,
        skippedCount: needsReview + invalid + duplicateIds,
        conflictCount: conflictDetails.length,
        errorCount: errors.length,
        paymentChangesIgnoredCount: 0,
        details: { fieldChanges, needsReview: needsReviewDetails, invalid: invalidDetails, conflicts: conflictDetails, archived: archivedLeads, errors },
      });

      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['reportsLeads'] });

      return { added, updated, unchanged, needsReview, invalid, duplicateIds, archived, errors };
    },
  });
}

export type { ImportPlanItem };
