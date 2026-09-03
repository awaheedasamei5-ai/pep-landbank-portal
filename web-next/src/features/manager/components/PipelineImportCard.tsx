import { useRef, useState } from 'react';
import { useCommitPipelineImport, useScanPipelineImport, type ImportCommitResult, type ImportScanOutcome } from '../hooks/usePipelineImport';
import styles from '../screens/ReportsScreen.module.css';

// UI for the canonical-workbook import (pipelineImportLogic.ts), matching
// spec 5.2's "Show an import preview: X new, Y updated, Z unchanged, A
// conflicts, B invalid, C skipped" and "Require confirmation before
// applying" -- an inline card instead of a modal, since Reports already
// renders every other pipeline action (export, master pipeline, per-agent)
// as a card in this same list.
export function PipelineImportCard() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [scanResult, setScanResult] = useState<ImportScanOutcome | null>(null);
  const [commitResult, setCommitResult] = useState<ImportCommitResult | null>(null);
  const [archiveMissing, setArchiveMissing] = useState(false);
  const scanMutation = useScanPipelineImport();
  const commitMutation = useCommitPipelineImport();

  async function handleFile(file: File | null) {
    setCommitResult(null);
    setScanResult(null);
    setArchiveMissing(false);
    if (!file) {
      setPendingFile(null);
      return;
    }
    setPendingFile(file);
    try {
      const result = await scanMutation.mutateAsync(file);
      setScanResult(result);
    } catch {
      // scanMutation.error already carries the message, rendered below
    }
  }

  async function handleConfirm() {
    if (!scanResult) return;
    const result = await commitMutation.mutateAsync({ rows: scanResult.rows, exportedAt: scanResult.exportedAt, archiveMissing });
    setCommitResult(result);
    setScanResult(null);
    setPendingFile(null);
    setArchiveMissing(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleCancel() {
    setScanResult(null);
    setPendingFile(null);
    setArchiveMissing(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const b = scanResult?.buckets;
  const hasBlockers = !!b && (b.needsReview > 0 || b.invalid > 0 || b.duplicateIdsInFile > 0);

  return (
    <>
      <div className={styles.sectitle}>Import Pipeline (.xlsx)</div>
      <p className={styles.sub} style={{ margin: '0 0 10px' }}>
        Upload an edited LEADS sheet from a Palmstead pipeline export to bulk-update the company pipeline. Matches by Lead ID first, falling back to name + contact only for rows with no ID &mdash; re-uploading the same file twice never creates duplicates. Amount Paid is always locked; log or correct a payment through Log Payment.
      </p>
      <div className={styles.card} style={{ padding: '14px 16px' }}>
        <input ref={fileInputRef} className={styles.fileInput} type="file" accept=".xlsx" onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />

        {scanMutation.isPending && <p className={styles.importResultLine}>Reading {pendingFile?.name}&hellip;</p>}
        {scanMutation.isError && <p className={styles.importErrorText}>{scanMutation.error instanceof Error ? scanMutation.error.message : 'Could not read that file.'}</p>}

        {scanResult && b && (
          <>
            <div className={styles.importKpis}>
              <div className={styles.importKpi}>
                <div className={styles.importKpiValue}>{b.toAdd}</div>
                <div className={styles.importKpiLabel}>New</div>
              </div>
              <div className={styles.importKpi}>
                <div className={styles.importKpiValue}>{b.toUpdate}</div>
                <div className={styles.importKpiLabel}>Updated</div>
              </div>
              <div className={styles.importKpi}>
                <div className={styles.importKpiValue}>{b.unchanged}</div>
                <div className={styles.importKpiLabel}>Unchanged</div>
              </div>
              <div className={styles.importKpi}>
                <div className={styles.importKpiValue}>{b.needsReview}</div>
                <div className={styles.importKpiLabel}>Needs review</div>
              </div>
              <div className={styles.importKpi}>
                <div className={styles.importKpiValue}>{b.invalid}</div>
                <div className={styles.importKpiLabel}>Invalid</div>
              </div>
              <div className={styles.importKpi}>
                <div className={styles.importKpiValue}>{b.duplicateIdsInFile}</div>
                <div className={styles.importKpiLabel}>Duplicate ID</div>
              </div>
            </div>

            {hasBlockers && (
              <p className={styles.importResultLine}>
                Rows marked <strong>Needs review</strong>, <strong>Invalid</strong>, or <strong>Duplicate ID</strong> are held back and never applied &mdash; fix them in the file and re-upload, or import the rest now and handle those separately.
              </p>
            )}

            {b.possiblyDeleted > 0 && (
              <label className={styles.compareRow} style={{ marginTop: 10 }}>
                <input type="checkbox" checked={archiveMissing} onChange={(e) => setArchiveMissing(e.target.checked)} />
                Archive the {b.possiblyDeleted} client{b.possiblyDeleted === 1 ? '' : 's'} in the system but missing from this file (
                {scanResult.possiblyDeletedLeads
                  .slice(0, 5)
                  .map((l) => l.name)
                  .join(', ')}
                {b.possiblyDeleted > 5 ? ', …' : ''}) &mdash; never happens automatically unless you check this.
              </label>
            )}

            <p className={styles.importResultLine} style={{ marginTop: 10 }}>Existing clients only change if a value actually differs. A row that disagrees with an edit made in the app since this file was exported is held as a conflict, not silently overwritten.</p>

            <div className={styles.importActions}>
              <button type="button" className={styles.dlChip} onClick={handleCancel} disabled={commitMutation.isPending}>
                Cancel
              </button>
              <button type="button" className={styles.dlChip} onClick={handleConfirm} disabled={commitMutation.isPending}>
                {commitMutation.isPending ? 'Importing…' : 'Import now'}
              </button>
            </div>
          </>
        )}

        {commitMutation.isError && <p className={styles.importErrorText}>{commitMutation.error instanceof Error ? commitMutation.error.message : 'Import failed.'}</p>}

        {commitResult && (
          <p className={styles.importResultLine}>
            Import done &mdash; {commitResult.added} added, {commitResult.updated} updated, {commitResult.unchanged} unchanged
            {commitResult.needsReview ? `, ${commitResult.needsReview} held for review` : ''}
            {commitResult.invalid ? `, ${commitResult.invalid} invalid` : ''}
            {commitResult.duplicateIds ? `, ${commitResult.duplicateIds} duplicate Lead ID(s) blocked` : ''}
            {commitResult.archived ? `, ${commitResult.archived} archived` : ''}
            {commitResult.errors.length ? `, ${commitResult.errors.length} row(s) failed` : ''}
          </p>
        )}
      </div>
    </>
  );
}
