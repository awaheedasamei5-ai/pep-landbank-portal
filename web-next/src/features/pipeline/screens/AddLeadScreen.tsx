import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router';
import { z } from 'zod';
import { useCreateLead, useLeads } from '../hooks/useLeads';
import { previewGrandTotal } from '../lib/pipelineLogic';
import { ghs, today } from '../../../shared/lib/format';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { useClients } from '../../clients/hooks/useClients';
import { clientKey } from '../../clients/lib/groupClients';
import { useBanners } from '../../banners/hooks/useBanners';
import { useCreateReferral, useLinkReferralLead } from '../../referrals/hooks/useReferrals';
import styles from './AddLeadScreen.module.css';

const PRIORITIES = ['High', 'Medium', 'Low'] as const;
// Port of v1's real LEAD_SOURCES constant (index.html:6282) verbatim --
// this is the actual "where did you hear about us?" list production
// uses, not a reinvented shorter one.
const LEAD_SOURCES = ['Banner', 'Referral', 'Facebook', 'Instagram', 'TikTok', 'Google', 'Website', 'Radio', 'TV', 'Other'] as const;

// Port of formAddLead()/readLeadForm() (index.html:14132-14198), widened to
// close a real completeness gap the user caught live: source/priority/
// address/discount/date/site-visit/deposit-target/next-action are all
// real fields v1 captures at intake that this screen didn't. discount and
// depositTarget are kept OUTSIDE the zod-coerced-number pipeline (plain
// string fields, parsed by hand below) rather than z.coerce.number() --
// coercing an empty string through Number() silently becomes 0, which is
// a real distinct value here (an explicit zero) from "leave it blank, use
// the computed default" -- the same string-until-parsed pattern Pipeline
// Detail's own Plot & Pricing edit already uses for discount. leadSource/
// bannerId/referrer fields are deliberately NOT part of the zod schema at
// all -- same reasoning as v1's own collectLeadSourceValue(), a separate
// concern collected at submit time, not a validated form field. KYC
// (nationality/occupation/ID/etc.) is deliberately NOT here -- a real,
// separate, still-unbuilt capture screen of its own.
const schema = z.object({
  name: z.string().trim().min(1, 'Required'),
  contact: z.string().trim().min(1, 'Required'),
  address: z.string().optional(),
  date: z.string().optional(),
  plotType: z.enum(['Full Plot', 'Half Plot']),
  noPlots: z.coerce.number().min(0.5),
  unitPrice: z.coerce.number().min(1, 'Required'),
  discount: z.string().optional(),
  paymentPlan: z.enum(['Full Payment', '3 Months', '6 Months', '9 Months', '12 Months']),
  priority: z.string().optional(),
  siteVisit: z.enum(['No', 'Yes']).optional(),
  depositTarget: z.string().optional(),
  amtPaid: z.coerce.number().min(0),
  nextAction: z.string().optional(),
  notes: z.string().optional(),
});
// z.input (not z.infer/z.output) -- the form's raw field values are
// pre-coercion (string from <input type="number">), zodResolver coerces on
// submit. Using the output type here is the classic RHF+Zod type mismatch.
type FormInput = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

