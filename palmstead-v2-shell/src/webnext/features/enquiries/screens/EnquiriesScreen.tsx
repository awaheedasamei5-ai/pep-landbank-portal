"use client";

import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '../../../shared/ui/Icon';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useStaffDirectory } from '../../memos/hooks/useMemos';
import type { Enquiry } from '../../../types/domain';
import { useDeleteEnquiry, useEnquiries, useUpdateEnquiry } from '../hooks/useEnquiries';
import styles from './EnquiriesScreen.module.css';

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

function statusClass(status: string): string {
  if (status === 'Closed') return styles.statusClosed;
  if (status === 'Escalated') return styles.statusEscalated;
  return styles.statusOpen;
}

// Real user ask (2026-09-05): "what stage is it at closed/escalated to
// another staff or etc" -- enquiries previously had no status/owner
// concept at all. Now matches Complaints' own fixed pattern exactly:
// Management sees every enquiry live, an agent sees ones they logged OR
// were escalated to, and reassigning `owner` actually notifies the person
// it names (useUpdateEnquiry).
export function EnquiriesScreen() {
  const navigate = useNavigate();
  const isManager = useSessionStore((s) => s.profile?.role === 'manager');
  const myKey = useSessionStore((s) => s.profile?.key ?? '');
  const { data: enquiries, isLoading } = useEnquiries();
  const { data: staff } = useStaffDirectory();
  const [expanded, setExpanded] = useState<string | null>(null);

  function ownerName(ownerKey: string | null): string | null {
    if (!ownerKey) return null;
    return staff?.find((s) => s.key === ownerKey)?.name ?? ownerKey;
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Client enquiries</h1>
          <p className={styles.sub}>{isManager ? `${enquiries?.length ?? 0} across the team` : `${enquiries?.length ?? 0} logged or assigned to you`}</p>
        </div>
        <button type="button" className={styles.addBtn} onClick={() => navigate('/dashboard/enquiries/new')}>
          + Log enquiry
        </button>
      </div>

      {isLoading && <p className={styles.emptyMsg}>Loading…</p>}
      {enquiries?.map((e) => {
        const isOpen = expanded === e.id;
        return (
          <div className={styles.card} key={e.id}>
            <button type="button" className={styles.row} onClick={() => setExpanded(isOpen ? null : e.id)} aria-expanded={isOpen}>
              <span className={styles.avatar}>{initials(e.name ?? '') || '?'}</span>
              <div className={styles.topMain}>
                <div className={styles.name}>{e.name}</div>
                <div className={styles.meta}>
                  {e.contact}
                  {e.plot ? ` · ${e.plot}` : ''}
                  {e.source ? ` · ${e.source}` : ''}
                  {ownerName(e.owner) ? ` · Assigned: ${ownerName(e.owner)}` : ''}
                </div>
              </div>
              <div className={styles.right}>
                <div className={styles.date}>{e.createdAt.slice(0, 10)}</div>
                <span className={`${styles.pill} ${statusClass(e.status)}`}>{e.status}</span>
              </div>
              <span className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`}>
                <Icon name="chevronDown" size={15} />
              </span>
            </button>

            {!isOpen && e.types && (
              <div className={styles.chips}>
                {e.types.split(',').map((t) => (
                  <span className={styles.chip} key={t}>
                    {t}
                  </span>
                ))}
              </div>
            )}

            {isOpen && <EnquiryDetail enquiry={e} staff={staff ?? []} canDelete={isManager || e.agentKey === myKey} />}
          </div>
        );
      })}
      {enquiries && enquiries.length === 0 && !isLoading && <p className={styles.emptyMsg}>No enquiries logged yet.</p>}
    </div>
  );
}

function EnquiryDetail({ enquiry, staff, canDelete }: { enquiry: Enquiry; staff: { key: string; name: string }[]; canDelete: boolean }) {
  const update = useUpdateEnquiry();
  const del = useDeleteEnquiry();
  const [status, setStatus] = useState(enquiry.status);
  const [owner, setOwner] = useState(enquiry.owner ?? '');
  const [follow, setFollow] = useState(enquiry.follow ?? '');
  const [followDate, setFollowDate] = useState(enquiry.followDate ?? '');
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const dirty = status !== enquiry.status || owner !== (enquiry.owner ?? '') || follow !== (enquiry.follow ?? '') || followDate !== (enquiry.followDate ?? '');

  return (
    <div className={styles.detail}>
      {enquiry.types && (
        <div className={styles.chips}>
          {enquiry.types.split(',').map((t) => (
            <span className={styles.chip} key={t}>
              {t}
            </span>
          ))}
        </div>
      )}
      {enquiry.details && <p className={styles.detailText}>{enquiry.details}</p>}

      <div className={styles.grid2}>
        <div className={styles.field}>
          <label className={styles.label}>Status</label>
          <select className={styles.select} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option>Open</option>
            <option>Escalated</option>
            <option>Closed</option>
          </select>
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
      </div>
      <div className={styles.grid2}>
        <div className={styles.field}>
          <label className={styles.label}>Follow up?</label>
          <select className={styles.select} value={follow} onChange={(e) => setFollow(e.target.value)}>
            <option value="">Unset</option>
            <option>Yes</option>
            <option>No</option>
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Follow-up date</label>
          <input className={styles.input} type="date" value={followDate} onChange={(e) => setFollowDate(e.target.value)} />
        </div>
      </div>
      <button
        type="button"
        className={styles.saveBtn}
        disabled={!dirty || update.isPending}
        onClick={() =>
          update.mutate({
            id: enquiry.id,
            patch: { status, owner: owner || undefined, follow: follow || undefined, followDate: followDate || undefined },
            previousOwner: enquiry.owner,
            enquiryName: enquiry.name,
          })
        }
      >
        {update.isPending ? 'Saving…' : 'Save changes'}
      </button>

      {canDelete && (
        <div className={styles.deleteZone}>
          {!confirmingDelete ? (
            <button type="button" className={styles.deleteBtn} onClick={() => setConfirmingDelete(true)}>
              Delete enquiry
            </button>
          ) : (
            <div className={styles.deleteConfirm}>
              <span>Delete this enquiry permanently? This can't be undone.</span>
              <button type="button" className={styles.deleteBtn} disabled={del.isPending} onClick={() => del.mutate(enquiry.id)}>
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