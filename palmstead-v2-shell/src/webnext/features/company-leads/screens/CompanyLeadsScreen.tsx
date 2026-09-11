"use client";

import { Fragment, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { ghs } from '../../../shared/lib/format';
import { PipePill, PipePillStrip } from '../../../shared/ui/PipePill';
import { StageBadge } from '../../pipeline/components/StageBadge';
import { qtyOfType } from '../../pipeline/lib/pipelineLogic';
import { StaffPipelineImportCard } from '../../pipeline/components/StaffPipelineImportCard';
import { useAssignLead, useUpdateLead, useDeleteLead } from '../../pipeline/hooks/useLead';
import { useDownloadCompanyLeadsPipeline } from '../../manager/hooks/usePipelineExcel';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { useDownloadLeadQuotationPdf } from '../../quotation/hooks/useQuotationPdf';
import { friendlyError } from '../../../shared/lib/friendlyError';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useStaffDirectory } from '../../memos/hooks/useMemos';
import {
  EMPTY_FILTERS,
  STAGE_FUNNEL_LABELS,
  STAGE_FUNNEL_ORDER,
  computePipelineKpis,
  filterLeads,
  isLeadOverdue,
  type PipelineFilters,
} from '../../pipeline/lib/pipelineListLogic';
import { useAgentRoster, useAssignCompanyLead, useAssignCompanyLeadHandler, useCompanyLeads, useSetLeadSource } from '../hooks/useCompanyLeads';
import type { Lead } from '../../../types/domain';
import styles from './CompanyLeadsScreen.module.css';

const LEAD_SOURCES = ['Banner', 'Referral', 'Facebook', 'Instagram', 'TikTok', 'Google', 'Website', 'Radio', 'TV', 'Other'] as const;

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

