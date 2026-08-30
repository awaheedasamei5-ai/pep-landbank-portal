import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ghs } from '../../../shared/lib/format';
import { StageBadge } from '../../pipeline/components/StageBadge';
import { displayStageCode } from '../../pipeline/lib/pipelineLogic';
import { useManagerPipeline } from '../hooks/useManagerPipeline';
import { useStaffDirectory } from '../../memos/hooks/useMemos';
import type { Stage } from '../../../types/domain';
import styles from './ManagerPipelineScreen.module.css';

const STAGES: (Stage | 'Lost')[] = ['1', '2A', '2B', '3', '4', 'Lost'];

// Real destination for Manager Home's "Pipeline by stage" donut and "By
// agent" rows -- both link here with a `stage` and/or `agent` query param
// pre-applied. Company-wide (every agent), unlike Sales Desk's "My
// pipeline" which is deliberately scoped to the signed-in agent only.
export function ManagerPipelineScreen() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { data: leads, isLoading } = useManagerPipeline();
  const { data: staff } = useStaffDirectory();

  const stageFilter = params.get('stage') ?? '';
  const agentFilter = params.get('agent') ?? '';
  const nameFor = useMemo(() => new Map((staff ?? []).map((s) => [s.key, s.name])), [staff]);

  const filtered = (leads ?? []).filter((l) => (!stageFilter || l.stage === stageFilter) && (!agentFilter || l.agent === agentFilter));

  function setStage(stage: string) {
    const next = new URLSearchParams(params);
    if (stage) next.set('stage', stage);
    else next.delete('stage');
    setParams(next, { replace: true });
  }

  function clearAgent() {
    const next = new URLSearchParams(params);
    next.delete('agent');
    setParams(next, { replace: true });
  }

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>Company pipeline</h1>
      <p className={styles.sub}>
        {filtered.length} lead{filtered.length === 1 ? '' : 's'}
        {agentFilter && <> &middot; {nameFor.get(agentFilter) ?? agentFilter} <button type="button" className={styles.clearChip} onClick={clearAgent}>clear ×</button></>}
      </p>

      <div className={styles.chipRow}>
        <button type="button" className={`${styles.chip} ${!stageFilter ? styles.chipOn : ''}`} onClick={() => setStage('')}>
          All
        </button>
        {STAGES.map((s) => (
          <button key={s} type="button" className={`${styles.chip} ${stageFilter === s ? styles.chipOn : ''}`} onClick={() => setStage(s)}>
            {s === 'Lost' ? 'Lost' : displayStageCode(s)}
          </button>
        ))}
      </div>

      {isLoading && <p style={{ color: 'var(--c-muted)' }}>Loading…</p>}
      {filtered.map((l) => (
        <div className={styles.row} key={l.id} onClick={() => navigate(`/app/sales/pipeline/${l.id}`)} role="button" tabIndex={0}>
          <div className={styles.rowMain}>
            <div className={styles.name}>{l.name}</div>
            <div className={styles.meta}>
              {nameFor.get(l.agent) ?? l.agent} &middot; {l.contact}
            </div>
          </div>
          <div className={styles.right}>
            <div className={styles.value}>{ghs(l.grandTotal)}</div>
            <div style={{ marginTop: 4 }}>
              <StageBadge stage={l.stage} />
            </div>
          </div>
        </div>
      ))}
      {!isLoading && filtered.length === 0 && <p style={{ color: 'var(--c-muted)' }}>No leads match this filter.</p>}
    </div>
  );
}
