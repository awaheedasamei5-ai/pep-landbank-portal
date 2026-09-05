import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { Config, LeaderboardWeights } from '../../../types/domain';
import { Icon } from '../../../shared/ui/Icon';
import { ghs } from '../../../shared/lib/format';
import { friendlyError } from '../../../shared/lib/friendlyError';
import { useConfig, useCreatePricingPromotion, useDeletePricingPromotion, useLogPricingChange, usePricingHistory, usePricingPromotions, useUpdateConfig } from '../hooks/useConfigSettings';
import { today as todayStr } from '../../../shared/lib/format';
import styles from './SettingsScreen.module.css';

// Real app_config columns leaderboard_weights/commission_full_cap/
// commission_half_cap/commission_pool_per_plot -- p_config_upd RLS
// confirmed manager-only. Closes the loop on the Leaderboard and
// Commission screens shipped earlier, which read these same fields but
// had no way for a manager to actually change them. Plot Pricing (below)
// closes the same real gap for the pricing engine itself -- read
// directly from v1's mgrPricingTargetsHtml/bindPricingTargetsCtrls
// (index.html:20821-20899), field-for-field, per the user's own explicit
// "no room for errors" instruction. Every other real settings area
// (Quotation text, Company/Achievement/Referral settings, Backup/System/
// Audit) stays deliberately out of scope -- a much larger hub in
// index.html (mgrSettingsHubHtml), not something to half-build here.
// Team roster (activate/deactivate) lives at its own route, linked
// below, since it has real content of its own rather than fitting this
// screen's edit-a-number-and-save shape.
export function SettingsScreen() {
  const navigate = useNavigate();
  const { data: config, isLoading } = useConfig();

  return (
    <div className={styles.wrap}>
      <div className={styles.eyebrow}>Management</div>
      <h1 className={styles.title}>Settings</h1>
      <p className={styles.sub}>Plot pricing, leaderboard points formula & the commission engine</p>

      <button type="button" className={styles.teamLink} onClick={() => navigate('/app/mgr/team')}>
        <Icon name="team" size={18} /> Team roster &mdash; activate / deactivate staff
      </button>

      {isLoading && <p style={{ color: 'var(--c-muted)' }}>Loading…</p>}
      {config && <PricingSettingsSection config={config} />}
      {config && <SettingsForm config={config} />}
      {config && <PromotionalPricingSection />}
      <PricingHistorySection />
    </div>
  );
}

const PRICING_FIELD_LABELS: Record<string, string> = {
  fullPrice: 'Full Plot price',
  halfPrice: 'Half Plot price',
  fullDiscount: 'Full Plot standard discount',
  halfDiscount: 'Half Plot standard discount',
  int3: '3 Months interest',
  int6: '6 Months interest',
  int9: '9 Months interest',
  int12: '12 Months interest',
  techFullPlotLengthFt: 'Full Plot length (ft)',
  techFullPlotWidthFt: 'Full Plot width (ft)',
  techHalfPlotLengthFt: 'Half Plot length (ft)',
  techHalfPlotWidthFt: 'Half Plot width (ft)',
};

