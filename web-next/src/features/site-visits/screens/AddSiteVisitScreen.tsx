import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router';
import { z } from 'zod';
import { useCreateSiteVisit, useSiteVisits, findDuplicateVisit } from '../hooks/useSiteVisits';
import { useDownloadSiteVisitFormPdf } from '../hooks/useSiteVisitFormPdf';
import { useSessionStore } from '../../../auth/useSessionStore';
import { friendlyError } from '../../../shared/lib/friendlyError';
import { useClients } from '../../clients/hooks/useClients';
import { clientKey } from '../../clients/lib/groupClients';
import { DAY_DEFAULT_TIME, fmtLongDate, upcomingDatesForDay } from '../../site-visit-auth/lib/siteVisitAuthLogic';
import type { SiteVisit } from '../../../types/domain';
import styles from './AddSiteVisitScreen.module.css';

// Real v1 field set/options, ported verbatim (index.html:16213-16240,
// formSiteVisit()) -- "Interested in buying"/Transport/Purpose are all
// real fixed dropdowns in production, not free text the way this screen
// had them before. "Site" stays a free (but defaulted) field rather than
// v1's hardcoded 'Royal Palm Enclave, Tsopoli' string, since unlike v1
// this app's own schema already supports more than one site.
const PLOT_PRESETS = ['0.5 Plot (70x50)', '1 Plot (70x100)', '2 Plots (70x100)', '3 Plots (70x100)'] as const;
const PLOT_MORE = 'More — enter number of plots';
const TRANSPORT_OPTIONS = ['Personal Vehicle', 'Company Vehicle'] as const;
const PURPOSE_OPTIONS = ['Viewing', 'Allocation', 'Picking', 'Others'] as const;

function plotValue(preset: string, custom: string): string {
  if (preset !== PLOT_MORE) return preset;
  const n = Number(custom);
  return n > 0 ? `${n} Plot${n === 1 ? '' : 's'} (custom)` : preset;
}

