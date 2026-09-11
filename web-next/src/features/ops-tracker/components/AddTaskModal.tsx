import { useState } from 'react';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useStaffDirectory } from '../../memos/hooks/useMemos';
import { useLeads } from '../../pipeline/hooks/useLeads';
import { useAllLeads } from '../../payments/hooks/useLogPayment';
import { useSiteVisits } from '../../site-visits/hooks/useSiteVisits';
import { useTasks, useCreateTask } from '../hooks/useTasks';
import { useTaskDescriptionDraft } from '../hooks/useTaskDescriptionDraft';
import { Icon } from '../../../shared/ui/Icon';
import type { RecurrenceFreq } from '../../../types/domain';
import styles from './AddTaskModal.module.css';

const PRIORITIES = ['Low', 'Medium', 'High'] as const;
const CATEGORIES = ['Follow-up', 'Admin', 'Site Visit', 'Documentation', 'Other'] as const;
const RECUR_OPTIONS: { value: RecurrenceFreq | ''; label: string }[] = [
  { value: '', label: "Doesn't repeat" },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

// Matches the reference "Add New Task" screen's exact layout: X / title /
// checkmark header, Task Title, Description, a "Due Date & time" pill
// pair, a 3-way colored Priority pill row, a "Project" dropdown pill (this
// app's real closest equivalent is Category -- no separate projects
// concept exists, so it's labeled honestly rather than inventing one),
// and a real Tags chip list (schedule_items.tags, a genuine column, not a
// cosmetic-only chip). Everything the old inline form could already do
// (AI description draft, assign-to, linked lead/site visit, dependency,
// recurrence) survives behind "More options" so no real capability is lost.
export function AddTaskModal({ onClose }: { onClose: () => void }) {
  const profile = useSessionStore((s) => s.profile);
  const isManager = profile?.role === 'manager';
  const { data: staff } = useStaffDirectory();
  const { data: allTasks } = useTasks();
  const ownLeads = useLeads();
  const allLeadsQ = useAllLeads();
  const { data: leads } = isManager ? allLeadsQ : ownLeads;
  const { data: visits } = useSiteVisits();
  const createTask = useCreateTask();
  const descriptionDraft = useTaskDescriptionDraft();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>('Medium');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [notes, setNotes] = useState('');
  const [assignTo, setAssignTo] = useState(profile?.key ?? '');
  const [endTime, setEndTime] = useState('');
  const [linkedLeadId, setLinkedLeadId] = useState('');
  const [linkedSiteVisitId, setLinkedSiteVisitId] = useState('');
  const [blockedById, setBlockedById] = useState('');
  const [recursFreq, setRecursFreq] = useState<RecurrenceFreq | ''>('');
  const [recursInterval, setRecursInterval] = useState('1');
  const [recursUntil, setRecursUntil] = useState('');

  const assignableStaff = staff ?? [];
  const openPredecessorCandidates = (allTasks ?? []).filter((t) => t.status !== 'closed' && t.status !== 'cancelled');

  function addTag() {
    const t = tagDraft.trim();
    if (!t || tags.includes(t)) return;
    setTags((cur) => [...cur, t]);
    setTagDraft('');
  }

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
      notes: notes.trim() || undefined,
      category: category || undefined,
      priority,
      assignedTo: assignTo || profile?.key || '',
      assignedToName: target?.name ?? profile?.name ?? '',
      dueDate: dueDate || undefined,
      startTime: startTime || undefined,
      endTime: endTime || undefined,
      linkedLeadId: linkedLeadId || undefined,
      linkedSiteVisitId: linkedSiteVisitId || undefined,
      blockedById: blockedById || undefined,
      recursFreq: recursFreq || undefined,
      recursInterval: recursFreq ? Number(recursInterval) || 1 : undefined,
      recursUntil: recursFreq ? recursUntil || undefined : undefined,
      tags,
    });
    onClose();
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <form className={styles.card} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className={styles.head}>
          <button type="button" className={styles.circleBtn} onClick={onClose} aria-label="Close">
            ✕
          </button>
          <span className={styles.headTitle}>Add New Task</span>
          <button type="submit" className={`${styles.circleBtn} ${styles.circleBtnConfirm}`} disabled={createTask.isPending || !title.trim()} aria-label="Create task">
            ✓
          </button>
        </div>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Task Title</span>
          <input className={styles.input} placeholder="e.g. Finish landing page design" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Description</span>
          <textarea className={styles.textarea} placeholder="Describe the task" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          {title.trim() && (
            <button type="button" className={styles.aiDraftBtn} disabled={descriptionDraft.isPending} onClick={draftDescription}>
              {descriptionDraft.isPending ? 'Drafting…' : '✨ AI: Draft a description'}
            </button>
          )}
        </div>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Due Date &amp; time</span>
          <div className={styles.pillRow}>
            <label className={styles.pickerPill}>
              <span className={styles.pickerIcon}>
                <Icon name="notepad" size={14} />
              </span>
              <input className={styles.pickerInput} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </label>
            <label className={styles.pickerPill}>
              <span className={styles.pickerIcon}>⏱</span>
              <input className={styles.pickerInput} type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </label>
          </div>
        </div>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Priority</span>
          <div className={styles.priorityRow}>
            {PRIORITIES.map((p) => (
              <button
                key={p}
                type="button"
                className={`${styles.priorityPill} ${priority === p ? styles[`priority${p}Active`] : ''}`}
                onClick={() => setPriority(p)}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Category</span>
          <select className={styles.selectPill} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Select a category…</option>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Tags</span>
          <div className={styles.tagList}>
            {tags.map((t) => (
              <span key={t} className={styles.tagChip}>
                {t}
                <button type="button" className={styles.tagRemove} onClick={() => setTags((cur) => cur.filter((x) => x !== t))} aria-label={`Remove tag ${t}`}>
                  ✕
                </button>
              </span>
            ))}
            <span className={styles.tagAddRow}>
              <input
                className={styles.tagAddInput}
                placeholder="Add tag…"
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addTag();
                  }
                }}
              />
              <button type="button" className={styles.tagAddBtn} onClick={addTag} disabled={!tagDraft.trim()}>
                + Add
              </button>
            </span>
          </div>
        </div>

        <button type="button" className={styles.moreToggle} onClick={() => setShowMore((v) => !v)}>
          {showMore ? '− Fewer options' : '+ Assign to, notes, links, repeat, dependency'}
        </button>

        {showMore && (
          <div className={styles.moreBlock}>
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
            <textarea className={styles.textarea} placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            <div className={styles.formRow}>
              <input className={styles.select} type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} aria-label="End time" />
            </div>
            <select className={styles.select} value={linkedLeadId} onChange={(e) => setLinkedLeadId(e.target.value)}>
              <option value="">Link a lead (optional)</option>
              {(leads ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} — {l.contact}
                </option>
              ))}
            </select>
            <select className={styles.select} value={linkedSiteVisitId} onChange={(e) => setLinkedSiteVisitId(e.target.value)}>
              <option value="">Link a site visit (optional)</option>
              {(visits ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} — {v.visitDate}
                </option>
              ))}
            </select>
            <select className={styles.select} value={blockedById} onChange={(e) => setBlockedById(e.target.value)}>
              <option value="">Blocked by another task? (optional)</option>
              {openPredecessorCandidates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
            <div className={styles.formRow}>
              <select className={styles.select} value={recursFreq} onChange={(e) => setRecursFreq(e.target.value as RecurrenceFreq | '')}>
                {RECUR_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {recursFreq && <input className={styles.select} type="number" min={1} value={recursInterval} onChange={(e) => setRecursInterval(e.target.value)} aria-label="Repeat every N" />}
            </div>
            {recursFreq && <input className={styles.select} type="date" value={recursUntil} onChange={(e) => setRecursUntil(e.target.value)} aria-label="Repeat until" placeholder="Repeat until (optional)" />}
          </div>
        )}

        <button type="submit" className={styles.createBtn} disabled={createTask.isPending || !title.trim()}>
          {createTask.isPending ? 'Creating…' : 'Create Task'}
        </button>
      </form>
    </div>
  );
}
