import { useState } from 'react';
import { Modal } from '../../../shared/ui/Modal';
import { OfficeMapSnippet } from '../../../shared/ui/OfficeMapSnippet';
import { useAttendanceReviews, useDecideAttendanceReview, useDeleteAttendance, useUpdateAttendance } from '../hooks/useAttendance';
import type { AttendanceRecord } from '../../../types/domain';
import styles from './AttendanceDetailModal.module.css';

interface AttendanceDetailModalProps {
  record: AttendanceRecord;
  isManager: boolean;
  hasOfficeConfigured: boolean;
  onClose: () => void;
}

function fmtTime(iso: string | null): string {
  if (!iso) return '--:--';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function isoToTimeInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function timeInputToIso(workDate: string, time: string): string | null {
  if (!time) return null;
  const [h, m] = time.split(':').map(Number);
  const d = new Date(`${workDate}T00:00:00`);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

// ATTENDANCE_BLUEPRINT.md §8 -- triggered from "your recent history" rows
// and a manager's roster row (the calendar heatmap trigger point doesn't
// exist yet, see §5, not yet built). Sign-in/out sections + the map are
// shown to everyone with access to the record; the correction/delete
// block only renders for role==='manager', matching the real
// al_upd_own_or_mgr/al_del_mgr RLS policies (confirmed live 2026-09-11).
export function AttendanceDetailModal({ record, isManager, hasOfficeConfigured, onClose }: AttendanceDetailModalProps) {
  const update = useUpdateAttendance();
  const del = useDeleteAttendance();
  const [signInTime, setSignInTime] = useState(isoToTimeInput(record.signInAt));
  const [signOutTime, setSignOutTime] = useState(isoToTimeInput(record.signOutAt));
  const [saved, setSaved] = useState(false);

  const longDate = new Date(`${record.workDate}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  async function saveCorrection() {
    setSaved(false);
    await update.mutateAsync({
      id: record.id,
      patch: {
        signInAt: timeInputToIso(record.workDate, signInTime),
        signOutAt: timeInputToIso(record.workDate, signOutTime),
      },
    });
    setSaved(true);
  }

  async function deleteRecord() {
    if (!confirm(`Delete ${record.staffName ?? 'this'}'s attendance record for ${record.workDate}? This cannot be undone.`)) return;
    await del.mutateAsync(record.id);
    onClose();
  }

  return (
    <Modal title={`${record.staffName ?? 'Attendance'} — ${longDate}`} onClose={onClose}>
      {record.signInAt && (
        <div className={styles.section}>
          <p className={styles.eyebrow}>Sign-in · {fmtTime(record.signInAt)}</p>
          {record.signInPhoto && <img src={record.signInPhoto} alt="Sign-in selfie" className={styles.photo} />}
          {hasOfficeConfigured && (
            <p className={`${styles.siteLine} ${record.isOffSiteIn ? styles.siteOff : styles.siteOn}`}>
              {record.isOffSiteIn ? `Off-site${record.signInReason ? ` — ${record.signInReason}` : ''}` : 'At the office'}
            </p>
          )}
          <OfficeMapSnippet lat={record.signInLat} lng={record.signInLng} />
        </div>
      )}

      {record.signOutAt && (
        <div className={styles.section}>
          <p className={styles.eyebrow}>Sign-out · {fmtTime(record.signOutAt)}</p>
          {hasOfficeConfigured && (
            <p className={`${styles.siteLine} ${record.isOffSiteOut ? styles.siteOff : styles.siteOn}`}>
              {record.isOffSiteOut ? `Off-site${record.signOutReason ? ` — ${record.signOutReason}` : ''}` : 'At the office'}
            </p>
          )}
          <OfficeMapSnippet lat={record.signOutLat} lng={record.signOutLng} />
        </div>
      )}

      {!record.signInAt && !record.signOutAt && <p className={styles.emptyLine}>No sign-in or sign-out recorded for this day.</p>}

      {isManager && (record.isOffSiteIn || record.isOffSiteOut) && <OffSiteReviewSection record={record} />}

      {isManager && (
        <>
          <p className={styles.correctionHead}>Correct this record</p>
          <div className={styles.timeRow}>
            <div className={styles.timeField}>
              <span className={styles.timeLabel}>Sign-in</span>
              <input type="time" className={styles.timeInput} value={signInTime} onChange={(e) => setSignInTime(e.target.value)} />
            </div>
            <div className={styles.timeField}>
              <span className={styles.timeLabel}>Sign-out</span>
              <input type="time" className={styles.timeInput} value={signOutTime} onChange={(e) => setSignOutTime(e.target.value)} />
            </div>
          </div>
          <button type="button" className={styles.saveBtn} onClick={saveCorrection} disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save changes'}
          </button>
          {saved && <p className={styles.savedTag}>Saved.</p>}

          <div className={styles.dangerZone}>
            <p className={styles.dangerTitle}>Delete this record</p>
            <p className={styles.dangerHint}>Permanently removes this day's attendance entry. This cannot be undone.</p>
            <button type="button" className={styles.deleteBtn} onClick={deleteRecord} disabled={del.isPending}>
              {del.isPending ? 'Deleting…' : 'Delete record'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

// ATTENDANCE_BLUEPRINT.md §13 -- post-hoc classification of an already-
// happened off-site sign-in/out, distinct from the pre-authorization
// OffSiteExceptionsCard workflow. Once a review exists for this record,
// shows a resolved tag instead of the two decision buttons -- a record is
// classified at most once.
function OffSiteReviewSection({ record }: { record: AttendanceRecord }) {
  const { data: reviews } = useAttendanceReviews();
  const decide = useDecideAttendanceReview();
  const [acting, setActing] = useState<'authorized' | 'exception' | null>(null);
  const [note, setNote] = useState('');

  const existing = (reviews ?? []).find((r) => r.attendanceLogId === record.id);

  async function submit() {
    if (!acting) return;
    await decide.mutateAsync({ attendanceLogId: record.id, staffKey: record.staffKey, staffName: record.staffName ?? '', classification: acting, note: note.trim() });
    setActing(null);
    setNote('');
  }

  if (existing) {
    return (
      <p className={existing.classification === 'authorized' ? styles.reviewResolvedOk : styles.reviewResolvedFlag}>
        {existing.classification === 'authorized' ? `✓ Authorized by ${existing.reviewedByName ?? 'Management'}` : `⚠ Flagged by ${existing.reviewedByName ?? 'Management'}`}
        {existing.note ? ` — ${existing.note}` : ''}
      </p>
    );
  }

  return (
    <div className={styles.reviewSection}>
      <p className={styles.reviewPrompt}>This off-site record hasn't been classified yet.</p>
      {acting ? (
        <>
          <textarea className={styles.reviewNoteInput} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          <div className={styles.reviewActions}>
            <button type="button" className={styles.reviewConfirmBtn} onClick={submit} disabled={decide.isPending}>
              {decide.isPending ? 'Saving…' : `Confirm ${acting}`}
            </button>
            <button type="button" className={styles.reviewCancelBtn} onClick={() => setActing(null)}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <div className={styles.reviewActions}>
          <button type="button" className={styles.reviewAuthBtn} onClick={() => setActing('authorized')}>
            Mark authorized
          </button>
          <button type="button" className={styles.reviewFlagBtn} onClick={() => setActing('exception')}>
            Flag as exception
          </button>
        </div>
      )}
    </div>
  );
}
