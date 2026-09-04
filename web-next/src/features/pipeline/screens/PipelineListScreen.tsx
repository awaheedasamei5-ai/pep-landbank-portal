import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { ghs } from '../../../shared/lib/format';
import { PipePill, PipePillStrip } from '../../../shared/ui/PipePill';
import { useLeads } from '../hooks/useLeads';
import { useAssignLead, useUpdateLead, useDeleteLead } from '../hooks/useLead';
import { useSiteVisits } from '../../site-visits/hooks/useSiteVisits';
import { useStaffDirectory } from '../../memos/hooks/useMemos';
import { useSessionStore } from '../../../auth/useSessionStore';
import { StageBadge } from '../components/StageBadge';
import {
  EMPTY_FILTERS,
  STAGE_FUNNEL_LABELS,
  STAGE_FUNNEL_ORDER,
  computePipelineKpis,
  filterLeads,
  isLeadOverdue,
  type PipelineFilters,
} from '../lib/pipelineListLogic';
import type { Lead } from '../../../types/domain';
import styles from './PipelineListScreen.module.css';

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

function exportLeadsCsv(leads: Lead[]) {
  const headers = ['Name', 'Contact', 'Plot type', 'No. plots', 'Stage', 'Priority', 'Grand total', 'Paid', 'Balance', 'Next action', 'Due date'];
  const rows = leads.map((l) => [
    l.name,
    l.contact,
    l.plotType,
    String(l.noPlots),
    STAGE_FUNNEL_LABELS[l.stage],
    l.priority || 'Low',
    String(l.grandTotal),
    String(l.amtPaid),
    String(Math.max(l.grandTotal - l.amtPaid, 0)),
    l.nextAction || '',
    l.nextActionDate || '',
  ]);
  const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pipeline-export-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Master Spec Section 4 in full: KPI strip (7 metrics), stage funnel using
// real vocabulary, 8-dimension filters (opens as a panel -- doubles for
// the mobile "bottom sheet" requirement and a desktop inline panel), a
// dense desktop table vs stacked mobile cards (CSS-toggled, not two
// separate data-fetch paths), safe-only bulk actions (export/assign/tag/
// archive -- bulk delete is deliberately not offered at all), and a real
// working Edit affordance + status badge on every row.
export function PipelineListScreen() {
  const navigate = useNavigate();
  const profile = useSessionStore((s) => s.profile);
  const { data: leads, isLoading } = useLeads();
  const { data: siteVisits } = useSiteVisits();
  const { data: staff } = useStaffDirectory();
  const assignLead = useAssignLead();
  const updateLead = useUpdateLead();
  const deleteLead = useDeleteLead();

  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<PipelineFilters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState<'assign' | 'tag' | 'archive' | null>(null);
  const [bulkValue, setBulkValue] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);

  const all = leads ?? [];
  const sources = useMemo(() => Array.from(new Set(all.map((l) => l.leadSource).filter(Boolean))) as string[], [all]);

  const q = query.trim().toLowerCase();
  const searched = q ? all.filter((l) => l.name.toLowerCase().includes(q) || l.contact.includes(q)) : all;
  const filtered = filterLeads(searched, filters);

  const kpis = computePipelineKpis(all, siteVisits?.length ?? 0);
  const paidCount = all.filter((l) => l.stage === '4').length;
  const activeFilterCount = Object.entries(filters).filter(([k, v]) => (k === 'overdueOnly' ? v === true : v !== '')).length;

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearBulk() {
    setSelected(new Set());
    setBulkMode(null);
    setBulkValue('');
  }

  async function runBulkAssign() {
    if (!bulkValue) return;
    const target = (staff ?? []).find((s) => s.key === bulkValue);
    if (!target) return;
    setBulkBusy(true);
    for (const id of selected) {
      await assignLead.mutateAsync({ id, agentKey: target.key }).catch(() => {});
    }
    setBulkBusy(false);
    clearBulk();
  }

  async function runBulkTag() {
    const tag = bulkValue.trim();
    if (!tag) return;
    setBulkBusy(true);
    for (const id of selected) {
      const lead = all.find((l) => l.id === id);
      if (!lead) continue;
      const existingTags = (lead.tags || '').split(',').map((t) => t.trim()).filter(Boolean);
      if (existingTags.includes(tag)) continue;
      await updateLead.mutateAsync({ id, patch: { tags: [...existingTags, tag].join(', ') } }).catch(() => {});
    }
    setBulkBusy(false);
    clearBulk();
  }

  async function runBulkArchive() {
    const reason = bulkValue.trim();
    if (!reason) return;
    setBulkBusy(true);
    for (const id of selected) {
      await deleteLead.mutateAsync({ id, reason }).catch(() => {});
    }
    setBulkBusy(false);
    clearBulk();
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>My pipeline</h1>
          <p className={styles.sub}>
            {all.length} leads · {paidCount} paid in full
          </p>
        </div>
        <div className={styles.headActions}>
          <button type="button" className={styles.iconBtn} title="Export" onClick={() => exportLeadsCsv(filtered.length ? filtered : all)}>
            ⬇
          </button>
          <button type="button" className={styles.addBtn} onClick={() => navigate('/app/sales/pipeline/new')}>
            + Add lead
          </button>
        </div>
      </div>

      <input className={styles.search} placeholder="Search by name or contact…" value={query} onChange={(e) => setQuery(e.target.value)} />

      <div className={styles.kpiWrap}>
        <PipePillStrip>
          <PipePill tone="blue" value={ghs(kpis.pipelineValue)} label="Pipeline value" isMoney />
          <PipePill tone="green" value={ghs(kpis.collected)} label="Collected" isMoney />
          <PipePill tone="orange" value={ghs(kpis.outstanding)} label="Outstanding" isMoney />
          <PipePill tone="gold" value={kpis.fullyPaid} label="Fully paid" />
          <PipePill tone="blue" value={kpis.siteVisits} label="Site visits" />
          <PipePill tone="red" value={kpis.highPriority} label="High priority" />
          <PipePill tone="green" value={kpis.allocationReady} label="Allocation ready" />
        </PipePillStrip>
      </div>

      <div className={styles.stageTabs}>
        <button type="button" className={`${styles.stageTab} ${filters.stage === '' ? styles.stageTabOn : ''}`} onClick={() => setFilters((f) => ({ ...f, stage: '' }))}>
          All
        </button>
        {STAGE_FUNNEL_ORDER.map((s) => (
          <button
            type="button"
            key={s}
            className={`${styles.stageTab} ${filters.stage === s ? styles.stageTabOn : ''}`}
            onClick={() => setFilters((f) => ({ ...f, stage: f.stage === s ? '' : s }))}
          >
            {STAGE_FUNNEL_LABELS[s]}
          </button>
        ))}
        <button type="button" className={styles.filterToggle} onClick={() => setShowFilters((v) => !v)}>
          Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </button>
      </div>

      {showFilters && (
        <div className={styles.filterPanel}>
          <div className={styles.filterGrid}>
            <label className={styles.filterField}>
              <span>Priority</span>
              <select value={filters.priority} onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))}>
                <option value="">Any</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </label>
            <label className={styles.filterField}>
              <span>Payment state</span>
              <select value={filters.paymentState} onChange={(e) => setFilters((f) => ({ ...f, paymentState: e.target.value as PipelineFilters['paymentState'] }))}>
                <option value="">Any</option>
                <option value="not_started">Not started</option>
                <option value="partial">Partial</option>
                <option value="fully_paid">Fully paid</option>
              </select>
            </label>
            <label className={styles.filterField}>
              <span>Site visit</span>
              <select value={filters.siteVisitState} onChange={(e) => setFilters((f) => ({ ...f, siteVisitState: e.target.value as PipelineFilters['siteVisitState'] }))}>
                <option value="">Any</option>
                <option value="visited">Visited</option>
                <option value="not_yet">Not yet</option>
              </select>
            </label>
            <label className={styles.filterField}>
              <span>Allocation</span>
              <select value={filters.allocationReady} onChange={(e) => setFilters((f) => ({ ...f, allocationReady: e.target.value as PipelineFilters['allocationReady'] }))}>
                <option value="">Any</option>
                <option value="ready">Ready</option>
                <option value="not_ready">Not ready</option>
              </select>
            </label>
            <label className={styles.filterField}>
              <span>Source</span>
              <select value={filters.source} onChange={(e) => setFilters((f) => ({ ...f, source: e.target.value }))}>
                <option value="">Any</option>
                {sources.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.filterField}>
              <span>Added from</span>
              <input type="date" value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))} />
            </label>
            <label className={styles.filterField}>
              <span>Added to</span>
              <input type="date" value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))} />
            </label>
            <label className={styles.filterCheck}>
              <input type="checkbox" checked={filters.overdueOnly} onChange={(e) => setFilters((f) => ({ ...f, overdueOnly: e.target.checked }))} />
              Overdue next action only
            </label>
          </div>
          {activeFilterCount > 0 && (
            <button type="button" className={styles.clearFiltersBtn} onClick={() => setFilters(EMPTY_FILTERS)}>
              Clear filters
            </button>
          )}
        </div>
      )}

      {selected.size > 0 && (
        <div className={styles.bulkBar}>
          {!bulkMode ? (
            <>
              <span className={styles.bulkCount}>{selected.size} selected</span>
              <div className={styles.bulkActions}>
                <button type="button" className={styles.bulkBtn} onClick={() => exportLeadsCsv(all.filter((l) => selected.has(l.id)))}>
                  Export
                </button>
                <button type="button" className={styles.bulkBtn} onClick={() => setBulkMode('assign')}>
                  Assign
                </button>
                <button type="button" className={styles.bulkBtn} onClick={() => setBulkMode('tag')}>
                  Tag
                </button>
                <button type="button" className={styles.bulkBtnDanger} onClick={() => setBulkMode('archive')}>
                  Archive
                </button>
                <button type="button" className={styles.bulkCancel} onClick={clearBulk}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              {bulkMode === 'assign' && (
                <select className={styles.bulkInput} value={bulkValue} onChange={(e) => setBulkValue(e.target.value)}>
                  <option value="">Reassign {selected.size} lead(s) to…</option>
                  {(staff ?? []).filter((s) => s.key !== profile?.key).map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
              {bulkMode === 'tag' && (
                <input className={styles.bulkInput} placeholder="Tag to add, e.g. VIP" value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} />
              )}
              {bulkMode === 'archive' && (
                <input className={styles.bulkInput} placeholder="Reason for archiving (required)" value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} />
              )}
              <div className={styles.bulkActions}>
                <button
                  type="button"
                  className={bulkMode === 'archive' ? styles.bulkBtnDanger : styles.bulkBtn}
                  disabled={bulkBusy || !bulkValue.trim()}
                  onClick={bulkMode === 'assign' ? runBulkAssign : bulkMode === 'tag' ? runBulkTag : runBulkArchive}
                >
                  {bulkBusy ? 'Working…' : 'Confirm'}
                </button>
                <button type="button" className={styles.bulkCancel} onClick={() => setBulkMode(null)}>
                  Back
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {isLoading && <p className={styles.emptyMsg}>Loading…</p>}
      {!isLoading && filtered.length === 0 && <p className={styles.emptyMsg}>{all.length === 0 ? 'No leads yet — add your first one.' : 'No leads match these filters.'}</p>}

      {/* Desktop: dense table (Section 4.1). Mobile: stacked cards (4.2).
          Both render off the same `filtered` array -- CSS toggles which
          one is visible per breakpoint, so there's exactly one source of
          truth for what's on screen. */}
      {filtered.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th} />
                <th className={styles.th}>Client</th>
                <th className={styles.th}>Contact</th>
                <th className={styles.th}>Plot</th>
                <th className={styles.th}>Grand total</th>
                <th className={styles.th}>Paid</th>
                <th className={styles.th}>Balance</th>
                <th className={styles.th}>Next action</th>
                <th className={styles.th}>Stage</th>
                <th className={styles.th}>Priority</th>
                <th className={styles.th} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => {
                const overdue = isLeadOverdue(l);
                return (
                  <tr key={l.id} className={styles.tr}>
                    <td className={styles.td}>
                      <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggleSelect(l.id)} />
                    </td>
                    <td className={`${styles.td} ${styles.tdName}`} onClick={() => navigate(`/app/sales/pipeline/${l.id}`)}>
                      {l.name}
                    </td>
                    <td className={styles.td}>{l.contact}</td>
                    <td className={styles.td}>
                      {l.plotType}
                      {l.noPlots > 1 ? ` ×${l.noPlots}` : ''}
                    </td>
                    <td className={`${styles.td} ${styles.tdMono}`}>{ghs(l.grandTotal)}</td>
                    <td className={`${styles.td} ${styles.tdMono}`}>{ghs(l.amtPaid)}</td>
                    <td className={`${styles.td} ${styles.tdMono}`}>{ghs(Math.max(l.grandTotal - l.amtPaid, 0))}</td>
                    <td className={`${styles.td} ${overdue ? styles.tdOverdue : ''}`}>
                      {l.nextAction || '—'}
                      {overdue ? ' ⚠' : ''}
                    </td>
                    <td className={styles.td}>
                      <StageBadge stage={l.stage} />
                    </td>
                    <td className={styles.td}>{l.priority || 'Low'}</td>
                    <td className={styles.td}>
                      <button type="button" className={styles.editIconBtn} title="Edit" aria-label={`Edit ${l.name}`} onClick={() => navigate(`/app/sales/pipeline/${l.id}`)}>
                        ✎
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className={styles.cardList}>
        {filtered.map((l) => {
          const overdue = isLeadOverdue(l);
          return (
            <div className={styles.row} key={l.id}>
              <input type="checkbox" className={styles.rowCheck} checked={selected.has(l.id)} onChange={() => toggleSelect(l.id)} />
              <div className={styles.rowBody} onClick={() => navigate(`/app/sales/pipeline/${l.id}`)} role="button" tabIndex={0}>
                <span className={styles.avatar}>{initials(l.name)}</span>
                <div className={styles.rowMain}>
                  <div className={styles.name}>{l.name}</div>
                  <div className={styles.meta}>
                    {ghs(Math.max(l.grandTotal - l.amtPaid, 0))} owed
                    {l.nextAction ? ` · ${l.nextAction}` : ''}
                    {overdue ? <span className={styles.overdueChip}> Overdue</span> : ''}
                  </div>
                </div>
                <div className={styles.right}>
                  <div className={styles.value}>{ghs(l.grandTotal)}</div>
                  <div className={styles.stageWrap}>
                    <StageBadge stage={l.stage} />
                  </div>
                </div>
              </div>
              <button
                type="button"
                className={styles.editIconBtnMobile}
                title="Edit"
                aria-label={`Edit ${l.name}`}
                onClick={() => navigate(`/app/sales/pipeline/${l.id}`)}
              >
                ✎
              </button>
            </div>
          );
        })}
      </div>

      {profile?.role === 'manager' && (
        <button type="button" className={styles.archivedLink} onClick={() => navigate('/app/mgr/pipeline/archived')}>
          View archived leads →
        </button>
      )}
    </div>
  );
}
