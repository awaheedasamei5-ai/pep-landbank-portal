import { useNavigate } from 'react-router';
import { ghs } from '../../../shared/lib/format';
import { PipePill, PipePillStrip } from '../../../shared/ui/PipePill';
import { useLeads } from '../hooks/useLeads';
import { StageBadge } from '../components/StageBadge';
import styles from './PipelineListScreen.module.css';

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

// Simplified port of viewPipeline() (index.html:10629-10662) -- the stat
// strip + list of leads. Search/filter/import/export/backup and the full
// table view are still out of scope for this slice (unchanged from
// earlier phases) -- this pass is the same visual-consistency sweep
// (avatar cards, real tokens, no inline style={{}}) already applied to
// every other Sales Desk screen, not a functional expansion.
export function PipelineListScreen() {
  const navigate = useNavigate();
  const { data: leads, isLoading } = useLeads();

  const totalValue = (leads ?? []).reduce((s, l) => s + l.grandTotal, 0);
  const totalCollected = (leads ?? []).reduce((s, l) => s + l.amtPaid, 0);
  const paidCount = (leads ?? []).filter((l) => l.stage === '4').length;

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>My pipeline</h1>
          <p className={styles.sub}>
            {leads?.length ?? 0} leads · {paidCount} paid in full
          </p>
        </div>
        <button type="button" className={styles.addBtn} onClick={() => navigate('/app/sales/pipeline/new')}>
          + Add lead
        </button>
      </div>

      <div className={styles.pillsWrap}>
        <PipePillStrip>
          <PipePill tone="blue" value={ghs(totalValue)} label="Pipeline value" isMoney />
          <PipePill tone="green" value={ghs(totalCollected)} label="Collected" isMoney />
        </PipePillStrip>
      </div>

      {isLoading && <p className={styles.emptyMsg}>Loading…</p>}
      {leads?.map((l) => (
        <div className={styles.row} key={l.id} onClick={() => navigate(`/app/sales/pipeline/${l.id}`)} role="button" tabIndex={0}>
          <span className={styles.avatar}>{initials(l.name)}</span>
          <div className={styles.rowMain}>
            <div className={styles.name}>{l.name}</div>
            <div className={styles.meta}>
              {l.contact} · {l.plotType}
              {l.noPlots > 1 ? ` ×${l.noPlots}` : ''}
            </div>
          </div>
          <div className={styles.right}>
            <div className={styles.value}>{ghs(l.grandTotal)}</div>
            <div className={styles.stageWrap}>
              <StageBadge stage={l.stage} />
            </div>
          </div>
        </div>
      ))}
      {leads && leads.length === 0 && <p className={styles.emptyMsg}>No leads yet — add your first one.</p>}
    </div>
  );
}
