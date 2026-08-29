import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useSessionStore } from '../../../auth/useSessionStore';
import type { SiteVisit } from '../../../types/domain';
import { useSiteVisits } from '../hooks/useSiteVisits';
import styles from './SiteVisitsScreen.module.css';

const DETAIL_FIELDS: { key: keyof SiteVisit; label: string }[] = [
  { key: 'purpose', label: 'Purpose' },
  { key: 'discussionSoFar', label: 'Discussion so far' },
  { key: 'keyUnderstanding', label: 'Key understanding' },
  { key: 'transport', label: 'Transport' },
  { key: 'pickup', label: 'Pickup point' },
  { key: 'placeOfWork', label: 'Place of work' },
  { key: 'position', label: 'Position' },
  { key: 'nationality', label: 'Nationality' },
  { key: 'accompanied', label: 'Accompanied by' },
  { key: 'source', label: 'Source' },
  { key: 'notes', label: 'Notes' },
];

// Real production table (site_visits) is agent-scoped by RLS exactly like
// leads/payments -- no live-wiring shortcut taken here, listForAgent()
// already enforces it server-side. status is real but every production
// row today is 'Pending' (confirmed live) so it's shown plainly, not
// styled as a meaningful multi-state tracker yet.
export function SiteVisitsScreen() {
  const navigate = useNavigate();
  const profile = useSessionStore((s) => s.profile);
  const hasSveAccess = !!profile && (profile.role === 'manager' || profile.key === 'elias' || profile.key === 'emmanuel' || profile.key === 'elizabeth');
  const { data: visits, isLoading } = useSiteVisits();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Site visits</h1>
          <p className={styles.sub}>{visits?.length ?? 0} logged</p>
          {hasSveAccess && (
            <button type="button" onClick={() => navigate('/app/sales/sitevisits/experience')} style={{ background: 'none', border: 'none', color: 'var(--gold)', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0, marginTop: 4 }}>
              Experience feedback →
            </button>
          )}
        </div>
        <button type="button" className={styles.addBtn} onClick={() => navigate('/app/sales/sitevisits/new')}>
          + Log visit
        </button>
      </div>

      {isLoading && <p style={{ color: 'var(--muted)' }}>Loading…</p>}
      {visits?.map((v) => {
        const isOpen = expanded.has(v.id);
        const details = DETAIL_FIELDS.filter((f) => v[f.key]);
        return (
          <div className={styles.card} key={v.id}>
            <button type="button" className={styles.row} onClick={() => toggle(v.id)} aria-expanded={isOpen}>
              <div>
                <div className={styles.name}>{v.name}</div>
                <div className={styles.meta}>
                  {v.contact} · {v.site}
                  {v.plot ? ` · ${v.plot}` : ''}
                </div>
              </div>
              <div className={styles.right}>
                <div className={styles.date}>{v.visitDate}</div>
                {v.visitTime && <div className={styles.time}>{v.visitTime}</div>}
                <div style={{ marginTop: 4 }}>
                  <span className={styles.status}>{v.status}</span>
                </div>
              </div>
            </button>
            {isOpen && details.length > 0 && (
              <div className={styles.detail}>
                {details.map((f) => (
                  <div className={styles.detailRow} key={f.key}>
                    <span className={styles.detailLabel}>{f.label}</span>
                    <span className={styles.detailValue}>{v[f.key]}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {visits && visits.length === 0 && !isLoading && <p style={{ color: 'var(--muted)' }}>No site visits logged yet.</p>}
    </div>
  );
}
