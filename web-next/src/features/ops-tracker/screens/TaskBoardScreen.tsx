import { useState } from 'react';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useStaffDirectory } from '../../memos/hooks/useMemos';
import { useTasks, useUpdateTaskStatus, useReassignTask } from '../hooks/useTasks';
import { useDownloadTaskAttachment, useRemoveTaskAttachment, useTaskAttachments, useTaskEvents, useUploadTaskAttachment } from '../hooks/useTaskDetail';
import { AddTaskModal } from '../components/AddTaskModal';
import type { ScheduleItem, ScheduleItemStatus } from '../../../types/domain';
import styles from './TaskBoardScreen.module.css';

// Master Spec Section 10.1's "Task Board" view -- kind='task' schedule_items,
// deliberately separate from My Day's kind='todo' kanban (same table, same
// visual pattern, different rows: a task is ongoing/assignable work with a
// category/priority/due date, a todo is a same-day personal checklist item).
//
// Full Section 10.2 task model, closed out 2026-09-06: dependencies
// (Blocked by/Blocking, real blocked_by_id column + a real stored
// 'blocked' status), recurrence (recurs_freq/interval/until, a closed
// recurring task spawns its next instance without duplicating history),
// linked lead/site visit, attachments (task-attachments Storage bucket),
// activity history (task_events), and reassignment with a required
// reason. Meetings/Week/Month Calendar/Team Schedule are their own
// screens (this is still just the one Task Board view of Section 10.1's
// six named views).
const COLUMNS: { status: ScheduleItemStatus; label: string; color: string }[] = [
  { status: 'open', label: 'To Do', color: 'var(--c-info)' },
  { status: 'in_progress', label: 'In Progress', color: 'var(--c-warn)' },
  { status: 'blocked', label: 'Blocked', color: 'var(--c-danger)' },
  { status: 'closed', label: 'Done', color: 'var(--c-success)' },
  { status: 'cancelled', label: 'Cancelled', color: 'var(--c-faint)' },
];

