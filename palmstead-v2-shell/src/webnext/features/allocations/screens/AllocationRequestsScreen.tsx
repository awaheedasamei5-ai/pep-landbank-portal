"use client";

import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ghs } from '../../../shared/lib/format';
import { friendlyError } from '../../../shared/lib/friendlyError';
import { loadImageAsDataUri } from '../../../shared/lib/image';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useLeads } from '../../pipeline/hooks/useLeads';
import { useAllLeads } from '../../payments/hooks/useLogPayment';
import { usePayments } from '../../pipeline/hooks/usePayments';
import { usePlots, useSplitPlot } from '../../plots/hooks/usePlots';
import { allocationUnitsNeeded, computeDepositStatus } from '../../pipeline/lib/pipelineLogic';
import { candidatesForUnit, nearbyCandidates, searchCandidates, suggestAlternatives, suggestSet } from '../lib/suggestionEngine';
import { combosAreComplete, decodeSuggestionCombos, emptyCombos, encodeSuggestionCombos } from '../lib/suggestionCombos';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { techBaseAreaSqft, techHalfAreaSqft } from '../../quotation/lib/quotationLogic';
import {
  useAllocationRequests,
  useAnalyzeAllocationAuthDoc,
  useCanAllocatePlots,
  useConfirmAllocation,
  useCreateAllocationRequest,
  useDeleteAllocationRequest,
  useEditAllocatedPlot,
  useFlagAllocation,
  useResolveAllocationFlag,
  useRevertAllocation,
  useSendBackAllocation,
  useSuggestAllocationPlots,
  useUploadAllocationAuthDoc,
} from '../hooks/useAllocationRequests';
import { allocationAuthFilename, buildAllocationAuthorizationPdf } from '../lib/allocationAuthPdf';
import type { AllocationRequest, Lead, Plot, PlotType } from '../../../types/domain';
import styles from './AllocationRequestsScreen.module.css';

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

// Real 3-stage workflow (confirmed live against the actual confirm_
// allocation/edit_allocated_plot/revert_allocation/delete_allocation RPCs,
// ported to staging for this pass -- they never existed there before):
// Pending -> (staff suggest 1-3 real candidate plots, an Authorization form
// gets physically signed) Awaiting Authorization -> (staff confirm what was
// approved) Allocated, which is the only point the real `plots` table gets
// synced. Flagging/fix-resubmit is a real plain-update side path for "this
// request has a data problem, fix it before I suggest plots." PDF
// generation (Authorization form / Allocation confirmation) and "send to
// agent's chat" are deliberately deferred -- separable, jsPDF-based work,
// same scoping discipline as Contract-of-sale's PDF-less first pass.
export function AllocationRequestsScreen() {
  const { data: requests, isLoading } = useAllocationRequests();
  const canAllocate = useCanAllocatePlots();
  const [showForm, setShowForm] = useState(false);

  const allocated = (requests ?? []).filter((r) => r.status === 'Allocated').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  // Second layer of the same real bug NewRequestForm's alreadyAllocated
  // check prevents going forward -- a stray open request for a lead that
  // ALSO has an Allocated one (found live: Damaris Odai, a leftover row
  // from before today, unrelated to how it got created) should never
  // render as if it still needs a suggestion, whatever created it.
  const allocatedLeadIds = new Set(allocated.map((r) => r.leadId));
  const pending = (requests ?? [])
    .filter((r) => r.status === 'Pending' && !allocatedLeadIds.has(r.leadId))
    .sort((a, b) => (b.percentPaid ?? 0) - (a.percentPaid ?? 0));
  const awaiting = (requests ?? [])
    .filter((r) => r.status === 'Awaiting Authorization' && !allocatedLeadIds.has(r.leadId))
    .sort((a, b) => (b.percentPaid ?? 0) - (a.percentPaid ?? 0));

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Allocations</h1>
          <p className={styles.sub}>
            {pending.length} awaiting suggestion &middot; {awaiting.length} awaiting sign-off
          </p>
        </div>
        <button type="button" className={styles.addBtn} onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancel' : '+ Request allocation'}
        </button>
      </div>

      {showForm && <NewRequestForm onDone={() => setShowForm(false)} />}
      {isLoading && <p className={styles.emptyMsg}>Loading…</p>}

      <div className={styles.sectitle}>Pending</div>
      <div className={styles.list}>
        {pending.length === 0 && <p className={styles.emptyMsg}>Nothing pending. Clients appear here automatically once they cross 30% paid.</p>}
        {pending.map((r) => (
          <RequestRow key={r.id} request={r} canAllocate={canAllocate} />
        ))}
      </div>

      <div className={styles.sectitle}>Awaiting Management sign-off</div>
      <div className={styles.list}>
        {awaiting.length === 0 && <p className={styles.emptyMsg}>None right now.</p>}
        {awaiting.map((r) => (
          <RequestRow key={r.id} request={r} canAllocate={canAllocate} />
        ))}
      </div>

      <div className={styles.sectitle}>Already allocated</div>
      <div className={styles.list}>
        {allocated.length === 0 && !isLoading && <p className={styles.emptyMsg}>No allocations yet.</p>}
        {allocated.map((r) => (
          <RequestRow key={r.id} request={r} canAllocate={canAllocate} />
        ))}
      </div>
    </div>
  );
}

