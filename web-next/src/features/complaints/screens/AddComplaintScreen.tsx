import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { useCreateComplaint } from '../hooks/useComplaints';
import styles from './AddComplaintScreen.module.css';

// "Land / Plot Issue" and "Service Quality" are the real distinct values
// seen in production's category column (confirmed live) -- "Other" plus
// a free-text field covers anything not in that observed set without
// inventing a fake enum.
const CATEGORIES = ['Land / Plot Issue', 'Service Quality', 'Other'] as const;

const schema = z.object({
  name: z.string().trim().min(1, 'Required'),
  contact: z.string().trim().min(1, 'Required'),
  plot: z.string().optional(),
  category: z.string().optional(),
  otherCategory: z.string().optional(),
  priority: z.string().optional(),
  details: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export function AddComplaintScreen() {
  const navigate = useNavigate();
  const createComplaint = useCreateComplaint();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const category = watch('category');

  async function onSubmit(values: FormValues) {
    const category = values.category === 'Other' ? values.otherCategory?.trim() : values.category;
    await createComplaint.mutateAsync({
      name: values.name,
      contact: values.contact,
      plot: values.plot,
      category: category || undefined,
      priority: values.priority || undefined,
      details: values.details,
    });
    navigate('/app/sales/complaints');
  }

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>Log a complaint</h1>
      <p className={styles.sub}>Saved against your own complaints.</p>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className={styles.field}>
          <label className={styles.label}>Client name *</label>
          <input className={styles.input} placeholder="e.g. Kwabena Owusu" {...register('name')} />
          {errors.name && <div className={styles.err}>{errors.name.message}</div>}
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Contact *</label>
          <input className={styles.input} placeholder="0244…" {...register('contact')} />
          {errors.contact && <div className={styles.err}>{errors.contact.message}</div>}
        </div>
        <div className={styles.grid2}>
          <div className={styles.field}>
            <label className={styles.label}>Plot</label>
            <input className={styles.input} placeholder="e.g. A-02" {...register('plot')} />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Priority</label>
            <select className={styles.select} {...register('priority')} defaultValue="">
              <option value="">Select…</option>
              <option>High</option>
              <option>Medium</option>
              <option>Low</option>
            </select>
          </div>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Category</label>
          <select className={styles.select} {...register('category')} defaultValue="">
            <option value="">Select…</option>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        {category === 'Other' && (
          <div className={styles.field}>
            <label className={styles.label}>Describe the category</label>
            <input className={styles.input} {...register('otherCategory')} />
          </div>
        )}
        <div className={styles.field}>
          <label className={styles.label}>Details</label>
          <textarea className={styles.textarea} {...register('details')} />
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={() => navigate('/app/sales/complaints')}>
            Cancel
          </button>
          <button type="submit" className={styles.save} disabled={createComplaint.isPending}>
            {createComplaint.isPending ? 'Saving…' : 'Save complaint'}
          </button>
        </div>
      </form>
    </div>
  );
}
