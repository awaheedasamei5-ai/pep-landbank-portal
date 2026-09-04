import { useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { ghs } from '../../../shared/lib/format';
import { useSessionStore } from '../../../auth/useSessionStore';
import { Icon } from '../../../shared/ui/Icon';
import type { Plot, PlotClassification, PlotStatus } from '../../../types/domain';
import { usePlots, useCreatePlot } from '../hooks/usePlots';
import { friendlyError } from '../../../shared/lib/friendlyError';
import styles from './PlotInventoryScreen.module.css';

// All 9: the 4 real values this app's own workflow already produces
// (Available/Running Search/Allocated/Subdivided) plus the 5 Master Spec
// 7.2 adds (Reserved/Held for Approval/Blocked/Disputed/Archived) --
// real schema migration applied 2026-09-04. Every one needs a real color
// here, not just the 4 already in use, or a plot manually set to one of
// the 5 new values would render with an undefined class.
const PLOT_STATUSES: PlotStatus[] = ['Available', 'Running Search', 'Allocated', 'Subdivided', 'Reserved', 'Held for Approval', 'Blocked', 'Disputed', 'Archived'];
const BADGE_CLASS: Record<PlotStatus, string> = {
  Available: 'badgeAvailable',
  'Running Search': 'badgeRunningSearch',
  Allocated: 'badgeAllocated',
  Subdivided: 'badgeSubdivided',
  Reserved: 'badgeReserved',
  'Held for Approval': 'badgeHeldForApproval',
  Blocked: 'badgeBlocked',
  Disputed: 'badgeDisputed',
  Archived: 'badgeArchived',
};
const DOT_CLASS: Record<PlotStatus, string> = {
  Available: 'dotAvailable',
  'Running Search': 'dotRunningSearch',
  Allocated: 'dotAllocated',
  Subdivided: 'dotSubdivided',
  Reserved: 'dotReserved',
  'Held for Approval': 'dotHeldForApproval',
  Blocked: 'dotBlocked',
  Disputed: 'dotDisputed',
  Archived: 'dotArchived',
};
const DEFAULT_SITE = 'Royal Palm Enclave, Tsopoli';

interface Filters {
  status: PlotStatus | '';
  section: string;
  priceMin: string;
  priceMax: string;
}
const EMPTY_FILTERS: Filters = { status: '', section: '', priceMin: '', priceMax: '' };

// Real write capability (plots_ins/plots_upd/plots_del RLS, manager/elias/
// emmanuel only, confirmed live) plus the real split_plot_for_half_sale RPC.
// Status vocabulary corrected to the real live values (Available/Running
// Search/Allocated/Subdivided) -- the Master Spec's own 7-status vocabulary
// (Reserved/Held-for-Approval/.../Blocked/Disputed/Archived) doesn't exist
// in the real schema (confirmed live), and inventing new status values here
// would silently diverge the UI from the actual plots.status column and
// break every RLS/RPC that switches on it -- a real schema change, not a
// UI pass, and needs its own explicit approval before touching production
// data shape.
//
// Premium UI spec Section E: "Replace generic plot tiles with a
// professional inventory board: status legend, filters, search, price
// range and availability summary... Desktop: grid/map-style plot board...
// Plot detail should open as a side drawer on desktop and bottom sheet/
// full page on mobile." Real gap this closes -- the previous version had
// none of the legend/filters/search/price-range, and detail opened inline
// under the row instead of a drawer (the same pattern already fixed for
// Pipeline and Client Database, applied here for consistency). No
// geometry/map data exists for these plots (Master Spec Section 8: "do not
// infer exact plot geometry from pixels without a proper survey"), so the
// desktop "board" is a real status-colored tile grid grouped by section --
// the honest interpretation of "grid/map-style" without fabricating
// coordinates that don't exist.
export function PlotInventoryScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const profile = useSessionStore((s) => s.profile);
  const hasAccess = !!profile && (profile.role === 'manager' || profile.key === 'elias' || profile.key === 'emmanuel');
  const { data: plots, isLoading } = usePlots();
  const [addOpen, setAddOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  const hasDetailOpen = /^\/app\/sales\/plots\/[^/]+$/.test(location.pathname);

  if (!hasAccess) {
    return (
      <div className={styles.wrap}>
        <h1 className={styles.title}>Plot Inventory</h1>
        <p className={styles.sub}>You don&apos;t have access to plot records. Ask a manager if you need this.</p>
      </div>
    );
  }

  const all = plots ?? [];
  const counts: Record<PlotStatus, number> = { Available: 0, 'Running Search': 0, Allocated: 0, Subdivided: 0, Reserved: 0, 'Held for Approval': 0, Blocked: 0, Disputed: 0, Archived: 0 };
  all.forEach((p) => counts[p.status]++);
  const availableValue = all.filter((p) => p.status === 'Available').reduce((s, p) => s + (p.price ?? 0), 0);

  const sections = useMemo(() => Array.from(new Set(all.map((p) => p.section).filter(Boolean))).sort() as string[], [all]);

  const q = query.trim().toLowerCase();
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const filtered = all.filter((p) => {
    if (q && !p.plotNumber.toLowerCase().includes(q) && !(p.clientName ?? '').toLowerCase().includes(q)) return false;
    if (filters.status && p.status !== filters.status) return false;
    if (filters.section && p.section !== filters.section) return false;
    if (filters.priceMin && (p.price ?? 0) < Number(filters.priceMin)) return false;
    if (filters.priceMax && (p.price ?? 0) > Number(filters.priceMax)) return false;
    return true;
  });

  const bySite = new Map<string, Plot[]>();
  filtered.forEach((p) => {
    if (!bySite.has(p.site)) bySite.set(p.site, []);
    bySite.get(p.site)!.push(p);
  });

  return (
    <div className={`${styles.pageRow} ${hasDetailOpen ? styles.pageRowSplit : ''}`}>
      <div className={`${styles.wrap} ${hasDetailOpen ? `${styles.wrapHiddenMobile} ${styles.wrapWithDrawer}` : ''}`}>
        <div className={styles.headRow}>
          <div>
            <h1 className={styles.title}>Plot Inventory</h1>
            <p className={styles.sub}>Every plot and its current status</p>
          </div>
          <div className={styles.headActions}>
            <button type="button" className={styles.reconBtn} onClick={() => navigate('/app/sales/plots/reconciliation')}>
              Reconciliation
            </button>
            <button type="button" className={styles.addBtn} onClick={() => setAddOpen((v) => !v)}>
              {addOpen ? 'Cancel' : '+ Add plot'}
            </button>
          </div>
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
          <div className={`${styles.summaryPill} ${styles.summaryPillWide}`}>
            <div className={styles.summaryVal}>{ghs(availableValue)}</div>
            <div className={styles.summaryLbl}>Available inventory value</div>
          </div>
        </div>

        {/* Status legend -- real colors instead of decoration, matching
            spec's own "strong status colors, not random decoration." */}
        <div className={styles.legend}>
          {PLOT_STATUSES.map((s) => (
            <span key={s} className={styles.legendItem}>
              <span className={`${styles.legendDot} ${styles[DOT_CLASS[s]]}`} />
              {s}
            </span>
          ))}
        </div>

        <div className={styles.searchRow}>
          <div className={styles.searchWrap}>
            <span className={styles.searchIcon}>
              <Icon name="search" size={16} />
            </span>
            <input className={styles.search} placeholder="Search plot number or client…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <button type="button" className={styles.filterToggle} onClick={() => setShowFilters((v) => !v)}>
            Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </button>
        </div>

        {showFilters && (
          <div className={styles.filterPanel}>
            <div className={styles.filterGrid}>
              <label className={styles.filterField}>
                <span>Status</span>
                <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as PlotStatus | '' }))}>
                  <option value="">Any</option>
                  {PLOT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.filterField}>
                <span>Section</span>
                <select value={filters.section} onChange={(e) => setFilters((f) => ({ ...f, section: e.target.value }))}>
                  <option value="">Any</option>
                  {sections.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.filterField}>
                <span>Min price (GHS)</span>
                <input type="number" value={filters.priceMin} onChange={(e) => setFilters((f) => ({ ...f, priceMin: e.target.value }))} />
              </label>
              <label className={styles.filterField}>
                <span>Max price (GHS)</span>
                <input type="number" value={filters.priceMax} onChange={(e) => setFilters((f) => ({ ...f, priceMax: e.target.value }))} />
              </label>
            </div>
            {activeFilterCount > 0 && (
              <button type="button" className={styles.clearFiltersBtn} onClick={() => setFilters(EMPTY_FILTERS)}>
                Clear filters
              </button>
            )}
          </div>
        )}

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

            {/* Desktop board: status-colored tile grid grouped by section.
                Mobile: compact row list (Premium UI spec's own "mobile:
                compact list with status chip"). Both feed the same
                filtered/grouped data. */}
            <PlotBoard plots={sitePlots} navigate={navigate} />
            <PlotList plots={sitePlots} navigate={navigate} />
          </div>
        ))}
        {plots && plots.length === 0 && !isLoading && <p className={styles.emptyMsg}>No plots added yet. Add your first one above.</p>}
        {plots && plots.length > 0 && filtered.length === 0 && !isLoading && <p className={styles.emptyMsg}>No plots match your search/filters.</p>}
      </div>
      <Outlet />
    </div>
  );
}

