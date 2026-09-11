import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  useContractTemplates,
  useContractTemplateVersions,
  useCreateContractTemplateVersion,
  useUpdateContractTemplateVersion,
  usePublishContractTemplateVersion,
  useDecideContractApproval,
} from '../hooks/useContractTemplates';
import { useCanFulfilContracts } from '../hooks/useContractRequests';
import type { ContractSection, ContractSectionKind, ContractTemplateVersion, ContractTemplateVersionStatus } from '../../../types/domain';
import styles from './TemplateDetailScreen.module.css';

const STATUS_LABEL: Record<ContractTemplateVersionStatus, string> = {
  draft: 'Draft',
  in_review: 'In review',
  published: 'Published',
  archived: 'Archived',
};

const SECTION_KIND_LABEL: Record<ContractSectionKind, string> = {
  heading: 'Heading',
  paragraph: 'Paragraph',
  clause: 'Clause',
  signature_block: 'Signature block',
  image: 'Image',
  footer: 'Footer',
};

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

// CONTRACT_OF_SALE_BLUEPRINT.md §6.2 -- the page editor + draft/review/
// publish state machine. Scope note (honest, not silently claimed
// complete): this ships the version rail, section CRUD/reorder, and the
// full status state machine for real -- the Merge Fields panel and
// Clause Library insertion panel (§6.2's right rail, build-order items
// 5-6) are NOT built yet, so a section's {{token}} text must still be
// typed by hand for now rather than inserted from a chip list. Tokens
// typed by hand already render/resolve correctly (§7's resolver doesn't
// care how a token got into the text), so this is a real, usable, non-
// dead-end screen -- just missing its insertion convenience UI.
export function TemplateDetailScreen() {
  const { id: templateId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const canManage = useCanFulfilContracts();
  const { data: templates } = useContractTemplates();
  const { data: versions } = useContractTemplateVersions(templateId ?? '');
  const createVersion = useCreateContractTemplateVersion();
  const updateVersion = useUpdateContractTemplateVersion();
  const publish = usePublishContractTemplateVersion();
  const decideApproval = useDecideContractApproval();

  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [content, setContent] = useState<ContractSection[]>([]);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const template = templates?.find((t) => t.id === templateId);
  const latest = versions?.[0] ?? null;
  const selectedVersion = versions?.find((v) => v.id === selectedVersionId) ?? latest;
  const isLatestDraft = !!selectedVersion && selectedVersion.id === latest?.id && selectedVersion.status === 'draft';

  useEffect(() => {
    if (selectedVersion) setContent(selectedVersion.content);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVersion?.id]);

  if (!canManage) {
    return <p className={styles.empty}>You don&apos;t have access to this. Ask a manager if you need it.</p>;
  }
  if (!templateId || (templates && !template)) {
    return <p className={styles.empty}>Template not found.</p>;
  }
  if (!template || !versions) {
    return <p className={styles.empty}>Loading…</p>;
  }

  function addSection(kind: ContractSectionKind) {
    setContent((c) => [...c, { id: newId(), kind, text: kind === 'signature_block' ? undefined : '' }]);
  }
  function updateSectionText(id: string, text: string) {
    setContent((c) => c.map((s) => (s.id === id ? { ...s, text } : s)));
  }
  function removeSection(id: string) {
    setContent((c) => c.filter((s) => s.id !== id));
  }
  function moveSection(id: string, dir: -1 | 1) {
    setContent((c) => {
      const idx = c.findIndex((s) => s.id === id);
      const target = idx + dir;
      if (idx === -1 || target < 0 || target >= c.length) return c;
      const next = [...c];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  async function saveDraft() {
    if (!selectedVersion) return;
    await updateVersion.mutateAsync({ id: selectedVersion.id, patch: { content } });
  }
  async function submitForReview() {
    if (!selectedVersion) return;
    await updateVersion.mutateAsync({ id: selectedVersion.id, patch: { content, status: 'in_review' } });
  }
  async function approve() {
    if (!selectedVersion) return;
    await decideApproval.mutateAsync({ templateVersionId: selectedVersion.id, status: 'approved', reason: null });
    await publish.mutateAsync(selectedVersion.id);
  }
  async function reject() {
    if (!selectedVersion || !rejectReason.trim()) return;
    await decideApproval.mutateAsync({ templateVersionId: selectedVersion.id, status: 'rejected', reason: rejectReason.trim() });
    await updateVersion.mutateAsync({ id: selectedVersion.id, patch: { status: 'draft' } });
    setRejecting(false);
    setRejectReason('');
  }
  async function duplicateAsNewDraft() {
    if (!selectedVersion || !latest || !templateId) return;
    const created = await createVersion.mutateAsync({ templateId, versionNumber: latest.versionNumber + 1 });
    await updateVersion.mutateAsync({ id: created.id, patch: { content: selectedVersion.content } });
    setSelectedVersionId(created.id);
  }

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.back} onClick={() => navigate('/app/office/contracts/templates')}>
        ← All templates
      </button>

      <div className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <span className={styles.name}>{template.name}</span>
          {selectedVersion && <span className={`${styles.pill} ${styles[`pill_${selectedVersion.status}`]}`}>{STATUS_LABEL[selectedVersion.status]}</span>}
        </div>
        {selectedVersion && isLatestDraft && (
          <div className={styles.actions}>
            <button type="button" className={styles.ghostBtn} disabled={updateVersion.isPending} onClick={saveDraft}>
              {updateVersion.isPending ? 'Saving…' : 'Save draft'}
            </button>
            <button type="button" className={styles.primaryBtn} disabled={updateVersion.isPending} onClick={submitForReview}>
              Submit for review
            </button>
          </div>
        )}
        {selectedVersion && selectedVersion.status === 'in_review' && (
          <div className={styles.actions}>
            <button type="button" className={styles.dangerBtn} onClick={() => setRejecting((v) => !v)}>
              Reject
            </button>
            <button type="button" className={styles.primaryBtn} disabled={decideApproval.isPending || publish.isPending} onClick={approve}>
              {decideApproval.isPending || publish.isPending ? 'Publishing…' : 'Approve'}
            </button>
          </div>
        )}
        {selectedVersion && !isLatestDraft && selectedVersion.status !== 'in_review' && (
          <button type="button" className={styles.ghostBtn} onClick={duplicateAsNewDraft} disabled={createVersion.isPending}>
            Duplicate as new draft
          </button>
        )}
      </div>

      {rejecting && (
        <div className={styles.readOnlyBanner}>
          <input className={styles.sectionText} style={{ flex: 1 }} placeholder="Reason for rejecting" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
          <button type="button" className={styles.dangerBtn} disabled={!rejectReason.trim() || decideApproval.isPending} onClick={reject}>
            Confirm reject
          </button>
        </div>
      )}

      {selectedVersion && !isLatestDraft && (
        <div className={styles.readOnlyBanner}>
          Viewing v{selectedVersion.versionNumber} (read-only) — {STATUS_LABEL[selectedVersion.status]}. Create a new version to edit.
        </div>
      )}

      <div className={styles.layout}>
        <div className={styles.versionRail}>
          {versions.map((v) => (
            <VersionRow key={v.id} version={v} active={v.id === selectedVersion?.id} onSelect={() => setSelectedVersionId(v.id)} />
          ))}
        </div>

        <div className={styles.canvas}>
          {content.length === 0 && <p className={styles.empty}>No sections yet — add one below.</p>}
          {content.map((section, i) => (
            <SectionCard
              key={section.id}
              section={section}
              editable={isLatestDraft}
              canMoveUp={i > 0}
              canMoveDown={i < content.length - 1}
              onTextChange={(t) => updateSectionText(section.id, t)}
              onRemove={() => removeSection(section.id)}
              onMoveUp={() => moveSection(section.id, -1)}
              onMoveDown={() => moveSection(section.id, 1)}
            />
          ))}

          {isLatestDraft && (
            <div className={styles.addRow}>
              {(['heading', 'paragraph', 'clause', 'image', 'footer', 'signature_block'] as ContractSectionKind[]).map((k) => (
                <button key={k} type="button" className={styles.addBtn} onClick={() => addSection(k)}>
                  + {SECTION_KIND_LABEL[k]}
                </button>
              ))}
            </div>
          )}

          <p className={styles.notice}>Field tokens ({'{{'}fieldKey{'}}'}) can be typed directly into any section for now — the Merge Fields insertion panel isn&apos;t built yet.</p>
        </div>
      </div>
    </div>
  );
}

function VersionRow({ version, active, onSelect }: { version: ContractTemplateVersion; active: boolean; onSelect: () => void }) {
  return (
    <button type="button" className={`${styles.versionRow} ${active ? styles.versionRowActive : ''}`} onClick={onSelect}>
      <div className={styles.versionRowTop}>
        <span className={styles.versionNum}>v{version.versionNumber}</span>
        <span className={`${styles.pill} ${styles[`pill_${version.status}`]}`}>{STATUS_LABEL[version.status]}</span>
      </div>
      <span className={styles.versionMeta}>
        {version.createdAt.slice(0, 10)} by {version.createdByName}
      </span>
    </button>
  );
}

// Renders {{token}} substrings as highlighted inline chips when read-only
// (matches §6.2's spec); the editable textarea shows the raw text so it
// stays a plain, honest textarea to type into.
function renderWithTokens(text: string) {
  const parts = text.split(/(\{\{[A-Za-z][A-Za-z0-9]*\}\})/g);
  return parts.map((part, i) => (part.startsWith('{{') ? <span className={styles.token} key={i}>{part}</span> : <span key={i}>{part}</span>));
}

function SectionCard({
  section,
  editable,
  canMoveUp,
  canMoveDown,
  onTextChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  section: ContractSection;
  editable: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onTextChange: (text: string) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionHead}>
        <span className={styles.sectionKind}>{SECTION_KIND_LABEL[section.kind]}</span>
        {editable && (
          <div className={styles.sectionActions}>
            <button type="button" className={styles.iconBtn} disabled={!canMoveUp} onClick={onMoveUp} aria-label="Move up">
              ↑
            </button>
            <button type="button" className={styles.iconBtn} disabled={!canMoveDown} onClick={onMoveDown} aria-label="Move down">
              ↓
            </button>
            <button type="button" className={styles.iconBtn} onClick={onRemove} aria-label="Remove section">
              ✕
            </button>
          </div>
        )}
      </div>

      {section.kind === 'signature_block' ? (
        <p className={styles.signaturePreview}>Signed and delivered — Sign / Name / Designation (not editable)</p>
      ) : section.kind === 'image' ? (
        <p className={styles.signaturePreview}>{section.imageRef ? `Image: ${section.imageRef}` : 'No image set yet'}</p>
      ) : editable ? (
        <textarea className={styles.sectionText} value={section.text ?? ''} onChange={(e) => onTextChange(e.target.value)} rows={section.kind === 'heading' ? 1 : 3} />
      ) : (
        <div className={styles.sectionTextReadonly}>{renderWithTokens(section.text ?? '')}</div>
      )}
    </div>
  );
}
