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
import { useAgentRoster, useAssignCompanyLead, useCompanyLeads, useSetLeadSource } from '../hooks/useCompanyLeads';
import type { Lead } from '../../../types/domain';
import styles from './CompanyLeadsScreen.module.css';

const LEAD_SOURCES = ['Referral', 'Facebook', 'Instagram', 'TikTok', 'Google', 'Website', 'Radio', 'TV', 'Other'] as const;

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
  const hasDetailOpen = /^\/app\/sales\/company-leads\/[^/]+$/.test(location.pathname);
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
          <button type="button" className={styles.addBtn} onClick={() => navigate('/app/sales/pipeline/new', { state: { returnTo: '/app/sales/company-leads', agentKeyOverride: 'company' } })}>
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

function LeadCard({ lead }: { lead: Lead }) {
  const navigate = useNavigate();
  const { data: agents } = useAgentRoster();
  const assign = useAssignCompanyLead();
  const setSource = useSetLeadSource();
  const { data: config } = useConfig();
  const downloadQuotation = useDownloadLeadQuotationPdf();
  const [assigning, setAssigning] = useState(false);
  const bal = Math.max(lead.grandTotal - lead.amtPaid, 0);

  return (
    <div className={styles.card}>
      <div className={styles.top} onClick={() => navigate(`/app/sales/company-leads/${lead.id}`)} role="button" tabIndex={0}>
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

      {assigning ? (
        <div className={styles.assignPanel}>
          <select className={styles.select} defaultValue="" onChange={(e) => e.target.value && assign.mutate({ id: lead.id, agentKey: e.target.value }, { onSuccess: () => setAssigning(false) })}>
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
          <button type="button" className={styles.cancelBtn} onClick={() => setAssigning(false)}>
            Cancel
          </button>
        </div>
      ) : (
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
          <button type="button" className={styles.assignBtn} disabled={assign.isPending} onClick={() => setAssigning(true)}>
            Assign to agent →
          </button>
        </div>
      )}
    </div>
  );
}
