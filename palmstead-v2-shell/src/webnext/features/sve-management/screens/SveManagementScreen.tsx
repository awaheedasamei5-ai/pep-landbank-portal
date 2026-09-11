"use client";

import { useMemo, useState } from 'react';
import { useSessionStore } from '../../../auth/useSessionStore';
import {
  useDeleteSveEntry,
  useDownloadSveDayReportPdf,
  useGenerateClientFeedback,
  usePolishManagerNarrative,
  useSaveSveDayReport,
  useSendSveDayReport,
  useSendSveInvite,
  useSveDayReport,
  useSveDayReportsList,
  useSveRealtime,
  useSveVisits,
} from '../hooks/useSveManagement';
import { friendlyError } from '../../../shared/lib/friendlyError';
import { reviewDigest, reviewIsAnswered } from '../lib/sveReviewDigest';
import { SVE_REVIEW_QUESTIONS } from '../../../types/domain';
import type { SveDayReportEntry } from '../../../types/domain';
import { PeriodFilterBar } from '../../../shared/ui/PeriodFilterBar';
import { inPeriodRange, usePeriodFilter } from '../../../shared/lib/periodFilter';
import styles from './SveManagementScreen.module.css';

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

function inviteLink(token: string): string {
  return `${window.location.origin}/visit-feedback/${token}`;
}