// Master Spec 7.3's eligibility gate applies here too, not just on the
// lead's own page (PipelineDetailScreen's AllocationEligibilitySection) --
// otherwise the threshold is trivially bypassed by using this picker
// instead. Same computeDepositStatus check, same config.allocationThresholdPct.
function NewRequestForm({ onDone }: { onDone: () => void }) {
  const { data: leads } = useLeads();
  const { data: config } = useConfig();
  const { data: allRequests } = useAllocationRequests();
  const create = useCreateAllocationRequest();
  const [query, setQuery] = useState('');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const { data: leadPayments } = usePayments(selectedLead?.id ?? '');

  const q = query.trim().toLowerCase();
  const matches = q ? (leads ?? []).filter((l) => l.name.toLowerCase().includes(q) || l.contact.includes(q)).slice(0, 8) : [];

  const dep = selectedLead && config ? computeDepositStatus(config, selectedLead, leadPayments ?? []) : null;
  // Real bug this closes: a lead could end up with a stray open request
  // sitting alongside one that was already Allocated (found live --
  // Damaris Odai had a stale Pending row from before her plots were even
  // assigned), showing the same client as "still needs a suggestion"
  // forever. Block a second request outright once any request for this
  // lead is already Allocated.
  const alreadyAllocated = selectedLead ? (allRequests ?? []).some((r) => r.leadId === selectedLead.id && r.status === 'Allocated') : false;

  async function submit() {
    if (!selectedLead || !dep?.complete || alreadyAllocated) return;
    await create.mutateAsync({ leadId: selectedLead.id });
    onDone();
  }

  return (
    <div className={styles.formCard}>
      {!selectedLead ? (
        <>
          <input className={styles.input} placeholder="Search your clients by name or contact…" value={query} onChange={(e) => setQuery(e.target.value)} />
          {matches.length > 0 && (
            <div className={styles.pickerList}>
              {matches.map((l) => (
                <button key={l.id} type="button" className={styles.pickerRow} onClick={() => setSelectedLead(l)}>
                  <div className={styles.pickerName}>{l.name}</div>
                  <div className={styles.pickerMeta}>
                    {l.contact} &middot; {ghs(l.amtPaid)} of {ghs(l.grandTotal)} paid
                  </div>
                </button>
              ))}
            </div>
          )}
          {q && matches.length === 0 && <p className={styles.noMatch}>No clients match &quot;{query}&quot;.</p>}
        </>
      ) : (
        <>
          <div className={styles.selectedLead}>
            <div className={styles.pickerName}>{selectedLead.name}</div>
            <button type="button" className={styles.changeBtn} onClick={() => setSelectedLead(null)}>
              Change
            </button>
          </div>
          {dep && !dep.complete && (
            <p className={styles.noMatch}>
              {ghs(dep.paid)} of {ghs(dep.target)} ({config?.allocationThresholdPct}% target) paid — {ghs(dep.remaining)} more needed before this client is eligible for allocation.
            </p>
          )}
          {alreadyAllocated && <p className={styles.noMatch}>{selectedLead.name} already has an allocated plot — check Already allocated below instead of sending a new request.</p>}
          <button type="button" className={styles.submitBtn} disabled={!dep?.complete || alreadyAllocated || create.isPending} onClick={submit}>
            {create.isPending ? 'Sending…' : 'Send request'}
          </button>
        </>
      )}
    </div>
  );
}

// Real bug found live while testing the suggestion engine's split-fallback
// (2026-09-07): this used useLeads() (listForAgent, scoped to the VIEWER's
// own leads), so a manager reviewing another agent's request always got
// lead=null here -- the suggestion engine then silently fell back to
// units=['Full Plot'], the wrong unit count/type for any request that
// wasn't the viewing manager's own. Same real payments_sel-style RLS
// reasoning as useAllLeads' own listForAgent/listAll call sites elsewhere
// (an agent calling the "unfiltered" query still only gets their own rows
// back, enforced server-side) -- switching this to useAllLeads() fixes
// management's view without narrowing what a regular agent already saw.
function RequestRow({ request, canAllocate }: { request: AllocationRequest; canAllocate: boolean }) {
  const profile = useSessionStore((s) => s.profile);
  const { data: leads } = useAllLeads();
  const [open, setOpen] = useState(false);
  const lead = (leads ?? []).find((l) => l.id === request.leadId) ?? null;

  const isOwnAgent = profile?.key === request.agentKey;

  return (
    <div className={styles.row}>
      <button type="button" className={styles.rowTop} style={{ width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }} onClick={() => setOpen((v) => !v)}>
        <span className={styles.avatar}>{initials(request.clientName)}</span>
        <div className={styles.rowMain}>
          <div className={styles.name}>{request.clientName}</div>
          <div className={styles.meta}>
            {request.agentName} &middot; {request.percentPaid ?? 0}% paid ({ghs(request.amtPaid ?? 0)} of {ghs(request.grandTotal ?? 0)})
          </div>
        </div>
        {request.status === 'Allocated' ? (
          <span className={styles.doneTag}>Plot {request.plotNumber}</span>
        ) : request.status === 'Awaiting Authorization' ? (
          <span className={styles.pendingTag}>Awaiting sign-off</span>
        ) : (
          <span className={styles.pendingTag}>Pending</span>
        )}
      </button>

      {request.flagReason && (
        <div className={styles.flagBanner}>
          ⚠ {request.flagReason} — flagged by {request.flaggedBy}
        </div>
      )}

      {open && (
        <div className={styles.detail}>
          {request.status === 'Pending' && request.flagReason && isOwnAgent && <FixResubmit request={request} />}
          {request.status === 'Pending' && request.flagReason && !isOwnAgent && <p className={styles.emptyMsg}>Waiting on {request.agentName} to fix and resubmit.</p>}
          {request.status === 'Pending' && !request.flagReason && canAllocate && <SuggestPanel request={request} lead={lead} />}
          {request.status === 'Awaiting Authorization' && canAllocate && <AwaitingPanel request={request} lead={lead} />}
          {request.status === 'Allocated' && canAllocate && <AllocatedPanel request={request} />}
        </div>
      )}
    </div>
  );
}

