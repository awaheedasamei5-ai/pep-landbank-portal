import { useRef, useState } from 'react';
import { useCommitPipelineImport, useScanPipelineImport, type ImportCommitResult, type ImportScanOutcome } from '../../manager/hooks/usePipelineImport';
import { friendlyError } from '../../../shared/lib/friendlyError';
import { useSessionStore } from '../../../auth/useSessionStore';
import styles from './PipelineImportCard.module.css';

// Staff-scoped counterpart to PipelineImportCard (Reports, manager-only,
// company-wide). Same canonical-workbook algorithm and the same real
// guarantees the master flow already earned live -- Lead-ID-first
// matching, no duplicates on re-upload, Amount Paid always locked -- but
// every scan/commit here is scoped to just this staff member's own leads
// (usePipelineImport's `scope` param), so a staff member can correct
// their own pipeline offline and re-upload it, without ever being able to
// see, edit, or reassign a colleague's lead through this file. Caught
// live: "My pipeline" only ever had an export icon -- Master Pipeline's
// import capability never had a staff-facing counterpart.
export function StaffPipelineImportCard() {
  const profile = useSessionStore((s) => s.profile);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [scanResult, setScanResult] = useState<ImportScanOutcome | null>(null);
  const [commitResult, setCommitResult] = useState<ImportCommitResult | null>(null);
  const [archiveMissing, setArchiveMissing] = useState(false);
  const scope = profile ? { staffKey: profile.key } : undefined;
  const scanMutation = useScanPipelineImport(scope);
  const commitMutation = useCommitPipelineImport(scope);

  if (!profile) return null;

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
  const hasBlockers = !!b && (b.needsReview > 0 || b.invalid > 0 || b.duplicateIdsInFile > 0 || b.conflicts > 0);

  return (
    <>
      <div className={styles.sectitle}>Import pipeline (.xlsx)</div>
      <p className={styles.sub}>
        Upload an edited LEADS sheet exported from your own pipeline to bulk-update it. Matches by Lead ID first &mdash; re-uploading the same file twice never creates duplicates. You can only affect your own leads this way; Amount Paid is always locked, log or correct a payment through Log Payment.
      </p>
      <div className={styles.card}>
        <input ref={fileInputRef} className={styles.fileInput} type="file" accept=".xlsx" onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />

        {scanMutation.isPending && <p className={styles.importResultLine}>Reading {pendingFile?.name}&hellip;</p>}
        {scanMutation.isError && <p className={styles.importErrorText}>{friendlyError(scanMutation.error, 'Could not read that file.')}</p>}

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
              <div className={styles.importKpi}>
                <div className={styles.importKpiValue}>{b.conflicts}</div>
                <div className={styles.importKpiLabel}>Conflicts</div>
              </div>
            </div>

            {b.conflicts > 0 && (
              <p className={styles.importErrorText}>
                {b.conflicts} row{b.conflicts === 1 ? '' : 's'} {b.conflicts === 1 ? 'has' : 'have'} been edited live in the app since this file was exported &mdash; those changes are held back too, so this file&apos;s version can&apos;t silently overwrite them. Export a fresh copy to see the current data before deciding what to do with those rows.
              </p>
            )}

            {hasBlockers && (
              <p className={styles.importResultLine}>
                Rows marked <strong>Needs review</strong>, <strong>Invalid</strong>, <strong>Duplicate ID</strong>, or <strong>Conflicts</strong> are held back and never applied &mdash; fix them in the file and re-upload, or import the rest now and handle those separately.
              </p>
            )}

            {b.possiblyDeleted > 0 && (
              <label className={styles.compareRow} style={{ marginTop: 10 }}>
                <input type="checkbox" checked={archiveMissing} onChange={(e) => setArchiveMissing(e.target.checked)} />
                Archive the {b.possiblyDeleted} client{b.possiblyDeleted === 1 ? '' : 's'} in your pipeline but missing from this file (
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

        {commitMutation.isError && <p className={styles.importErrorText}>{friendlyError(commitMutation.error, 'Import failed.')}</p>}

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