// Premium UI Rebuild spec, Section 6.D/11: "Long forms: two-column
// desktop grid... financial fields visually distinct... calculated
// totals should appear immediately... sticky action bar." Real
// correction, caught live twice now: the first pass was a single flat
// column of plain inputs with large dead space either side on desktop --
// fixed by regrouping into real cards across a main+side grid. The
// second pass then force-stretched the Notes card to fill whatever
// leftover vertical space that left (a real CSS hack, not a real fix --
// see AddLeadScreen.module.css's own history). This version removes that
// stretch entirely: the columns balance because there's real content on
// both sides (this pass added a genuine Details card + a Source card),
// not because a card was forced to grow into empty space.
export function AddLeadScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const profile = useSessionStore((s) => s.profile);
  // Company Leads' own "+ Add lead" passes agentKeyOverride:'company' so
  // this creates into that real pool instead of the signed-in staff
  // member's own pipeline -- see useCreateLead's own comment for why the
  // auto follow-up task is also skipped in that case.
  const prefill = location.state as { name?: string; contact?: string; returnTo?: string; agentKeyOverride?: string } | null;
  const createLead = useCreateLead(prefill?.agentKeyOverride);
  const { data: leads } = useLeads();
  const { data: clients } = useClients();
  const { data: config } = useConfig();
  const { data: banners } = useBanners();
  const createReferral = useCreateReferral();
  const linkReferralLead = useLinkReferralLead();
  const [depositNotice, setDepositNotice] = useState<{ leadId: string; message: string } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Source-attribution sub-state -- deliberately not part of the RHF/zod
  // form (see the schema's own comment above), mirrors v1's
  // LEAD_SOURCE_STATE object exactly: bannerId when the source is
  // Banner, referrer identity when it's a Referral.
  const [source, setSource] = useState('');
  const [bannerArea, setBannerArea] = useState('');
  const [bannerId, setBannerId] = useState('');
  const [referredByExisting, setReferredByExisting] = useState<'yes' | 'no' | ''>('');
  const [referrerQuery, setReferrerQuery] = useState('');
  const [referrer, setReferrer] = useState<{ id: string; name: string; contact: string } | null>(null);
  const [discountMode, setDiscountMode] = useState<'total' | 'perplot'>('total');

  // Client Database's "+ New deal for this client" row action lands here
  // with the client's name/contact pre-filled via router state -- a real,
  // grounded answer to Master Rebuild Spec 17.2's "duplicate detection
  // before creating a new client" requirement: instead of trying to
  // fuzzy-match on submit, the one place a NEW client actually gets typed
  // in is checked live as they type (below), so a would-be duplicate is
  // caught before it's ever saved, not after.
  // `returnTo` lets Master Pipeline's own "+ Add lead" send the agent back
  // to /app/mgr/pipeline instead of the hardcoded /app/sales/pipeline --
  // same reasoning as PipelineDetailScreen's own backTo fix, just threaded
  // through router state since this screen has no other way to know which
  // list it was opened from.
  const returnTo = prefill?.returnTo ?? '/app/sales/pipeline';
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: {
      plotType: 'Full Plot',
      noPlots: 1,
      paymentPlan: 'Full Payment',
      amtPaid: 0,
      date: today(),
      siteVisit: 'No',
      name: prefill?.name ?? '',
      contact: prefill?.contact ?? '',
    },
  });

  // Master Spec Section 4.4: amt_paid is never a free field -- only
  // Elias/Management can actually log a payment at all (real payments_ins
  // RLS), so an ordinary agent never sees this field; the lead is simply
  // created with nothing paid yet, and payments come in through Log
  // Payment afterward like every other payment does.
  const canLogDeposit = profile?.role === 'manager' || profile?.key === 'elias';

  const plotType = watch('plotType') || 'Full Plot';
  const unitPrice = watch('unitPrice') || 0;
  const noPlots = watch('noPlots') || 0;
  const amtPaid = watch('amtPaid') || 0;
  const paymentPlan = watch('paymentPlan') || 'Full Payment';
  const discountRaw = watch('discount');
  const discountNum = discountRaw != null && discountRaw !== '' ? (discountMode === 'perplot' ? Number(discountRaw) * Number(noPlots || 1) : Number(discountRaw)) : null;

  // Real interest-by-payment-plan/discount-aware pricing (previewGrandTotal,
  // same engine Pipeline Detail's own edit already uses), not the naive
  // unitPrice*noPlots this screen used before -- that silently under-priced
  // every lead created on any plan other than Full Payment, since a 3/6/9/
  // 12-month plan's real interest was never included in what got stored.
  // Falls back to the plain multiplication for the one render before
  // config has loaded, rather than crashing on an undefined config.
  const preview = config
    ? previewGrandTotal(config, plotType, Number(noPlots), Number(unitPrice), discountNum, paymentPlan)
    : { net: Number(unitPrice) * Number(noPlots), grand: Number(unitPrice) * Number(noPlots) };
  const grandTotal = preview.grand;
  const balanceAfter = Math.max(grandTotal - Number(amtPaid), 0);
  const depositTargetRaw = watch('depositTarget');
  const depositTargetPreview = depositTargetRaw?.trim() ? Number(depositTargetRaw) : Math.round(preview.net * 0.3);

  const watchedName = watch('name') || '';
  const watchedContact = watch('contact') || '';
  const duplicateClient = useMemo(() => {
    if (!watchedName.trim() || !watchedContact.trim()) return null;
    const key = clientKey(watchedName, watchedContact);
    return (clients ?? []).find((c) => clientKey(c.name, c.contact) === key) ?? null;
  }, [watchedName, watchedContact, clients]);

  const bannerAreas = useMemo(() => Array.from(new Set((banners ?? []).map((b) => b.area))).sort(), [banners]);
  const bannersInArea = useMemo(() => (banners ?? []).filter((b) => b.area === bannerArea), [banners, bannerArea]);

  const referrerMatches = useMemo(() => {
    const q = referrerQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return (leads ?? []).filter((l) => l.name.toLowerCase().includes(q)).slice(0, 6);
  }, [referrerQuery, leads]);

  async function onSubmit(values: FormOutput) {
    setSaveError(null);
    const discount = values.discount?.trim() ? discountNum ?? undefined : undefined;
    const depositTarget = values.depositTarget?.trim() ? Number(values.depositTarget) : undefined;
    const { lead, depositError } = await createLead.mutateAsync({
      ...values,
      address: values.address?.trim() || undefined,
      priority: values.priority || undefined,
      discount,
      depositTarget,
      nextAction: values.nextAction?.trim() || undefined,
      netTotal: preview.net,
      grandTotal: preview.grand,
      leadSource: source || undefined,
      bannerId: source === 'Banner' ? bannerId || undefined : undefined,
    });
    // Mirrors v1's saveNewLead(): a Referral source with an existing
    // client actually picked creates a real Referral row and links it to
    // the brand-new lead -- fire-and-forget the same way v1's own
    // apiInsertReferral call is (a lost referral credit is a lesser harm
    // than losing the lead itself over a secondary write failing).
    if (source === 'Referral' && referrer) {
      try {
        const referral = await createReferral.mutateAsync({ referrerLeadId: referrer.id, referredName: lead.name, referredContact: lead.contact, referredNoPlots: lead.noPlots });
        await linkReferralLead.mutateAsync({ id: referral.id, leadId: lead.id });
      } catch {
        // Non-fatal -- see comment above.
      }
    }
    if (depositError) {
      setDepositNotice({ leadId: lead.id, message: depositError });
      return;
    }
    navigate(returnTo);
  }

  if (depositNotice) {
    return (
      <div className={styles.wrap}>
        <h1 className={styles.title}>Lead saved</h1>
        <p className={styles.err} style={{ marginTop: 8 }}>{depositNotice.message}</p>
        <div className={styles.actions} style={{ marginTop: 16 }}>
          <button type="button" className={styles.save} onClick={() => navigate(`${returnTo}/${depositNotice.leadId}`)}>
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
        <div className={styles.grid}>
          <div className={styles.mainCol}>
            <div className={styles.card}>
              <div className={styles.cardTitle}>Client</div>
              <div className={styles.grid2}>
                <div className={styles.field}>
                  <label className={styles.label}>Lead name *</label>
                  <input className={styles.input} placeholder="e.g. Kwame Mensah" {...register('name')} />
                  {errors.name && <div className={styles.err}>{errors.name.message}</div>}
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Contact *</label>
                  <input className={styles.input} placeholder="e.g. +233 24 400 1234" {...register('contact')} />
                  {errors.contact && <div className={styles.err}>{errors.contact.message}</div>}
                  <p className={styles.hint}>Include the country code for clients outside Ghana (e.g. +44…, +1…).</p>
                </div>
              </div>
              <div className={styles.grid2}>
                <div className={styles.field}>
                  <label className={styles.label}>Date added</label>
                  <input className={styles.input} type="date" {...register('date')} />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Address</label>
                  <input className={styles.input} placeholder="Client's physical address" {...register('address')} />
                </div>
              </div>
              {duplicateClient && (
                <p className={styles.hint}>
                  {duplicateClient.name} is already a client with {duplicateClient.leadCount} {duplicateClient.leadCount === 1 ? 'deal' : 'deals'} on file ({ghs(duplicateClient.totalValue)} total) — saving will add another deal for them, not a new client.
                </p>
              )}
            </div>

            <div className={styles.card}>
              <div className={styles.cardTitle}>Plot &amp; pricing</div>
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
              <div className={styles.field}>
                <label className={styles.label}>Discount (GHS)</label>
                <div className={styles.discModeRow}>
                  <button type="button" className={`${styles.discModeChip} ${discountMode === 'total' ? styles.discModeChipOn : ''}`} onClick={() => setDiscountMode('total')}>
                    Discount is a total
                  </button>
                  <button type="button" className={`${styles.discModeChip} ${discountMode === 'perplot' ? styles.discModeChipOn : ''}`} onClick={() => setDiscountMode('perplot')}>
                    Discount is per plot
                  </button>
                </div>
                <input className={styles.input} type="number" placeholder="Leave blank to use the standard rate" {...register('discount')} />
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
                  <label className={styles.label}>Site visit done?</label>
                  <select className={styles.select} {...register('siteVisit')}>
                    <option>No</option>
                    <option>Yes</option>
                  </select>
                </div>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Deposit target (GHS)</label>
                <input className={styles.input} type="number" placeholder={`auto = 30% (${ghs(depositTargetPreview)})`} {...register('depositTarget')} />
                <p className={styles.hint}>Only matters on an installment plan — the monthly schedule begins once this is fully paid.</p>
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.cardTitle}>Where did they hear about us?</div>
              <div className={styles.field}>
                <select className={styles.select} value={source} onChange={(e) => { setSource(e.target.value); setBannerArea(''); setBannerId(''); setReferredByExisting(''); setReferrer(null); }}>
                  <option value="">Select…</option>
                  {LEAD_SOURCES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
              {source === 'Banner' && (
                <div className={styles.grid2}>
                  <div className={styles.field}>
                    <label className={styles.label}>Area</label>
                    <select className={styles.select} value={bannerArea} onChange={(e) => { setBannerArea(e.target.value); setBannerId(''); }}>
                      <option value="">Select an area…</option>
                      {bannerAreas.map((a) => (
                        <option key={a}>{a}</option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>Banner</label>
                    <select className={styles.select} value={bannerId} onChange={(e) => setBannerId(e.target.value)} disabled={!bannerArea}>
                      <option value="">{bannerArea ? bannersInArea.length ? 'Select a banner…' : 'No banners in this area yet' : 'Select an area first…'}</option>
                      {bannersInArea.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                    <p className={styles.hint}>This lead will count toward this banner's totals in Banner Tracking.</p>
                  </div>
                </div>
              )}
              {source === 'Referral' && (
                <div className={styles.field}>
                  <label className={styles.label}>Referred by an existing client?</label>
                  <div className={styles.discModeRow} style={{ marginBottom: 8 }}>
                    <button type="button" className={`${styles.discModeChip} ${referredByExisting === 'no' ? styles.discModeChipOn : ''}`} onClick={() => { setReferredByExisting('no'); setReferrer(null); }}>
                      No / not sure
                    </button>
                    <button type="button" className={`${styles.discModeChip} ${referredByExisting === 'yes' ? styles.discModeChipOn : ''}`} onClick={() => setReferredByExisting('yes')}>
                      Yes, search for them
                    </button>
                  </div>
                  {referredByExisting === 'yes' && !referrer && (
                    <>
                      <input className={styles.input} placeholder="Start typing their name…" value={referrerQuery} onChange={(e) => setReferrerQuery(e.target.value)} />
                      {referrerMatches.length > 0 && (
                        <div className={styles.pickerList}>
                          {referrerMatches.map((l) => (
                            <button key={l.id} type="button" className={styles.pickerRow} onClick={() => { setReferrer({ id: l.id, name: l.name, contact: l.contact }); setReferrerQuery(''); }}>
                              <div className={styles.pickerName}>{l.name}</div>
                              <div className={styles.pickerMeta}>{l.contact}</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  {referrer && (
                    <p className={styles.hint}>
                      Referred by <strong>{referrer.name}</strong>{' '}
                      <button type="button" className={styles.changeLink} onClick={() => setReferrer(null)}>
                        Change
                      </button>
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className={styles.sideCol}>
            <div className={styles.totalCard}>
              <div className={styles.totalLabel}>Grand total</div>
              <div className={styles.totalValue}>{ghs(grandTotal)}</div>
              {canLogDeposit && Number(amtPaid) > 0 && (
                <div className={styles.totalFootRow}>
                  <div>
                    <div className={styles.totalFootVal}>{ghs(Number(amtPaid))}</div>
                    <div className={styles.totalFootLbl}>Paid now</div>
                  </div>
                  <div>
                    <div className={styles.totalFootVal}>{ghs(balanceAfter)}</div>
                    <div className={styles.totalFootLbl}>Balance</div>
                  </div>
                </div>
              )}
            </div>

            <div className={styles.card}>
              <div className={styles.cardTitle}>Details</div>
              <div className={styles.field}>
                <label className={styles.label}>Priority</label>
                <select className={styles.select} {...register('priority')} defaultValue="Low">
                  <option value="">Not set</option>
                  {PRIORITIES.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Next action</label>
                <input className={styles.input} placeholder="e.g. Follow up Monday" {...register('nextAction')} />
              </div>
            </div>

            {canLogDeposit && (
              <div className={styles.card}>
                <div className={styles.cardTitle}>Deposit</div>
                <div className={styles.field}>
                  <label className={styles.label}>Amount already paid</label>
                  <input className={styles.input} type="number" {...register('amtPaid')} />
                  <p className={styles.hint}>Recorded as a real payment against this lead, same as Log Payment.</p>
                </div>
              </div>
            )}

            <div className={styles.card}>
              <div className={styles.cardTitle}>Notes</div>
              <div className={styles.field}>
                <textarea className={styles.textarea} placeholder="Context, preferences, history…" {...register('notes')} />
              </div>
            </div>
          </div>
        </div>

        {saveError && <p className={styles.err}>{saveError}</p>}
        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={() => navigate(returnTo)}>
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
