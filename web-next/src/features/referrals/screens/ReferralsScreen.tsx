import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { ghs } from '../../../shared/lib/format';
import { Icon } from '../../../shared/ui/Icon';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { useAllLeadsForLinking } from '../hooks/useAllLeadsForLinking';
import { useCanClearReferrals, useClearReferral, useLinkReferralLead, useReferrals } from '../hooks/useReferrals';
import { friendlyError } from '../../../shared/lib/friendlyError';
import type { Referral } from '../../../types/domain';
import styles from './ReferralsScreen.module.css';

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

// Real clear/payout flow, wired against the exact server-side rule
// confirmed from clear_referral()'s own function body: the referred person
// must already be linked to a real lead, and that lead must have paid
// >=30% of its grand total, before status can become 'Cleared' and points
// awarded. Every write here goes through the two DataSource methods that
// exist specifically to keep this safe (linkLead is a plain, RLS-safe
// UPDATE; clear() calls the RPC exclusively) -- never a raw status update.
export function ReferralsScreen() {
  const navigate = useNavigate();
  const { data: referrals, isLoading } = useReferrals();
  const canClear = useCanClearReferrals();
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Referrals</h1>
          <p className={styles.sub}>{referrals?.length ?? 0} recorded</p>
        </div>
        <button type="button" className={styles.addBtn} onClick={() => navigate('/app/sales/referrals/new')}>
          + Add referral
        </button>
      </div>

      {isLoading && <p className={styles.emptyMsg}>Loading…</p>}
      {referrals?.map((r) => {
        const isOpen = expanded === r.id;
        const canExpand = canClear && r.status !== 'Cleared';
        return (
          <div className={styles.card} key={r.id}>
            <button
              type="button"
              className={styles.row}
              onClick={() => canExpand && setExpanded(isOpen ? null : r.id)}
              aria-expanded={canExpand ? isOpen : undefined}
              disabled={!canExpand}
            >
              <span className={styles.avatar}>{initials(r.referredName)}</span>
              <div className={styles.rowMain}>
                <div className={styles.name}>
                  {r.referrerName}
                  <span className={styles.arrow}>→</span>
                  {r.referredName}
                </div>
                <div className={styles.meta}>
                  {r.referredContact}
                  {r.referredLocation ? ` · ${r.referredLocation}` : ''}
                </div>
              </div>
              <div className={styles.right}>
                <span className={`${styles.status} ${r.status === 'Cleared' ? styles.statusCleared : styles.statusPending}`}>{r.status}</span>
                {r.pointsAwarded > 0 && <div className={styles.points}>{r.pointsAwarded} pts</div>}
              </div>
              {canExpand && (
                <span className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`}>
                  <Icon name="chevronDown" size={15} />
                </span>
              )}
            </button>
            {isOpen && canExpand && <ReferralDetail referral={r} />}
          </div>
        );
      })}
      {referrals && referrals.length === 0 && !isLoading && <p className={styles.emptyMsg}>No referrals recorded yet.</p>}
    </div>
  );
}

function ReferralDetail({ referral }: { referral: Referral }) {
  const { data: leads } = useAllLeadsForLinking();
  const { data: config } = useConfig();
  const linkLead = useLinkReferralLead();
  const clearReferral = useClearReferral();
  const [query, setQuery] = useState('');
  const [points, setPoints] = useState('');
  const [error, setError] = useState<string | null>(null);

  const linkedLead = useMemo(() => (leads ?? []).find((l) => l.id === referral.referredLeadId), [leads, referral.referredLeadId]);

  const q = query.trim().toLowerCase();
  const matches = q ? (leads ?? []).filter((l) => l.name.toLowerCase().includes(q) || l.contact.includes(q)).slice(0, 8) : [];

  const pointsDefault = config?.referralPointsPerReferral ?? 50;
  const pointsValue = points === '' ? pointsDefault : Number(points);

  if (!referral.referredLeadId) {
    return (
      <div className={styles.detail}>
        <p className={styles.detailHint}>Link this referral to the referred person&apos;s real lead before it can be cleared.</p>
        <input className={styles.linkInput} placeholder="Search leads by name or contact…" value={query} onChange={(e) => setQuery(e.target.value)} />
        {matches.length > 0 && (
          <div className={styles.pickerList}>
            {matches.map((l) => (
              <button key={l.id} type="button" className={styles.pickerRow} onClick={() => linkLead.mutate({ id: referral.id, leadId: l.id })} disabled={linkLead.isPending}>
                <span className={styles.pickerName}>{l.name}</span>
                <span className={styles.pickerMeta}>
                  {l.contact} · {ghs(l.amtPaid)} of {ghs(l.grandTotal)} paid
                </span>
              </button>
            ))}
          </div>
        )}
        {q && matches.length === 0 && <p className={styles.noMatch}>No leads match &quot;{query}&quot;.</p>}
      </div>
    );
  }

  if (!linkedLead) {
    return (
      <div className={styles.detail}>
        <p className={styles.detailHint}>Linked lead not found.</p>
      </div>
    );
  }

  const pct = linkedLead.grandTotal > 0 ? linkedLead.amtPaid / linkedLead.grandTotal : 0;
  const eligible = pct >= 0.3;

  async function submitClear() {
    setError(null);
    try {
      await clearReferral.mutateAsync({ id: referral.id, points: pointsValue });
    } catch (e) {
      setError(friendlyError(e, 'Could not clear this referral.'));
    }
  }

  return (
    <div className={styles.detail}>
      <div className={styles.linkedRow}>
        <span className={styles.linkedLabel}>Linked to</span>
        <span className={styles.linkedName}>{linkedLead.name}</span>
      </div>
      <div className={styles.progressTrack}>
        <div className={`${styles.progressFill} ${eligible ? styles.progressOk : styles.progressLow}`} style={{ width: `${Math.min(100, Math.round(pct * 100))}%` }} />
      </div>
      <div className={styles.progressLabel}>
        {ghs(linkedLead.amtPaid)} of {ghs(linkedLead.grandTotal)} paid ({Math.round(pct * 100)}%) &middot; needs 30% to clear
      </div>

      {eligible ? (
        <div className={styles.clearRow}>
          <input className={styles.pointsInput} type="number" min={0} placeholder={String(pointsDefault)} value={points} onChange={(e) => setPoints(e.target.value)} />
          <button type="button" className={styles.clearBtn} disabled={clearReferral.isPending} onClick={submitClear}>
            {clearReferral.isPending ? 'Clearing…' : `Clear & award ${pointsValue} pts`}
          </button>
        </div>
      ) : (
        <p className={styles.notEligible}>Not eligible yet -- {linkedLead.name} needs to reach 30% paid before this referral can be cleared.</p>
      )}
      {error && <p className={styles.errorMsg}>{error}</p>}
    </div>
  );
}
