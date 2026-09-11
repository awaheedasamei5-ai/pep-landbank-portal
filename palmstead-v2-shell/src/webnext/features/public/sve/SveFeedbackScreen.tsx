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

type Screen = 'loading' | 'not_found' | 'already_submitted' | 'form' | 'thanks' | 'unavailable';

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

  async function handleSubmit() {
    if (!token) return;
    const missing = firstMissingField();
    if (missing) {
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
            <button type="button" className={styles.submitBtn} onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit feedback'}
            </button>
            {submitError && <div className={styles.submitErr}>{submitError}</div>}
          </>
        )}
      </div>
    </div>
  );
}
