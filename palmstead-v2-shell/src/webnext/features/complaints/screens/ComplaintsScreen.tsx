"use client";

import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '../../../shared/ui/Icon';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useStaffDirectory } from '../../memos/hooks/useMemos';
import { PeriodFilterBar } from '../../../shared/ui/PeriodFilterBar';
import { inPeriodRange, usePeriodFilter } from '../../../shared/lib/periodFilter';
import type { Complaint } from '../../../types/domain';
import { useComplaints, useDeleteComplaint, useUpdateComplaint } from '../hooks/useComplaints';
import styles from './ComplaintsScreen.module.css';

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

function statusClass(status: string): string {
  return status === 'Resolved' ? styles.statusResolved : styles.statusOpen;
}
function priorityClass(priority: string | null): string {
  if (priority === 'High') return styles.priorityHigh;
  if (priority === 'Low') return styles.priorityLow;
  return styles.priorityMedium;
}

// Real table `complaints` (confirmed live, agent-scoped exactly like
// enquiries). Unlike payments, complaints_upd RLS is ALSO agent-scoped
// (not manager-only) -- any owning agent can already resolve their own
// complaint via a plain UPDATE, so the edit panel below is open to
// whoever can see the complaint, no manager gate, no RPC.
export function ComplaintsScreen() {
  const navigate = useNavigate();
  const isManager = useSessionStore((s) => s.profile?.role === 'manager');
  const myKey = useSessionStore((s) => s.profile?.key ?? '');
  const { data: complaints, isLoading } = useComplaints();
  const { data: staff } = useStaffDirectory();
  const [expanded, setExpanded] = useState<string | null>(null);
  const period = usePeriodFilter();

  function ownerName(ownerKey: string | null): string | null {
    if (!ownerKey) return null;
    return staff?.find((s) => s.key === ownerKey)?.name ?? ownerKey;
  }

  const filtered = (complaints ?? []).filter((c) => inPeriodRange(c.createdAt, period.range));

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Complaints</h1>
          <p className={styles.sub}>{isManager ? `${complaints?.length ?? 0} across the team` : `${complaints?.length ?? 0} logged or assigned to you`}</p>
        </div>
        <button type="button" className={styles.addBtn} onClick={() => navigate('/dashboard/complaints/new')}>
          + Log complaint
        </button>
      </div>

      <PeriodFilterBar state={period} resultCount={filtered.length} totalCount={complaints?.length} />

      {isLoading && <p className={styles.emptyMsg}>Loading…</p>}
      {filtered.map((c) => {
        const isOpen = expanded === c.id;
        return (
          <div className={styles.card} key={c.id}>
            <button type="button" className={styles.row} onClick={() => setExpanded(isOpen ? null : c.id)} aria-expanded={isOpen}>
              <span className={styles.avatar}>{initials(c.name ?? '') || '?'}</span>
              <div className={styles.rowMain}>
                <div className={styles.name}>{c.name}</div>
                <div className={styles.meta}>
                  {c.contact}
                  {c.category ? ` · ${c.category}` : ''}
                  {ownerName(c.owner) ? ` · Assigned: ${ownerName(c.owner)}` : ''}
                </div>
              </div>
              <div className={styles.right}>
                <div className={styles.date}>{c.createdAt.slice(0, 10)}</div>
                <div className={styles.pillRow}>
                  {c.priority && <span className={`${styles.pill} ${priorityClass(c.priority)}`}>{c.priority}</span>}
                  <span className={`${styles.pill} ${statusClass(c.status)}`}>{c.status}</span>
                </div>
              </div>
              <span className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`}>
                <Icon name="chevronDown" size={15} />
              </span>
            </button>
            {isOpen && <ComplaintDetail complaint={c} staff={staff ?? []} canDelete={isManager || c.agentKey === myKey} />}
          </div>
        );
      })}
      {complaints && complaints.length === 0 && !isLoading && <p className={styles.emptyMsg}>No complaints logged yet.</p>}
      {complaints && complaints.length > 0 && filtered.length === 0 && !isLoading && (
        <p className={styles.emptyMsg}>No complaints logged for {period.label}. Widen the filter above to see older ones.</p>
      )}
    </div>
  );
}

function ComplaintDetail({ complaint, staff, canDelete }: { complaint: Complaint; staff: { key: string; name: string }[]; canDelete: boolean }) {
  const update = useUpdateComplaint();
  const del = useDeleteComplaint();
  const [status, setStatus] = useState(complaint.status);
  const [priority, setPriority] = useState(complaint.priority ?? '');
  const [owner, setOwner] = useState(complaint.owner ?? '');
  const [resolution, setResolution] = useState(complaint.resolution ?? '');
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const dirty = status !== complaint.status || priority !== (complaint.priority ?? '') || owner !== (complaint.owner ?? '') || resolution !== (complaint.resolution ?? '');

  return (
    <div className={styles.detail}>
      {complaint.details && <p className={styles.detailText}>{complaint.details}</p>}

      <div className={styles.grid2}>
        <div className={styles.field}>
          <label className={styles.label}>Status</label>
          <select className={styles.select} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option>Open</option>
            <option>Resolved</option>
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Priority</label>
          <select className={styles.select} value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="">Unset</option>
            <option>High</option>
            <option>Medium</option>
            <option>Low</option>
          </select>
        </div>
      </div>
      <div className={styles.field}>
        <label className={styles.label}>Owner — who's handling this</label>
        <select className={styles.select} value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="">Unassigned</option>
          {staff.map((s) => (
            <option key={s.key} value={s.key}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.field}>
        <label className={styles.label}>Resolution</label>
        <textarea className={styles.textarea} value={resolution} onChange={(e) => setResolution(e.target.value)} />
      </div>
      <button
        type="button"
        className={styles.saveBtn}
        disabled={!dirty || update.isPending}
        onClick={() =>
          update.mutate({
            id: complaint.id,
            patch: { status, priority: priority || undefined, owner: owner || undefined, resolution: resolution || undefined },
            previousOwner: complaint.owner,
            complaintName: complaint.name,
          })
        }
      >
        {update.isPending ? 'Saving…' : 'Save changes'}
      </button>

      {canDelete && (
        <div className={styles.deleteZone}>
          {!confirmingDelete ? (
            <button type="button" className={styles.deleteBtn} onClick={() => setConfirmingDelete(true)}>
              Delete complaint
            </button>
          ) : (
            <div className={styles.deleteConfirm}>
              <span>Delete this complaint permanently? This can't be undone.</span>
              <button type="button" className={styles.deleteBtn} disabled={del.isPending} onClick={() => del.mutate(complaint.id)}>
                {del.isPending ? 'Deleting…' : 'Yes, delete'}
              </button>
              <button type="button" className={styles.cancelDeleteBtn} onClick={() => setConfirmingDelete(false)}>
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}