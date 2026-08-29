import type { Stage } from '../../../types/domain';
import { displayStageCode } from '../lib/pipelineLogic';
import styles from './StageBadge.module.css';

function toneFor(stage: Stage): string {
  if (stage === 'Lost') return styles.lost;
  if (stage === '4') return styles.paid;
  if (stage === '3' || stage === '2B') return styles.mid;
  return styles.early;
}

export function StageBadge({ stage }: { stage: Stage }) {
  return <span className={`${styles.badge} ${toneFor(stage)}`}>{stage === 'Lost' ? 'Lost' : displayStageCode(stage)}</span>;
}
