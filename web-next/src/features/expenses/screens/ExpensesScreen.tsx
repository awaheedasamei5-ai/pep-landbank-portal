import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ghs, today } from '../../../shared/lib/format';
import type { FundRequest, FundRequestType, NewFundRequest } from '../../../types/domain';
import { useCanManageExpenses, useCreateFundRequest, useDecideFundRequest, useFundRequests } from '../hooks/useFundRequests';
import { friendlyError } from '../../../shared/lib/friendlyError';
import styles from './ExpensesScreen.module.css';

type Tab = 'requests' | 'approvals';

function typeLabel(type: FundRequestType): string {
  return type === 'budget' ? 'General budget' : 'Specific spend';
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Real table `fund_requests` -- the request/approval half of Office Desk's
// Expenses feature. See the FundRequest type's comment in types/domain.ts
// for exactly why Log Expense/Daily Balance/Categories/Recurring/Dashboard
// are deliberately out of scope for this pass (they're live-only in the
// real app, and web-next has no live-mode sign-in wired yet -- a real,
// separate, already-documented gap that would make them unverifiable
// through the app's own UI right now).
export function ExpensesScreen() {
  const navigate = useNavigate();
  const canManage = useCanManageExpenses();
  const { data: requests, isLoading } = useFundRequests();
  const [tab, setTab] = useState<Tab>('requests');

  if (!canManage) {
    return (
      <div className={styles.wrap}>
        <button type="button" className={styles.backBtn} onClick={() => navigate('/app/office')}>
          ← Back
        </button>
        <h1 className={styles.title}>Expenses</h1>
        <p className={styles.sub}>Elias/Management only. Ask a manager if you need this.</p>
      </div>
    );
  }

  const all = requests ?? [];
  const pending = all.filter((f) => f.status === 'pending');
  const thisMonth = today().slice(0, 7);
  const approvedThisMonth = all.filter((f) => f.status === 'approved' && (f.decidedAt ?? '').slice(0, 7) === thisMonth).reduce((s, f) => s + f.amount, 0);

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.backBtn} onClick={() => navigate('/app/office')}>
        ← Back
      </button>
      <h1 className={styles.title}>Expenses</h1>
      <p className={styles.sub}>Request funds, and track approvals.</p>

      <div className={styles.statRow}>
        <div className={styles.statPill}>
          <div className={styles.statVal}>{ghs(approvedThisMonth)}</div>
          <div className={styles.statLbl}>Approved this month</div>
        </div>
        <div className={styles.statPill}>
          <div className={styles.statVal}>{pending.length}</div>
          <div className={styles.statLbl}>Pending</div>
        </div>
      </div>

      <div className={styles.tabRow}>
        <button type="button" className={`${styles.tab} ${tab === 'requests' ? styles.tabOn : ''}`} onClick={() => setTab('requests')}>
          Fund Requests
        </button>
        <button type="button" className={`${styles.tab} ${tab === 'approvals' ? styles.tabOn : ''}`} onClick={() => setTab('approvals')}>
          Approvals{pending.length ? ` (${pending.length})` : ''}
        </button>
      </div>

      {isLoading && <p className={styles.emptyMsg}>Loading…</p>}

      {tab === 'requests' && <RequestsTab requests={all} />}
      {tab === 'approvals' && <ApprovalsTab requests={pending} />}
    </div>
  );
}

