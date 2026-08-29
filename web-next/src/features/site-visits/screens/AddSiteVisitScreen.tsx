import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { useCreateSiteVisit } from '../hooks/useSiteVisits';
import styles from './AddSiteVisitScreen.module.css';

// Covers every real column production's site_visits table actually has
// (confirmed live) except status (server-assigned 'Pending' default) and
// feedbackAfter/keyNextSteps (a post-visit follow-up log, not part of
// creation -- see the SiteVisit type comment in types/domain.ts).
const schema = z.object({
  name: z.string().trim().min(1, 'Required'),
  contact: z.string().trim().min(1, 'Required'),
  site: z.string().trim().min(1, 'Required'),
  plot: z.string().optional(),
  visitDate: z.string().min(1, 'Required'),
  visitTime: z.string().optional(),
  people: z.string().optional(),
  transport: z.string().optional(),
  pickup: z.string().optional(),
  placeOfWork: z.string().optional(),
  position: z.string().optional(),
  nationality: z.string().optional(),
  accompanied: z.string().optional(),
  source: z.string().optional(),
  purpose: z.string().optional(),
  discussionSoFar: z.string().optional(),
  keyUnderstanding: z.string().optional(),
  notes: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export function AddSiteVisitScreen() {
  const navigate = useNavigate();
  const createSiteVisit = useCreateSiteVisit();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { visitDate: new Date().toISOString().slice(0, 10) },
  });

  async function onSubmit(values: FormValues) {
    await createSiteVisit.mutateAsync({
      ...values,
      people: values.people ? Number(values.people) : undefined,
    });
    navigate('/app/sales/sitevisits');
  }

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>Log a site visit</h1>
      <p className={styles.sub}>Saved against your own visits.</p>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className={styles.field}>
          <label className={styles.label}>Client name *</label>
          <input className={styles.input} placeholder="e.g. Kwame Mensah" {...register('name')} />
          {errors.name && <div className={styles.err}>{errors.name.message}</div>}
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Contact *</label>
          <input className={styles.input} placeholder="0244…" {...register('contact')} />
          {errors.contact && <div className={styles.err}>{errors.contact.message}</div>}
        </div>

        <div className={styles.section}>Visit details</div>
        <div className={styles.grid2}>
          <div className={styles.field}>
            <label className={styles.label}>Site *</label>
            <input className={styles.input} placeholder="e.g. Royal Palm Enclave" {...register('site')} />
            {errors.site && <div className={styles.err}>{errors.site.message}</div>}
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Plot</label>
            <input className={styles.input} placeholder="e.g. A-02" {...register('plot')} />
          </div>
        </div>
        <div className={styles.grid2}>
          <div className={styles.field}>
            <label className={styles.label}>Visit date *</label>
            <input className={styles.input} type="date" {...register('visitDate')} />
            {errors.visitDate && <div className={styles.err}>{errors.visitDate.message}</div>}
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Visit time</label>
            <input className={styles.input} placeholder="e.g. Saturday 11:00am" {...register('visitTime')} />
          </div>
        </div>
        <div className={styles.grid2}>
          <div className={styles.field}>
            <label className={styles.label}>No. of people</label>
            <input className={styles.input} type="number" min={1} {...register('people')} />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Transport</label>
            <input className={styles.input} placeholder="e.g. Company bus" {...register('transport')} />
          </div>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Pickup point</label>
          <input className={styles.input} {...register('pickup')} />
        </div>

        <div className={styles.section}>Client profile</div>
        <div className={styles.grid2}>
          <div className={styles.field}>
            <label className={styles.label}>Place of work</label>
            <input className={styles.input} {...register('placeOfWork')} />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Position</label>
            <input className={styles.input} {...register('position')} />
          </div>
        </div>
        <div className={styles.grid2}>
          <div className={styles.field}>
            <label className={styles.label}>Nationality</label>
            <input className={styles.input} {...register('nationality')} />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Accompanied by</label>
            <input className={styles.input} {...register('accompanied')} />
          </div>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Source</label>
          <input className={styles.input} placeholder="e.g. Referral, Walk-in" {...register('source')} />
        </div>

        <div className={styles.section}>Discussion notes</div>
        <div className={styles.field}>
          <label className={styles.label}>Purpose of visit</label>
          <textarea className={styles.textarea} {...register('purpose')} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Discussion so far</label>
          <textarea className={styles.textarea} {...register('discussionSoFar')} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Key understanding</label>
          <textarea className={styles.textarea} {...register('keyUnderstanding')} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Notes</label>
          <textarea className={styles.textarea} {...register('notes')} />
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={() => navigate('/app/sales/sitevisits')}>
            Cancel
          </button>
          <button type="submit" className={styles.save} disabled={createSiteVisit.isPending}>
            {createSiteVisit.isPending ? 'Saving…' : 'Save visit'}
          </button>
        </div>
      </form>
    </div>
  );
}
