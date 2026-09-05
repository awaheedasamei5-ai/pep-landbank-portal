import { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useSessionStore } from '../../../auth/useSessionStore';
import { ghs, today } from '../../../shared/lib/format';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { useCanLogPayments, useCreatePayment } from '../../payments/hooks/useLogPayment';
import { useDownloadReceipt, useIssueReceiptLink } from '../../payments/hooks/useReceipt';
import { usePlots, useUpdatePlot } from '../../plots/hooks/usePlots';
import { useAllocationRequests, useCreateAllocationRequest } from '../../allocations/hooks/useAllocationRequests';
import type { Lead, Payment } from '../../../types/domain';
import { computeDepositStatus, computeMonthlySchedule, previewGrandTotal, qtyOfType } from '../lib/pipelineLogic';
import { friendlyError } from '../../../shared/lib/friendlyError';
import { StageBadge } from '../components/StageBadge';
import { PartialPlotAdder } from '../components/PartialPlotAdder';
import { useActivityForLead, useAssignLead, useAuditForLead, useCanViewDocStage, useDeleteLead, useLead, useLogActivity, useSiteVisitsForLead, useUpdateLead, useUpdateLeadDocStage } from '../hooks/useLead';
import { usePayments } from '../hooks/usePayments';
import { useFollowUpDraft } from '../hooks/useFollowUpDraft';
import { useStaffDirectory } from '../../memos/hooks/useMemos';
import styles from './PipelineDetailScreen.module.css';

const PRIORITIES = ['High', 'Medium', 'Low'] as const;

const DOC_STAGES = [
  { key: 'allocation', label: 'Allocation' },
  { key: 'picking', label: 'Picking' },
  { key: 'site_plan', label: 'Preparation of site plan' },
  { key: 'indentures', label: 'Preparation of indentures' },
  { key: 'court_stamping', label: 'Ready for court stamping' },
  { key: 'ready_pickup', label: 'Documents ready for pickup' },
];


