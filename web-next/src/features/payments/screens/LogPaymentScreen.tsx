import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useSessionStore } from '../../../auth/useSessionStore';
import { ghs } from '../../../shared/lib/format';
import type { Lead } from '../../../types/domain';
import { useAllLeads, useApprovePayment, useCanLogPayments, useCreatePayment, useDeclinePayment, usePendingPayments } from '../hooks/useLogPayment';
import styles from './LogPaymentScreen.module.css';

const PAYMENT_METHODS = ['Ecobank', 'Stanbic Bank', 'MTN MoMo', 'Vodafone Cash', 'Hubtel', 'Cash', 'Other'] as const;

const schema = z.object({
  amount: z.coerce.number().min(1, 'Required'),
  paymentDate: z.string().min(1, 'Required'),
  paymentMethod: z.string().optional(),
  note: z.string().optional(),
});
type FormInput = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

// Gated to manager/'elias' -- confirmed live via payments_ins RLS that no
// one else can insert a payment at all. See the DataSource.payments
// comment in data/source.ts for the full real workflow this mirrors.
export function LogPaymentScreen() {
  const canLog = useCanLogPayments();
  const profile = useSessionStore((s) => s.profile);
  const { data: leads } = useAllLeads();
  const { data: pending, isLoading: pendingLoading } = usePendingPayments();
  const createPayment = useCreatePayment();

  const [query, setQuery] = useState('');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: { paymentDate: new Date().toISOString().slice(0, 10) },
  });

  if (!canLog) {
    return (
      <div className={styles.wrap}>
        <h1 className={styles.title}>Log Payment</h1>
        <p className={styles.sub}>You don&apos;t have access to this. Ask a manager if you need it.</p>
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const matches = q ? (leads ?? []).filter((l) => l.name.toLowerCase().includes(q) || l.contact.includes(q)).slice(0, 8) : [];

  async function onSubmit(values: FormOutput) {
    if (!selectedLead) return;
    await createPayment.mutateAsync({
      input: { leadId: selectedLead.id, amount: values.amount, paymentDate: values.paymentDate, paymentMethod: values.paymentMethod as (typeof PAYMENT_METHODS)[number] | undefined, note: values.note },
      leadName: selectedLead.name,
      leadAgentKey: selectedLead.agent,
    });
    setDone(true);
    reset({ paymentDate: new Date().toISOString().slice(0, 10) });
    setTimeout(() => setDone(false), 2500);
    setSelectedLead(null);
    setQuery('');
  }

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>Log Payment</h1>
      <p className={styles.sub}>{profile?.role === 'manager' ? 'Logged here is approved immediately.' : 'Your entries go to Management for approval first.'}</p>

      <div className={styles.sectionTitle}>Log a payment</div>
      <div className={styles.card}>
        {!selectedLead ? (
          <>
            <input className={styles.input} placeholder="Search client by name or contact…" value={query} onChange={(e) => setQuery(e.target.value)} />
            {matches.length > 0 && (
              <div className={styles.pickerList}>
                {matches.map((l) => (
                  <button key={l.id} type="button" className={styles.pickerRow} onClick={() => setSelectedLead(l)}>
                    <div>
                      <div className={styles.pickerName}>{l.name}</div>
                      <div className={styles.pickerMeta}>
                        {l.contact} · {l.plotType}
                      </div>
                    </div>
                    <div className={styles.pickerBalance}>{ghs(Math.max(l.grandTotal - l.amtPaid, 0))} owed</div>
                  </button>
                ))}
              </div>
            )}
            {q && matches.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 12.5, marginTop: 10 }}>No clients match &quot;{query}&quot;.</p>}
          </>
        ) : (
          <>
            <div className={styles.selectedLead}>
              <div>
                <div className={styles.pickerName}>{selectedLead.name}</div>
                <div className={styles.pickerMeta}>
                  Balance: {ghs(Math.max(selectedLead.grandTotal - selectedLead.amtPaid, 0))} of {ghs(selectedLead.grandTotal)}
                </div>
              </div>
              <button type="button" className={styles.changeBtn} onClick={() => setSelectedLead(null)}>
                Change
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)}>
              <div className={styles.grid2}>
                <div className={styles.field}>
                  <label className={styles.label}>Amount (GHS) *</label>
                  <input className={styles.input} type="number" {...register('amount')} />
                  {errors.amount && <div className={styles.err}>{errors.amount.message}</div>}
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Date *</label>
                  <input className={styles.input} type="date" {...register('paymentDate')} />
                </div>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Payment method</label>
                <select className={styles.select} {...register('paymentMethod')} defaultValue="">
                  <option value="">Select…</option>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Note</label>
                <textarea className={styles.textarea} {...register('note')} />
              </div>
              <button type="submit" className={styles.submitBtn} disabled={createPayment.isPending}>
                {createPayment.isPending ? 'Saving…' : done ? 'Saved ✓' : 'Save payment'}
              </button>
              {profile?.role !== 'manager' && <p className={styles.hint}>This will be pending until a manager approves it.</p>}
            </form>
          </>
        )}
      </div>

      <div className={styles.sectionTitle}>Pending approvals</div>
      {pendingLoading && <p style={{ color: 'var(--muted)' }}>Loading…</p>}
      {pending && pending.length === 0 && !pendingLoading && <p style={{ color: 'var(--muted)' }}>Nothing pending.</p>}
      {pending?.map((p) => (
        <PendingPaymentRow key={p.id} paymentId={p.id} clientName={p.clientName ?? ''} amount={p.amount} date={p.date} note={p.note} canDecide={profile?.role === 'manager'} />
      ))}
    </div>
  );
}

function PendingPaymentRow({ paymentId, clientName, amount, date, note, canDecide }: { paymentId: string; clientName: string; amount: number; date: string; note?: string | null; canDecide: boolean }) {
  const approve = useApprovePayment();
  const decline = useDeclinePayment();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');

  return (
    <div className={styles.pendingCard}>
      <div className={styles.pendingTop}>
        <div>
          <div className={styles.pendingName}>{clientName}</div>
          <div className={styles.pendingMeta}>
            {date}
            {note ? ` · ${note}` : ''}
          </div>
        </div>
        <div className={styles.pendingAmount}>{ghs(amount)}</div>
      </div>
      {canDecide && !declining && (
        <div className={styles.pendingActions}>
          <button type="button" className={styles.approveBtn} disabled={approve.isPending} onClick={() => approve.mutate(paymentId)}>
            {approve.isPending ? 'Approving…' : 'Approve'}
          </button>
          <button type="button" className={styles.declineBtn} onClick={() => setDeclining(true)}>
            Decline
          </button>
        </div>
      )}
      {canDecide && declining && (
        <>
          <input className={styles.reasonInput} placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className={styles.pendingActions}>
            <button
              type="button"
              className={styles.declineBtn}
              disabled={decline.isPending}
              onClick={() => decline.mutate({ paymentId, reason: reason || undefined })}
            >
              {decline.isPending ? 'Declining…' : 'Confirm decline'}
            </button>
            <button type="button" className={styles.changeBtn} onClick={() => setDeclining(false)}>
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}