function SuggestPanel({ request, lead }: { request: AllocationRequest; lead: Lead | null }) {
  const navigate = useNavigate();
  const { data: plots } = usePlots();
  const { data: config } = useConfig();
  const suggest = useSuggestAllocationPlots();
  const flag = useFlagAllocation();
  const split = useSplitPlot();
  const [flagging, setFlagging] = useState(false);
  const [reason, setReason] = useState('Payment amount looks wrong');
  const [detail, setDetail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showPartials, setShowPartials] = useState(false);
  const [splitError, setSplitError] = useState<string | null>(null);
  // Real user ask: before searching inventory, ask which section(s) to
  // suggest from instead of always searching the whole company-wide
  // inventory. '' means "All sections" -- the previous, only behavior.
  const [section, setSection] = useState('');
  const [openCombo, setOpenCombo] = useState(0);

  const sections = Array.from(new Set((plots ?? []).map((p) => p.section).filter((s): s is string => !!s))).sort();

  const units = allocationUnitsNeeded(lead?.noPlots ?? 1);
  const multi = units.length > 1;
  const slotsPerCombo = units.length;

  const std = { fullWidthFt: config?.techFullPlotWidthFt ?? 70, fullLengthFt: config?.techFullPlotLengthFt ?? 100, halfWidthFt: config?.techHalfPlotWidthFt ?? 50, halfLengthFt: config?.techHalfPlotLengthFt ?? 70 };

  // Real client request: EVERY allocation now needs 3 complete
  // alternative combos (not 3 loose single plots, and not just 1 combo
  // for a multi-unit lead) before Management can sign off -- see
  // suggestionCombos.ts's own comment for the exact encoding this
  // produces/reads.
  const [combos, setCombos] = useState<string[][]>(() => emptyCombos(slotsPerCombo));
  const complete = combosAreComplete(combos, slotsPerCombo);
  const filledCount = combos.filter((c) => c.every((v) => v.trim())).length;

  function setSlot(comboIdx: number, slotIdx: number, plotNumber: string) {
    setCombos((prev) => prev.map((combo, ci) => (ci === comboIdx ? combo.map((v, si) => (si === slotIdx ? plotNumber : v)) : combo)));
  }

  // Real user scenario: a client who already holds one or more Partial
  // Plots (bought irregular fragments earlier) needing to know that
  // before suggesting more -- matched the same way Plot Inventory's own
  // owner-clustering does (client_name match), purely informational.
  const clientPartialHoldings = lead
    ? (plots ?? []).filter((p) => p.plotType === 'Partial Plot' && p.clientName && p.clientName.trim().toLowerCase() === lead.name.trim().toLowerCase())
    : [];

  function realAreaSqft(p: Plot): number {
    if (p.areaSqft != null) return p.areaSqft;
    return p.widthFt != null && p.lengthFt != null ? p.widthFt * p.lengthFt : 0;
  }
  // "Browse partial plots" targets whichever combo is currently open, its
  // own first still-empty slot -- same real min-area filtering already
  // fixed (a Half Plot slot only shows partials >= half a plot's area, a
  // Full Plot slot only shows partials >= a full plot's).
  const browseSlotIdx = (() => {
    const idx = combos[openCombo]?.findIndex((v) => !v.trim()) ?? -1;
    return idx === -1 ? 0 : idx;
  })();
  const browseUnit: PlotType = units[browseSlotIdx] ?? 'Full Plot';
  const baseAreaSqft = config ? techBaseAreaSqft(config) : 0;
  const halfAreaSqft = config ? techHalfAreaSqft(config) : 0;
  const minAreaForBrowse = browseUnit === 'Half Plot' ? halfAreaSqft : baseAreaSqft;
  const allAvailablePartials = (plots ?? []).filter((p) => p.plotType === 'Partial Plot' && p.status === 'Available');
  const availablePartials = allAvailablePartials.filter((p) => minAreaForBrowse <= 0 || realAreaSqft(p) >= minAreaForBrowse);
  const tooSmallCount = allAvailablePartials.length - availablePartials.length;

  // Splitting only lives in Plot Inventory today -- this is the same real
  // split_plot_for_half_sale RPC (via useSplitPlot), just reachable from
  // inside the flow that actually needs it: staff suggesting a Half Plot
  // for a client with no half currently Available, but a splittable Full
  // Plot on hand. The resulting half's own number auto-fills the slot so
  // there's no app-switch and no re-typing.
  async function splitAndFill(comboIdx: number, slotIdx: number, plotId: string) {
    setSplitError(null);
    try {
      const r = await split.mutateAsync(plotId);
      const half = r.plotA ?? r.plotB;
      if (half) setSlot(comboIdx, slotIdx, half.plotNumber);
    } catch (e) {
      setSplitError(friendlyError(e, 'Failed to split plot'));
    }
  }

  // Real client request: one click builds a genuine starting point for
  // all 3 required combos at once (each one different -- a plot already
  // used in an earlier combo is excluded from the next), which staff then
  // reviews/overrides slot by slot rather than typing 3 full combos from
  // nothing every time.
  function autoSuggestAll() {
    if (!plots) return;
    const sec = section || undefined;
    const used = new Set<string>();
    const next: string[][] = [];
    for (let c = 0; c < 3; c++) {
      const combo: string[] = [];
      for (const unit of units) {
        const best = candidatesForUnit(plots, unit, undefined, sec, used, std)[0] ?? null;
        combo.push(best?.plot.plotNumber ?? '');
        if (best) used.add(best.plot.id);
      }
      next.push(combo);
    }
    setCombos(next);
  }

  function fillFromBrowse(plotNumber: string) {
    setSlot(openCombo, browseSlotIdx, plotNumber);
  }

  async function submit() {
    setError(null);
    if (!complete) {
      setError(`All 3 suggestions need every unit filled in before Management can sign off — ${filledCount} of 3 complete.`);
      return;
    }
    try {
      await suggest.mutateAsync({ id: request.id, plotNumbers: [encodeSuggestionCombos(combos)] });
    } catch (e) {
      setError(friendlyError(e, 'Failed to suggest plots'));
    }
  }

  if (flagging) {
    return (
      <div className={styles.suggestForm}>
        <label className={styles.fieldLabel}>Reason</label>
        <select className={styles.input} value={reason} onChange={(e) => setReason(e.target.value)}>
          <option>Payment amount looks wrong</option>
          <option>Plot type or count mismatch</option>
          <option>Client details incomplete</option>
          <option>Other</option>
        </select>
        <input className={styles.input} placeholder="Details (optional)" value={detail} onChange={(e) => setDetail(e.target.value)} style={{ marginTop: 8 }} />
        <div className={styles.allocateActions} style={{ marginTop: 10 }}>
          <button
            type="button"
            className={styles.confirmBtn}
            disabled={flag.isPending}
            onClick={() => flag.mutateAsync({ id: request.id, reason: detail ? `${reason} — ${detail}` : reason }).then(() => setFlagging(false))}
          >
            {flag.isPending ? 'Sending…' : 'Send & flag'}
          </button>
          <button type="button" className={styles.cancelBtn} onClick={() => setFlagging(false)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.suggestForm}>
      <p className={styles.helpText}>
        {multi
          ? `This client is buying ${units.length} units (${units.join(' + ')}). Build 3 complete alternative combos below — Management picks one to sign off.`
          : 'Build 3 alternative candidate plots below — Management picks one to sign off.'}
      </p>
      {!multi && (
        <p className={styles.helpText} style={{ marginTop: -6 }}>
          Client buying more than one plot?{' '}
          <button type="button" className={styles.inlineLink} onClick={() => navigate(`/dashboard/pipeline/${request.leadId}`)}>
            Set the plot count on their lead →
          </button>{' '}
          — this panel will ask for one slot per unit automatically.
        </p>
      )}
      {sections.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <label className={styles.fieldLabel} htmlFor="allocation-suggest-section">
            Which section should Auto-suggest search?
          </label>
          <select id="allocation-suggest-section" className={styles.input} value={section} onChange={(e) => setSection(e.target.value)}>
            <option value="">All sections</option>
            {sections.map((s) => (
              <option key={s} value={s}>
                Block {s}
              </option>
            ))}
          </select>
        </div>
      )}
      {clientPartialHoldings.length > 0 && (
        <div className={styles.pickerList} style={{ marginBottom: 10, borderColor: 'var(--c-info)' }}>
          <p className={styles.noMatch} style={{ color: 'var(--c-info)', fontWeight: 700 }}>
            {lead?.name} already holds {clientPartialHoldings.length} partial plot{clientPartialHoldings.length === 1 ? '' : 's'} — worth checking before suggesting more:
          </p>
          {clientPartialHoldings.map((p) => (
            <div key={p.id} className={styles.pickerRow} style={{ cursor: 'default' }}>
              <div className={styles.pickerName}>{p.plotNumber} — Partial Plot</div>
              <div className={styles.pickerMeta}>{realAreaSqft(p) > 0 ? `${realAreaSqft(p).toLocaleString()} sq ft` : 'area not set'}</div>
            </div>
          ))}
        </div>
      )}

      <p className={`${styles.comboProgress} ${complete ? styles.comboProgressDone : ''}`}>
        {complete ? '✓ All 3 suggestions ready to send' : `${filledCount} of 3 suggestions complete`}
      </p>

      <div className={styles.allocateActions} style={{ marginBottom: 10 }}>
        <button type="button" className={styles.cancelBtn} onClick={autoSuggestAll}>
          ✨ Auto-fill all 3 from {section ? `Block ${section}` : 'inventory'}
        </button>
        <button type="button" className={styles.cancelBtn} onClick={() => setShowPartials((v) => !v)}>
          {showPartials ? 'Hide partial plots' : `Browse partial plots (≥ ${browseUnit} size)`}
        </button>
      </div>
      {showPartials && (
        <div className={styles.pickerList} style={{ marginTop: 0, marginBottom: 10 }}>
          <p className={styles.helpText} style={{ marginTop: 0 }}>
            Suggestion {openCombo + 1}, {browseUnit} slot — only showing Available Partial Plots at least that big
            {tooSmallCount > 0 ? ` (${tooSmallCount} smaller partial${tooSmallCount === 1 ? '' : 's'} hidden).` : '.'}
          </p>
          {availablePartials.length === 0 && <p className={styles.noMatch}>No Available Partial Plots big enough for a {browseUnit} right now.</p>}
          {availablePartials.map((p) => (
            <button key={p.id} type="button" className={styles.pickerRow} onClick={() => fillFromBrowse(p.plotNumber)}>
              <div className={styles.pickerName}>{p.plotNumber} — Partial Plot</div>
              <div className={styles.pickerMeta}>
                {realAreaSqft(p) > 0 ? `${realAreaSqft(p).toLocaleString()} sq ft · ` : ''}
                {p.price != null ? ghs(p.price) : 'price not set'}
              </div>
            </button>
          ))}
        </div>
      )}

      <div className={styles.comboList}>
        {combos.map((combo, comboIdx) => (
          <SuggestionComboCard
            key={comboIdx}
            comboIdx={comboIdx}
            combo={combo}
            units={units}
            plots={plots ?? []}
            isOpen={openCombo === comboIdx}
            onToggle={() => setOpenCombo((v) => (v === comboIdx ? -1 : comboIdx))}
            onSetSlot={(slotIdx, pn) => setSlot(comboIdx, slotIdx, pn)}
            onSplit={(slotIdx, plotId) => splitAndFill(comboIdx, slotIdx, plotId)}
            splitting={split.isPending}
            std={std}
          />
        ))}
      </div>

      {splitError && <p className={styles.errorMsg}>{splitError}</p>}
      {error && <p className={styles.errorMsg}>{error}</p>}
      <div className={styles.allocateActions}>
        <button type="button" className={styles.confirmBtn} disabled={suggest.isPending} onClick={submit}>
          {suggest.isPending ? 'Sending…' : complete ? 'Suggest all 3 →' : `Suggest all 3 → (${filledCount}/3 ready)`}
        </button>
        <button type="button" className={styles.cancelBtn} onClick={() => setFlagging(true)}>
          Flag an issue
        </button>
      </div>
    </div>
  );
}

