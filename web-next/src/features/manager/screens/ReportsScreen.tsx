import { useState } from 'react';
import { ghs, today } from '../../../shared/lib/format';
import { exportCSV } from '../../../shared/lib/csv';
import { displayStageCode } from '../../pipeline/lib/pipelineLogic';
import { useAllLeadsReport, useAllEnquiriesReport, useAllComplaintsReport, useAllSiteVisitsReport } from '../hooks/useReports';
import { useTeamRoster } from '../hooks/useTeamRoster';
import { useDownloadCompanyReport } from '../hooks/useCompanyReportExcel';
import { useDownloadAgentPipeline, useDownloadMasterPipeline, usePipelineAgents } from '../hooks/usePipelineExcel';
import { useDownloadManagementReport } from '../hooks/useManagementReport';
import { reportPeriodRange, type ReportPeriodKey } from '../lib/managementReportLogic';
import type { Lead } from '../../../types/domain';
import styles from './ReportsScreen.module.css';

const PERIOD_OPTIONS: { key: ReportPeriodKey; label: string }[] = [
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'lastmonth', label: 'Last month' },
  { key: 'year', label: 'This year' },
  { key: 'lastyear', label: 'Last year' },
  { key: 'custom', label: 'Custom range' },
];

// Port of mgrReports()'s "Individual sheets" CSV section + client search
// (index.html:19967-20055), the styled Company Report .xlsx workbook
// (downloadCompanyExcel(), index.html:20524-20623), and the Master
// Pipeline / per-agent pipeline .xlsx exports (index.html:20001-20184) --
// these write into the real uploaded pipeline-template.xlsx, preserving
// every one of its live formula columns, not a rebuild. Import (round-
// tripping an edited workbook back into the app) stays out of scope.
export function ReportsScreen() {
  const { data: leads, isLoading: leadsLoading } = useAllLeadsReport();
  const { data: enquiries } = useAllEnquiriesReport();
  const { data: complaints } = useAllComplaintsReport();
  const { data: siteVisits } = useAllSiteVisitsReport();
  const { data: roster } = useTeamRoster();
  const downloadCompanyReport = useDownloadCompanyReport();
  const downloadMasterPipeline = useDownloadMasterPipeline();
  const downloadAgentPipeline = useDownloadAgentPipeline();
  const { data: pipelineAgents } = usePipelineAgents();
  const [selectedAgentKey, setSelectedAgentKey] = useState('');
  const [query, setQuery] = useState('');
  const downloadManagementReport = useDownloadManagementReport();
  const [periodKey, setPeriodKey] = useState<ReportPeriodKey>('month');
  const [customFrom, setCustomFrom] = useState(today());
  const [customTo, setCustomTo] = useState(today());
  const [compare, setCompare] = useState(false);

  const nameFor = (agentKey: string) => roster?.find((r) => r.key === agentKey)?.name ?? agentKey;

  const q = query.trim().toLowerCase();
  const matches = q ? (leads ?? []).filter((l) => l.name.toLowerCase().includes(q) || l.contact.includes(q)).slice(0, 25) : [];

  function downloadClient(l: Lead) {
    const balance = Math.max(l.grandTotal - l.amtPaid, 0);
    exportCSV(
      [l],
      [
        ['Agent', () => nameFor(l.agent)],
        ['Client', 'name'],
        ['Contact', 'contact'],
        ['Date Added', 'date'],
        ['Stage', (r) => displayStageCode(r.stage)],
        ['Plot Type', 'plotType'],
        ['No. Plots', 'noPlots'],
        ['Grand Total', 'grandTotal'],
        ['Amount Paid', 'amtPaid'],
        ['Balance', () => balance],
        ['Notes', (r) => r.notes ?? ''],
      ],
      `Client_${l.name.replace(/\s+/g, '_')}_${today()}.csv`,
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.eyebrow}>Management</div>
      <h1 className={styles.title}>Reports</h1>
      <p className={styles.sub}>Download company data &mdash; live figures, exported on demand, nothing pre-generated or stale.</p>

      <div className={styles.sectitle}>Management Report (PDF)</div>
      <div className={styles.card} style={{ padding: '14px 16px' }}>
        <div className={styles.periodRow}>
          {PERIOD_OPTIONS.map((o) => (
            <button key={o.key} type="button" className={`${styles.periodChip} ${periodKey === o.key ? styles.periodChipOn : ''}`} onClick={() => setPeriodKey(o.key)}>
              {o.label}
            </button>
          ))}
        </div>
        {periodKey === 'custom' && (
          <div className={styles.customRow}>
            <label className={styles.customField}>
              From
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            </label>
            <label className={styles.customField}>
              To
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </label>
          </div>
        )}
        <label className={styles.compareRow}>
          <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} />
          Compare to the same-length previous period
        </label>
        <button
          type="button"
          className={styles.dlChip}
          style={{ width: '100%', padding: '10px 0', fontSize: 13 }}
          disabled={downloadManagementReport.isPending}
          onClick={() => downloadManagementReport.mutate({ range: reportPeriodRange(periodKey, customFrom, customTo), compare })}
        >
          {downloadManagementReport.isPending ? 'Building…' : 'Generate PDF report'}
        </button>
      </div>

      <input className={styles.search} placeholder="Search a client by name or contact…" value={query} onChange={(e) => setQuery(e.target.value)} />
      {q && (
        <div className={styles.searchResults}>
          {matches.length === 0 && <p style={{ color: 'var(--c-muted)', fontSize: 12.5 }}>No matches. Try a different name or number.</p>}
          {matches.map((l) => (
            <div className={styles.searchRow} key={l.id}>
              <div>
                <div className={styles.searchName}>{l.name}</div>
                <div className={styles.searchMeta}>
                  {l.contact} &middot; {nameFor(l.agent)} &middot; stage {displayStageCode(l.stage)}
                </div>
              </div>
              <div className={styles.searchRight}>
                <div className={styles.searchAmt}>{ghs(l.grandTotal)}</div>
                <button type="button" className={styles.dlChip} onClick={() => downloadClient(l)}>
                  ⬇ CSV
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={styles.sectitle}>Individual sheets</div>
      <div className={styles.card}>
        <ReportRow
          label="Company pipeline"
          hint={leadsLoading ? 'Loading…' : `${leads?.length ?? 0} clients`}
          onDownload={() =>
            leads &&
            exportCSV(
              leads,
              [
                ['Agent', (r) => nameFor(r.agent)],
                ['Client', 'name'],
                ['Contact', 'contact'],
                ['Date Added', 'date'],
                ['Stage', (r) => displayStageCode(r.stage)],
                ['Plot Type', 'plotType'],
                ['No. Plots', 'noPlots'],
                ['Grand Total', 'grandTotal'],
                ['Amount Paid', 'amtPaid'],
                ['Balance', (r) => Math.max(r.grandTotal - r.amtPaid, 0)],
              ],
              'PEP_Landbank_Pipeline.csv',
            )
          }
        />
        <ReportRow
          label="Enquiries"
          hint={`${enquiries?.length ?? 0} logged`}
          onDownload={() =>
            enquiries &&
            exportCSV(
              enquiries,
              [
                ['Agent', 'agentName'],
                ['Client', 'name'],
                ['Contact', 'contact'],
                ['Location', 'location'],
                ['Types', 'types'],
                ['Plot', 'plot'],
                ['Source', 'source'],
                ['Details', 'details'],
                ['Follow-up', 'follow'],
                ['Follow-up Date', 'followDate'],
                ['Logged', 'createdAt'],
              ],
              'PEP_Landbank_Enquiries.csv',
            )
          }
        />
        <ReportRow
          label="Client Feedback"
          hint={`${complaints?.length ?? 0} logged`}
          onDownload={() =>
            complaints &&
            exportCSV(
              complaints,
              [
                ['Agent', 'agentName'],
                ['Client', 'name'],
                ['Contact', 'contact'],
                ['Plot', 'plot'],
                ['Category', 'category'],
                ['Details', 'details'],
                ['Assigned', 'owner'],
                ['Priority', 'priority'],
                ['Status', 'status'],
                ['Resolution', 'resolution'],
                ['Logged', 'createdAt'],
              ],
              'PEP_Landbank_ClientFeedback.csv',
            )
          }
        />
        <ReportRow
          label="Site visits"
          hint={`${siteVisits?.length ?? 0} logged`}
          onDownload={() =>
            siteVisits &&
            exportCSV(
              siteVisits,
              [
                ['Agent', 'agentName'],
                ['Client', 'name'],
                ['Contact', 'contact'],
                ['Plot', 'plot'],
                ['Site', 'site'],
                ['Date', 'visitDate'],
                ['Time', 'visitTime'],
                ['Guests', 'people'],
                ['Transport', 'transport'],
                ['Pickup', 'pickup'],
                ['Status', 'status'],
                ['Notes', 'notes'],
                ['Logged', 'createdAt'],
              ],
              'PEP_Landbank_SiteVisits.csv',
            )
          }
        />
      </div>

      <div className={styles.sectitle}>Full workbook</div>
      <div className={styles.card}>
        <ReportRow
          label="Company Report (.xlsx)"
          hint="Summary, agent performance, leads, enquiries, feedback & site visits — one styled workbook"
          onDownload={() => downloadCompanyReport.mutate()}
          downloading={downloadCompanyReport.isPending}
          buttonLabel="⬇ .xlsx"
        />
      </div>

      <div className={styles.sectitle}>Master Pipeline</div>
      <p className={styles.sub} style={{ margin: '0 0 10px' }}>
        Every client from every agent, combined into the exact same pipeline template &mdash; same columns, same colours, same formulas, sorted A&ndash;Z.
      </p>
      <div className={styles.card}>
        <ReportRow label="All agents, one workbook" hint={leadsLoading ? 'Loading…' : `${leads?.length ?? 0} clients`} onDownload={() => downloadMasterPipeline.mutate()} downloading={downloadMasterPipeline.isPending} buttonLabel="⬇ .xlsx" />
      </div>

      <div className={styles.sectitle}>Just one agent</div>
      <div className={styles.card}>
        <select className={styles.search} value={selectedAgentKey || pipelineAgents?.[0]?.key || ''} onChange={(e) => setSelectedAgentKey(e.target.value)}>
          {pipelineAgents?.map((a) => (
            <option key={a.key} value={a.key}>
              {a.name}
            </option>
          ))}
        </select>
        <ReportRow
          label="Same template, just filtered"
          hint="Pick an agent above to download only their clients"
          onDownload={() => {
            const key = selectedAgentKey || pipelineAgents?.[0]?.key;
            const agent = pipelineAgents?.find((a) => a.key === key);
            if (agent) downloadAgentPipeline.mutate({ agentKey: agent.key, agentName: agent.name });
          }}
          downloading={downloadAgentPipeline.isPending}
          buttonLabel="⬇ .xlsx"
        />
      </div>
    </div>
  );
}

function ReportRow({ label, hint, onDownload, downloading, buttonLabel = '⬇ CSV' }: { label: string; hint: string; onDownload: () => void; downloading?: boolean; buttonLabel?: string }) {
  return (
    <div className={styles.row}>
      <div>
        <div className={styles.rowLabel}>{label}</div>
        <div className={styles.rowHint}>{hint}</div>
      </div>
      <button type="button" className={styles.dlChip} onClick={onDownload} disabled={downloading}>
        {downloading ? '…' : buttonLabel}
      </button>
    </div>
  );
}
