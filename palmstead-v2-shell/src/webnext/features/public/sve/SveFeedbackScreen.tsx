"use client";

import { useState } from 'react';
import { useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSiteVisitInvite, submitSiteVisitExperience } from '../../../data/sveClient';
import { friendlyError } from '../../../shared/lib/friendlyError';
import { NpsScale } from './NpsScale';
import { StarRating } from './StarRating';
import styles from './SveFeedbackScreen.module.css';

const JOURNEY_OPTIONS = ['Excellent', 'Good', 'Average', 'Poor'];
const SITE_DESC_OPTIONS = ['Exceeded expectations', 'Met expectations', 'Below expectations'];
// Real v1 values verbatim (index.html:25652, formClientSiteVisit's own
// radioGroup) -- these read straight into the AI-report/PDF pipeline
// downstream, so they need to already be properly-cased prose, not
// internal slugs like 'ready'/'need more time' this screen used before.
const PURCHASE_INTENT_OPTIONS = ['Ready to purchase', 'Need more time to decide', 'Not at this time', 'Undecided'];
const SITE_OPTIONS = ['Royal Palm Enclave, Tsopoli', 'Other'];

type Screen = 'loading' | 'not_found' | 'already_submitted' | 'form' | 'review' | 'thanks' | 'unavailable';

