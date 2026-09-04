import { useState } from 'react';
import { ghs } from '../../../shared/lib/format';
import { friendlyError } from '../../../shared/lib/friendlyError';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useLeads } from '../../pipeline/hooks/useLeads';
import { usePlots } from '../../plots/hooks/usePlots';
import { allocationUnitsNeeded } from '../../pipeline/lib/pipelineLogic';
import { suggestAlternatives, suggestSet } from '../lib/suggestionEngine';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import {
  useAllocationRequests,
  useCanAllocatePlots,
  useConfirmAllocation,
  useCreateAllocationRequest,
  useDeleteAllocationRequest,
  useEditAllocatedPlot,
  useFlagAllocation,
  useResolveAllocationFlag,
  useRevertAllocation,
  useSuggestAllocationPlots,
} from '../hooks/useAllocationRequests';
import type { AllocationRequest, Lead } from '../../../types/domain';
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

  const pending = (requests ?? []).filter((r) => r.status === 'Pending').sort((a, b) => (b.percentPaid ?? 0) - (a.percentPaid ?? 0));
  const awaiting = (requests ?? []).filter((r) => r.status === 'Awaiting Authorization').sort((a, b) => (b.percentPaid ?? 0) - (a.percentPaid ?? 0));
  const allocated = (requests ?? []).filter((r) => r.status === 'Allocated').sort((a, b) => b.createdAt.localeCompare(a.createdAt));

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

function NewRequestForm({ onDone }: { onDone: () => void }) {
  const { data: leads } = useLeads();
  const create = useCreateAllocationRequest();
  const [query, setQuery] = useState('');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  const q = query.trim().toLowerCase();
  const matches = q ? (leads ?? []).filter((l) => l.name.toLowerCase().includes(q) || l.contact.includes(q)).slice(0, 8) : [];

  async function submit() {
    if (!selectedLead) return;
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
          <button type="button" className={styles.submitBtn} disabled={create.isPending} onClick={submit}>
            {create.isPending ? 'Sending…' : 'Send request'}
          </button>
        </>
      )}
    </div>
  );
}

function RequestRow({ request, canAllocate }: { request: AllocationRequest; canAllocate: boolean }) {
  const profile = useSessionStore((s) => s.profile);
  const { data: leads } = useLeads();
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
  const { data: plots } = usePlots();
  const { data: config } = useConfig();
  const suggest = useSuggestAllocationPlots();
  const flag = useFlagAllocation();
  const [values, setValues] = useState<string[]>(['', '', '']);
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const [flagging, setFlagging] = useState(false);
  const [reason, setReason] = useState('Payment amount looks wrong');
  const [detail, setDetail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const units = allocationUnitsNeeded(lead?.plotType ?? 'Full Plot', lead?.noPlots ?? 1);
  const multi = units.length > 1;
  const slots = multi ? units.length : 3;

  const std = { fullWidthFt: config?.techFullPlotWidthFt ?? 70, fullLengthFt: config?.techFullPlotLengthFt ?? 100, halfWidthFt: config?.techHalfPlotWidthFt ?? 50, halfLengthFt: config?.techHalfPlotLengthFt ?? 70 };

  // Master Spec 7.4's suggestion engine (features/allocations/lib/
  // suggestionEngine.ts) -- pre-fills the same editable slots below rather
  // than replacing them, since staff/Management still need to override a
  // bad auto-pick (a plot the system doesn't know is physically
  // compromised, say). Multi-unit gets one complete set; single-unit gets
  // up to 3 ranked alternatives, matching the two real UI shapes already here.
  function autoSuggest() {
    if (!plots) return;
    const nextReasons: Record<number, string> = {};
    if (multi) {
      const set = suggestSet(plots, units, std);
      setValues((v) => v.map((_, i) => set[i]?.plot.plotNumber ?? ''));
      set.forEach((s, i) => {
        if (s) nextReasons[i] = s.reason;
      });
    } else {
      const alts = suggestAlternatives(plots, lead?.plotType ?? 'Full Plot', std);
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
      <button type="button" className={styles.cancelBtn} style={{ marginBottom: 10 }} onClick={autoSuggest}>
        ✨ Auto-suggest from inventory
      </button>
      {Array.from({ length: slots }).map((_, i) => {
        const st = statusFor(values[i]);
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
          </div>
        );
      })}
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

function AwaitingPanel({ request, lead }: { request: AllocationRequest; lead: Lead | null }) {
  const confirm = useConfirmAllocation();
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const plots = (request.suggestedPlots ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const units = allocationUnitsNeeded(lead?.plotType ?? 'Full Plot', lead?.noPlots ?? 1);
  const multi = units.length > 1 && plots.length === units.length;

  async function doConfirm(plotNumber: string) {
    setError(null);
    try {
      await confirm.mutateAsync({ id: request.id, plotNumber, note: 'Approved via signed authorization form' });
    } catch (e) {
      setError(friendlyError(e, 'Failed to confirm'));
    }
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
        {error && <p className={styles.errorMsg}>{error}</p>}
        <button type="button" className={styles.confirmBtn} disabled={confirm.isPending} onClick={() => doConfirm(plots.join(','))}>
          {confirm.isPending ? 'Confirming…' : `Confirm all ${plots.length} approved`}
        </button>
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
      {error && <p className={styles.errorMsg}>{error}</p>}
      <button type="button" className={styles.confirmBtn} disabled={!selected || confirm.isPending} onClick={() => selected && doConfirm(selected)}>
        {confirm.isPending ? 'Confirming…' : 'Confirm approved plot'}
      </button>
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
