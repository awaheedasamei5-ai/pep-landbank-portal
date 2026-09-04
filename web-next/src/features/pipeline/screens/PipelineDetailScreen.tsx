import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useSessionStore } from '../../../auth/useSessionStore';
import { ghs } from '../../../shared/lib/format';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { useCanLogPayments, useCreatePayment } from '../../payments/hooks/useLogPayment';
import { useDownloadReceipt, useIssueReceiptLink } from '../../payments/hooks/useReceipt';
import { usePlots, useUpdatePlot } from '../../plots/hooks/usePlots';
import type { Lead, Payment } from '../../../types/domain';
import { computeDepositStatus, computeMonthlySchedule } from '../lib/pipelineLogic';
import { friendlyError } from '../../../shared/lib/friendlyError';
import type { PaymentPlanKey } from '../../quotation/lib/quotationLogic';
import { StageBadge } from '../components/StageBadge';
import { useCanViewDocStage, useDeleteLead, useLead, useUpdateLead, useUpdateLeadDocStage } from '../hooks/useLead';
import { usePayments } from '../hooks/usePayments';
import styles from './PipelineDetailScreen.module.css';

const DOC_STAGES = [
  { key: 'allocation', label: 'Allocation' },
  { key: 'picking', label: 'Picking' },
  { key: 'site_plan', label: 'Preparation of site plan' },
  { key: 'indentures', label: 'Preparation of indentures' },
  { key: 'court_stamping', label: 'Ready for court stamping' },
  { key: 'ready_pickup', label: 'Documents ready for pickup' },
];

