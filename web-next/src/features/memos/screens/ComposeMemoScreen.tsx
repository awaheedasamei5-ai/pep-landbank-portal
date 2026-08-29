import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useCreateMemo, useStaffDirectory } from '../hooks/useMemos';
import styles from './ComposeMemoScreen.module.css';

const schema = z.object({
  toKey: z.string().min(1, 'Pick a recipient'),
  subject: z.string().trim().min(1, 'Required'),
  bodyHtml: z.string().trim().min(1, 'Required'),
  cc: z.array(z.string()).optional(),
});
type FormValues = z.infer<typeof schema>;

// body_html is real production's column name (rich text intent), but this
// form deliberately captures plain text only -- see the Memo type's
// comment in types/domain.ts for why (avoiding stored-XSS risk without a
// real sanitizer in place for a first-cut screen).
export function ComposeMemoScreen() {
  const navigate = useNavigate();
  const profile = useSessionStore((s) => s.profile);
  const { data: staff } = useStaffDirectory();
  const createMemo = useCreateMemo();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const others = (staff ?? []).filter((s) => s.key !== profile?.key);
  const toKey = watch('toKey');
  const ccOptions = others.filter((s) => s.key !== toKey);

  async function submit(values: FormValues, status: 'draft' | 'sent') {
    const to = others.find((s) => s.key === values.toKey);
    if (!to) return;
    const cc = (values.cc ?? []).map((key) => others.find((s) => s.key === key)).filter((s): s is NonNullable<typeof s> => !!s);
    await createMemo.mutateAsync({ toKey: to.key, toName: to.name, subject: values.subject, bodyHtml: values.bodyHtml, status, cc: cc.map((s) => ({ key: s.key, name: s.name })) });
    navigate('/app/office/memos');
  }

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>Compose memo</h1>
      <p className={styles.sub}>Send internal correspondence to a colleague.</p>
      <form onSubmit={(e) => e.preventDefault()}>
        <div className={styles.field}>
          <label className={styles.label}>To *</label>
          <select className={styles.select} {...register('toKey')} defaultValue="">
            <option value="" disabled>
              Pick a recipient…
            </option>
            {others.map((s) => (
              <option key={s.key} value={s.key}>
                {s.name} {s.role === 'manager' ? '(Management)' : ''}
              </option>
            ))}
          </select>
          {errors.toKey && <div className={styles.err}>{errors.toKey.message}</div>}
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Subject *</label>
          <input className={styles.input} placeholder="e.g. Leave Request Letter" {...register('subject')} />
          {errors.subject && <div className={styles.err}>{errors.subject.message}</div>}
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Message *</label>
          <textarea className={styles.textarea} {...register('bodyHtml')} />
          {errors.bodyHtml && <div className={styles.err}>{errors.bodyHtml.message}</div>}
        </div>

        {ccOptions.length > 0 && (
          <div className={styles.field}>
            <label className={styles.label}>CC (optional)</label>
            <div className={styles.checkGrid}>
              {ccOptions.map((s) => (
                <label className={styles.checkLabel} key={s.key}>
                  <input type="checkbox" value={s.key} {...register('cc')} />
                  {s.name}
                </label>
              ))}
            </div>
          </div>
        )}

        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={() => navigate('/app/office/memos')}>
            Cancel
          </button>
          <button type="button" className={styles.draftBtn} onClick={handleSubmit((v) => submit(v, 'draft'))} disabled={createMemo.isPending}>
            Save as draft
          </button>
          <button type="button" className={styles.sendBtn} onClick={handleSubmit((v) => submit(v, 'sent'))} disabled={createMemo.isPending}>
            {createMemo.isPending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  );
}