// Groups a section's plots into board "units": a whole plot on its own, or
// a split parent shown as one connected two-tile group with its real
// children -- Master Spec's own "A half split visually shows the parent
// with two child units and a clear relationship."
//
// Groups by logical unit (a half's own parentPlotId, or its own id for a
// plot with no parent) rather than looking up each whole's children from
// the SAME array -- real bug caught live: a status filter can keep a half
// (e.g. Allocated) while excluding its own Subdivided parent, and the old
// "start from wholes, find their halves" approach silently dropped that
// half entirely, since its parent was never in the filtered array to
// start the lookup from.
//
// A plot is excluded from rendering as its OWN tile whenever some other
// plot in this array points back to it as parentPlotId -- determined from
// the real parent/child links, not from trusting plot.status === 'Subdivided'
// alone. Caught live against real demo data: a plot with two real half-
// children whose own status field was still 'Available' (a seed-data
// inconsistency) rendered as a third, independently-clickable tile
// alongside its own halves -- exactly the "split parent stays sellable"
// bug Master Spec 7.2 rules out ("A split is atomic and cannot leave half
// the transaction completed"). A plot that has real children is never
// shown as its own tile, regardless of what its status column says.
function boardUnits(plots: Plot[]): { key: string; tiles: Plot[] }[] {
  const parentIds = new Set(plots.map((p) => p.parentPlotId).filter((id): id is string => !!id));
  const map = new Map<string, Plot[]>();
  for (const p of plots) {
    if (parentIds.has(p.id)) continue;
    const key = p.parentPlotId ?? p.id;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(p);
  }
  return [...map.entries()].map(([key, tiles]) => ({ key, tiles }));
}

