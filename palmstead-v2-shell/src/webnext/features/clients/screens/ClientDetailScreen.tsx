"use client";

import { useMemo, useState } from 'react';
import { Check, Download, Link2 } from 'lucide-react';
import { requireSupabase } from '@/lib/supabase.client';
// biome-ignore lint/correctness/noUndeclaredDependencies: this resolves through the local webnext router shim.
import { useNavigate, useParams } from 'react-router';
import { ghs, fmtLongDate } from '../../../shared/lib/format';
import { Icon, type IconName } from '../../../shared/ui/Icon';
import { useAllLeads } from '../../payments/hooks/useLogPayment';
import { useDownloadReceipt, useIssueReceiptLink } from '../../payments/hooks/useReceipt';
import { StageBadge } from '../../pipeline/components/StageBadge';
import { qtyOfType } from '../../pipeline/lib/pipelineLogic';
import { useLeads } from '../../pipeline/hooks/useLeads';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useClients } from '../hooks/useClients';
import { useClientRelatedData } from '../hooks/useClientRelatedData';
import { clientKey } from '../lib/groupClients';
import type { ContractGeneration, SiteVisit } from '../../../types/domain';
import styles from './ClientDetailScreen.module.css';

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

function StatusChip({ tone, children }: { tone: 'ok' | 'warn' | 'dgr' | 'muted'; children: React.ReactNode }) {
  return <span className={`${styles.chip} ${styles[`chip_${tone}`]}`}>{children}</span>;
}