// Ported from index.html's computeLead() (index.html:2860-2864) -- always
// recomputes fresh from plotType/noPlots/unitPrice/discount/paymentPlan,
// unlike quotationLogic's computeLeadQuotationTotals (which trusts a
// lead's stored netTotal/grandTotal when present, the right behavior for
// the Contract PDF but wrong for this section's live "what would it
// become" preview while the manager is still typing).
function previewGrandTotal(config: NonNullable<ReturnType<typeof useConfig>['data']>, plotType: Lead['plotType'], noPlots: number, unitPrice: number, discount: number | null, paymentPlan: PaymentPlanKey): { net: number; grand: number } {
  const p = plotType === 'Half Plot' ? { list: config.halfPrice, disc: config.halfDiscount, eq: 0.5 } : { list: config.fullPrice, disc: config.fullDiscount, eq: 1 };
  const qty = noPlots || 1;
  const unit = unitPrice || p.list;
  const gross = unit * qty;
  const disc = discount != null ? discount : p.disc * qty;
  const net = Math.max(gross - disc, 0);
  const eq = p.eq * qty;
  const interestTable: Record<PaymentPlanKey, number> = { 'Full Payment': 0, '3 Months': config.int3, '6 Months': config.int6, '9 Months': config.int9, '12 Months': config.int12 };
  const interest = (interestTable[paymentPlan] ?? 0) * eq;
  return { net, grand: net + interest };
}

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
  const profile = useSessionStore((s) => s.profile);
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

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div className={styles.avatar}>{initials}</div>
        <div>
          <div className={styles.eyebrow}>Updating</div>
          <h1 className={styles.name}>{lead.name}</h1>
          <p className={styles.meta}>
            {lead.contact} · {lead.plotType}
            {lead.noPlots > 1 ? ` ×${lead.noPlots}` : ''} · <StageBadge stage={lead.stage} />
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
      {config && <PlotPricingSection lead={lead} config={config} />}
      {config && <DepositScheduleSection lead={lead} config={config} payments={leadPayments} />}
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

      <DocumentationSection lead={lead} />
      <DangerZoneSection lead={lead} onDeleted={() => navigate('/app/sales/pipeline')} />

      <button type="button" className={styles.backBtn} onClick={() => navigate('/app/sales/pipeline')}>
        ← Back
      </button>
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
            update.mutateAsync({ id: lead.id, patch: { name: name.trim(), contact: contact.trim() } }).then(
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
            {lead.plotType} ×{lead.noPlots}
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
          <select className={styles.input} value={plotType} onChange={(e) => setPlotType(e.target.value as Lead['plotType'])}>
            <option>Full Plot</option>
            <option>Half Plot</option>
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>No. of plots</label>
          <input className={styles.input} type="number" step="0.5" min="0.5" value={noPlots} onChange={(e) => setNoPlots(e.target.value)} />
        </div>
      </div>
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

function FollowUpSection({ lead }: { lead: Lead }) {
  const update = useUpdateLead();
  const [editing, setEditing] = useState(false);
  const [markLost, setMarkLost] = useState(lead.stage === 'Lost');
  const [nextAction, setNextAction] = useState(lead.nextAction ?? '');
  const [notes, setNotes] = useState(lead.notes ?? '');
  const [tags, setTags] = useState(lead.tags ?? '');
  const [siteVisit, setSiteVisit] = useState(lead.siteVisit === 'Yes');
  const [error, setError] = useState<string | null>(null);

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
          <span className={styles.readLabel}>Tags</span>
          <span>{lead.tags || '—'}</span>
        </div>
        <div className={styles.readRow}>
          <span className={styles.readLabel}>Site visit</span>
          <span>{lead.siteVisit === 'Yes' ? 'Visited' : 'Not yet'}</span>
        </div>
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
                  notes: notes.trim(),
                  tags: tags.trim(),
                  siteVisit: siteVisit ? 'Yes' : lead.siteVisit ?? undefined,
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

function DangerZoneSection({ lead, onDeleted }: { lead: Lead; onDeleted: () => void }) {
  const del = useDeleteLead();
  const { data: plots } = usePlots();
  const updatePlot = useUpdatePlot();
  const [reason, setReason] = useState<'wrong' | 'refund' | 'other' | null>(null);

  async function confirmDelete() {
    if (reason === 'refund') {
      const toVacate = (plots ?? []).filter((p) => p.status === 'Allocated' && p.clientName && p.clientName.trim().toLowerCase() === lead.name.trim().toLowerCase());
      for (const p of toVacate) {
        await updatePlot.mutateAsync({ id: p.id, patch: { status: 'Available', clientName: null, clientContact: null, agentKey: null } }).catch(() => {});
      }
    }
    await del.mutateAsync(lead.id);
    onDeleted();
  }

  if (reason) {
    return (
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Delete {lead.name}?</h2>
        <p className={styles.helpText}>This can&apos;t be undone.{reason === 'refund' ? ' Any plot allocated to them will automatically become Available again.' : ''}</p>
        <div className={styles.actionsRow}>
          <button type="button" className={styles.cancelBtn} onClick={() => setReason(null)}>
            Cancel
          </button>
          <button type="button" className={styles.dangerBtn} style={{ flex: 1 }} disabled={del.isPending} onClick={confirmDelete}>
            {del.isPending ? 'Deleting…' : 'Yes, delete'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>Danger zone</h2>
      <p className={styles.helpText}>Permanently removes {lead.name} and their record from the pipeline.</p>
      <div className={styles.dangerOptions}>
        <button type="button" className={styles.dangerOptionBtn} onClick={() => setReason('wrong')}>
          <div className={styles.dangerOptionTitle}>Data was entered wrong</div>
          <div className={styles.helpText}>I&apos;ll re-create this lead correctly.</div>
        </button>
        <button type="button" className={styles.dangerOptionBtn} onClick={() => setReason('refund')}>
          <div className={styles.dangerOptionTitle}>Client asked for a refund / opted out</div>
          <div className={styles.helpText}>Any allocated plot becomes Available again.</div>
        </button>
        <button type="button" className={styles.dangerOptionBtn} onClick={() => setReason('other')}>
          <div className={styles.dangerOptionTitle}>Other reason</div>
          <div className={styles.helpText}>Just delete the record.</div>
        </button>
      </div>
    </div>
  );
}
