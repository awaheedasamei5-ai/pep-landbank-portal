import { useNavigate } from 'react-router';
import { usePlots } from '../hooks/usePlots';
import styles from './PlotReconciliationScreen.module.css';

// Master Spec 7.1/8: "Build a Plot Data Reconciliation screen showing
// discrepancies rather than silently choosing one." The workbook/site-plan
// reference counts below are the spec's own published numbers (Section
// 7.1's table) -- real, not invented. Confirmed live 2026-09-04: the
// actual inventory has already moved past BOTH reference documents (real
// plots added/split since that workbook was compiled), so this compares
// three real numbers, not two -- the workbook and site-plan columns are
// historical reference points, not a target the live count must match.
// This screen is read-only reporting; resolving a real discrepancy (is a
// block genuinely short a plot, or did the site plan undercount it) is a
// human decision, not something this screen decides for Management.
const REFERENCE: { block: string; workbook: number; sitePlan: number }[] = [
  { block: 'A', workbook: 40, sitePlan: 40 },
  { block: 'B', workbook: 52, sitePlan: 52 },
  { block: 'C', workbook: 23, sitePlan: 22 },
  { block: 'D', workbook: 23, sitePlan: 22 },
  { block: 'E', workbook: 24, sitePlan: 22 },
  { block: 'F', workbook: 26, sitePlan: 25 },
  { block: 'G', workbook: 26, sitePlan: 26 },
  { block: 'H', workbook: 27, sitePlan: 26 },
  { block: 'I', workbook: 27, sitePlan: 26 },
  { block: 'J', workbook: 28, sitePlan: 28 },
  { block: 'K', workbook: 30, sitePlan: 28 },
  { block: 'L', workbook: 30, sitePlan: 27 },
  { block: 'M', workbook: 26, sitePlan: 26 },
  { block: 'N', workbook: 24, sitePlan: 25 },
  { block: 'O', workbook: 8, sitePlan: 8 },
];

export function PlotReconciliationScreen() {
  const navigate = useNavigate();
  const { data: plots, isLoading } = usePlots();

  const liveCounts = new Map<string, number>();
  (plots ?? []).forEach((p) => {
    const key = p.section ?? '—';
    liveCounts.set(key, (liveCounts.get(key) ?? 0) + 1);
  });

  const rows = REFERENCE.map((r) => {
    const live = liveCounts.get(r.block) ?? 0;
    const liveVsWorkbook = live - r.workbook;
    const liveVsSitePlan = live - r.sitePlan;
    const clean = liveVsWorkbook === 0 && liveVsSitePlan === 0;
    return { ...r, live, liveVsWorkbook, liveVsSitePlan, clean };
  });

  const extraBlocks = [...liveCounts.keys()].filter((k) => !REFERENCE.some((r) => r.block === k));
  const totalLive = (plots ?? []).length;
  const totalWorkbook = REFERENCE.reduce((s, r) => s + r.workbook, 0);
  const flaggedCount = rows.filter((r) => !r.clean).length;

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.backBtn} onClick={() => navigate('/app/sales/plots')}>
        ← Plot Inventory
      </button>
      <h1 className={styles.title}>Plot Data Reconciliation</h1>
      <p className={styles.sub}>Live inventory vs. the original workbook and site-plan legend, block by block.</p>

      {isLoading && <p className={styles.emptyMsg}>Loading…</p>}

      {!isLoading && (
        <>
          <div className={styles.summaryRow}>
            <div className={styles.summaryPill}>
              <div className={styles.summaryVal}>{totalLive}</div>
              <div className={styles.summaryLbl}>Live plots</div>
            </div>
            <div className={styles.summaryPill}>
              <div className={styles.summaryVal}>{totalWorkbook}</div>
              <div className={styles.summaryLbl}>Workbook total</div>
            </div>
            <div className={styles.summaryPill}>
              <div className={`${styles.summaryVal} ${flaggedCount > 0 ? styles.warnVal : ''}`}>{flaggedCount}</div>
              <div className={styles.summaryLbl}>Blocks flagged</div>
            </div>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Block</th>
                  <th>Live</th>
                  <th>Workbook</th>
                  <th>Site plan</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.block} className={r.clean ? '' : styles.rowFlagged}>
                    <td className={styles.blockCell}>{r.block}</td>
                    <td>{r.live}</td>
                    <td>{r.workbook}</td>
                    <td>{r.sitePlan}</td>
                    <td>
                      {r.clean ? (
                        <span className={styles.badgeOk}>✓ Matches both</span>
                      ) : (
                        <span className={styles.badgeWarn}>
                          {r.liveVsWorkbook !== 0 && `${r.liveVsWorkbook > 0 ? '+' : ''}${r.liveVsWorkbook} vs workbook`}
                          {r.liveVsWorkbook !== 0 && r.liveVsSitePlan !== 0 && ' · '}
                          {r.liveVsSitePlan !== 0 && `${r.liveVsSitePlan > 0 ? '+' : ''}${r.liveVsSitePlan} vs site plan`}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {extraBlocks.map((b) => (
                  <tr key={b} className={styles.rowFlagged}>
                    <td className={styles.blockCell}>{b}</td>
                    <td>{liveCounts.get(b)}</td>
                    <td>—</td>
                    <td>—</td>
                    <td>
                      <span className={styles.badgeWarn}>Not in either reference document</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className={styles.footNote}>
            The live count already differs from both reference documents in most flagged blocks — the business has added or split real plots since the workbook was compiled. A flag here means &ldquo;worth a look,&rdquo; not &ldquo;the data is wrong.&rdquo; Nothing on this screen changes any plot automatically.
          </p>
        </>
      )}
    </div>
  );
}
