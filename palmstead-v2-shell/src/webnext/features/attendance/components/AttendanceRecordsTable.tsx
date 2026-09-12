"use client";

import { useEffect, useMemo, useState } from 'react';
import type { AttendanceRecord } from '../../../types/domain';
import { resolveAttendancePhotoUrl } from '../lib/attendancePhotoQueue';
import styles from './AttendanceRecordsTable.module.css';

function timeToInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function combineDateTime(workDate: string, hhmm: string): string | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(`${workDate}T00:00:00`);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

// Real correction tool -- ATTENDANCE_BLUEPRINT.md §8, adapted from
// OpenHRApp's real src/pages/AttendanceLogs.tsx (its own admin
// audit/correction view). Every save writes only signInAt/signOutAt
// (the real al_upd_own_or_mgr RLS shape); every correction and delete
// is Management-only, matching the real al_del_mgr policy.
export function AttendanceRecordsTable({
  records,
  onCorrect,
  onRemove,
  onResetAll,
}: {
  records: AttendanceRecord[];
  onCorrect: (id: string, patch: { signInAt?: string | null; signOutAt?: string | null }) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onResetAll: () => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [staffFilter, setStaffFilter] = useState('ALL');
  const [selected, setSelected] = useState<AttendanceRecord | null>(null);
  const [editIn, setEditIn] = useState('');
  const [editOut, setEditOut] = useState('');
  const [busy, setBusy] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  // The Storage bucket backing sign-in photos is private (real folder-
  // scoped RLS, not a public bucket) -- a stored path needs a signed URL
  // resolved per view, same as the upload pipeline's own
  // resolveAttendancePhotoUrl (attendancePhotoQueue.ts).
  useEffect(() => {
    let cancelled = false;
    setPhotoUrl(null);
    if (selected?.signInPhoto) {
      resolveAttendancePhotoUrl(selected.signInPhoto).then((url) => {
        if (!cancelled) setPhotoUrl(url);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const staffOptions = useMemo(() => {
    const map = new Map<string, string>();
    records.forEach((r) => map.set(r.staffKey, r.staffName ?? r.staffKey));
    return Array.from(map.entries());
  }, [records]);

  const filtered = useMemo(() => {
    let list = [...records];
    if (staffFilter !== 'ALL') list = list.filter((r) => r.staffKey === staffFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((r) => (r.staffName ?? r.staffKey).toLowerCase().includes(q) || r.workDate.includes(q));
    }
    return list.sort((a, b) => b.workDate.localeCompare(a.workDate));
  }, [records, staffFilter, search]);

  function openDetail(rec: AttendanceRecord) {
    setSelected(rec);
    setEditIn(timeToInput(rec.signInAt));
    setEditOut(timeToInput(rec.signOutAt));
  }

  async function handleSave() {
    if (!selected) return;
    setBusy(true);
    try {
      await onCorrect(selected.id, {
        signInAt: combineDateTime(selected.workDate, editIn),
        signOutAt: combineDateTime(selected.workDate, editOut),
      });
      setSelected(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!selected) return;
    if (!window.confirm('Permanently delete this attendance record? This cannot be undone.')) return;
    setBusy(true);
    try {
      await onRemove(selected.id);
      setSelected(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleResetAll() {
    if (!window.confirm('This deletes EVERY attendance record for EVERY staff member. Are you absolutely sure?')) return;
    if (!window.confirm('Second confirmation: this cannot be undone. Proceed?')) return;
    await onResetAll();
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <h3>Attendance records</h3>
        <button type="button" className={styles.resetBtn} onClick={handleResetAll}>
          Reset all records
        </button>
      </div>

      <div className={styles.filters}>
        <input className={styles.search} placeholder="Search by name or date…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className={styles.staffSelect} value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)}>
          <option value="ALL">All staff</option>
          {staffOptions.map(([key, name]) => (
            <option key={key} value={key}>{name}</option>
          ))}
        </select>
      </div>

      <div className={styles.list}>
        {!filtered.length ? (
          <p className={styles.empty}>No matching records.</p>
        ) : (
          filtered.map((rec) => (
            <div key={rec.id} className={styles.row} onClick={() => openDetail(rec)}>
              <div className={styles.rowLeft}>
                <strong>{rec.staffName ?? rec.staffKey}</strong>
                <span className={styles.date}>{rec.workDate}</span>
              </div>
              <div className={styles.rowRight}>
                <span className={styles.time}>{timeToInput(rec.signInAt) || '--:--'} — {timeToInput(rec.signOutAt) || 'Active'}</span>
                {rec.lateReason && <span className={styles.tag}>Late</span>}
                {(rec.isOffSiteIn || rec.isOffSiteOut) && <span className={styles.tag}>Off-site</span>}
              </div>
            </div>
          ))
        )}
      </div>

      {selected && (
        <div className={styles.modalBackdrop} onClick={() => !busy && setSelected(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h4>{selected.staffName ?? selected.staffKey} · {selected.workDate}</h4>
              <button type="button" className={styles.closeBtn} onClick={() => setSelected(null)}>✕</button>
            </div>

            <div className={styles.modalBody}>
              {selected.signInPhoto && (
                photoUrl ? <img src={photoUrl} alt="Sign-in" className={styles.photo} /> : <p className={styles.photoLoading}>Loading photo…</p>
              )}

              <div className={styles.fieldRow}>
                <label className={styles.field}>
                  <span>Sign-in time</span>
                  <input type="time" value={editIn} onChange={(e) => setEditIn(e.target.value)} />
                </label>
                <label className={styles.field}>
                  <span>Sign-out time</span>
                  <input type="time" value={editOut} onChange={(e) => setEditOut(e.target.value)} />
                </label>
              </div>

              {(selected.signInLat != null && selected.signInLng != null) && (
                <a
                  className={styles.mapLink}
                  href={`https://www.google.com/maps?q=${selected.signInLat},${selected.signInLng}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View sign-in location on map
                </a>
              )}

              {selected.signInReason && <p className={styles.reasonNote}>Off-site reason: {selected.signInReason}</p>}
              {selected.lateReason && <p className={styles.reasonNote}>Late reason: {selected.lateReason}</p>}
            </div>

            <div className={styles.modalFooter}>
              <button type="button" className={styles.deleteBtn} disabled={busy} onClick={handleDelete}>
                Delete record
              </button>
              <button type="button" className={styles.saveBtn} disabled={busy} onClick={handleSave}>
                {busy ? 'Saving…' : 'Save correction'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
