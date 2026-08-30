import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useSessionStore } from '../../../auth/useSessionStore';
import { ghs } from '../../../shared/lib/format';
import { useCanLogPayments, useCreatePayment } from '../../payments/hooks/useLogPayment';
import { useDownloadReceipt, useIssueReceiptLink } from '../../payments/hooks/useReceipt';
import type { Payment } from '../../../types/domain';
import { StageBadge } from '../components/StageBadge';
import { useLead } from '../hooks/useLead';
import { usePayments } from '../hooks/usePayments';
import styles from './PipelineDetailScreen.module.css';

// Simplified port of formUpdate()/the "Update pipeline" per-client detail
// screen (index.html:14340-14367, already redesigned to the .pipePill
// stat-strip style earlier this session) -- Pipeline value/Collected/
// Balance pills + a log-payment form. Stage/plot/discount editing and the
// full accordion of client/plot/deposit/documentation sections are out of
// scope for this slice; only the payment-logging write path is ported.
//
// The log-payment form only renders for manager/'elias' (useCanLogPayments)
// -- confirmed live via payments_ins RLS that a regular agent cannot
// insert a payment at all, not even as 'pending'. Every other agent still
// sees their own lead's payment history, just not the form to add to it.
export function PipelineDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const profile = useSessionStore((s) => s.profile);
  const canLog = useCanLogPayments();
  const { data: lead, isLoading } = useLead(id ?? '');
  const { data: payments } = usePayments(id ?? '');
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
  const initials = lead.name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

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

      {/* Wallet-style balance card -- adapted from the fintech dashboard
          pattern studied on Dribbble/Figma this session (a hero balance +
          progress ring/bar, not a flat 3-pill strip). Real progress: the
          actual amtPaid/grandTotal ratio, not decorative. */}
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

      <button type="button" className={styles.backBtn} onClick={() => navigate('/app/sales/pipeline')}>
        ← Back
      </button>
    </div>
  );
}
