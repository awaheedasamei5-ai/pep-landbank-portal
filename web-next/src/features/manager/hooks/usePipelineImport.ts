import ExcelJS from 'exceljs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useConfig } from './useConfigSettings';
import { useCanLogPayments } from '../../payments/hooks/useLogPayment';
import type { Config } from '../../../types/domain';
import { findExistingLead, planImportRows, readImportRows, resolveImportColumns, scanImportRows, type ImportPlanItem, type ParsedImportRow } from '../lib/pipelineImportLogic';

// Faithful port of index.html's startPipelineImport -> openImportPreviewModal
// -> importPipelineExcel flow (index.html:20292-20450), scoped to Master
// Pipeline / company-wide import (this lives in Reports, manager-only --
// see ReportsScreen's own comment). scan() and commit() each do their OWN
// fresh `leads.listAll()` fetch rather than sharing one, matching legacy
// exactly: scanImportFile and importPipelineExcel never share a fetch
// either, so a file reviewed in the preview modal is re-validated against
// whatever's actually live by the time the user confirms, not a snapshot
// that might be stale by then.

async function loadWorkbookSheet(file: File) {
  const buf = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.getWorksheet('💼 Pipeline') || wb.getWorksheet('Pipeline') || wb.worksheets[0];
  if (!ws) throw new Error('Could not find the Pipeline sheet in that file');
  const exportedAt = wb.created ? new Date(wb.created) : null;
  return { ws, exportedAt };
}

// Unfiltered (every real profile, not just role==='agent') -- elias/
// emmanuel/elizabeth can own leads too, and legacy's own nameToAgentKey
// (index.html:20341-20342) is built from the unfiltered DB.profiles for
// exactly that reason. useTeamRoster() filters to agents only, which
// would silently fail to resolve a tagged row owned by one of those three.
async function buildNameToAgentKey(demoMode: boolean): Promise<Record<string, string>> {
  const staff = await getDataSource(demoMode).staff.listAll();
  const map: Record<string, string> = {};
  staff.forEach((s) => {
    if (s.name && s.key) map[s.name.trim().toLowerCase()] = s.key;
  });
  return map;
}

export interface ImportScanOutcome {
  rows: ParsedImportRow[];
  exportedAt: Date | null;
  toAdd: number;
  toUpdate: number;
  skipped: number;
  warnings: string[];
}

export function useScanPipelineImport() {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useMutation({
    mutationFn: async (file: File): Promise<ImportScanOutcome> => {
      const { ws, exportedAt } = await loadWorkbookSheet(file);
      const cols = resolveImportColumns(ws);
      const nameToAgentKey = await buildNameToAgentKey(demoMode);
      const rows = readImportRows(ws, cols, nameToAgentKey);
      const freshLeads = await getDataSource(demoMode).leads.listAll();
      const scan = scanImportRows(rows, freshLeads);
      return { rows, exportedAt, ...scan };
    },
  });
}

export interface ImportCommitResult {
  added: number;
  updated: number;
  unchanged: number;
  skipped: number;
  conflicts: number;
  errors: string[];
  paymentChangesIgnored: number;
}

export function useCommitPipelineImport() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  const { data: config } = useConfig();
  const canManagePayments = useCanLogPayments();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ rows, exportedAt }: { rows: ParsedImportRow[]; exportedAt: Date | null }): Promise<ImportCommitResult> => {
      if (!config) throw new Error('Pricing configuration is not loaded yet -- try again in a moment.');
      if (!profile) throw new Error('Not signed in.');
      const ds = getDataSource(demoMode);
      // Re-fetched fresh here too (see file header) -- NOT the same array
      // the scan step returned, in case time passed while the user
      // reviewed the preview modal.
      const freshLeads = await ds.leads.listAll();
      const plan = planImportRows(rows, freshLeads, config as Config, canManagePayments, exportedAt);

      let added = 0;
      let updated = 0;
      let unchanged = 0;
      let skipped = 0;
      let paymentChangesIgnored = 0;
      const conflicts: { leadId: string; name: string }[] = [];
      const errors: string[] = [];

      for (const item of plan) {
        try {
          if (item.kind === 'skip') {
            skipped++;
          } else if (item.kind === 'unchanged') {
            unchanged++;
          } else if (item.kind === 'conflict') {
            conflicts.push({ leadId: item.existing.id, name: item.existing.name });
          } else if (item.kind === 'insert') {
            if (!canManagePayments && item.row.amtPaid > 0) paymentChangesIgnored++;
            // input.amtPaid already carries the right final value (0 if the
            // importer can't manage payments) -- a brand-new row has no
            // "before" balance to log a delta payment against, so unlike
            // the update branch below this doesn't also create a payments
            // row; the number on the lead is correct either way.
            const created = await ds.leads.create(item.agentKey || profile.key, item.input);
            await ds.leads.update(created.id, item.followupPatch);
            added++;
          } else {
            const existingBefore = findExistingLead(item.row, freshLeads);
            if (!canManagePayments && item.row.amtPaid !== (existingBefore?.amtPaid ?? 0)) paymentChangesIgnored++;
            // payments.create({status:'approved'}) independently re-reads
            // the lead's current amt_paid/grand_total and bumps them itself
            // (mirrors applyApprovedPaymentToLead()), which would also
            // re-derive stage from the payment -- so it must run BEFORE the
            // authoritative patch below, not after, or the file's explicit
            // stage (and, harmlessly but pointlessly, amtPaid) would be
            // clobbered by that auto-derivation instead of winning as the
            // final write the way legacy's raw column update always does.
            if (item.amtPaidIncrease > 0) {
              await ds.payments.create({ leadId: item.existing.id, amount: item.amtPaidIncrease }, item.row.name, item.existing.agent, 'approved');
            }
            await ds.leads.update(item.existing.id, item.patch);
            updated++;
          }
        } catch (e) {
          errors.push(`${item.row.rowLabel}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      await ds.importBatches.create(profile.key, profile.name, {
        sourceLabel: 'Master Pipeline (company-wide)',
        addedCount: added,
        updatedCount: updated,
        unchangedCount: unchanged,
        skippedCount: skipped,
        conflictCount: conflicts.length,
        errorCount: errors.length,
        paymentChangesIgnoredCount: paymentChangesIgnored,
        details: { conflicts, errors },
      });

      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['reportsLeads'] });

      return { added, updated, unchanged, skipped, conflicts: conflicts.length, errors, paymentChangesIgnored };
    },
  });
}

export type { ImportPlanItem };
