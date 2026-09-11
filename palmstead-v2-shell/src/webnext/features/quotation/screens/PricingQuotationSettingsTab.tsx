"use client";

import { useState } from 'react';
import { ghs, today as todayStr } from '../../../shared/lib/format';
import { friendlyError } from '../../../shared/lib/friendlyError';
import { useCreatePricingPromotion, useDeletePricingPromotion, useLogPricingChange, usePricingHistory, usePricingPromotions, useUpdateConfig } from '../../manager/hooks/useConfigSettings';
import type { Config } from '../../../types/domain';
import styles from './PricingQuotationSettingsTab.module.css';

// Real user ask (2026-09-11): "add another settinsg tab called pricing
// and quotation setting, then move the pricing settings, quotation
// setting, and copy them from v2 like the reference screenshot and
// merge them into this version." "v2" is web-next (the prior rewrite,
// now superseded by this OSS-fork shell) -- these three sections are a
// literal port of its SettingsScreen.tsx (PricingSettingsSection/
// PromotionalPricingSection/PricingHistorySection), moved here rather
// than left on a general Settings screen since that's genuinely what
// governs every number the Quotation/Technical Quotation PDFs compute
// from. All 6 hooks below already existed in this shell's own
// useConfigSettings.ts -- only the UI itself was missing.
export function PricingQuotationSettingsTab({ config }: { config: Config }) {
  return (
    <>
      <PricingSettingsSection config={config} />
      <PromotionalPricingSection />
      <PricingHistorySection />
    </>
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
        Existing leads already keep their own price and discount from when they were created — changing this here only affects new leads and anyone re-saved after the change. Every change is logged below with who, when, and the
        old vs. new value.
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

      <div className={styles.sectionSubtitle}>Technical Quotation — standard plot dimensions (ft)</div>
      <p className={styles.sectionHint}>The Technical Quotation app&apos;s price-per-sq.ft is always derived from Full Plot price ÷ (length×width) above — never hardcoded. Update these if the standard plot sizes ever change.</p>
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
        Runs a discount or price increase ONLY for leads added within the dates you choose below — e.g. an end-of-month promo. Never touches any client already in the system, before or after saving this; it only ever applies
        once, automatically, when a new lead is created inside the window.
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
                {ghs(h.oldValue)} → {ghs(h.newValue)} · by {h.changedByName} · {h.changedAt.slice(0, 16).replace('T', ' ')}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
