import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { Config, LeaderboardWeights } from '../../../types/domain';
import { useConfig, useUpdateConfig } from '../hooks/useConfigSettings';
import styles from './SettingsScreen.module.css';

// Real app_config columns leaderboard_weights/commission_full_cap/
// commission_half_cap/commission_pool_per_plot -- p_config_upd RLS
// confirmed manager-only. Closes the loop on the Leaderboard and
// Commission screens shipped earlier, which read these same fields but
// had no way for a manager to actually change them. Every other real
// settings area (Quotation text, full Pricing & Targets, Company/
// Achievement/Referral settings, Backup/System/Audit) is deliberately
// out of scope for this first cut -- a much larger hub in index.html
// (mgrSettingsHubHtml), not something to half-build here. Team roster
// (activate/deactivate) lives at its own route, linked below, since it
// has real content of its own rather than fitting this screen's
// edit-a-number-and-save shape.
export function SettingsScreen() {
  const navigate = useNavigate();
  const { data: config, isLoading } = useConfig();

  return (
    <div className={styles.wrap}>
      <div className={styles.eyebrow}>Management</div>
      <h1 className={styles.title}>Settings</h1>
      <p className={styles.sub}>Leaderboard points formula & the commission engine</p>

      <button type="button" className={styles.teamLink} onClick={() => navigate('/app/mgr/team')}>
        👥 Team roster &mdash; activate / deactivate staff
      </button>

      {isLoading && <p style={{ color: 'var(--muted)' }}>Loading…</p>}
      {config && <SettingsForm config={config} />}
    </div>
  );
}

function SettingsForm({ config }: { config: Config }) {
  const update = useUpdateConfig();
  const [weights, setWeights] = useState<LeaderboardWeights>(config.leaderboardWeights);
  const [commFull, setCommFull] = useState(String(config.commissionFullCap));
  const [commHalf, setCommHalf] = useState(String(config.commissionHalfCap));
  const [commPool, setCommPool] = useState(String(config.commissionPoolPerPlot));
  const [savedSection, setSavedSection] = useState<'weights' | 'commission' | null>(null);

  const weightsDirty = JSON.stringify(weights) !== JSON.stringify(config.leaderboardWeights);
  const commissionDirty = commFull !== String(config.commissionFullCap) || commHalf !== String(config.commissionHalfCap) || commPool !== String(config.commissionPoolPerPlot);

  function weightField(key: keyof LeaderboardWeights, label: string, hint?: string) {
    return (
      <div className={styles.field}>
        <label className={styles.label}>
          {label}
          {hint && <span className={styles.hint}> &mdash; {hint}</span>}
        </label>
        <input className={styles.input} type="number" step="any" value={weights[key]} onChange={(e) => setWeights((w) => ({ ...w, [key]: Number(e.target.value) }))} />
      </div>
    );
  }

  async function saveWeights() {
    await update.mutateAsync({ leaderboardWeights: weights });
    setSavedSection('weights');
    setTimeout(() => setSavedSection(null), 2000);
  }

  async function saveCommission() {
    await update.mutateAsync({ commissionFullCap: Number(commFull), commissionHalfCap: Number(commHalf), commissionPoolPerPlot: Number(commPool) });
    setSavedSection('commission');
    setTimeout(() => setSavedSection(null), 2000);
  }

  return (
    <>
      <div className={styles.sectionCard}>
        <div className={styles.sectionTitle}>Leaderboard points formula</div>
        <p className={styles.sectionHint}>How much each metric contributes to an agent&apos;s points. &quot;Collected&quot; is deliberately the biggest factor.</p>
        <div className={styles.grid2}>
          {weightField('collected', 'Per GHS collected')}
          {weightField('dealsClosed', 'Per deal closed')}
        </div>
        <div className={styles.grid2}>
          {weightField('siteVisits', 'Per site visit')}
          {weightField('tasksCompleted', 'Per task done')}
        </div>
        <div className={styles.grid2}>
          {weightField('todosCompleted', 'Per to-do done')}
          {weightField('taskSpeedBonus', 'Task speed bonus (max)')}
        </div>
        <div className={styles.grid2}>
          {weightField('regularity', 'Per day attended')}
          {weightField('punctuality', 'Per on-time day')}
        </div>
        <button type="button" className={styles.saveBtn} disabled={!weightsDirty || update.isPending} onClick={saveWeights}>
          {update.isPending && savedSection !== 'commission' ? 'Saving…' : savedSection === 'weights' ? 'Saved ✓' : 'Save weights'}
        </button>
      </div>

      <div className={styles.sectionCard}>
        <div className={styles.sectionTitle}>Commission engine</div>
        <p className={styles.sectionHint}>Personal commission is capped per payment, not a flat percentage. Pool is a flat amount per newly-sold plot, split across eligible agents.</p>
        <div className={styles.grid2}>
          <div className={styles.field}>
            <label className={styles.label}>Full plot cap (GHS)</label>
            <input className={styles.input} type="number" value={commFull} onChange={(e) => setCommFull(e.target.value)} />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Half plot cap (GHS)</label>
            <input className={styles.input} type="number" value={commHalf} onChange={(e) => setCommHalf(e.target.value)} />
          </div>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Pool per plot sold (GHS)</label>
          <input className={styles.input} type="number" value={commPool} onChange={(e) => setCommPool(e.target.value)} />
        </div>
        <button type="button" className={styles.saveBtn} disabled={!commissionDirty || update.isPending} onClick={saveCommission}>
          {update.isPending && savedSection !== 'weights' ? 'Saving…' : savedSection === 'commission' ? 'Saved ✓' : 'Save commission settings'}
        </button>
      </div>
    </>
  );
}
