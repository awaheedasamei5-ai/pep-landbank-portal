import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ghs, fmtLongDate } from '../../../shared/lib/format';
import { Icon, type IconName } from '../../../shared/ui/Icon';
import { StageBadge } from '../../pipeline/components/StageBadge';
import { useLeads } from '../../pipeline/hooks/useLeads';
import { useClients } from '../hooks/useClients';
import { useClientRelatedData } from '../hooks/useClientRelatedData';
import { clientKey } from '../lib/groupClients';
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
  const { data: clients } = useClients();
  const { data: leads } = useLeads();
  const { data: related } = useClientRelatedData();

  const client = (clients ?? []).find((c) => clientKey(c.name, c.contact) === key);
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
  const complaints = useMemo(() => (related?.complaints ?? []).filter((co) => client && clientKey(co.name ?? '', co.contact ?? '') === key), [related, client, key]);

  return (
    <div className={styles.drawerBackdrop}>
      <div className={styles.drawerPanel}>
        <button type="button" className={styles.closeDrawerBtn} onClick={() => navigate('/app/sales/clients')} aria-label="Close" title="Close">
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
                <button type="button" key={l.id} className={styles.row} onClick={() => navigate(`/app/sales/pipeline/${l.id}`)}>
                  <div className={styles.rowMain}>
                    <div className={styles.rowTitle}>
                      {l.plotType}
                      {l.noPlots > 1 ? ` ×${l.noPlots}` : ''}
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
              {payments.map((p) => (
                <div key={p.id} className={styles.rowStatic}>
                  <div className={styles.rowMain}>
                    <div className={styles.rowTitle}>{ghs(p.amount)}</div>
                    <div className={styles.rowSub}>
                      {fmtLongDate(p.date)}
                      {p.paymentMethod ? ` · ${p.paymentMethod}` : ''}
                    </div>
                  </div>
                  <PaymentStatusChip status={p.status} />
                </div>
              ))}
            </Section>

            <Section title="Site visits" count={siteVisits.length} icon="pin">
              {siteVisits.length === 0 && <EmptyRow text="No site visits recorded." />}
              {siteVisits.map((v) => (
                <div key={v.id} className={styles.rowStatic}>
                  <div className={styles.rowMain}>
                    <div className={styles.rowTitle}>{v.site}</div>
                    <div className={styles.rowSub}>{fmtLongDate(v.visitDate)}</div>
                  </div>
                  <StatusChip tone={v.status === 'completed' ? 'ok' : v.status === 'cancelled' ? 'dgr' : 'muted'}>{v.status}</StatusChip>
                </div>
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

            <Section title="Contracts" count={contracts.length + contractRequests.length} icon="document">
              {contracts.length === 0 && contractRequests.length === 0 && <EmptyRow text="No contracts on file." />}
              {contracts.map((c) => (
                <div key={c.id} className={styles.rowStatic}>
                  <div className={styles.rowMain}>
                    <div className={styles.rowTitle}>Contract of Sale</div>
                    <div className={styles.rowSub}>Generated {fmtLongDate(c.createdAt)}</div>
                  </div>
                  <StatusChip tone="ok">generated</StatusChip>
                </div>
              ))}
              {contractRequests
                .filter((r) => r.status === 'pending')
                .map((r) => (
                  <div key={r.id} className={styles.rowStatic}>
                    <div className={styles.rowMain}>
                      <div className={styles.rowTitle}>Contract request</div>
                      <div className={styles.rowSub}>Requested {fmtLongDate(r.createdAt)}</div>
                    </div>
                    <StatusChip tone="warn">pending</StatusChip>
                  </div>
                ))}
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
            <button type="button" className={styles.backBtn} onClick={() => navigate('/app/sales/clients')}>
              ← Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
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
