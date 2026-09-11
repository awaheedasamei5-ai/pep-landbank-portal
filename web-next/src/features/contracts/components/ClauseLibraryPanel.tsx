import { useState } from 'react';
import { useContractClauses, useCreateContractClause } from '../hooks/useContractTemplates';
import styles from './ClauseLibraryPanel.module.css';

interface ClauseLibraryPanelProps {
  onInsert: (clauseId: string, body: string) => void;
}

// CONTRACT_OF_SALE_BLUEPRINT.md §6.2 -- converged from PandaDoc's real
// Content Library "Add content library item" picker (a row of preview
// cards for reusable blocks). Clicking a clause inserts a COPY of its
// body as a new section (clauseId kept only for lineage) -- the version
// stays self-contained even if the library clause is edited afterward.
export function ClauseLibraryPanel({ onInsert }: ClauseLibraryPanelProps) {
  const { data: clauses } = useContractClauses();
  const createClause = useCreateContractClause();
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const filtered = (clauses ?? []).filter((c) => !q || c.name.toLowerCase().includes(q) || (c.category ?? '').toLowerCase().includes(q));

  async function submit() {
    if (!name.trim() || !body.trim()) {
      setError('Name and body are both required.');
      return;
    }
    try {
      const created = await createClause.mutateAsync({ name: name.trim(), category: category.trim() || undefined, body: body.trim() });
      onInsert(created.id, created.body);
      setAdding(false);
      setName('');
      setCategory('');
      setBody('');
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that clause.');
    }
  }

  return (
    <div className={styles.wrap}>
      <input className={styles.search} placeholder="Search clauses…" value={query} onChange={(e) => setQuery(e.target.value)} />

      {filtered.length === 0 && <p className={styles.empty}>{(clauses ?? []).length === 0 ? 'No clauses in the library yet — add one from any template’s editor.' : 'No clauses match that search.'}</p>}
      <div className={styles.list}>
        {filtered.map((c) => (
          <button key={c.id} type="button" className={styles.card} onClick={() => onInsert(c.id, c.body)}>
            <span className={styles.cardName}>
              {c.name}
              {c.category && <span className={styles.cardCategory}>{c.category}</span>}
            </span>
            <div className={styles.cardPreview}>{c.body.slice(0, 80)}{c.body.length > 80 ? '…' : ''}</div>
          </button>
        ))}
      </div>

      {!adding && (
        <button type="button" className={styles.addBtn} onClick={() => setAdding(true)}>
          + New clause
        </button>
      )}

      {adding && (
        <div className={styles.form}>
          <input className={styles.input} placeholder="Clause name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <input className={styles.input} placeholder="Category (optional)" value={category} onChange={(e) => setCategory(e.target.value)} />
          <textarea className={styles.textarea} placeholder="Clause text — may include {{tokens}}" value={body} onChange={(e) => setBody(e.target.value)} />
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.formActions}>
            <button type="button" className={styles.confirmBtn} disabled={createClause.isPending} onClick={submit}>
              {createClause.isPending ? 'Saving…' : 'Save & insert'}
            </button>
            <button type="button" className={styles.cancelBtn} onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
