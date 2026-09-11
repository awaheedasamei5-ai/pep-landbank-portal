"use client";

import { useRef, useState } from "react";

import { Download, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDownloadPipelineExcel } from "@/lib/palmstead/use-pipeline-excel";
import {
  type ImportCommitResult,
  type ImportScanOutcome,
  useCommitPipelineImport,
  useScanPipelineImport,
} from "@/lib/palmstead/use-pipeline-import";

// Real port of web-next's PipelineImportCard/StaffPipelineImportCard --
// same real "intelligent import" preview (X new, Y updated, Z unchanged,
// A needs review, B invalid, C duplicate ID, D conflicts), same real
// "held back, never applied" rule for anything but a clean insert/update,
// same optional archive-missing checkbox. Collapsed into one card here
// (web-next has 3 separate variants for its 3 separate pipeline routes;
// this shell's Master Pipeline is one unified route, RLS-scoped).
export function PipelineImportExportCard() {
  const [open, setOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFileName, setPendingFileName] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ImportScanOutcome | null>(null);
  const [commitResult, setCommitResult] = useState<ImportCommitResult | null>(null);
  const [archiveMissing, setArchiveMissing] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);

  const downloadExcel = useDownloadPipelineExcel();
  const scanMutation = useScanPipelineImport();
  const commitMutation = useCommitPipelineImport();

  async function handleFile(file: File | null) {
    setCommitResult(null);
    setScanResult(null);
    setScanError(null);
    setCommitError(null);
    setArchiveMissing(false);
    if (!file) {
      setPendingFileName(null);
      return;
    }
    setPendingFileName(file.name);
    try {
      const result = await scanMutation.mutateAsync(file);
      setScanResult(result);
    } catch (e) {
      setScanError(e instanceof Error ? e.message : "Could not read that file.");
    }
  }

  async function handleConfirm() {
    if (!scanResult) return;
    setCommitError(null);
    try {
      const result = await commitMutation.mutateAsync({
        rows: scanResult.rows,
        exportedAt: scanResult.exportedAt,
        archiveMissing,
      });
      setCommitResult(result);
      setScanResult(null);
      setPendingFileName(null);
      setArchiveMissing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e) {
      setCommitError(e instanceof Error ? e.message : "Import failed.");
    }
  }

  function handleCancel() {
    setScanResult(null);
    setPendingFileName(null);
    setArchiveMissing(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const b = scanResult?.buckets;
  const hasBlockers = !!b && (b.needsReview > 0 || b.invalid > 0 || b.duplicateIdsInFile > 0 || b.conflicts > 0);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Import / export (.xlsx)</CardTitle>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={downloadExcel.isPending}
            onClick={() => downloadExcel.mutate()}
          >
            <Download className="size-4" /> {downloadExcel.isPending ? "Building…" : "Export"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
            <Upload className="size-4" /> Import
          </Button>
        </div>
      </CardHeader>
      {downloadExcel.isError && (
        <CardContent className="pt-0">
          <p className="text-destructive text-sm">Could not build the export.</p>
        </CardContent>
      )}
      {open && (
        <CardContent className="flex flex-col gap-3">
          <p className="text-muted-foreground text-sm">
            Upload an edited LEADS sheet from a Palmstead pipeline export to bulk-update the pipeline. Matches by Lead
            ID first, falling back to name + contact only for rows with no ID -- re-uploading the same file twice never
            creates duplicates. Amount Paid is always locked; log or correct a payment from the lead's own page.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            className="text-sm"
          />

          {scanMutation.isPending && <p className="text-muted-foreground text-sm">Reading {pendingFileName}…</p>}
          {scanError && <p className="text-destructive text-sm">{scanError}</p>}

          {scanResult && b && (
            <>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-7">
                {[
                  { label: "New", value: b.toAdd },
                  { label: "Updated", value: b.toUpdate },
                  { label: "Unchanged", value: b.unchanged },
                  { label: "Needs review", value: b.needsReview },
                  { label: "Invalid", value: b.invalid },
                  { label: "Duplicate ID", value: b.duplicateIdsInFile },
                  { label: "Conflicts", value: b.conflicts },
                ].map((k) => (
                  <div key={k.label} className="rounded-md border p-2 text-center">
                    <div className="font-semibold text-lg tabular-nums">{k.value}</div>
                    <div className="text-[11px] text-muted-foreground">{k.label}</div>
                  </div>
                ))}
              </div>

              {b.conflicts > 0 && (
                <p className="text-destructive text-sm">
                  {b.conflicts} row{b.conflicts === 1 ? "" : "s"} {b.conflicts === 1 ? "has" : "have"} been edited live
                  in the app since this file was exported -- those changes are held back too, so this file's version
                  can't silently overwrite them. Export a fresh copy to see the current data before deciding what to do
                  with those rows.
                </p>
              )}

              {hasBlockers && (
                <p className="text-muted-foreground text-sm">
                  Rows marked <strong>Needs review</strong>, <strong>Invalid</strong>, <strong>Duplicate ID</strong>, or{" "}
                  <strong>Conflicts</strong> are held back and never applied -- fix them in the file and re-upload, or
                  import the rest now and handle those separately.
                </p>
              )}

              {b.possiblyDeleted > 0 && (
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={archiveMissing}
                    onChange={(e) => setArchiveMissing(e.target.checked)}
                  />
                  <span>
                    Archive the {b.possiblyDeleted} client{b.possiblyDeleted === 1 ? "" : "s"} in the system but missing
                    from this file (
                    {scanResult.possiblyDeletedLeads
                      .slice(0, 5)
                      .map((l) => l.name)
                      .join(", ")}
                    {b.possiblyDeleted > 5 ? ", …" : ""}) -- never happens automatically unless you check this.
                  </span>
                </label>
              )}

              <p className="text-muted-foreground text-xs">
                Existing clients only change if a value actually differs. A row that disagrees with an edit made in the
                app since this file was exported is held as a conflict, not silently overwritten.
              </p>

              {commitError && <p className="text-destructive text-sm">{commitError}</p>}

              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleCancel} disabled={commitMutation.isPending}>
                  Cancel
                </Button>
                <Button type="button" onClick={handleConfirm} disabled={commitMutation.isPending}>
                  {commitMutation.isPending ? "Importing…" : "Import now"}
                </Button>
              </div>
            </>
          )}

          {commitResult && (
            <p className="text-sm">
              Import done -- {commitResult.added} added, {commitResult.updated} updated, {commitResult.unchanged}{" "}
              unchanged
              {commitResult.needsReview ? `, ${commitResult.needsReview} held for review` : ""}
              {commitResult.invalid ? `, ${commitResult.invalid} invalid` : ""}
              {commitResult.duplicateIds ? `, ${commitResult.duplicateIds} duplicate Lead ID(s) blocked` : ""}
              {commitResult.archived ? `, ${commitResult.archived} archived` : ""}
              {commitResult.errors.length ? `, ${commitResult.errors.length} row(s) failed` : ""}
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}
