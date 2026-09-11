"use client";

import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ghs } from '../../../shared/lib/format';
import { friendlyError } from '../../../shared/lib/friendlyError';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useLeads } from '../../pipeline/hooks/useLeads';
import { useAllLeads } from '../../payments/hooks/useLogPayment';
import { usePayments } from '../../pipeline/hooks/usePayments';
import { usePlots, useSplitPlot } from '../../plots/hooks/usePlots';
import { allocationUnitsNeeded, computeDepositStatus } from '../../pipeline/lib/pipelineLogic';
import { suggestAlternatives, suggestSet } from '../lib/suggestionEngine';
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
  const [values, setValues] = useState<string[]>(['', '', '']);
  const [reasons, setReasons] = useState<Record<number, string>>({});
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

  const sections = Array.from(new Set((plots ?? []).map((p) => p.section).filter((s): s is string => !!s))).sort();

  const units = allocationUnitsNeeded(lead?.noPlots ?? 1);
  const multi = units.length > 1;
  const slots = multi ? units.length : 3;

  const std = { fullWidthFt: config?.techFullPlotWidthFt ?? 70, fullLengthFt: config?.techFullPlotLengthFt ?? 100, halfWidthFt: config?.techHalfPlotWidthFt ?? 50, halfLengthFt: config?.techHalfPlotLengthFt ?? 70 };

  // Master Spec 7.4 only defines units for Full/Half Plot -- a Partial
  // Plot (real classification, see PlotClassification in types/domain.ts)
  // has no fixed full-plot-equivalence, so it can never be auto-suggested
  // by units[]. This is the manual override path: browse real Available
  // Partial Plots directly and drop one into whichever slot is open.
  //
  // Real user complaint fixed here: this used to show every single
  // Available Partial Plot regardless of size, so a fragment far smaller
  // than what the open slot actually needs (e.g. a sliver nowhere near
  // half a plot) showed up next to genuinely usable ones -- confusing,
  // not "self-explanatory". Now scoped to whichever slot is actually
  // open: only partials whose real area (areaSqft, falling back to
  // widthFt*lengthFt) is AT LEAST that unit's standard area -- a Half
  // Plot slot only shows partials >= half a plot's area, a Full Plot slot
  // only shows partials >= a full plot's area. Nothing here caps how much
  // BIGGER than needed a partial can be -- only excludes ones too small
  // to plausibly satisfy the slot at all.
  const openSlotIdx = (() => {
    const idx = values.findIndex((x, i) => i < slots && !x.trim());
    return idx === -1 ? slots - 1 : idx;
  })();
  const neededUnit: PlotType = multi ? (units[openSlotIdx] ?? 'Full Plot') : (lead?.plotType ?? 'Full Plot');
  const baseAreaSqft = config ? techBaseAreaSqft(config) : 0;
  const halfAreaSqft = config ? techHalfAreaSqft(config) : 0;
  const minAreaForSlot = neededUnit === 'Half Plot' ? halfAreaSqft : baseAreaSqft;
  function realAreaSqft(p: Plot): number {
    if (p.areaSqft != null) return p.areaSqft;
    return p.widthFt != null && p.lengthFt != null ? p.widthFt * p.lengthFt : 0;
  }
  const allAvailablePartials = (plots ?? []).filter((p) => p.plotType === 'Partial Plot' && p.status === 'Available');
  const availablePartials = allAvailablePartials.filter((p) => minAreaForSlot <= 0 || realAreaSqft(p) >= minAreaForSlot);
  const tooSmallCount = allAvailablePartials.length - availablePartials.length;

  // Real user scenario: a client who already holds one or more Partial
  // Plots (bought irregular fragments earlier) needing to know that
  // before suggesting more -- matched the same way Plot Inventory's own
  // owner-clustering does (client_name match), purely informational, not
  // fillable into a slot the way the list above is.
  const clientPartialHoldings = lead
    ? (plots ?? []).filter((p) => p.plotType === 'Partial Plot' && p.clientName && p.clientName.trim().toLowerCase() === lead.name.trim().toLowerCase())
    : [];

  function fillSlot(plotNumber: string) {
    setValues((v) => {
      const openIdx = v.findIndex((x, i) => i < slots && !x.trim());
      const targetIdx = openIdx === -1 ? slots - 1 : openIdx;
      return v.map((x, i) => (i === targetIdx ? plotNumber : x));
    });
    setReasons((r) => {
      const openIdx = values.findIndex((x, i) => i < slots && !x.trim());
      const targetIdx = openIdx === -1 ? slots - 1 : openIdx;
      const next = { ...r };
      delete next[targetIdx];
      return next;
    });
  }

  // Splitting only lives in Plot Inventory today -- this is the same real
  // split_plot_for_half_sale RPC (via useSplitPlot), just reachable from
  // inside the flow that actually needs it: staff suggesting a Half Plot
  // for a client with no half currently Available, but a splittable Full
  // Plot on hand. The resulting half's own number auto-fills the slot so
  // there's no app-switch and no re-typing.
  async function splitAndFill(slotIndex: number, plotId: string) {
    setSplitError(null);
    try {
      const r = await split.mutateAsync(plotId);
      const half = r.plotA ?? r.plotB;
      if (half) {
        setValues((v) => v.map((x, i) => (i === slotIndex ? half.plotNumber : x)));
        setReasons((rs) => {
          const next = { ...rs };
          delete next[slotIndex];
          return next;
        });
      }
    } catch (e) {
      setSplitError(friendlyError(e, 'Failed to split plot'));
    }
  }

  // Master Spec 7.4's suggestion engine (features/allocations/lib/
  // suggestionEngine.ts) -- pre-fills the same editable slots below rather
  // than replacing them, since staff/Management still need to override a
  // bad auto-pick (a plot the system doesn't know is physically
  // compromised, say). Multi-unit gets one complete set; single-unit gets
  // up to 3 ranked alternatives, matching the two real UI shapes already here.
  function autoSuggest() {
    if (!plots) return;
    const nextReasons: Record<number, string> = {};
    const site = undefined;
    const sec = section || undefined;
    if (multi) {
      const set = suggestSet(plots, units, std, site, sec);
      setValues((v) => v.map((_, i) => set[i]?.plot.plotNumber ?? ''));
      set.forEach((s, i) => {
        if (s) nextReasons[i] = s.reason;
      });
    } else {
      const alts = suggestAlternatives(plots, lead?.plotType ?? 'Full Plot', std, site, sec);
      setValues((v) => v.map((_, i) => alts[i]?.plot.plotNumber ?? ''));
      alts.forEach((s, i) => {
        nextReasons[i] = s.reason;
      });
    }
    setReasons(nextReasons);
  }

  function statusFor(v: string): { color: string; text: string } | null {
    const pn = v.trim();
    if (!pn) return null;
    const p = (plots ?? []).find((x) => x.plotNumber.toLowerCase() === pn.toLowerCase());
    if (!p) return { color: 'var(--c-muted)', text: 'Not found in inventory — check the plot number' };
    if (p.status === 'Allocated') return { color: 'var(--c-danger)', text: `✕ Already allocated${p.clientName ? ` to ${p.clientName}` : ''}` };
    if (p.status === 'Subdivided') return { color: 'var(--c-warn)', text: `This plot has already been split — pick ${p.plotNumber}a or ${p.plotNumber}b instead` };
    if (p.status === 'Running Search') return { color: 'var(--c-warn)', text: '⚠ Running search — confirm before offering this one' };
    return { color: 'var(--c-success)', text: '✓ Available' };
  }

  async function submit() {
    setError(null);
    const plotNumbers = values.slice(0, slots).map((v) => v.trim()).filter(Boolean);
    if (multi && plotNumbers.length < units.length) {
      setError(`This client needs ${units.length} plot(s) — fill in all ${units.length} required unit${units.length === 1 ? '' : 's'} before continuing.`);
      return;
    }
    if (!multi && plotNumbers.length === 0) {
      setError('Enter at least one candidate plot');
      return;
    }
    try {
      await suggest.mutateAsync({ id: request.id, plotNumbers });
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
          ? `This client is buying ${units.length} units (${units.join(' + ')}). Suggest exactly one plot per unit — all are required together, not alternatives.`
          : 'Suggest up to 3 candidate plots. Management signs off physically before anything is allocated.'}
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
            Which section should the AI suggest from?
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
      <div className={styles.allocateActions} style={{ marginBottom: 10 }}>
        <button type="button" className={styles.cancelBtn} onClick={autoSuggest}>
          ✨ Auto-suggest from {section ? `Block ${section}` : 'inventory'}
        </button>
        <button type="button" className={styles.cancelBtn} onClick={() => setShowPartials((v) => !v)}>
          {showPartials ? 'Hide partial plots' : `Browse partial plots (≥ ${neededUnit} size)`}
        </button>
      </div>
      {showPartials && (
        <div className={styles.pickerList} style={{ marginTop: 0, marginBottom: 10 }}>
          <p className={styles.helpText} style={{ marginTop: 0 }}>
            Slot {openSlotIdx + 1} needs a {neededUnit} — only showing Available Partial Plots at least that big
            {tooSmallCount > 0 ? ` (${tooSmallCount} smaller partial${tooSmallCount === 1 ? '' : 's'} hidden).` : '.'}
          </p>
          {availablePartials.length === 0 && <p className={styles.noMatch}>No Available Partial Plots big enough for a {neededUnit} right now.</p>}
          {availablePartials.map((p) => (
            <button key={p.id} type="button" className={styles.pickerRow} onClick={() => fillSlot(p.plotNumber)}>
              <div className={styles.pickerName}>{p.plotNumber} — Partial Plot</div>
              <div className={styles.pickerMeta}>
                {realAreaSqft(p) > 0 ? `${realAreaSqft(p).toLocaleString()} sq ft · ` : ''}
                {p.price != null ? ghs(p.price) : 'price not set'}
              </div>
            </button>
          ))}
        </div>
      )}
      {Array.from({ length: slots }).map((_, i) => {
        const st = statusFor(values[i]);
        const candidate = (plots ?? []).find((p) => p.plotNumber.toLowerCase() === values[i].trim().toLowerCase());
        const canSplitCandidate = !!candidate && candidate.plotType === 'Full Plot' && candidate.status === 'Available' && !candidate.parentPlotId;
        return (
          <div key={i} style={{ marginBottom: 8 }}>
            <input
              className={styles.input}
              placeholder={multi ? `${units[i]} ${i + 1}` : i === 0 ? 'e.g. A12' : 'optional'}
              value={values[i]}
              onChange={(e) => {
                const val = e.target.value;
                setValues((v) => v.map((x, idx) => (idx === i ? val : x)));
                setReasons((r) => ({ ...r, [i]: '' }));
              }}
            />
            {reasons[i] && (
              <div className={styles.fieldHint} style={{ color: 'var(--c-muted)' }}>
                {reasons[i]}
              </div>
            )}
            {st && (
              <div className={styles.fieldHint} style={{ color: st.color }}>
                {st.text}
              </div>
            )}
            {canSplitCandidate && (multi ? units[i] === 'Half Plot' : true) && (
              <button type="button" className={styles.inlineLink} style={{ marginTop: 4 }} disabled={split.isPending} onClick={() => splitAndFill(i, candidate.id)}>
                {split.isPending ? 'Splitting…' : `Split ${candidate.plotNumber} into two Half Plots, use the first half →`}
              </button>
            )}
          </div>
        );
      })}
      {splitError && <p className={styles.errorMsg}>{splitError}</p>}
      {error && <p className={styles.errorMsg}>{error}</p>}
      <div className={styles.allocateActions}>
        <button type="button" className={styles.confirmBtn} disabled={suggest.isPending} onClick={submit}>
          {suggest.isPending ? 'Sending…' : 'Suggest plots →'}
        </button>
        <button type="button" className={styles.cancelBtn} onClick={() => setFlagging(true)}>
          Flag an issue
        </button>
      </div>
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
function AuthDocGate({ request, plotsForDoc }: { request: AllocationRequest; plotsForDoc: string }) {
  const { data: config } = useConfig();
  const upload = useUploadAllocationAuthDoc();
  const analyze = useAnalyzeAllocationAuthDoc();
  const fileRef = useRef<HTMLInputElement>(null);

  function generatePdf() {
    const doc = buildAllocationAuthorizationPdf({ ...request, plotNumber: request.plotNumber ?? plotsForDoc }, config?.quoteCompanyName);
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
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sendingBack, setSendingBack] = useState(false);
  const [reason, setReason] = useState('');

  const plots = (request.suggestedPlots ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const units = allocationUnitsNeeded(lead?.noPlots ?? 1);
  const multi = units.length > 1 && plots.length === units.length;

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

  if (multi) {
    return (
      <div className={styles.suggestForm}>
        <p className={styles.helpText}>This client is buying {units.length} units — once Management has physically signed the authorization for all of them, confirm together.</p>
        {plots.map((pn, i) => (
          <div key={pn} className={styles.optionRow}>
            <span style={{ fontWeight: 700 }}>Plot {pn}</span> <span className={styles.fieldHint}>({units[i] ?? ''})</span>
          </div>
        ))}
        <AuthDocGate request={request} plotsForDoc={plots.join(', ')} />
        {error && <p className={styles.errorMsg}>{error}</p>}
        <div className={styles.allocateActions}>
          <button type="button" className={styles.confirmBtn} disabled={!request.authDocPhotoPath || confirm.isPending} onClick={() => doConfirm(plots.join(','))}>
            {confirm.isPending ? 'Confirming…' : `Confirm all ${plots.length} approved`}
          </button>
          <button type="button" className={styles.cancelBtn} onClick={() => setSendingBack(true)}>
            Send back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.suggestForm}>
      <p className={styles.helpText}>Once Management has physically signed the authorization form, pick the plot they approved.</p>
      {plots.map((pn) => (
        <label key={pn} className={styles.optionRow}>
          <input type="radio" name={`al_${request.id}`} checked={selected === pn} onChange={() => setSelected(pn)} /> <span style={{ fontWeight: 700 }}>Plot {pn}</span>
        </label>
      ))}
      <AuthDocGate request={request} plotsForDoc={selected ?? plots.join(' or ')} />
      {error && <p className={styles.errorMsg}>{error}</p>}
      <div className={styles.allocateActions}>
        <button type="button" className={styles.confirmBtn} disabled={!selected || !request.authDocPhotoPath || confirm.isPending} onClick={() => selected && doConfirm(selected)}>
          {confirm.isPending ? 'Confirming…' : 'Confirm approved plot'}
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