import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { useCreateLead } from '../hooks/useLeads';
import { computeGrandTotal } from '../lib/pipelineLogic';
import { ghs } from '../../../shared/lib/format';
import { useSessionStore } from '../../../auth/useSessionStore';
import styles from './AddLeadScreen.module.css';

// Simplified port of formAddLead()/readLeadForm() (index.html:14132-14182).
// One Zod schema doubles as validation + the inferred form type -- the
// real interest/discount/deposit-target calc engine and lead-source/
// referral capture are deferred to a later phase (see pipelineLogic.ts).
const schema = z.object({
  name: z.string().trim().min(1, 'Required'),
  contact: z.string().trim().min(1, 'Required'),
  plotType: z.enum(['Full Plot', 'Half Plot']),
  noPlots: z.coerce.number().min(0.5),
  unitPrice: z.coerce.number().min(1, 'Required'),
  paymentPlan: z.enum(['Full Payment', '3 Months', '6 Months', '9 Months', '12 Months']),
  amtPaid: z.coerce.number().min(0),
  notes: z.string().optional(),
});
// z.input (not z.infer/z.output) -- the form's raw field values are
// pre-coercion (string from <input type="number">), zodResolver coerces on
// submit. Using the output type here is the classic RHF+Zod type mismatch.
type FormInput = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

export function AddLeadScreen() {
  const navigate = useNavigate();
  const profile = useSessionStore((s) => s.profile);
  const createLead = useCreateLead();
  const [depositNotice, setDepositNotice] = useState<{ leadId: string; message: string } | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: { plotType: 'Full Plot', noPlots: 1, paymentPlan: 'Full Payment', amtPaid: 0 },
  });

  // Master Spec Section 4.4: amt_paid is never a free field -- only
  // Elias/Management can actually log a payment at all (real payments_ins
  // RLS), so an ordinary agent never sees this field; the lead is simply
  // created with nothing paid yet, and payments come in through Log
  // Payment afterward like every other payment does.
  const canLogDeposit = profile?.role === 'manager' || profile?.key === 'elias';

  const unitPrice = watch('unitPrice') || 0;
  const noPlots = watch('noPlots') || 0;
  const grandTotal = computeGrandTotal(Number(unitPrice), Number(noPlots));

  async function onSubmit(values: FormOutput) {
    const { lead, depositError } = await createLead.mutateAsync(values);
    if (depositError) {
      setDepositNotice({ leadId: lead.id, message: depositError });
      return;
    }
    navigate('/app/sales/pipeline');
  }

  if (depositNotice) {
    return (
      <div className={styles.wrap}>
        <h1 className={styles.title}>Lead saved</h1>
        <p className={styles.err} style={{ marginTop: 8 }}>{depositNotice.message}</p>
        <div className={styles.actions} style={{ marginTop: 16 }}>
          <button type="button" className={styles.save} onClick={() => navigate(`/app/sales/pipeline/${depositNotice.leadId}`)}>
            Open the lead
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>Add to pipeline</h1>
      <p className={styles.sub}>Saved straight into your pipeline.</p>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className={styles.field}>
          <label className={styles.label}>Lead name *</label>
          <input className={styles.input} placeholder="e.g. Kwame Mensah" {...register('name')} />
          {errors.name && <div className={styles.err}>{errors.name.message}</div>}
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Contact *</label>
          <input className={styles.input} placeholder="0244…" {...register('contact')} />
          {errors.contact && <div className={styles.err}>{errors.contact.message}</div>}
        </div>
        <div className={styles.grid2}>
          <div className={styles.field}>
            <label className={styles.label}>Plot type</label>
            <select className={styles.select} {...register('plotType')}>
              <option>Full Plot</option>
              <option>Half Plot</option>
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>No. of plots</label>
            <input className={styles.input} type="number" min={0.5} step={0.5} {...register('noPlots')} />
          </div>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Unit price (GHS) *</label>
          <input className={styles.input} type="number" {...register('unitPrice')} />
          {errors.unitPrice && <div className={styles.err}>{errors.unitPrice.message}</div>}
        </div>
        <div className={canLogDeposit ? styles.grid2 : undefined}>
          <div className={styles.field}>
            <label className={styles.label}>Payment plan</label>
            <select className={styles.select} {...register('paymentPlan')}>
              <option>Full Payment</option>
              <option>3 Months</option>
              <option>6 Months</option>
              <option>9 Months</option>
              <option>12 Months</option>
            </select>
          </div>
          {canLogDeposit && (
            <div className={styles.field}>
              <label className={styles.label}>Amount already paid</label>
              <input className={styles.input} type="number" {...register('amtPaid')} />
              <p className={styles.hint}>Recorded as a real payment against this lead, same as Log Payment.</p>
            </div>
          )}
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Notes</label>
          <input className={styles.input} placeholder="Context, preferences, history…" {...register('notes')} />
        </div>
        <p className={styles.grandTotal}>Grand total: {ghs(grandTotal)}</p>
        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={() => navigate('/app/sales/pipeline')}>
            Cancel
          </button>
          <button type="submit" className={styles.save} disabled={createLead.isPending}>
            {createLead.isPending ? 'Saving…' : 'Save lead'}
          </button>
        </div>
      </form>
    </div>
  );
}
