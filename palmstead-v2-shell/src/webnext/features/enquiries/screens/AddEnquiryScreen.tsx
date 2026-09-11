"use client";

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { useCreateEnquiry, useEnquiries } from '../hooks/useEnquiries';
import type { Enquiry } from '../../../types/domain';
import styles from './AddEnquiryScreen.module.css';
import listStyles from './EnquiriesScreen.module.css';

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

function statusClass(status: string): string {
  if (status === 'Closed') return listStyles.statusClosed;
  if (status === 'Escalated') return listStyles.statusEscalated;
  return listStyles.statusOpen;
}

// The 5 checkbox options are the real distinct values seen across
// production's enquiries.types (confirmed live) -- "Other" covers
// anything not in that observed set without inventing a fake enum.
const TYPE_OPTIONS = ['Plot Availability', 'Site Visit', 'Price', 'Location', 'Payment Plan'] as const;

const schema = z.object({
  name: z.string().trim().min(1, 'Required'),
  contact: z.string().trim().min(1, 'Required'),
  location: z.string().optional(),
  types: z.array(z.string()).optional(),
  otherType: z.string().optional(),
  plot: z.string().optional(),
  source: z.string().optional(),
  details: z.string().optional(),
  follow: z.boolean().optional(),
  followDate: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export function AddEnquiryScreen() {
  const navigate = useNavigate();
  const createEnquiry = useCreateEnquiry();
  const { data: recentEnquiries } = useEnquiries();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const followChecked = watch('follow');

  async function onSubmit(values: FormValues) {
    const types = [...(values.types ?? [])];
    if (values.otherType?.trim()) types.push(values.otherType.trim());
    await createEnquiry.mutateAsync({
      name: values.name,
      contact: values.contact,
      location: values.location,
      types,
      plot: values.plot,
      source: values.source,
      details: values.details,
      follow: values.follow ? 'Yes' : 'No',
      followDate: values.follow ? values.followDate : undefined,
    });
    navigate('/dashboard/enquiries');
  }

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>Log a client enquiry</h1>
      <p className={styles.sub}>Saved against your own enquiries.</p>
      <div className={styles.grid}>
      <form className={styles.mainCol} onSubmit={handleSubmit(onSubmit)}>
        <div className={styles.field}>
          <label className={styles.label}>Name *</label>
          <input className={styles.input} placeholder="e.g. Justice Amankwah" {...register('name')} />
          {errors.name && <div className={styles.err}>{errors.name.message}</div>}
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Contact *</label>
          <input className={styles.input} placeholder="0244…" {...register('contact')} />
          {errors.contact && <div className={styles.err}>{errors.contact.message}</div>}
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Location</label>
          <input className={styles.input} {...register('location')} />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>What are they asking about?</label>
          <div className={styles.checkGrid}>
            {TYPE_OPTIONS.map((opt) => (
              <label className={styles.checkLabel} key={opt}>
                <input type="checkbox" value={opt} {...register('types')} />
                {opt}
              </label>
            ))}
          </div>
          <input className={`${styles.input} ${styles.otherInput}`} placeholder="Other (optional)" {...register('otherType')} />
        </div>

        <div className={styles.grid2}>
          <div className={styles.field}>
            <label className={styles.label}>Plot interest</label>
            <input className={styles.input} placeholder="e.g. Half Plot" {...register('plot')} />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Source</label>
            <select className={styles.select} {...register('source')} defaultValue="">
              <option value="">Select…</option>
              <option>Phone Call</option>
              <option>Walk-in</option>
              <option>Referral</option>
              <option>Social Media</option>
              <option>Other</option>
            </select>
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Details</label>
          <textarea className={styles.textarea} {...register('details')} />
        </div>

        <div className={styles.field}>
          <label className={styles.followLabel}>
            <input type="checkbox" {...register('follow')} />
            Needs follow-up
          </label>
        </div>
        {followChecked && (
          <div className={styles.field}>
            <label className={styles.label}>Follow-up date</label>
            <input className={styles.input} type="date" {...register('followDate')} />
          </div>
        )}

        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={() => navigate('/dashboard/enquiries')}>
            Cancel
          </button>
          <button type="submit" className={styles.save} disabled={createEnquiry.isPending}>
            {createEnquiry.isPending ? 'Saving…' : 'Save enquiry'}
          </button>
        </div>
      </form>

      <div className={styles.sideCol}>
        <div className={styles.sideCard}>
          <div className={styles.sideTitle}>Recent enquiries</div>
          <p className={styles.sideSub}>The last few logged, for context while you fill this one in.</p>
          {!recentEnquiries?.length && <p className={styles.sideEmpty}>No enquiries logged yet.</p>}
          {recentEnquiries?.slice(0, 6).map((e: Enquiry) => (
            <div key={e.id} className={listStyles.card} style={{ marginBottom: 8 }}>
              <div className={listStyles.top}>
                <span className={listStyles.avatar}>{initials(e.name ?? '?')}</span>
                <div className={listStyles.topMain}>
                  <div className={listStyles.name}>{e.name || 'Unnamed'}</div>
                  <div className={listStyles.meta}>{e.contact}</div>
                </div>
                <span className={`${listStyles.pill} ${statusClass(e.status)}`}>{e.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      </div>
    </div>
  );
}