"use client";

import { useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { ghs } from '../../../shared/lib/format';
import { PipePill, PipePillStrip } from '../../../shared/ui/PipePill';
import { StageBadge } from '../../pipeline/components/StageBadge';
import { qtyOfType } from '../../pipeline/lib/pipelineLogic';
import { StaffPipelineImportCard } from '../../pipeline/components/StaffPipelineImportCard';
import { useDownloadCompanyLeadsPipeline } from '../../manager/hooks/usePipelineExcel';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { useDownloadLeadQuotationPdf } from '../../quotation/hooks/useQuotationPdf';
import { friendlyError } from '../../../shared/lib/friendlyError';
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

function exportCompanyLeadsCsv(leads: Lead[]) {
  // Same column set v1's own companyLeadsBodyHtml export used
  // (index.html:6456-6459) -- kept as the quick one-click CSV alongside
  // the fuller canonical-workbook export/import round trip below.
  const headers = ['Client', 'Contact', 'Source', 'Stage', 'Grand total', 'Paid'];
  const rows = leads.map((l) => [l.name, l.contact, l.leadSource || '', l.stage, String(l.grandTotal), String(l.amtPaid)]);
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
// Rebuilt to look like My Pipeline per the user's explicit correction --
// same KPI strip/search/Add Lead/Export/Import shape, scoped to this
// one real pool. Ground rule (also explicit): these leads never appear
// in, or silently enter, any staff member's own personal pipeline merely
// because that staff can view this screen -- only the real "Assign to
// agent" action below is a genuine ownership transfer (Master Spec
// 17.1: "Assignment changes owner; it must not clone the lead"), and
// bulk import here can never do that reassignment through a file (see
// usePipelineImport's own comment on the `companyOnly` scope).
export function CompanyLeadsScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  // Same nested-route split-view trick as My/Master Pipeline and Client
  // Database (see PipelineListScreen's own comment) -- the list stays
  // mounted (and, on desktop, visible) behind a lead's own detail drawer
  // instead of a sibling route unmounting it.
  const hasDetailOpen = /^\/dashboard\/company-leads\/[^/]+$/.test(location.pathname);
  const { data: leads, isLoading } = useCompanyLeads();
  const downloadCompanyLeads = useDownloadCompanyLeadsPipeline();
  const [query, setQuery] = useState('');
  const [showImport, setShowImport] = useState(false);

  const all = leads ?? [];
  const q = query.trim().toLowerCase();
  const filtered = q ? all.filter((l) => l.name.toLowerCase().includes(q) || l.contact.includes(q)) : all;

  const totalValue = useMemo(() => all.reduce((s, l) => s + l.grandTotal, 0), [all]);
  const sourced = all.filter((l) => l.leadSource).length;
  const unsourced = all.length - sourced;

  return (
    <div className={`${styles.pageRow} ${hasDetailOpen ? styles.pageRowSplit : ''}`}>
    <div className={`${styles.wrap} ${hasDetailOpen ? `${styles.wrapHiddenMobile} ${styles.wrapWithDrawer}` : ''}`}>
      <div className={styles.head}>
        <div>
          <div className={styles.eyebrow}>Company-sourced</div>
          <h1 className={styles.title}>Company Leads</h1>
          <p className={styles.sub}>Clients who came to the company directly -- through company socials, banners, etc. -- not tied to any staff's own pipeline until assigned.</p>
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
        <button type="button" className={styles.csvBtn} onClick={() => exportCompanyLeadsCsv(filtered)} title="Quick CSV export of what's shown">
          CSV
        </button>
      </div>

      <div className={styles.kpiWrap}>
        <PipePillStrip>
          <PipePill tone="blue" value={all.length} label="Company leads" />
          <PipePill tone="gold" value={ghs(totalValue)} label="Total value" isMoney />
          <PipePill tone="green" value={sourced} label="Source known" />
          <PipePill tone="orange" value={unsourced} label="Missing source" />
        </PipePillStrip>
      </div>

      {isLoading && <p className={styles.emptyMsg}>Loading…</p>}
      {!isLoading && all.length === 0 && <p className={styles.emptyMsg}>No company leads yet -- clients who come to the company directly, not through a specific agent, land here until assigned.</p>}
      {!isLoading && all.length > 0 && filtered.length === 0 && <p className={styles.emptyMsg}>No leads match &quot;{query}&quot;.</p>}

      <div className={styles.list}>
        {filtered.map((l) => (
          <LeadCard key={l.id} lead={l} />
        ))}
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
// whichever was chosen.
type AssignStep = 'closed' | 'choose' | 'move' | 'handle';

function LeadCard({ lead }: { lead: Lead }) {
  const navigate = useNavigate();
  const { data: agents } = useAgentRoster();
  const assign = useAssignCompanyLead();
  const assignHandler = useAssignCompanyLeadHandler();
  const setSource = useSetLeadSource();
  const { data: config } = useConfig();
  const downloadQuotation = useDownloadLeadQuotationPdf();
  const [assignStep, setAssignStep] = useState<AssignStep>('closed');
  const bal = Math.max(lead.grandTotal - lead.amtPaid, 0);
  const handlerName = lead.assignedAgentKey ? (agents?.find((a) => a.key === lead.assignedAgentKey)?.name ?? lead.assignedAgentKey) : null;

  return (
    <div className={styles.card}>
      <div className={styles.top} onClick={() => navigate(`/dashboard/company-leads/${lead.id}`)} role="button" tabIndex={0}>
        <div className={styles.avatarWrap}>
          <span className={styles.avatar}>{initials(lead.name)}</span>
          <div>
            <div className={styles.name}>{lead.name}</div>
            <div className={styles.meta}>
              {lead.contact} &middot; {lead.plotType}
              {qtyOfType(lead.plotType, lead.noPlots) > 1 ? ` ×${qtyOfType(lead.plotType, lead.noPlots)}` : ''}
            </div>
          </div>
        </div>
        <div className={styles.right}>
          <div className={styles.amt}>{ghs(lead.grandTotal)}</div>
          <div className={styles.meta}>{bal > 0 ? `Bal ${ghs(bal)}` : 'Paid in full'}</div>
          <div style={{ marginTop: 4 }}>
            <StageBadge stage={lead.stage} />
          </div>
        </div>
      </div>

      {lead.leadSource && <span className={styles.sourceTag}>{lead.leadSource}</span>}
      {handlerName && (
        <span className={styles.sourceTag} title="Handling this lead in Company Leads -- not their personal pipeline">
          Assigned to {handlerName}
          <button
            type="button"
            style={{ marginLeft: 6, border: 'none', background: 'none', cursor: 'pointer', color: 'inherit' }}
            disabled={assignHandler.isPending}
            onClick={() => assignHandler.mutate({ id: lead.id, agentKey: null })}
            title="Unassign"
          >
            ×
          </button>
        </span>
      )}

      {assignStep === 'choose' && (
        <div className={styles.assignPanel}>
          <p className={styles.hint} style={{ margin: 0 }}>
            Move transfers ownership into their own pipeline. Assign just hands it to them for follow-up -- it stays here in Company Leads.
          </p>
          <div className={styles.discModeRow}>
            <button type="button" className={styles.discModeChip} onClick={() => setAssignStep('move')}>
              Move to their pipeline
            </button>
            <button type="button" className={styles.discModeChip} onClick={() => setAssignStep('handle')}>
              Assign, keep in Company Leads
            </button>
          </div>
          <button type="button" className={styles.cancelBtn} onClick={() => setAssignStep('closed')}>
            Cancel
          </button>
        </div>
      )}
      {(assignStep === 'move' || assignStep === 'handle') && (
        <div className={styles.assignPanel}>
          <select
            className={styles.select}
            defaultValue=""
            onChange={(e) => {
              if (!e.target.value) return;
              if (assignStep === 'move') assign.mutate({ id: lead.id, agentKey: e.target.value }, { onSuccess: () => setAssignStep('closed') });
              else assignHandler.mutate({ id: lead.id, agentKey: e.target.value }, { onSuccess: () => setAssignStep('closed') });
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
          <button type="button" className={styles.cancelBtn} onClick={() => setAssignStep('choose')}>
            Back
          </button>
        </div>
      )}
      {assignStep === 'closed' && (
        <div className={styles.actions}>
          <select
            className={styles.sourceSelect}
            value={lead.leadSource ?? ''}
            onChange={(e) => e.target.value && setSource.mutate({ id: lead.id, source: e.target.value })}
          >
            <option value="">{lead.leadSource ? 'Change source' : 'Where did they hear about us?'}</option>
            {LEAD_SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={styles.cancelBtn}
            disabled={!config || downloadQuotation.isPending}
            onClick={() => config && downloadQuotation.mutate({ lead, config })}
            title="Download quotation"
          >
            🧾 Quotation
          </button>
          <button type="button" className={styles.assignBtn} disabled={assign.isPending || assignHandler.isPending} onClick={() => setAssignStep('choose')}>
            Assign to agent →
          </button>
        </div>
      )}
    </div>
  );
}