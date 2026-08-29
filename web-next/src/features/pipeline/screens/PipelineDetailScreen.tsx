import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ghs } from '../../../shared/lib/format';
import { PipePill, PipePillStrip } from '../../../shared/ui/PipePill';
import { StageBadge } from '../components/StageBadge';
import { useLead, useRecordPayment } from '../hooks/useLead';
import { usePayments } from '../hooks/usePayments';
import styles from './PipelineDetailScreen.module.css';

// Simplified port of formUpdate()/the "Update pipeline" per-client detail
// screen (index.html:14340-14367, already redesigned to the .pipePill
// stat-strip style earlier this session) -- Pipeline value/Collected/
// Balance pills + a log-payment form. Stage/plot/discount editing and the
// full accordion of client/plot/deposit/documentation sections are out of
// scope for this slice; only the payment-logging write path is ported.
export function PipelineDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: lead, isLoading } = useLead(id ?? '');
  const { data: payments } = usePayments();
  const recordPayment = useRecordPayment(id ?? '');
  const [amount, setAmount] = useState('');

  if (isLoading) return <div className={styles.wrap}>Loading…</div>;
  if (!lead) return <div className={styles.wrap}>Lead not found.</div>;

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
    if (!n || n <= 0) return;
    await recordPayment.mutateAsync(n);
    setAmount('');
  }

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

      <div className={styles.pillsWrap}>
        <PipePillStrip>
          <PipePill tone="blue" value={ghs(lead.grandTotal)} label="Pipeline value" isMoney />
          <PipePill tone="green" value={ghs(lead.amtPaid)} label="Collected" isMoney />
          <PipePill tone="gold" value={ghs(balance)} label="Balance" isMoney />
        </PipePillStrip>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Log a payment</h2>
        <form onSubmit={submitPayment}>
          <div className={styles.field}>
            <label className={styles.label}>Amount (GHS)</label>
            <input className={styles.input} type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
          </div>
          <button type="submit" className={styles.btn} disabled={recordPayment.isPending || !amount}>
            {recordPayment.isPending ? 'Saving…' : 'Save payment'}
          </button>
        </form>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Payment history</h2>
        <div className={styles.history}>
          {leadPayments.length === 0 && <p style={{ color: 'var(--muted)', margin: 0 }}>No individual payments logged yet — only a starting total.</p>}
          {leadPayments.map((p) => (
            <div className={styles.historyRow} key={p.id}>
              <span>{p.date}</span>
              <span style={{ fontWeight: 700, color: 'var(--ok)' }}>+{ghs(p.amount)}</span>
            </div>
          ))}
        </div>
      </div>

      <button type="button" onClick={() => navigate('/app/sales/pipeline')} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontWeight: 700, cursor: 'pointer', padding: '8px 0' }}>
        ← Back
      </button>
    </div>
  );
}
