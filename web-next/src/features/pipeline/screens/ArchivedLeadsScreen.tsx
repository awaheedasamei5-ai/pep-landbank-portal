import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ghs } from '../../../shared/lib/format';
import { useArchivedLeads, useRestoreLead } from '../hooks/useLead';
import { friendlyError } from '../../../shared/lib/friendlyError';
import styles from './ArchivedLeadsScreen.module.css';

// Master Spec Section 4.5: "Management sees the archived record and
// deletion reason. A restore action can unarchive a lead." Manager-only
// in practice -- leads_sel RLS only lets deleted_at IS NOT NULL rows
// through for my_role()='manager', so a non-manager session's
// useArchivedLeads() query is simply disabled rather than erroring.
export function ArchivedLeadsScreen() {
  const navigate = useNavigate();
  const { data: leads, isLoading } = useArchivedLeads();

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.backBtn} onClick={() => navigate(-1)}>
        ← Back
      </button>
      <h1 className={styles.title}>Archived leads</h1>
      <p className={styles.sub}>{leads?.length ?? 0} archived · restore brings a lead back to the active pipeline</p>

      {isLoading && <p className={styles.emptyMsg}>Loading…</p>}
      {leads && leads.length === 0 && !isLoading && <p className={styles.emptyMsg}>Nothing archived.</p>}
      <div className={styles.list}>
        {leads?.map((l) => (
          <ArchivedRow key={l.id} lead={l} />
        ))}
      </div>
    </div>
  );
}

function ArchivedRow({ lead }: { lead: NonNullable<ReturnType<typeof useArchivedLeads>['data']>[number] }) {
  const restore = useRestoreLead();
  const [restored, setRestored] = useState(false);

  return (
    <div className={styles.row}>
      <div className={styles.rowTop}>
        <div>
          <div className={styles.name}>{lead.name}</div>
          <div className={styles.meta}>
            {lead.contact} · {lead.plotType} · {ghs(lead.grandTotal)}
          </div>
        </div>
        <div className={styles.archivedAt}>{lead.deletedAt?.slice(0, 10)}</div>
      </div>
      <div className={styles.reasonRow}>
        <span className={styles.reasonLabel}>Reason</span>
        <span>{lead.deletionReason || '—'}</span>
      </div>
      {lead.deletedByName && <div className={styles.byLine}>Archived by {lead.deletedByName}</div>}
      {restore.isError && <p className={styles.err}>{friendlyError(restore.error, 'Failed to restore this lead')}</p>}
      <button
        type="button"
        className={styles.restoreBtn}
        disabled={restore.isPending || restored}
        onClick={() => restore.mutateAsync(lead.id).then(() => setRestored(true))}
      >
        {restore.isPending ? 'Restoring…' : restored ? 'Restored ✓' : 'Restore to pipeline'}
      </button>
    </div>
  );
}
