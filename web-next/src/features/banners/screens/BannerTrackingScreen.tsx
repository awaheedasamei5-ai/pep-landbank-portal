import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { Banner, BannerStatus, NewBanner } from '../../../types/domain';
import { useBanners, useCreateBanner, useLeadBannerCounts, useUpdateBannerStatus } from '../hooks/useBanners';
import styles from './BannerTrackingScreen.module.css';

const STATUS_META: Record<BannerStatus, { label: string; className: string }> = {
  placed: { label: 'Perfect condition', className: 'stGood' },
  needs_maintenance: { label: 'Needs maintenance', className: 'stWarn' },
  location_only: { label: 'Scouted location', className: 'stInfo' },
  being_replaced: { label: 'Being replaced', className: 'stDanger' },
};

const STATUS_OPTIONS: BannerStatus[] = ['placed', 'needs_maintenance', 'location_only', 'being_replaced'];

// Dashboard + List only -- a real, honest first pass. Map & Routes
// (Leaflet-based) and Reports (filterable export view), plus the separate
// banner_status_log audit trail and photo/geolocation capture, are
// deliberately deferred: each is a substantial, separable piece of its
// own, same scoping discipline as this session's other gap fixes (e.g.
// Allocations' deferred Authorization/Allocation PDF generation).
export function BannerTrackingScreen() {
  const navigate = useNavigate();
  const { data: banners, isLoading } = useBanners();
  const { data: leadCounts } = useLeadBannerCounts();
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState<BannerStatus | ''>('');
  const [query, setQuery] = useState('');

  const all = banners ?? [];
  const counts: Record<BannerStatus, number> = { placed: 0, needs_maintenance: 0, location_only: 0, being_replaced: 0 };
  all.forEach((b) => counts[b.status]++);
  const areas = new Set(all.map((b) => b.area).filter(Boolean));
  const totalLeadsFromBanners = Object.values(leadCounts ?? {}).reduce((s, n) => s + n, 0);
  const trackedTotal = counts.placed + counts.needs_maintenance + counts.being_replaced;
  const healthPct = trackedTotal ? Math.round((counts.placed / trackedTotal) * 100) : 0;

  const q = query.trim().toLowerCase();
  const filtered = all
    .filter((b) => !statusFilter || b.status === statusFilter)
    .filter((b) => !q || b.name.toLowerCase().includes(q) || b.area.toLowerCase().includes(q))
    .sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt));

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.backBtn} onClick={() => navigate('/app/office')}>
        ← Back
      </button>
      <h1 className={styles.title}>Banner Tracking</h1>
      <p className={styles.sub}>Add, track, and route to every banner placement</p>

      <div className={styles.healthCard}>
        <div className={styles.healthTop}>
          <div>
            <div className={styles.healthLabel}>Fleet health</div>
            <div className={styles.healthPct}>{healthPct}%</div>
          </div>
          <div className={styles.healthMeta}>
            {counts.placed} of {trackedTotal} in perfect condition
          </div>
        </div>
        <div className={styles.healthTrack}>
          <div className={styles.healthFill} style={{ width: `${healthPct}%` }} />
        </div>
      </div>

      <div className={styles.statGrid}>
        <div className={styles.statCard}>
          <div className={styles.statVal}>{all.length}</div>
          <div className={styles.statLbl}>Total banners</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statVal}>{counts.needs_maintenance}</div>
          <div className={styles.statLbl}>Needs maintenance</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statVal}>{areas.size}</div>
          <div className={styles.statLbl}>Areas</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statVal}>{totalLeadsFromBanners}</div>
          <div className={styles.statLbl}>Leads from banners</div>
        </div>
      </div>

      <div className={styles.addRow}>
        <button type="button" className={styles.addBtn} onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancel' : '+ Add banner / location'}
        </button>
      </div>

      {showForm && <AddBannerForm onDone={() => setShowForm(false)} />}

      <input className={styles.input} placeholder="Search by name or area…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ marginBottom: 10 }} />
      <div className={styles.chipRow}>
        <button type="button" className={`${styles.chip} ${statusFilter === '' ? styles.chipOn : ''}`} onClick={() => setStatusFilter('')}>
          All statuses
        </button>
        {STATUS_OPTIONS.map((s) => (
          <button key={s} type="button" className={`${styles.chip} ${statusFilter === s ? styles.chipOn : ''}`} onClick={() => setStatusFilter(s)}>
            {STATUS_META[s].label}
          </button>
        ))}
      </div>

      {isLoading && <p className={styles.emptyMsg}>Loading…</p>}
      {!isLoading && filtered.length === 0 && <p className={styles.emptyMsg}>Nothing here. Try a different filter, or add a new entry.</p>}
      <div className={styles.list}>
        {filtered.map((b) => (
          <BannerRow key={b.id} banner={b} leadCount={leadCounts?.[b.id] ?? 0} />
        ))}
      </div>
    </div>
  );
}

