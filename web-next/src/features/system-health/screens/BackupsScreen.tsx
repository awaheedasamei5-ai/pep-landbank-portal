import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { BackupRecord } from '../../../types/domain';
import { useBackups } from '../hooks/useBackups';
import styles from './BackupsScreen.module.css';

function fmtDate(iso: string): string {
  return iso.slice(0, 16).replace('T', ' ');
}

function fmtBytes(n: number): string {
  return n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// Port of index.html's Backup & Restore flow (apiCreateBackupNow/
// apiRestoreBackupNow + openRestoreConfirmModal(), index.html:21442-21632).
// The "type RESTORE to confirm" step matches the original's own bar for
// this one destructive action -- restore_backup() itself is manager-gated
// and takes an automatic pre-restore safety snapshot, but the UI should
// still make the blast radius unmistakable before calling it.
export function BackupsScreen() {
  const navigate = useNavigate();
  const { backups, isLoading, createNow, restore } = useBackups();
  const [restoreTarget, setRestoreTarget] = useState<BackupRecord | null>(null);
  const [confirmText, setConfirmText] = useState('');

  function closeModal() {
    setRestoreTarget(null);
    setConfirmText('');
  }

  async function doRestore() {
    if (!restoreTarget) return;
    await restore.mutateAsync(restoreTarget.id);
    closeModal();
  }

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.backBtn} onClick={() => navigate(-1)}>
        ← Back
      </button>
      <div className={styles.eyebrow}>System Health</div>
      <h1 className={styles.title}>Backup &amp; Restore</h1>
      <p className={styles.sub}>Every business table, snapshotted automatically 3&times;/day &mdash; kept for the most recent 30.</p>

      <button type="button" className={styles.backupNowBtn} disabled={createNow.isPending} onClick={() => createNow.mutate()}>
        {createNow.isPending ? 'Backing up…' : 'Backup now'}
      </button>

      {isLoading && <p className={styles.emptyMsg}>Loading…</p>}

      <div className={styles.list}>
        {backups.map((b) => (
          <div className={styles.row} key={b.id}>
            <div className={styles.rowBody}>
              <div className={styles.rowTop}>
                <span className={styles.when}>{fmtDate(b.createdAt)}</span>
                <span className={styles.triggerTag}>{b.triggerType}</span>
              </div>
              <div className={styles.meta}>
                {fmtBytes(b.sizeBytes)}
                {b.triggeredByName ? ` · by ${b.triggeredByName}` : ''} · checksum {b.checksum.slice(0, 10)}…
              </div>
            </div>
            <button type="button" className={styles.restoreBtn} onClick={() => setRestoreTarget(b)}>
              Restore
            </button>
          </div>
        ))}
      </div>

      {restoreTarget && (
        <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className={styles.modal}>
            <div className={styles.modalTitle}>Restore backup from {fmtDate(restoreTarget.createdAt)}?</div>
            <p className={styles.modalWarn}>This replaces every current lead, plot, payment, contract, pricing record, task and similar business record with what&apos;s in this backup. Anything entered since then in those tables will be lost.</p>
            <p className={styles.modalNote}>A fresh safety backup of the current data is taken automatically first, so this can always be undone by restoring that safety backup afterwards.</p>
            <label className={styles.modalLabel}>
              Type RESTORE to confirm
              <input className={styles.modalInput} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="RESTORE" autoComplete="off" />
            </label>
            <div className={styles.modalActions}>
              <button type="button" className={styles.cancelBtn} onClick={closeModal}>
                Cancel
              </button>
              <button type="button" className={styles.confirmBtn} disabled={confirmText.trim() !== 'RESTORE' || restore.isPending} onClick={doRestore}>
                {restore.isPending ? 'Restoring…' : 'Restore now'}
              </button>
            </div>
            {restore.isError && <p className={styles.modalError}>Restore failed: {(restore.error as Error)?.message ?? 'unknown error'}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
