"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import ExcelJS from "exceljs";

import type { ExcelLead } from "@/lib/palmstead/pipeline-excel-workbook";
import {
  IMPORT_SCHEMA_VERSION,
  type ImportPlanItem,
  type ParsedImportRow,
  planImportRows,
  readImportRows,
  readWorkbookMeta,
  resolveLeadsColumns,
  type ScanBuckets,
  scanImportRows,
} from "@/lib/palmstead/pipeline-import-logic";
import { deriveStageFromPayment } from "@/lib/palmstead/pipeline-pricing-logic";
import { useAppConfig } from "@/lib/palmstead/use-app-config";
import { requireSupabase } from "@/lib/supabase.client";
import { useAuthStore } from "@/stores/auth/auth-store";

// Real port of web-next's usePipelineImport.ts -- scan (read-only
// preview) and commit mutations for the canonical-workbook import (spec
// 5.2's numbered algorithm). Both re-fetch leads fresh every time, never
// trusting the query cache, since a preview reviewed by a human must be
// re-validated against whatever's actually live by the time they confirm.

const LEADS_SELECT =
  "id,agent_key,name,contact,stage,plot_type,no_plots,unit_price,discount,net_total,grand_total,payment_plan,amt_paid,lead_source,priority,next_action,site_visit,notes,date_added,last_modified_at";

