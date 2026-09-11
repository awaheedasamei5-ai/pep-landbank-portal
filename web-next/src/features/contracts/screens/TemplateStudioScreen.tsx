import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useCanFulfilContracts } from '../hooks/useContractRequests';
import { useContractTemplates, useContractTemplateVersions, useCreateContractTemplate, useCreateContractTemplateVersion } from '../hooks/useContractTemplates';
import type { ContractTemplate, ContractTemplateVersionStatus } from '../../../types/domain';
import styles from './TemplateStudioScreen.module.css';

const STATUS_LABEL: Record<ContractTemplateVersionStatus, string> = {
  draft: 'Draft',
  in_review: 'In review',
  published: 'Published',
  archived: 'Archived',
};

// CONTRACT_OF_SALE_BLUEPRINT.md §6.1 -- colored-thumbnail-card grid,
// converged from two independent real sources studied for this blueprint:
// PandaDoc's own real template-library page (sidebar-filter + searchable
// card grid) and Syncfusion's Document Template Studio example
// (Dashboard.jsx's colored thumbnail cards + dedicated "+ New" card).
export function TemplateStudioScreen() {
  const canManage = useCanFulfilContracts();
  const { data: templates, isLoading } = useContractTemplates();
  const createTemplate = useCreateContractTemplate();
  const createVersion = useCreateContractTemplateVersion();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  if (!canManage) {
    return <p className={styles.empty}>You don&apos;t have access to this. Ask a manager if you need it.</p>;
  }

  async function submitNew() {
    if (!name.trim()) return;
    const template = await createTemplate.mutateAsync({ name: name.trim() });
    await createVersion.mutateAsync({ templateId: template.id, versionNumber: 1 });
    setName('');
    setCreating(false);
    navigate(`/app/office/contracts/templates/${template.id}`);
  }

  return (
    <div className={styles.wrap}>
      {isLoading && <p className={styles.empty}>Loading templates…</p>}
      {!isLoading && (templates ?? []).length === 0 && !creating && <p className={styles.empty}>No contract templates yet — create one to get started.</p>}

      <div className={styles.grid}>
        {creating ? (
          <div className={styles.newCard}>
            <input autoFocus className={styles.newInput} placeholder="Template name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submitNew()} />
            <div className={styles.newActions}>
              <button type="button" className={styles.newConfirmBtn} disabled={createTemplate.isPending || !name.trim()} onClick={submitNew}>
                {createTemplate.isPending ? 'Creating…' : 'Create'}
              </button>
              <button type="button" className={styles.newCancelBtn} onClick={() => setCreating(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className={styles.newCard} onClick={() => setCreating(true)}>
            <span className={styles.newCardIcon} aria-hidden="true">
              +
            </span>
            <span className={styles.newCardLabel}>New template</span>
          </button>
        )}

        {templates?.map((t) => (
          <TemplateCard key={t.id} template={t} onOpen={() => navigate(`/app/office/contracts/templates/${t.id}`)} />
        ))}
      </div>
    </div>
  );
}

function TemplateCard({ template, onOpen }: { template: ContractTemplate; onOpen: () => void }) {
  const { data: versions } = useContractTemplateVersions(template.id);
  const published = versions?.find((v) => v.status === 'published');
  const latest = versions?.[0] ?? null;
  const pillStatus: ContractTemplateVersionStatus | 'none' = published ? 'published' : (latest?.status ?? 'none');

  return (
    <button type="button" className={styles.card} onClick={onOpen}>
      <div className={styles.cardName}>{template.name}</div>
      <div>
        <span className={`${styles.pill} ${styles[`pill_${pillStatus}`]}`}>{pillStatus === 'none' ? 'No published version' : STATUS_LABEL[pillStatus]}</span>
      </div>
      {latest && (
        <div className={styles.cardMeta}>
          v{latest.versionNumber} · updated {latest.createdAt.slice(0, 10)}
        </div>
      )}
    </button>
  );
}
