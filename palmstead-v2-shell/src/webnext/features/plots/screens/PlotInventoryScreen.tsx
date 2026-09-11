"use client";

import { useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { ghs } from '../../../shared/lib/format';
import { useSessionStore } from '../../../auth/useSessionStore';
import { Icon } from '../../../shared/ui/Icon';
import type { Plot, PlotClassification, PlotStatus } from '../../../types/domain';
import { usePlots, useCreatePlot } from '../hooks/usePlots';
import { friendlyError } from '../../../shared/lib/friendlyError';
import { useAllocationRequests } from '../../allocations/hooks/useAllocationRequests';
import { lockedPlotNumbers } from '../../allocations/lib/suggestionCombos';
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

const PLOT_CLASSIFICATIONS: PlotClassification[] = ['Full Plot', 'Half Plot', 'Partial Plot'];

interface Filters {
  status: PlotStatus | '';
  section: string;
  plotType: PlotClassification | '';
  priceMin: string;
  priceMax: string;
}
const EMPTY_FILTERS: Filters = { status: '', section: '', plotType: '', priceMin: '', priceMax: '' };

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
  const { data: allocationRequests } = useAllocationRequests();
  // Real user ask: a plot currently suggested (saved, awaiting Management
  // sign-off) on someone's allocation request should still show here as
  // Available -- its real status column never changes -- but carry a
  // "Suggested" tag so staff browsing inventory know it's provisionally
  // spoken for. See lockedPlotNumbers's own comment.
  const locked = useMemo(() => lockedPlotNumbers(allocationRequests ?? []), [allocationRequests]);
  const [addOpen, setAddOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  const hasDetailOpen = /^\/dashboard\/plots\/[^/]+$/.test(location.pathname);

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
    if (filters.plotType && p.plotType !== filters.plotType) return false;
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
            <button type="button" className={styles.reconBtn} onClick={() => navigate('/dashboard/plots/reconciliation')}>
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
          {/* The two Allocated color variants aren't their own status (the
              real plots.status column has no such value), so they don't
              belong in PLOT_STATUSES/DOT_CLASS -- called out here instead
              so the tile colors aren't left unexplained. */}
          <span className={styles.legendItem}>
            <span className={`${styles.legendDot} ${styles.dotAllocatedSplit}`} />
            Allocated · split
          </span>
          <span className={styles.legendItem}>
            <span className={`${styles.legendDot} ${styles.dotAllocatedPartial}`} />
            Allocated · partial
          </span>
        </div>

        {/* Master Spec 8: "section selector" on both desktop and mobile --
            with 15 real blocks and 415 plots, scrolling past every block to
            reach one isn't a real substitute. Reuses the existing Section
            filter as one-tap chips instead of a second, separate concept. */}
        {sections.length > 0 && (
          <div className={styles.sectionChips}>
            <button type="button" className={`${styles.sectionChip} ${!filters.section ? styles.sectionChipActive : ''}`} onClick={() => setFilters((f) => ({ ...f, section: '' }))}>
              All
            </button>
            {sections.map((s) => (
              <button key={s} type="button" className={`${styles.sectionChip} ${filters.section === s ? styles.sectionChipActive : ''}`} onClick={() => setFilters((f) => ({ ...f, section: f.section === s ? '' : s }))}>
                {s}
              </button>
            ))}
          </div>
        )}

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
                <span>Plot type</span>
                <select value={filters.plotType} onChange={(e) => setFilters((f) => ({ ...f, plotType: e.target.value as PlotClassification | '' }))}>
                  <option value="">Any</option>
                  {PLOT_CLASSIFICATIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
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
            <PlotBoard plots={sitePlots} navigate={navigate} locked={locked} />
            <PlotList plots={sitePlots} navigate={navigate} locked={locked} />
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
// Natural plot-number order (A1, A2, ... A10, A11, not lexicographic
// A1, A10, A11, A2) -- the board has no other explicit ordering, and both
// the "read the block in order" expectation and the owner-adjacency
// clustering below (which reasons about consecutive plot numbers) depend
// on tiles actually being laid out in numeric sequence.
function plotSeq(p: Plot): number | null {
  const m = p.plotNumber.match(/(\d+)/);
  return m ? Number(m[1]) : null;
}
function naturalPlotSort(a: Plot, b: Plot): number {
  const sa = plotSeq(a);
  const sb = plotSeq(b);
  if (sa != null && sb != null && sa !== sb) return sa - sb;
  return a.plotNumber.localeCompare(b.plotNumber);
}

// A real historical split pair -- two different real owners who each
// bought one physical piece of what was originally one plot (e.g. "H2 A"
// / "H2 B", two different customers, confirmed against the real workbook
// -- see plotsRoyalPalm.ts's own comment). Deliberately NOT triggered by
// an "A"/"B" suffix alone: most such pairs in the real data (D22A/D22B,
// F8 A/F8 B, I12A/I12B, J24A/J24B, K18A/K18B, L1 A/L1 B, L16A/L16B,
// L17A/L17B) are two completely separate Full Plots that just share a
// numbering convenience, confirmed by checking each one individually
// against the source sheet -- pairing on the suffix alone would have
// wrongly grouped 8 unrelated full-price plots. The real, generalizable
// signal is: neither side is a Full Plot (a genuine split always divides
// into fractional units), and their plot numbers share a root after
// stripping a recognized split-suffix.
function splitPairRoot(p: Plot): string | null {
  if (p.plotType === 'Full Plot') return null;
  const trimmed = p.plotNumber.trim();
  const m = trimmed.match(/^(.*?)\s*(?:[AB]|1\/2|2\/2)$/i);
  if (!m) return null;
  return `${p.section ?? ''}|${m[1].trim().toLowerCase()}`;
}

function boardUnits(plots: Plot[]): { key: string; tiles: Plot[] }[] {
  const parentIds = new Set(plots.map((p) => p.parentPlotId).filter((id): id is string => !!id));
  const map = new Map<string, Plot[]>();
  for (const p of plots) {
    if (parentIds.has(p.id)) continue;
    const key = p.parentPlotId ?? p.id;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(p);
  }
  const units = [...map.entries()].map(([key, tiles]) => ({ key, tiles })).sort((a, b) => naturalPlotSort(a.tiles[0], b.tiles[0]));

  // Second pass: merge two still-solo units into one real historical
  // split-pair tile group when they share a splitPairRoot -- same visual
  // treatment (.tileGroup) as an app-driven parentPlotId split, since
  // both are "two real halves of one original plot," just from different
  // sources (historical import vs this app's own split action).
  const byRoot = new Map<string, typeof units>();
  for (const u of units) {
    if (u.tiles.length !== 1) continue;
    const root = splitPairRoot(u.tiles[0]);
    if (!root) continue;
    if (!byRoot.has(root)) byRoot.set(root, []);
    byRoot.get(root)!.push(u);
  }
  const merged = new Set<string>();
  const result: typeof units = [];
  for (const u of units) {
    if (merged.has(u.key)) continue;
    const root = u.tiles.length === 1 ? splitPairRoot(u.tiles[0]) : null;
    const pair = root ? byRoot.get(root) : undefined;
    if (pair && pair.length === 2 && pair[0].key === u.key) {
      result.push({ key: root!, tiles: [pair[0].tiles[0], pair[1].tiles[0]] });
      merged.add(pair[0].key);
      merged.add(pair[1].key);
    } else if (!merged.has(u.key)) {
      result.push(u);
    }
  }
  return result;
}

// Master Spec-adjacent, real-data-driven feature: 70 real owners in the
// actual Royal Palm data hold 2+ plots with close plot numbers in the
// same block (confirmed by scanning the source workbook) -- e.g. one
// person owning A25/A26/A27/A28. Groups consecutive board units (already
// in natural plot-number order) that share the same real owner and whose
// plot numbers are within 2 of each other, so a visitor sees "these N
// tiles belong to one person" without clicking through each one.
// Deliberately only clusters solo (non-split-pair) units and only
// Allocated ones -- an owner key only exists once a plot is sold.
function ownerKeyFor(p: Plot): string | null {
  if (p.status !== 'Allocated') return null;
  return p.customerCode || p.clientName || null;
}
interface BoardEntry {
  cluster: boolean;
  units: { key: string; tiles: Plot[] }[];
  ownerLabel?: string;
}
function clusterByOwner(units: { key: string; tiles: Plot[] }[]): BoardEntry[] {
  const result: BoardEntry[] = [];
  let i = 0;
  while (i < units.length) {
    const u = units[i];
    const owner = u.tiles.length === 1 ? ownerKeyFor(u.tiles[0]) : null;
    if (!owner) {
      result.push({ cluster: false, units: [u] });
      i++;
      continue;
    }
    const run = [u];
    let j = i + 1;
    while (j < units.length) {
      const nu = units[j];
      const nOwner = nu.tiles.length === 1 ? ownerKeyFor(nu.tiles[0]) : null;
      if (nOwner !== owner) break;
      const prevSeq = plotSeq(run[run.length - 1].tiles[0]);
      const curSeq = plotSeq(nu.tiles[0]);
      if (prevSeq == null || curSeq == null || curSeq - prevSeq > 2) break;
      run.push(nu);
      j++;
    }
    if (run.length >= 2) {
      result.push({ cluster: true, units: run, ownerLabel: run[0].tiles[0].clientName ?? owner });
      i = j;
    } else {
      result.push({ cluster: false, units: [u] });
      i++;
    }
  }
  return result;
}

// Half/Partial Plot tiles otherwise look pixel-identical to a Full Plot
// tile of the same status -- same size, same color-by-status, nothing on
// the compact tile itself said "this one's smaller." A corner fraction
// badge (½ for a real Half Plot, the real percentage for a Partial Plot's
// real factor) makes that visible on a normal glance, not just on click
// or after filtering by Plot type.
function tileFractionLabel(p: Plot): string | null {
  if (p.plotType === 'Full Plot') return null;
  // Prefer the real physical area over `factor` -- `factor` is sometimes
  // relative to the row's own sub-unit rather than a full plot (e.g. the
  // real "C13 1/2"/"C13 2/2" uneven split both carry factor=1, which
  // would wrongly read "100%" on what's actually a 79%/21% split; their
  // real areaSqft correctly gives 79%/21%). Fall back to factor only when
  // no real dimensions are on file (the historical rows where the sheet's
  // own width/length were an unadjusted placeholder, not a measurement).
  if (p.areaSqft != null) {
    const pct = Math.round((p.areaSqft / 7000) * 100);
    if (pct < 100) return `${pct}%`;
  } else if (p.factor != null && p.factor < 1) {
    return `${Math.round(p.factor * 100)}%`;
  }
  return p.plotType === 'Half Plot' ? '½' : null;
}

// Allocated tiles otherwise all render in the same flat ink color
// regardless of type -- a Full Plot sale looks identical to a real
// half-of-a-split sale or a partial-fraction sale. Two extra blue
// variants (kept in the same family, distinct from each other) mark
// "this one's allocated but it's part of a split" vs "this one's
// allocated but it's a partial fraction," on top of the corner fraction
// badge and the split pairs' own tileGroup pairing.
function tileVisualStatus(p: Plot, inSplit: boolean): string {
  if (p.status === 'Allocated') {
    if (inSplit) return 'AllocatedSplit';
    if (p.plotType === 'Partial Plot') return 'AllocatedPartial';
  }
  return p.status.replace(/\s/g, '');
}

function PlotTile({ p, navigate, inSplit = false, suggestedFor = null }: { p: Plot; navigate: ReturnType<typeof useNavigate>; inSplit?: boolean; suggestedFor?: string | null }) {
  const fraction = tileFractionLabel(p);
  return (
    <button
      type="button"
      className={`${styles.tile} ${styles[`tile_${tileVisualStatus(p, inSplit)}`]}`}
      onClick={() => navigate(`/dashboard/plots/${p.id}`)}
      title={`${p.plotNumber} · ${p.plotType} · ${p.status}${p.clientName ? ` · ${p.clientName}` : ''}${suggestedFor ? ` · Suggested for ${suggestedFor}, awaiting Management sign-off` : ''}`}
    >
      {fraction && <span className={styles.tileFraction}>{fraction}</span>}
      {suggestedFor && <span className={styles.tileSuggestedDot} aria-hidden="true" />}
      <span className={styles.tileNumber}>{p.plotNumber}</span>
      {p.price != null && <span className={styles.tilePrice}>{ghs(p.price)}</span>}
    </button>
  );
}

function PlotBoard({ plots, navigate, locked }: { plots: Plot[]; navigate: ReturnType<typeof useNavigate>; locked: Map<string, string> }) {
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
            {/* Every entry -- clustered or solo -- reserves the exact same
                fixed-height caption row above its tiles (empty when
                there's no owner label), so a solo tile's own tiles start
                at the identical Y position as a clustered one's, instead
                of clusters sitting visibly lower because only they had a
                caption eating into the row's vertical space. Caught live
                by the user (screenshot showed the two visibly out of
                line) -- this is the fix, not a cosmetic nudge. */}
            {clusterByOwner(boardUnits(secPlots)).map((entry) =>
              entry.cluster ? (
                <div key={entry.units[0].key} className={styles.boardUnitSlot}>
                  <span className={styles.unitCaption} title={`${entry.ownerLabel} owns these ${entry.units.length} plots`}>
                    {entry.ownerLabel}
                  </span>
                  <div className={`${styles.tilesBox} ${styles.ownerCluster}`}>
                    {entry.units.map((unit) => (
                      <div key={unit.key} className={unit.tiles.length > 1 ? styles.tileGroup : undefined}>
                        {unit.tiles.map((p) => (
                          <PlotTile key={p.id} p={p} navigate={navigate} inSplit={unit.tiles.length > 1} suggestedFor={locked.get(p.plotNumber.toLowerCase()) ?? null} />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div key={entry.units[0].key} className={styles.boardUnitSlot}>
                  <span className={styles.unitCaption} aria-hidden="true">
                    {' '}
                  </span>
                  <div className={styles.tilesBox}>
                    <div className={entry.units[0].tiles.length > 1 ? styles.tileGroup : undefined}>
                      {entry.units[0].tiles.map((p) => (
                        <PlotTile key={p.id} p={p} navigate={navigate} inSplit={entry.units[0].tiles.length > 1} suggestedFor={locked.get(p.plotNumber.toLowerCase()) ?? null} />
                      ))}
                    </div>
                  </div>
                </div>
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function PlotList({ plots, navigate, locked }: { plots: Plot[]; navigate: ReturnType<typeof useNavigate>; locked: Map<string, string> }) {
  return (
    <div className={styles.list}>
      {boardUnits(plots).map((unit) => (
        <div key={unit.key}>
          {unit.tiles.map((p) => (
            <PlotRow key={p.id} plot={p} isHalf={unit.tiles.length > 1} suggestedFor={locked.get(p.plotNumber.toLowerCase()) ?? null} onOpen={() => navigate(`/dashboard/plots/${p.id}`)} />
          ))}
        </div>
      ))}
    </div>
  );
}

function PlotRow({ plot, isHalf, suggestedFor = null, onOpen }: { plot: Plot; isHalf?: boolean; suggestedFor?: string | null; onOpen: () => void }) {
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
        {suggestedFor && (
          <span className={styles.badgeSuggested} title={`Suggested for ${suggestedFor}, awaiting Management sign-off`}>
            Suggested
          </span>
        )}
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