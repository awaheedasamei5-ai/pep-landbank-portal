"use client";

import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { ArrowLeft, Check, Download } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router';
import { z } from 'zod';
import { useCreateSiteVisit, useSiteVisits, findDuplicateVisit } from '../hooks/useSiteVisits';
import { useDownloadSiteVisitFormPdf } from '../hooks/useSiteVisitFormPdf';
import { DayLockedCalendar } from '../components/DayLockedCalendar';
import { useSessionStore } from '../../../auth/useSessionStore';
import { getSupabaseClient } from '../../../data/client';
import { friendlyError } from '../../../shared/lib/friendlyError';
import { clientKey } from '../../clients/lib/groupClients';
import { DAY_DEFAULT_TIME, dayTimeLabel, fmtLongDate, upcomingDatesForDay } from '../../site-visit-auth/lib/siteVisitAuthLogic';
import { useLeads } from '../../pipeline/hooks/useLeads';
import { useCompanyLeads } from '../../company-leads/hooks/useCompanyLeads';
import { useAllLeads } from '../../payments/hooks/useLogPayment';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { previewGrandTotal } from '../../pipeline/lib/pipelineLogic';
import type { SiteVisit, PlotType } from '../../../types/domain';
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

// Real client request: booking a site visit for someone new can also
// create a real pipeline lead in one step, instead of a separate trip to
// Add Lead afterward. "Interested in buying" is only a loose preset here
// (not a real plotType/noPlots picker the way Add Lead has), so this is a
// best-effort read of it -- '0.5 Plot' is the only Half Plot preset, every
// other preset (including the custom "More" field) is a Full-Plot count.
function inferPlotTypeAndCount(preset: string, custom: string): { plotType: PlotType; noPlots: number } {
  if (preset === PLOT_MORE) {
    const n = Number(custom);
    return { plotType: n === 0.5 ? 'Half Plot' : 'Full Plot', noPlots: n > 0 ? n : 1 };
  }
  if (preset.startsWith('0.5')) return { plotType: 'Half Plot', noPlots: 0.5 };
  const match = preset.match(/^(\d+(\.\d+)?)/);
  return { plotType: 'Full Plot', noPlots: match ? Number(match[1]) : 1 };
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
  const demoMode = useSessionStore((s) => s.demoMode);
  // Optional prefill from Pipeline Detail's "Log a visit" link -- links
  // this visit to a real lead via the new site_visits.lead_id FK instead
  // of leaving it to a name/contact guess later (Master Spec Section 4).
  const leadId = searchParams.get('leadId') ?? undefined;
  const prefillName = searchParams.get('name') ?? '';
  const prefillContact = searchParams.get('contact') ?? '';
  const createSiteVisit = useCreateSiteVisit();
  const { data: config } = useConfig();
  const downloadPdf = useDownloadSiteVisitFormPdf();
  const { data: myVisits } = useSiteVisits();
  const ownPipelineLeads = useLeads();
  const allPipelineLeads = useAllLeads();
  const companyLeads = useCompanyLeads();
  const companyCreateAccess = useQuery({
    queryKey: ['siteVisitCompanyLeadCreate', profile?.key], enabled: !!profile && !demoMode,
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client) return false;
      const [view, create] = await Promise.all([
        client.rpc('has_permission', { p_key: 'company_leads.view' }),
        client.rpc('has_permission', { p_key: 'company_leads.create' }),
      ]);
      if (view.error || create.error) throw view.error ?? create.error;
      return view.data === true && create.data === true;
    },
  });
  const canCreateCompanyLead = demoMode || profile?.role === 'manager' || companyCreateAccess.data === true;
  const visiblePipelineLeads = useMemo(() => profile?.role === 'manager'
    ? (allPipelineLeads.data ?? [])
    : [...(ownPipelineLeads.data ?? []), ...(companyLeads.data ?? [])],
    [profile?.role, allPipelineLeads.data, ownPipelineLeads.data, companyLeads.data]);
  const isVisibleLeadsLoading = profile?.role === 'manager' ? allPipelineLeads.isLoading : ownPipelineLeads.isLoading || companyLeads.isLoading;
  const [confirmedVisit, setConfirmedVisit] = useState<SiteVisit | null>(null);
  const [confirmedLeadId, setConfirmedLeadId] = useState<string | undefined>(undefined);
  const [interestPreset, setInterestPreset] = useState<string>(PLOT_PRESETS[1]);
  const [interestCustom, setInterestCustom] = useState('');
  const [addToPipeline, setAddToPipeline] = useState(false);
  const [newLeadPool, setNewLeadPool] = useState<'personal' | 'company' | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState(leadId ?? '');

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
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
      visitTime: dayTimeLabel(today.getDay()),
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
  const matchingLeads = useMemo(
    () => watchedName.trim() && watchedContact.trim()
      ? visiblePipelineLeads.filter((lead) => clientKey(lead.name, lead.contact) === clientKey(watchedName, watchedContact))
      : [],
    [visiblePipelineLeads, watchedName, watchedContact]
  );
  const linkedLead = leadId ? visiblePipelineLeads.find((lead) => lead.id === leadId) : undefined;
  const selectedExistingLeadId = (leadId ? linkedLead?.id : undefined) ??
    matchingLeads.find((lead) => lead.id === selectedLeadId)?.id ??
    (matchingLeads.length === 1 ? matchingLeads[0].id : undefined);
  const selectedExistingLead = visiblePipelineLeads.find((lead) => lead.id === selectedExistingLeadId);
  const newLeadPricing = useMemo(() => {
    if (!config) return null;
    const { plotType, noPlots } = inferPlotTypeAndCount(interestPreset, interestCustom);
    return previewGrandTotal(config, plotType, noPlots, 0, null, 'Full Payment');
  }, [config, interestPreset, interestCustom]);

  function pickDay(dow: number) {
    const [nextDate] = upcomingDatesForDay(dow, 1);
    setValue('visitDate', nextDate);
    setValue('visitTime', dayTimeLabel(dow));
    setDuplicateOverride(false);
  }

  function onDateChange(iso: string) {
    if (!iso) return;
    setValue('visitDate', iso);
    setValue('visitTime', dayTimeLabel(new Date(`${iso}T00:00:00`).getDay()));
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
    return matchingLeads.length > 0;
  }, [matchingLeads.length, watchedName, watchedContact, leadId]);

  async function onSubmit(values: FormValues) {
    setSaveError(null);
    if (isVisibleLeadsLoading) {
      setSaveError('Checking this client’s existing pipeline records. Wait a moment, then try again.');
      return;
    }
    if (leadId && (!linkedLead || clientKey(linkedLead.name, linkedLead.contact) !== clientKey(values.name, values.contact))) {
      setSaveError('This visit no longer matches the selected pipeline record. Return to that client and start the booking again.');
      return;
    }
    if (addToPipeline && !newLeadPool) {
      setSaveError('Choose Personal client or Company client before adding this client to a pipeline.');
      return;
    }
    if (addToPipeline && newLeadPool === 'company' && !canCreateCompanyLead) {
      setSaveError('Company Leads creation access is required. Choose a personal lead or ask Management to grant access.');
      return;
    }
    if (addToPipeline && !leadId && !isKnownClient && !config) {
      setSaveError('Pricing settings are still loading. Wait a moment before adding this client to your pipeline.');
      return;
    }
    if (duplicate && !(isManager && duplicateOverride)) return;
    try {
      // The server commits a new lead and visit in one transaction, using
      // the selected pool. Existing clients must choose the exact deal.
      if (matchingLeads.length > 1 && !selectedExistingLeadId) {
        setSaveError('This client has more than one pipeline record. Choose the correct record before saving the visit.');
        return;
      }
      let newLead;
      if (addToPipeline && !leadId && !isKnownClient && config && newLeadPool) {
        const { plotType, noPlots } = inferPlotTypeAndCount(interestPreset, interestCustom);
        const pricing = previewGrandTotal(config, plotType, noPlots, 0, null, 'Full Payment');
        newLead = { pool: newLeadPool, plotType, noPlots, unitPrice: pricing.listPrice,
          discount: pricing.disc, netTotal: pricing.net, grandTotal: pricing.grand };
      }
      const rec = await createSiteVisit.mutateAsync({
        ...values,
        plot: plotValue(interestPreset, interestCustom),
        people: values.people ? Number(values.people) : undefined,
        leadId: selectedExistingLeadId,
        newLead,
        allowDuplicate: isManager && duplicateOverride,
      });
      // Master Spec 9.3: "Show confirmation with date, time, client and
      // logistics" -- stays on this screen with a summary rather than
      // immediately navigating away, so the confirmation is actually seen.
      setConfirmedLeadId(rec.leadId ?? undefined);
      setConfirmedVisit(rec);
    } catch (e) {
      setSaveError(friendlyError(e, addToPipeline ? 'The visit and new lead were not saved. Please check the details and try again.' : 'Failed to save this visit'));
    }
  }

  if (confirmedVisit) {
    return (
      <div className={styles.wrap}>
        <div className={styles.confirmCard}>
          <div className={styles.confirmCheck}><Check className="size-6" aria-hidden="true" /></div>
          <h1 className={styles.title}>Visit logged</h1>
          <p className={styles.sub}>
            {confirmedVisit.name} · {fmtLongDate(confirmedVisit.visitDate)} {confirmedVisit.visitTime ? `at ${confirmedVisit.visitTime}` : ''} · {confirmedVisit.site}
          </p>
          <p className={styles.confirmNote}>
            Management has been notified, and {confirmedVisit.name.split(' ')[0]} has been texted the pick-up details. You can download the request form, log another visit, or head back to your visits list.
          </p>
          {addToPipeline && confirmedLeadId && confirmedLeadId !== leadId && (
            <p className={styles.confirmNote}>{confirmedVisit.name.split(' ')[0]} was added to {newLeadPool === 'company' ? 'Company Leads' : 'your personal pipeline'} and linked to this visit.</p>
          )}
          {confirmedLeadId && !addToPipeline && (
            <p className={styles.confirmNote}>This visit is linked to the existing pipeline record and will appear in the client’s Client 360 history.</p>
          )}
          <button type="button" className={styles.pdfBtn} disabled={downloadPdf.isPending} onClick={() => downloadPdf.mutate(confirmedVisit)}>
            {downloadPdf.isPending ? 'Preparing PDF…' : (<span className="inline-flex items-center gap-1"><Download className="size-4" aria-hidden="true" /> Download request form (PDF)</span>)}
          </button>
          <div className={styles.actions}>
            <button type="button" className={styles.cancel} onClick={() => setConfirmedVisit(null)}>
              Log another
            </button>
            <button type="button" className={styles.save} onClick={() => navigate(confirmedLeadId ? `/dashboard/${addToPipeline ? (newLeadPool === 'company' ? 'company-leads' : 'pipeline') : (selectedExistingLead?.agent === 'company' ? 'company-leads' : 'pipeline')}/${confirmedLeadId}` : '/dashboard/site-visits')}>
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  const backTo = leadId ? `/dashboard/${linkedLead?.agent === 'company' ? 'company-leads' : 'pipeline'}/${leadId}` : '/dashboard/site-visits';

  return (
    <div className={styles.wrap}>
      {/* Real user complaint: no visible way back until the Cancel button
          at the very bottom of this long form. Same destination Cancel
          uses, surfaced immediately at the top too. */}
      <button type="button" className={styles.backLink} onClick={() => navigate(backTo)}>
        <ArrowLeft className="size-4" aria-hidden="true" /> Back
      </button>
      <h1 className={styles.title}>Log a site visit</h1>
      <p className={styles.sub}>Saved against your own visits.</p>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className={styles.grid}>
          <div className={styles.mainCol}>
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
            {matchingLeads.length === 1 && !leadId && (
              <div className={styles.newClientNote} role="status">
                Existing {matchingLeads[0].agent === 'company' ? 'Company Leads' : 'personal pipeline'} record found. This visit will be linked to {matchingLeads[0].plotType} · {matchingLeads[0].stage}; its source cannot be changed here.
              </div>
            )}
            {leadId && selectedExistingLead && (
              <div className={styles.newClientNote} role="status">
                Linked to an existing {selectedExistingLead.agent === 'company' ? 'Company Leads' : 'personal pipeline'} record. The visit will keep that client's current pipeline.
              </div>
            )}
            {matchingLeads.length > 1 && !leadId && (
              <div className={styles.field}>
                <label className={styles.label} htmlFor="site-visit-lead-link">Choose the pipeline record for this visit *</label>
                <select
                  id="site-visit-lead-link"
                  className={styles.select}
                  value={selectedExistingLeadId ?? ''}
                  onChange={(event) => setSelectedLeadId(event.target.value)}
                  required
                >
                  <option value="">Select a record</option>
                  {matchingLeads.map((lead) => (
                    <option key={lead.id} value={lead.id}>
                      {lead.agent === 'company' ? 'Company Leads' : 'Personal pipeline'} · {lead.plotType} · {lead.stage} · {lead.date}
                    </option>
                  ))}
                </select>
                <p className={styles.sub}>Selecting the right record keeps the visit, pipeline, and Client 360 history together.</p>
              </div>
            )}
            {!isKnownClient && (
              <>
                <p className={styles.newClientNote}>No matching record was found. Choose where this client belongs before adding them to a pipeline.</p>
                <fieldset className={styles.poolChoice}>
                  <legend>Client source</legend>
                  <div className={styles.poolOptions}>
                    <label className={styles.poolOption} data-selected={newLeadPool === 'personal'}>
                      <input type="radio" name="newLeadPool" checked={newLeadPool === 'personal'} onChange={() => setNewLeadPool('personal')} />
                      <span><strong>Personal client</strong><small>Only your own staff pipeline</small></span>
                    </label>
                    <label className={styles.poolOption} data-selected={newLeadPool === 'company'} data-disabled={!canCreateCompanyLead}>
                      <input type="radio" name="newLeadPool" checked={newLeadPool === 'company'} disabled={!canCreateCompanyLead} onChange={() => setNewLeadPool('company')} />
                      <span><strong>Company client</strong><small>{canCreateCompanyLead ? 'Shared Company Leads pool' : 'Company Leads access required'}</small></span>
                    </label>
                  </div>
                </fieldset>
                <label className={styles.dupOverrideRow}>
                  <input type="checkbox" checked={addToPipeline} disabled={!newLeadPool} onChange={(e) => setAddToPipeline(e.target.checked)} />
                  Add {watchedName.trim().split(' ')[0] || 'this client'} to {newLeadPool === 'company' ? 'Company Leads' : 'my personal pipeline'} and link this visit
                </label>
                <p className={styles.poolHint}>A booking without this option stays unlinked; it does not create a pipeline record. You can link it later.</p>
                {addToPipeline && <p className={styles.sub}>{newLeadPricing ? `Opening quote: GHS ${newLeadPricing.grand.toLocaleString('en-GH', { minimumFractionDigits: 2 })} after GHS ${newLeadPricing.disc.toLocaleString('en-GH', { minimumFractionDigits: 2 })} standard discount. No payment is recorded.` : 'Loading the current plot price.'}</p>}
              </>
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
                <DayLockedCalendar value={watchedDate} allowedDow={selectedDow} minIso={todayIso} onChange={onDateChange} />
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
          </div>

          <div className={styles.sideCol}>
            <div className={styles.section} style={{ marginTop: 0 }}>
              Accompaniment
            </div>
            <div className={styles.field}>
              <label className={styles.label}>No. of client accompaniment</label>
              <input className={styles.input} type="number" min={0} placeholder="0" {...register('people')} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Who is accompanying?</label>
              <input className={styles.input} placeholder="e.g. Spouse, Relative — leave blank if none" {...register('accompanied')} />
            </div>

            <div className={styles.section}>Notes (optional — can fill now or after the visit)</div>
            <div className={styles.field}>
              <label className={styles.label}>Discussion so far</label>
              <textarea className={styles.textarea} placeholder="What's been discussed with the client so far" {...register('discussionSoFar')} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Key understanding about client</label>
              <textarea className={styles.textarea} placeholder="What matters most to them, budget, timeline" {...register('keyUnderstanding')} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Feedback after site visit</label>
              <textarea className={styles.textarea} placeholder="How the visit actually went" {...register('feedbackAfter')} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Key next steps</label>
              <textarea className={styles.textarea} placeholder="What happens next with this client" {...register('keyNextSteps')} />
            </div>
          </div>
        </div>

        {saveError && <div className={styles.err}>{saveError}</div>}

        <div className={styles.actions}>
          {/* Was hardcoded to /dashboard/site-visits always -- when this
              screen was opened from a lead's own "Log a visit" link
              (leadId set), Cancel silently dropped that context instead
              of returning to the lead, unlike the real submit path a few
              lines up which already gets this right. */}
          <button type="button" className={styles.cancel} onClick={() => navigate(backTo)}>
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

