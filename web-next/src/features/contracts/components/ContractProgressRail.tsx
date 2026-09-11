import { useLead } from '../../pipeline/hooks/useLead';
import { useContractGenerations, useContractApprovals } from '../hooks/useContractTemplates';
import type { ContractRequest } from '../../../types/domain';
import styles from './ContractProgressRail.module.css';

// CONTRACT_OF_SALE_BLUEPRINT.md §5 -- the one real staff-facing addition:
// V3's own named stage language, wired to real deterministic signals
// rather than a separate tracked-state machine per request (none exists
// in the data model, and inventing one would duplicate what
// contract_generations/contract_approvals/contract_requests already say).
// Honestly not perfectly monotonic: a manager can generate+download a
// document before clicking "Mark fulfilled" (the two actions are
// independent today), so "Downloaded" can show complete while "Approved"
// doesn't -- shown as-is rather than faking an enforced order that
// doesn't exist yet.
const STAGES: { key: 'request' | 'dataCheck' | 'draft' | 'review' | 'approved' | 'downloaded'; label: string }[] = [
  { key: 'request', label: 'Request' },
  { key: 'dataCheck', label: 'Data check' },
  { key: 'draft', label: 'Draft' },
  { key: 'review', label: 'Review' },
  { key: 'approved', label: 'Approved' },
  { key: 'downloaded', label: 'Downloaded' },
];

export function ContractProgressRail({ request }: { request: ContractRequest }) {
  const { data: lead } = useLead(request.leadId);
  const { data: generations } = useContractGenerations();
  const leadGenerations = (generations ?? []).filter((g) => g.leadId === request.leadId);
  // .list() already sorts newest-first (see source.ts).
  const latestGen = leadGenerations[0] ?? null;
  const { data: approvals } = useContractApprovals(latestGen?.templateVersionId ?? '');

  const hasKyc = !!lead?.kyc && Object.values(lead.kyc).some((v) => v);
  const hasDraft = leadGenerations.length > 0;
  // A template-based generation is reviewed at the TEMPLATE level (one
  // approval per version, not per request) -- if the doc used a published
  // template, real approval on record for that version counts; the
  // legacy hardcoded-text path has no template-level review construct at
  // all, so "fulfilled" (the one real per-request sign-off action) is the
  // closest honest stand-in.
  const templateApproved = !!latestGen?.templateVersionId && (approvals ?? []).some((a) => a.status === 'approved');
  const reviewed = templateApproved || request.status === 'fulfilled';
  const approved = request.status === 'fulfilled';
  const downloaded = hasDraft;

  const completed: Record<(typeof STAGES)[number]['key'], boolean> = {
    request: true,
    dataCheck: hasKyc,
    draft: hasDraft,
    review: reviewed,
    approved,
    downloaded,
  };
  const currentIndex = STAGES.findIndex((s) => !completed[s.key]);

  return (
    <div className={styles.rail}>
      {STAGES.map((s, i) => {
        const done = completed[s.key];
        const isCurrent = !done && i === currentIndex;
        return (
          <div className={styles.step} key={s.key}>
            <div className={styles.stepLine}>
              {i > 0 && <span className={`${styles.connector} ${completed[STAGES[i - 1].key] ? styles.connectorDone : ''}`} />}
              <span className={`${styles.dot} ${done ? styles.dotDone : isCurrent ? styles.dotCurrent : ''}`}>{done ? '✓' : i + 1}</span>
            </div>
            <span className={`${styles.label} ${isCurrent ? styles.labelCurrent : ''}`}>{s.label}</span>
          </div>
        );
      })}
    </div>
  );
}
