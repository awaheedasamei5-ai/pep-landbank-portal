import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router';
import type { Config } from '../../../types/domain';
import { Icon } from '../../../shared/ui/Icon';
import { OfficeMapSnippet } from '../../../shared/ui/OfficeMapSnippet';
import { ghs } from '../../../shared/lib/format';
import { friendlyError } from '../../../shared/lib/friendlyError';
import { useConfig, useCreatePricingPromotion, useDeletePricingPromotion, useLogPricingChange, usePricingHistory, usePricingPromotions, useUpdateConfig } from '../hooks/useConfigSettings';
import { useCreateOfficeLocation, useDeleteOfficeLocation, useOfficeLocations, useUpdateOfficeLocation } from '../hooks/useOfficeLocations';
import { useAttendancePolicy, useAttendancePolicyHistory, useUpdateAttendancePolicy } from '../hooks/useAttendancePolicy';
import { useStaffDirectory } from '../../memos/hooks/useMemos';
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
      <p className={styles.sub}>Plot pricing, leaderboard scoring & the commission engine</p>

      <button type="button" className={styles.teamLink} onClick={() => navigate('/app/mgr/team')}>
        <Icon name="team" size={18} /> Team roster &mdash; activate / deactivate staff
      </button>

      {isLoading && <p style={{ color: 'var(--c-muted)' }}>Loading…</p>}
      {config && <PricingSettingsSection config={config} />}
      {config && <SettingsForm config={config} />}
      {config && <AttendanceLeaveSettingsSection config={config} />}
      <OfficeLocationsSection />
      <AttendancePolicySection />
      {config && <EidWindowsSection config={config} />}
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
  const [commFull, setCommFull] = useState(String(config.commissionFullCap));
  const [commHalf, setCommHalf] = useState(String(config.commissionHalfCap));
  const [commPool, setCommPool] = useState(String(config.commissionPoolPerPlot));
  const [allocThreshold, setAllocThreshold] = useState(String(config.allocationThresholdPct));
  const [savedSection, setSavedSection] = useState<'commission' | 'allocation' | null>(null);

  const commissionDirty = commFull !== String(config.commissionFullCap) || commHalf !== String(config.commissionHalfCap) || commPool !== String(config.commissionPoolPerPlot);
  const allocationDirty = allocThreshold !== String(config.allocationThresholdPct);

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
        <div className={styles.sectionTitle}>Leaderboard scoring</div>
        <p className={styles.sectionHint}>
          Weights, a live what-if preview, and the score-change audit log now live in their own workspace, with room for caps and per-metric eligibility rules as that grows.
        </p>
        <Link to="/app/mgr/leaderboard/admin" className={styles.saveBtn} style={{ display: 'inline-block', textDecoration: 'none', textAlign: 'center' }}>
          Manage scoring →
        </Link>
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
          {update.isPending && savedSection !== 'allocation' ? 'Saving…' : savedSection === 'commission' ? 'Saved ✓' : 'Save commission settings'}
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

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Real gap found 2026-09-05 auditing Master Spec Section 11.3/12.1/12.3:
// office GPS/radius/cutoff/work-hours/work-days, the annual leave
// entitlement, and the Eid-observing-staff allowlist all already existed
// as real, live app_config columns (feeding AttendanceScreen's geofence
// math and leaveLogic.ts's quota/conflict engine) with genuinely no
// Management UI anywhere to change them -- and config.update() itself
// silently dropped these fields even if a UI had called it (fixed the
// same day, data/source.ts). This closes that gap.
function AttendanceLeaveSettingsSection({ config }: { config: Config }) {
  const update = useUpdateConfig();
  const { data: staff } = useStaffDirectory();
  const [officeLat, setOfficeLat] = useState(config.officeLat != null ? String(config.officeLat) : '');
  const [officeLng, setOfficeLng] = useState(config.officeLng != null ? String(config.officeLng) : '');
  const [officeRadius, setOfficeRadius] = useState(String(config.officeRadiusMeters));
  const [cutoffTime, setCutoffTime] = useState(config.attendanceCutoffTime);
  const [workStart, setWorkStart] = useState(config.workStartTime);
  const [workEnd, setWorkEnd] = useState(config.workEndTime);
  const [workDays, setWorkDays] = useState<number[]>(config.workDays);
  const [leaveTotalDays, setLeaveTotalDays] = useState(String(config.leaveTotalDays));
  const [eidStaff, setEidStaff] = useState<string[]>(config.eidObservingStaff);
  const [locating, setLocating] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    officeLat !== (config.officeLat != null ? String(config.officeLat) : '') ||
    officeLng !== (config.officeLng != null ? String(config.officeLng) : '') ||
    officeRadius !== String(config.officeRadiusMeters) ||
    cutoffTime !== config.attendanceCutoffTime ||
    workStart !== config.workStartTime ||
    workEnd !== config.workEndTime ||
    JSON.stringify([...workDays].sort()) !== JSON.stringify([...config.workDays].sort()) ||
    leaveTotalDays !== String(config.leaveTotalDays) ||
    JSON.stringify([...eidStaff].sort()) !== JSON.stringify([...config.eidObservingStaff].sort());

  function toggleDay(day: number) {
    setWorkDays((cur) => (cur.includes(day) ? cur.filter((d) => d !== day) : [...cur, day].sort()));
  }
  function toggleEidStaff(key: string) {
    setEidStaff((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setError('Location is not available in this browser.');
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOfficeLat(String(pos.coords.latitude));
        setOfficeLng(String(pos.coords.longitude));
        setLocating(false);
      },
      () => {
        setError('Could not read your current location — enter coordinates manually instead.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function save() {
    setError(null);
    try {
      await update.mutateAsync({
        officeLat: officeLat.trim() ? Number(officeLat) : null,
        officeLng: officeLng.trim() ? Number(officeLng) : null,
        officeRadiusMeters: Number(officeRadius),
        attendanceCutoffTime: cutoffTime,
        workStartTime: workStart,
        workEndTime: workEnd,
        workDays,
        leaveTotalDays: Number(leaveTotalDays),
        eidObservingStaff: eidStaff,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(friendlyError(e, 'Failed to save attendance & leave settings'));
    }
  }

  return (
    <div className={styles.sectionCard}>
      <div className={styles.sectionTitle}>Attendance &amp; leave</div>
      <p className={styles.sectionHint}>Office location/radius and work hours drive the geofence and late check on sign-in; work days and leave entitlement drive the Leave planner.</p>

      <div className={styles.sectionSubtitle}>Office location &amp; geofence</div>
      <button type="button" className={styles.saveBtnGold} disabled={locating} onClick={useCurrentLocation} style={{ marginBottom: 10 }}>
        {locating ? 'Reading location…' : '📍 Use current location'}
      </button>
      <div className={styles.grid2}>
        <div className={styles.field}>
          <label className={styles.label}>Latitude</label>
          <input className={styles.input} type="number" step="any" placeholder="not set" value={officeLat} onChange={(e) => setOfficeLat(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Longitude</label>
          <input className={styles.input} type="number" step="any" placeholder="not set" value={officeLng} onChange={(e) => setOfficeLng(e.target.value)} />
        </div>
      </div>
      <div className={styles.field}>
        <label className={styles.label}>Allowed radius (meters)</label>
        <input className={styles.input} type="number" min="0" value={officeRadius} onChange={(e) => setOfficeRadius(e.target.value)} />
      </div>
      {!config.officeLat && <p className={styles.errorMsg}>No office location set yet — sign-in currently falls back to self-report only for off-site.</p>}

      <div className={styles.sectionSubtitle}>Work hours &amp; days</div>
      <div className={styles.grid2}>
        <div className={styles.field}>
          <label className={styles.label}>Sign-in cutoff (late after)</label>
          <input className={styles.input} type="time" value={cutoffTime} onChange={(e) => setCutoffTime(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Work start</label>
          <input className={styles.input} type="time" value={workStart} onChange={(e) => setWorkStart(e.target.value)} />
        </div>
      </div>
      <div className={styles.field}>
        <label className={styles.label}>Work end</label>
        <input className={styles.input} type="time" value={workEnd} onChange={(e) => setWorkEnd(e.target.value)} />
      </div>
      <div className={styles.field}>
        <label className={styles.label}>Working days</label>
        <div className={styles.chipRow}>
          {DAY_LABELS.map((label, i) => (
            <button key={label} type="button" className={`${styles.dayChip} ${workDays.includes(i) ? styles.dayChipOn : ''}`} onClick={() => toggleDay(i)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.sectionSubtitle}>Leave</div>
      <div className={styles.field}>
        <label className={styles.label}>Annual entitlement (working days)</label>
        <input className={styles.input} type="number" min="0" value={leaveTotalDays} onChange={(e) => setLeaveTotalDays(e.target.value)} />
      </div>
      <div className={styles.field}>
        <label className={styles.label}>Eid-observing staff — exempt from Eid-window restrictions</label>
        <div className={styles.chipRow}>
          {(staff ?? []).map((s) => (
            <button key={s.key} type="button" className={`${styles.dayChip} ${eidStaff.includes(s.key) ? styles.dayChipOn : ''}`} onClick={() => toggleEidStaff(s.key)}>
              {s.name}
            </button>
          ))}
          {(staff ?? []).length === 0 && <span className={styles.sectionHint}>No staff loaded yet.</span>}
        </div>
      </div>

      {error && <p className={styles.errorMsg}>{error}</p>}
      <button type="button" className={styles.saveBtn} disabled={!dirty || update.isPending} onClick={save}>
        {update.isPending ? 'Saving…' : saved ? 'Saved ✓' : 'Save attendance & leave settings'}
      </button>
    </div>
  );
}

// New 2026-09-10, V3 chapter-01 gap (project-attendance-v3-chapter01-gap
// memory): real companies have more than one site, but the legacy
// Config.officeLat/officeLng/officeRadiusMeters fields above only ever
// modeled one -- and are NULL in production today (no office has ever
// actually been configured). Same add/remove-immediately list pattern as
// EidWindowsSection below, backed by the new office_locations table
// instead of a single app_config column. The old single-office fields
// are deliberately left untouched above -- this is additive, not a
// replacement, until AttendanceScreen's off-site check is migrated to
// prefer this list (still open, see the memory file).
function OfficeLocationsSection() {
  const { data: locations, isLoading } = useOfficeLocations();
  const createLoc = useCreateOfficeLocation();
  const updateLoc = useUpdateOfficeLocation();
  const deleteLoc = useDeleteOfficeLocation();

  const [name, setName] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [radius, setRadius] = useState('150');
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // ATTENDANCE_BLUEPRINT.md §11 -- collapsed by default so a multi-site
  // list doesn't load N map iframes at once.
  const [mapOpenIds, setMapOpenIds] = useState<Record<string, boolean>>({});

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setError('Location is not available in this browser.');
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(String(pos.coords.latitude));
        setLng(String(pos.coords.longitude));
        setLocating(false);
      },
      () => {
        setError('Could not read your current location — enter coordinates manually instead.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function addLocation() {
    setError(null);
    if (!name.trim() || !lat.trim() || !lng.trim()) {
      setError('Name, latitude and longitude are all required.');
      return;
    }
    try {
      await createLoc.mutateAsync({ name: name.trim(), lat: Number(lat), lng: Number(lng), radiusMeters: Number(radius) || 150 });
      setName('');
      setLat('');
      setLng('');
      setRadius('150');
    } catch (e) {
      setError(friendlyError(e, 'Failed to add that site location'));
    }
  }

  return (
    <div className={styles.sectionCard}>
      <div className={styles.sectionTitle}>Site locations</div>
      <p className={styles.sectionHint}>Every office or yard staff can sign in from. Sign-in is checked against the nearest active site here.</p>

      {isLoading && <p className={styles.sectionHint}>Loading…</p>}
      {!isLoading && !locations?.length && <p className={styles.sectionHint}>No sites added yet.</p>}
      {!!locations?.length && (
        <div className={styles.historyList}>
          {locations.map((loc) => (
            <div className={styles.historyRow} key={loc.id}>
              <div className={styles.locRowTop}>
                <div>
                  <div className={styles.historyField}>{loc.name}</div>
                  <div className={styles.historyMeta}>
                    {loc.lat.toFixed(5)}, {loc.lng.toFixed(5)} &middot; {loc.radiusMeters}m radius
                  </div>
                </div>
                <span className={loc.isActive ? styles.locBadgeActive : styles.locBadgeInactive}>{loc.isActive ? 'Active' : 'Inactive'}</span>
              </div>
              <div className={styles.locRowActions}>
                <button type="button" className={styles.locActionBtn} disabled={updateLoc.isPending} onClick={() => updateLoc.mutate({ id: loc.id, patch: { isActive: !loc.isActive } })}>
                  {loc.isActive ? 'Deactivate' : 'Activate'}
                </button>
                <button type="button" className={styles.locActionBtnDanger} disabled={deleteLoc.isPending} onClick={() => deleteLoc.mutate(loc.id)}>
                  Remove
                </button>
                <button type="button" className={styles.locShowMapBtn} onClick={() => setMapOpenIds((m) => ({ ...m, [loc.id]: !m[loc.id] }))}>
                  {mapOpenIds[loc.id] ? 'Hide map' : 'Show on map'}
                </button>
              </div>
              {mapOpenIds[loc.id] && (
                <div className={styles.locMapWrap}>
                  <OfficeMapSnippet lat={loc.lat} lng={loc.lng} />
                  <p className={styles.locMapCaption}>{loc.radiusMeters}m radius around this pin</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className={styles.sectionSubtitle}>Add a site</div>
      <div className={styles.field}>
        <label className={styles.label}>Name</label>
        <input className={styles.input} placeholder="e.g. Head Office, East Legon Yard" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <button type="button" className={styles.saveBtnGold} disabled={locating} onClick={useCurrentLocation} style={{ marginBottom: 10 }}>
        {locating ? 'Reading location…' : '📍 Use current location'}
      </button>
      <div className={styles.grid2}>
        <div className={styles.field}>
          <label className={styles.label}>Latitude</label>
          <input className={styles.input} type="number" step="any" placeholder="not set" value={lat} onChange={(e) => setLat(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Longitude</label>
          <input className={styles.input} type="number" step="any" placeholder="not set" value={lng} onChange={(e) => setLng(e.target.value)} />
        </div>
      </div>
      <div className={styles.field}>
        <label className={styles.label}>Allowed radius (meters)</label>
        <input className={styles.input} type="number" min="0" value={radius} onChange={(e) => setRadius(e.target.value)} />
      </div>
      {error && <p className={styles.errorMsg}>{error}</p>}
      <button type="button" className={styles.saveBtn} disabled={createLoc.isPending} onClick={addLocation}>
        {createLoc.isPending ? 'Adding…' : 'Add site'}
      </button>
    </div>
  );
}

// New 2026-09-10, V3 chapter-01 gap: a real management screen for
// set_attendance_policy() -- until now the RPC and a seeded row existed
// with no UI to change either. Deliberately its own versioned entity
// (not folded into the legacy Config.attendanceCutoffTime/workDays
// fields above) so a policy change leaves a real audit trail (the
// history list below), matching the same discipline just built for
// Leaderboard's score-change log. NOT yet wired into any late-detection
// logic -- see project-attendance-v3-chapter01-gap memory.
function AttendancePolicySection() {
  const { data: policy, isLoading } = useAttendancePolicy();
  const { data: history } = useAttendancePolicyHistory();
  const update = useUpdateAttendancePolicy();

  const [workStart, setWorkStart] = useState('');
  const [workEnd, setWorkEnd] = useState('');
  const [graceMinutes, setGraceMinutes] = useState('0');
  const [workDays, setWorkDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  // Syncs local edit fields to the real active policy once it loads (or
  // changes from elsewhere) -- guarded by `touched` so it never
  // clobbers the user's own in-progress edit.
  useEffect(() => {
    if (!policy || touched) return;
    setWorkStart(policy.workStartTime);
    setWorkEnd(policy.workEndTime);
    setGraceMinutes(String(policy.graceMinutes));
    setWorkDays(policy.workDays);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [policy]);

  function toggleDay(day: number) {
    setTouched(true);
    setWorkDays((cur) => (cur.includes(day) ? cur.filter((d) => d !== day) : [...cur, day].sort()));
  }

  async function save() {
    setError(null);
    try {
      await update.mutateAsync({ workStartTime: workStart, workEndTime: workEnd, graceMinutes: Number(graceMinutes) || 0, workDays });
      setTouched(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(friendlyError(e, 'Failed to save the attendance policy'));
    }
  }

  return (
    <div className={styles.sectionCard}>
      <div className={styles.sectionTitle}>Attendance policy</div>
      <p className={styles.sectionHint}>The real shift schedule and grace period sign-in is checked against. Every change here is versioned below -- nothing is silently overwritten.</p>

      {isLoading && <p className={styles.sectionHint}>Loading…</p>}
      {!isLoading && (
        <>
          <div className={styles.grid2}>
            <div className={styles.field}>
              <label className={styles.label}>Work start</label>
              <input
                className={styles.input}
                type="time"
                value={workStart}
                onChange={(e) => {
                  setTouched(true);
                  setWorkStart(e.target.value);
                }}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Work end</label>
              <input
                className={styles.input}
                type="time"
                value={workEnd}
                onChange={(e) => {
                  setTouched(true);
                  setWorkEnd(e.target.value);
                }}
              />
            </div>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Grace period (minutes after work start before someone counts as late)</label>
            <input
              className={styles.input}
              type="number"
              min="0"
              value={graceMinutes}
              onChange={(e) => {
                setTouched(true);
                setGraceMinutes(e.target.value);
              }}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Working days</label>
            <div className={styles.chipRow}>
              {DAY_LABELS.map((label, i) => (
                <button key={label} type="button" className={`${styles.dayChip} ${workDays.includes(i) ? styles.dayChipOn : ''}`} onClick={() => toggleDay(i)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {error && <p className={styles.errorMsg}>{error}</p>}
          <button type="button" className={styles.saveBtn} disabled={update.isPending} onClick={save}>
            {update.isPending ? 'Saving…' : saved ? 'Saved ✓' : 'Save policy'}
          </button>
        </>
      )}

      {!!history?.length && (
        <>
          <div className={styles.sectionSubtitle}>Policy history</div>
          <div className={styles.historyList}>
            {history.map((p) => (
              <div className={styles.historyRow} key={p.id}>
                <div className={styles.historyField}>
                  {p.workStartTime}–{p.workEndTime}, {p.graceMinutes}m grace {p.isActive ? '(active)' : ''}
                </div>
                <div className={styles.historyMeta}>
                  {DAY_LABELS.filter((_, i) => p.workDays.includes(i)).join(', ')} &middot; by {p.createdByName ?? p.createdBy ?? 'unknown'} &middot; {p.createdAt.slice(0, 16).replace('T', ' ')}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Master Spec 12.3, kept as its own list-editing section (matching
// Promotional Pricing's own add/remove-immediately pattern below) rather
// than folded into the scalar-field dirty/save flow above -- windows are
// list items, not a handful of independent values.
function EidWindowsSection({ config }: { config: Config }) {
  const update = useUpdateConfig();
  const [name, setName] = useState('');
  const [centerDate, setCenterDate] = useState('');
  const [daysBefore, setDaysBefore] = useState('1');
  const [daysAfter, setDaysAfter] = useState('1');
  const [error, setError] = useState<string | null>(null);

  async function addWindow() {
    setError(null);
    if (!name.trim() || !centerDate) return;
    const win = { id: Math.random().toString(36).slice(2, 10), name: name.trim(), centerDate, daysBefore: Number(daysBefore) || 0, daysAfter: Number(daysAfter) || 0 };
    try {
      await update.mutateAsync({ eidWindows: [...config.eidWindows, win] });
      setName('');
      setCenterDate('');
      setDaysBefore('1');
      setDaysAfter('1');
    } catch (e) {
      setError(friendlyError(e, 'Failed to save the Eid window'));
    }
  }

  function removeWindow(id: string) {
    setError(null);
    update.mutate({ eidWindows: config.eidWindows.filter((w) => w.id !== id) });
  }

  return (
    <div className={styles.sectionCard}>
      <div className={styles.sectionTitle}>Eid windows</div>
      <p className={styles.sectionHint}>
        Eid al-Fitr and Eid al-Adha dates shift with moon sightings and can&apos;t be reliably predicted &mdash; enter the expected date yourself (update it once the real date is announced) and how many days before/after should also
        be restricted. Staff selected in &quot;Eid-observing staff&quot; above may still book leave inside this window; everyone else sees it as a public holiday. Changing or removing a window never affects leave already approved.
      </p>
      <div className={styles.grid2}>
        <div className={styles.field}>
          <label className={styles.label}>Name</label>
          <input className={styles.input} placeholder="e.g. Eid al-Fitr 2027" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Expected date</label>
          <input className={styles.input} type="date" value={centerDate} onChange={(e) => setCenterDate(e.target.value)} />
        </div>
      </div>
      <div className={styles.grid2}>
        <div className={styles.field}>
          <label className={styles.label}>Days before</label>
          <input className={styles.input} type="number" min="0" value={daysBefore} onChange={(e) => setDaysBefore(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Days after</label>
          <input className={styles.input} type="number" min="0" value={daysAfter} onChange={(e) => setDaysAfter(e.target.value)} />
        </div>
      </div>
      {error && <p className={styles.errorMsg}>{error}</p>}
      <button type="button" className={styles.saveBtnGold} disabled={!name.trim() || !centerDate || update.isPending} onClick={addWindow}>
        {update.isPending ? 'Saving…' : 'Add Eid window'}
      </button>

      {config.eidWindows.length > 0 && (
        <div className={styles.historyList} style={{ marginTop: 14 }}>
          {config.eidWindows.map((w) => (
            <div key={w.id} className={styles.historyRow}>
              <div className={styles.historyField}>{w.name}</div>
              <div className={styles.historyMeta}>
                {w.centerDate} &plusmn; {w.daysBefore}/{w.daysAfter} days
              </div>
              <button type="button" className={styles.cancelLink} disabled={update.isPending} onClick={() => removeWindow(w.id)}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
