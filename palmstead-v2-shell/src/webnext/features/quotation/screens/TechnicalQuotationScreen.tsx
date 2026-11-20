"use client";

import { useState } from 'react';
import { Download } from 'lucide-react';
import { Link } from 'react-router';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { useDownloadTechnicalQuotationPdf } from '../hooks/useTechnicalQuotationPdf';
import { computeTechnicalQuotationTotals, defaultDepositPctFraction, quoteMoney, techCustomLotArea, type DepositOverride, type QuoteDiscountOverride, type PaymentPlanKey, type TechLot, type TechLotShape } from '../lib/quotationLogic';
import { QuotationAppTabs, type QuotationAppTab } from './QuotationAppTabs';
import { TemplateSettingsTab } from './TemplateSettingsTab';
import { PricingQuotationSettingsTab } from './PricingQuotationSettingsTab';
import styles from './TechnicalQuotationScreen.module.css';

const PLANS: PaymentPlanKey[] = ['Full Payment', '3 Months', '6 Months', '9 Months', '12 Months'];

function sqft(x: number): string {
  return x.toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' sq ft';
}

function ghsPerSqft(x: number): string {
  return 'GHS ' + x.toLocaleString('en-US', { maximumFractionDigits: 4 }) + '/sq.ft';
}

function emptyLot(): TechLot {
  return { shape: 'rectangular', len: '', wid: '', a: '', b: '', h: '' };
}