function fmtLongDate(iso: string): string {
  if (!iso) return iso;
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Staff-side companion to the public SveFeedbackScreen -- see the
// SveInviteRecord/SveVisitStatus comments in types/domain.ts. Gated the
// same way real RLS gates the underlying tables: manager + the
// 'elias'/'emmanuel'/'elizabeth' allowlist, matching Site Visits itself.
// "Send invite" really does send a real SMS to the client (useSendSveInvite
// -> ds.sms.send, the same real Arkesel-backed send-sms Edge Function
// every other SMS in this app goes through) -- the Copy link button next
// to it stays as a fallback for sharing via WhatsApp/in person instead.
//
// In demo mode, an invite created here is a local-only simulation (same
// as every other demo write this session) -- its link will correctly
// show "not valid" on the public SveFeedbackScreen, which always talks
// to the real Supabase project (it has no demo/session concept at all).
// This is the intended demo/live boundary, not a bug.
//
// Real user ask (2026-09-05): "the report isn't supposed to be for a
// single client after client but a full report after every site visit."
// Two tabs -- the feedback inbox (per-client invites/ratings, unchanged)
// and Day reports (new: one report per real site-visit day, covering
// every client who visited that day).
export function SveManagementScreen() {
  const profile = useSessionStore((s) => s.profile);
  // Real user ask (2026-09-11): "give all staff full access to the site
  // visit experience app." Was manager + elias/emmanuel/elizabeth only,
  // a leftover from when this was first built as a small pilot -- the
  // matching real RLS on all 4 SVE tables was opened the same way
  // (svei_staff_sel/upd/del, svesub_*, sve_day_reports_*, sve_report_
  // links_staff_sel), so this UI gate now matches what the database
  // actually allows.
  const hasAccess = !!profile;
  useSveRealtime();
  const { data: visits, isLoading } = useSveVisits();
  const sendInvite = useSendSveInvite();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [tab, setTab] = useState<'feedback' | 'reports'>('feedback');
  const [smsFailedId, setSmsFailedId] = useState<string | null>(null);
  const feedbackPeriod = usePeriodFilter();
  const filteredVisits = (visits ?? []).filter((v) => inPeriodRange(v.siteVisit.visitDate, feedbackPeriod.range));

  async function sendInviteFor(siteVisitId: string, clientName: string, clientContact: string) {
    setSmsFailedId((cur) => (cur === siteVisitId ? null : cur));
    const { smsSent } = await sendInvite.mutateAsync({ siteVisitId, clientName, clientContact });
    if (!smsSent) setSmsFailedId(siteVisitId);
  }

  if (!hasAccess) {
    return (
      <div className={styles.wrap}>
        <h1 className={styles.title}>Site Visit Experience</h1>
        <p className={styles.sub}>You don&apos;t have access to this. Ask a manager if you need it.</p>
      </div>
    );
  }

  async function copyLink(token: string, id: string) {
    try {
      await navigator.clipboard.writeText(inviteLink(token));
      setCopiedId(id);
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 2000);
    } catch {
      // Clipboard permission denied/unavailable -- the link is still
      // shown in the DOM, staff can select and copy it manually.
    }
  }

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>Site Visit Experience</h1>
      <p className={styles.sub}>Send a feedback link after a visit, review what clients said, and build the day's report</p>

      <div className={styles.tabRow}>
        <button type="button" className={`${styles.tabBtn} ${tab === 'feedback' ? styles.tabBtnOn : ''}`} onClick={() => setTab('feedback')}>
          Client feedback
        </button>
        <button type="button" className={`${styles.tabBtn} ${tab === 'reports' ? styles.tabBtnOn : ''}`} onClick={() => setTab('reports')}>
          Day reports
        </button>
      </div>

      {tab === 'feedback' && (
        <>
          <PeriodFilterBar state={feedbackPeriod} resultCount={filteredVisits.length} totalCount={visits?.length} />
          {isLoading && <p className={styles.emptyMsg}>Loading…</p>}
          {filteredVisits.map(({ siteVisit, invite, submission }) => {
            const isOpen = expanded === siteVisit.id;
            return (
              <div className={styles.card} key={siteVisit.id}>
                <div className={styles.row}>
                  <span className={styles.avatar}>{initials(siteVisit.name)}</span>
                  <div className={styles.rowMain}>
                    <div className={styles.name}>{siteVisit.name}</div>
                    <div className={styles.meta}>
                      {siteVisit.site}
                      {siteVisit.plot ? ` · ${siteVisit.plot}` : ''}
                    </div>
                    {!invite && (
                      <div>
                        <span className={`${styles.status} ${styles.statusNone}`}>No invite sent</span>
                      </div>
                    )}
                    {invite && !submission && (
                      <div>
                        <span className={`${styles.status} ${styles.statusPending}`}>Awaiting response</span>
                      </div>
                    )}
                    {invite && submission && (
                      <div>
                        <span className={`${styles.status} ${styles.statusDone}`}>Feedback received</span>
                      </div>
                    )}
                  </div>
                  <div className={styles.right}>
                    <div className={styles.date}>{siteVisit.visitDate}</div>
                    {!invite && (
                      <button
                        type="button"
                        className={styles.sendBtn}
                        disabled={sendInvite.isPending}
                        onClick={() => sendInviteFor(siteVisit.id, siteVisit.name, siteVisit.contact)}
                      >
                        {sendInvite.isPending ? 'Sending…' : 'Send invite'}
                      </button>
                    )}
                    {invite && !submission && (
                      <button type="button" className={styles.copyBtn} onClick={() => copyLink(invite.token, siteVisit.id)}>
                        {copiedId === siteVisit.id ? 'Copied!' : 'Copy link'}
                      </button>
                    )}
                    {submission && (
                      <button type="button" className={styles.viewBtn} onClick={() => setExpanded(isOpen ? null : siteVisit.id)}>
                        {isOpen ? 'Hide' : 'View feedback'}
                      </button>
                    )}
                  </div>
                </div>
                {smsFailedId === siteVisit.id && (
                  <div className={styles.smsWarning}>
                    The invite was created, but the SMS could not be sent to {siteVisit.contact || 'this number'} — use Copy link to share it another way (WhatsApp, in person).
                  </div>
                )}
                {isOpen && submission && (
                  <div className={styles.detail}>
                    <div className={styles.ratingRow}>
                      <div className={styles.ratingBox}>
                        <div className={styles.ratingVal}>{submission.overallRating ?? '—'}★</div>
                        <div className={styles.ratingLbl}>Overall</div>
                      </div>
                      <div className={styles.ratingBox}>
                        <div className={styles.ratingVal}>{submission.relationshipRating ?? '—'}★</div>
                        <div className={styles.ratingLbl}>Handling</div>
                      </div>
                      <div className={styles.ratingBox}>
                        <div className={styles.ratingVal}>{submission.npsScore ?? '—'}</div>
                        <div className={styles.ratingLbl}>NPS</div>
                      </div>
                    </div>
                    {submission.journeyRating && (
                      <div className={styles.detailRow}>
                        <span className={styles.detailLabel}>Journey</span>
                        <span className={styles.detailValue}>{submission.journeyRating}</span>
                      </div>
                    )}
                    {submission.siteDescriptionRating && (
                      <div className={styles.detailRow}>
                        <span className={styles.detailLabel}>Site match</span>
                        <span className={styles.detailValue}>{submission.siteDescriptionRating}</span>
                      </div>
                    )}
                    {submission.purchaseIntent && (
                      <div className={styles.detailRow}>
                        <span className={styles.detailLabel}>Purchase intent</span>
                        <span className={styles.detailValue}>{submission.purchaseIntent}</span>
                      </div>
                    )}
                    {submission.handlingFeedback && (
                      <div className={styles.detailRow}>
                        <span className={styles.detailLabel}>On the handling</span>
                        <span className={styles.detailValue}>{submission.handlingFeedback}</span>
                      </div>
                    )}
                    {submission.improvementSuggestions && (
                      <div className={styles.detailRow}>
                        <span className={styles.detailLabel}>Improvement ideas</span>
                        <span className={styles.detailValue}>{submission.improvementSuggestions}</span>
                      </div>
                    )}
                    {submission.additionalComments && (
                      <div className={styles.detailRow}>
                        <span className={styles.detailLabel}>Additional comments</span>
                        <span className={styles.detailValue}>{submission.additionalComments}</span>
                      </div>
                    )}
                    <p className={styles.reportHint}>Build this client into a full day report from the &quot;Day reports&quot; tab above.</p>
                  </div>
                )}
              </div>
            );
          })}
          {visits && visits.length === 0 && !isLoading && <p className={styles.emptyMsg}>No site visits logged yet.</p>}
          {visits && visits.length > 0 && filteredVisits.length === 0 && !isLoading && (
            <p className={styles.emptyMsg}>No site visits for {feedbackPeriod.label}. Widen the filter above to see older ones.</p>
          )}
        </>
      )}

      {tab === 'reports' && <DayReportsTab visits={visits ?? []} />}
    </div>
  );
}

