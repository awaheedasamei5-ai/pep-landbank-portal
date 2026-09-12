"use client";

import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { Banner, BannerStatus } from '../../../types/domain';
import { BANNER_STATUS, BANNER_STATUS_ORDER } from '../lib/bannerLogic';
import { useBanners, useLeadBannerCounts } from '../hooks/useBanners';
import { useDownloadBannerReportPdf } from '../hooks/useBannerReportPdf';
import { BannerAddModal } from '../components/BannerAddModal';
import { BannerMapPanel } from '../components/BannerMapPanel';
import styles from './BannerTrackingScreen.module.css';

type BannerTab = 'dashboard' | 'list' | 'map' | 'reports';

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

// Real user ask (2026-09-11): "note that u havent copied(duplicate) the
// banner app from v1 and paste and merge into this version ... i asked
// u [to] copy (dupliacte) the SAME app in v1 production version and
// merge into this version exactly as it is dont change any detail."
// An earlier pass here ported only web-next's own reduced Dashboard+List
// version -- this rebuild is a literal port of v1's real, full app
// (index.html:18256-18632: viewBannerApp/paintBannerApp's 4 real tabs --
// Dashboard/Banners/Map & Routes/Reports), reading only from v1's real
// source (never written to) and web-next's already-ported pieces
// (useBanners.ts, image resize, PDF primitives) -- production itself was
// never touched, only read.
export function BannerTrackingScreen() {
  const navigate = useNavigate();
  const { data: banners, isLoading } = useBanners();
  const { data: leadCounts } = useLeadBannerCounts();
  const downloadPdf = useDownloadBannerReportPdf();
  const [tab, setTab] = useState<BannerTab>('dashboard');
  const [showAdd, setShowAdd] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<BannerStatus | ''>('');
  const [areaFilter, setAreaFilter] = useState('');

  const all = banners ?? [];
  const areas = Array.from(new Set(all.map((b) => b.area).filter(Boolean))).sort();
  const totalLeadsFromBanners = Object.values(leadCounts ?? {}).reduce((s, n) => s + n, 0);

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>Banner Tracking</h1>
      <p className={styles.sub}>Add, track, and route to every banner placement</p>

      <div className={styles.tabRow}>
        <button type="button" className={`${styles.tabBtn} ${tab === 'dashboard' ? styles.tabBtnOn : ''}`} onClick={() => setTab('dashboard')}>
          Dashboard
        </button>
        <button type="button" className={`${styles.tabBtn} ${tab === 'list' ? styles.tabBtnOn : ''}`} onClick={() => setTab('list')}>
          Banners
        </button>
        <button type="button" className={`${styles.tabBtn} ${tab === 'map' ? styles.tabBtnOn : ''}`} onClick={() => setTab('map')}>
          Map &amp; Routes
        </button>
        <button type="button" className={`${styles.tabBtn} ${tab === 'reports' ? styles.tabBtnOn : ''}`} onClick={() => setTab('reports')}>
          Reports
        </button>
      </div>

      {isLoading && <p className={styles.emptyMsg}>Loading…</p>}

      {tab === 'dashboard' && !isLoading && (
        <DashboardTab all={all} totalLeadsFromBanners={totalLeadsFromBanners} onAdd={() => setShowAdd(true)} onOpen={(id) => navigate(`/dashboard/banners/${id}`)} />
      )}

      {tab === 'list' && !isLoading && (
        <ListTab
          all={all}
          leadCounts={leadCounts ?? {}}
          areas={areas}
          query={query}
          setQuery={setQuery}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          areaFilter={areaFilter}
          setAreaFilter={setAreaFilter}
          onAdd={() => setShowAdd(true)}
          onOpen={(id) => navigate(`/dashboard/banners/${id}`)}
        />
      )}

      {tab === 'map' && !isLoading && <BannerMapPanel banners={all} />}

      {tab === 'reports' && !isLoading && <ReportsTab all={all} onDownload={() => downloadPdf.mutate(all)} downloading={downloadPdf.isPending} />}

      {showAdd && <BannerAddModal areas={areas} onDone={() => setShowAdd(false)} onClose={() => setShowAdd(false)} />}
    </div>
  );
}

function kpiCounts(all: Banner[]) {
  return {
    placed: all.filter((b) => b.status === 'placed').length,
    maint: all.filter((b) => b.status === 'needs_maintenance').length,
    replacing: all.filter((b) => b.status === 'being_replaced').length,
    newLoc: all.filter((b) => b.status === 'location_only').length,
  };
}

function BannerRow({ banner, leadCount, onOpen }: { banner: Banner; leadCount: number; onOpen: () => void }) {
  const st = BANNER_STATUS[banner.status] || BANNER_STATUS.placed;
  return (
    <button type="button" className={styles.row} onClick={onOpen} style={{ borderLeftColor: st.color }}>
      {banner.image ? (
        // eslint-disable-next-line @next/next/no-img-element -- a stored data URI / remote photo, not worth next/image's remote-loader config
        <img src={banner.image} alt="" className={styles.rowThumb} />
      ) : (
        <span className={styles.rowAvatar} style={{ background: `linear-gradient(135deg, ${st.color}, ${st.color}99)` }}>
          📍
        </span>
      )}
      <div className={styles.rowMain}>
        <div className={styles.rowName}>{banner.name}</div>
        <div className={styles.rowMeta}>
          {banner.area || '—'} · {(banner.updatedAt || banner.createdAt || '').slice(0, 16).replace('T', ' ')}
          {leadCount ? ` · ${leadCount} lead${leadCount === 1 ? '' : 's'}` : ''}
        </div>
      </div>
      <span className={styles.tag} style={{ background: st.bg, color: st.color }}>
        {st.label}
      </span>
    </button>
  );
}

