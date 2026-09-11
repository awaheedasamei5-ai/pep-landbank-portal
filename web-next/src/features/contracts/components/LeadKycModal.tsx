import { useState } from 'react';
import { Modal } from '../../../shared/ui/Modal';
import { useUpdateLead } from '../../pipeline/hooks/useLead';
import { friendlyError } from '../../../shared/lib/friendlyError';
import { useKycCompletenessSummary } from '../hooks/useContractAi';
import type { Lead, LeadKyc } from '../../../types/domain';
import styles from './LeadKycModal.module.css';

const ID_TYPES = ["Voter's ID", 'Passport', 'Ghana Card', "Driver's License"];
const LAND_USAGE_OPTIONS = ['Residential', 'Commercial'];

interface LeadKycModalProps {
  lead: Lead;
  onClose: () => void;
  onSaved?: (kyc: LeadKyc) => void;
  allowSkip?: boolean;
}

// CONTRACT_OF_SALE_BLUEPRINT.md §6.4 -- restores v1's real promptForLeadKyc()
// capture flow (nationality/occupation/dob/ID/contact person/land usage),
// which web-next's ContractGeneratorScreen only ever displayed a warning
// about, never actually let anyone fill in. Saves onto the real lead.kyc
// jsonb column via the existing useUpdateLead() mutation -- no new
// data-source method needed, LeadUpdate.kyc was the only missing piece.
export function LeadKycModal({ lead, onClose, onSaved, allowSkip = true }: LeadKycModalProps) {
  const update = useUpdateLead();
  const [kyc, setKyc] = useState<LeadKyc>(lead.kyc ?? {});
  const [error, setError] = useState<string | null>(null);
  // CONTRACT_OF_SALE_BLUEPRINT.md §9 capability 1 -- deterministic missing-
  // field check already decided by useKycCompletenessSummary itself; this
  // just shows the AI-drafted one-line summary of it, live against the
  // form as typed (not the stale `lead` prop) via the local `kyc` state.
  const { data: completenessNote } = useKycCompletenessSummary({ ...lead, kyc });

  function set<K extends keyof LeadKyc>(key: K, value: string) {
    setKyc((k) => ({ ...k, [key]: value }));
  }

  async function save() {
    setError(null);
    try {
      await update.mutateAsync({ id: lead.id, patch: { kyc } });
      onSaved?.(kyc);
      onClose();
    } catch (e) {
      setError(friendlyError(e, 'Could not save these details'));
    }
  }

  return (
    <Modal title={`KYC — ${lead.name}`} onClose={onClose}>
      <div className={styles.form}>
        {completenessNote && (
          <div className={styles.aiSummary}>
            <span className={styles.aiBadge}>AI</span>
            <span>{completenessNote}</span>
          </div>
        )}
        <p className={styles.sectionLabel}>Personal details</p>
        <div className={styles.grid2}>
          <div className={styles.field}>
            <span className={styles.label}>Nationality</span>
            <input className={styles.input} value={kyc.nationality ?? ''} onChange={(e) => set('nationality', e.target.value)} />
          </div>
          <div className={styles.field}>
            <span className={styles.label}>Occupation</span>
            <input className={styles.input} value={kyc.occupation ?? ''} onChange={(e) => set('occupation', e.target.value)} />
          </div>
          <div className={styles.field}>
            <span className={styles.label}>Date of birth</span>
            <input className={styles.input} type="date" value={kyc.dob ?? ''} onChange={(e) => set('dob', e.target.value)} />
          </div>
          <div className={styles.field}>
            <span className={styles.label}>ID type</span>
            <select className={styles.select} value={kyc.idType ?? ''} onChange={(e) => set('idType', e.target.value)}>
              <option value="">Select…</option>
              {ID_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <span className={styles.label}>ID number</span>
            <input className={styles.input} value={kyc.idNumber ?? ''} onChange={(e) => set('idNumber', e.target.value)} />
          </div>
          <div className={styles.field}>
            <span className={styles.label}>Email</span>
            <input className={styles.input} type="email" value={kyc.email ?? ''} onChange={(e) => set('email', e.target.value)} />
          </div>
        </div>
        <div className={styles.field}>
          <span className={styles.label}>Location / address</span>
          <input className={styles.input} value={kyc.location ?? ''} onChange={(e) => set('location', e.target.value)} />
        </div>

        <p className={styles.sectionLabel}>Contact person</p>
        <div className={styles.grid2}>
          <div className={styles.field}>
            <span className={styles.label}>Name</span>
            <input className={styles.input} value={kyc.contactName ?? ''} onChange={(e) => set('contactName', e.target.value)} />
          </div>
          <div className={styles.field}>
            <span className={styles.label}>Phone</span>
            <input className={styles.input} value={kyc.contactPhone ?? ''} onChange={(e) => set('contactPhone', e.target.value)} />
          </div>
          <div className={styles.field}>
            <span className={styles.label}>Email</span>
            <input className={styles.input} type="email" value={kyc.contactEmail ?? ''} onChange={(e) => set('contactEmail', e.target.value)} />
          </div>
          <div className={styles.field}>
            <span className={styles.label}>Relation</span>
            <input className={styles.input} value={kyc.contactRelation ?? ''} onChange={(e) => set('contactRelation', e.target.value)} />
          </div>
        </div>
        <div className={styles.field}>
          <span className={styles.label}>Contact person's address</span>
          <input className={styles.input} value={kyc.contactAddress ?? ''} onChange={(e) => set('contactAddress', e.target.value)} />
        </div>

        <p className={styles.sectionLabel}>Land usage</p>
        <div className={styles.field}>
          <span className={styles.label}>Intended usage</span>
          <select className={styles.select} value={kyc.landUsage ?? ''} onChange={(e) => set('landUsage', e.target.value)}>
            <option value="">Select…</option>
            {LAND_USAGE_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
        {kyc.landUsage && (
          <div className={styles.field}>
            <span className={styles.label}>Detail</span>
            <input className={styles.input} placeholder="e.g. Family home, retail shop" value={kyc.landUsageDetail ?? ''} onChange={(e) => set('landUsageDetail', e.target.value)} />
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <button type="button" className={styles.saveBtn} onClick={save} disabled={update.isPending}>
          {update.isPending ? 'Saving…' : 'Save KYC details'}
        </button>
        {allowSkip && (
          <button type="button" className={styles.skipBtn} onClick={onClose}>
            Skip for now
          </button>
        )}
      </div>
    </Modal>
  );
}
