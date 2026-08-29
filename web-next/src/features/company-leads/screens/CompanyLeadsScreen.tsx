import { useState } from 'react';
import { ghs } from '../../../shared/lib/format';
import { useAgentRoster, useAssignCompanyLead, useCompanyLeads, useSetLeadSource } from '../hooks/useCompanyLeads';
import type { Lead } from '../../../types/domain';
import styles from './CompanyLeadsScreen.module.css';

const LEAD_SOURCES = ['Referral', 'Facebook', 'Instagram', 'TikTok', 'Google', 'Website', 'Radio', 'TV', 'Other'] as const;

// Real agent_key='company' pool (confirmed live): clients who came to the
// company directly, not through a specific agent, sit here until assigned.
// leads_upd_company RLS is the only policy that lets manager/elias/
// emmanuel/elizabeth UPDATE a lead that isn't theirs -- and ONLY while its
// agent_key is still 'company', which is exactly the assign action below.
// Banner-linked lead source (index.html's openLeadSourceModal, tied to
// Banner Tracking) is out of scope -- Banner Tracking itself isn't built
// in web-next yet, so this offers a plain source dropdown only.
export function CompanyLeadsScreen() {
  const { data: leads, isLoading } = useCompanyLeads();

  return (
    <div className={styles.wrap}>
      <div className={styles.eyebrow}>Company-sourced</div>
      <h1 className={styles.title}>Company Leads</h1>
      <p className={styles.sub}>Clients who came to the company directly -- assign each to an agent once you know who&apos;s handling them.</p>

      {isLoading && <p style={{ color: 'var(--muted)' }}>Loading…</p>}
      {leads && leads.length === 0 && !isLoading && <p style={{ color: 'var(--muted)' }}>No company leads yet.</p>}

      <div className={styles.list}>
        {leads?.map((l) => (
          <LeadCard key={l.id} lead={l} />
        ))}
      </div>
    </div>
  );
}

function LeadCard({ lead }: { lead: Lead }) {
  const { data: agents } = useAgentRoster();
  const assign = useAssignCompanyLead();
  const setSource = useSetLeadSource();
  const [assigning, setAssigning] = useState(false);
  const bal = Math.max(lead.grandTotal - lead.amtPaid, 0);

  return (
    <div className={styles.card}>
      <div className={styles.top}>
        <div>
          <div className={styles.name}>{lead.name}</div>
          <div className={styles.meta}>
            {lead.contact} &middot; {lead.plotType}
            {lead.noPlots > 1 ? ` ×${lead.noPlots}` : ''}
          </div>
        </div>
        <div className={styles.right}>
          <div className={styles.amt}>{ghs(lead.grandTotal)}</div>
          <div className={styles.meta}>{bal > 0 ? `Bal ${ghs(bal)}` : 'Paid in full'}</div>
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
          <button type="button" className={styles.assignBtn} disabled={assign.isPending} onClick={() => setAssigning(true)}>
            Assign to agent →
          </button>
        </div>
      )}
    </div>
  );
}
