"use client";

import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { Banner, BannerStatus } from '../../../types/domain';
import { BANNER_STATUS, BANNER_STATUS_ORDER, last6MonthKeys, monthShortLabel, REPORT_PERIODS, reportPeriodRange, type ReportPeriod } from '../lib/bannerLogic';
import { useBanners, useLeadBannerCounts } from '../hooks/useBanners';
import { useDownloadBannerReportPdf } from '../hooks/useBannerReportPdf';
import { BannerAddModal } from '../components/BannerAddModal';
import { BannerMapPanel } from '../components/BannerMapPanel';
import { DonutRing, LineChart } from '../components/BannerCharts';
import styles from './BannerTrackingScreen.module.css';

// Small inline icon set matching the real app's kpiIc (check/alert/flag/pin/trophy).
const KpiIcon = {
  check: (
    <svg viewBox="0 0 24 24" fill="none" width={16} height={16}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={1.8} />
      <path d="M8 12.5l2.5 2.5L16 9.5" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  alert: (
    <svg viewBox="0 0 24 24" fill="none" width={16} height={16}>
      <path d="M12 9v4m0 4h.01M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  flag: (
    <svg viewBox="0 0 24 24" fill="none" width={16} height={16}>
      <path d="M5 21V4m0 1h12l-3 4 3 4H5" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  pin: (
    <svg viewBox="0 0 24 24" fill="none" width={16} height={16}>
      <path d="M12 21s-7-5.3-7-11a7 7 0 0114 0c0 5.7-7 11-7 11z" stroke="currentColor" strokeWidth={1.8} />
      <circle cx="12" cy="10" r="2.4" stroke="currentColor" strokeWidth={1.8} />
    </svg>
  ),
  trophy: (
    <svg viewBox="0 0 24 24" fill="none" width={16} height={16}>
      <path d="M8 4h8v4a4 4 0 01-8 0V4z" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" />
      <path d="M8 5H5a3 3 0 003 3M16 5h3a3 3 0 01-3 3" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
      <path d="M9 19h6M12 15v4" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
    </svg>
  ),
};

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

      {tab === 'reports' && !isLoading && <ReportsTab all={all} onDownload={(filtered) => downloadPdf.mutate(filtered)} downloading={downloadPdf.isPending} />}

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

// Exact port of the real bannerDashboardHtml() -- a "Banner Health" hero
// panel (donut gauge + areas/leads sub-stats), a 6-card KPI grid with
// icons, and a dark trend panel (6-month placements line chart + 3
// status "offer cards"), above the same Recent-activity list this
// screen already had. Every number here is real (BANNER_STATUS counts,
// leadCounts, createdAt dates) -- no invented figures.
function DashboardTab({ all, totalLeadsFromBanners, onAdd, onOpen }: { all: Banner[]; totalLeadsFromBanners: number; onAdd: () => void; onOpen: (id: string) => void }) {
  const c = kpiCounts(all);
  const areas = new Set(all.map((b) => b.area).filter(Boolean));
  const trackedTotal = c.placed + c.maint + c.replacing;
  const healthPct = trackedTotal ? Math.round((c.placed / trackedTotal) * 100) : 0;
  const months = last6MonthKeys();
  const monthVals = months.map((mk) => all.filter((b) => (b.createdAt || '').slice(0, 7) === mk).length);
  const monthLbls = months.map(monthShortLabel);
  const recent = all
    .slice()
    .sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''))
    .slice(0, 8);

  return (
    <>
      <div className={styles.healthPanel}>
        <div className={styles.healthTop}>
          <div>
            <div className={styles.healthTitle}>Banner Health</div>
            <div className={styles.healthBig}>{healthPct}%</div>
            <div className={styles.healthCaption}>
              {c.placed} of {trackedTotal} placed banner{trackedTotal === 1 ? '' : 's'} in perfect condition
            </div>
          </div>
          <div className={styles.healthRingWrap}>
            <DonutRing pct={healthPct} />
            <div className={styles.healthRingLabel}>{healthPct}%</div>
          </div>
        </div>
        <div className={styles.healthStats}>
          <div className={styles.healthStat}>
            <div className={styles.healthStatVal}>{areas.size}</div>
            <div className={styles.healthStatLbl}>Areas covered</div>
          </div>
          <div className={styles.healthStat}>
            <div className={styles.healthStatVal}>{totalLeadsFromBanners}</div>
            <div className={styles.healthStatLbl}>Leads generated</div>
          </div>
        </div>
      </div>

      <div className={styles.statGrid2}>
        <StatCard icon={KpiIcon.check} color="#65A30D" bg="#ECFCCB" value={c.placed} label="Perfect condition" />
        <StatCard icon={KpiIcon.alert} color="#7C3AED" bg="#EDE9FE" value={c.maint} label="Needs maintenance" />
        <StatCard icon={KpiIcon.flag} color="#DC2626" bg="#FEE2E2" value={c.replacing} label="Being replaced" />
        <StatCard icon={KpiIcon.pin} color="#2563EB" bg="#DBEAFE" value={c.newLoc} label="New locations" />
        <StatCard icon={KpiIcon.pin} color="#2563EB" bg="#DBEAFE" value={areas.size} label="Total areas" />
        <StatCard icon={KpiIcon.trophy} color="#65A30D" bg="#ECFCCB" value={totalLeadsFromBanners} label="Leads from banners" />
      </div>

      <div className={styles.darkPanel}>
        <div className={styles.darkPanelHead}>
          <div>
            <div className={styles.darkPanelTitle}>Placements over time</div>
            <div className={styles.darkPanelSub}>Last 6 months</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className={styles.darkPanelTitle}>By status</div>
            <div className={styles.darkPanelSub}>{trackedTotal} tracked</div>
          </div>
        </div>
        <LineChart values={monthVals} labels={monthLbls} />
        <div className={styles.offerCards}>
          <div className={`${styles.offerCard} ${styles.offerLemon}`}>
            <div>
              <div className={styles.offerName}>Perfect condition</div>
              <div className={styles.offerVal}>{c.placed}</div>
            </div>
            {KpiIcon.check}
          </div>
          <div className={`${styles.offerCard} ${styles.offerBlue}`}>
            <div>
              <div className={styles.offerName}>Scouted locations</div>
              <div className={styles.offerVal}>{c.newLoc}</div>
            </div>
            {KpiIcon.pin}
          </div>
          <div className={`${styles.offerCard} ${styles.offerRed}`}>
            <div>
              <div className={styles.offerName}>Being replaced</div>
              <div className={styles.offerVal}>{c.replacing}</div>
            </div>
            {KpiIcon.flag}
          </div>
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

function StatCard({ icon, color, bg, value, label }: { icon: React.ReactNode; color: string; bg: string; value: number; label: string }) {
  return (
    <div className={styles.statCard2}>
      <span className={styles.statCard2Icon} style={{ background: bg, color }}>
        {icon}
      </span>
      <div className={styles.statCard2Val}>{value}</div>
      <div className={styles.statCard2Lbl}>{label}</div>
    </div>
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

// Exact port of the real bannerReportsHtml() -- period chips (All time/
// This week/This month/Last month/This year/Last year/Custom range)
// alongside the existing area/status filters, all combinable, driving
// both the on-screen list and the PDF export.
function ReportsTab({ all, onDownload, downloading }: { all: Banner[]; onDownload: (filtered: Banner[]) => void; downloading: boolean }) {
  const [period, setPeriod] = useState<ReportPeriod>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [area, setArea] = useState('');
  const [status, setStatus] = useState<BannerStatus | ''>('');
  const areas = Array.from(new Set(all.map((b) => b.area).filter(Boolean))).sort();

  const range = reportPeriodRange(period, customFrom, customTo);
  const filtered = all
    .filter((b) => !area || b.area === area)
    .filter((b) => !status || b.status === status)
    .filter((b) => {
      if (!range) return true;
      const d = (b.createdAt || '').slice(0, 10);
      return !!d && d >= range.from && d <= range.to;
    })
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  return (
    <>
      <div className={styles.sectitle} style={{ marginTop: 0 }}>
        Filters
      </div>
      <div className={styles.filterCard}>
        <div className={styles.chipRow}>
          {REPORT_PERIODS.map((p) => (
            <button key={p.key} type="button" className={`${styles.chip} ${period === p.key ? styles.chipOn : ''}`} onClick={() => setPeriod(p.key)}>
              {p.label}
            </button>
          ))}
        </div>
        {period === 'custom' && (
          <div className={styles.grid2} style={{ marginTop: 10 }}>
            <input className={styles.input} type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            <input className={styles.input} type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          </div>
        )}
        <div className={styles.grid2} style={{ marginTop: 10 }}>
          <select className={styles.input} value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">All areas</option>
            {areas.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <select className={styles.input} value={status} onChange={(e) => setStatus(e.target.value as BannerStatus | '')}>
            <option value="">All statuses</option>
            {BANNER_STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {BANNER_STATUS[s].label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles.sectitle}>
        Activity report
        <span className={styles.cnt}>
          {filtered.length} of {all.length} banner{all.length === 1 ? '' : 's'}
        </span>
      </div>
      <button type="button" className={styles.addBtn} disabled={downloading} onClick={() => onDownload(filtered)}>
        {downloading ? 'Preparing…' : '⬇ Download full report (PDF)'}
      </button>
      {filtered.length === 0 && <p className={styles.emptyMsg}>Nothing matches these filters</p>}
      <div className={styles.list}>
        {filtered.map((b) => (
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
