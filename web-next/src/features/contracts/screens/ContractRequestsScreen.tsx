import { Fragment, useState } from 'react';
import { useNavigate } from 'react-router';
import { useLeads } from '../../pipeline/hooks/useLeads';
import { useContractRequests, useCreateContractRequest, useCanFulfilContracts, useFulfilContractRequest } from '../hooks/useContractRequests';
import { Icon } from '../../../shared/ui/Icon';
import type { Lead, ContractRequest } from '../../../types/domain';
import styles from './ContractRequestsScreen.module.css';

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

// Real table `contract_requests` (confirmed live): any signed-in staff can
// request one against their own lead; only Management or the 'elizabeth'
// key can mark it fulfilled (contract_requests_upd RLS). Actually
// generating the contract-of-sale PDF is a separate screen
// (ContractGeneratorScreen, linked below for staff who can fulfil) -- this
// screen itself only models the real request/fulfil workflow, the part
// every staff member actually interacts with day to day.
export function ContractRequestsScreen() {
  const navigate = useNavigate();
  const { data: requests, isLoading } = useContractRequests();
  const canFulfil = useCanFulfilContracts();
  const [showForm, setShowForm] = useState(false);

  // A single list sorted pending-first, rather than two separately-filtered
  // arrays each with their own .map() -- a request that just got fulfilled
  // moving between two independent lists was observed to render with a
  // stale section membership (correct "Fulfilled" tag, wrong section) right
  // after the mutation, even though the underlying data was already
  // correct (confirmed via direct query) -- a reload always fixed it, so
  // this was a render-partitioning issue, not a data one. One sorted list
  // with an inline section divider sidesteps the whole pattern.
  const sorted = [...(requests ?? [])].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
  const firstFulfilledIndex = sorted.findIndex((r) => r.status === 'fulfilled');

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Contract requests</h1>
          <p className={styles.sub}>{requests?.length ?? 0} total</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {canFulfil && (
            <button
              type="button"
              className={styles.addBtn}
              style={{ background: 'none', border: '1px solid var(--c-line)', color: 'var(--c-muted)', display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={() => navigate('/app/office/contracts/generate')}
            >
              <Icon name="document" size={15} /> Generate
            </button>
          )}
          <button type="button" className={styles.addBtn} onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Cancel' : '+ Request contract'}
          </button>
        </div>
      </div>

      {showForm && <NewRequestForm onDone={() => setShowForm(false)} />}

      {isLoading && <p style={{ color: 'var(--c-muted)' }}>Loading…</p>}
      {requests && requests.length === 0 && !isLoading && <p style={{ color: 'var(--c-muted)' }}>No contract requests yet.</p>}

      <div className={styles.list}>
        {sorted.map((r, i) => (
          <Fragment key={r.id}>
            {i === 0 && r.status === 'pending' && <div className={styles.sectitle}>Pending</div>}
            {i === firstFulfilledIndex && <div className={styles.sectitle}>Fulfilled</div>}
            <RequestRow request={r} canFulfil={canFulfil && r.status === 'pending'} />
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function NewRequestForm({ onDone }: { onDone: () => void }) {
  const { data: leads } = useLeads();
  const create = useCreateContractRequest();
  const [query, setQuery] = useState('');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [note, setNote] = useState('');

  const q = query.trim().toLowerCase();
  const matches = q ? (leads ?? []).filter((l) => l.name.toLowerCase().includes(q) || l.contact.includes(q)).slice(0, 8) : [];

  async function submit() {
    if (!selectedLead) return;
    await create.mutateAsync({ leadId: selectedLead.id, clientName: selectedLead.name, note: note || undefined });
    onDone();
  }

  return (
    <div className={styles.formCard}>
      {!selectedLead ? (
        <>
          <input className={styles.input} placeholder="Search your clients by name or contact…" value={query} onChange={(e) => setQuery(e.target.value)} />
          {matches.length > 0 && (
            <div className={styles.pickerList}>
              {matches.map((l) => (
                <button key={l.id} type="button" className={styles.pickerRow} onClick={() => setSelectedLead(l)}>
                  <div className={styles.pickerName}>{l.name}</div>
                  <div className={styles.pickerMeta}>
                    {l.contact} · {l.plotType}
                  </div>
                </button>
              ))}
            </div>
          )}
          {q && matches.length === 0 && <p style={{ color: 'var(--c-muted)', fontSize: 12.5, marginTop: 10 }}>No clients match &quot;{query}&quot;.</p>}
        </>
      ) : (
        <>
          <div className={styles.selectedLead}>
            <div className={styles.pickerName}>{selectedLead.name}</div>
            <button type="button" className={styles.changeBtn} onClick={() => setSelectedLead(null)}>
              Change
            </button>
          </div>
          <textarea className={styles.textarea} placeholder="Note for whoever drafts this (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <button type="button" className={styles.submitBtn} disabled={create.isPending} onClick={submit}>
            {create.isPending ? 'Sending…' : 'Send request'}
          </button>
        </>
      )}
    </div>
  );
}

function RequestRow({ request, canFulfil }: { request: ContractRequest; canFulfil: boolean }) {
  const fulfil = useFulfilContractRequest();
  return (
    <div className={styles.row}>
      <span className={styles.avatar}>{initials(request.clientName)}</span>
      <div className={styles.rowMain}>
        <div className={styles.name}>{request.clientName}</div>
        <div className={styles.meta}>
          Requested by {request.requestedByName} · {request.createdAt.slice(0, 10)}
        </div>
        {request.note && <div className={styles.note}>{request.note}</div>}
      </div>
      {request.status === 'fulfilled' ? (
        <span className={styles.doneTag}>Fulfilled</span>
      ) : canFulfil ? (
        <button type="button" className={styles.fulfilBtn} disabled={fulfil.isPending} onClick={() => fulfil.mutate(request.id)}>
          {fulfil.isPending ? '…' : 'Mark fulfilled'}
        </button>
      ) : (
        <span className={styles.pendingTag}>Pending</span>
      )}
    </div>
  );
}