// Public, unauthenticated -- no RequireAuth, no session, no demoMode. See
// the SiteVisitInvite type's comment in types/domain.ts for the RPC-based
// access pattern this relies on (two SECURITY DEFINER functions added to
// both staging and production this session specifically to make this
// screen possible, since RLS on the underlying tables is otherwise
// closed to anon entirely).
export function SveFeedbackScreen() {
  const { token } = useParams<{ token: string }>();
  const {
    data: invite,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['sveInvite', token],
    queryFn: () => getSiteVisitInvite(token as string),
    enabled: !!token,
    retry: false,
  });
  const queryClient = useQueryClient();
  const [submitResult, setSubmitResult] = useState<'ok' | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [siteVisited, setSiteVisited] = useState('');
  const [siteVisitedOther, setSiteVisitedOther] = useState('');
  const [visitDate, setVisitDate] = useState('');
  const [loadedInviteToken, setLoadedInviteToken] = useState<string | null>(null);
  const [journeyRating, setJourneyRating] = useState('');
  const [siteManagerName, setSiteManagerName] = useState('');
  const [relationshipRating, setRelationshipRating] = useState(0);
  const [handlingFeedback, setHandlingFeedback] = useState('');
  const [siteDescriptionRating, setSiteDescriptionRating] = useState('');
  const [belowExpectationReason, setBelowExpectationReason] = useState('');
  const [overallRating, setOverallRating] = useState(0);
  const [npsScore, setNpsScore] = useState<number | undefined>(undefined);
  const [improvementSuggestions, setImprovementSuggestions] = useState('');
  const [purchaseIntent, setPurchaseIntent] = useState('');
  const [additionalComments, setAdditionalComments] = useState('');
  const [validationErr, setValidationErr] = useState<string | null>(null);
  // Real user ask: "the cleint is able to fill the form once they can
  // preview and go back and edit but when they submit they cant reused
  // the link again to avoid double submissions." A separate boolean
  // (not folded into the `screen` derivation below) since it's the one
  // piece of this flow that's genuinely just local UI state, not derived
  // from server/query state the way every other screen value is.
  const [reviewing, setReviewing] = useState(false);

  // Real v1 behavior (index.html:25636-25642): the client can confirm or
  // correct which site/date they actually visited rather than this form
  // just trusting whatever staff originally logged -- seeded from the
  // invite once it loads (derived during render, not an effect, same
  // "adjusting state when a prop changes" pattern used elsewhere).
  if (invite && loadedInviteToken !== token) {
    setLoadedInviteToken(token ?? null);
    setSiteVisited(invite.site && SITE_OPTIONS.includes(invite.site) ? invite.site : invite.site ? 'Other' : SITE_OPTIONS[0]);
    setSiteVisitedOther(invite.site && !SITE_OPTIONS.includes(invite.site) ? invite.site : '');
    setVisitDate(invite.visitDate ?? '');
  }

  const screen: Screen = !token
    ? 'not_found'
    : submitResult === 'ok'
      ? 'thanks'
      : isLoading
        ? 'loading'
        : isError
          ? 'unavailable'
          : !invite
            ? 'not_found'
            : invite.alreadySubmitted
              ? 'already_submitted'
              : reviewing
                ? 'review'
                : 'form';

  // Real v1 required set (index.html:25682) -- name, phone, visit date,
  // journey rating, overall rating, NPS score, improvement suggestions and
  // purchase intent are all mandatory there; this screen previously only
  // ever checked name/phone, letting a submission through with none of
  // the ratings Management's report actually depends on.
  function firstMissingField(): string | null {
    if (!fullName.trim()) return 'your name';
    if (!phone.trim()) return 'your phone number';
    if (!visitDate.trim()) return 'the date of your visit';
    if (!journeyRating) return 'how your journey went';
    if (!overallRating) return 'your overall rating';
    if (npsScore == null) return 'your recommendation score';
    if (!improvementSuggestions.trim()) return 'what we could improve';
    if (!purchaseIntent) return 'your purchase readiness';
    return null;
  }

  function goToReview() {
    const missing = firstMissingField();
    if (missing) {
      setValidationErr(`Please fill in: ${missing}.`);
      return;
    }
    setValidationErr(null);
    setReviewing(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSubmit() {
    if (!token) return;
    const missing = firstMissingField();
    if (missing) {
      setReviewing(false);
      setValidationErr(`Please fill in: ${missing}.`);
      return;
    }
    setValidationErr(null);
    setSubmitError(null);
    setSubmitting(true);
    try {
      const result = await submitSiteVisitExperience(token, {
        fullName: fullName.trim(),
        phone: phone.trim(),
        siteVisited: (siteVisited === 'Other' ? siteVisitedOther.trim() : siteVisited) || undefined,
        visitDate: visitDate || undefined,
        journeyRating: journeyRating || undefined,
        siteManagerName: siteManagerName || undefined,
        relationshipRating: relationshipRating || undefined,
        handlingFeedback: handlingFeedback || undefined,
        siteDescriptionRating: siteDescriptionRating || undefined,
        belowExpectationReason: belowExpectationReason || undefined,
        overallRating: overallRating || undefined,
        npsScore,
        improvementSuggestions: improvementSuggestions || undefined,
        purchaseIntent: purchaseIntent || undefined,
        additionalComments: additionalComments || undefined,
      });
      if (result === 'ok') {
        setSubmitResult('ok');
      } else {
        // 'already_submitted' or 'not_found' -- refetch so the derived
        // screen state picks up the invite's real current state instead
        // of tracking a parallel copy of it locally.
        await queryClient.invalidateQueries({ queryKey: ['sveInvite', token] });
      }
    } catch (e) {
      setSubmitError(friendlyError(e, 'Something went wrong -- please try again.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div className={styles.heroTitle}>Palmstead Site Visit Experience</div>
        <div className={styles.heroSub}>Your feedback helps us do better for the next visitor</div>
      </div>
      <div className={styles.body}>
        {screen === 'loading' && (
          <div className={styles.centerState}>
            <p className={styles.centerSub}>Loading…</p>
          </div>
        )}

        {screen === 'not_found' && (
          <div className={`${styles.card} ${styles.centerState}`}>
            <div className={styles.centerIcon}>🔗</div>
            <div className={styles.centerTitle}>This link isn't valid</div>
            <p className={styles.centerSub}>Double-check the link you were sent, or contact your agent for a fresh one.</p>
          </div>
        )}

        {screen === 'unavailable' && (
          <div className={`${styles.card} ${styles.centerState}`}>
            <div className={styles.centerIcon}>⚠️</div>
            <div className={styles.centerTitle}>This form isn't available right now</div>
            <p className={styles.centerSub}>Please try again in a little while.</p>
          </div>
        )}

        {screen === 'already_submitted' && (
          <div className={`${styles.card} ${styles.centerState}`}>
            <div className={styles.centerIcon}>✅</div>
            <div className={styles.centerTitle}>You've already shared your feedback</div>
            <p className={styles.centerSub}>Thank you{invite?.clientName ? `, ${invite.clientName}` : ''} -- we've got it on file already.</p>
          </div>
        )}

        {screen === 'thanks' && (
          <div className={`${styles.card} ${styles.centerState}`}>
            <div className={styles.centerIcon}>🎉</div>
            <div className={styles.centerTitle}>Thank you{fullName ? `, ${fullName}` : ''}!</div>
            <p className={styles.centerSub}>Your feedback has been received. We really appreciate you taking the time.</p>
          </div>
        )}

        {screen === 'form' && (
          <>
            {invite?.plot && (
              <div className={styles.card}>
                <div className={styles.visitMeta}>
                  <div className={styles.visitMetaLine}>
                    Plot of interest <strong>{invite.plot}</strong>
                  </div>
                </div>
              </div>
            )}

            <div className={styles.card}>
              <div className={styles.sectionTitle}>Your details</div>
              <div className={styles.field}>
                <label className={styles.label}>Full name *</label>
                <input className={styles.input} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Ama Owusu" />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Phone number *</label>
                <input className={styles.input} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0244…" />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Which site did you visit?</label>
                <div className={styles.pillGroup}>
                  {SITE_OPTIONS.map((opt) => (
                    <button key={opt} type="button" className={`${styles.pillOption} ${siteVisited === opt ? styles.pillOptionActive : ''}`} onClick={() => setSiteVisited(opt)}>
                      {opt}
                    </button>
                  ))}
                </div>
                {siteVisited === 'Other' && (
                  <input className={styles.input} style={{ marginTop: 8 }} value={siteVisitedOther} onChange={(e) => setSiteVisitedOther(e.target.value)} placeholder="Which site?" />
                )}
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Date of visit *</label>
                <input className={styles.input} type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} />
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.sectionTitle}>Your journey</div>
              <div className={styles.field}>
                <label className={styles.label}>How was your overall journey to the site? *</label>
                <div className={styles.pillGroup}>
                  {JOURNEY_OPTIONS.map((opt) => (
                    <button key={opt} type="button" className={`${styles.pillOption} ${journeyRating === opt ? styles.pillOptionActive : ''}`} onClick={() => setJourneyRating(opt)}>
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Who from our team looked after you?</label>
                <input className={styles.input} value={siteManagerName} onChange={(e) => setSiteManagerName(e.target.value)} placeholder="Agent or site manager's name" />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>How would you rate how they handled your visit?</label>
                <StarRating value={relationshipRating} onChange={setRelationshipRating} />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Anything you liked or didn't like about how you were handled?</label>
                <textarea className={styles.textarea} value={handlingFeedback} onChange={(e) => setHandlingFeedback(e.target.value)} />
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.sectionTitle}>The site itself</div>
              <div className={styles.field}>
                <label className={styles.label}>Did the site match what you expected?</label>
                <div className={styles.pillGroup}>
                  {SITE_DESC_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      className={`${styles.pillOption} ${siteDescriptionRating === opt ? styles.pillOptionActive : ''}`}
                      onClick={() => setSiteDescriptionRating(opt)}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
              {siteDescriptionRating === 'Below expectations' && (
                <div className={styles.field}>
                  <label className={styles.label}>What fell short?</label>
                  <textarea className={styles.textarea} value={belowExpectationReason} onChange={(e) => setBelowExpectationReason(e.target.value)} />
                </div>
              )}
            </div>

            <div className={styles.card}>
              <div className={styles.sectionTitle}>Overall</div>
              <div className={styles.field}>
                <label className={styles.label}>Overall, how was your experience? *</label>
                <StarRating value={overallRating} onChange={setOverallRating} />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>How likely are you to recommend Palmstead to a friend? *</label>
                <NpsScale value={npsScore} onChange={setNpsScore} />
                <div className={styles.npsLabels}>
                  <span>Not likely</span>
                  <span>Very likely</span>
                </div>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Where are you at right now? *</label>
                <div className={styles.pillGroup}>
                  {PURCHASE_INTENT_OPTIONS.map((opt) => (
                    <button key={opt} type="button" className={`${styles.pillOption} ${purchaseIntent === opt ? styles.pillOptionActive : ''}`} onClick={() => setPurchaseIntent(opt)}>
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>What could we improve? *</label>
                <textarea className={styles.textarea} value={improvementSuggestions} onChange={(e) => setImprovementSuggestions(e.target.value)} />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Anything else you'd like us to know?</label>
                <textarea className={styles.textarea} value={additionalComments} onChange={(e) => setAdditionalComments(e.target.value)} />
              </div>
            </div>

            {validationErr && <div className={styles.submitErr}>{validationErr}</div>}
            <button type="button" className={styles.submitBtn} onClick={goToReview}>
              Review my answers →
            </button>
          </>
        )}

        {screen === 'review' && (
          <ReviewScreen
            fullName={fullName}
            phone={phone}
            siteVisited={siteVisited === 'Other' ? siteVisitedOther : siteVisited}
            visitDate={visitDate}
            journeyRating={journeyRating}
            siteManagerName={siteManagerName}
            relationshipRating={relationshipRating}
            handlingFeedback={handlingFeedback}
            siteDescriptionRating={siteDescriptionRating}
            belowExpectationReason={belowExpectationReason}
            overallRating={overallRating}
            npsScore={npsScore}
            improvementSuggestions={improvementSuggestions}
            purchaseIntent={purchaseIntent}
            additionalComments={additionalComments}
            submitting={submitting}
            submitError={submitError}
            onEdit={() => setReviewing(false)}
            onConfirm={handleSubmit}
          />
        )}
      </div>
    </div>
  );
}

// Read-only summary of every answer, grouped under the same section
// titles the form itself uses, so nothing looks unfamiliar between the
// two screens -- just editable vs. not. `onEdit` returns to the form
// with all state intact (nothing is cleared); `onConfirm` is the one and
// only real submit call in this whole flow.
function ReviewScreen({
  fullName,
  phone,
  siteVisited,
  visitDate,
  journeyRating,
  siteManagerName,
  relationshipRating,
  handlingFeedback,
  siteDescriptionRating,
  belowExpectationReason,
  overallRating,
  npsScore,
  improvementSuggestions,
  purchaseIntent,
  additionalComments,
  submitting,
  submitError,
  onEdit,
  onConfirm,
}: {
  fullName: string;
  phone: string;
  siteVisited: string;
  visitDate: string;
  journeyRating: string;
  siteManagerName: string;
  relationshipRating: number;
  handlingFeedback: string;
  siteDescriptionRating: string;
  belowExpectationReason: string;
  overallRating: number;
  npsScore: number | undefined;
  improvementSuggestions: string;
  purchaseIntent: string;
  additionalComments: string;
  submitting: boolean;
  submitError: string | null;
  onEdit: () => void;
  onConfirm: () => void;
}) {
  const stars = (n: number) => (n > 0 ? '★'.repeat(n) + '☆'.repeat(5 - n) : '—');
  return (
    <>
      <div className={styles.card}>
        <div className={styles.sectionTitle}>Your details</div>
        <ReviewRow label="Full name" value={fullName} />
        <ReviewRow label="Phone number" value={phone} />
        <ReviewRow label="Site visited" value={siteVisited} />
        <ReviewRow label="Date of visit" value={visitDate} />
      </div>
      <div className={styles.card}>
        <div className={styles.sectionTitle}>Your journey</div>
        <ReviewRow label="Journey" value={journeyRating} />
        <ReviewRow label="Who looked after you" value={siteManagerName} />
        <ReviewRow label="Handling rating" value={stars(relationshipRating)} />
        <ReviewRow label="Handling feedback" value={handlingFeedback} />
      </div>
      <div className={styles.card}>
        <div className={styles.sectionTitle}>The site itself</div>
        <ReviewRow label="Matched expectations?" value={siteDescriptionRating} />
        {siteDescriptionRating === 'Below expectations' && <ReviewRow label="What fell short" value={belowExpectationReason} />}
      </div>
      <div className={styles.card}>
        <div className={styles.sectionTitle}>Overall</div>
        <ReviewRow label="Overall rating" value={stars(overallRating)} />
        <ReviewRow label="Recommend to a friend" value={npsScore != null ? `${npsScore} / 10` : '—'} />
        <ReviewRow label="Purchase readiness" value={purchaseIntent} />
        <ReviewRow label="What we could improve" value={improvementSuggestions} />
        <ReviewRow label="Anything else" value={additionalComments} />
      </div>
      <button type="button" className={styles.submitBtn} onClick={onConfirm} disabled={submitting}>
        {submitting ? 'Submitting…' : 'Confirm & submit'}
      </button>
      <button type="button" className={styles.editAnswersBtn} onClick={onEdit} disabled={submitting}>
        ← Edit my answers
      </button>
      {submitError && <div className={styles.submitErr}>{submitError}</div>}
    </>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.reviewRow}>
      <span className={styles.reviewLabel}>{label}</span>
      <span className={styles.reviewValue}>{value?.trim() ? value : '—'}</span>
    </div>
  );
}