// Port of v1's mgrPricingTargetsHtml's "Plot pricing" card + Technical
// Quotation dimensions, field-for-field. Every changed field is logged to
// Price change history (below) the same way v1's own saveCfg diffs old
// vs new and calls apiLogPricingChange once per changed field -- not a
// single opaque "config updated" entry.
function PricingSettingsSection({ config }: { config: Config }) {
  const update = useUpdateConfig();
  const logChange = useLogPricingChange();
  const [fullPrice, setFullPrice] = useState(String(config.fullPrice));
  const [halfPrice, setHalfPrice] = useState(String(config.halfPrice));
  const [fullDiscount, setFullDiscount] = useState(String(config.fullDiscount));
  const [halfDiscount, setHalfDiscount] = useState(String(config.halfDiscount));
  const [int3, setInt3] = useState(String(config.int3));
  const [int6, setInt6] = useState(String(config.int6));
  const [int9, setInt9] = useState(String(config.int9));
  const [int12, setInt12] = useState(String(config.int12));
  const [techFullLen, setTechFullLen] = useState(String(config.techFullPlotLengthFt));
  const [techFullWid, setTechFullWid] = useState(String(config.techFullPlotWidthFt));
  const [techHalfLen, setTechHalfLen] = useState(String(config.techHalfPlotLengthFt));
  const [techHalfWid, setTechHalfWid] = useState(String(config.techHalfPlotWidthFt));
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const draft: Record<string, number> = {
    fullPrice: Number(fullPrice),
    halfPrice: Number(halfPrice),
    fullDiscount: Number(fullDiscount),
    halfDiscount: Number(halfDiscount),
    int3: Number(int3),
    int6: Number(int6),
    int9: Number(int9),
    int12: Number(int12),
    techFullPlotLengthFt: Number(techFullLen),
    techFullPlotWidthFt: Number(techFullWid),
    techHalfPlotLengthFt: Number(techHalfLen),
    techHalfPlotWidthFt: Number(techHalfWid),
  };
  const dirty = Object.keys(draft).some((k) => draft[k] !== Number(config[k as keyof Config]));

  async function save() {
    setError(null);
    const changed = Object.keys(draft).filter((k) => draft[k] !== Number(config[k as keyof Config]));
    if (!changed.length) return;
    try {
      await update.mutateAsync(draft as never);
      for (const field of changed) {
        await logChange.mutateAsync({ field, fieldLabel: PRICING_FIELD_LABELS[field] ?? field, oldValue: Number(config[field as keyof Config]), newValue: draft[field] }).catch(() => {});
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(friendlyError(e, 'Failed to save pricing'));
    }
  }

  return (
    <div className={styles.sectionCard}>
      <div className={styles.sectionTitle}>Plot pricing</div>
      <p className={styles.sectionHint}>
        Existing leads already keep their own price and discount from when they were created &mdash; changing this here only affects new leads and anyone re-saved after the change. Every change is logged below with who, when, and
        the old vs. new value.
      </p>
      <div className={styles.grid2}>
        <div className={styles.field}>
          <label className={styles.label}>Full Plot price (GHS)</label>
          <input className={styles.input} type="number" value={fullPrice} onChange={(e) => setFullPrice(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Full Plot standard discount (GHS)</label>
          <input className={styles.input} type="number" value={fullDiscount} onChange={(e) => setFullDiscount(e.target.value)} />
        </div>
      </div>
      <div className={styles.grid2}>
        <div className={styles.field}>
          <label className={styles.label}>Half Plot price (GHS)</label>
          <input className={styles.input} type="number" value={halfPrice} onChange={(e) => setHalfPrice(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Half Plot standard discount (GHS)</label>
          <input className={styles.input} type="number" value={halfDiscount} onChange={(e) => setHalfDiscount(e.target.value)} />
        </div>
      </div>

      <div className={styles.sectionSubtitle}>Payment plan interest (per full-plot-equivalent)</div>
      <div className={styles.grid2}>
        <div className={styles.field}>
          <label className={styles.label}>3 Months (GHS)</label>
          <input className={styles.input} type="number" value={int3} onChange={(e) => setInt3(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>6 Months (GHS)</label>
          <input className={styles.input} type="number" value={int6} onChange={(e) => setInt6(e.target.value)} />
        </div>
      </div>
      <div className={styles.grid2}>
        <div className={styles.field}>
          <label className={styles.label}>9 Months (GHS)</label>
          <input className={styles.input} type="number" value={int9} onChange={(e) => setInt9(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>12 Months (GHS)</label>
          <input className={styles.input} type="number" value={int12} onChange={(e) => setInt12(e.target.value)} />
        </div>
      </div>

      <div className={styles.sectionSubtitle}>Technical Quotation &mdash; standard plot dimensions (ft)</div>
      <p className={styles.sectionHint}>The Technical Quotation app&apos;s price-per-sq.ft is always derived from Full Plot price ÷ (length×width) above &mdash; never hardcoded. Update these if the standard plot sizes ever change.</p>
      <div className={styles.grid2}>
        <div className={styles.field}>
          <label className={styles.label}>Full Plot length (ft)</label>
          <input className={styles.input} type="number" value={techFullLen} onChange={(e) => setTechFullLen(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Full Plot width (ft)</label>
          <input className={styles.input} type="number" value={techFullWid} onChange={(e) => setTechFullWid(e.target.value)} />
        </div>
      </div>
      <div className={styles.grid2}>
        <div className={styles.field}>
          <label className={styles.label}>Half Plot length (ft)</label>
          <input className={styles.input} type="number" value={techHalfLen} onChange={(e) => setTechHalfLen(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Half Plot width (ft)</label>
          <input className={styles.input} type="number" value={techHalfWid} onChange={(e) => setTechHalfWid(e.target.value)} />
        </div>
      </div>
      {error && <p className={styles.errorMsg}>{error}</p>}
      <button type="button" className={styles.saveBtn} disabled={!dirty || update.isPending} onClick={save}>
        {update.isPending ? 'Saving…' : saved ? 'Saved ✓' : 'Save pricing'}
      </button>
    </div>
  );
}

// Real user correction, replacing the earlier "Monthly price adjustment"
// (apiBulkAdjust-style, one-time bulk-mutate every existing outstanding
// lead immediately): "the adjustment is supposed to serve as a setting
// that is only used in case management wants to set up a discount or
// price change only in a promo period, and the adjustment only affects
// clients loaded into the system during that period ... never any client
// that was in the system already." A promo window saved here does
// nothing to any existing lead -- AddLeadScreen looks up whether one
// applies (matching plot type, and the lead's own date falling inside
// dateFrom..dateTo) and auto-fills the discount/unit price for a NEW
// lead only, exactly once, at creation.
function PromotionalPricingSection() {
  const { data: promos } = usePricingPromotions();
  const createPromo = useCreatePricingPromotion();
  const deletePromo = useDeletePricingPromotion();
  const [plotType, setPlotType] = useState<'Both' | 'Full Plot' | 'Half Plot'>('Both');
  const [mode, setMode] = useState<'discount' | 'increase'>('discount');
  const [amount, setAmount] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const today = todayStr();

  function overlapsExisting(candidate: { plotType: typeof plotType; dateFrom: string; dateTo: string }): boolean {
    return (promos ?? []).some((p) => {
      const sameType = p.plotType === 'Both' || candidate.plotType === 'Both' || p.plotType === candidate.plotType;
      if (!sameType) return false;
      return candidate.dateFrom <= p.dateTo && candidate.dateTo >= p.dateFrom;
    });
  }

  async function save() {
    setError(null);
    const amt = Number(amount);
    if (!amt || !dateFrom || !dateTo) return;
    if (dateTo < dateFrom) {
      setError('End date must be on or after the start date.');
      return;
    }
    if (overlapsExisting({ plotType, dateFrom, dateTo })) {
      setError('This overlaps an existing promo window for the same plot type — end or remove it first, or narrow the dates.');
      return;
    }
    try {
      await createPromo.mutateAsync({ plotType, mode, amountPerPlot: amt, dateFrom, dateTo });
      setAmount('');
      setDateFrom('');
      setDateTo('');
    } catch (e) {
      setError(friendlyError(e, 'Failed to save the promotion'));
    }
  }

  return (
    <div className={styles.sectionCard}>
      <div className={styles.sectionTitle}>Promotional pricing window</div>
      <p className={styles.sectionHint}>
        Runs a discount or price increase ONLY for leads added within the dates you choose below &mdash; e.g. an end-of-month promo. Never touches any client already in the system, before or after saving this; it only ever
        applies once, automatically, when a new lead is created inside the window.
      </p>
      <div className={styles.grid2}>
        <div className={styles.field}>
          <label className={styles.label}>Plot type</label>
          <select className={styles.input} value={plotType} onChange={(e) => setPlotType(e.target.value as typeof plotType)}>
            <option>Both</option>
            <option>Full Plot</option>
            <option>Half Plot</option>
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Adjustment type</label>
          <select className={styles.input} value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
            <option value="discount">Extra discount (reduce price)</option>
            <option value="increase">Price increase (raise price)</option>
          </select>
        </div>
      </div>
      <div className={styles.field}>
        <label className={styles.label}>Amount per plot (GHS)</label>
        <input className={styles.input} type="number" placeholder="e.g. 2000" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <div className={styles.grid2}>
        <div className={styles.field}>
          <label className={styles.label}>From</label>
          <input className={styles.input} type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>To</label>
          <input className={styles.input} type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </div>
      {error && <p className={styles.errorMsg}>{error}</p>}
      <button type="button" className={styles.saveBtnGold} disabled={!amount || !dateFrom || !dateTo || createPromo.isPending} onClick={save}>
        {createPromo.isPending ? 'Saving…' : 'Save promotion'}
      </button>

      {(promos ?? []).length > 0 && (
        <div className={styles.historyList} style={{ marginTop: 14 }}>
          {(promos ?? []).map((p) => {
            const state = p.dateTo < today ? 'Ended' : p.dateFrom > today ? 'Upcoming' : 'Active now';
            return (
              <div key={p.id} className={styles.historyRow}>
                <div className={styles.historyField}>
                  {p.plotType} — {p.mode === 'discount' ? 'Extra discount' : 'Price increase'} of {ghs(p.amountPerPlot)}/plot
                </div>
                <div className={styles.historyMeta}>
                  {p.dateFrom} → {p.dateTo} · {state} · added by {p.createdByName || 'Management'}
                </div>
                <button
                  type="button"
                  className={styles.cancelLink}
                  disabled={deletePromo.isPending}
                  onClick={() => {
                    setError(null);
                    deletePromo.mutate(p.id);
                  }}
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PricingHistorySection() {
  const { data: history } = usePricingHistory();
  return (
    <div className={styles.sectionCard}>
      <div className={styles.sectionTitle}>Price change history</div>
      {!history?.length && <p className={styles.sectionHint}>No changes logged yet. Every price/discount/interest change you save above will appear here.</p>}
      {!!history?.length && (
        <div className={styles.historyList}>
          {history.map((h) => (
            <div key={h.id} className={styles.historyRow}>
              <div className={styles.historyField}>{h.fieldLabel}</div>
              <div className={styles.historyMeta}>
                {ghs(h.oldValue)} → {ghs(h.newValue)} &middot; by {h.changedByName} &middot; {h.changedAt.slice(0, 16).replace('T', ' ')}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SettingsForm({ config }: { config: Config }) {
  const update = useUpdateConfig();
  const [weights, setWeights] = useState<LeaderboardWeights>(config.leaderboardWeights);
  const [commFull, setCommFull] = useState(String(config.commissionFullCap));
  const [commHalf, setCommHalf] = useState(String(config.commissionHalfCap));
  const [commPool, setCommPool] = useState(String(config.commissionPoolPerPlot));
  const [allocThreshold, setAllocThreshold] = useState(String(config.allocationThresholdPct));
  const [savedSection, setSavedSection] = useState<'weights' | 'commission' | 'allocation' | null>(null);

  const weightsDirty = JSON.stringify(weights) !== JSON.stringify(config.leaderboardWeights);
  const commissionDirty = commFull !== String(config.commissionFullCap) || commHalf !== String(config.commissionHalfCap) || commPool !== String(config.commissionPoolPerPlot);
  const allocationDirty = allocThreshold !== String(config.allocationThresholdPct);

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

  async function saveAllocation() {
    await update.mutateAsync({ allocationThresholdPct: Number(allocThreshold) });
    setSavedSection('allocation');
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

      <div className={styles.sectionCard}>
        <div className={styles.sectionTitle}>Allocation eligibility</div>
        <p className={styles.sectionHint}>
          Master Spec 7.3&apos;s allocation threshold &mdash; a client must have paid at least this share of their grand total before staff can request a plot allocation for them. Also drives the existing deposit target shown on
          each lead.
        </p>
        <div className={styles.field}>
          <label className={styles.label}>Threshold (% of grand total)</label>
          <input className={styles.input} type="number" min="0" max="100" value={allocThreshold} onChange={(e) => setAllocThreshold(e.target.value)} />
        </div>
        <button type="button" className={styles.saveBtn} disabled={!allocationDirty || update.isPending} onClick={saveAllocation}>
          {update.isPending && savedSection === null ? 'Saving…' : savedSection === 'allocation' ? 'Saved ✓' : 'Save allocation settings'}
        </button>
      </div>
    </>
  );
}
