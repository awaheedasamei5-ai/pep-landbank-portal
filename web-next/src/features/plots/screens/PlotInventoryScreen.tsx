import { useState } from 'react';
import { ghs } from '../../../shared/lib/format';
import { useSessionStore } from '../../../auth/useSessionStore';
import { Icon } from '../../../shared/ui/Icon';
import type { Plot, PlotStatus, PlotType } from '../../../types/domain';
import { usePlots, useCreatePlot, useDeletePlot, useSplitPlot, useUpdatePlot } from '../hooks/usePlots';
import styles from './PlotInventoryScreen.module.css';

const PLOT_STATUSES: PlotStatus[] = ['Available', 'Running Search', 'Allocated'];
const BADGE_CLASS: Record<PlotStatus, string> = { Available: 'badgeAvailable', 'Running Search': 'badgeRunningSearch', Allocated: 'badgeAllocated', Subdivided: 'badgeSubdivided' };
const DEFAULT_SITE = 'Royal Palm Enclave, Tsopoli';

// Real write capability (plots_ins/plots_upd/plots_del RLS, manager/elias/
// emmanuel only, confirmed live) plus the real split_plot_for_half_sale RPC
// -- both ported to staging for this pass (staging never had unit_kind/
// parent_plot_id columns or that RPC before now). Status vocabulary also
// corrected: a prior version of this screen used invented 'Reserved'/'Sold'
// values that never occur in real data (confirmed via a live `select
// distinct status from plots` -- real values are Available/Running Search/
// Allocated/Subdivided), which silently broke counts and badges for every
// real Allocated or Running Search plot.
export function PlotInventoryScreen() {
  const profile = useSessionStore((s) => s.profile);
  const hasAccess = !!profile && (profile.role === 'manager' || profile.key === 'elias' || profile.key === 'emmanuel');
  const { data: plots, isLoading } = usePlots();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  if (!hasAccess) {
    return (
      <div className={styles.wrap}>
        <h1 className={styles.title}>Plot Inventory</h1>
        <p className={styles.sub}>You don&apos;t have access to plot records. Ask a manager if you need this.</p>
      </div>
    );
  }

  const counts: Record<PlotStatus, number> = { Available: 0, 'Running Search': 0, Allocated: 0, Subdivided: 0 };
  (plots ?? []).forEach((p) => counts[p.status]++);

  const bySite = new Map<string, Plot[]>();
  (plots ?? []).forEach((p) => {
    if (!bySite.has(p.site)) bySite.set(p.site, []);
    bySite.get(p.site)!.push(p);
  });

  return (
    <div className={styles.wrap}>
      <div className={styles.headRow}>
        <div>
          <h1 className={styles.title}>Plot Inventory</h1>
          <p className={styles.sub}>Every plot and its current status</p>
        </div>
        <button type="button" className={styles.addBtn} onClick={() => setAddOpen((v) => !v)}>
          {addOpen ? 'Cancel' : '+ Add plot'}
        </button>
      </div>

      {addOpen && <AddPlotForm defaultSite={plots?.[0]?.site ?? DEFAULT_SITE} onDone={() => setAddOpen(false)} />}

      <div className={styles.summaryRow}>
        <div className={styles.summaryPill}>
          <div className={styles.summaryVal}>{counts.Available}</div>
          <div className={styles.summaryLbl}>Available</div>
        </div>
        <div className={styles.summaryPill}>
          <div className={styles.summaryVal}>{counts['Running Search']}</div>
          <div className={styles.summaryLbl}>Running search</div>
        </div>
        <div className={styles.summaryPill}>
          <div className={styles.summaryVal}>{counts.Allocated}</div>
          <div className={styles.summaryLbl}>Allocated</div>
        </div>
      </div>

      {isLoading && <p className={styles.emptyMsg}>Loading…</p>}
      {[...bySite.entries()].map(([site, sitePlots]) => (
        <div key={site}>
          <div className={styles.site}>
            <span className={styles.siteIcon}>
              <Icon name="map" size={15} />
            </span>
            {site}
            <span className={styles.siteCount}>{sitePlots.length}</span>
          </div>
          {sitePlots
            .filter((p) => p.unitKind === 'whole')
            .map((whole) => {
              const halves = sitePlots.filter((p) => p.parentPlotId === whole.id);
              return (
                <div key={whole.id}>
                  <PlotRow plot={whole} isSelected={selectedId === whole.id} onToggle={() => setSelectedId((cur) => (cur === whole.id ? null : whole.id))} />
                  {selectedId === whole.id && <PlotDetail plot={whole} onClose={() => setSelectedId(null)} />}
                  {halves.map((h) => (
                    <div key={h.id}>
                      <PlotRow plot={h} isHalf isSelected={selectedId === h.id} onToggle={() => setSelectedId((cur) => (cur === h.id ? null : h.id))} />
                      {selectedId === h.id && <PlotDetail plot={h} onClose={() => setSelectedId(null)} />}
                    </div>
                  ))}
                </div>
              );
            })}
        </div>
      ))}
      {plots && plots.length === 0 && !isLoading && <p className={styles.emptyMsg}>No plots added yet. Add your first one above.</p>}
    </div>
  );
}