function initialsOf(name: string): string {
  return name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

// Full port of formUpdate()'s accordion (index.html:14285-14410) -- client
// info, plot & pricing (with live recalc via computeLeadQuotationTotals),
// deposit & installment schedule, follow-up fields, documentation stage,
// payment history + log payment (already shipped), and a danger zone that
// vacates any allocated plot on a refund/opt-out delete. Contract-of-sale
// is deliberately not duplicated here -- it already has its own full
// screen (features/contracts), this would just be a redundant shortcut.
// The month-by-month payment-schedule sub-screen and per-payment edit/
// delete are deliberately deferred -- separable, lower-frequency pieces,
// same scoping discipline used throughout this session's other gap fixes.
export function PipelineDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const profile = useSessionStore((s) => s.profile);
  // Real bug the user caught live: Master Pipeline (PipelineListScreen in
  // its company-wide mode) drills into this same shared detail screen,
  // but every close/back/delete-redirect here was hardcoded back to the
  // agent-scoped /app/sales/pipeline list -- which for a manager shows few
  // or no real leads. A manager who got here from Master Pipeline needs
  // Close/Back to return there, not strand them on an empty list. Now
  // route-derived (three real entry points share this one detail screen:
  // My Pipeline, Master Pipeline, Company Leads) rather than just
  // role-derived -- a manager can open a lead from any of the three, and
  // a non-manager with Company Leads access (elias/emmanuel/elizabeth)
  // needs Company Leads' own path back too, which the old role-only
  // logic could never produce.
  const backTo = location.pathname.startsWith('/app/mgr/pipeline')
    ? '/app/mgr/pipeline'
    : location.pathname.startsWith('/app/sales/company-leads')
      ? '/app/sales/company-leads'
      : '/app/sales/pipeline';
  const canLog = useCanLogPayments();
  const { data: lead, isLoading } = useLead(id ?? '');
  const { data: payments } = usePayments(id ?? '');
  const { data: config } = useConfig();
  const createPayment = useCreatePayment();
  const downloadReceipt = useDownloadReceipt();
  const issueLink = useIssueReceiptLink();
  const [amount, setAmount] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (isLoading) return <div className={styles.wrap}>Loading…</div>;
  if (!lead) return <div className={styles.wrap}>Lead not found.</div>;

  async function shareReceipt(payment: Payment) {
    const link = await issueLink.mutateAsync({ payment, lead: lead ?? null });
    await navigator.clipboard.writeText(link).catch(() => {});
    setCopiedId(payment.id);
    setTimeout(() => setCopiedId((cur) => (cur === payment.id ? null : cur)), 2500);
  }

  const balance = Math.max(lead.grandTotal - lead.amtPaid, 0);
  const leadPayments = (payments ?? []).filter((p) => p.leadId === lead.id).sort((a, b) => b.date.localeCompare(a.date));
  const initials = initialsOf(lead.name);

  async function submitPayment(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(amount);
    if (!n || n <= 0 || !id) return;
    await createPayment.mutateAsync({ input: { leadId: id, amount: n }, leadName: lead!.name, leadAgentKey: lead!.agent });
    setAmount('');
  }

  const pctCollected = lead.grandTotal > 0 ? Math.min(100, Math.round((lead.amtPaid / lead.grandTotal) * 100)) : 0;
  const quickAmounts = [
    { label: '25%', value: Math.round(balance * 0.25) },
    { label: '50%', value: Math.round(balance * 0.5) },
    { label: 'Full balance', value: balance },
  ].filter((q) => q.value > 0);

  // Premium UI Rebuild spec, Section 6.C/13: "Use a drawer/detail panel
  // for lead inspection on desktop... Details: Side drawer" (vs. mobile's
  // own "Bottom sheet/full-screen"). Route/component are unchanged (no
  // renamed URLs, no restructured data fetching) -- only the desktop
  // presentation differs: a fixed right-anchored panel, non-modal (see
  // the CSS file's own comment for why there's no dimming backdrop) --
  // the list stays visible and usable to its left, closed via the
  // explicit button below rather than a click-outside backdrop. Below
  // 1024px, drawerBackdrop/drawerPanel are inert wrappers (see their own
  // CSS) -- this renders byte-for-byte the same as before.
  return (
    <div className={styles.drawerBackdrop}>
      <div className={styles.drawerPanel}>
        <button type="button" className={styles.closeDrawerBtn} onClick={() => navigate(backTo)} aria-label="Close" title="Close">
          ✕
        </button>
        <div className={styles.wrap}>
          <div className={styles.head}>
        <div className={styles.avatar}>{initials}</div>
        <div>
          <div className={styles.eyebrow}>Updating</div>
          <h1 className={styles.name}>{lead.name}</h1>
          <p className={styles.meta}>
            {lead.contact} · {lead.plotType}
            {qtyOfType(lead.plotType, lead.noPlots) > 1 ? ` ×${qtyOfType(lead.plotType, lead.noPlots)}` : ''} · <StageBadge stage={lead.stage} />
          </p>
        </div>
      </div>

      <div className={styles.balanceCard}>
        <div className={styles.balanceTop}>
          <div>
            <div className={styles.balanceLabel}>Balance remaining</div>
            <div className={styles.balanceValue}>{ghs(balance)}</div>
          </div>
          <div className={styles.balancePct}>{pctCollected}%</div>
        </div>
        <div className={styles.balanceTrack}>
          <div className={styles.balanceFill} style={{ width: `${pctCollected}%` }} />
        </div>
        <div className={styles.balanceFootRow}>
          <div>
            <div className={styles.balanceFootVal}>{ghs(lead.grandTotal)}</div>
            <div className={styles.balanceFootLbl}>Pipeline value</div>
          </div>
          <div>
            <div className={styles.balanceFootVal}>{ghs(lead.amtPaid)}</div>
            <div className={styles.balanceFootLbl}>Collected</div>
          </div>
        </div>
      </div>

      <ClientSection lead={lead} />
      <LeadDetailsSection lead={lead} />
      {config && <PlotPricingSection lead={lead} config={config} />}
      {config && <DepositScheduleSection lead={lead} config={config} payments={leadPayments} />}
      {config && <AllocationEligibilitySection lead={lead} config={config} payments={leadPayments} />}
      <FollowUpSection lead={lead} />

      {canLog && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Log a payment</h2>
          <form onSubmit={submitPayment}>
            {quickAmounts.length > 0 && (
              <div className={styles.quickRow}>
                {quickAmounts.map((q) => (
                  <button type="button" key={q.label} className={styles.quickChip} onClick={() => setAmount(String(q.value))}>
                    {q.label} <span className={styles.quickChipAmt}>{ghs(q.value)}</span>
                  </button>
                ))}
              </div>
            )}
            <div className={styles.field}>
              <label className={styles.label}>Amount (GHS)</label>
              <input className={styles.input} type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
            </div>
            <button type="submit" className={styles.btn} disabled={createPayment.isPending || !amount}>
              {createPayment.isPending ? 'Saving…' : 'Save payment'}
            </button>
            {profile?.role !== 'manager' && <p className={styles.hint}>This will be sent to Management for approval before it reflects on the balance.</p>}
          </form>
        </div>
      )}

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Payment history</h2>
        <div className={styles.history}>
          {leadPayments.length === 0 && <p className={styles.emptyMsg}>No individual payments logged yet — only a starting total.</p>}
          {leadPayments.map((p) => {
            const status = p.status ?? 'approved';
            const isApproved = status === 'approved';
            return (
              <div className={styles.historyRow} key={p.id}>
                <div className={styles.historyMain}>
                  <div className={styles.historyDate}>{p.date}</div>
                  <span className={`${styles.statusPill} ${styles[`status_${status}`]}`}>{status === 'approved' ? 'Successful' : status === 'pending' ? 'Awaiting approval' : 'Declined'}</span>
                </div>
                <div className={styles.historyRight}>
                  {isApproved && (
                    <button type="button" className={styles.receiptBtn} onClick={() => downloadReceipt.mutate({ payment: p, lead })} disabled={downloadReceipt.isPending} title="Download receipt">
                      ⬇
                    </button>
                  )}
                  {isApproved && (
                    <button
                      type="button"
                      className={styles.receiptBtn}
                      onClick={() => shareReceipt(p)}
                      disabled={issueLink.isPending}
                      title="Copy a link the client can open to view their receipt"
                    >
                      {copiedId === p.id ? '✓' : '🔗'}
                    </button>
                  )}
                  <span className={`${styles.historyAmt} ${!isApproved ? styles.historyAmtMuted : ''}`}>+{ghs(p.amount)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <SiteVisitsSection lead={lead} />
      <ActivitySection leadId={lead.id} />
      <AuditTrailSection leadId={lead.id} paymentIds={leadPayments.map((p) => p.id)} />

      <DocumentationSection lead={lead} />
      <DangerZoneSection lead={lead} onDeleted={() => navigate(backTo)} />

          <button type="button" className={styles.backBtn} onClick={() => navigate(backTo)}>
            ← Back
          </button>
        </div>
      </div>
    </div>
  );
}

function ClientSection({ lead }: { lead: Lead }) {
  const update = useUpdateLead();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(lead.name);
  const [contact, setContact] = useState(lead.contact);
  const [error, setError] = useState<string | null>(null);

  if (!editing) {
    return (
      <div className={styles.section}>
        <div className={styles.sectionHeadRow}>
          <h2 className={styles.sectionTitle}>Client</h2>
          <button type="button" className={styles.editLink} onClick={() => setEditing(true)}>
            Edit
          </button>
        </div>
        <div className={styles.readRow}>
          <span className={styles.readLabel}>Name</span>
          <span>{lead.name}</span>
        </div>
        <div className={styles.readRow}>
          <span className={styles.readLabel}>Contact</span>
          <span>{lead.contact || '—'}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>Client</h2>
      <div className={styles.field}>
        <label className={styles.label}>Full name</label>
        <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className={styles.field}>
        <label className={styles.label}>Contact</label>
        <input className={styles.input} value={contact} onChange={(e) => setContact(e.target.value)} />
      </div>
      {error && <p className={styles.errorMsg}>{error}</p>}
      <div className={styles.actionsRow}>
        <button type="button" className={styles.cancelBtn} onClick={() => setEditing(false)}>
          Cancel
        </button>
        <button
          type="button"
          className={styles.btn}
          style={{ flex: 1 }}
          disabled={update.isPending || !name.trim()}
          onClick={() => {
            setError(null);
            update.mutateAsync({ id: lead.id, patch: { name: name.trim(), contact: contact.trim(), expectedVersion: lead.version ?? undefined } }).then(
              () => setEditing(false),
              (e) => setError(friendlyError(e, 'Failed to save')),
            );
          }}
        >
          {update.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

// Master Spec Section 4's lead-record gap: source/priority/assigned-staff
// are real columns (Lead.leadSource/priority/agent) with no UI anywhere
// before now -- confirmed by grep, not assumed.
function LeadDetailsSection({ lead }: { lead: Lead }) {
  const profile = useSessionStore((s) => s.profile);
  const update = useUpdateLead();
  const assignLead = useAssignLead();
  const { data: staff } = useStaffDirectory();
  const [editing, setEditing] = useState(false);
  const [source, setSource] = useState(lead.leadSource ?? '');
  const [priority, setPriority] = useState(lead.priority ?? '');
  const [address, setAddress] = useState(lead.address ?? '');
  const [reassigning, setReassigning] = useState(false);
  const [assignTo, setAssignTo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const staffName = lead.agent === 'company' ? 'Company Leads (unassigned)' : staff?.find((s) => s.key === lead.agent)?.name ?? lead.agent;
  const isManager = profile?.role === 'manager';

  if (!editing) {
    return (
      <div className={styles.section}>
        <div className={styles.sectionHeadRow}>
          <h2 className={styles.sectionTitle}>Lead details</h2>
          <button type="button" className={styles.editLink} onClick={() => setEditing(true)}>
            Edit
          </button>
        </div>
        <div className={styles.readRow}>
          <span className={styles.readLabel}>Source</span>
          <span>{lead.leadSource || '—'}</span>
        </div>
        <div className={styles.readRow}>
          <span className={styles.readLabel}>Priority</span>
          <span>{lead.priority || '—'}</span>
        </div>
        <div className={styles.readRow}>
          <span className={styles.readLabel}>Address</span>
          <span>{lead.address || '—'}</span>
        </div>
        <div className={styles.readRow}>
          <span className={styles.readLabel}>Assigned to</span>
          <span>{staffName}</span>
        </div>
        {isManager && !reassigning && (
          <button type="button" className={styles.editLink} onClick={() => setReassigning(true)}>
            Reassign
          </button>
        )}
        {isManager && reassigning && (
          <div className={styles.actionsRow}>
            <select className={styles.input} value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
              <option value="">Select staff…</option>
              {(staff ?? []).map((s) => (
                <option key={s.key} value={s.key}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={styles.btn}
              style={{ flex: 1 }}
              disabled={!assignTo || assignLead.isPending}
              onClick={() => assignLead.mutateAsync({ id: lead.id, agentKey: assignTo }).then(() => setReassigning(false))}
            >
              {assignLead.isPending ? 'Reassigning…' : 'Confirm'}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>Lead details</h2>
      <div className={styles.field}>
        <label className={styles.label}>Source</label>
        <input className={styles.input} placeholder="e.g. Referral, Walk-in, Facebook" value={source} onChange={(e) => setSource(e.target.value)} />
      </div>
      <div className={styles.field}>
        <label className={styles.label}>Priority</label>
        <select className={styles.input} value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="">Not set</option>
          {PRIORITIES.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </div>
      <div className={styles.field}>
        <label className={styles.label}>Address</label>
        <input className={styles.input} placeholder="Client's physical address" value={address} onChange={(e) => setAddress(e.target.value)} />
      </div>
      {error && <p className={styles.errorMsg}>{error}</p>}
      <div className={styles.actionsRow}>
        <button type="button" className={styles.cancelBtn} onClick={() => setEditing(false)}>
          Cancel
        </button>
        <button
          type="button"
          className={styles.btn}
          style={{ flex: 1 }}
          disabled={update.isPending}
          onClick={() => {
            setError(null);
            update
              .mutateAsync({ id: lead.id, patch: { leadSource: source.trim() || undefined, priority: priority || undefined, address: address.trim() || undefined, expectedVersion: lead.version ?? undefined } })
              .then(
              () => setEditing(false),
              (e) => setError(friendlyError(e, 'Failed to save')),
            );
          }}
        >
          {update.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

function PlotPricingSection({ lead, config }: { lead: Lead; config: NonNullable<ReturnType<typeof useConfig>['data']> }) {
  const update = useUpdateLead();
  const [editing, setEditing] = useState(false);
  const [plotType, setPlotType] = useState(lead.plotType);
  const [noPlots, setNoPlots] = useState(String(lead.noPlots));
  // Only re-defaults No. of plots (0.5 for Half, 1 for Full -- a
  // full-plot-equivalent count, see previewGrandTotal's own comment) when
  // the staff member actually changes the Plot type dropdown themselves
  // during this edit -- the initial value above must stay exactly what
  // the lead already has, not get silently overwritten on open.
  const [noPlotsManuallyEdited, setNoPlotsManuallyEdited] = useState(false);
  const [unitPrice, setUnitPrice] = useState(String(lead.unitPrice));
  const [discount, setDiscount] = useState(lead.discount != null ? String(lead.discount) : '');
  const [paymentPlan, setPaymentPlan] = useState(lead.paymentPlan);
  const [error, setError] = useState<string | null>(null);

  const preview = previewGrandTotal(config, plotType, Number(noPlots) || 1, Number(unitPrice) || 0, discount === '' ? null : Number(discount), paymentPlan);

  if (!editing) {
    return (
      <div className={styles.section}>
        <div className={styles.sectionHeadRow}>
          <h2 className={styles.sectionTitle}>Plot &amp; pricing</h2>
          <button type="button" className={styles.editLink} onClick={() => setEditing(true)}>
            Edit
          </button>
        </div>
        <div className={styles.readRow}>
          <span className={styles.readLabel}>Plot type</span>
          <span>
            {lead.plotType} ×{qtyOfType(lead.plotType, lead.noPlots)}
          </span>
        </div>
        <div className={styles.readRow}>
          <span className={styles.readLabel}>Unit price</span>
          <span>{ghs(lead.unitPrice)}</span>
        </div>
        <div className={styles.readRow}>
          <span className={styles.readLabel}>Discount</span>
          <span>{ghs(lead.discount ?? 0)}</span>
        </div>
        <div className={styles.readRow}>
          <span className={styles.readLabel}>Payment plan</span>
          <span>{lead.paymentPlan}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>Plot &amp; pricing</h2>
      <div className={styles.grid2}>
        <div className={styles.field}>
          <label className={styles.label}>Plot type</label>
          <select
            className={styles.input}
            value={plotType}
            onChange={(e) => {
              const next = e.target.value as Lead['plotType'];
              setPlotType(next);
              if (!noPlotsManuallyEdited) setNoPlots(next === 'Half Plot' ? '0.5' : '1');
            }}
          >
            <option>Full Plot</option>
            <option>Half Plot</option>
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>No. of plots</label>
          <input
            className={styles.input}
            type="number"
            step="0.5"
            min="0.5"
            value={noPlots}
            onChange={(e) => {
              setNoPlotsManuallyEdited(true);
              setNoPlots(e.target.value);
            }}
          />
        </div>
      </div>
      <PartialPlotAdder
        config={config}
        plotType={plotType}
        onAdd={(eq) => {
          setNoPlotsManuallyEdited(true);
          setNoPlots(String(Math.round((Number(noPlots || 0) + eq) * 100) / 100));
        }}
      />
      <div className={styles.grid2}>
        <div className={styles.field}>
          <label className={styles.label}>Unit price (GHS)</label>
          <input className={styles.input} type="number" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Discount (GHS)</label>
          <input className={styles.input} type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} />
        </div>
      </div>
      <div className={styles.field}>
        <label className={styles.label}>Payment plan</label>
        <select className={styles.input} value={paymentPlan} onChange={(e) => setPaymentPlan(e.target.value as Lead['paymentPlan'])}>
          <option>Full Payment</option>
          <option>3 Months</option>
          <option>6 Months</option>
          <option>9 Months</option>
          <option>12 Months</option>
        </select>
      </div>
      <div className={styles.calcBox}>
        <div>
          <div className={styles.calcLabel}>Net total</div>
          <div className={styles.calcValue}>{ghs(preview.net)}</div>
        </div>
        {preview.interest > 0 && (
          <div>
            <div className={styles.calcLabel}>+ Interest</div>
            <div className={styles.calcValue}>{ghs(preview.interest)}</div>
          </div>
        )}
        <div>
          <div className={styles.calcLabel}>Grand total</div>
          <div className={styles.calcValue}>{ghs(preview.grand)}</div>
        </div>
        <div>
          <div className={styles.calcLabel}>New balance</div>
          <div className={styles.calcValue}>{ghs(Math.max(preview.grand - lead.amtPaid, 0))}</div>
        </div>
      </div>
      {error && <p className={styles.errorMsg}>{error}</p>}
      <div className={styles.actionsRow}>
        <button type="button" className={styles.cancelBtn} onClick={() => setEditing(false)}>
          Cancel
        </button>
        <button
          type="button"
          className={styles.btn}
          style={{ flex: 1 }}
          disabled={update.isPending}
          onClick={() => {
            setError(null);
            const grandTotal = preview.grand;
            update
              .mutateAsync({
                id: lead.id,
                patch: {
                  plotType,
                  noPlots: Number(noPlots) || 1,
                  unitPrice: Number(unitPrice) || 0,
                  discount: discount === '' ? undefined : Number(discount),
                  paymentPlan,
                  netTotal: preview.net,
                  grandTotal,
                  expectedVersion: lead.version ?? undefined,
                },
              })
              .then(
                () => setEditing(false),
                (e) => setError(friendlyError(e, 'Failed to save')),
              );
          }}
        >
          {update.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

function DepositScheduleSection({ lead, config, payments }: { lead: Lead; config: NonNullable<ReturnType<typeof useConfig>['data']>; payments: Payment[] }) {
  const update = useUpdateLead();
  const [editingTarget, setEditingTarget] = useState(false);
  const [target, setTarget] = useState('');

  const onPlan = lead.paymentPlan !== 'Full Payment';
  if (!onPlan) return null;

  const dep = computeDepositStatus(config, lead, payments);
  const sched = computeMonthlySchedule(config, lead, payments);

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>Deposit &amp; schedule</h2>
      {!dep.complete ? (
        <>
          <div className={styles.calcBox}>
            <div>
              <div className={styles.calcLabel}>Deposit paid</div>
              <div className={styles.calcValue}>
                {ghs(dep.paid)} <span className={styles.readLabel}>of {ghs(dep.target)}</span>
              </div>
            </div>
            <div>
              <div className={styles.calcLabel}>Remaining</div>
              <div className={styles.calcValue}>{ghs(dep.remaining)}</div>
            </div>
          </div>
          {!editingTarget ? (
            <button type="button" className={styles.editLink} onClick={() => { setTarget(String(dep.target)); setEditingTarget(true); }}>
              Edit deposit target
            </button>
          ) : (
            <div className={styles.actionsRow} style={{ marginTop: 8 }}>
              <input className={styles.input} type="number" value={target} onChange={(e) => setTarget(e.target.value)} style={{ flex: 1 }} />
              <button
                type="button"
                className={styles.btn}
                disabled={update.isPending}
                onClick={() => update.mutateAsync({ id: lead.id, patch: { depositTarget: Number(target) || 0 } }).then(() => setEditingTarget(false))}
              >
                Save
              </button>
            </div>
          )}
        </>
      ) : sched ? (
        <>
          <div className={styles.calcBox}>
            <div>
              <div className={styles.calcLabel}>This month&apos;s installment</div>
              <div className={styles.calcValue}>{ghs(sched.expectedThisMonth)}</div>
            </div>
            <div>
              <div className={styles.calcLabel}>Month</div>
              <div className={styles.calcValue}>
                {sched.monthsElapsed} of {sched.planMonths}
              </div>
            </div>
          </div>
          <p className={styles.helpText}>
            {ghs(sched.monthlyInstallment)}/mo · due {sched.nextDueDate}
            {sched.arrears > 0 && <span className={styles.warnText}> · {ghs(sched.arrears)} overdue from earlier months</span>}
          </p>
        </>
      ) : (
        <p className={styles.helpText}>Deposit cleared — installment schedule not yet available.</p>
      )}
    </div>
  );
}

// Master Spec 7.3: "Staff clicks Request Allocation... If below threshold,
// allocation button is disabled with plain-English explanation." The real
// gate lives here, right on the lead a staff member is actually looking
// at -- not just on the separate Allocations-tab picker, which now
// enforces the exact same check (see NewRequestForm) so the threshold
// can't be bypassed by using that entry point instead.
function AllocationEligibilitySection({ lead, config, payments }: { lead: Lead; config: NonNullable<ReturnType<typeof useConfig>['data']>; payments: Payment[] }) {
  const navigate = useNavigate();
  const { data: requests } = useAllocationRequests();
  const create = useCreateAllocationRequest();
  const [error, setError] = useState<string | null>(null);

  const dep = computeDepositStatus(config, lead, payments);
  const existing = (requests ?? []).find((r) => r.leadId === lead.id);

  async function request() {
    setError(null);
    try {
      await create.mutateAsync({ leadId: lead.id });
      navigate('/app/sales/allocations');
    } catch (e) {
      setError(friendlyError(e, 'Failed to request allocation'));
    }
  }

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>Allocation</h2>
      {existing ? (
        <p className={styles.helpText}>
          {existing.status === 'Allocated'
            ? `Plot ${existing.plotNumber} allocated.`
            : existing.status === 'Awaiting Authorization'
              ? 'Allocation request awaiting Management sign-off.'
              : 'Allocation request submitted — awaiting suggestion.'}{' '}
          <button type="button" className={styles.editLink} onClick={() => navigate('/app/sales/allocations')}>
            View in Allocations →
          </button>
        </p>
      ) : dep.complete ? (
        <>
          <p className={styles.helpText}>
            {config.allocationThresholdPct}% deposit threshold met ({ghs(dep.paid)} of {ghs(dep.target)}) — eligible to request allocation.
          </p>
          {error && <p className={styles.warnText}>{error}</p>}
          <button type="button" className={styles.btn} disabled={create.isPending} onClick={request}>
            {create.isPending ? 'Requesting…' : 'Request Allocation'}
          </button>
        </>
      ) : (
        <>
          <button type="button" className={styles.btn} disabled title={`Needs ${config.allocationThresholdPct}% paid before allocation can be requested`}>
            Request Allocation
          </button>
          <p className={styles.helpText}>
            {ghs(dep.paid)} of {ghs(dep.target)} ({config.allocationThresholdPct}% target) paid — {ghs(dep.remaining)} more needed before this client is eligible for allocation.
          </p>
        </>
      )}
    </div>
  );
}

function FollowUpSection({ lead }: { lead: Lead }) {
  const update = useUpdateLead();
  const logActivity = useLogActivity();
  const [editing, setEditing] = useState(false);
  const [markLost, setMarkLost] = useState(lead.stage === 'Lost');
  const [nextAction, setNextAction] = useState(lead.nextAction ?? '');
  const [nextActionDate, setNextActionDate] = useState(lead.nextActionDate ?? '');
  const [notes, setNotes] = useState(lead.notes ?? '');
  const [tags, setTags] = useState(lead.tags ?? '');
  const [siteVisit, setSiteVisit] = useState(lead.siteVisit === 'Yes');
  const [error, setError] = useState<string | null>(null);

  // Master Spec Section 4.6: "Next-action date overdue -> red overdue
  // state." today() as a plain string compare works fine for YYYY-MM-DD.
  const isOverdue = !!lead.nextActionDate && lead.nextActionDate < today() && lead.stage !== '4' && lead.stage !== 'Lost';

  if (!editing) {
    return (
      <div className={styles.section}>
        <div className={styles.sectionHeadRow}>
          <h2 className={styles.sectionTitle}>Follow-up</h2>
          <button type="button" className={styles.editLink} onClick={() => setEditing(true)}>
            Edit
          </button>
        </div>
        <div className={styles.readRow}>
          <span className={styles.readLabel}>Next step</span>
          <span>{lead.nextAction || '—'}</span>
        </div>
        <div className={styles.readRow}>
          <span className={styles.readLabel}>Due</span>
          <span className={isOverdue ? styles.overdueText : undefined}>
            {lead.nextActionDate ? lead.nextActionDate : '—'}
            {isOverdue ? ' · Overdue' : ''}
          </span>
        </div>
        <div className={styles.readRow}>
          <span className={styles.readLabel}>Tags</span>
          <span>{lead.tags || '—'}</span>
        </div>
        <div className={styles.readRow}>
          <span className={styles.readLabel}>Site visit</span>
          <span>{lead.siteVisit === 'Yes' ? 'Visited' : 'Not yet'}</span>
        </div>
        <FollowUpDraftBox lead={lead} />
      </div>
    );
  }

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>Follow-up</h2>
      <label className={styles.checkboxRow}>
        <input type="checkbox" checked={markLost} onChange={(e) => setMarkLost(e.target.checked)} /> Mark this lead as Lost
      </label>
      <div className={styles.field}>
        <label className={styles.label}>Next step agreed</label>
        <input className={styles.input} value={nextAction} onChange={(e) => setNextAction(e.target.value)} />
      </div>
      <div className={styles.field}>
        <label className={styles.label}>Due date (optional)</label>
        <input className={styles.input} type="date" value={nextActionDate} onChange={(e) => setNextActionDate(e.target.value)} />
      </div>
      <div className={styles.field}>
        <label className={styles.label}>Notes</label>
        <textarea className={styles.input} value={notes} onChange={(e) => setNotes(e.target.value)} style={{ minHeight: 60 }} />
      </div>
      <div className={styles.field}>
        <label className={styles.label}>Tags</label>
        <input className={styles.input} placeholder="e.g. VIP, Referral, Diaspora" value={tags} onChange={(e) => setTags(e.target.value)} />
      </div>
      <label className={styles.checkboxRow}>
        <input type="checkbox" checked={siteVisit} onChange={(e) => setSiteVisit(e.target.checked)} /> Client has visited the site
      </label>
      {error && <p className={styles.errorMsg}>{error}</p>}
      <div className={styles.actionsRow}>
        <button type="button" className={styles.cancelBtn} onClick={() => setEditing(false)}>
          Cancel
        </button>
        <button
          type="button"
          className={styles.btn}
          style={{ flex: 1 }}
          disabled={update.isPending}
          onClick={() => {
            setError(null);
            update
              .mutateAsync({
                id: lead.id,
                patch: {
                  stage: markLost ? 'Lost' : lead.stage,
                  nextAction: nextAction.trim(),
                  nextActionDate: nextActionDate || null,
                  notes: notes.trim(),
                  tags: tags.trim(),
                  siteVisit: siteVisit ? 'Yes' : lead.siteVisit ?? undefined,
                  expectedVersion: lead.version ?? undefined,
                },
              })
              .then(
                () => {
                  if (markLost !== (lead.stage === 'Lost')) {
                    logActivity(lead.name, markLost ? 'Stage changed to Lost' : 'Stage reopened from Lost', markLost ? 'Marked Lost from the Follow-up section' : null, lead.id);
                  }
                  setEditing(false);
                },
                (e) => setError(friendlyError(e, 'Failed to save')),
              );
          }}
        >
          {update.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

// Real LLM-drafted follow-up message -- the master spec's own named safe
// use (Section 22: "summarize long lead notes and recommend follow-up
// wording"). A tap-to-generate mutation, not something that fires on
// every screen open -- drafting is a deliberate action, and every draft
// costs a real Groq call. Copy button uses the Clipboard API directly
// (no confirmation needed -- copying text to the clipboard isn't a
// side-effectful action on anyone else's data).
function FollowUpDraftBox({ lead }: { lead: Lead }) {
  const draft = useFollowUpDraft();
  const [copied, setCopied] = useState(false);

  if (!draft.data && !draft.isPending) {
    return (
      <button type="button" className={styles.aiDraftBtn} onClick={() => draft.mutate(lead)}>
        AI: Draft a follow-up message
      </button>
    );
  }

  async function copy() {
    if (!draft.data) return;
    await navigator.clipboard.writeText(draft.data).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={styles.aiDraftBox}>
      <div className={styles.aiDraftHead}>
        <span className={styles.aiBadge}>AI</span>
        <span className={styles.readLabel}>Follow-up draft</span>
      </div>
      {draft.isPending && <p className={styles.helpText}>Drafting…</p>}
      {draft.data && <p className={styles.aiDraftText}>{draft.data}</p>}
      {draft.data && (
        <div className={styles.aiDraftActions}>
          <button type="button" className={styles.aiDraftCopyBtn} onClick={copy}>
            {copied ? 'Copied ✓' : 'Copy'}
          </button>
          <button type="button" className={styles.aiDraftRetryBtn} onClick={() => draft.mutate(lead)}>
            Redraft
          </button>
        </div>
      )}
    </div>
  );
}

// Master Spec Section 4's Site Visits lead-record section -- real
// site_visits.lead_id FK (see SiteVisit.leadId's own comment), not a
// name-match guess at read time.
function SiteVisitsSection({ lead }: { lead: Lead }) {
  const navigate = useNavigate();
  const { data: visits } = useSiteVisitsForLead(lead.id);

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeadRow}>
        <h2 className={styles.sectionTitle}>Site visits</h2>
        <button
          type="button"
          className={styles.editLink}
          onClick={() => navigate(`/app/sales/sitevisits/new?leadId=${lead.id}&name=${encodeURIComponent(lead.name)}&contact=${encodeURIComponent(lead.contact)}`)}
        >
          Log a visit
        </button>
      </div>
      {(!visits || visits.length === 0) && <p className={styles.emptyMsg}>No site visits logged for this lead yet.</p>}
      {visits?.map((v) => (
        <div className={styles.readRow} key={v.id}>
          <span className={styles.readLabel}>
            {v.visitDate} {v.visitTime ? `· ${v.visitTime}` : ''}
          </span>
          <span>
            {v.site}
            {v.plot ? ` · ${v.plot}` : ''} · {v.status}
          </span>
        </div>
      ))}
    </div>
  );
}

// Master Spec Section 4's combined Activity timeline -- real
// activity_log.lead_id FK, populated by the payment-decision RPCs
// (approve/decline/needs-correction/resubmit) and manual writes.
function ActivitySection({ leadId }: { leadId: string }) {
  const { data: entries } = useActivityForLead(leadId);

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>Activity</h2>
      {(!entries || entries.length === 0) && <p className={styles.emptyMsg}>No activity recorded for this lead yet.</p>}
      {entries?.map((a) => (
        <div className={styles.historyRow} key={a.id}>
          <div className={styles.historyMain}>
            <div className={styles.historyDate}>{a.action}</div>
            {a.detail && <div className={styles.readLabel}>{a.detail}</div>}
          </div>
          <span className={styles.readLabel}>{a.createdAt.slice(0, 10)}</span>
        </div>
      ))}
    </div>
  );
}

// Master Spec Section 4's Audit Trail section -- manager-only per
// audit_events' own RLS. Merges entity_type='lead' events (archive/
// restore) with entity_type='payment' events for this lead's own
// payments (approve/decline/needs-correction/resubmit).
function AuditTrailSection({ leadId, paymentIds }: { leadId: string; paymentIds: string[] }) {
  const profile = useSessionStore((s) => s.profile);
  const { data: events } = useAuditForLead(leadId, paymentIds);

  if (profile?.role !== 'manager') return null;

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>Audit trail</h2>
      {(!events || events.length === 0) && <p className={styles.emptyMsg}>No audit events for this lead yet.</p>}
      {events?.map((e) => (
        <div className={styles.historyRow} key={e.id}>
          <div className={styles.historyMain}>
            <div className={styles.historyDate}>{e.summary}</div>
          </div>
          <span className={styles.readLabel}>{e.createdAt.slice(0, 10)}</span>
        </div>
      ))}
    </div>
  );
}

function DocumentationSection({ lead }: { lead: Lead }) {
  const canView = useCanViewDocStage();
  const updateStage = useUpdateLeadDocStage();
  const [stage, setStage] = useState(lead.docStage ?? '');
  const [done, setDone] = useState(false);

  if (!canView) return null;

  const currentLabel = DOC_STAGES.find((d) => d.key === lead.docStage)?.label;

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>Documentation &amp; allocation</h2>
      <p className={styles.helpText}>{currentLabel ? `Currently: ${currentLabel}` : 'Not started yet — the client sees no progress bar until this is set.'}</p>
      <div className={styles.field}>
        <select className={styles.input} value={stage} onChange={(e) => setStage(e.target.value)}>
          <option value="">— Not started —</option>
          {DOC_STAGES.map((d) => (
            <option key={d.key} value={d.key}>
              {d.label}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        className={styles.btn}
        disabled={!stage || updateStage.isPending}
        onClick={() => updateStage.mutateAsync({ id: lead.id, stage }).then(() => { setDone(true); setTimeout(() => setDone(false), 2000); })}
      >
        {updateStage.isPending ? 'Updating…' : done ? 'Updated ✓' : 'Update stage'}
      </button>
    </div>
  );
}

// Master Spec Section 4.5's exact reason set: Wrong data, Duplicate lead,
// Client cancelled/refund, Client requested removal, Other (free text).
// Refund/cancellation is the one that runs the real allocation-reversal
// workflow (vacating any plot allocated to this client) rather than just
// archiving the record.
const DELETE_REASONS = [
  { key: 'wrong', label: 'Wrong data', detail: "I'll re-create this lead correctly.", runsReversal: false },
  { key: 'duplicate', label: 'Duplicate lead', detail: 'This client already has another lead record.', runsReversal: false },
  { key: 'refund', label: 'Client cancelled / refund', detail: 'Any plot allocated to them becomes Available again.', runsReversal: true },
  { key: 'removal', label: 'Client requested removal', detail: 'The client asked to be taken out of the system.', runsReversal: false },
  { key: 'other', label: 'Other reason', detail: 'Describe why below.', runsReversal: false },
] as const;
type DeleteReasonKey = (typeof DELETE_REASONS)[number]['key'];

function DangerZoneSection({ lead, onDeleted }: { lead: Lead; onDeleted: () => void }) {
  const del = useDeleteLead();
  const { data: plots } = usePlots();
  const updatePlot = useUpdatePlot();
  const [reasonKey, setReasonKey] = useState<DeleteReasonKey | null>(null);
  const [otherText, setOtherText] = useState('');

  const selected = DELETE_REASONS.find((r) => r.key === reasonKey);
  const finalReason = reasonKey === 'other' ? otherText.trim() : (selected?.label ?? '');

  async function confirmDelete() {
    if (!finalReason) return;
    if (selected?.runsReversal) {
      const toVacate = (plots ?? []).filter((p) => p.status === 'Allocated' && p.clientName && p.clientName.trim().toLowerCase() === lead.name.trim().toLowerCase());
      for (const p of toVacate) {
        await updatePlot.mutateAsync({ id: p.id, patch: { status: 'Available', clientName: null, clientContact: null, agentKey: null } }).catch(() => {});
      }
    }
    await del.mutateAsync({ id: lead.id, reason: finalReason });
    onDeleted();
  }

  if (selected) {
    return (
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Archive {lead.name}?</h2>
        <p className={styles.helpText}>
          Management can restore this later, but it leaves the active pipeline immediately.{selected.runsReversal ? ' Any plot allocated to them will automatically become Available again.' : ''}
        </p>
        {reasonKey === 'other' && (
          <textarea
            className={styles.input}
            style={{ minHeight: 60, marginTop: 8 }}
            placeholder="Reason (required)"
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
            autoFocus
          />
        )}
        {del.isError && <p className={styles.errorMsg}>{friendlyError(del.error, 'Failed to archive this lead')}</p>}
        <div className={styles.actionsRow}>
          <button type="button" className={styles.cancelBtn} onClick={() => setReasonKey(null)}>
            Cancel
          </button>
          <button type="button" className={styles.dangerBtn} style={{ flex: 1 }} disabled={del.isPending || !finalReason} onClick={confirmDelete}>
            {del.isPending ? 'Archiving…' : 'Yes, archive'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>Danger zone</h2>
      <p className={styles.helpText}>Archives {lead.name} out of the active pipeline. Management can see why and restore it.</p>
      <div className={styles.dangerOptions}>
        {DELETE_REASONS.map((r) => (
          <button type="button" key={r.key} className={styles.dangerOptionBtn} onClick={() => setReasonKey(r.key)}>
            <div className={styles.dangerOptionTitle}>{r.label}</div>
            <div className={styles.helpText}>{r.detail}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