function DashboardTab({ all, totalLeadsFromBanners, onAdd, onOpen }: { all: Banner[]; totalLeadsFromBanners: number; onAdd: () => void; onOpen: (id: string) => void }) {
  const c = kpiCounts(all);
  const areas = new Set(all.map((b) => b.area).filter(Boolean));
  const recent = all
    .slice()
    .sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''))
    .slice(0, 8);

  return (
    <>
      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <div className={styles.kpiVal}>{c.placed + c.maint}</div>
          <div className={styles.kpiLbl}>Total banners</div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiVal}>{c.placed}</div>
          <div className={styles.kpiLbl}>Perfect condition</div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiVal}>{c.maint}</div>
          <div className={styles.kpiLbl}>Needs maintenance</div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiVal}>{c.replacing}</div>
          <div className={styles.kpiLbl}>Being replaced</div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiVal}>{c.newLoc}</div>
          <div className={styles.kpiLbl}>New locations</div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiVal}>{areas.size}</div>
          <div className={styles.kpiLbl}>Total areas</div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiVal}>{totalLeadsFromBanners}</div>
          <div className={styles.kpiLbl}>Leads from banners</div>
        </div>
      </div>
      <button type="button" className={styles.addBtn} onClick={onAdd}>
        + Add banner / location
      </button>
      <div className={styles.sectitle}>
        Recent activity
        <span className={styles.cnt}>{recent.length}</span>
      </div>
      <div className={styles.list}>
        {recent.length === 0 && <p className={styles.emptyMsg}>Nothing logged yet. Add your first banner or scouted location.</p>}
        {recent.map((b) => (
          <BannerRow key={b.id} banner={b} leadCount={0} onOpen={() => onOpen(b.id)} />
        ))}
      </div>
    </>
  );
}

function ListTab({
  all,
  leadCounts,
  areas,
  query,
  setQuery,
  statusFilter,
  setStatusFilter,
  areaFilter,
  setAreaFilter,
  onAdd,
  onOpen,
}: {
  all: Banner[];
  leadCounts: Record<string, number>;
  areas: string[];
  query: string;
  setQuery: (v: string) => void;
  statusFilter: BannerStatus | '';
  setStatusFilter: (v: BannerStatus | '') => void;
  areaFilter: string;
  setAreaFilter: (v: string) => void;
  onAdd: () => void;
  onOpen: (id: string) => void;
}) {
  const q = query.trim().toLowerCase();
  const filtered = all
    .filter((b) => !areaFilter || b.area === areaFilter)
    .filter((b) => !statusFilter || b.status === statusFilter)
    .filter((b) => !q || b.name.toLowerCase().includes(q) || b.area.toLowerCase().includes(q))
    .sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''));

  const areaCounts: Record<string, number> = {};
  all.forEach((b) => {
    if (b.area) areaCounts[b.area] = (areaCounts[b.area] ?? 0) + 1;
  });

  return (
    <>
      <input className={styles.input} placeholder="Search by name or area…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ marginBottom: 10 }} />
      <div className={styles.chipRow}>
        <button type="button" className={`${styles.chip} ${statusFilter === '' ? styles.chipOn : ''}`} onClick={() => setStatusFilter('')}>
          All statuses
        </button>
        {BANNER_STATUS_ORDER.map((s) => (
          <button key={s} type="button" className={`${styles.chip} ${statusFilter === s ? styles.chipOn : ''}`} onClick={() => setStatusFilter(s)}>
            {BANNER_STATUS[s].label}
          </button>
        ))}
      </div>
      <div className={styles.chipRow}>
        <button type="button" className={`${styles.chip2} ${areaFilter === '' ? styles.chipOn : ''}`} onClick={() => setAreaFilter('')}>
          All areas ({all.length})
        </button>
        {areas.map((a) => {
          const leads = all.filter((b) => b.area === a).reduce((s, b) => s + (leadCounts[b.id] ?? 0), 0);
          return (
            <button key={a} type="button" className={`${styles.chip2} ${areaFilter === a ? styles.chipOn : ''}`} onClick={() => setAreaFilter(a)}>
              {a} ({areaCounts[a]}
              {leads ? ` · ${leads} leads` : ''})
            </button>
          );
        })}
      </div>
      <button type="button" className={styles.addBtn} onClick={onAdd}>
        + Add banner / location
      </button>
      {filtered.length === 0 && <p className={styles.emptyMsg}>Nothing here. Try a different filter, or add a new entry.</p>}
      <div className={styles.list}>
        {filtered.map((b) => (
          <BannerRow key={b.id} banner={b} leadCount={leadCounts[b.id] ?? 0} onOpen={() => onOpen(b.id)} />
        ))}
      </div>
    </>
  );
}

function ReportsTab({ all, onDownload, downloading }: { all: Banner[]; onDownload: () => void; downloading: boolean }) {
  const sorted = all.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return (
    <>
      <div className={styles.sectitle}>
        Activity report
        <span className={styles.cnt}>{sorted.length} total entries</span>
      </div>
      <button type="button" className={styles.addBtn} disabled={downloading} onClick={onDownload}>
        {downloading ? 'Preparing…' : '⬇ Download full report (PDF)'}
      </button>
      {sorted.length === 0 && <p className={styles.emptyMsg}>Nothing to report yet</p>}
      <div className={styles.list}>
        {sorted.map((b) => (
          <div key={b.id} className={styles.reportRow}>
            <div className={styles.rowName}>{b.name}</div>
            <div className={styles.rowMeta}>
              {b.area} · {(BANNER_STATUS[b.status] || BANNER_STATUS.placed).label} · added by {b.createdByName} on {(b.createdAt || '').slice(0, 16).replace('T', ' ')}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export { initials };