function PlotRow({ plot, isHalf, isSelected, onToggle }: { plot: Plot; isHalf?: boolean; isSelected: boolean; onToggle: () => void }) {
  return (
    <button type="button" className={`${styles.row} ${isHalf ? styles.rowHalf : ''} ${isSelected ? styles.rowSelected : ''}`} onClick={onToggle}>
      <div>
        <div className={styles.plotNumber}>{plot.plotNumber}</div>
        <div className={styles.meta}>
          {plot.plotType}
          {plot.clientName ? ` · ${plot.clientName}` : ''}
        </div>
      </div>
      <div className={styles.right}>
        {plot.price != null && <div className={styles.price}>{ghs(plot.price)}</div>}
        <span className={`${styles.badge} ${styles[BADGE_CLASS[plot.status]]}`}>{plot.status}</span>
      </div>
    </button>
  );
}

function AddPlotForm({ defaultSite, onDone }: { defaultSite: string; onDone: () => void }) {
  const create = useCreatePlot();
  const [plotNumber, setPlotNumber] = useState('');
  const [plotType, setPlotType] = useState<PlotType>('Full Plot');
  const [price, setPrice] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!plotNumber.trim()) {
      setError('Enter a plot number');
      return;
    }
    setError(null);
    try {
      await create.mutateAsync({ site: defaultSite, plotNumber: plotNumber.trim(), plotType, status: 'Available', price: price ? Number(price) : null });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add plot');
    }
  }

  return (
    <div className={styles.formCard}>
      <div className={styles.grid2}>
        <input className={styles.input} placeholder="Plot number, e.g. B14" value={plotNumber} onChange={(e) => setPlotNumber(e.target.value)} />
        <select className={styles.input} value={plotType} onChange={(e) => setPlotType(e.target.value as PlotType)}>
          <option>Full Plot</option>
          <option>Half Plot</option>
        </select>
      </div>
      <input className={styles.input} type="number" placeholder="Price (GHS, optional)" value={price} onChange={(e) => setPrice(e.target.value)} style={{ marginTop: 8 }} />
      {error && <p className={styles.errorMsg}>{error}</p>}
      <button type="button" className={styles.submitBtn} disabled={create.isPending} onClick={submit}>
        {create.isPending ? 'Adding…' : 'Add plot'}
      </button>
    </div>
  );
}