function RequestsTab({ requests }: { requests: FundRequest[] }) {
  const create = useCreateFundRequest();
  const [type, setType] = useState<FundRequestType>('budget');
  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const n = Number(amount);
    if (!n || n <= 0) {
      setError('Enter an amount');
      return;
    }
    if (!purpose.trim()) {
      setError('Add a purpose');
      return;
    }
    setError(null);
    const input: NewFundRequest = { type, amount: n, purpose: purpose.trim() };
    if (file) {
      input.receiptData = await fileToDataUrl(file);
      input.receiptName = file.name;
    }
    try {
      await create.mutateAsync(input);
      setAmount('');
      setPurpose('');
      setFile(null);
    } catch (e) {
      setError(friendlyError(e, 'Failed to send request'));
    }
  }

  return (
    <>
      <div className={styles.formCard}>
        <div className={styles.sectitle}>Request funds</div>
        <label className={styles.label}>Type</label>
        <select className={styles.input} value={type} onChange={(e) => setType(e.target.value as FundRequestType)}>
          <option value="budget">General budget</option>
          <option value="specific">Specific / untagged spending</option>
        </select>
        <label className={styles.label}>Amount (GHS)</label>
        <input className={styles.input} type="number" min="0" step="0.01" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <label className={styles.label}>Purpose</label>
        <textarea className={styles.input} placeholder="What is this for?" value={purpose} onChange={(e) => setPurpose(e.target.value)} style={{ minHeight: 60 }} />
        <label className={styles.label}>Supporting document (optional)</label>
        <input className={styles.fileInput} type="file" accept="image/*,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        {file && <div className={styles.fileHint}>{file.name}</div>}
        {error && <p className={styles.errorMsg}>{error}</p>}
        <button type="button" className={styles.submitBtn} disabled={create.isPending} onClick={submit}>
          {create.isPending ? 'Sending…' : 'Send request'}
        </button>
      </div>

      <div className={styles.sectitle}>Recent requests</div>
      {requests.length === 0 && <p className={styles.emptyMsg}>No fund requests yet. Use the form above to request a budget or a specific spend.</p>}
      <div className={styles.list}>
        {requests.map((f) => (
          <div className={styles.row} key={f.id}>
            <div className={styles.rowTop}>
              <div>
                <div className={styles.name}>
                  {typeLabel(f.type)} · {ghs(f.amount)}
                </div>
                <div className={styles.meta}>
                  {f.createdAt.slice(0, 10)}
                  {f.requestedByName ? ` · by ${f.requestedByName}` : ''}
                </div>
              </div>
              <StatusTag status={f.status} />
            </div>
            <div className={styles.note}>{f.purpose}</div>
            {f.receiptData && (
              <a href={f.receiptData} target="_blank" rel="noreferrer" className={styles.receiptLink}>
                📎 {f.receiptName || 'View document'}
              </a>
            )}
            {f.decisionNote && <div className={styles.decisionNote}>Note: {f.decisionNote}</div>}
          </div>
        ))}
      </div>
    </>
  );
}

function ApprovalsTab({ requests }: { requests: FundRequest[] }) {
  return (
    <>
      <div className={styles.sectitle}>Pending fund requests</div>
      {requests.length === 0 && <p className={styles.emptyMsg}>Nothing pending.</p>}
      <div className={styles.list}>
        {requests.map((f) => (
          <ApprovalRow key={f.id} request={f} />
        ))}
      </div>
    </>
  );
}

function ApprovalRow({ request }: { request: FundRequest }) {
  const decide = useDecideFundRequest();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');

  return (
    <div className={styles.row}>
      <div className={styles.rowTop}>
        <div>
          <div className={styles.name}>
            {typeLabel(request.type)} · {ghs(request.amount)}
          </div>
          <div className={styles.meta}>by {request.requestedByName}</div>
        </div>
      </div>
      <div className={styles.note}>{request.purpose}</div>
      {request.receiptData && (
        <a href={request.receiptData} target="_blank" rel="noreferrer" className={styles.receiptLink}>
          📎 {request.receiptName || 'View document'}
        </a>
      )}
      {rejecting ? (
        <>
          <input className={styles.input} placeholder="Reason (optional)" value={note} onChange={(e) => setNote(e.target.value)} style={{ marginTop: 8 }} />
          <div className={styles.actionsRow}>
            <button type="button" className={styles.dangerBtn} disabled={decide.isPending} onClick={() => decide.mutate({ id: request.id, approve: false, note: note || undefined })}>
              {decide.isPending ? 'Rejecting…' : 'Confirm reject'}
            </button>
            <button type="button" className={styles.cancelBtn} onClick={() => setRejecting(false)}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <div className={styles.actionsRow}>
          <button type="button" className={styles.approveBtn} disabled={decide.isPending} onClick={() => decide.mutate({ id: request.id, approve: true })}>
            {decide.isPending ? 'Approving…' : 'Approve'}
          </button>
          <button type="button" className={styles.rejectBtn} onClick={() => setRejecting(true)}>
            Reject
          </button>
        </div>
      )}
    </div>
  );
}

function StatusTag({ status }: { status: FundRequest['status'] }) {
  const cls = status === 'approved' ? styles.tagOk : status === 'rejected' ? styles.tagDanger : styles.tagWarn;
  const label = status === 'approved' ? 'Approved' : status === 'rejected' ? 'Rejected' : 'Pending';
  return <span className={`${styles.tag} ${cls}`}>{label}</span>;
}