// Port of index.html's openTechnicalQuotationRequest()/
// computeTechnicalQuotationTotals() (index.html:16734-16840) -- geometry-
// driven pricing: any number of standard Full/Half Plots plus any number
// of custom/irregular lots (rectangular or trapezoidal), all priced at
// one dynamic GHS/sqft rate. Deposit stays fixed at the standard 30%
// (config.targets-style per-quote overrides aren't modeled in web-next's
// Standard Quotation screen either -- same established scope-narrowing).
export function TechnicalQuotationScreen() {
  const isManager = useSessionStore((s) => s.profile?.role === 'manager');
  const { data: config, isLoading } = useConfig();
  const [activeTab, setActiveTab] = useState<QuotationAppTab>('calculator');
  const [clientName, setClientName] = useState('');
  const [clientContact, setClientContact] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [fullCount, setFullCount] = useState(0);
  const [halfCount, setHalfCount] = useState(0);
  const [lots, setLots] = useState<TechLot[]>([]);
  const [plan, setPlan] = useState<PaymentPlanKey>('12 Months');
  // Real client-preference request: whether the 30% deposit is calculated
  // on the net price alone (standard, matches Standard Quotation's own
  // fixed behavior) or on net+interest together, before it's spread over
  // the chosen months. Technical Quotation only -- computeInstallmentPlan
  // defaults to the old net-only behavior everywhere else it's called.
  const [depositIncludesInterest, setDepositIncludesInterest] = useState(false);
  const [depositMode, setDepositMode] = useState<'standard' | 'percent' | 'amount'>('standard');
  const [depositPercentInput, setDepositPercentInput] = useState('');
  const [depositAmountInput, setDepositAmountInput] = useState('');
  const [discountMode, setDiscountMode] = useState<'none' | 'percent' | 'amount'>('none');
  const [discountInput, setDiscountInput] = useState('');
  const downloadPdf = useDownloadTechnicalQuotationPdf();

  const baseTotals = config ? computeTechnicalQuotationTotals(config, fullCount, halfCount, lots, plan, null, depositIncludesInterest) : null;
  const discountValue = Number(discountInput);
  const discountError = discountMode === 'none' ? '' :
    !discountInput.trim() ? 'Enter the quotation discount.' :
    discountMode === 'amount' && !/^\d+(?:\.\d{1,2})?$/.test(discountInput) ? 'Enter a valid amount with at most two decimal places.' :
    !Number.isFinite(discountValue) || discountValue < 0 || (discountMode === 'percent' ? discountValue > 100 : discountValue > (baseTotals?.gross ?? 0))
      ? discountMode === 'percent' ? 'Discount percent must be between 0 and 100.' : `Discount cannot exceed ${quoteMoney(baseTotals?.gross ?? 0)}.` : '';
  const discountOverride: QuoteDiscountOverride = discountMode === 'none' || discountError ? null : { mode: discountMode, value: discountValue };
  const pricedTotals = config && !discountError ? computeTechnicalQuotationTotals(config, fullCount, halfCount, lots, plan, null, depositIncludesInterest, null, discountOverride) : null;
  const depositInput = depositMode === 'amount' ? depositAmountInput : depositPercentInput;
  const depositValue = Number(depositInput);
  const depositError = plan === 'Full Payment' || depositMode === 'standard' ? '' :
    !depositInput.trim() ? 'Enter the deposit before generating this quotation.' :
    depositMode === 'amount' && !/^\d+(?:\.\d{1,2})?$/.test(depositInput) ? 'Enter a valid deposit with at most two decimal places.' :
    !Number.isFinite(depositValue) || depositValue < 0 || (depositMode === 'amount' ? depositValue > (pricedTotals?.grand ?? 0) : depositValue > 100)
      ? depositMode === 'amount' ? `Deposit cannot exceed the quotation total of ${quoteMoney(pricedTotals?.grand ?? 0)}.` : 'Deposit percent must be between 0 and 100.' : '';
  const depositOverride: DepositOverride = plan === 'Full Payment' || depositMode === 'standard' || depositError ? null : { mode: depositMode, value: depositValue };
  const totals = config && !discountError && !depositError ? computeTechnicalQuotationTotals(config, fullCount, halfCount, lots, plan, null, depositIncludesInterest, depositOverride, discountOverride) : null;
  const standardPct = config ? Math.round(defaultDepositPctFraction(config) * 1000) / 10 : 30;
  const hasAnyPlot = fullCount > 0 || halfCount > 0 || lots.length > 0;

  function updateLot(i: number, patch: Partial<TechLot>) {
    setLots((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function removeLot(i: number) {
    setLots((prev) => prev.filter((_, idx) => idx !== i));
  }

  return (
    <div className={styles.wrap}>
      <Link to="/dashboard/quotation" className={styles.backLink}>
        &larr; Standard Quotation
      </Link>
      <div className={styles.eyebrow}>Technical Quotation</div>
      <h1 className={styles.title}>Custom land area pricing</h1>
      <p className={styles.sub}>Standard plots plus any custom/irregular lots, all priced at one dynamic GHS/sq.ft rate &mdash; never a hardcoded figure.</p>

      <QuotationAppTabs activeTab={activeTab} onTabChange={setActiveTab} calculatorLabel="Calculator" isManager={isManager} />

      {activeTab === 'template' && config && <TemplateSettingsTab config={config} />}
      {activeTab === 'pricing' && config && <PricingQuotationSettingsTab config={config} />}

      {activeTab === 'calculator' && (
        <>
      {isLoading && <p style={{ color: 'var(--c-muted)' }}>Loading…</p>}

      <div className={styles.card}>
        <div className={styles.field}>
          <label className={styles.label}>Customer name</label>
          <input className={styles.input} type="text" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Required to download a PDF" />
        </div>
        <div className={styles.grid2}>
          <div className={styles.field}>
            <label className={styles.label}>Contact / phone</label>
            <input className={styles.input} type="text" value={clientContact} onChange={(e) => setClientContact(e.target.value)} />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Email</label>
            <input className={styles.input} type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
          </div>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Address</label>
          <input className={styles.input} type="text" value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} />
        </div>
      </div>

      <div className={styles.sectitle}>Step 1 &middot; Standard plots</div>
      <div className={styles.card}>
        <div className={styles.grid2}>
          <div className={styles.field}>
            <label className={styles.label}>No. of Full Plots {config ? `(${config.techFullPlotLengthFt}×${config.techFullPlotWidthFt} ft)` : ''}</label>
            <input className={styles.input} type="number" min={0} step={1} value={fullCount} onChange={(e) => setFullCount(Math.max(0, Number(e.target.value) || 0))} />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>No. of Half Plots {config ? `(${config.techHalfPlotLengthFt}×${config.techHalfPlotWidthFt} ft)` : ''}</label>
            <input className={styles.input} type="number" min={0} step={1} value={halfCount} onChange={(e) => setHalfCount(Math.max(0, Number(e.target.value) || 0))} />
          </div>
        </div>
      </div>

      <div className={styles.sectitle}>Step 2 &middot; Custom / additional plots</div>
      {lots.map((lot, i) => (
        <LotCard key={i} index={i} lot={lot} onChange={(patch) => updateLot(i, patch)} onRemove={() => removeLot(i)} />
      ))}
      <button type="button" className={styles.addLotBtn} onClick={() => setLots((prev) => [...prev, emptyLot()])}>
        + Add custom / additional plot
      </button>

      <div className={styles.sectitle}>Step 3 &middot; Payment terms</div>
      <div className={styles.card}>
        <div className={styles.field}>
          <label className={styles.label}>Payment plan</label>
          <select className={styles.select} value={plan} onChange={(e) => setPlan(e.target.value as PaymentPlanKey)}>
            {PLANS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="tech-discount-mode">Quotation discount</label>
          <select id="tech-discount-mode" className={styles.select} value={discountMode} onChange={(e) => setDiscountMode(e.target.value as typeof discountMode)}>
            <option value="none">No discount</option>
            <option value="amount">Discount amount (GHS)</option>
            <option value="percent">Discount percent (%)</option>
          </select>
          <p className={styles.fieldHint}>Applied to the area price before plan interest. This quotation only.</p>
        </div>
        {discountMode !== 'none' && <div className={styles.field}>
          <label className={styles.label} htmlFor="tech-discount-value">{discountMode === 'amount' ? 'Discount amount (GHS)' : 'Discount percent (%)'}</label>
          <input id="tech-discount-value" className={styles.input} type="number" min={0} max={discountMode === 'percent' ? 100 : baseTotals?.gross} step={discountMode === 'amount' ? '0.01' : 'any'} value={discountInput} onChange={(e) => setDiscountInput(e.target.value)} aria-invalid={!!discountError} aria-describedby={discountError ? 'tech-discount-error' : undefined} />
          {discountError && <p id="tech-discount-error" className={styles.fieldError} role="alert">{discountError}</p>}
        </div>}
        {plan !== 'Full Payment' && <>
        <div className={styles.field}>
          <label className={styles.label}>Deposit calculation</label>
          <select
            className={styles.select}
            value={depositIncludesInterest ? 'with' : 'without'}
            onChange={(e) => setDepositIncludesInterest(e.target.value === 'with')}
            disabled={depositMode === 'amount'}
          >
            <option value="without">Before interest &mdash; percent of the net price only</option>
            <option value="with">After interest &mdash; percent of net + interest combined</option>
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="tech-deposit-mode">Deposit choice</label>
          <select id="tech-deposit-mode" className={styles.select} value={depositMode} onChange={(e) => setDepositMode(e.target.value as typeof depositMode)}>
            <option value="standard">Standard &mdash; {standardPct}% (Quotation Settings)</option>
            <option value="percent">Custom percent</option>
            <option value="amount">Fixed amount agreed with client</option>
          </select>
        </div>
        {depositMode !== 'standard' && <div className={styles.field}>
          <label className={styles.label} htmlFor="tech-deposit-value">{depositMode === 'amount' ? 'Deposit amount (GHS)' : 'Deposit percent (%)'}</label>
          <input id="tech-deposit-value" className={styles.input} type="number" min={0} max={depositMode === 'amount' ? pricedTotals?.grand : 100} step={depositMode === 'amount' ? '0.01' : 'any'} value={depositMode === 'amount' ? depositAmountInput : depositPercentInput} onChange={(e) => depositMode === 'amount' ? setDepositAmountInput(e.target.value) : setDepositPercentInput(e.target.value)} aria-invalid={!!depositError} aria-describedby={depositError ? 'tech-deposit-error' : undefined} />
          {depositError && <p id="tech-deposit-error" className={styles.fieldError} role="alert">{depositError}</p>}
        </div>}
        </>}
      </div>

      {totals && (
        <>
          <div className={styles.card}>
            {totals.fullCount > 0 && <SummaryRow label={`Full Plots × ${totals.fullCount}`} value={sqft(totals.fullArea)} />}
            {totals.halfCount > 0 && <SummaryRow label={`Half Plots × ${totals.halfCount}`} value={sqft(totals.halfArea)} />}
            {totals.customArea > 0 && <SummaryRow label={`Custom plots (${totals.customLots.length})`} value={sqft(totals.customArea)} />}
            <SummaryRow label="Combined total area" value={sqft(totals.totalArea)} />
            <SummaryRow label="Dynamic rate" value={ghsPerSqft(totals.rate)} />
            <SummaryRow label="Area price" value={quoteMoney(totals.gross)} />
            {totals.discountTotal > 0 && <SummaryRow label="Quotation discount" value={`-${quoteMoney(totals.discountTotal)}`} />}
            <SummaryRow label="Net price before interest" value={quoteMoney(totals.net)} />
            {totals.interestTotal > 0 && <SummaryRow label={`Interest (${plan})`} value={quoteMoney(totals.interestTotal)} />}
            <SummaryRow label="Total" value={quoteMoney(totals.grand)} strong />
          </div>

          {totals.planMonths > 0 ? (
            <>
              <div className={styles.card}>
                <SummaryRow label={depositMode === 'amount' ? 'Deposit (fixed amount)' : `Deposit (${totals.depositPercent}% of ${depositIncludesInterest ? 'net + interest' : 'net'})`} value={quoteMoney(totals.deposit)} />
                <SummaryRow label="Balance after deposit" value={quoteMoney(totals.balance)} />
                <SummaryRow label={`Monthly due (${totals.planMonths} months)`} value={quoteMoney(totals.monthlyDue)} strong />
              </div>

              <div className={styles.sectitle}>Payment schedule</div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Opening</th>
                      <th>Payment</th>
                      <th>Closing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {totals.schedule.map((row) => (
                      <tr key={row.month}>
                        <td>{row.month}</td>
                        <td>{quoteMoney(row.opening)}</td>
                        <td>{quoteMoney(row.payment)}</td>
                        <td>{quoteMoney(row.closing)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            hasAnyPlot && <p className={styles.fullPaymentNote}>Full Payment &mdash; the whole total is due at once, no installment schedule.</p>
          )}

          <button
            type="button"
            className={styles.btn}
            disabled={!clientName.trim() || !hasAnyPlot || downloadPdf.isPending || !config}
            onClick={() =>
              config &&
              downloadPdf.mutate({
                totals,
                client: { name: clientName.trim(), contact: clientContact.trim(), address: clientAddress.trim(), email: clientEmail.trim() },
                config,
              })
            }
          >
            {downloadPdf.isPending ? 'Generating…' : !hasAnyPlot ? 'Add at least one plot' : (<span className="inline-flex items-center gap-1"><Download className="size-4" aria-hidden="true" /> Download PDF</span>)}
          </button>
        </>
      )}
        </>
      )}
    </div>
  );
}

function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={styles.summaryRow}>
      <span className={styles.summaryLabel}>{label}</span>
      <span className={strong ? styles.summaryValStrong : styles.summaryVal}>{value}</span>
    </div>
  );
}

function LotCard({ index, lot, onChange, onRemove }: { index: number; lot: TechLot; onChange: (patch: Partial<TechLot>) => void; onRemove: () => void }) {
  const isTrap = lot.shape === 'trapezoidal';
  return (
    <div className={styles.lotCard}>
      <div className={styles.lotHead}>
        <span className={styles.lotTitle}>Plot {index + 1}</span>
        <button type="button" className={styles.lotRemove} onClick={onRemove}>
          Remove
        </button>
      </div>
      <div className={styles.grid2}>
        <div className={styles.field}>
          <label className={styles.label}>Shape</label>
          <select className={styles.select} value={lot.shape} onChange={(e) => onChange({ shape: e.target.value as TechLotShape })}>
            <option value="rectangular">Rectangular</option>
            <option value="trapezoidal">Trapezoidal</option>
          </select>
        </div>
        {!isTrap ? (
          <div className={styles.field}>
            <label className={styles.label}>Length (ft)</label>
            <input className={styles.input} type="number" min={0} value={lot.len} onChange={(e) => onChange({ len: e.target.value === '' ? '' : Number(e.target.value) })} />
          </div>
        ) : (
          <div className={styles.field}>
            <label className={styles.label}>Height (ft)</label>
            <input className={styles.input} type="number" min={0} value={lot.h} onChange={(e) => onChange({ h: e.target.value === '' ? '' : Number(e.target.value) })} />
          </div>
        )}
      </div>
      {!isTrap ? (
        <div className={styles.field}>
          <label className={styles.label}>Width (ft)</label>
          <input className={styles.input} type="number" min={0} value={lot.wid} onChange={(e) => onChange({ wid: e.target.value === '' ? '' : Number(e.target.value) })} />
        </div>
      ) : (
        <div className={styles.grid2}>
          <div className={styles.field}>
            <label className={styles.label}>Parallel side A (ft)</label>
            <input className={styles.input} type="number" min={0} value={lot.a} onChange={(e) => onChange({ a: e.target.value === '' ? '' : Number(e.target.value) })} />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Parallel side B (ft)</label>
            <input className={styles.input} type="number" min={0} value={lot.b} onChange={(e) => onChange({ b: e.target.value === '' ? '' : Number(e.target.value) })} />
          </div>
        </div>
      )}
      <div className={styles.lotArea}>Sub-area: {sqft(techCustomLotArea(lot))}</div>
    </div>
  );
}

