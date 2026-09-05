import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router';
import { z } from 'zod';
import { useCreateLead } from '../hooks/useLeads';
import { previewGrandTotal } from '../lib/pipelineLogic';
import { ghs } from '../../../shared/lib/format';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { useClients } from '../../clients/hooks/useClients';
import { clientKey } from '../../clients/lib/groupClients';
import styles from './AddLeadScreen.module.css';

const PRIORITIES = ['High', 'Medium', 'Low'] as const;

// Port of formAddLead()/readLeadForm() (index.html:14132-14182), widened to
// close a real completeness gap the user caught live: source/priority/
// address/discount are all real columns with no way to set them at intake
// before this -- staff had to save, then immediately reopen the lead to
// fill them in via Pipeline Detail's own edit sections. discount is kept
// OUTSIDE the zod-coerced-number pipeline (a plain string field, parsed by
// hand below) rather than z.coerce.number() -- coercing an empty string
// through Number() silently becomes 0, which is a real distinct value here
// (an explicit zero discount) from "leave it blank, use the configured
// default", the same string-until-parsed pattern Pipeline Detail's own
// Plot & Pricing edit already uses for this exact field. KYC (nationality/
// occupation/ID/etc.) is deliberately NOT here -- a real, separate, still-
// unbuilt capture screen of its own, not something a quick intake form
// should be stretched to also hold.
const schema = z.object({
  name: z.string().trim().min(1, 'Required'),
  contact: z.string().trim().min(1, 'Required'),
  leadSource: z.string().optional(),
  address: z.string().optional(),
  plotType: z.enum(['Full Plot', 'Half Plot']),
  noPlots: z.coerce.number().min(0.5),
  unitPrice: z.coerce.number().min(1, 'Required'),
  discount: z.string().optional(),
  paymentPlan: z.enum(['Full Payment', '3 Months', '6 Months', '9 Months', '12 Months']),
  priority: z.string().optional(),
  amtPaid: z.coerce.number().min(0),
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
// stretch entirely: the side column now holds three genuinely real cards
// (grand total, a Details card for priority, and Notes), so the columns
// balance because there's real content on both sides, not because one
// card was forced to grow into empty space.
export function AddLeadScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const profile = useSessionStore((s) => s.profile);
  const createLead = useCreateLead();
  const { data: clients } = useClients();
  const { data: config } = useConfig();
  const [depositNotice, setDepositNotice] = useState<{ leadId: string; message: string } | null>(null);
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
  const prefill = location.state as { name?: string; contact?: string; returnTo?: string } | null;
  const returnTo = prefill?.returnTo ?? '/app/sales/pipeline';
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: { plotType: 'Full Plot', noPlots: 1, paymentPlan: 'Full Payment', amtPaid: 0, name: prefill?.name ?? '', contact: prefill?.contact ?? '' },
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
  const discountNum = discountRaw != null && discountRaw !== '' ? Number(discountRaw) : null;

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

  const watchedName = watch('name') || '';
  const watchedContact = watch('contact') || '';
  const duplicateClient = useMemo(() => {
    if (!watchedName.trim() || !watchedContact.trim()) return null;
    const key = clientKey(watchedName, watchedContact);
    return (clients ?? []).find((c) => clientKey(c.name, c.contact) === key) ?? null;
  }, [watchedName, watchedContact, clients]);

  async function onSubmit(values: FormOutput) {
    const discount = values.discount?.trim() ? Number(values.discount) : undefined;
    const { lead, depositError } = await createLead.mutateAsync({
      ...values,
      leadSource: values.leadSource?.trim() || undefined,
      address: values.address?.trim() || undefined,
      priority: values.priority || undefined,
      discount,
      netTotal: preview.net,
      grandTotal: preview.grand,
    });
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
                  <label className={styles.label}>Lead source</label>
                  <input className={styles.input} placeholder="e.g. Referral, Walk-in, Facebook" {...register('leadSource')} />
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
              <div className={styles.grid2}>
                <div className={styles.field}>
                  <label className={styles.label}>Unit price (GHS) *</label>
                  <input className={styles.input} type="number" {...register('unitPrice')} />
                  {errors.unitPrice && <div className={styles.err}>{errors.unitPrice.message}</div>}
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Discount (GHS)</label>
                  <input className={styles.input} type="number" placeholder="Leave blank to use the standard rate" {...register('discount')} />
                </div>
              </div>
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
                <select className={styles.select} {...register('priority')}>
                  <option value="">Not set</option>
                  {PRIORITIES.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
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