function ContractPdfAction({ generation }: { generation: ContractGeneration }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function prepareLink() {
    if (!generation.pdfStoragePath) return;
    setLoading(true);
    setError(null);
    setSignedUrl(null);
    try {
      const { data, error: storageError } = await requireSupabase()
        .storage.from('contract-pdfs').createSignedUrl(generation.pdfStoragePath, 300);
      if (storageError) throw storageError;
      if (!data?.signedUrl) throw new Error('A secure PDF link could not be created.');
      setSignedUrl(data.signedUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The contract PDF could not be opened.');
    } finally {
      setLoading(false);
    }
  }

  if (!generation.pdfStoragePath) return <StatusChip tone="muted">PDF not stored</StatusChip>;
  return (
    <div className={styles.contractActions}>
      <button type="button" className={styles.contractAction} disabled={loading} onClick={prepareLink}>
        <Download aria-hidden="true" />
        {loading ? 'Preparing…' : signedUrl ? 'Refresh link' : 'Get PDF'}
      </button>
      {signedUrl && <a className={styles.contractLink} href={signedUrl} target="_blank" rel="noopener noreferrer">Open PDF</a>}
      {error && <span className={styles.contractError} role="alert">{error}</span>}
    </div>
  );
}

// Master Rebuild Spec 17.2: "Open customer -> all related leads, payments,
// visits, allocations, contracts and complaints." The one gap this screen
// exists to close -- Client Database used to only ever show a client's
// deals, nothing else the business actually tracks about them. Same split-
// view drawer language as Pipeline's own lead detail (non-modal, closes via
// its own button, list stays live behind it) -- one detail-panel pattern
// for the whole app, not a second bespoke one for clients.
export function ClientDetailScreen() {
  const navigate = useNavigate();
  const { key: rawKey } = useParams<{ key: string }>();
  const key = rawKey ? decodeURIComponent(rawKey) : '';
  const profile = useSessionStore((s) => s.profile);
  const { data: clients } = useClients();
  const client = (clients ?? []).find((c) => clientKey(c.name, c.contact) === key);
  const ownLeads = useLeads();
  const allLeads = useAllLeads();
  const { data: leads } = profile?.role === 'manager' ? allLeads : ownLeads;
  const { data: related, isLoading: relatedLoading } = useClientRelatedData(client?.leadIds ?? []);
  const downloadReceipt = useDownloadReceipt();
  const issueReceiptLink = useIssueReceiptLink();
  const [copiedReceiptId, setCopiedReceiptId] = useState<string | null>(null);
  const [receiptLinks, setReceiptLinks] = useState<Record<string, string>>({});
  const clientLeads = useMemo(() => (leads ?? []).filter((l) => client?.leadIds.includes(l.id)), [leads, client]);
  const leadIdSet = useMemo(() => new Set(client?.leadIds ?? []), [client]);

  const payments = useMemo(() => (related?.payments ?? []).filter((p) => leadIdSet.has(p.leadId)), [related, leadIdSet]);
  const siteVisits = useMemo(
    () => (related?.siteVisits ?? []).filter((v) => (v.leadId ? leadIdSet.has(v.leadId) : client && clientKey(v.name, v.contact) === key)),
    [related, leadIdSet, client, key]
  );
  const allocations = useMemo(() => (related?.allocations ?? []).filter((a) => leadIdSet.has(a.leadId)), [related, leadIdSet]);
  const contractRequests = useMemo(() => (related?.contractRequests ?? []).filter((r) => leadIdSet.has(r.leadId)), [related, leadIdSet]);
  // contracts.list() is unscoped (no agent-scoped variant exists -- see
  // useClientRelatedData's own comment) -- filtering by this client's own
  // leadIds here is the only thing standing between this render and
  // showing a colleague's contract. Never remove this filter.
  const contracts = useMemo(() => (related?.contracts ?? []).filter((c) => leadIdSet.has(c.leadId)), [related, leadIdSet]);
  const contractGenerations = useMemo(
    () => (related?.contractGenerations ?? []).filter((generation) => generation.leadId != null && leadIdSet.has(generation.leadId)),
    [related, leadIdSet]
  );
  const metadataOnlyContracts = useMemo(() => {
    const matchedGenerationIds = new Set<string>();
    return contracts.filter((contract) => {
      const contractTime = Date.parse(contract.createdAt);
      const match = contractGenerations.find((generation) => {
        if (matchedGenerationIds.has(generation.id) || generation.leadId !== contract.leadId || generation.generatedBy !== contract.createdBy) return false;
        const generationTime = Date.parse(generation.generatedAt);
        return Number.isFinite(contractTime) && Number.isFinite(generationTime) && Math.abs(generationTime - contractTime) <= 60_000;
      });
      if (match) {
        matchedGenerationIds.add(match.id);
        return false;
      }
      return true;
    });
  }, [contracts, contractGenerations]);
  const complaints = useMemo(() => (related?.complaints ?? []).filter((co) => client && clientKey(co.name ?? '', co.contact ?? '') === key), [related, client, key]);

  async function shareReceipt(paymentId: string, leadId: string) {
    const payment = payments.find((item) => item.id === paymentId);
    const lead = clientLeads.find((item) => item.id === leadId);
    if (!payment || !lead) return;
    const link = await issueReceiptLink.mutateAsync({ payment, lead });
    setReceiptLinks((current) => ({ ...current, [payment.id]: link }));
    try {
      await navigator.clipboard.writeText(link);
      setCopiedReceiptId(payment.id);
      window.setTimeout(() => setCopiedReceiptId((current) => (current === payment.id ? null : current)), 2500);
    } catch {
      setCopiedReceiptId(null);
    }
  }

  return (
    <div className={styles.drawerBackdrop}>
      <div className={styles.drawerPanel}>
        <button type="button" className={styles.closeDrawerBtn} onClick={() => navigate('/dashboard/clients')} aria-label="Close" title="Close">
          ✕
        </button>

        {!client ? (
          <div className={styles.wrap}>
            <p className={styles.emptyMsg}>Client not found.</p>
          </div>
        ) : (
          <div className={styles.wrap}>
            <div className={styles.head}>
              <span className={styles.avatar}>{initials(client.name)}</span>
              <div>
                <div className={styles.eyebrow}>Customer 360</div>
                <div className={styles.name}>{client.name}</div>
                <div className={styles.meta}>{client.contact}</div>
              </div>
            </div>

            <div className={styles.statsRow}>
              <div className={styles.statCard}>
                <div className={styles.statLabel}>Total value</div>
                <div className={styles.statValue}>{ghs(client.totalValue)}</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statLabel}>Paid</div>
                <div className={styles.statValue}>{ghs(client.totalPaid)}</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statLabel}>Balance</div>
                <div className={styles.statValue}>{ghs(Math.max(client.totalValue - client.totalPaid, 0))}</div>
              </div>
            </div>

            <Section title="Leads" count={clientLeads.length} icon="briefcase2">
              {clientLeads.length === 0 && <EmptyRow text="No leads on file." />}
              {clientLeads.map((l) => (
                <button type="button" key={l.id} className={styles.row} onClick={() => navigate(`/dashboard/pipeline/${l.id}`)}>
                  <div className={styles.rowMain}>
                    <div className={styles.rowTitle}>
                      {l.plotType}
                      {qtyOfType(l.plotType, l.noPlots) > 1 ? ` ×${qtyOfType(l.plotType, l.noPlots)}` : ''}
                    </div>
                    <div className={styles.rowSub}>
                      {l.date}
                      {/* Real gap caught live: this lead's own siteVisit
                          flag (set on the lead record itself, e.g. via
                          Pipeline Detail) is a different thing from a
                          real SiteVisit appointment record (the "Site
                          visits" section below, matching Master Spec
                          17.2's own "visits" domain) -- a lead can be
                          flagged as visited with no formal SiteVisit row
                          on file yet. Surfacing it here too so it isn't
                          invisible in Customer 360 just because the two
                          don't sync to each other (a separate, real
                          cross-app-sync item, not this). */}
                      {l.siteVisit === 'Yes' ? ' · Site visited' : ''}
                    </div>
                  </div>
                  <div className={styles.rowRight}>
                    <div className={styles.rowValue}>{ghs(l.grandTotal)}</div>
                    <StageBadge stage={l.stage} />
                  </div>
                </button>
              ))}
            </Section>

            <Section title="Payments" count={payments.length} icon="wallet">
              {payments.length === 0 && <EmptyRow text="No payments logged yet." />}
              {payments.map((p) => {
                const approved = (p.status ?? 'approved') === 'approved';
                const lead = clientLeads.find((item) => item.id === p.leadId);
                return (
                  <div key={p.id} className={`${styles.rowStatic} ${styles.paymentRow}`}>
                    <div className={styles.rowMain}>
                      <div className={styles.rowTitle}>{ghs(p.amount)}</div>
                      <div className={styles.rowSub}>
                        {fmtLongDate(p.date)}
                        {p.paymentMethod ? ` · ${p.paymentMethod}` : ''}
                        {p.receiptNumber ? ` · ${p.receiptNumber}` : ''}
                      </div>
                    </div>
                    <div className={styles.paymentRight}>
                      <PaymentStatusChip status={p.status} />
                      {approved && lead && (
                        <div className={styles.paymentActions}>
                          <button
                            type="button"
                            className={styles.receiptAction}
                            onClick={() => downloadReceipt.mutate({ payment: p, lead })}
                            disabled={downloadReceipt.isPending}
                            aria-label={`Download receipt${p.receiptNumber ? ` ${p.receiptNumber}` : ''}`}
                            title="Download receipt PDF"
                          >
                            <Download size={15} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className={styles.receiptAction}
                            onClick={() => void shareReceipt(p.id, lead.id).catch(() => setCopiedReceiptId(null))}
                            disabled={issueReceiptLink.isPending}
                            aria-label={copiedReceiptId === p.id ? 'Receipt link copied' : 'Copy secure receipt link'}
                            title={copiedReceiptId === p.id ? 'Receipt link copied' : 'Copy secure receipt link'}
                          >
                            {copiedReceiptId === p.id ? <Check size={15} aria-hidden="true" /> : <Link2 size={15} aria-hidden="true" />}
                          </button>
                        </div>
                      )}
                      {approved && receiptLinks[p.id] && (
                        <a className={styles.receiptLink} href={receiptLinks[p.id]} target="_blank" rel="noreferrer">
                          Open receipt
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
              {(downloadReceipt.error || issueReceiptLink.error) && (
                <div className={styles.receiptError} role="alert">
                  {downloadReceipt.error?.message ?? issueReceiptLink.error?.message ?? 'The receipt could not be prepared. Please try again.'}
                </div>
              )}
            </Section>

            <Section title="Site visits" count={siteVisits.length} icon="pin">
              {siteVisits.length === 0 && clientLeads.some((lead) => lead.siteVisit?.trim().toLowerCase() === "yes") && (
                <div className={styles.visitGap} role="note">
                  <div className={styles.visitGapTitle}>Pipeline marked this client as “Site visited”</div>
                  <div className={styles.visitGapText}>
                    There is no submitted site-visit form linked to this client yet. The pipeline flag is not a substitute for the staff visit record.
                  </div>
                  {clientLeads.filter((lead) => lead.siteVisit?.trim().toLowerCase() === "yes").map((lead) => (
                    <button key={lead.id} type="button" className={styles.visitGapButton} onClick={() => navigate(`/dashboard/pipeline/${lead.id}`)}>
                      Review {lead.plotType} lead
                    </button>
                  ))}
                </div>
              )}
              {siteVisits.length === 0 && <EmptyRow text="No submitted site-visit forms are linked to this client." />}
              {siteVisits.map((visit) => (
                <SiteVisitRecord key={visit.id} visit={visit} />
              ))}
            </Section>

            <Section title="Allocations" count={allocations.length} icon="building">
              {allocations.length === 0 && <EmptyRow text="No allocation requests." />}
              {allocations.map((a) => (
                <div key={a.id} className={styles.rowStatic}>
                  <div className={styles.rowMain}>
                    <div className={styles.rowTitle}>{a.plotNumber || 'Plot not yet picked'}</div>
                    <div className={styles.rowSub}>{fmtLongDate(a.createdAt)}</div>
                  </div>
                  <StatusChip tone={a.status === 'Allocated' ? 'ok' : a.status === 'Awaiting Authorization' ? 'warn' : 'muted'}>{a.status}</StatusChip>
                </div>
              ))}
            </Section>

            <Section title="Contracts" count={contractGenerations.length + metadataOnlyContracts.length + contractRequests.filter((r) => r.status === 'pending').length} icon="document">
              {relatedLoading ? (
                <EmptyRow text="Loading contract records…" />
              ) : contractGenerations.length === 0 && metadataOnlyContracts.length === 0 && !contractRequests.some((r) => r.status === 'pending') ? (
                <EmptyRow text="No contracts on file." />
              ) : (
                <>
                  {contractGenerations.map((generation) => (
                    <div key={`generation-${generation.id}`} className={styles.rowStatic}>
                      <div className={styles.rowMain}>
                        <div className={styles.rowTitle}>Contract of Sale{generation.versionNumberSnapshot != null ? ` · v${generation.versionNumberSnapshot}` : ''}</div>
                        <div className={styles.rowSub}>Generated {fmtLongDate(generation.generatedAt)} · {generation.generatedByName}</div>
                      </div>
                      <ContractPdfAction generation={generation} />
                    </div>
                  ))}
                  {metadataOnlyContracts.map((contract) => (
                    <div key={`metadata-${contract.id}`} className={styles.rowStatic}>
                      <div className={styles.rowMain}>
                        <div className={styles.rowTitle}>Contract of Sale record</div>
                        <div className={styles.rowSub}>Generated {fmtLongDate(contract.createdAt)} · PDF is not stored in this record</div>
                      </div>
                      <StatusChip tone="muted">record only</StatusChip>
                    </div>
                  ))}
                  {contractRequests
                    .filter((request) => request.status === 'pending')
                    .map((request) => (
                      <div key={`request-${request.id}`} className={styles.rowStatic}>
                        <div className={styles.rowMain}>
                          <div className={styles.rowTitle}>Contract request</div>
                          <div className={styles.rowSub}>Requested {fmtLongDate(request.createdAt)}</div>
                        </div>
                        <StatusChip tone="warn">pending</StatusChip>
                      </div>
                    ))}
                </>
              )}
            </Section>

            <Section title="Complaints" count={complaints.length} icon="warning">
              {complaints.length === 0 && <EmptyRow text="No complaints on file." />}
              {complaints.map((co) => (
                <div key={co.id} className={styles.rowStatic}>
                  <div className={styles.rowMain}>
                    <div className={styles.rowTitle}>{co.category || 'Complaint'}</div>
                    <div className={styles.rowSub}>{fmtLongDate(co.createdAt)}</div>
                  </div>
                  <StatusChip tone={co.status === 'resolved' ? 'ok' : co.status === 'open' ? 'warn' : 'muted'}>{co.status}</StatusChip>
                </div>
              ))}
            </Section>

            {/* Mobile has no visible closeDrawerBtn (desktop-only) -- same
                real back affordance Pipeline's own detail screen gives
                mobile users, at the bottom of the content. */}
            <button type="button" className={styles.backBtn} onClick={() => navigate('/dashboard/clients')}>
              ← Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SiteVisitRecord({ visit }: { visit: SiteVisit }) {
  const fields = siteVisitFormFields(visit);
  const summary = [fmtLongDate(visit.visitDate), visit.visitTime, visit.plot ? `Plot: ${visit.plot}` : null].filter(Boolean).join(" · ");
  const status = visit.status || "Status not recorded";
  const statusTone = status.toLowerCase() === "completed" ? "ok" : status.toLowerCase() === "cancelled" ? "dgr" : "muted";
  const attribution = [
    visit.agentName ? `Recorded by ${visit.agentName}` : null,
    visit.createdAt ? `Entered ${fmtLongDate(visit.createdAt)}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <details className={styles.visitRecord}>
      <summary className={styles.visitSummary}>
        <div className={styles.rowMain}>
          <div className={styles.rowTitle}>{visit.site || "Site visit"}</div>
          <div className={styles.rowSub}>{summary || "Visit date not recorded"}</div>
        </div>
        <StatusChip tone={statusTone}>{status}</StatusChip>
      </summary>
      <div className={styles.visitBody}>
        <div className={styles.visitAttribution}>{attribution || "Visit record"}</div>
        {fields.length === 0 ? (
          <div className={styles.visitNoFields}>No additional form answers were saved.</div>
        ) : (
          <dl className={styles.visitFormGrid}>
            {fields.map(([label, value]) => (
              <div key={label} className={styles.visitFormField}>
                <dt className={styles.visitFormLabel}>{label}</dt>
                <dd className={styles.visitFormValue}>{value}</dd>
              </div>
            ))}
          </dl>
        )}
        {visit.previousVisitDate && (
          <div className={styles.visitHistory}>Rescheduled from {fmtLongDate(visit.previousVisitDate)}</div>
        )}
        {visit.cancellationReason && (
          <div className={styles.visitHistory}>Cancellation reason: {visit.cancellationReason}</div>
        )}
      </div>
    </details>
  );
}

function siteVisitFormFields(visit: SiteVisit): Array<[string, string]> {
  const submitted: Array<[string, string | number | null | undefined]> = [
    ["Client name", visit.name],
    ["Contact", visit.contact],
    ["Plot interest", visit.plot],
    ["People attending", visit.people],
    ["Transport", visit.transport],
    ["Pickup point", visit.pickup],
    ["Place of work", visit.placeOfWork],
    ["Position", visit.position],
    ["Nationality", visit.nationality],
    ["Purpose of visit", visit.purpose],
    ["Discussion so far", visit.discussionSoFar],
    ["Key understanding", visit.keyUnderstanding],
    ["Feedback after visit", visit.feedbackAfter],
    ["Next steps", visit.keyNextSteps],
    ["Lead source", visit.source],
    ["Accompanied by", visit.accompanied],
    ["Additional notes", visit.notes],
  ];

  return submitted.reduce<Array<[string, string]>>((result, [label, value]) => {
    if (value === null || value === undefined) return result;
    const normalized = String(value).trim();
    if (normalized) result.push([label, normalized]);
    return result;
  }, []);
}

function Section({ title, count, icon, children }: { title: string; count: number; icon: IconName; children: React.ReactNode }) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionHead}>
        <span className={styles.sectionIcon}>
          <Icon name={icon} size={15} />
        </span>
        <span className={styles.sectionTitle}>{title}</span>
        <span className={styles.sectionCount}>{count}</span>
      </div>
      <div className={styles.sectionBody}>{children}</div>
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <div className={styles.emptyRow}>{text}</div>;
}

function PaymentStatusChip({ status }: { status?: string }) {
  const tone = status === 'approved' ? 'ok' : status === 'needs_correction' ? 'dgr' : 'warn';
  return <StatusChip tone={tone}>{status ?? 'pending'}</StatusChip>;
}