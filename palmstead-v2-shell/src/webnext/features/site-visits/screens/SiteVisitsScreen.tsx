"use client";

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, ClipboardList, Download, MessageSquareText } from 'lucide-react';
import { requireSupabase } from '@/lib/supabase.client';
import { useSessionStore } from '../../../auth/useSessionStore';
import { Icon } from '../../../shared/ui/Icon';
import { PipePill, PipePillStrip } from '../../../shared/ui/PipePill';
import { PeriodFilterBar } from '../../../shared/ui/PeriodFilterBar';
import { inPeriodRange, usePeriodFilter } from '../../../shared/lib/periodFilter';
import { useStaffDirectory } from '../../memos/hooks/useMemos';
import type { SiteVisit } from '../../../types/domain';
import { useAllSiteVisits, useCancelSiteVisit } from '../hooks/useSiteVisits';
import { useDownloadSiteVisitFormPdf } from '../hooks/useSiteVisitFormPdf';
import { leadDestination } from '../lib/leadDestination';
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
// "site visit records" view here (real site_visits.view_all/Management RLS
// lets listAll() return every row -- same fact useWeekSiteVisits/Reports
// already rely on), same isMaster-style widening Master Pipeline got
// rather than a second bespoke screen.
export function SiteVisitsScreen() {
  const navigate = useNavigate();
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  const isManager = profile?.role === 'manager';
  // Real user ask (2026-09-11): "give all staff full access to the site
  // visit experience app" -- was manager + elias/emmanuel/elizabeth only,
  // same leftover-pilot scope SveManagementScreen's own gate had, opened
  // the same way (see that screen's comment for the matching RLS fix).
  const hasSveAccess = !!profile;
  const companyCreateAccess = useQuery({
    queryKey: ['siteVisitCompanyLeadCreate', profile?.key],
    enabled: !!profile?.key && !demoMode,
    queryFn: async () => {
      const db = requireSupabase();
      const [view, create] = await Promise.all([
        db.rpc('has_permission', { p_key: 'company_leads.view' }),
        db.rpc('has_permission', { p_key: 'company_leads.create' }),
      ]);
      if (view.error || create.error) throw view.error ?? create.error;
      return view.data === true && create.data === true;
    },
  });
  const canCreateCompanyLead = demoMode || isManager || companyCreateAccess.data === true;
  const all = useAllSiteVisits();
  const { data: visits, isLoading } = all;
  const linkedLeadIds = useMemo(() => [...new Set((visits ?? []).map((visit) => visit.leadId).filter((id): id is string => !!id))].sort(), [visits]);
  const leadOwners = useQuery({
    queryKey: ['site-visit-lead-owners', profile?.key, linkedLeadIds],
    enabled: !!profile?.key && !demoMode && linkedLeadIds.length > 0,
    queryFn: async () => {
      const owners: Record<string, string> = {};
      for (let index = 0; index < linkedLeadIds.length; index += 100) {
        const { data, error } = await requireSupabase().from('leads').select('id,agent_key').in('id', linkedLeadIds.slice(index, index + 100));
        if (error) throw error;
        for (const lead of data ?? []) if (lead.agent_key) owners[lead.id] = lead.agent_key;
      }
      return owners;
    },
  });
  const { data: staff } = useStaffDirectory();
  const downloadPdf = useDownloadSiteVisitFormPdf();
  const cancelVisit = useCancelSiteVisit();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [staffFilter, setStaffFilter] = useState('');
  const [query, setQuery] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('all');
  const [linkFilter, setLinkFilter] = useState('all');
  const [siteFilter, setSiteFilter] = useState('');
  const [queueFilter, setQueueFilter] = useState<'all' | 'upcoming' | 'attendance' | 'rescheduled'>('all');
  const period = usePeriodFilter();
  // Real user ask: "site visit... apps, we would be able to delete
  // logged data from our apps and it effects at the other ends of the
  // system in real time." Reuses the existing soft-cancel mutation
  // (Master Spec 9.4: never a hard delete) -- it just had no reachable
  // button anywhere in the app until now.
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteReason, setDeleteReason] = useState('');

  useEffect(() => {
    if (!profile?.key || demoMode) return;
    const db = requireSupabase();
    const channel = db.channel(`site-visits-list-${profile.key}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'site_visits' }, () => {
        void queryClient.invalidateQueries({ queryKey: ['siteVisits'] });
      }).subscribe();
    return () => { void db.removeChannel(channel); };
  }, [profile?.key, demoMode, queryClient]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const byStaff = useMemo(() => (visits ?? []).filter((v) => !staffFilter || v.agentKey === staffFilter), [visits, staffFilter]);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const queueCounts = {
    upcoming: byStaff.filter((v) => !v.deletedAt && v.attended === null && v.visitDate >= today).length,
    attendance: byStaff.filter((v) => !v.deletedAt && v.attended === null && v.visitDate < today).length,
    rescheduled: byStaff.filter((v) => !v.deletedAt && !!v.rescheduledAt).length,
  };
  const sites = [...new Set(byStaff.map((v) => v.site.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const q = query.trim().toLowerCase();
  const searched = q ? byStaff.filter((v) => v.name.toLowerCase().includes(q) || v.contact.includes(q)) : byStaff;
  // Real user ask: "the tile list format of the data is not sustainable
  // in the long run... it should be in build in filters where only
  // recent (this month) data or history is shown on the current page."
  // A text search is assumed to mean "find this specific record" --
  // widens automatically past the period filter rather than making
  // someone switch to "All time" first just to find an old visit by name.
  const periodMatches = q || queueFilter !== 'all' ? searched : searched.filter((v) => inPeriodRange(v.visitDate, period.range));
  const filtered = periodMatches.filter((v) => {
    const outcome = v.deletedAt ? 'cancelled' : v.attended === true ? 'attended' : v.attended === false ? 'no-show' : 'unconfirmed';
    const matchesQueue = queueFilter === 'all' || (
      queueFilter === 'upcoming' ? !v.deletedAt && v.attended === null && v.visitDate >= today :
      queueFilter === 'attendance' ? !v.deletedAt && v.attended === null && v.visitDate < today :
      !v.deletedAt && !!v.rescheduledAt
    );
    return matchesQueue && (outcomeFilter === 'all' || outcomeFilter === outcome) &&
      (linkFilter === 'all' || (linkFilter === 'linked' ? !!v.leadId : !v.leadId)) &&
      (!siteFilter || v.site === siteFilter);
  });

  const thisMonthKey = new Date().toISOString().slice(0, 7);
  const kpis = useMemo(() => {
    const list = byStaff;
    return {
      total: list.length,
      thisMonth: list.filter((v) => v.visitDate.slice(0, 7) === thisMonthKey).length,
      attended: list.filter((v) => !v.deletedAt && v.attended === true).length,
      unconfirmed: list.filter((v) => !v.deletedAt && v.attended === null && v.visitDate < new Date().toISOString().slice(0, 10)).length,
    };
  }, [byStaff, thisMonthKey]);

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Site visit records</h1>
          <p className={styles.sub}>
            {filtered.length} company-wide
          </p>
        </div>
        <button type="button" className={styles.addBtn} onClick={() => navigate('/dashboard/site-visits/new')}>
          + Log visit
        </button>
      </div>

      <nav className={styles.quickActions} aria-label="Site visit analysis">
        {hasSveAccess && (
          <button type="button" className={styles.quickAction} onClick={() => navigate('/dashboard/site-visits/experience')}>
            <span className={styles.quickActionIcon}><MessageSquareText size={20} aria-hidden="true" /></span>
            <span className={styles.quickActionCopy}><strong>Experience feedback</strong><small>Client responses and site manager reviews</small></span>
            <ArrowUpRight size={18} className={styles.quickActionArrow} aria-hidden="true" />
          </button>
        )}
        <button type="button" className={styles.quickAction} onClick={() => navigate('/dashboard/site-visits/reports')}>
          <span className={styles.quickActionIcon}><ClipboardList size={20} aria-hidden="true" /></span>
          <span className={styles.quickActionCopy}><strong>Visit reports</strong><small>Attendance, trends and downloadable PDF</small></span>
          <ArrowUpRight size={18} className={styles.quickActionArrow} aria-hidden="true" />
        </button>
      </nav>

      {isManager && (
        <>
          <div className={styles.kpiWrap}>
            <PipePillStrip>
              <PipePill tone="blue" value={kpis.total} label="Visit records" />
              <PipePill tone="green" value={kpis.thisMonth} label="This month" />
              <PipePill tone="gold" value={kpis.attended} label="Attended" />
              <PipePill tone="orange" value={kpis.unconfirmed} label="Past attendance unconfirmed" />
            </PipePillStrip>
          </div>
        </>
      )}

      <section className={styles.queueSection} aria-label="Visit work queues">
        <div className={styles.queueHeading}>Work queues <span>Across all dates</span></div>
        <div className={styles.queueGrid}>
          {([
            ['all', 'All visits', byStaff.length],
            ['upcoming', 'Upcoming', queueCounts.upcoming],
            ['attendance', 'Confirm attendance', queueCounts.attendance],
            ['rescheduled', 'Rescheduled', queueCounts.rescheduled],
          ] as const).map(([key, label, count]) => (
            <button type="button" key={key} className={`${styles.queueButton} ${queueFilter === key ? styles.queueButtonActive : ''}`}
              aria-pressed={queueFilter === key} onClick={() => setQueueFilter(key)}>
              <span>{label}</span><strong>{count}</strong>
            </button>
          ))}
        </div>
      </section>

      <div className={styles.filterRow}>
        <input className={styles.search} aria-label="Search visits" placeholder="Search client name or contact…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className={styles.staffSelect} aria-label="Filter staff" value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)}>
          <option value="">All staff</option>
          {(staff ?? []).filter((s) => s.role === 'agent').map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
        </select>
        <select className={styles.staffSelect} aria-label="Filter visit outcome" value={outcomeFilter} onChange={(e) => setOutcomeFilter(e.target.value)}>
          <option value="all">All outcomes</option><option value="attended">Attended</option><option value="no-show">Did not attend</option><option value="unconfirmed">Unconfirmed</option><option value="cancelled">Cancelled</option>
        </select>
        <select className={styles.staffSelect} aria-label="Filter lead link" value={linkFilter} onChange={(e) => setLinkFilter(e.target.value)}>
          <option value="all">All lead links</option><option value="linked">Linked lead</option><option value="unlinked">Unlinked visit</option>
        </select>
        <select className={styles.staffSelect} aria-label="Filter site" value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)}>
          <option value="">All sites</option>{sites.map((site) => <option key={site} value={site}>{site}</option>)}
        </select>
        {(query || staffFilter || outcomeFilter !== 'all' || linkFilter !== 'all' || siteFilter || queueFilter !== 'all') && <button type="button" className={styles.clearBtn} onClick={() => { setQuery(''); setStaffFilter(''); setOutcomeFilter('all'); setLinkFilter('all'); setSiteFilter(''); setQueueFilter('all'); }}>Clear filters</button>}
      </div>

      {queueFilter === 'all' ? <PeriodFilterBar state={period} resultCount={filtered.length} totalCount={byStaff.length} /> :
        <p className={styles.queueContext}>Showing {queueFilter === 'attendance' ? 'visits needing attendance confirmation' : queueFilter === 'upcoming' ? 'upcoming visits' : 'rescheduled visits'} across all dates. Choose All visits to return to period filtering.</p>}

      {isLoading && <p className={styles.emptyMsg}>Loading…</p>}
      {filtered.map((v) => {
        const isOpen = expanded.has(v.id);
        const details = DETAIL_FIELDS.filter((f) => v[f.key]);
        const visibleLeadOwner = v.leadId ? leadOwners.data?.[v.leadId] : undefined;
        const leadRoute = v.leadId && (demoMode || visibleLeadOwner === profile?.key || visibleLeadOwner === 'company' || isManager)
          ? (demoMode ? `/dashboard/pipeline/${v.leadId}` : leadDestination(v.leadId, visibleLeadOwner))
          : null;
        return (
          <div className={styles.card} key={v.id}>
            <button type="button" className={styles.row} onClick={() => toggle(v.id)} aria-expanded={isOpen}>
              <span className={styles.avatar}>{initials(v.name)}</span>
              <div className={styles.rowMain}>
                <div className={styles.name}>{v.name}</div>
                <div className={styles.meta}>
                  {v.contact} · {v.site}
                  {v.plot ? ` · ${v.plot}` : ''}
                  {v.agentName ? ` · ${v.agentName}` : ''}
                </div>
              </div>
              <div className={styles.right}>
                <div className={styles.date}>{v.visitDate}</div>
                {v.visitTime && <div className={styles.time}>{v.visitTime}</div>}
                <div className={styles.statusWrap}>
                  <span className={styles.status}>{v.deletedAt ? 'Cancelled' : v.attended === true ? 'Attended' : v.attended === false ? 'Did not attend' : 'Unconfirmed'}</span>
                </div>
              </div>
              <span className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`}>
                <Icon name="chevronDown" size={15} />
              </span>
            </button>
            {isOpen && (
              <div className={styles.detail}>
                <button type="button" className={styles.pdfRowBtn} onClick={() => navigate(`/dashboard/site-visits/${v.id}`)}>Open full visit record →</button>
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
                  {downloadPdf.isPending ? 'Preparing PDF…' : (<span className="inline-flex items-center gap-1"><Download className="size-4" aria-hidden="true" /> Download request form (PDF)</span>)}
                </button>
                {leadRoute ? (
                  <button
                    type="button"
                    className={styles.pdfRowBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(leadRoute);
                    }}
                  >
                    View {leadOwners.data?.[v.leadId ?? ''] === 'company' ? 'Company Lead' : 'pipeline lead'} →
                  </button>
                ) : v.leadId ? (
                  <p className={styles.detailValue}>{leadOwners.isLoading ? 'Checking linked lead…' : 'Linked lead unavailable to this account. Open the visit record for its other details.'}</p>
                ) : (v.agentKey === profile?.key || isManager) ? (<>
                  <button
                    type="button"
                    className={styles.pdfRowBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate('/dashboard/pipeline/new', { state: { name: v.name, contact: v.contact, returnTo: '/dashboard/site-visits', siteVisitIdToLink: v.id } });
                    }}
                  >
                    Add to my pipeline
                  </button>
                  {canCreateCompanyLead && <button
                    type="button"
                    className={styles.pdfRowBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate('/dashboard/pipeline/new', { state: { name: v.name, contact: v.contact, returnTo: '/dashboard/site-visits', siteVisitIdToLink: v.id, agentKeyOverride: 'company' } });
                    }}
                  >
                    Add to Company Leads
                  </button>}
                </>) : <p className={styles.detailValue}>Only the booking staff member or Management can link this visit to a pipeline.</p>}
                {(isManager || v.agentKey === profile?.key) &&
                  (deletingId === v.id ? (
                    <div className={styles.deleteConfirm} onClick={(e) => e.stopPropagation()}>
                      <input
                        className={styles.search}
                        placeholder="Why is this being deleted?"
                        value={deleteReason}
                        onChange={(e) => setDeleteReason(e.target.value)}
                      />
                      <div className={styles.deleteConfirmActions}>
                        <button
                          type="button"
                          className={styles.pdfRowBtnDanger}
                          disabled={!deleteReason.trim() || cancelVisit.isPending}
                          onClick={() =>
                            cancelVisit.mutateAsync({ id: v.id, reason: deleteReason.trim() }).then(() => {
                              setDeletingId(null);
                              setDeleteReason('');
                            })
                          }
                        >
                          {cancelVisit.isPending ? 'Deleting…' : 'Confirm delete'}
                        </button>
                        <button
                          type="button"
                          className={styles.pdfRowBtn}
                          onClick={() => {
                            setDeletingId(null);
                            setDeleteReason('');
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className={styles.pdfRowBtnDanger}
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletingId(v.id);
                      }}
                    >
                      Delete this visit
                    </button>
                  ))}
              </div>
            )}
          </div>
        );
      })}
      {!isLoading && filtered.length === 0 && (
        <p className={styles.emptyMsg}>
          {byStaff.length === 0 ? 'No site visits logged yet.' : queueFilter !== 'all' ? 'No visits match this work queue and the selected filters.' : q ? `No visits match "${query}".` : `No visits match the selected filters for ${period.label}. Widen or clear the filters above.`}
        </p>
      )}
    </div>
  );
}