// One of the 3 required alternative suggestions -- a complete combo (one
// plot per real unit the lead needs). Collapsible so all 3 don't have to
// be visually "crumpled together" at once (real user ask); each unit slot
// gets its own manual-entry input plus a live section/proximity picker.
function SuggestionComboCard({
  comboIdx,
  combo,
  units,
  plots,
  isOpen,
  onToggle,
  onSetSlot,
  onSplit,
  splitting,
  std,
}: {
  comboIdx: number;
  combo: string[];
  units: PlotType[];
  plots: Plot[];
  isOpen: boolean;
  onToggle: () => void;
  onSetSlot: (slotIdx: number, plotNumber: string) => void;
  onSplit: (slotIdx: number, plotId: string) => void;
  splitting: boolean;
  std: { fullWidthFt: number; fullLengthFt: number; halfWidthFt: number; halfLengthFt: number };
}) {
  const isComplete = combo.every((v) => v.trim());
  return (
    <div className={`${styles.comboCard} ${isComplete ? styles.comboCardComplete : ''}`}>
      <button type="button" className={styles.comboHead} onClick={onToggle}>
        <div className={styles.comboHeadLeft}>
          <span className={`${styles.comboBadge} ${isComplete ? styles.comboBadgeComplete : ''}`}>{isComplete ? '✓' : comboIdx + 1}</span>
          <div>
            <div className={styles.comboTitle}>Suggestion {comboIdx + 1}</div>
            <div className={styles.comboSummary}>{combo.some((v) => v.trim()) ? combo.filter(Boolean).join(' + ') || 'Not started' : 'Not started'}</div>
          </div>
        </div>
        <span className={`${styles.comboChevron} ${isOpen ? styles.comboChevronOpen : ''}`}>▾</span>
      </button>
      {isOpen && (
        <div className={styles.comboBody}>
          {units.map((unit, slotIdx) => (
            <SuggestionSlot
              key={slotIdx}
              unit={unit}
              value={combo[slotIdx] ?? ''}
              anchorPlotNumber={slotIdx > 0 ? combo[0] : null}
              excludePlotNumbers={combo.filter((_, si) => si !== slotIdx)}
              plots={plots}
              std={std}
              splitting={splitting}
              onChange={(pn) => onSetSlot(slotIdx, pn)}
              onSplit={(plotId) => onSplit(slotIdx, plotId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// One real unit's own slot within a combo -- manual entry (unchanged,
// still the fastest path once staff already know a plot number) plus a
// "Find a plot" live picker. For the 2nd+ unit in a combo, the picker
// leads with the real client-preference question -- near the plot already
// picked for this combo, or a separate location -- renamed from the
// original ask into professional, self-explanatory copy.
function SuggestionSlot({
  unit,
  value,
  anchorPlotNumber,
  excludePlotNumbers,
  plots,
  std,
  splitting,
  onChange,
  onSplit,
}: {
  unit: PlotType;
  value: string;
  anchorPlotNumber: string | null;
  // Real bug caught live: without this, a plot already picked for
  // another unit in the SAME combo (e.g. the Full Plot slot's own K27)
  // could show up again as a "split this" candidate for the Half Plot
  // slot right next to it -- the same plot can't fulfill two units in
  // one combo.
  excludePlotNumbers: string[];
  plots: Plot[];
  std: { fullWidthFt: number; fullLengthFt: number; halfWidthFt: number; halfLengthFt: number };
  splitting: boolean;
  onChange: (plotNumber: string) => void;
  onSplit: (plotId: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [mode, setMode] = useState<'near' | 'anywhere'>(anchorPlotNumber ? 'near' : 'anywhere');
  const [query, setQuery] = useState('');

  function statusFor(v: string): { color: string; text: string } | null {
    const pn = v.trim();
    if (!pn) return null;
    const p = plots.find((x) => x.plotNumber.toLowerCase() === pn.toLowerCase());
    if (!p) return { color: 'var(--c-muted)', text: 'Not found in inventory — check the plot number' };
    if (p.status === 'Allocated') return { color: 'var(--c-danger)', text: `✕ Already allocated${p.clientName ? ` to ${p.clientName}` : ''}` };
    if (p.status === 'Subdivided') return { color: 'var(--c-warn)', text: `Already split — pick ${p.plotNumber}a or ${p.plotNumber}b instead` };
    if (p.status === 'Running Search') return { color: 'var(--c-warn)', text: '⚠ Running search — confirm before offering this one' };
    return { color: 'var(--c-success)', text: '✓ Available' };
  }

  const st = statusFor(value);
  const candidate = plots.find((p) => p.plotNumber.toLowerCase() === value.trim().toLowerCase());
  const canSplitCandidate = !!candidate && candidate.plotType === 'Full Plot' && candidate.status === 'Available' && !candidate.parentPlotId && unit === 'Half Plot';

  const excludeIds = new Set(
    excludePlotNumbers
      .map((pn) => plots.find((p) => p.plotNumber.toLowerCase() === pn.trim().toLowerCase())?.id)
      .filter((id): id is string => !!id),
  );
  const results = mode === 'near' && anchorPlotNumber ? nearbyCandidates(plots, unit, anchorPlotNumber, excludeIds, std) : searchCandidates(plots, unit, query, excludeIds, std);

  return (
    <div className={styles.slotCard}>
      <div className={styles.slotHead}>
        <span className={styles.slotLabel}>{unit}</span>
        <button type="button" className={styles.slotFindBtn} onClick={() => setPickerOpen((v) => !v)}>
          {pickerOpen ? 'Close' : '🔍 Find a plot'}
        </button>
      </div>
      <input className={styles.input} placeholder="e.g. A12, or use Find a plot" value={value} onChange={(e) => onChange(e.target.value)} />
      {st && (
        <div className={styles.fieldHint} style={{ color: st.color }}>
          {st.text}
        </div>
      )}
      {canSplitCandidate && (
        <button type="button" className={styles.inlineLink} style={{ marginTop: 4 }} disabled={splitting} onClick={() => candidate && onSplit(candidate.id)}>
          {splitting ? 'Splitting…' : `Split ${candidate?.plotNumber} into two Half Plots, use the first half →`}
        </button>
      )}
      {pickerOpen && (
        <div className={styles.pickerBox}>
          {anchorPlotNumber && (
            <>
              <p className={styles.helpText} style={{ marginTop: 0 }}>
                Where should the client's {unit} be, relative to Plot {anchorPlotNumber}?
              </p>
              <div className={styles.modeChipRow}>
                <button type="button" className={`${styles.modeChip} ${mode === 'near' ? styles.modeChipOn : ''}`} onClick={() => setMode('near')}>
                  Adjacent to Plot {anchorPlotNumber}
                </button>
                <button type="button" className={`${styles.modeChip} ${mode === 'anywhere' ? styles.modeChipOn : ''}`} onClick={() => setMode('anywhere')}>
                  A separate location
                </button>
              </div>
            </>
          )}
          {mode === 'anywhere' && (
            <input
              className={styles.input}
              placeholder="Type a section (e.g. K, or K1 to narrow further)…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ marginBottom: 8 }}
            />
          )}
          <div className={styles.pickerList} style={{ marginTop: 0, maxHeight: 200 }}>
            {mode === 'anywhere' && !query.trim() && <p className={styles.noMatch}>Start typing a section above.</p>}
            {(mode === 'near' || query.trim()) && results.length === 0 && <p className={styles.noMatch}>No compatible Available plots found.</p>}
            {results.map((r) => (
              <button
                key={r.plot.id}
                type="button"
                className={styles.pickerRow}
                onClick={() => {
                  onChange(r.plot.plotNumber);
                  setPickerOpen(false);
                }}
              >
                <div className={styles.pickerName}>{r.plot.plotNumber}</div>
                <div className={styles.pickerMeta}>{r.reason}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FixResubmit({ request }: { request: AllocationRequest }) {
  const resolveFlag = useResolveAllocationFlag();
  return (
    <button type="button" className={styles.confirmBtn} disabled={resolveFlag.isPending} onClick={() => resolveFlag.mutate(request.id)}>
      {resolveFlag.isPending ? 'Notifying…' : "I've fixed this — notify for re-review"}
    </button>
  );
}

// Master Spec 7.5's physical sign-off gate: Management signs a printed
// authorization form, staff photograph the signed copy and attach it here.
// Soft gate (explicit user decision, see PHASE0_INVENTORY.md #39) -- a
// photo is required before Confirm is enabled, but the AI read below is
// informational only, never a hard block, so a Groq outage can never stop
// a real allocation.
function AuthDocGate({ request, plotsForDoc, combos }: { request: AllocationRequest; plotsForDoc: string; combos: string[][] }) {
  const profile = useSessionStore((s) => s.profile);
  const upload = useUploadAllocationAuthDoc();
  const analyze = useAnalyzeAllocationAuthDoc();
  const fileRef = useRef<HTMLInputElement>(null);

  async function generatePdf() {
    let logo: string | null = null;
    try {
      logo = await loadImageAsDataUri('/trulander-logo.png');
    } catch {
      // Missing/blocked logo shouldn't stop the form from generating.
    }
    const doc = buildAllocationAuthorizationPdf(request, combos, logo, profile?.name, profile?.signatureData);
    doc.save(allocationAuthFilename(request.clientName));
  }

  function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) upload.mutate({ id: request.id, file });
    e.target.value = '';
  }

  function runAnalysis() {
    if (!request.authDocPhotoPath) return;
    analyze.mutate({ id: request.id, path: request.authDocPhotoPath, clientName: request.clientName, plotNumber: plotsForDoc });
  }

  return (
    <div className={styles.authDocBox}>
      <div className={styles.authDocRow}>
        <button type="button" className={styles.changeBtn} onClick={generatePdf}>
          Generate authorization PDF
        </button>
        <button type="button" className={styles.changeBtn} onClick={() => fileRef.current?.click()} disabled={upload.isPending}>
          {upload.isPending ? 'Uploading…' : request.authDocPhotoPath ? 'Replace signed photo' : 'Attach signed photo'}
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFileChosen} />
        {request.authDocPhotoPath && (
          <button type="button" className={styles.changeBtn} onClick={runAnalysis} disabled={analyze.isPending}>
            {analyze.isPending ? 'Analyzing…' : 'Analyze with AI'}
          </button>
        )}
      </div>
      {!request.authDocPhotoPath && <p className={styles.errorMsg}>A photo of the signed authorization form is required before this can be confirmed.</p>}
      {request.authDocAiStatus && (
        <div
          className={`${styles.authDocBanner} ${
            request.authDocAiStatus === 'pass' ? styles.authDocBannerPass : request.authDocAiStatus === 'mismatch' ? styles.authDocBannerMismatch : styles.authDocBannerUnavailable
          }`}
        >
          {request.authDocAiStatus === 'pass' ? 'AI check passed' : request.authDocAiStatus === 'mismatch' ? 'AI flagged a possible mismatch' : 'AI check unavailable'}
          {request.authDocAiNote ? ` — ${request.authDocAiNote}` : ''}
        </div>
      )}
    </div>
  );
}

function AwaitingPanel({ request, lead }: { request: AllocationRequest; lead: Lead | null }) {
  const confirm = useConfirmAllocation();
  const sendBack = useSendBackAllocation();
  const [selectedCombo, setSelectedCombo] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sendingBack, setSendingBack] = useState(false);
  const [reason, setReason] = useState('');

  const units = allocationUnitsNeeded(lead?.noPlots ?? 1);
  // Decodes both the new 3-combo format and every real row saved before
  // this feature existed -- see suggestionCombos.ts's own comment for the
  // exact backward-compatibility rules.
  const combos = decodeSuggestionCombos(request.suggestedPlots, units.length);
  const multi = units.length > 1;

  async function doConfirm(plotNumber: string) {
    setError(null);
    try {
      await confirm.mutateAsync({
        id: request.id,
        plotNumber,
        note: 'Approved via signed authorization form',
        clientName: request.clientName,
        clientContact: lead?.contact,
      });
    } catch (e) {
      setError(friendlyError(e, 'Failed to confirm'));
    }
  }

  // Master Spec 7.5: "Management approves one suggestion or sends back
  // with reason." Reverts to Pending with the reason recorded on the
  // existing flag_reason field -- reopens the exact same "fix and
  // resubmit" panel staff already see for a suggestion-stage data problem.
  if (sendingBack) {
    return (
      <div className={styles.suggestForm}>
        <label className={styles.fieldLabel}>Why is this being sent back?</label>
        <textarea className={styles.input} placeholder="e.g. Client wants a corner plot, none of these three qualify" value={reason} onChange={(e) => setReason(e.target.value)} style={{ minHeight: 60 }} />
        {error && <p className={styles.errorMsg}>{error}</p>}
        <div className={styles.allocateActions} style={{ marginTop: 8 }}>
          <button
            type="button"
            className={styles.dangerBtn}
            disabled={!reason.trim() || sendBack.isPending}
            onClick={() => {
              setError(null);
              sendBack.mutateAsync({ id: request.id, reason: reason.trim() }).then(
                () => setSendingBack(false),
                (e) => setError(friendlyError(e, 'Failed to send back')),
              );
            }}
          >
            {sendBack.isPending ? 'Sending back…' : 'Send back to staff'}
          </button>
          <button type="button" className={styles.cancelBtn} onClick={() => setSendingBack(false)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const chosenCombo = selectedCombo != null ? combos[selectedCombo] : null;
  const plotsForDoc = chosenCombo ? chosenCombo.join(', ') : combos.map((c) => c.join('+')).join(' or ');

  return (
    <div className={styles.suggestForm}>
      <p className={styles.helpText}>
        {multi
          ? `This client is buying ${units.length} units. Pick which of the ${combos.length} suggested combos Management physically signed for.`
          : `Once Management has physically signed the authorization form, pick which of the ${combos.length} suggested plots they approved.`}
      </p>
      <div className={styles.comboList} style={{ marginBottom: 0 }}>
        {combos.map((combo, i) => (
          <label key={i} className={styles.optionRow} style={{ alignItems: 'flex-start' }}>
            <input type="radio" name={`al_${request.id}`} checked={selectedCombo === i} onChange={() => setSelectedCombo(i)} style={{ marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 700 }}>Suggestion {i + 1}</div>
              <div className={styles.fieldHint} style={{ color: 'var(--c-muted)', marginTop: 2 }}>
                {combo.map((pn, si) => `${pn}${units[si] ? ` (${units[si]})` : ''}`).join(' + ')}
              </div>
            </div>
          </label>
        ))}
      </div>
      <AuthDocGate request={request} plotsForDoc={plotsForDoc} combos={combos} />
      {error && <p className={styles.errorMsg}>{error}</p>}
      <div className={styles.allocateActions}>
        <button
          type="button"
          className={styles.confirmBtn}
          disabled={!chosenCombo || !request.authDocPhotoPath || confirm.isPending}
          onClick={() => chosenCombo && doConfirm(chosenCombo.join(','))}
        >
          {confirm.isPending ? 'Confirming…' : chosenCombo && chosenCombo.length > 1 ? `Confirm all ${chosenCombo.length} approved` : 'Confirm approved plot'}
        </button>
        <button type="button" className={styles.cancelBtn} onClick={() => setSendingBack(true)}>
          Send back
        </button>
      </div>
    </div>
  );
}

function AllocatedPanel({ request }: { request: AllocationRequest }) {
  const revert = useRevertAllocation();
  const editPlot = useEditAllocatedPlot();
  const remove = useDeleteAllocationRequest();
  const [editing, setEditing] = useState(false);
  const [newPlot, setNewPlot] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<'undo' | 'delete' | null>(null);

  if (confirming === 'undo') {
    return (
      <div className={styles.suggestForm}>
        <p className={styles.helpText}>Undo this allocation? Plot {request.plotNumber} goes back to Available and this request returns to Pending.</p>
        <div className={styles.allocateActions}>
          <button type="button" className={styles.dangerBtn} disabled={revert.isPending} onClick={() => revert.mutate(request.id)}>
            {revert.isPending ? 'Undoing…' : 'Yes, undo'}
          </button>
          <button type="button" className={styles.cancelBtn} onClick={() => setConfirming(null)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (confirming === 'delete') {
    return (
      <div className={styles.suggestForm}>
        <p className={styles.helpText}>
          Delete this allocation request entirely? {request.plotNumber ? `Plot ${request.plotNumber} goes back to Available. ` : ''}This cannot be undone.
        </p>
        <div className={styles.allocateActions}>
          <button type="button" className={styles.dangerBtn} disabled={remove.isPending} onClick={() => remove.mutate(request.id)}>
            {remove.isPending ? 'Deleting…' : 'Yes, delete'}
          </button>
          <button type="button" className={styles.cancelBtn} onClick={() => setConfirming(null)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.suggestForm}>
      <div className={styles.fieldHint}>Allocated by {request.allocatedBy}</div>
      {editing ? (
        <>
          <input className={styles.input} placeholder="New plot number" value={newPlot} onChange={(e) => setNewPlot(e.target.value)} style={{ marginTop: 8 }} />
          {error && <p className={styles.errorMsg}>{error}</p>}
          <div className={styles.allocateActions} style={{ marginTop: 8 }}>
            <button
              type="button"
              className={styles.confirmBtn}
              disabled={!newPlot.trim() || editPlot.isPending}
              onClick={() => {
                setError(null);
                editPlot.mutateAsync({ id: request.id, newPlotNumber: newPlot.trim() }).then(
                  () => setEditing(false),
                  (e) => setError(friendlyError(e, 'Failed to reassign')),
                );
              }}
            >
              {editPlot.isPending ? 'Saving…' : 'Save change'}
            </button>
            <button type="button" className={styles.cancelBtn} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <div className={styles.allocateActions} style={{ marginTop: 8, flexWrap: 'wrap' }}>
          <button type="button" className={styles.cancelBtn} onClick={() => setEditing(true)}>
            Edit allocated plot
          </button>
          <button type="button" className={styles.cancelBtn} onClick={() => setConfirming('undo')}>
            Undo → Pending
          </button>
          <button type="button" className={styles.dangerBtn} onClick={() => setConfirming('delete')}>
            Delete
          </button>
        </div>
      )}
    </div>
  );
}