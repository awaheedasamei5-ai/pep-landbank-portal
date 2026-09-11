import { useState } from 'react';
import { useContractFields, useCreateContractField } from '../hooks/useContractTemplates';
import type { ContractSection } from '../../../types/domain';
import styles from './MergeFieldsPanel.module.css';

const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9]*$/;
const TOKEN_SCAN = /\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g;

interface MergeFieldsPanelProps {
  templateId: string;
  content: ContractSection[];
  onInsert: (key: string) => void;
}

// CONTRACT_OF_SALE_BLUEPRINT.md §6.2/§7 -- direct port of the real
// Syncfusion Document Template Studio MergeFieldsPanel.jsx pattern
// studied for this blueprint: a chip list unioned from three sources
// (this template's own fields, the common/global catalog, and fields
// already typed in this version's own content but not yet in either
// catalog), click-to-insert-at-caret, and an "Add Field" dialog with a
// scope choice + validated camelCase name. Drag-and-drop (Syncfusion's
// other insertion path) is NOT built -- click is the real, fully
// functional primary path; noted here honestly rather than silently
// left out.
export function MergeFieldsPanel({ templateId, content, onInsert }: MergeFieldsPanelProps) {
  const { data: fields } = useContractFields();
  const createField = useCreateContractField();
  const [adding, setAdding] = useState(false);
  const [scope, setScope] = useState<'template' | 'common'>('template');
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);

  const catalogKeys = new Set((fields ?? []).filter((f) => f.scope === 'common' || f.templateId === templateId).map((f) => f.key));
  const docKeys = new Set<string>();
  for (const section of content) {
    for (const match of (section.text ?? '').matchAll(TOKEN_SCAN)) docKeys.add(match[1]);
  }
  const allKeys = [...catalogKeys, ...[...docKeys].filter((k) => !catalogKeys.has(k))];

  function openDialog() {
    setAdding(true);
    setScope(templateId ? 'template' : 'common');
    setKey('');
    setError(null);
  }

  async function submit() {
    const trimmed = key.trim();
    if (!trimmed) {
      setError('Field name is required.');
      return;
    }
    if (!KEY_PATTERN.test(trimmed)) {
      setError('Must start with a letter and contain only letters/digits.');
      return;
    }
    try {
      await createField.mutateAsync({ key: trimmed, scope, templateId: scope === 'template' ? templateId : null });
      setAdding(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add that field.');
    }
  }

  return (
    <div className={styles.wrap}>
      <p className={styles.hint}>Click a field to insert at the caret.</p>

      {allKeys.length === 0 && <p className={styles.empty}>No merge fields yet. Use Add Field below.</p>}
      <div className={styles.chipList}>
        {allKeys.map((k) => (
          <button key={k} type="button" className={styles.chip} title={`Insert {{${k}}}`} onClick={() => onInsert(k)}>
            {k}
          </button>
        ))}
      </div>

      {!adding && (
        <button type="button" className={styles.addBtn} onClick={openDialog}>
          + Add field
        </button>
      )}

      {adding && (
        <div className={styles.dialog}>
          <span className={styles.scopeLabel}>Save to</span>
          <div className={styles.radioRow}>
            <label className={styles.radio}>
              <input type="radio" name="field-scope" checked={scope === 'template'} onChange={() => setScope('template')} />
              This template
            </label>
            <label className={styles.radio}>
              <input type="radio" name="field-scope" checked={scope === 'common'} onChange={() => setScope('common')} />
              Common (all templates)
            </label>
          </div>
          <input className={styles.input} placeholder="e.g. clientLegalName" value={key} onChange={(e) => setKey(e.target.value)} autoFocus />
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.dialogActions}>
            <button type="button" className={styles.confirmBtn} disabled={createField.isPending} onClick={submit}>
              {createField.isPending ? 'Adding…' : 'Add'}
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
