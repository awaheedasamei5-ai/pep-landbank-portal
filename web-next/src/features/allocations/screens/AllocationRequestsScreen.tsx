import { Fragment, useState } from 'react';
import { ghs } from '../../../shared/lib/format';
import { useLeads } from '../../pipeline/hooks/useLeads';
import { useAllocationRequests, useAllocatePlot, useCanAllocatePlots, useCreateAllocationRequest } from '../hooks/useAllocationRequests';
import type { AllocationRequest, Lead } from '../../../types/domain';
import styles from './AllocationRequestsScreen.module.css';

// Real table `allocation_requests`, same manager/elias/emmanuel gate as
// Plot Inventory (confirmed live). The real trigger for one of these
// existing is server-side (approve_payment RPC creates one once a lead
// crosses ~30% paid) -- deliberately not replicated client-side, so this
// models a manual "request allocation for one of my leads" flow instead.
// suggested_plots, flagging, and the "Awaiting Authorization"
// intermediate stage are all out of scope -- just Pending -> Allocated.
export function AllocationRequestsScreen() {
  const { data: requests, isLoading } = useAllocationRequests();
  const canAllocate = useCanAllocatePlots();
  const [showForm, setShowForm] = useState(false);

  const sorted = [...(requests ?? [])].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'Pending' ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
  const firstAllocatedIndex = sorted.findIndex((r) => r.status === 'Allocated');

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Allocations</h1>
          <p className={styles.sub}>{requests?.length ?? 0} total</p>
        </div>
        <button type="button" className={styles.addBtn} onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancel' : '+ Request allocation'}
        </button>
      </div>

      {showForm && <NewRequestForm onDone={() => setShowForm(false)} />}

      {isLoading && <p style={{ color: 'var(--muted)' }}>Loading…</p>}
      {requests && requests.length === 0 && !isLoading && <p style={{ color: 'var(--muted)' }}>No allocation requests yet.</p>}

      <div className={styles.list}>
        {sorted.map((r, i) => (
          <Fragment key={r.id}>
            {i === 0 && r.status === 'Pending' && <div className={styles.sectitle}>Pending</div>}
            {i === firstAllocatedIndex && <div className={styles.sectitle}>Allocated</div>}
            <RequestRow request={r} canAllocate={canAllocate} />
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function NewRequestForm({ onDone }: { onDone: () => void }) {
  const { data: leads } = useLeads();
  const create = useCreateAllocationRequest();
  const [query, setQuery] = useState('');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  const q = query.trim().toLowerCase();
  const matches = q ? (leads ?? []).filter((l) => l.name.toLowerCase().includes(q) || l.contact.includes(q)).slice(0, 8) : [];

  async function submit() {
    if (!selectedLead) return;
    await create.mutateAsync({ leadId: selectedLead.id });
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
                    {l.contact} &middot; {ghs(l.amtPaid)} of {ghs(l.grandTotal)} paid
                  </div>
                </button>
              ))}
            </div>
          )}
          {q && matches.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 12.5, marginTop: 10 }}>No clients match &quot;{query}&quot;.</p>}
        </>
      ) : (
        <>
          <div className={styles.selectedLead}>
            <div className={styles.pickerName}>{selectedLead.name}</div>
            <button type="button" className={styles.changeBtn} onClick={() => setSelectedLead(null)}>
              Change
            </button>
          </div>
          <button type="button" className={styles.submitBtn} disabled={create.isPending} onClick={submit}>
            {create.isPending ? 'Sending…' : 'Send request'}
          </button>
        </>
      )}
    </div>
  );
}

function RequestRow({ request, canAllocate }: { request: AllocationRequest; canAllocate: boolean }) {
  const allocate = useAllocatePlot();
  const [allocating, setAllocating] = useState(false);
  const [plotNumber, setPlotNumber] = useState('');
  const [note, setNote] = useState('');

  return (
    <div className={styles.row}>
      <div className={styles.rowTop}>
        <div>
          <div className={styles.name}>{request.clientName}</div>
          <div className={styles.meta}>
            {request.agentName} &middot; {request.percentPaid ?? 0}% paid ({ghs(request.amtPaid ?? 0)} of {ghs(request.grandTotal ?? 0)})
          </div>
        </div>
        {request.status === 'Allocated' ? (
          <span className={styles.doneTag}>Plot {request.plotNumber}</span>
        ) : (
          <span className={styles.pendingTag}>Pending</span>
        )}
      </div>
      {request.status === 'Allocated' && request.note && <div className={styles.note}>{request.note}</div>}

      {request.status === 'Pending' && canAllocate && (
        <>
          {allocating ? (
            <div className={styles.allocatePanel}>
              <input className={styles.input} placeholder="Plot number (e.g. A-14)" value={plotNumber} onChange={(e) => setPlotNumber(e.target.value)} />
              <input className={styles.input} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
              <div className={styles.allocateActions}>
                <button
                  type="button"
                  className={styles.confirmBtn}
                  disabled={!plotNumber.trim() || allocate.isPending}
                  onClick={() => allocate.mutate({ id: request.id, plotNumber: plotNumber.trim(), note: note || undefined }, { onSuccess: () => setAllocating(false) })}
                >
                  {allocate.isPending ? 'Saving…' : 'Confirm allocation'}
                </button>
                <button type="button" className={styles.cancelBtn} onClick={() => setAllocating(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className={styles.allocateBtn} onClick={() => setAllocating(true)}>
              Allocate a plot →
            </button>
          )}
        </>
      )}
    </div>
  );
}
