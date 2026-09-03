import { useRef, useState } from 'react';
import { useCommitPipelineImport, useScanPipelineImport, type ImportCommitResult, type ImportScanOutcome } from '../hooks/usePipelineImport';
import styles from '../screens/ReportsScreen.module.css';

// Port of index.html's openImportPreviewModal/importPipelineExcel UI flow
// (index.html:20270-20297) as an inline card instead of a modal -- Reports
// already renders every other pipeline action (export, master pipeline,
// per-agent) as a card in this same list, so a modal here would be the odd
// one out. Same three states as legacy: pick a file -> review counts/
// warnings before anything is written -> commit and show the summary.
export function PipelineImportCard() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [scanResult, setScanResult] = useState<ImportScanOutcome | null>(null);
  const [commitResult, setCommitResult] = useState<ImportCommitResult | null>(null);
  const scanMutation = useScanPipelineImport();
  const commitMutation = useCommitPipelineImport();

  async function handleFile(file: File | null) {
    setCommitResult(null);
    setScanResult(null);
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
    const result = await commitMutation.mutateAsync({ rows: scanResult.rows, exportedAt: scanResult.exportedAt });
    setCommitResult(result);
    setScanResult(null);
    setPendingFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleCancel() {
    setScanResult(null);
    setPendingFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <>
      <div className={styles.sectitle}>Import Pipeline (.xlsx)</div>
      <p className={styles.sub} style={{ margin: '0 0 10px' }}>
        Upload an edited pipeline workbook to bulk-update the company pipeline. Matches each row to an existing client by name + contact (falling back to Lead ID, then name alone) and only changes what actually differs &mdash; re-uploading the same file twice never creates duplicates.
      </p>
      <div className={styles.card} style={{ padding: '14px 16px' }}>
        <input ref={fileInputRef} className={styles.fileInput} type="file" accept=".xlsx" onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />

        {scanMutation.isPending && <p className={styles.importResultLine}>Reading {pendingFile?.name}&hellip;</p>}
        {scanMutation.isError && <p className={styles.importErrorText}>{scanMutation.error instanceof Error ? scanMutation.error.message : 'Could not read that file.'}</p>}

        {scanResult && (
          <>
            <div className={styles.importKpis}>
              <div className={styles.importKpi}>
                <div className={styles.importKpiValue}>{scanResult.toAdd}</div>
                <div className={styles.importKpiLabel}>New clients</div>
              </div>
              <div className={styles.importKpi}>
                <div className={styles.importKpiValue}>{scanResult.toUpdate}</div>
                <div className={styles.importKpiLabel}>Existing (may update)</div>
              </div>
              <div className={styles.importKpi}>
                <div className={styles.importKpiValue}>{scanResult.skipped}</div>
                <div className={styles.importKpiLabel}>Skipped (blank)</div>
              </div>
            </div>

            {scanResult.warnings.length > 0 && (
              <>
                <p className={styles.importResultLine}>
                  <strong>
                    {scanResult.warnings.length} warning{scanResult.warnings.length === 1 ? '' : 's'}
                  </strong>{' '}
                  &mdash; review before continuing
                </p>
                <div className={styles.warnList}>
                  {scanResult.warnings.slice(0, 50).map((w, i) => (
                    <div className={styles.warnItem} key={i}>
                      ⚠ {w}
                    </div>
                  ))}
                  {scanResult.warnings.length > 50 && <div className={styles.warnItem}>&hellip;and {scanResult.warnings.length - 50} more</div>}
                </div>
              </>
            )}

            <p className={styles.importResultLine}>Existing clients only change if a value actually differs &mdash; matching by name + contact never duplicates on re-upload.</p>

            <div className={styles.importActions}>
              <button type="button" className={styles.dlChip} onClick={handleCancel} disabled={commitMutation.isPending}>
                Cancel
              </button>
              <button type="button" className={styles.dlChip} onClick={handleConfirm} disabled={commitMutation.isPending}>
                {commitMutation.isPending ? 'Importing…' : scanResult.warnings.length ? 'Import anyway' : 'Import now'}
              </button>
            </div>
          </>
        )}

        {commitMutation.isError && <p className={styles.importErrorText}>{commitMutation.error instanceof Error ? commitMutation.error.message : 'Import failed.'}</p>}

        {commitResult && (
          <p className={styles.importResultLine}>
            Import done &mdash; {commitResult.added} added, {commitResult.updated} updated, {commitResult.unchanged} unchanged
            {commitResult.skipped ? `, ${commitResult.skipped} skipped (blank name)` : ''}
            {commitResult.paymentChangesIgnored ? `, ${commitResult.paymentChangesIgnored} payment change(s) ignored (ask a manager to log those)` : ''}
            {commitResult.conflicts ? `, ${commitResult.conflicts} conflict(s) held back (that record changed in the app since this file was exported)` : ''}
            {commitResult.errors.length ? `, ${commitResult.errors.length} row(s) failed` : ''}
          </p>
        )}
      </div>
    </>
  );
}
