"use client";

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useSessionStore } from '../../../auth/useSessionStore';
import { Icon } from '../../../shared/ui/Icon';
import { PipePill, PipePillStrip } from '../../../shared/ui/PipePill';
import { useStaffDirectory } from '../../memos/hooks/useMemos';
import type { SiteVisit } from '../../../types/domain';
import { useAllSiteVisits, useSiteVisits } from '../hooks/useSiteVisits';
import { useDownloadSiteVisitFormPdf } from '../hooks/useSiteVisitFormPdf';
import styles from './SiteVisitsScreen.module.css';

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

const DETAIL_FIELDS: { key: keyof SiteVisit; label: string }[] = [
  { key: 'purpose', label: 'Purpose' },
  { key: 'discussionSoFar', label: 'Discussion so far' },
  { key: 'keyUnderstanding', label: 'Key understanding' },
  { key: 'feedbackAfter', label: 'Feedback after visit' },
  { key: 'keyNextSteps', label: 'Key next steps' },
  { key: 'transport', label: 'Transport' },
  { key: 'pickup', label: 'Pickup point' },
  { key: 'placeOfWork', label: 'Place of work' },
  { key: 'position', label: 'Position' },
  { key: 'nationality', label: 'Nationality' },
  { key: 'accompanied', label: 'Accompanied by' },
  { key: 'source', label: 'Source' },
];

// Real production table (site_visits) is agent-scoped by RLS exactly like
// leads/payments for a plain agent -- listForAgent() already enforces it
// server-side. Management additionally gets a company-wide, per-staff
// "site visit records" view here (real ops.view_all/manager RLS already
// lets listAll() return every row -- same fact useWeekSiteVisits/Reports
// already rely on), same isMaster-style widening Master Pipeline got
// rather than a second bespoke screen.
export function SiteVisitsScreen() {
  const navigate = useNavigate();
  const profile = useSessionStore((s) => s.profile);
  const isManager = profile?.role === 'manager';
  const hasSveAccess = !!profile && (profile.role === 'manager' || profile.key === 'elias' || profile.key === 'emmanuel' || profile.key === 'elizabeth');
  const mine = useSiteVisits();
  const all = useAllSiteVisits();
  const { data: visits, isLoading } = isManager ? all : mine;
  const { data: staff } = useStaffDirectory();
  const downloadPdf = useDownloadSiteVisitFormPdf();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [staffFilter, setStaffFilter] = useState('');
  const [query, setQuery] = useState('');

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const byStaff = useMemo(() => (visits ?? []).filter((v) => !isManager || !staffFilter || v.agentKey === staffFilter), [visits, isManager, staffFilter]);
  const q = query.trim().toLowerCase();
  const filtered = q ? byStaff.filter((v) => v.name.toLowerCase().includes(q) || v.contact.includes(q)) : byStaff;

  const thisMonthKey = new Date().toISOString().slice(0, 7);
  const kpis = useMemo(() => {
    const list = byStaff;
    return {
      total: list.length,
      thisMonth: list.filter((v) => v.visitDate.slice(0, 7) === thisMonthKey).length,
      withFeedback: list.filter((v) => v.feedbackAfter).length,
      awaitingFeedback: list.filter((v) => !v.feedbackAfter && v.visitDate <= new Date().toISOString().slice(0, 10)).length,
    };
  }, [byStaff, thisMonthKey]);

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>{isManager ? 'Site visit records' : 'Site visits'}</h1>
          <p className={styles.sub}>
            {filtered.length} {isManager ? 'company-wide' : 'logged'}
          </p>
          {hasSveAccess && (
            <button type="button" className={styles.experienceLink} onClick={() => navigate('/dashboard/site-visits/experience')}>
              Experience feedback →
            </button>
          )}
        </div>
        <button type="button" className={styles.addBtn} onClick={() => navigate('/dashboard/site-visits/new')}>
          + Log visit
        </button>
      </div>

      {isManager && (
        <>
          <div className={styles.kpiWrap}>
            <PipePillStrip>
              <PipePill tone="blue" value={kpis.total} label="Total visits" />
              <PipePill tone="green" value={kpis.thisMonth} label="This month" />
              <PipePill tone="gold" value={kpis.withFeedback} label="Feedback logged" />
              <PipePill tone="orange" value={kpis.awaitingFeedback} label="Awaiting feedback" />
            </PipePillStrip>
          </div>
          <div className={styles.filterRow}>
            <input className={styles.search} placeholder="Search by client name or contact…" value={query} onChange={(e) => setQuery(e.target.value)} />
            <select className={styles.staffSelect} value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)}>
              <option value="">All staff</option>
              {(staff ?? [])
                .filter((s) => s.role === 'agent')
                .map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.name}
                  </option>
                ))}
            </select>
          </div>
        </>
      )}

      {isLoading && <p className={styles.emptyMsg}>Loading…</p>}
      {filtered.map((v) => {
        const isOpen = expanded.has(v.id);
        const details = DETAIL_FIELDS.filter((f) => v[f.key]);
        return (
          <div className={styles.card} key={v.id}>
            <button type="button" className={styles.row} onClick={() => toggle(v.id)} aria-expanded={isOpen}>
              <span className={styles.avatar}>{initials(v.name)}</span>
              <div className={styles.rowMain}>
                <div className={styles.name}>{v.name}</div>
                <div className={styles.meta}>
                  {v.contact} · {v.site}
                  {v.plot ? ` · ${v.plot}` : ''}
                  {isManager ? ` · ${v.agentName}` : ''}
                </div>
              </div>
              <div className={styles.right}>
                <div className={styles.date}>{v.visitDate}</div>
                {v.visitTime && <div className={styles.time}>{v.visitTime}</div>}
                <div className={styles.statusWrap}>
                  <span className={styles.status}>{v.status}</span>
                </div>
              </div>
              <span className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`}>
                <Icon name="chevronDown" size={15} />
              </span>
            </button>
            {isOpen && (
              <div className={styles.detail}>
                {details.map((f) => (
                  <div className={styles.detailRow} key={f.key}>
                    <span className={styles.detailLabel}>{f.label}</span>
                    <span className={styles.detailValue}>{v[f.key]}</span>
                  </div>
                ))}
                <button
                  type="button"
                  className={styles.pdfRowBtn}
                  disabled={downloadPdf.isPending}
                  onClick={(e) => {
                    e.stopPropagation();
                    downloadPdf.mutate(v);
                  }}
                >
                  {downloadPdf.isPending ? 'Preparing PDF…' : '⬇ Download request form (PDF)'}
                </button>
              </div>
            )}
          </div>
        );
      })}
      {!isLoading && filtered.length === 0 && <p className={styles.emptyMsg}>{byStaff.length === 0 ? 'No site visits logged yet.' : `No visits match "${query}".`}</p>}
    </div>
  );
}