function PlotBoard({ plots, navigate }: { plots: Plot[]; navigate: ReturnType<typeof useNavigate> }) {
  const bySection = new Map<string, Plot[]>();
  plots.forEach((p) => {
    const key = p.section ?? '—';
    if (!bySection.has(key)) bySection.set(key, []);
    bySection.get(key)!.push(p);
  });
  return (
    <div className={styles.board}>
      {[...bySection.entries()].map(([section, secPlots]) => (
        <div key={section} className={styles.boardSection}>
          <div className={styles.boardSectionLabel}>Block {section}</div>
          <div className={styles.boardGrid}>
            {boardUnits(secPlots).map((unit) => (
              <div key={unit.key} className={unit.tiles.length > 1 ? styles.tileGroup : undefined}>
                {unit.tiles.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`${styles.tile} ${styles[`tile_${p.status.replace(/\s/g, '')}`]}`}
                    onClick={() => navigate(`/app/sales/plots/${p.id}`)}
                    title={`${p.plotNumber} · ${p.status}${p.clientName ? ` · ${p.clientName}` : ''}`}
                  >
                    <span className={styles.tileNumber}>{p.plotNumber}</span>
                    {p.price != null && <span className={styles.tilePrice}>{ghs(p.price)}</span>}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PlotList({ plots, navigate }: { plots: Plot[]; navigate: ReturnType<typeof useNavigate> }) {
  return (
    <div className={styles.list}>
      {boardUnits(plots).map((unit) => (
        <div key={unit.key}>
          {unit.tiles.map((p) => (
            <PlotRow key={p.id} plot={p} isHalf={unit.tiles.length > 1} onOpen={() => navigate(`/app/sales/plots/${p.id}`)} />
          ))}
        </div>
      ))}
    </div>
  );
}

function PlotRow({ plot, isHalf, onOpen }: { plot: Plot; isHalf?: boolean; onOpen: () => void }) {
  return (
    <button type="button" className={`${styles.row} ${isHalf ? styles.rowHalf : ''}`} onClick={onOpen}>
      <div>
        <div className={styles.plotNumber}>{plot.plotNumber}</div>
        <div className={styles.meta}>
          {plot.plotType}
          {plot.widthFt != null && plot.lengthFt != null ? ` · ${plot.widthFt}x${plot.lengthFt}ft` : ''}
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
  const [section, setSection] = useState('');
  const [plotType, setPlotType] = useState<PlotClassification>('Full Plot');
  const [price, setPrice] = useState('');
  const [widthFt, setWidthFt] = useState('');
  const [lengthFt, setLengthFt] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!plotNumber.trim()) {
      setError('Enter a plot number');
      return;
    }
    setError(null);
    try {
      await create.mutateAsync({
        site: defaultSite,
        section: section.trim() || null,
        plotNumber: plotNumber.trim(),
        plotType,
        status: 'Available',
        price: price ? Number(price) : null,
        widthFt: widthFt ? Number(widthFt) : null,
        lengthFt: lengthFt ? Number(lengthFt) : null,
      });
      onDone();
    } catch (e) {
      setError(friendlyError(e, 'Failed to add plot'));
    }
  }

  return (
    <div className={styles.formCard}>
      <div className={styles.grid2}>
        <input className={styles.input} placeholder="Plot number, e.g. B14" value={plotNumber} onChange={(e) => setPlotNumber(e.target.value)} />
        <input className={styles.input} placeholder="Section/block, e.g. B" value={section} onChange={(e) => setSection(e.target.value)} />
      </div>
      <div className={styles.grid2} style={{ marginTop: 8 }}>
        <select className={styles.input} value={plotType} onChange={(e) => setPlotType(e.target.value as PlotClassification)}>
          <option>Full Plot</option>
          <option>Half Plot</option>
          <option>Partial Plot</option>
        </select>
        <input className={styles.input} type="number" placeholder="Price (GHS, optional)" value={price} onChange={(e) => setPrice(e.target.value)} />
      </div>
      <div className={styles.grid2} style={{ marginTop: 8 }}>
        <input className={styles.input} type="number" placeholder="Width (ft, optional)" value={widthFt} onChange={(e) => setWidthFt(e.target.value)} />
        <input className={styles.input} type="number" placeholder="Length (ft, optional)" value={lengthFt} onChange={(e) => setLengthFt(e.target.value)} />
      </div>
      {error && <p className={styles.errorMsg}>{error}</p>}
      <button type="button" className={styles.submitBtn} disabled={create.isPending} onClick={submit}>
        {create.isPending ? 'Adding…' : 'Add plot'}
      </button>
    </div>
  );
}
