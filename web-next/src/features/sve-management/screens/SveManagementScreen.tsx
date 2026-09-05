import { useState } from 'react';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useGenerateSveReportDraft, useSendSveInvite, useSendSveReport, useSveVisits } from '../hooks/useSveManagement';
import { friendlyError } from '../../../shared/lib/friendlyError';
import type { SiteVisit, SveSubmissionRecord } from '../../../types/domain';
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
export function SveManagementScreen() {
  const profile = useSessionStore((s) => s.profile);
  const hasAccess = !!profile && (profile.role === 'manager' || profile.key === 'elias' || profile.key === 'emmanuel' || profile.key === 'elizabeth');
  const { data: visits, isLoading } = useSveVisits();
  const sendInvite = useSendSveInvite();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

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
      <p className={styles.sub}>Send a feedback link after a visit, review what clients said</p>

      {isLoading && <p className={styles.emptyMsg}>Loading…</p>}
      {visits?.map(({ siteVisit, invite, submission }) => {
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
                    onClick={() => sendInvite.mutate({ siteVisitId: siteVisit.id, clientName: siteVisit.name, clientContact: siteVisit.contact })}
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
                <ReportBuilder siteVisit={siteVisit} submission={submission} />
              </div>
            )}
          </div>
        );
      })}
      {visits && visits.length === 0 && !isLoading && <p className={styles.emptyMsg}>No site visits logged yet.</p>}
    </div>
  );
}

// Real user ask: "the ai is able to analyze [the submission] and help
// the staff build the report ... when the report is ready, it's sent to
// management via their system and also through an sms link." Generate ->
// review/edit -> send is one deliberate flow, never automatic -- matches
// every other AI-draft feature in this app (memo/leave-letter/follow-up).
function ReportBuilder({ siteVisit, submission }: { siteVisit: SiteVisit; submission: SveSubmissionRecord }) {
  const generateDraft = useGenerateSveReportDraft();
  const sendReport = useSendSveReport();
  const [draft, setDraft] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alreadySent = !!submission.reportSentAt;

  async function generate() {
    setError(null);
    try {
      const message = await generateDraft.mutateAsync(submission);
      setDraft(message);
    } catch (e) {
      setError(friendlyError(e, 'Could not generate a draft'));
    }
  }

  async function send() {
    if (!draft) return;
    setError(null);
    try {
      await sendReport.mutateAsync({ siteVisit, submission, reportText: draft });
      setSent(true);
    } catch (e) {
      setError(friendlyError(e, 'Could not send the report'));
    }
  }

  return (
    <div className={styles.reportBox}>
      <div className={styles.reportHead}>AI-assisted report</div>
      {alreadySent && !sent && <p className={styles.reportSentNote}>A report for this feedback was already sent to Management.</p>}
      {sent && <p className={styles.reportSentNote}>Report sent to Management — in-app and by SMS.</p>}
      {error && <p className={styles.reportError}>{error}</p>}

      {draft == null ? (
        <button type="button" className={styles.reportGenBtn} disabled={generateDraft.isPending} onClick={generate}>
          {generateDraft.isPending ? 'Analyzing feedback…' : alreadySent ? 'Regenerate report' : '✨ Generate AI report'}
        </button>
      ) : (
        <>
          <textarea className={styles.reportTextarea} rows={8} value={draft} onChange={(e) => setDraft(e.target.value)} />
          <p className={styles.reportHint}>Review and edit before sending — nothing goes to Management until you tap Send.</p>
          <div className={styles.reportActions}>
            <button type="button" className={styles.reportCancelBtn} onClick={() => setDraft(null)}>
              Discard
            </button>
            <button type="button" className={styles.reportSendBtn} disabled={sendReport.isPending} onClick={send}>
              {sendReport.isPending ? 'Sending…' : 'Send report to Management'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
