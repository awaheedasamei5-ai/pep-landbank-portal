import { useState } from 'react';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useStaffDirectory } from '../../memos/hooks/useMemos';
import { useTasks, useCreateTask, useUpdateTaskStatus, useReassignTask } from '../hooks/useTasks';
import { useTaskDescriptionDraft } from '../hooks/useTaskDescriptionDraft';
import type { ScheduleItem, ScheduleItemStatus } from '../../../types/domain';
import styles from './TaskBoardScreen.module.css';

// Master Spec Section 10.1's "Task Board" view -- kind='task' schedule_items,
// deliberately separate from My Day's kind='todo' kanban (same table, same
// visual pattern, different rows: a task is ongoing/assignable work with a
// category/priority/due date, a todo is a same-day personal checklist item).
//
// Scoped down from the full Section 10.2 task model -- built: title,
// description, category, priority, assignee, due date, status, reassignment
// (attributed via assigned_by). Deliberately NOT built this pass, and not
// pretended: dependencies (Blocked by/Blocking -- would need new schema,
// schedule_items has no such column today), recurrence UI (the DB columns
// exist, unused here), meetings/RSVP, linked lead/site visit, attachments,
// and the Week/Month Calendar + Team Schedule + Timeline views from Section
// 10.1 (Task Board is one of six named views; this is that one view only).
const PRIORITIES = ['Low', 'Medium', 'High'] as const;
const CATEGORIES = ['Follow-up', 'Admin', 'Site Visit', 'Documentation', 'Other'] as const;

const COLUMNS: { status: ScheduleItemStatus; label: string; color: string }[] = [
  { status: 'open', label: 'To Do', color: 'var(--c-info)' },
  { status: 'in_progress', label: 'In Progress', color: 'var(--c-warn)' },
  { status: 'closed', label: 'Done', color: 'var(--c-success)' },
  { status: 'cancelled', label: 'Cancelled', color: 'var(--c-danger)' },
];

export function TaskBoardScreen() {
  const profile = useSessionStore((s) => s.profile);
  const isManager = profile?.role === 'manager';
  const { data: tasks, isLoading } = useTasks();
  const { data: staff } = useStaffDirectory();
  const createTask = useCreateTask();
  const updateStatus = useUpdateTaskStatus();
  const reassign = useReassignTask();
  const descriptionDraft = useTaskDescriptionDraft();

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>('Medium');
  const [assignTo, setAssignTo] = useState(profile?.key ?? '');
  const [dueDate, setDueDate] = useState('');

  const assignableStaff = staff ?? [];
  const all = tasks ?? [];

  async function draftDescription() {
    if (!title.trim()) return;
    const drafted = await descriptionDraft.mutateAsync({ title: title.trim(), category: category || undefined, priority }).catch(() => null);
    if (drafted) setDescription(drafted);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    const target = assignableStaff.find((s) => s.key === assignTo);
    await createTask.mutateAsync({
      title: t,
      description: description.trim() || undefined,
      category: category || undefined,
      priority,
      assignedTo: assignTo || profile?.key || '',
      assignedToName: target?.name ?? profile?.name ?? '',
      dueDate: dueDate || undefined,
    });
    setTitle('');
    setDescription('');
    setCategory('');
    setPriority('Medium');
    setDueDate('');
    setShowForm(false);
  }

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>Task Board</h1>
      <p className={styles.sub}>{isManager ? 'Every task across the team' : 'Your assigned work'}</p>

      <button type="button" className={styles.newBtn} onClick={() => setShowForm((v) => !v)}>
        {showForm ? 'Cancel' : '+ New task'}
      </button>

      {showForm && (
        <form className={styles.form} onSubmit={submit}>
          <input className={styles.input} placeholder="Task title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          <textarea className={styles.textarea} placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          {title.trim() && (
            <button type="button" className={styles.aiDraftBtn} disabled={descriptionDraft.isPending} onClick={draftDescription}>
              {descriptionDraft.isPending ? 'Drafting…' : 'AI: Draft a description'}
            </button>
          )}
          <div className={styles.formRow}>
            <select className={styles.select} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Category…</option>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <select className={styles.select} value={priority} onChange={(e) => setPriority(e.target.value as (typeof PRIORITIES)[number])}>
              {PRIORITIES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className={styles.formRow}>
            <select className={styles.select} value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
              <option value={profile?.key ?? ''}>Myself</option>
              {assignableStaff
                .filter((s) => s.key !== profile?.key)
                .map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.name}
                  </option>
                ))}
            </select>
            <input className={styles.select} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <button type="submit" className={styles.addBtn} disabled={createTask.isPending || !title.trim()}>
            {createTask.isPending ? 'Creating…' : 'Create task'}
          </button>
        </form>
      )}

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
                    <TaskCard key={t.id} task={t} isManager={isManager} staff={assignableStaff} onStatusChange={(status) => updateStatus.mutate({ id: t.id, status })} onReassign={(toKey, toName) => reassign.mutate({ id: t.id, toKey, toName })} />
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
  isManager,
  staff,
  onStatusChange,
  onReassign,
}: {
  task: ScheduleItem;
  isManager: boolean;
  staff: { key: string; name: string }[];
  onStatusChange: (status: ScheduleItemStatus) => void;
  onReassign: (toKey: string, toName: string) => void;
}) {
  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>{task.title}</div>
      {task.description && <div className={styles.cardDesc}>{task.description}</div>}
      <div className={styles.cardMeta}>
        {task.priority && <span className={`${styles.pill} ${task.priority === 'High' ? styles.pillHigh : task.priority === 'Low' ? styles.pillLow : styles.pillMed}`}>{task.priority}</span>}
        {task.category && <span className={styles.pillNeutral}>{task.category}</span>}
        {task.date && <span className={styles.pillNeutral}>Due {task.date}</span>}
      </div>
      {isManager && <div className={styles.cardAssignee}>{task.assignedToName ?? task.assignedTo}</div>}
      <select className={styles.cardMoveSelect} value={task.status} onChange={(e) => onStatusChange(e.target.value as ScheduleItemStatus)} aria-label={`Move "${task.title}"`}>
        {COLUMNS.map((c) => (
          <option key={c.status} value={c.status}>
            {c.label}
          </option>
        ))}
      </select>
      {isManager && staff.length > 0 && (
        <select className={styles.cardMoveSelect} value={task.assignedTo} onChange={(e) => { const s = staff.find((x) => x.key === e.target.value); if (s) onReassign(s.key, s.name); }} aria-label={`Reassign "${task.title}"`}>
          {staff.map((s) => (
            <option key={s.key} value={s.key}>
              {s.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
