import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { useCreateLead } from '../hooks/useLeads';
import { computeGrandTotal } from '../lib/pipelineLogic';
import { ghs } from '../../../shared/lib/format';
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
  const createLead = useCreateLead();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: { plotType: 'Full Plot', noPlots: 1, paymentPlan: 'Full Payment', amtPaid: 0 },
  });

  const unitPrice = watch('unitPrice') || 0;
  const noPlots = watch('noPlots') || 0;
  const grandTotal = computeGrandTotal(Number(unitPrice), Number(noPlots));

  async function onSubmit(values: FormOutput) {
    await createLead.mutateAsync(values);
    navigate('/app/sales/pipeline');
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
        <div className={styles.grid2}>
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
          <div className={styles.field}>
            <label className={styles.label}>Amount already paid</label>
            <input className={styles.input} type="number" {...register('amtPaid')} />
          </div>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Notes</label>
          <input className={styles.input} placeholder="Context, preferences, history…" {...register('notes')} />
        </div>
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>Grand total: {ghs(grandTotal)}</p>
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