function mapExcelLeadRow(r: Record<string, unknown>): ExcelLead {
  return {
    id: r.id as string,
    agentKey: r.agent_key as string,
    name: r.name as string,
    contact: (r.contact as string | null) ?? "",
    stage: (r.stage as string | null) ?? "1",
    plotType: (r.plot_type as string | null) ?? "Full Plot",
    noPlots: Number(r.no_plots ?? 1),
    unitPrice: Number(r.unit_price ?? 0),
    discount: r.discount != null ? Number(r.discount as number) : null,
    netTotal: r.net_total != null ? Number(r.net_total as number) : null,
    grandTotal: Number(r.grand_total ?? 0),
    paymentPlan: (r.payment_plan as string | null) ?? "Full Payment",
    amtPaid: Number(r.amt_paid ?? 0),
    leadSource: (r.lead_source as string | null) ?? null,
    priority: (r.priority as string | null) ?? null,
    nextAction: (r.next_action as string | null) ?? null,
    siteVisit: (r.site_visit as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    dateAdded: r.date_added as string,
    lastModifiedAt: (r.last_modified_at as string | null) ?? null,
  };
}

async function loadLeadsWorksheet(file: File) {
  const buf = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.getWorksheet("LEADS");
  if (!ws) throw new Error("Could not find the LEADS sheet in that file -- is this a Palmstead pipeline export?");
  const meta = readWorkbookMeta(wb);
  if (meta.schemaVersion && meta.schemaVersion !== IMPORT_SCHEMA_VERSION) {
    throw new Error(
      `This file was exported from an older/newer version of the workbook (schema v${meta.schemaVersion}, expected v${IMPORT_SCHEMA_VERSION}). Please re-export a fresh copy.`,
    );
  }
  const exportedAt = meta.exportedAt ? new Date(meta.exportedAt) : null;
  return { ws, exportedAt };
}

function useIsViewAll(): boolean {
  const profile = useAuthStore((s) => s.profile);
  return !!profile && (profile.role === "manager" || ["elias", "emmanuel", "elizabeth"].includes(profile.key));
}

async function fetchScopedLeads(
  viewAll: boolean,
  agentKey: string,
): Promise<{ own: ExcelLead[]; all: ExcelLead[] | null }> {
  const client = requireSupabase();
  if (viewAll) {
    const { data, error } = await client.from("leads").select(LEADS_SELECT).is("deleted_at", null);
    if (error) throw error;
    const all = (data ?? []).map(mapExcelLeadRow);
    return { own: all, all: null };
  }
  const [ownRes, allRes] = await Promise.all([
    client.from("leads").select(LEADS_SELECT).is("deleted_at", null).eq("agent_key", agentKey),
    client.from("leads").select(LEADS_SELECT).is("deleted_at", null),
  ]);
  if (ownRes.error) throw ownRes.error;
  if (allRes.error) throw allRes.error;
  return { own: (ownRes.data ?? []).map(mapExcelLeadRow), all: (allRes.data ?? []).map(mapExcelLeadRow) };
}

export interface ImportScanOutcome {
  rows: ParsedImportRow[];
  exportedAt: Date | null;
  possiblyDeletedLeads: ExcelLead[];
  buckets: ScanBuckets;
}

export function useScanPipelineImport() {
  const profile = useAuthStore((s) => s.profile);
  const viewAll = useIsViewAll();
  return useMutation({
    mutationFn: async (file: File): Promise<ImportScanOutcome> => {
      if (!profile) throw new Error("Not signed in.");
      const { ws, exportedAt } = await loadLeadsWorksheet(file);
      const cols = resolveLeadsColumns(ws);
      if (!cols.leadId || !cols.name)
        throw new Error("This file is missing expected LEADS columns -- is this a Palmstead pipeline export?");
      const rows = readImportRows(ws, cols);
      const { own: freshLeads, all: allLeads } = await fetchScopedLeads(viewAll, profile.key);
      const { data: staffRows, error: staffError } = await requireSupabase().from("profiles").select("agent_key");
      if (staffError) throw staffError;
      const validStaffKeys = new Set([...(staffRows ?? []).map((r) => r.agent_key as string), "company"]);
      const foreignLeadIds = allLeads
        ? new Set(allLeads.filter((l) => l.agentKey !== profile.key).map((l) => l.id))
        : undefined;
      const buckets = scanImportRows(rows, freshLeads, validStaffKeys, exportedAt, foreignLeadIds);
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

interface FieldChange {
  leadId: string;
  name: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

function diffFields(row: ParsedImportRow, existing: ExcelLead): FieldChange[] {
  // biome-ignore-start lint/nursery/useNullishCoalescing: matches web-next's exact comparison -- an empty-string existing value should also fall through to the row's own default.
  const pairs: [string, unknown, unknown][] = [
    ["staffKey", existing.agentKey, row.staffKey || existing.agentKey],
    ["name", existing.name, row.name],
    ["contact", existing.contact, row.contact],
    ["stage", existing.stage, row.stage || existing.stage],
    ["plotType", existing.plotType, row.plotType || existing.plotType],
    ["noPlots", existing.noPlots, row.noPlots ?? existing.noPlots],
    ["unitPrice", existing.unitPrice, row.unitPrice ?? existing.unitPrice],
    ["discount", existing.discount ?? 0, row.discount ?? existing.discount ?? 0],
    ["paymentPlan", existing.paymentPlan, row.paymentPlan || existing.paymentPlan],
    ["source", existing.leadSource ?? "", row.source],
    ["priority", existing.priority || "Low", row.priority || "Low"],
    ["nextAction", existing.nextAction || "", row.nextAction],
    ["siteVisit", existing.siteVisit || "No", row.siteVisit || "No"],
    ["notes", existing.notes || "", row.notes],
  ];
  // biome-ignore-end lint/nursery/useNullishCoalescing: see above
  return pairs
    .filter(([, before, after]) => before !== after)
    .map(([field, before, after]) => ({
      leadId: existing.id,
      name: existing.name,
      field,
      oldValue: before,
      newValue: after,
    }));
}

export function useCommitPipelineImport() {
  const profile = useAuthStore((s) => s.profile);
  const viewAll = useIsViewAll();
  const { data: config } = useAppConfig();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      rows,
      exportedAt,
      archiveMissing,
    }: {
      rows: ParsedImportRow[];
      exportedAt: Date | null;
      archiveMissing: boolean;
    }): Promise<ImportCommitResult> => {
      if (!config) throw new Error("Pricing configuration is not loaded yet -- try again in a moment.");
      if (!profile) throw new Error("Not signed in.");
      const client = requireSupabase();
      const { own: freshLeads, all: allLeads } = await fetchScopedLeads(viewAll, profile.key);
      const { data: staffRows, error: staffError } = await client.from("profiles").select("agent_key");
      if (staffError) throw staffError;
      const validStaffKeys = new Set([...(staffRows ?? []).map((r) => r.agent_key as string), "company"]);
      const foreignLeadIds = allLeads
        ? new Set(allLeads.filter((l) => l.agentKey !== profile.key).map((l) => l.id))
        : undefined;
      const plan: ImportPlanItem[] = planImportRows(
        rows,
        freshLeads,
        config,
        validStaffKeys,
        profile.key,
        exportedAt,
        foreignLeadIds,
        viewAll ? null : profile.key,
      );

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
          if (item.kind === "skip") continue;
          if (item.kind === "duplicateId") {
            duplicateIds++;
          } else if (item.kind === "invalid") {
            invalid++;
            invalidDetails.push({ row: item.row.rowNumber, name: item.row.name, errors: item.errors });
          } else if (item.kind === "needsReview") {
            needsReview++;
            needsReviewDetails.push({ row: item.row.rowNumber, name: item.row.name, reason: item.reason });
          } else if (item.kind === "unchanged") {
            unchanged++;
          } else if (item.kind === "conflict") {
            conflictDetails.push({ leadId: item.existing.id, name: item.existing.name });
          } else if (item.kind === "insert") {
            const { data: created, error } = await client
              .from("leads")
              .insert({
                agent_key: item.agentKey,
                name: item.input.name,
                contact: item.input.contact,
                plot_type: item.input.plotType,
                no_plots: item.input.noPlots,
                unit_price: item.input.unitPrice,
                payment_plan: "Full Payment",
                amt_paid: 0,
                grand_total: item.followupPatch.grandTotal,
                net_total: item.followupPatch.netTotal,
                balance: item.followupPatch.grandTotal,
                stage: deriveStageFromPayment(0, item.followupPatch.grandTotal),
                notes: item.input.notes,
                discount: item.followupPatch.discount,
                site_visit: item.followupPatch.siteVisit,
                priority: item.followupPatch.priority,
                next_action: item.followupPatch.nextAction,
              })
              .select("id")
              .single();
            if (error) throw error;
            added++;
            fieldChanges.push({
              leadId: created.id as string,
              name: item.row.name,
              field: "(new client)",
              oldValue: null,
              newValue: item.row.name,
            });
          } else if (item.kind === "update") {
            fieldChanges.push(...diffFields(item.row, item.existing));
            const dbPatch: Record<string, unknown> = {
              name: item.patch.name,
              contact: item.patch.contact,
              stage: item.patch.stage,
              plot_type: item.patch.plotType,
              no_plots: item.patch.noPlots,
              unit_price: item.patch.unitPrice,
              discount: item.patch.discount,
              payment_plan: item.patch.paymentPlan,
              site_visit: item.patch.siteVisit,
              priority: item.patch.priority,
              next_action: item.patch.nextAction,
              notes: item.patch.notes,
              lead_source: item.patch.leadSource,
              net_total: item.patch.netTotal,
              grand_total: item.patch.grandTotal,
              balance: Math.max(item.patch.grandTotal - item.existing.amtPaid, 0),
            };
            if (item.reassignToAgentKey) dbPatch.agent_key = item.reassignToAgentKey;
            const { error } = await client.from("leads").update(dbPatch).eq("id", item.existing.id);
            if (error) throw error;
            updated++;
          }
        } catch (e) {
          errors.push(`${item.row.rowLabel}: ${e instanceof Error ? e.message : "Failed to save this row"}`);
        }
      }

      const archivedLeads: { id: string; name: string }[] = [];
      if (archiveMissing) {
        const fileIds = new Set(rows.map((r) => r.leadId).filter(Boolean));
        const toArchive = freshLeads.filter((l) => !fileIds.has(l.id));
        for (const lead of toArchive) {
          try {
            const { error } = await client.rpc("archive_lead_and_vacate", {
              p_lead_id: lead.id,
              p_reason: "Missing from a reconciled pipeline import",
              p_deleted_by: profile.key,
              p_deleted_by_name: profile.name,
            });
            if (error) throw error;
            archived++;
            archivedLeads.push({ id: lead.id, name: lead.name });
          } catch (e) {
            errors.push(`Archiving ${lead.name}: ${e instanceof Error ? e.message : "failed"}`);
          }
        }
      }

      const { error: batchError } = await client.from("import_batches").insert({
        imported_by: profile.key,
        imported_by_name: profile.name,
        source_label: viewAll
          ? "Master Pipeline (company-wide, canonical workbook)"
          : `${profile.name}'s pipeline (own leads, canonical workbook)`,
        added_count: added,
        updated_count: updated,
        unchanged_count: unchanged,
        skipped_count: needsReview + invalid + duplicateIds,
        conflict_count: conflictDetails.length,
        error_count: errors.length,
        payment_changes_ignored_count: 0,
        details: {
          fieldChanges,
          needsReview: needsReviewDetails,
          invalid: invalidDetails,
          conflicts: conflictDetails,
          archived: archivedLeads,
          errors,
        },
      });
      if (batchError) errors.push(`Import history was not recorded: ${batchError.message}`);

      void qc.invalidateQueries({ queryKey: ["pipelineLeads"] });
      void qc.invalidateQueries({ queryKey: ["lead"] });

      return { added, updated, unchanged, needsReview, invalid, duplicateIds, archived, errors };
    },
  });
}