function AddBannerForm({ onDone }: { onDone: () => void }) {
  const create = useCreateBanner();
  const [name, setName] = useState('');
  const [area, setArea] = useState('');
  const [status, setStatus] = useState<BannerStatus>('placed');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) {
      setError('Add a name');
      return;
    }
    if (!area.trim()) {
      setError('Add an area');
      return;
    }
    setError(null);
    const input: NewBanner = { name: name.trim(), area: area.trim(), status, notes: notes.trim() || undefined };
    try {
      await create.mutateAsync(input);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    }
  }

  return (
    <div className={styles.formCard}>
      <input className={styles.input} placeholder="Name, e.g. Spintex Road – near GOIL" value={name} onChange={(e) => setName(e.target.value)} />
      <input className={styles.input} placeholder="Area, e.g. Spintex" value={area} onChange={(e) => setArea(e.target.value)} style={{ marginTop: 8 }} />
      <select className={styles.input} value={status} onChange={(e) => setStatus(e.target.value as BannerStatus)} style={{ marginTop: 8 }}>
        {STATUS_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {STATUS_META[s].label}
          </option>
        ))}
      </select>
      <textarea className={styles.input} placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} style={{ marginTop: 8, minHeight: 60 }} />
      {error && <p className={styles.errorMsg}>{error}</p>}
      <button type="button" className={styles.submitBtn} disabled={create.isPending} onClick={submit}>
        {create.isPending ? 'Saving…' : 'Add entry'}
      </button>
    </div>
  );
}

function BannerRow({ banner, leadCount }: { banner: Banner; leadCount: number }) {
  const updateStatus = useUpdateBannerStatus();
  const [open, setOpen] = useState(false);
  const meta = STATUS_META[banner.status];

  return (
    <div className={styles.row}>
      <button type="button" className={styles.rowTop} onClick={() => setOpen((v) => !v)}>
        <span className={`${styles.rail} ${styles[meta.className]}`} />
        <div className={styles.rowMain}>
          <div className={styles.rowName}>{banner.name}</div>
          <div className={styles.rowMeta}>
            {banner.area || '—'} · {(banner.updatedAt || banner.createdAt).slice(0, 10)}
            {leadCount > 0 ? ` · ${leadCount} lead${leadCount === 1 ? '' : 's'}` : ''}
          </div>
        </div>
        <span className={`${styles.tag} ${styles[meta.className]}`}>{meta.label}</span>
      </button>
      {open && (
        <div className={styles.detail}>
          {banner.notes && <p className={styles.helpText}>{banner.notes}</p>}
          <div className={styles.statusRow}>
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s}
                type="button"
                className={`${styles.statusBtn} ${banner.status === s ? styles.statusBtnOn : ''}`}
                disabled={updateStatus.isPending || banner.status === s}
                onClick={() => updateStatus.mutate({ id: banner.id, status: s })}
              >
                {STATUS_META[s].label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
