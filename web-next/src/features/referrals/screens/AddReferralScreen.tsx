import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { useLeads } from '../../pipeline/hooks/useLeads';
import { useCreateReferral } from '../hooks/useReferrals';
import styles from './AddReferralScreen.module.css';

// The referrer must be picked from the agent's own existing leads, not
// typed freely -- this isn't a UI preference, it mirrors a real constraint:
// production RLS only lets an agent see a referral back afterward if its
// referrer_lead_id points at one of their own leads (see the Referral
// type's comment in types/domain.ts). Typing a name that doesn't match a
// real lead would create a referral the agent could never see again.
const schema = z.object({
  referrerLeadId: z.string().min(1, 'Pick which of your clients referred them'),
  referredName: z.string().trim().min(1, 'Required'),
  referredContact: z.string().trim().min(1, 'Required'),
  referredLocation: z.string().optional(),
  referredNoPlots: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export function AddReferralScreen() {
  const navigate = useNavigate();
  const { data: leads } = useLeads();
  const createReferral = useCreateReferral();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    await createReferral.mutateAsync({
      referrerLeadId: values.referrerLeadId,
      referredName: values.referredName,
      referredContact: values.referredContact,
      referredLocation: values.referredLocation,
      referredNoPlots: values.referredNoPlots ? Number(values.referredNoPlots) : undefined,
    });
    navigate('/app/sales/referrals');
  }

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>Add a referral</h1>
      <p className={styles.sub}>Record that one of your clients referred someone new.</p>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className={styles.field}>
          <label className={styles.label}>Referred by *</label>
          <select className={styles.select} {...register('referrerLeadId')} defaultValue="">
            <option value="" disabled>
              Pick one of your clients…
            </option>
            {leads?.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.contact})
              </option>
            ))}
          </select>
          {errors.referrerLeadId && <div className={styles.err}>{errors.referrerLeadId.message}</div>}
          {leads && leads.length === 0 && <div className={styles.hint}>You need at least one lead in your pipeline first.</div>}
        </div>

        <div className={styles.field}>
          <label className={styles.label}>New person's name *</label>
          <input className={styles.input} placeholder="e.g. Yaw Danso" {...register('referredName')} />
          {errors.referredName && <div className={styles.err}>{errors.referredName.message}</div>}
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Contact *</label>
          <input className={styles.input} placeholder="0244…" {...register('referredContact')} />
          {errors.referredContact && <div className={styles.err}>{errors.referredContact.message}</div>}
        </div>
        <div className={styles.grid2}>
          <div className={styles.field}>
            <label className={styles.label}>Location</label>
            <input className={styles.input} placeholder="e.g. Tema" {...register('referredLocation')} />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>No. of plots interested</label>
            <input className={styles.input} type="number" min={0.5} step={0.5} {...register('referredNoPlots')} />
          </div>
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={() => navigate('/app/sales/referrals')}>
            Cancel
          </button>
          <button type="submit" className={styles.save} disabled={createReferral.isPending}>
            {createReferral.isPending ? 'Saving…' : 'Save referral'}
          </button>
        </div>
      </form>
    </div>
  );
}
