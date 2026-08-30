import { useState } from 'react';
import { useCreateNote, useDeleteNote, useNotes, useUpdateNote } from '../hooks/useNotes';
import type { Note } from '../../../types/domain';
import styles from './NotesScreen.module.css';

// Real table `notes` (confirmed live): a private per-staff scratchpad,
// strictly owner-only for writes. Simple enough to build as full CRUD with
// no scoped-down subset -- no PDF/document generation involved, unlike
// most of this session's Office Desk features.
export function NotesScreen() {
  const { data: notes, isLoading } = useNotes();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div>
          <div className={styles.eyebrow}>Personal</div>
          <h1 className={styles.title}>Notes</h1>
          <p className={styles.sub}>Quick private notes &mdash; jot something down, save it.</p>
        </div>
        <button
          type="button"
          className={styles.addBtn}
          onClick={() => {
            setCreating((v) => !v);
            setExpandedId(null);
          }}
        >
          {creating ? 'Cancel' : '+ New note'}
        </button>
      </div>

      {creating && <NewNoteForm onDone={() => setCreating(false)} />}

      {isLoading && <p style={{ color: 'var(--c-muted)' }}>Loading…</p>}
      {notes && notes.length === 0 && !isLoading && !creating && <p style={{ color: 'var(--c-muted)' }}>No notes yet.</p>}

      <div className={styles.list}>
        {notes?.map((n) => (
          <div className={styles.card} key={n.id}>
            <button type="button" className={styles.row} onClick={() => setExpandedId(expandedId === n.id ? null : n.id)} aria-expanded={expandedId === n.id}>
              <div className={styles.rowText}>
                <div className={styles.noteTitle}>{n.title || 'Untitled'}</div>
                {expandedId !== n.id && <div className={styles.snippet}>{n.body}</div>}
              </div>
              <div className={styles.date}>{n.updatedAt.slice(0, 10)}</div>
            </button>
            {expandedId === n.id && <NoteEditor note={n} onDeleted={() => setExpandedId(null)} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function NewNoteForm({ onDone }: { onDone: () => void }) {
  const create = useCreateNote();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  async function submit() {
    if (!title.trim() && !body.trim()) return;
    await create.mutateAsync({ title: title.trim(), body: body.trim() });
    onDone();
  }

  return (
    <div className={styles.formCard}>
      <input className={styles.titleInput} placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea className={styles.bodyInput} placeholder="Write something…" value={body} onChange={(e) => setBody(e.target.value)} />
      <button type="button" className={styles.saveBtn} disabled={create.isPending || (!title.trim() && !body.trim())} onClick={submit}>
        {create.isPending ? 'Saving…' : 'Save note'}
      </button>
    </div>
  );
}

function NoteEditor({ note, onDeleted }: { note: Note; onDeleted: () => void }) {
  const update = useUpdateNote();
  const del = useDeleteNote();
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const dirty = title !== note.title || body !== note.body;

  return (
    <div className={styles.editor}>
      <input className={styles.titleInput} placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea className={styles.bodyInput} value={body} onChange={(e) => setBody(e.target.value)} />
      <div className={styles.editorActions}>
        <button type="button" className={styles.saveBtn} disabled={!dirty || update.isPending} onClick={() => update.mutate({ id: note.id, input: { title: title.trim(), body: body.trim() } })}>
          {update.isPending ? 'Saving…' : 'Save changes'}
        </button>
        {confirmingDelete ? (
          <>
            <button type="button" className={styles.confirmDeleteBtn} disabled={del.isPending} onClick={() => del.mutate(note.id, { onSuccess: onDeleted })}>
              {del.isPending ? '…' : 'Confirm delete'}
            </button>
            <button type="button" className={styles.cancelBtn} onClick={() => setConfirmingDelete(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button type="button" className={styles.deleteBtn} onClick={() => setConfirmingDelete(true)}>
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
