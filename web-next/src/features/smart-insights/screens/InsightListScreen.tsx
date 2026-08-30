import { useNavigate, useParams } from 'react-router';
import { ghs } from '../../../shared/lib/format';
import { useInsightList } from '../hooks/useSmartInsights';
import { INSIGHT_META, type InsightKind } from '../lib/smartInsightsLogic';
import styles from './InsightListScreen.module.css';

// Port of index.html's viewInsightList() (index.html:9962-9976) -- the
// drill-down a Smart Insight card routes to.
export function InsightListScreen() {
  const navigate = useNavigate();
  const { kind } = useParams<{ kind: InsightKind }>();
  const meta = kind ? INSIGHT_META[kind] : null;
  const { list, isLoading } = useInsightList((kind ?? 'cold') as InsightKind);

  if (!meta) return null;

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.backBtn} onClick={() => navigate(-1)}>
        ← Back
      </button>
      <div className={styles.eyebrow}>Smart Insight</div>
      <h1 className={styles.title}>{meta.title}</h1>
      <p className={styles.sub}>
        {meta.desc} · {list.length} client{list.length === 1 ? '' : 's'}
      </p>

      {isLoading && <p className={styles.emptyMsg}>Loading…</p>}
      {!isLoading && list.length === 0 && <p className={styles.emptyMsg}>Nothing here right now.</p>}

      <div className={styles.list}>
        {list.map((l) => (
          <div className={styles.row} key={l.id}>
            <div className={styles.rowTop}>
              <div>
                <div className={styles.name}>{l.name}</div>
                <div className={styles.meta}>
                  {l.contact || '—'}
                  {l.__pct != null ? ` · ${l.__pct}% paid` : ''}
                </div>
              </div>
              <div className={styles.right}>
                <div className={styles.amt}>{ghs(l.grandTotal)}</div>
                <div className={styles.meta}>{l.nextAction || '—'}</div>
              </div>
            </div>
            <button type="button" className={styles.updateBtn} onClick={() => navigate(`/app/sales/pipeline/${l.id}`)}>
              Update this lead →
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
