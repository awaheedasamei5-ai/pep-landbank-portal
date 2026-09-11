import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useStaffDirectory } from '../../memos/hooks/useMemos';
import { useLeads } from '../../pipeline/hooks/useLeads';
import { useAllLeads } from '../../payments/hooks/useLogPayment';
import { useSiteVisits } from '../../site-visits/hooks/useSiteVisits';
import { fmtLongDate } from '../../../shared/lib/format';
import { useUpdateTaskStatus, useReassignTask } from '../hooks/useTasks';
import { useUpdateTodoStatus } from '../hooks/useTodayTodos';
import { useDownloadTaskAttachment, useRemoveTaskAttachment, useTaskAttachments, useTaskEvents, useUploadTaskAttachment } from '../hooks/useTaskDetail';
import { useMeetingInvitees, useRespondToMeeting } from '../hooks/useCalendar';
import type { ScheduleItem, ScheduleItemStatus } from '../../../types/domain';
import styles from './ItemDetailModal.module.css';

const TASK_STATUS_OPTIONS: { value: ScheduleItemStatus; label: string }[] = [
  { value: 'open', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'closed', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' },
];
const TODO_STATUS_OPTIONS: { value: ScheduleItemStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'rescheduled', label: 'Rescheduled' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'closed', label: 'Closed' },
];

function timeRange(item: ScheduleItem): string | null {
  if (!item.startTime) return null;
  const start = item.startTime.slice(0, 5);
  const end = item.endTime ? item.endTime.slice(0, 5) : null;
  return end ? `${start}–${end}` : start;
}