function DayReportsTab({ visits }: { visits: NonNullable<ReturnType<typeof useSveVisits>['data']> }) {
  const { data: dayReports } = useSveDayReportsList();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const download = useDownloadSveDayReportPdf();
  const daysPeriod = usePeriodFilter();
  const sentPeriod = usePeriodFilter();

  const allDays = useMemo(() => {
    const map = new Map<string, number>();
    visits.forEach((v) => {
      if (v.siteVisit.deletedAt) return;
      map.set(v.siteVisit.visitDate, (map.get(v.siteVisit.visitDate) ?? 0) + 1);
    });
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [visits]);
  const days = useMemo(() => allDays.filter(([date]) => inPeriodRange(date, daysPeriod.range)), [allDays, daysPeriod.range]);

  const allSentReports = useMemo(() => (dayReports ?? []).filter((r) => r.status === 'sent'), [dayReports]);
  const sentReports = useMemo(() => allSentReports.filter((r) => inPeriodRange(r.visitDate, sentPeriod.range)), [allSentReports, sentPeriod.range]);

  if (selectedDate) return <DayReportEditor visitDate={selectedDate} onClose={() => setSelectedDate(null)} />;

  return (
    <>
      <p className={styles.sub}>Pick a day to build or review its Site Visit Experience report — one report covers every client visited that day.</p>
      <PeriodFilterBar state={daysPeriod} resultCount={days.length} totalCount={allDays.length} />
      {days.map(([date, count]) => {
        const existing = dayReports?.find((r) => r.visitDate === date);
        return (
          <div key={date} className={styles.card}>
            <div className={styles.row}>
              <div className={styles.rowMain}>
                <div className={styles.name}>{fmtLongDate(date)}</div>
                <div className={styles.meta}>
                  {count} client{count === 1 ? '' : 's'} visited
                </div>
                {existing && (
                  <span className={`${styles.status} ${existing.status === 'sent' ? styles.statusDone : styles.statusPending}`}>
                    {existing.status === 'sent' ? 'Report sent' : 'Draft in progress'}
                  </span>
                )}
              </div>
              <div className={styles.right}>
                <button type="button" className={styles.viewBtn} onClick={() => setSelectedDate(date)}>
                  {existing ? 'Open' : 'Build report'}
                </button>
              </div>
            </div>
          </div>
        );
      })}
      {allDays.length === 0 && <p className={styles.emptyMsg}>No site visits logged yet.</p>}
      {allDays.length > 0 && days.length === 0 && <p className={styles.emptyMsg}>No site visits for {daysPeriod.label}. Widen the filter above to see older ones.</p>}

      <div className={styles.reportHead} style={{ marginTop: 22 }}>
        Sent reports
      </div>
      <PeriodFilterBar state={sentPeriod} resultCount={sentReports.length} totalCount={allSentReports.length} />
      {sentReports.map((r) => (
        <div key={r.id} className={styles.card}>
          <div className={styles.row}>
            <div className={styles.rowMain}>
              <div className={styles.name}>{fmtLongDate(r.visitDate)}</div>
              <div className={styles.meta}>
                {r.entries.length} client{r.entries.length === 1 ? '' : 's'} · sent {r.sentAt ? new Date(r.sentAt).toLocaleDateString('en-GB') : ''}
              </div>
            </div>
            <div className={styles.right}>
              <button type="button" className={styles.copyBtn} disabled={download.isPending} onClick={() => download.mutate(r)}>
                {download.isPending ? 'Preparing…' : '⬇ Download'}
              </button>
            </div>
          </div>
        </div>
      ))}
      {sentReports.length === 0 && <p className={styles.emptyMsg}>No sent reports in this range.</p>}
    </>
  );
}

// The full report-building flow, real user ask spelled out end to end:
// AI analyzes each client's own submitted feedback into a per-client
// section; the site manager writes their own real account of the day
// (and, per client, what that client said/asked on site); a second AI
// pass polishes the site manager's own raw text into professional prose
// without inventing anything; then one Submit compiles everything into
// the PDF and sends it. AI results land in local state first (reviewable,
// editable) -- nothing reaches the server until "Save draft" or "Submit
// report" is tapped, same discipline every other AI-draft feature here
// already follows.
function DayReportEditor({ visitDate, onClose }: { visitDate: string; onClose: () => void }) {
  const profile = useSessionStore((s) => s.profile);
  const { data: report, isLoading } = useSveDayReport(visitDate);
  const { data: visits } = useSveVisits();
  const saveDayReport = useSaveSveDayReport();
  const sendReport = useSendSveDayReport();
  const genFeedback = useGenerateClientFeedback();
  const polish = usePolishManagerNarrative();
  const deleteEntry = useDeleteSveEntry();
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);

  const [entries, setEntries] = useState<SveDayReportEntry[]>([]);
  const [siteSummary, setSiteSummary] = useState('');
  const [siteSummaryAi, setSiteSummaryAi] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  // Local edit state re-syncs to the server snapshot whenever it's a
  // genuinely different one (a fresh load, or right after a save echoes
  // back what was just persisted) -- derived during render (React's own
  // "adjusting state when a prop changes" pattern) rather than an effect,
  // so it doesn't cost an extra render on every report update.
  const [loadedUpdatedAt, setLoadedUpdatedAt] = useState<string | null>(null);
  if (report && report.updatedAt !== loadedUpdatedAt) {
    setLoadedUpdatedAt(report.updatedAt);
    setEntries(report.entries);
    setSiteSummary(report.siteSummary ?? '');
    setSiteSummaryAi(report.siteSummaryAi);
  }

  if (isLoading || !report) {
    return (
      <div>
        <button type="button" className={styles.copyBtn} onClick={onClose}>
          ← Back
        </button>
        <p className={styles.emptyMsg}>Loading…</p>
      </div>
    );
  }

  const reportId = report.id;

  function updateEntry(i: number, patch: Partial<SveDayReportEntry>) {
    setEntries((prev) => prev.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  }

  async function generateFeedbackFor(i: number) {
    setError(null);
    const entry = entries[i];
    const submission = (visits ?? []).find((v) => v.submission?.id === entry.submissionId)?.submission;
    if (!submission) return;
    try {
      const text = await genFeedback.mutateAsync(submission);
      updateEntry(i, { aiFeedbackSummary: text });
    } catch (e) {
      setError(friendlyError(e, 'Could not generate feedback'));
    }
  }

  async function polishClientNotes(i: number) {
    setError(null);
    const digest = reviewDigest(entries[i].managerReview);
    if (!digest) return;
    try {
      const text = await polish.mutateAsync({ scope: 'client', rawNotes: digest });
      updateEntry(i, { managerNotesAi: text });
    } catch (e) {
      setError(friendlyError(e, 'Could not polish notes'));
    }
  }

  function updateReviewAnswer(i: number, key: string, value: string | number) {
    setEntries((prev) => prev.map((e, idx) => (idx === i ? { ...e, managerReview: { ...(e.managerReview ?? {}), [key]: value } } : e)));
  }

  async function polishDaySummary() {
    setError(null);
    if (!siteSummary.trim()) return;
    try {
      const text = await polish.mutateAsync({ scope: 'day', rawNotes: siteSummary });
      setSiteSummaryAi(text);
    } catch (e) {
      setError(friendlyError(e, 'Could not polish summary'));
    }
  }

  function currentPatch() {
    return { entries, siteSummary: siteSummary || null, siteSummaryAi, preparedBy: profile?.key ?? undefined, preparedByName: profile?.name ?? undefined };
  }

  async function saveDraft() {
    setError(null);
    setSavedNote(null);
    try {
      await saveDayReport.mutateAsync({ id: reportId, patch: currentPatch() });
      setSavedNote('Draft saved.');
    } catch (e) {
      setError(friendlyError(e, 'Could not save'));
    }
  }

  async function submitReport() {
    setError(null);
    setSavedNote(null);
    try {
      const saved = await saveDayReport.mutateAsync({ id: reportId, patch: currentPatch() });
      await sendReport.mutateAsync(saved);
    } catch (e) {
      setError(friendlyError(e, 'Could not send report'));
    }
  }

  const busy = genFeedback.isPending || polish.isPending || saveDayReport.isPending || sendReport.isPending;
  // v1's own real gate (index.html:15366-15368, canGenerate): every client
  // visited that day must actually be reviewed, and the day summary must
  // actually be filled in, before the report can go to Management --
  // matches the "zero room for error" bar rather than letting a half-done
  // report out the door just because the button happened to be tappable.
  const canSubmit = entries.length > 0 && entries.every((e) => reviewIsAnswered(e.managerReview)) && siteSummary.trim() !== '';

  return (
    <div className={styles.card}>
      <div className={styles.row}>
        <div className={styles.rowMain}>
          <div className={styles.name}>{fmtLongDate(visitDate)}</div>
          <div className={styles.meta}>
            {report.site} · {entries.length} client{entries.length === 1 ? '' : 's'} · {report.status === 'sent' ? 'Sent' : 'Draft'}
          </div>
        </div>
        <button type="button" className={styles.copyBtn} onClick={onClose}>
          ← Back
        </button>
      </div>

      <div className={styles.detail}>
        {error && <p className={styles.reportError}>{error}</p>}
        {savedNote && <p className={styles.reportSentNote}>{savedNote}</p>}

        <div className={styles.reportHead}>Site manager&apos;s summary of the day</div>
        <textarea
          className={styles.reportTextarea}
          rows={4}
          placeholder="What happened on site today, overall — turnout, mood, anything Management should know"
          value={siteSummary}
          onChange={(e) => setSiteSummary(e.target.value)}
        />
        <div className={styles.reportActions}>
          <button type="button" className={styles.reportCancelBtn} disabled={polish.isPending || !siteSummary.trim()} onClick={polishDaySummary}>
            {polish.isPending ? 'Polishing…' : '✨ Polish with AI'}
          </button>
        </div>
        {siteSummaryAi && (
          <div className={styles.aiResultBox}>
            <div className={styles.aiResultLabel}>AI-polished version (this is what goes in the PDF)</div>
            <p className={styles.aiResultText}>{siteSummaryAi}</p>
          </div>
        )}

        <div className={styles.reportHead} style={{ marginTop: 18 }}>
          Client-by-client
        </div>
        {entries.map((entry, i) => (
          <div key={entry.siteVisitId} className={styles.clientCard}>
            <div className={styles.name}>{entry.clientName}</div>
            <div className={styles.meta}>{entry.clientContact}</div>

            {deletingEntryId === entry.siteVisitId ? (
              <div className={styles.reportActions} style={{ marginTop: 8 }}>
                <span className={styles.meta}>Remove {entry.clientName} from this report? This deletes their logged feedback too.</span>
                <button
                  type="button"
                  className={styles.reportCancelBtn}
                  disabled={deleteEntry.isPending}
                  onClick={() =>
                    deleteEntry.mutateAsync({ reportId, entries, siteVisitId: entry.siteVisitId, submissionId: entry.submissionId }).then(() => setDeletingEntryId(null))
                  }
                >
                  {deleteEntry.isPending ? 'Removing…' : 'Yes, remove'}
                </button>
                <button type="button" className={styles.reportCancelBtn} onClick={() => setDeletingEntryId(null)}>
                  Cancel
                </button>
              </div>
            ) : (
              <button type="button" className={styles.reportCancelBtn} style={{ marginTop: 8 }} onClick={() => setDeletingEntryId(entry.siteVisitId)}>
                Remove from report
              </button>
            )}

            {entry.submissionId ? (
              <>
                <div className={styles.reportActions} style={{ marginTop: 8 }}>
                  <button type="button" className={styles.reportCancelBtn} disabled={genFeedback.isPending} onClick={() => generateFeedbackFor(i)}>
                    {genFeedback.isPending ? 'Analyzing…' : entry.aiFeedbackSummary ? 'Regenerate AI feedback' : '✨ Generate AI feedback'}
                  </button>
                </div>
                {entry.aiFeedbackSummary && (
                  <div className={styles.aiResultBox}>
                    <div className={styles.aiResultLabel}>What the AI found in this client&apos;s feedback</div>
                    <p className={styles.aiResultText}>{entry.aiFeedbackSummary}</p>
                  </div>
                )}
              </>
            ) : (
              <p className={styles.reportHint}>No feedback survey submitted for this client.</p>
            )}

            <div className={styles.clientNotesLabel}>Your debrief on this client</div>
            {SVE_REVIEW_QUESTIONS.map((q) => (
              <div key={q.key} className={styles.reviewField}>
                <label className={styles.reviewFieldLabel}>{q.label}</label>
                {q.type === 'rating' && (
                  <div className={styles.starRow}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        className={`${styles.starBtn} ${Number(entry.managerReview?.[q.key] ?? 0) >= n ? styles.starBtnOn : ''}`}
                        onClick={() => updateReviewAnswer(i, q.key, n)}
                        aria-label={`${n} star${n === 1 ? '' : 's'}`}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                )}
                {q.type === 'select' && (
                  <select className={styles.select} value={String(entry.managerReview?.[q.key] ?? '')} onChange={(e) => updateReviewAnswer(i, q.key, e.target.value)}>
                    <option value="">— Select —</option>
                    {q.options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                )}
                {q.type === 'textarea' && (
                  <textarea
                    className={styles.reportTextarea}
                    rows={2}
                    placeholder="Optional"
                    value={String(entry.managerReview?.[q.key] ?? '')}
                    onChange={(e) => updateReviewAnswer(i, q.key, e.target.value)}
                  />
                )}
              </div>
            ))}
            <div className={styles.reportActions}>
              <button type="button" className={styles.reportCancelBtn} disabled={polish.isPending || !reviewIsAnswered(entry.managerReview)} onClick={() => polishClientNotes(i)}>
                {polish.isPending ? 'Composing…' : '✨ Compose with AI'}
              </button>
            </div>
            {entry.managerNotesAi && (
              <div className={styles.aiResultBox}>
                <div className={styles.aiResultLabel}>AI-composed narrative (this is what goes in the PDF)</div>
                <p className={styles.aiResultText}>{entry.managerNotesAi}</p>
              </div>
            )}
          </div>
        ))}
        {entries.length === 0 && <p className={styles.emptyMsg}>No site visits were logged for this day.</p>}

        {!canSubmit && entries.length > 0 && (
          <p className={styles.reportHint}>Review every client below and fill in the day summary before this report can be submitted.</p>
        )}
        <div className={styles.reportActions} style={{ marginTop: 18 }}>
          <button type="button" className={styles.reportCancelBtn} disabled={busy} onClick={saveDraft}>
            {saveDayReport.isPending ? 'Saving…' : 'Save draft'}
          </button>
          <button type="button" className={styles.reportSendBtn} disabled={busy || !canSubmit} onClick={submitReport}>
            {sendReport.isPending ? 'Sending…' : report.status === 'sent' ? 'Re-send report' : 'Submit report'}
          </button>
        </div>
        {report.status === 'sent' && <p className={styles.reportSentNote}>Sent to Management — in-app and by SMS.</p>}
      </div>
    </div>
  );
}