export function TaskBoardScreen() {
  const profile = useSessionStore((s) => s.profile);
  const isManager = profile?.role === 'manager';
  const { data: tasks, isLoading } = useTasks();
  const { data: staff } = useStaffDirectory();
  const updateStatus = useUpdateTaskStatus();
  const reassign = useReassignTask();

  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const assignableStaff = staff ?? [];
  const all = tasks ?? [];

  return (
    <div className={styles.wrap}>
      <p className={styles.sub}>{isManager ? 'Every task across the team' : 'Your assigned work'}</p>

      <button type="button" className={styles.newBtn} onClick={() => setShowForm(true)}>
        + New task
      </button>

      {showForm && <AddTaskModal onClose={() => setShowForm(false)} />}

      {isLoading && <p className={styles.empty}>Loading…</p>}
      {!isLoading && all.length === 0 && <p className={styles.empty}>No tasks yet -- create the first one above.</p>}

      {!isLoading && all.length > 0 && (
        <div className={styles.board}>
          {COLUMNS.map((col) => {
            const items = all.filter((t) => t.status === col.status);
            return (
              <div className={styles.column} key={col.status}>
                <div className={styles.columnHead}>
                  <span className={styles.columnDot} style={{ background: col.color }} />
                  <span className={styles.columnLabel}>{col.label}</span>
                  <span className={styles.columnCount}>{items.length}</span>
                </div>
                <div className={styles.columnBody}>
                  {items.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      allTasks={all}
                      isManager={isManager}
                      staff={assignableStaff}
                      expanded={expandedId === t.id}
                      onToggleExpand={() => setExpandedId((cur) => (cur === t.id ? null : t.id))}
                      onStatusChange={(status) => updateStatus.mutate({ id: t.id, status })}
                      onReassign={(toKey, toName, reason) => reassign.mutate({ id: t.id, toKey, toName, reason })}
                    />
                  ))}
                  {items.length === 0 && <div className={styles.columnEmpty}>Nothing here</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TaskCard({
  task,
  allTasks,
  isManager,
  staff,
  expanded,
  onToggleExpand,
  onStatusChange,
  onReassign,
}: {
  task: ScheduleItem;
  allTasks: ScheduleItem[];
  isManager: boolean;
  staff: { key: string; name: string }[];
  expanded: boolean;
  onToggleExpand: () => void;
  onStatusChange: (status: ScheduleItemStatus) => void;
  onReassign: (toKey: string, toName: string, reason: string) => void;
}) {
  const [reassignTarget, setReassignTarget] = useState<{ key: string; name: string } | null>(null);
  const [reason, setReason] = useState('');
  const events = useTaskEvents(expanded ? task.id : null);
  const attachments = useTaskAttachments(expanded ? task.id : null);
  const upload = useUploadTaskAttachment();
  const remove = useRemoveTaskAttachment();
  const download = useDownloadTaskAttachment();
  // Only worth showing as a live warning while it's actually still
  // blocking (predecessor not yet done) -- a linked-but-already-
  // completed predecessor isn't holding this task back anymore, so
  // labeling it "Blocked by" would read as wrong the moment the
  // predecessor finishes, even though the link itself is still real.
  const blocker = task.blockedById ? allTasks.find((t) => t.id === task.blockedById) : null;
  const stillBlocking = !!blocker && blocker.status !== 'closed';

  function confirmReassign() {
    if (!reassignTarget || !reason.trim()) return;
    onReassign(reassignTarget.key, reassignTarget.name, reason.trim());
    setReassignTarget(null);
    setReason('');
  }

  return (
    <div className={styles.card}>
      <div className={styles.cardTitle} onClick={onToggleExpand} role="button" tabIndex={0}>
        {task.title}
      </div>
      {task.description && <div className={styles.cardDesc}>{task.description}</div>}
      <div className={styles.cardMeta}>
        {task.priority && <span className={`${styles.pill} ${task.priority === 'High' ? styles.pillHigh : task.priority === 'Low' ? styles.pillLow : styles.pillMed}`}>{task.priority}</span>}
        {task.category && <span className={styles.pillNeutral}>{task.category}</span>}
        {task.date && (
          <span className={styles.pillNeutral}>
            Due {task.date}
            {task.startTime && ` ${task.startTime.slice(0, 5)}${task.endTime ? `–${task.endTime.slice(0, 5)}` : ''}`}
          </span>
        )}
        {task.recursFreq && <span className={styles.pillNeutral}>↻ {task.recursFreq}</span>}
      </div>
      {stillBlocking && <div className={styles.blockedNote}>Blocked by: {blocker.title}</div>}
      {isManager && <div className={styles.cardAssignee}>{task.assignedToName ?? task.assignedTo}</div>}
      <select
        className={styles.cardMoveSelect}
        value={task.status}
        disabled={task.status === 'blocked' && stillBlocking}
        onChange={(e) => onStatusChange(e.target.value as ScheduleItemStatus)}
        aria-label={`Move "${task.title}"`}
      >
        {COLUMNS.map((c) => (
          <option key={c.status} value={c.status}>
            {c.label}
          </option>
        ))}
      </select>
      {isManager && staff.length > 0 && (
        <select
          className={styles.cardMoveSelect}
          value={task.assignedTo}
          onChange={(e) => {
            const s = staff.find((x) => x.key === e.target.value);
            if (s && s.key !== task.assignedTo) setReassignTarget(s);
          }}
          aria-label={`Reassign "${task.title}"`}
        >
          {staff.map((s) => (
            <option key={s.key} value={s.key}>
              {s.name}
            </option>
          ))}
        </select>
      )}
      {reassignTarget && (
        <div className={styles.reassignBox}>
          <div className={styles.reassignLabel}>Why reassign to {reassignTarget.name}?</div>
          <input className={styles.input} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" autoFocus />
          <div className={styles.formRow}>
            <button type="button" className={styles.reassignCancel} onClick={() => setReassignTarget(null)}>
              Cancel
            </button>
            <button type="button" className={styles.reassignConfirm} disabled={!reason.trim()} onClick={confirmReassign}>
              Confirm
            </button>
          </div>
        </div>
      )}
      <button type="button" className={styles.expandToggle} onClick={onToggleExpand}>
        {expanded ? 'Hide details' : 'Details & history'}
      </button>
      {expanded && (
        <div className={styles.detailBlock}>
          {task.notes && (
            <div className={styles.detailSection}>
              <div className={styles.detailLabel}>Notes</div>
              <div className={styles.detailText}>{task.notes}</div>
            </div>
          )}
          <div className={styles.detailSection}>
            <div className={styles.detailLabel}>Attachments</div>
            {(attachments.data ?? []).map((a) => (
              <div key={a.id} className={styles.attachmentRow}>
                <button type="button" className={styles.attachmentName} onClick={() => download.mutate(a.storagePath)}>
                  📎 {a.fileName}
                </button>
                <button type="button" className={styles.attachmentRemove} onClick={() => remove.mutate({ id: a.id, storagePath: a.storagePath, taskId: task.id })}>
                  ✕
                </button>
              </div>
            ))}
            {(attachments.data ?? []).length === 0 && <div className={styles.detailEmpty}>No files attached.</div>}
            <label className={styles.uploadBtn}>
              {upload.isPending ? 'Uploading…' : '+ Attach a file'}
              <input
                type="file"
                hidden
                disabled={upload.isPending}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) upload.mutate({ taskId: task.id, file });
                  e.target.value = '';
                }}
              />
            </label>
          </div>
          <div className={styles.detailSection}>
            <div className={styles.detailLabel}>Activity</div>
            {(events.data ?? []).map((ev) => (
              <div key={ev.id} className={styles.eventRow}>
                <span className={styles.eventActor}>{ev.actorName ?? 'Someone'}</span>{' '}
                {ev.type === 'created' && 'created this task'}
                {ev.type === 'status_changed' && `moved it to ${ev.toKey}`}
                {ev.type === 'reassigned' && (
                  <>
                    reassigned to {ev.toName ?? ev.toKey}
                    {ev.note && <span className={styles.eventNote}> — {ev.note}</span>}
                  </>
                )}
                <span className={styles.eventTime}>{new Date(ev.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            ))}
            {(events.data ?? []).length === 0 && <div className={styles.detailEmpty}>No activity logged yet.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
