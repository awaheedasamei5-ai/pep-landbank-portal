import { useState } from 'react';
import { Link } from 'react-router';
import { ghs } from '../../../shared/lib/format';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { useDownloadTechnicalQuotationPdf } from '../hooks/useTechnicalQuotationPdf';
import { computeTechnicalQuotationTotals, techCustomLotArea, type PaymentPlanKey, type TechLot, type TechLotShape } from '../lib/quotationLogic';
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
  const { data: config, isLoading } = useConfig();
  const [clientName, setClientName] = useState('');
  const [clientContact, setClientContact] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [fullCount, setFullCount] = useState(0);
  const [halfCount, setHalfCount] = useState(0);
  const [lots, setLots] = useState<TechLot[]>([]);
  const [plan, setPlan] = useState<PaymentPlanKey>('12 Months');
  const downloadPdf = useDownloadTechnicalQuotationPdf();

  const totals = config ? computeTechnicalQuotationTotals(config, fullCount, halfCount, lots, plan, null) : null;
  const hasAnyPlot = fullCount > 0 || halfCount > 0 || lots.length > 0;

  function updateLot(i: number, patch: Partial<TechLot>) {
    setLots((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function removeLot(i: number) {
    setLots((prev) => prev.filter((_, idx) => idx !== i));
  }

  return (
    <div className={styles.wrap}>
      <Link to="/app/office/quotation" className={styles.backLink}>
        &larr; Standard Quotation
      </Link>
      <div className={styles.eyebrow}>Technical Quotation</div>
      <h1 className={styles.title}>Custom land area pricing</h1>
      <p className={styles.sub}>Standard plots plus any custom/irregular lots, all priced at one dynamic GHS/sq.ft rate &mdash; never a hardcoded figure.</p>

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
      </div>

      {totals && (
        <>
          <div className={styles.card}>
            {totals.fullCount > 0 && <SummaryRow label={`Full Plots × ${totals.fullCount}`} value={sqft(totals.fullArea)} />}
            {totals.halfCount > 0 && <SummaryRow label={`Half Plots × ${totals.halfCount}`} value={sqft(totals.halfArea)} />}
            {totals.customArea > 0 && <SummaryRow label={`Custom plots (${totals.customLots.length})`} value={sqft(totals.customArea)} />}
            <SummaryRow label="Combined total area" value={sqft(totals.totalArea)} />
            <SummaryRow label="Dynamic rate" value={ghsPerSqft(totals.rate)} />
            {totals.interestTotal > 0 && <SummaryRow label={`Interest (${plan})`} value={ghs(totals.interestTotal)} />}
            <SummaryRow label="Total" value={ghs(totals.grand)} strong />
          </div>

          {totals.planMonths > 0 ? (
            <>
              <div className={styles.card}>
                <SummaryRow label="Deposit (30% of net)" value={ghs(totals.deposit)} />
                <SummaryRow label="Balance after deposit" value={ghs(totals.balance)} />
                <SummaryRow label={`Monthly due (${totals.planMonths} months)`} value={ghs(totals.monthlyDue)} strong />
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
                        <td>{ghs(row.opening)}</td>
                        <td>{ghs(row.payment)}</td>
                        <td>{ghs(row.closing)}</td>
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
            {downloadPdf.isPending ? 'Generating…' : !hasAnyPlot ? 'Add at least one plot' : '⬇ Download PDF'}
          </button>
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