function exportLeadsCsv(leads: Lead[]) {
  const headers = ['Name', 'Contact', 'Plot type', 'No. plots', 'Stage', 'Priority', 'Grand total', 'Paid', 'Balance', 'Source'];
  const rows = leads.map((l) => [l.name, l.contact, l.plotType, String(l.noPlots), STAGE_FUNNEL_LABELS[l.stage], l.priority || 'Low', String(l.grandTotal), String(l.amtPaid), String(Math.max(l.grandTotal - l.amtPaid, 0)), l.leadSource || '']);
  const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `company-leads-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Real agent_key='company' pool (confirmed live): clients who came to the
// company directly, not through a specific agent, sit here until
// assigned. leads_upd_company RLS is the only policy that lets manager/
// elias/emmanuel/elizabeth UPDATE a lead that isn't theirs -- and ONLY
// while its agent_key is still 'company', which is exactly the assign
// action below.
//
// Real user correction (2026-09-11, re-stated after an earlier, shallower
// pass): "let the view and ui everything should look like the my
// pipeline app, the only distinction is the app name and also the fact
// that it only houses company leads." That first pass only matched the
// KPI-strip/search/Add-Lead/Export-Import SHAPE -- it never carried over
// Pipeline's actual stage tabs, 8-dimension filter panel, bulk actions,
// or the dense table/mobile-card dual list, which are most of what that
// screen actually is. This version reuses PipelineListScreen's own logic
// (pipelineListLogic.ts) and CSS classes (see the .module.css's own
// comment) directly rather than re-deriving a second copy, so the two
// screens can't silently drift apart again.
//
// Ground rule (also explicit, unchanged from the first pass): these
// leads never appear in, or silently enter, any staff member's own
// personal pipeline merely because that staff can view this screen --
// only the real "Assign to agent" action is a genuine ownership transfer
// (Master Spec 17.1: "Assignment changes owner; it must not clone the
// lead"), and bulk import here can never do that reassignment through a
// file (see usePipelineImport's own comment on the `companyOnly` scope).
// This is the one real functional difference from Pipeline (a company
// lead has no owner yet to defer assignment to via the detail drawer's
// own Reassign control the way a normal lead does) -- surfaced here as
// an extra per-row "Assign" action rather than baked into the shared
// list logic itself.
export function CompanyLeadsScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const profile = useSessionStore((s) => s.profile);
  // Same nested-route split-view trick as My/Master Pipeline and Client
  // Database (see PipelineListScreen's own comment) -- the list stays
  // mounted (and, on desktop, visible) behind a lead's own detail drawer
  // instead of a sibling route unmounting it.
  const hasDetailOpen = /^\/dashboard\/company-leads\/[^/]+$/.test(location.pathname);
  const { data: leads, isLoading } = useCompanyLeads();
  const { data: staff } = useStaffDirectory();
  const assignLead = useAssignLead();
  const updateLead = useUpdateLead();
  const deleteLead = useDeleteLead();
  const downloadCompanyLeads = useDownloadCompanyLeadsPipeline();
  const { data: config } = useConfig();
  const downloadLeadQuotation = useDownloadLeadQuotationPdf();

  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<PipelineFilters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState<'assign' | 'tag' | 'archive' | null>(null);
  const [bulkValue, setBulkValue] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const all = leads ?? [];
  const sources = useMemo(() => Array.from(new Set(all.map((l) => l.leadSource).filter(Boolean))) as string[], [all]);

  const q = query.trim().toLowerCase();
  const searched = q ? all.filter((l) => l.name.toLowerCase().includes(q) || l.contact.includes(q)) : all;
  const filtered = filterLeads(searched, filters);

  // Same 7-metric KPI strip as Pipeline -- "Site visits" here counts each
  // lead's own siteVisit flag rather than a separate site_visits table
  // query (Pipeline's version), since company leads aren't agent-scoped
  // the way that table's own real RLS/queries are keyed.
  const kpis = computePipelineKpis(all, all.filter((l) => l.siteVisit === 'Yes').length);
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
    <div className={`${styles.pageRow} ${hasDetailOpen ? styles.pageRowSplit : ''}`}>
    <div className={`${styles.wrap} ${hasDetailOpen ? `${styles.wrapHiddenMobile} ${styles.wrapWithDrawer}` : ''}`}>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Company Leads</h1>
          <p className={styles.sub}>Clients who came to the company directly -- through company socials, banners, etc. -- not tied to any staff&apos;s own pipeline until assigned.</p>
        </div>
        <div className={styles.headActions}>
          <button type="button" className={styles.iconBtn} title="Export Company Leads (.xlsx)" disabled={downloadCompanyLeads.isPending} onClick={() => downloadCompanyLeads.mutate()}>
            ⬇
          </button>
          <button type="button" className={styles.iconBtn} title="Import Company Leads (.xlsx)" onClick={() => setShowImport((v) => !v)}>
            ⬆
          </button>
          <button type="button" className={styles.addBtn} onClick={() => navigate('/dashboard/pipeline/new', { state: { returnTo: '/dashboard/company-leads', agentKeyOverride: 'company' } })}>
            + Add lead
          </button>
        </div>
      </div>

      {downloadCompanyLeads.isError && <p className={styles.emptyMsg}>{friendlyError(downloadCompanyLeads.error, 'Could not build the export.')}</p>}
      {showImport && <StaffPipelineImportCard companyOnly />}

      <div className={styles.searchRow}>
        <input className={styles.search} placeholder="Search by name or contact…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

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

      <div className={styles.stageTabsRow}>
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
      </div>
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
                  {(staff ?? []).filter((s) => s.role === 'agent').map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
              {bulkMode === 'tag' && <input className={styles.bulkInput} placeholder="Tag to add, e.g. VIP" value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} />}
              {bulkMode === 'archive' && <input className={styles.bulkInput} placeholder="Reason for archiving (required)" value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} />}
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
      {!isLoading && filtered.length === 0 && (
        <p className={styles.emptyMsg}>{all.length === 0 ? 'No company leads yet -- clients who come to the company directly land here until assigned.' : 'No leads match these filters.'}</p>
      )}

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
                  <Fragment key={l.id}>
                    <tr className={styles.tr}>
                      <td className={styles.td}>
                        <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggleSelect(l.id)} />
                      </td>
                      <td className={`${styles.td} ${styles.tdName}`} onClick={() => navigate(`/dashboard/company-leads/${l.id}`)}>
                        {l.name}
                      </td>
                      <td className={styles.td}>{l.contact}</td>
                      <td className={styles.td}>
                        {l.plotType}
                        {qtyOfType(l.plotType, l.noPlots) > 1 ? ` ×${qtyOfType(l.plotType, l.noPlots)}` : ''}
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
                        <button
                          type="button"
                          className={styles.editIconBtn}
                          title="Download quotation"
                          aria-label={`Download quotation for ${l.name}`}
                          disabled={!config || downloadLeadQuotation.isPending}
                          onClick={() => config && downloadLeadQuotation.mutate({ lead: l, config })}
                        >
                          🧾
                        </button>
                        <button type="button" className={styles.editIconBtn} title="Edit" aria-label={`Edit ${l.name}`} onClick={() => navigate(`/dashboard/company-leads/${l.id}`)}>
                          ✎
                        </button>
                        <button
                          type="button"
                          className={styles.editIconBtn}
                          title="Assign to agent"
                          aria-label={`Assign ${l.name} to an agent`}
                          onClick={() => setExpandedId((cur) => (cur === l.id ? null : l.id))}
                        >
                          👤
                        </button>
                      </td>
                    </tr>
                    {expandedId === l.id && (
                      <tr>
                        <td className={`${styles.td} ${styles.expandedTd}`} colSpan={11}>
                          <LeadAssignPanel lead={l} onDone={() => setExpandedId(null)} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
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
              <div className={styles.rowTop}>
                <input type="checkbox" className={styles.rowCheck} checked={selected.has(l.id)} onChange={() => toggleSelect(l.id)} />
                <div className={styles.rowBody} onClick={() => navigate(`/dashboard/company-leads/${l.id}`)} role="button" tabIndex={0}>
                  <span className={styles.avatar}>{initials(l.name)}</span>
                  <div className={styles.rowMain}>
                    <div className={styles.name}>{l.name}</div>
                    <div className={styles.meta}>
                      {ghs(Math.max(l.grandTotal - l.amtPaid, 0))} owed
                      {l.nextAction ? ` · ${l.nextAction}` : ''}
                      {overdue ? ' ⚠' : ''}
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
                  title="Download quotation"
                  aria-label={`Download quotation for ${l.name}`}
                  disabled={!config || downloadLeadQuotation.isPending}
                  onClick={() => config && downloadLeadQuotation.mutate({ lead: l, config })}
                >
                  🧾
                </button>
                <button
                  type="button"
                  className={styles.editIconBtnMobile}
                  title="Assign to agent"
                  aria-label={`Assign ${l.name} to an agent`}
                  onClick={() => setExpandedId((cur) => (cur === l.id ? null : l.id))}
                >
                  👤
                </button>
              </div>
              {l.leadSource && <span className={styles.sourceTag}>{l.leadSource}</span>}
              {expandedId === l.id && <LeadAssignPanel lead={l} onDone={() => setExpandedId(null)} />}
            </div>
          );
        })}
      </div>
    </div>
    {/* Nested route for a lead's own detail drawer -- sibling of .wrap
        (not inside it) so it renders regardless of hasDetailOpen's
        mobile-hide toggle above, same structure as PipelineListScreen's
        own Outlet. */}
    <Outlet />
    </div>
  );
}

// Which of the two real "assign" actions is showing: 'choose' asks Move
// vs Assign-only first (the user's own explicit two-option request --
// Move is a real ownership transfer into the staff's personal pipeline,
// Assign-only hands it to them for follow-up but leaves it here in
// Company Leads), 'move'/'handle' then show the agent picker for
// whichever was chosen. Also carries the source-select action, since
// both live in the same expandable per-lead panel.
type AssignStep = 'choose' | 'move' | 'handle' | 'source';

function LeadAssignPanel({ lead, onDone }: { lead: Lead; onDone: () => void }) {
  const { data: agents } = useAgentRoster();
  const assign = useAssignCompanyLead();
  const assignHandler = useAssignCompanyLeadHandler();
  const setSource = useSetLeadSource();
  const [step, setStep] = useState<AssignStep>('choose');
  const handlerName = lead.assignedAgentKey ? (agents?.find((a) => a.key === lead.assignedAgentKey)?.name ?? lead.assignedAgentKey) : null;

  return (
    <div className={styles.assignPanel}>
      {handlerName && (
        <span className={styles.hint} style={{ flex: '1 1 100%' }}>
          Currently handled by {handlerName} (still in Company Leads).{' '}
          <button type="button" style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'inherit', textDecoration: 'underline' }} onClick={() => assignHandler.mutate({ id: lead.id, agentKey: null })}>
            Unassign
          </button>
        </span>
      )}
      {step === 'choose' && (
        <>
          <p className={styles.hint}>Move transfers ownership into their own pipeline. Assign just hands it to them for follow-up -- it stays here in Company Leads.</p>
          <div className={styles.discModeRow}>
            <button type="button" className={styles.discModeChip} onClick={() => setStep('move')}>
              Move to their pipeline
            </button>
            <button type="button" className={styles.discModeChip} onClick={() => setStep('handle')}>
              Assign, keep in Company Leads
            </button>
            <button type="button" className={styles.discModeChip} onClick={() => setStep('source')}>
              {lead.leadSource ? 'Change source' : 'Set source'}
            </button>
          </div>
          <button type="button" className={styles.cancelBtn} onClick={onDone}>
            Close
          </button>
        </>
      )}
      {(step === 'move' || step === 'handle') && (
        <>
          <select
            className={styles.select}
            defaultValue=""
            onChange={(e) => {
              if (!e.target.value) return;
              if (step === 'move') assign.mutate({ id: lead.id, agentKey: e.target.value }, { onSuccess: onDone });
              else assignHandler.mutate({ id: lead.id, agentKey: e.target.value }, { onSuccess: onDone });
            }}
          >
            {/* Not `disabled` -- a disabled first option lets the browser
                auto-select the next enabled one instead (observed live:
                the dropdown opened already showing "Elias Torgbuivi" as
                selected), which would silently require re-selecting the
                same agent to fire onChange at all if that's who you meant. */}
            <option value="">Choose an agent…</option>
            {agents?.map((a) => (
              <option key={a.key} value={a.key}>
                {a.name}
              </option>
            ))}
          </select>
          <button type="button" className={styles.cancelBtn} onClick={() => setStep('choose')}>
            Back
          </button>
        </>
      )}
      {step === 'source' && (
        <>
          <select
            className={styles.sourceSelect}
            value={lead.leadSource ?? ''}
            onChange={(e) => {
              if (e.target.value) setSource.mutate({ id: lead.id, source: e.target.value }, { onSuccess: onDone });
            }}
          >
            <option value="">Where did they hear about us?</option>
            {LEAD_SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button type="button" className={styles.cancelBtn} onClick={() => setStep('choose')}>
            Back
          </button>
        </>
      )}
    </div>
  );
}