// Real user ask (2026-09-06): "when u click on a task u see all the
// details." Generalizes the inline expand logic TaskBoardScreen's own
// TaskCard already had (attachments/activity/reassign-with-reason) into
// one kind-aware modal any view can open -- My Day, Week, Month, Team
// Schedule all had a task/todo/meeting they could show but nowhere to
// open it into. Built on DayClearedCelebration's own real overlay
// convention (position:fixed inset:0 backdrop + centered card,
// z-index:200) -- the first full-screen modal in this app, reused rather
// than inventing a second one.
export function ItemDetailModal({ item, onClose }: { item: ScheduleItem; onClose: () => void }) {
  const navigate = useNavigate();
  const profile = useSessionStore((s) => s.profile);
  const isManager = profile?.role === 'manager';
  const { data: staff } = useStaffDirectory();
  const ownLeads = useLeads();
  const allLeads = useAllLeads();
  const { data: leads } = isManager ? allLeads : ownLeads;
  const { data: visits } = useSiteVisits();

  const updateTaskStatus = useUpdateTaskStatus();
  const updateTodoStatus = useUpdateTodoStatus();
  const reassign = useReassignTask();
  const events = useTaskEvents(item.kind === 'task' ? item.id : null);
  const attachments = useTaskAttachments(item.kind === 'task' ? item.id : null);
  const upload = useUploadTaskAttachment();
  const remove = useRemoveTaskAttachment();
  const download = useDownloadTaskAttachment();
  const invitees = useMeetingInvitees(item.kind === 'meeting' ? item.id : null);
  const respond = useRespondToMeeting();

  const [reassignTarget, setReassignTarget] = useState<{ key: string; name: string } | null>(null);
  const [reason, setReason] = useState('');

  const linkedLead = item.linkedLeadId ? (leads ?? []).find((l) => l.id === item.linkedLeadId) : null;
  const linkedVisit = item.linkedSiteVisitId ? (visits ?? []).find((v) => v.id === item.linkedSiteVisitId) : null;
  const myInvite = (invitees.data ?? []).find((i) => i.staffKey === profile?.key);
  const range = timeRange(item);

  function changeStatus(status: ScheduleItemStatus) {
    if (item.kind === 'task') updateTaskStatus.mutate({ id: item.id, status });
    else updateTodoStatus.mutate({ id: item.id, status });
  }

  function confirmReassign() {
    if (!reassignTarget || !reason.trim()) return;
    reassign.mutate({ id: item.id, toKey: reassignTarget.key, toName: reassignTarget.name, reason: reason.trim() });
    setReassignTarget(null);
    setReason('');
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.card} onClick={(e) => e.stopPropagation()}>
        <div className={styles.head}>
          <span className={`${styles.kindBadge} ${styles[`kind_${item.kind}`]}`}>{item.kind === 'meeting' ? '📅 Meeting' : item.kind === 'task' ? '✓ Task' : '• To-do'}</span>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <h2 className={styles.title}>{item.title}</h2>
        <div className={styles.meta}>
          {fmtLongDate(item.date)}
          {range ? ` · ${range}` : ''}
          {item.meetingLocation ? ` · ${item.meetingLocation}` : ''}
        </div>

        {(item.description || item.notes) && (
          <div className={styles.section}>
            {item.description && <p className={styles.text}>{item.description}</p>}
            {item.notes && <p className={styles.textMuted}>{item.notes}</p>}
          </div>
        )}

        {(item.category || item.priority) && (
          <div className={styles.pillRow}>
            {item.priority && <span className={`${styles.pill} ${item.priority === 'High' ? styles.pillHigh : item.priority === 'Low' ? styles.pillLow : styles.pillMed}`}>{item.priority}</span>}
            {item.category && <span className={styles.pillNeutral}>{item.category}</span>}
          </div>
        )}

        {item.tags && item.tags.length > 0 && (
          <div className={styles.pillRow}>
            {item.tags.map((t) => (
              <span key={t} className={styles.tagPill}>
                {t}
              </span>
            ))}
          </div>
        )}

        {(linkedLead || linkedVisit) && (
          <div className={styles.section}>
            <div className={styles.sectionLabel}>Linked</div>
            {linkedLead && (
              <button type="button" className={styles.linkBtn} onClick={() => navigate(`/app/sales/pipeline/${linkedLead.id}`)}>
                🔗 {linkedLead.name} — {linkedLead.contact}
              </button>
            )}
            {linkedVisit && <div className={styles.linkStatic}>🔗 Site visit: {linkedVisit.name} — {linkedVisit.visitDate}</div>}
          </div>
        )}

        {item.kind !== 'meeting' && (
          <div className={styles.section}>
            <div className={styles.sectionLabel}>Status</div>
            <select className={styles.select} value={item.status} onChange={(e) => changeStatus(e.target.value as ScheduleItemStatus)}>
              {(item.kind === 'task' ? TASK_STATUS_OPTIONS : TODO_STATUS_OPTIONS).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {item.kind === 'task' && isManager && (staff ?? []).length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionLabel}>Reassign</div>
            <select
              className={styles.select}
              value={item.assignedTo}
              onChange={(e) => {
                const s = (staff ?? []).find((x) => x.key === e.target.value);
                if (s && s.key !== item.assignedTo) setReassignTarget(s);
              }}
            >
              {(staff ?? []).map((s) => (
                <option key={s.key} value={s.key}>
                  {s.name}
                </option>
              ))}
            </select>
            {reassignTarget && (
              <div className={styles.reassignBox}>
                <div className={styles.reassignLabel}>Why reassign to {reassignTarget.name}?</div>
                <input className={styles.input} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" autoFocus />
                <div className={styles.reassignActions}>
                  <button type="button" className={styles.reassignCancel} onClick={() => setReassignTarget(null)}>
                    Cancel
                  </button>
                  <button type="button" className={styles.reassignConfirm} disabled={!reason.trim()} onClick={confirmReassign}>
                    Confirm
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {item.kind === 'meeting' && myInvite && myInvite.status === 'invited' && (
          <div className={styles.section}>
            <div className={styles.reassignActions}>
              <button type="button" className={styles.reassignConfirm} disabled={respond.isPending} onClick={() => respond.mutate({ inviteeId: myInvite.id, status: 'accepted' })}>
                Accept
              </button>
              <button type="button" className={styles.reassignCancel} disabled={respond.isPending} onClick={() => respond.mutate({ inviteeId: myInvite.id, status: 'declined' })}>
                Decline
              </button>
            </div>
          </div>
        )}
        {item.kind === 'meeting' && (
          <div className={styles.section}>
            <div className={styles.sectionLabel}>Attendees</div>
            <div className={styles.pillRow}>
              {(invitees.data ?? []).map((i) => (
                <span key={i.id} className={`${styles.pillNeutral} ${i.status === 'accepted' ? styles.pillLow : i.status === 'declined' ? styles.pillHigh : ''}`}>
                  {i.staffName ?? (staff ?? []).find((s) => s.key === i.staffKey)?.name ?? i.staffKey} {i.status === 'accepted' ? '✓' : i.status === 'declined' ? '✕' : '…'}
                </span>
              ))}
            </div>
          </div>
        )}

        {item.kind === 'task' && (
          <>
            <div className={styles.section}>
              <div className={styles.sectionLabel}>Attachments</div>
              {(attachments.data ?? []).map((a) => (
                <div key={a.id} className={styles.attachmentRow}>
                  <button type="button" className={styles.linkBtn} onClick={() => download.mutate(a.storagePath)}>
                    📎 {a.fileName}
                  </button>
                  <button type="button" className={styles.attachmentRemove} onClick={() => remove.mutate({ id: a.id, storagePath: a.storagePath, taskId: item.id })}>
                    ✕
                  </button>
                </div>
              ))}
              {(attachments.data ?? []).length === 0 && <div className={styles.textMuted}>No files attached.</div>}
              <label className={styles.uploadBtn}>
                {upload.isPending ? 'Uploading…' : '+ Attach a file'}
                <input
                  type="file"
                  hidden
                  disabled={upload.isPending}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) upload.mutate({ taskId: item.id, file });
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
            <div className={styles.section}>
              <div className={styles.sectionLabel}>Activity</div>
              {(events.data ?? []).map((ev) => (
                <div key={ev.id} className={styles.eventRow}>
                  <span className={styles.eventActor}>{ev.actorName ?? 'Someone'}</span>{' '}
                  {ev.type === 'created' && 'created this task'}
                  {ev.type === 'status_changed' && `moved it to ${ev.toKey}`}
                  {ev.type === 'reassigned' && (
                    <>
                      reassigned to {ev.toName ?? ev.toKey}
                      {ev.note && <span className={styles.textMuted}> — {ev.note}</span>}
                    </>
                  )}
                  <span className={styles.eventTime}>{new Date(ev.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
              {(events.data ?? []).length === 0 && <div className={styles.textMuted}>No activity logged yet.</div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
