import { useState } from 'react';
import { ghs, today } from '../../../shared/lib/format';
import { exportCSV } from '../../../shared/lib/csv';
import { displayStageCode } from '../../pipeline/lib/pipelineLogic';
import { useAllLeadsReport, useAllEnquiriesReport, useAllComplaintsReport, useAllSiteVisitsReport } from '../hooks/useReports';
import { useTeamRoster } from '../hooks/useTeamRoster';
import { useDownloadCompanyReport } from '../hooks/useCompanyReportExcel';
import type { Lead } from '../../../types/domain';
import styles from './ReportsScreen.module.css';

// Port of mgrReports()'s "Individual sheets" CSV section + client search
// (index.html:19967-20055), plus the styled Company Report .xlsx workbook
// (downloadCompanyExcel(), index.html:20524-20623). The Master Pipeline /
// per-agent .xlsx exports are a separate, much larger undertaking (they
// load and write into your actual uploaded pipeline-template.xlsx,
// preserving its live formula columns) -- still out of scope here.
export function ReportsScreen() {
  const { data: leads, isLoading: leadsLoading } = useAllLeadsReport();
  const { data: enquiries } = useAllEnquiriesReport();
  const { data: complaints } = useAllComplaintsReport();
  const { data: siteVisits } = useAllSiteVisitsReport();
  const { data: roster } = useTeamRoster();
  const downloadCompanyReport = useDownloadCompanyReport();
  const [query, setQuery] = useState('');

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

      <input className={styles.search} placeholder="Search a client by name or contact…" value={query} onChange={(e) => setQuery(e.target.value)} />
      {q && (
        <div className={styles.searchResults}>
          {matches.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 12.5 }}>No matches. Try a different name or number.</p>}
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
      <p className={styles.footnote}>The Master Pipeline workbook (your real uploaded template, live formulas preserved) isn&apos;t built yet.</p>
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
