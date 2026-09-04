import { useNavigate } from 'react-router';
import { useSessionStore } from '../../../auth/useSessionStore';
import { dismissIssue } from '../lib/dataIntegrityCheck';
import type { DataIssue } from '../lib/dataIntegrityCheck';
import { useDataCheck } from '../hooks/useDataCheck';
import { useDataCheckSummary } from '../hooks/useDataCheckSummary';
import styles from './DataCheckScreen.module.css';

// Real, purely computed feature -- no new tables (beyond leads.last_
// modified_at, ported from production this pass since the "Stale lead"
// check needs it). Scans every lead already loaded via the existing
// DataSource for pricing/payment inconsistencies and record hygiene, port
// of index.html's runDataIntegrityCheck(). Two of the original checks are
// deliberately out of scope, see dataIntegrityCheck.ts's own comment for
// exactly why (mapLeadRow already masks "missing payment plan", and
// ScheduleItem has no lead linkage for "unresolved task").
export function DataCheckScreen() {
  const navigate = useNavigate();
  const profile = useSessionStore((s) => s.profile);
  const { issues, totalLeads, hygieneScore, isLoading, notifyDismissed } = useDataCheck();
  const { data: aiSummary } = useDataCheckSummary(issues, totalLeads, hygieneScore, isLoading);

  const scopeLabel = profile?.role === 'manager' ? 'the company' : 'your pipeline';
  const flaggedCount = new Set(issues.map((i) => i.leadId)).size;

  function dismiss(issue: DataIssue) {
    dismissIssue(issue);
    notifyDismissed();
  }

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.backBtn} onClick={() => navigate(-1)}>
        ← Back
      </button>
      <div className={styles.eyebrow}>Data Check</div>
      <h1 className={styles.title}>{isLoading ? 'Scanning…' : issues.length ? `${issues.length} thing${issues.length === 1 ? '' : 's'} worth reviewing` : 'Everything checks out'}</h1>
      <p className={styles.sub}>Scans every lead in {scopeLabel} for pricing/payment inconsistencies and record hygiene — automatically, every time you open this.</p>

      <div className={styles.kpiRow}>
        <div className={styles.kpi}>
          <div className={`${styles.kpiVal} ${hygieneScore < 90 ? styles.kpiValWarn : ''}`}>{hygieneScore}%</div>
          <div className={styles.kpiLbl}>Hygiene score</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiVal}>
            {totalLeads - flaggedCount} / {totalLeads}
          </div>
          <div className={styles.kpiLbl}>Clean leads</div>
        </div>
      </div>

      {aiSummary && (
        <div className={styles.aiSummary}>
          <span className={styles.aiBadge}>AI</span>
          <span>{aiSummary}</span>
        </div>
      )}

      {isLoading && <p className={styles.emptyMsg}>Loading…</p>}
      {!isLoading && issues.length === 0 && <p className={styles.emptyMsg}>Every lead&apos;s unit price, totals, payments and basic record fields are all in order.</p>}

      <div className={styles.list}>
        {issues.map((issue, i) => (
          <div className={styles.row} key={`${issue.leadId}-${issue.type}-${i}`}>
            <div className={styles.rowTop}>
              <div>
                <div className={styles.name}>{issue.leadName}</div>
                <div className={styles.meta}>{issue.agentDisplay}</div>
              </div>
              <span className={`${styles.tag} ${issue.severity === 'danger' ? styles.tagDanger : styles.tagWarn}`}>{issue.type}</span>
            </div>
            <div className={styles.detail}>{issue.detail}</div>
            <div className={styles.actionsRow}>
              <button type="button" className={styles.fixBtn} onClick={() => navigate(`/app/sales/pipeline/${issue.leadId}`)}>
                Fix this lead →
              </button>
              <button type="button" className={styles.dismissBtn} onClick={() => dismiss(issue)}>
                Not an error, dismiss
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