function PlotDetail({ plot, onClose }: { plot: Plot; onClose: () => void }) {
  const update = useUpdatePlot();
  const del = useDeletePlot();
  const split = useSplitPlot();
  const [status, setStatus] = useState<PlotStatus>(plot.status === 'Subdivided' ? 'Available' : plot.status);
  const [price, setPrice] = useState(plot.price != null ? String(plot.price) : '');
  const [clientName, setClientName] = useState(plot.clientName ?? '');
  const [clientContact, setClientContact] = useState(plot.clientContact ?? '');
  const [notes, setNotes] = useState(plot.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<'split' | 'delete' | null>(null);

  const canSplit = plot.status === 'Available' && plot.plotType === 'Full Plot' && plot.unitKind !== 'half' && !plot.parentPlotId;

  async function save() {
    setError(null);
    try {
      await update.mutateAsync({ id: plot.id, patch: { status, price: price ? Number(price) : null, clientName: clientName || null, clientContact: clientContact || null, notes: notes || null } });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    }
  }

  if (plot.status === 'Subdivided') {
    return (
      <div className={styles.detailCard}>
        <p className={styles.helpText}>This plot has been split into {plot.plotNumber}a and {plot.plotNumber}b — manage each half separately below.</p>
        <button type="button" className={styles.cancelBtn} onClick={onClose}>
          Close
        </button>
      </div>
    );
  }

  if (confirming === 'split') {
    return (
      <div className={styles.detailCard}>
        <p className={styles.helpText}>
          Split {plot.plotNumber} into {plot.plotNumber}a and {plot.plotNumber}b (two Half Plots)? {plot.plotNumber} itself stops being directly sellable.
        </p>
        <div className={styles.actionsRow}>
          <button type="button" className={styles.cancelBtn} onClick={() => setConfirming(null)}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.submitBtn}
            style={{ flex: 1, marginTop: 0 }}
            disabled={split.isPending}
            onClick={() => split.mutateAsync(plot.id).then(() => onClose())}
          >
            {split.isPending ? 'Splitting…' : 'Yes, split it'}
          </button>
        </div>
      </div>
    );
  }

  if (confirming === 'delete') {
    return (
      <div className={styles.detailCard}>
        <p className={styles.helpText}>Remove plot {plot.plotNumber} from inventory entirely? This cannot be undone.</p>
        <div className={styles.actionsRow}>
          <button type="button" className={styles.cancelBtn} onClick={() => setConfirming(null)}>
            Cancel
          </button>
          <button type="button" className={styles.dangerBtn} style={{ flex: 1 }} disabled={del.isPending} onClick={() => del.mutateAsync(plot.id).then(() => onClose())}>
            {del.isPending ? 'Deleting…' : 'Yes, delete it'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.detailCard}>
      <div className={styles.grid2}>
        <select className={styles.input} value={status} onChange={(e) => setStatus(e.target.value as PlotStatus)}>
          {PLOT_STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <input className={styles.input} type="number" placeholder="Price (GHS)" value={price} onChange={(e) => setPrice(e.target.value)} />
      </div>
      <div className={styles.grid2} style={{ marginTop: 8 }}>
        <input className={styles.input} placeholder="Client name" value={clientName} onChange={(e) => setClientName(e.target.value)} />
        <input className={styles.input} placeholder="Client contact" value={clientContact} onChange={(e) => setClientContact(e.target.value)} />
      </div>
      <textarea className={styles.input} placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} style={{ marginTop: 8, minHeight: 60 }} />
      {error && <p className={styles.errorMsg}>{error}</p>}
      <div className={styles.actionsRow}>
        <button type="button" className={styles.cancelBtn} onClick={onClose}>
          Close
        </button>
        <button type="button" className={styles.submitBtn} disabled={update.isPending} onClick={save} style={{ flex: 1, marginTop: 0 }}>
          {update.isPending ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      {canSplit && (
        <div className={styles.splitBox}>
          <div className={styles.splitTitle}>Need to sell this as two Half Plots instead?</div>
          <p className={styles.helpText}>
            Splits {plot.plotNumber} into {plot.plotNumber}a and {plot.plotNumber}b — two separate Half Plot units, both Available.
          </p>
          <button type="button" className={styles.cancelBtn} onClick={() => setConfirming('split')}>
            Split into {plot.plotNumber}a / {plot.plotNumber}b
          </button>
        </div>
      )}

      <div className={styles.dangerRow}>
        <button type="button" className={styles.dangerBtn} onClick={() => setConfirming('delete')}>
          Delete plot
        </button>
      </div>
    </div>
  );
}
