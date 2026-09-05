import { useState } from 'react';
import { techBaseAreaSqft, techCustomLotArea, techHalfAreaSqft } from '../../quotation/lib/quotationLogic';
import type { TechLot, TechLotShape } from '../../quotation/lib/quotationLogic';
import type { Config, PlotType } from '../../../types/domain';
import styles from './PartialPlotAdder.module.css';

function emptyLot(): TechLot {
  return { shape: 'rectangular', len: '', wid: '', a: '', b: '', h: '' };
}

function sqft(x: number): string {
  return x.toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' sq ft';
}

// A client standing in front of an irregular/partial lot shouldn't have a
// guessed decimal typed into "No. of plots" -- this reuses Technical
// Quotation's own area math (techCustomLotArea/techBaseAreaSqft/
// techHalfAreaSqft, index.html's computeTechnicalQuotationTotals ported
// in quotationLogic.ts) to turn real dimensions into an exact
// plot-equivalent, then adds it into noPlots. noPlots is already a plain
// fractional numeric field (schema: min 0.5, no integer step enforced at
// the validator, only a UI stepper hint) -- so this needs no new lead
// column and no separate geometry storage, matching v1's own real
// behaviour where Technical Quotation is a calculation aid, never
// something persisted onto a lead record.
export function PartialPlotAdder({ config, plotType, onAdd }: { config: Config; plotType: PlotType; onAdd: (equivalentPlots: number) => void }) {
  const [open, setOpen] = useState(false);
  const [lots, setLots] = useState<TechLot[]>([emptyLot()]);

  const baseArea = plotType === 'Half Plot' ? techHalfAreaSqft(config) : techBaseAreaSqft(config);
  const combinedArea = lots.reduce((s, l) => s + techCustomLotArea(l), 0);
  const equivalent = baseArea > 0 ? combinedArea / baseArea : 0;

  function updateLot(i: number, patch: Partial<TechLot>) {
    setLots((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  if (!open) {
    return (
      <button type="button" className={styles.toggle} onClick={() => setOpen(true)}>
        + Partial / irregular plot in front of them?
      </button>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <span className={styles.title}>Partial plot calculator</span>
        <button type="button" className={styles.closeBtn} onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      <p className={styles.hint}>
        Enter the actual dimensions in front of the client — this works out how much of a standard {plotType} ({sqft(baseArea)}) that is, so the plot count stays exact.
      </p>
      {lots.map((lot, i) => (
        <PartialLotRow key={i} lot={lot} onChange={(patch) => updateLot(i, patch)} onRemove={lots.length > 1 ? () => setLots((prev) => prev.filter((_, idx) => idx !== i)) : undefined} />
      ))}
      <button type="button" className={styles.addLot} onClick={() => setLots((prev) => [...prev, emptyLot()])}>
        + Add another lot
      </button>
      <div className={styles.result}>
        <span className={styles.resultText}>
          {sqft(combinedArea)} total &asymp; <strong>{equivalent.toFixed(2)}</strong> × {plotType}
        </span>
        <button
          type="button"
          className={styles.applyBtn}
          disabled={equivalent <= 0}
          onClick={() => {
            onAdd(Math.round(equivalent * 100) / 100);
            setLots([emptyLot()]);
            setOpen(false);
          }}
        >
          Add to plot count
        </button>
      </div>
    </div>
  );
}

function PartialLotRow({ lot, onChange, onRemove }: { lot: TechLot; onChange: (patch: Partial<TechLot>) => void; onRemove?: () => void }) {
  const isTrap = lot.shape === 'trapezoidal';
  return (
    <div className={styles.lotRow}>
      <div className={styles.lotFields}>
        <select className={styles.select} value={lot.shape} onChange={(e) => onChange({ shape: e.target.value as TechLotShape })}>
          <option value="rectangular">Rectangular</option>
          <option value="trapezoidal">Trapezoidal</option>
        </select>
        {!isTrap ? (
          <>
            <input className={styles.input} type="number" min={0} placeholder="Length (ft)" value={lot.len} onChange={(e) => onChange({ len: e.target.value === '' ? '' : Number(e.target.value) })} />
            <input className={styles.input} type="number" min={0} placeholder="Width (ft)" value={lot.wid} onChange={(e) => onChange({ wid: e.target.value === '' ? '' : Number(e.target.value) })} />
          </>
        ) : (
          <>
            <input className={styles.input} type="number" min={0} placeholder="Side A (ft)" value={lot.a} onChange={(e) => onChange({ a: e.target.value === '' ? '' : Number(e.target.value) })} />
            <input className={styles.input} type="number" min={0} placeholder="Side B (ft)" value={lot.b} onChange={(e) => onChange({ b: e.target.value === '' ? '' : Number(e.target.value) })} />
            <input className={styles.input} type="number" min={0} placeholder="Height (ft)" value={lot.h} onChange={(e) => onChange({ h: e.target.value === '' ? '' : Number(e.target.value) })} />
          </>
        )}
        {onRemove && (
          <button type="button" className={styles.removeLot} onClick={onRemove} aria-label="Remove lot">
            ✕
          </button>
        )}
      </div>
      <div className={styles.lotArea}>{sqft(techCustomLotArea(lot))}</div>
    </div>
  );
}
