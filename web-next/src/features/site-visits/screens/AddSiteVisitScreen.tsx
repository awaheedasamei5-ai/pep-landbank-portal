import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router';
import { z } from 'zod';
import { useCreateSiteVisit, useSiteVisits, findDuplicateVisit } from '../hooks/useSiteVisits';
import { useSessionStore } from '../../../auth/useSessionStore';
import { friendlyError } from '../../../shared/lib/friendlyError';
import { useClients } from '../../clients/hooks/useClients';
import { clientKey } from '../../clients/lib/groupClients';
import { DAY_DEFAULT_TIME, fmtLongDate, upcomingDatesForDay } from '../../site-visit-auth/lib/siteVisitAuthLogic';
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

// Master Spec 9.1's real weekly schedule (Monday-Saturday 9:00am, Sunday
// 12:00pm) displayed in business-week order, not JS's Sunday-first order.
const DAY_CHIPS: { label: string; dow: number }[] = [
  { label: 'Mon', dow: 1 },
  { label: 'Tue', dow: 2 },
  { label: 'Wed', dow: 3 },
  { label: 'Thu', dow: 4 },
  { label: 'Fri', dow: 5 },
  { label: 'Sat', dow: 6 },
  { label: 'Sun', dow: 0 },
];

export function AddSiteVisitScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const profile = useSessionStore((s) => s.profile);
  // Optional prefill from Pipeline Detail's "Log a visit" link -- links
  // this visit to a real lead via the new site_visits.lead_id FK instead
  // of leaving it to a name/contact guess later (Master Spec Section 4).
  const leadId = searchParams.get('leadId') ?? undefined;
  const prefillName = searchParams.get('name') ?? '';
  const prefillContact = searchParams.get('contact') ?? '';
  const createSiteVisit = useCreateSiteVisit();
  const { data: myVisits } = useSiteVisits();
  const { data: clients } = useClients();
  const [confirmed, setConfirmed] = useState<{ name: string; site: string; visitDate: string; visitTime: string | null } | null>(null);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [selectedDow, setSelectedDow] = useState<number>(today.getDay());
  const [duplicateOverride, setDuplicateOverride] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      visitDate: upcomingDatesForDay(today.getDay(), 1)[0],
      visitTime: DAY_DEFAULT_TIME[today.getDay()],
      name: prefillName,
      contact: prefillContact,
    },
  });

  const upcomingDates = useMemo(() => upcomingDatesForDay(selectedDow, 6), [selectedDow]);
  const watchedDate = watch('visitDate');
  const watchedName = watch('name') || '';
  const watchedContact = watch('contact') || '';

  function pickDay(dow: number) {
    setSelectedDow(dow);
    const dates = upcomingDatesForDay(dow, 1);
    setValue('visitDate', dates[0]);
    setValue('visitTime', DAY_DEFAULT_TIME[dow]);
    setDuplicateOverride(false);
  }

  const duplicate = useMemo(
    () => (watchedName.trim() && watchedContact.trim() && watchedDate ? findDuplicateVisit(myVisits ?? [], watchedName, watchedContact, watchedDate) : null),
    [myVisits, watchedName, watchedContact, watchedDate]
  );
  const isManager = profile?.role === 'manager';
  // Master Spec 9.3: "Prefill client from Pipeline where possible; allow
  // new client only with explicit confirmation." A prefilled link from
  // Pipeline's own "Log a visit" action always matches (it came from a
  // real lead); this only surfaces once someone types a name/contact by
  // hand that doesn't match anyone on file -- a heads-up, not a hard
  // block, same weight as AddLeadScreen's own duplicate-client hint.
  const isKnownClient = useMemo(() => {
    if (!watchedName.trim() || !watchedContact.trim()) return true;
    if (leadId) return true;
    const key = clientKey(watchedName, watchedContact);
    return (clients ?? []).some((c) => clientKey(c.name, c.contact) === key);
  }, [clients, watchedName, watchedContact, leadId]);

  async function onSubmit(values: FormValues) {
    setSaveError(null);
    if (duplicate && !(isManager && duplicateOverride)) return;
    try {
      const rec = await createSiteVisit.mutateAsync({
        ...values,
        people: values.people ? Number(values.people) : undefined,
        leadId,
      });
      // Master Spec 9.3: "Show confirmation with date, time, client and
      // logistics" -- stays on this screen with a summary rather than
      // immediately navigating away, so the confirmation is actually seen.
      setConfirmed({ name: rec.name, site: rec.site, visitDate: rec.visitDate, visitTime: rec.visitTime });
    } catch (e) {
      setSaveError(friendlyError(e, 'Failed to save this visit'));
    }
  }

  if (confirmed) {
    return (
      <div className={styles.wrap}>
        <div className={styles.confirmCard}>
          <div className={styles.confirmCheck}>✓</div>
          <h1 className={styles.title}>Visit logged</h1>
          <p className={styles.sub}>
            {confirmed.name} · {fmtLongDate(confirmed.visitDate)} {confirmed.visitTime ? `at ${confirmed.visitTime}` : ''} · {confirmed.site}
          </p>
          <p className={styles.confirmNote}>Management has been notified. You can log another visit or head back to your visits list.</p>
          <div className={styles.actions}>
            <button type="button" className={styles.cancel} onClick={() => setConfirmed(null)}>
              Log another
            </button>
            <button type="button" className={styles.save} onClick={() => navigate(leadId ? `/app/sales/pipeline/${leadId}` : '/app/sales/sitevisits')}>
              Done
            </button>
          </div>
        </div>
      </div>
    );
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
        {!isKnownClient && (
          <p className={styles.newClientNote}>No matching record in Pipeline or the Client Database — confirm this is genuinely a new client before saving.</p>
        )}

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

        <div className={styles.field}>
          <label className={styles.label}>Day of visit — Monday to Saturday 9:00am, Sunday 12:00pm</label>
          <div className={styles.dayChipRow}>
            {DAY_CHIPS.map((d) => (
              <button key={d.dow} type="button" className={`${styles.dayChip} ${selectedDow === d.dow ? styles.dayChipOn : ''}`} onClick={() => pickDay(d.dow)}>
                {d.label}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.grid2}>
          <div className={styles.field}>
            <label className={styles.label}>Exact date *</label>
            <select className={styles.select} {...register('visitDate')}>
              {upcomingDates.map((iso) => (
                <option key={iso} value={iso}>
                  {fmtLongDate(iso)}
                </option>
              ))}
            </select>
            {errors.visitDate && <div className={styles.err}>{errors.visitDate.message}</div>}
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Time</label>
            <input className={styles.input} value={DAY_DEFAULT_TIME[selectedDow]} disabled readOnly />
          </div>
        </div>

        {duplicate && (
          <div className={styles.dupWarning}>
            <p>
              {watchedName} already has a visit logged for {fmtLongDate(watchedDate)}. Prevent duplicate bookings unless Management explicitly allows it.
            </p>
            {isManager ? (
              <label className={styles.dupOverrideRow}>
                <input type="checkbox" checked={duplicateOverride} onChange={(e) => setDuplicateOverride(e.target.checked)} />
                Book anyway
              </label>
            ) : (
              <p className={styles.dupNote}>Ask a manager if this visit genuinely needs to be booked again.</p>
            )}
          </div>
        )}

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

        {saveError && <div className={styles.err}>{saveError}</div>}

        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={() => navigate('/app/sales/sitevisits')}>
            Cancel
          </button>
          <button type="submit" className={styles.save} disabled={createSiteVisit.isPending || (!!duplicate && !(isManager && duplicateOverride))}>
            {createSiteVisit.isPending ? 'Saving…' : 'Save visit'}
          </button>
        </div>
      </form>
    </div>
  );
}