const schema = z.object({
  name: z.string().trim().min(1, 'Required'),
  contact: z.string().trim().min(1, 'Required'),
  site: z.string().trim().min(1, 'Required'),
  visitDate: z.string().min(1, 'Required'),
  visitTime: z.string().optional(),
  people: z.string().optional(),
  transport: z.string().optional(),
  purpose: z.string().optional(),
  pickup: z.string().optional(),
  placeOfWork: z.string().optional(),
  position: z.string().optional(),
  nationality: z.string().optional(),
  accompanied: z.string().optional(),
  discussionSoFar: z.string().optional(),
  keyUnderstanding: z.string().optional(),
  feedbackAfter: z.string().optional(),
  keyNextSteps: z.string().optional(),
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
  const downloadPdf = useDownloadSiteVisitFormPdf();
  const { data: myVisits } = useSiteVisits();
  const { data: clients } = useClients();
  const [confirmedVisit, setConfirmedVisit] = useState<SiteVisit | null>(null);
  const [interestPreset, setInterestPreset] = useState<string>(PLOT_PRESETS[1]);
  const [interestCustom, setInterestCustom] = useState('');

  const today = new Date();
  today.setHours(0, 0, 0, 0);
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
      site: 'Royal Palm Enclave, Tsopoli',
      visitDate: upcomingDatesForDay(today.getDay(), 1)[0],
      visitTime: DAY_DEFAULT_TIME[today.getDay()],
      transport: TRANSPORT_OPTIONS[0],
      purpose: PURPOSE_OPTIONS[0],
      people: '0',
      name: prefillName,
      contact: prefillContact,
    },
  });

  const watchedDate = watch('visitDate');
  const watchedName = watch('name') || '';
  const watchedContact = watch('contact') || '';
  // The calendar (below) is the real source of truth -- picking a day
  // chip just jumps the calendar to that weekday's nearest date; time is
  // always re-derived from whichever date ends up selected, whichever
  // way it got there (chip or the calendar itself), matching Master Spec
  // 9.1's fixed per-day schedule.
  const selectedDow = watchedDate ? new Date(`${watchedDate}T00:00:00`).getDay() : today.getDay();

  function pickDay(dow: number) {
    const [nextDate] = upcomingDatesForDay(dow, 1);
    setValue('visitDate', nextDate);
    setValue('visitTime', DAY_DEFAULT_TIME[dow]);
    setDuplicateOverride(false);
  }

  function onDateChange(iso: string) {
    if (!iso) return;
    setValue('visitDate', iso);
    setValue('visitTime', DAY_DEFAULT_TIME[new Date(`${iso}T00:00:00`).getDay()]);
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
        plot: plotValue(interestPreset, interestCustom),
        people: values.people ? Number(values.people) : undefined,
        leadId,
      });
      // Master Spec 9.3: "Show confirmation with date, time, client and
      // logistics" -- stays on this screen with a summary rather than
      // immediately navigating away, so the confirmation is actually seen.
      setConfirmedVisit(rec);
    } catch (e) {
      setSaveError(friendlyError(e, 'Failed to save this visit'));
    }
  }

  if (confirmedVisit) {
    return (
      <div className={styles.wrap}>
        <div className={styles.confirmCard}>
          <div className={styles.confirmCheck}>✓</div>
          <h1 className={styles.title}>Visit logged</h1>
          <p className={styles.sub}>
            {confirmedVisit.name} · {fmtLongDate(confirmedVisit.visitDate)} {confirmedVisit.visitTime ? `at ${confirmedVisit.visitTime}` : ''} · {confirmedVisit.site}
          </p>
          <p className={styles.confirmNote}>
            Management has been notified, and {confirmedVisit.name.split(' ')[0]} has been texted the pick-up details. You can download the request form, log another visit, or head back to your visits list.
          </p>
          <button type="button" className={styles.pdfBtn} disabled={downloadPdf.isPending} onClick={() => downloadPdf.mutate(confirmedVisit)}>
            {downloadPdf.isPending ? 'Preparing PDF…' : '⬇ Download request form (PDF)'}
          </button>
          <div className={styles.actions}>
            <button type="button" className={styles.cancel} onClick={() => setConfirmedVisit(null)}>
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
        <div className={styles.section} style={{ marginTop: 0 }}>
          1.0 Client personal information
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Full name *</label>
          <input className={styles.input} placeholder="e.g. Kwame Mensah" {...register('name')} />
          {errors.name && <div className={styles.err}>{errors.name.message}</div>}
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Contact *</label>
          <input className={styles.input} placeholder="e.g. 0244 000 000" {...register('contact')} />
          {errors.contact && <div className={styles.err}>{errors.contact.message}</div>}
        </div>
        {!isKnownClient && (
          <p className={styles.newClientNote}>No matching record in Pipeline or the Client Database — confirm this is genuinely a new client before saving.</p>
        )}
        <div className={styles.field}>
          <label className={styles.label}>Pick-up location</label>
          <input className={styles.input} placeholder="e.g. Tsopoli junction" {...register('pickup')} />
        </div>
        <div className={styles.grid2}>
          <div className={styles.field}>
            <label className={styles.label}>Place of work</label>
            <input className={styles.input} placeholder="e.g. Ministry of Health" {...register('placeOfWork')} />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Position</label>
            <input className={styles.input} placeholder="e.g. Nurse" {...register('position')} />
          </div>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Nationality</label>
          <input className={styles.input} placeholder="e.g. Ghanaian" {...register('nationality')} />
        </div>

        <div className={styles.section}>2.0 Interested in buying</div>
        <div className={styles.field}>
          <select className={styles.select} value={interestPreset} onChange={(e) => setInterestPreset(e.target.value)}>
            {PLOT_PRESETS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
            <option value={PLOT_MORE}>{PLOT_MORE}</option>
          </select>
        </div>
        {interestPreset === PLOT_MORE && (
          <div className={styles.field}>
            <label className={styles.label}>Preferred number of plots</label>
            <input className={styles.input} type="number" min={0.5} step={0.5} placeholder="e.g. 5" value={interestCustom} onChange={(e) => setInterestCustom(e.target.value)} />
          </div>
        )}

        <div className={styles.section}>3.0 Visit preferences</div>
        <div className={styles.grid2}>
          <div className={styles.field}>
            <label className={styles.label}>Mode of transportation</label>
            <select className={styles.select} {...register('transport')}>
              {TRANSPORT_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Purpose of visit</label>
            <select className={styles.select} {...register('purpose')}>
              {PURPOSE_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Site</label>
          <input className={styles.input} {...register('site')} />
          {errors.site && <div className={styles.err}>{errors.site.message}</div>}
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Site visit day — Monday to Saturday 9:00am, Sunday 12:00pm</label>
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
            <input className={styles.input} type="date" min={upcomingDatesForDay(today.getDay(), 1)[0]} value={watchedDate} onChange={(e) => onDateChange(e.target.value)} />
            {errors.visitDate && <div className={styles.err}>{errors.visitDate.message}</div>}
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Time (fixed by day)</label>
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
            <label className={styles.label}>No. of client accompaniment</label>
            <input className={styles.input} type="number" min={0} placeholder="0" {...register('people')} />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Who is accompanying?</label>
            <input className={styles.input} placeholder="e.g. Spouse, Relative — leave blank if none" {...register('accompanied')} />
          </div>
        </div>

        <div className={styles.section}>Notes (optional — can fill now or after the visit)</div>
        <div className={styles.grid2}>
          <div className={styles.field}>
            <label className={styles.label}>Discussion so far</label>
            <textarea className={styles.textarea} placeholder="What's been discussed with the client so far" {...register('discussionSoFar')} />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Key understanding about client</label>
            <textarea className={styles.textarea} placeholder="What matters most to them, budget, timeline" {...register('keyUnderstanding')} />
          </div>
        </div>
        <div className={styles.grid2}>
          <div className={styles.field}>
            <label className={styles.label}>Feedback after site visit</label>
            <textarea className={styles.textarea} placeholder="How the visit actually went" {...register('feedbackAfter')} />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Key next steps</label>
            <textarea className={styles.textarea} placeholder="What happens next with this client" {...register('keyNextSteps')} />
          </div>
        </div>

        {saveError && <div className={styles.err}>{saveError}</div>}

        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={() => navigate('/app/sales/sitevisits')}>
            Cancel
          </button>
          <button type="submit" className={styles.save} disabled={createSiteVisit.isPending || (!!duplicate && !(isManager && duplicateOverride))}>
            {createSiteVisit.isPending ? 'Saving…' : 'Submit request'}
          </button>
        </div>
      </form>
    </div>
  );
}
