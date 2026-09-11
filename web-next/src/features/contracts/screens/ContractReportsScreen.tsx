import { useContracts } from '../hooks/useContracts';
import { useContractGenerations, useContractTemplates } from '../hooks/useContractTemplates';
import { useContractRequests } from '../hooks/useContractRequests';
import { useAllLeads } from '../../payments/hooks/useLogPayment';
import { useDownloadContractReport, type ContractReportKind } from '../hooks/useContractReports';
import styles from './ContractReportsScreen.module.css';

// CONTRACT_OF_SALE_BLUEPRINT.md §11 -- the 6 named reports, each a real
// branded PDF (contractReportsPdf.ts) built live from real rows, nothing
// pre-generated. Same "Reports" tab convention as every other multi-
// screen app this session (Attendance's own Records report lives inside
// Attendance, not a separate sidebar entry) -- see ContractsScreen.tsx.
const REPORTS: { kind: ContractReportKind; label: string; hint: string }[] = [
  { kind: 'production', label: 'Contract production report', hint: 'Volume, template vs legacy split, 6-month trend, recent contracts' },
  { kind: 'outstanding', label: 'Outstanding requests', hint: 'Every pending request, aged oldest-first, flagged past 7 days' },
  { kind: 'missing_info', label: 'Missing-information report', hint: 'Pending requests whose client KYC is incomplete' },
  { kind: 'template_usage', label: 'Template-version usage', hint: 'Which published template versions have actually been used' },
  { kind: 'turnaround', label: 'Turnaround-time report', hint: 'Real days from request to fulfilment, flagged past 5 days' },
  { kind: 'document_status', label: 'Document status report', hint: 'Fulfilled/pending crossed with whether a document exists (no e-signature tracking yet)' },
];

export function ContractReportsScreen() {
  const { data: contracts } = useContracts();
  const { data: generations } = useContractGenerations();
  const { data: requests } = useContractRequests();
  const { data: templates } = useContractTemplates();
  const { data: leads } = useAllLeads();
  const download = useDownloadContractReport();

  const ready = !!contracts && !!generations && !!requests && !!templates && !!leads;

  return (
    <div className={styles.wrap}>
      <p className={styles.sub}>Live figures, exported on demand — nothing pre-generated or stale.</p>
      <div className={styles.card}>
        {REPORTS.map((r) => (
          <div className={styles.row} key={r.kind}>
            <div>
              <div className={styles.rowLabel}>{r.label}</div>
              <div className={styles.rowHint}>{r.hint}</div>
            </div>
            <button
              type="button"
              className={styles.dlChip}
              disabled={!ready || download.isPending}
              onClick={() => ready && download.mutate({ kind: r.kind, contracts: contracts!, generations: generations!, requests: requests!, templates: templates!, leads: leads! })}
            >
              {download.isPending ? '…' : '⬇ PDF'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
