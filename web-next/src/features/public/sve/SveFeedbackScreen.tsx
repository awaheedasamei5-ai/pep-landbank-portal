import { useState } from 'react';
import { useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSiteVisitInvite, submitSiteVisitExperience } from '../../../data/sveClient';
import { NpsScale } from './NpsScale';
import { StarRating } from './StarRating';
import styles from './SveFeedbackScreen.module.css';

const JOURNEY_OPTIONS = ['Excellent', 'Good', 'Average', 'Poor'];
const SITE_DESC_OPTIONS = ['Exceeded expectations', 'Met expectations', 'Below expectations'];
const PURCHASE_INTENT_OPTIONS = [
  { value: 'ready', label: "I'm ready to move forward" },
  { value: 'need more time', label: 'I need more time to decide' },
  { value: 'not at this time', label: 'Not at this time' },
  { value: 'undecided', label: 'Still undecided' },
];

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

  async function handleSubmit() {
    if (!token) return;
    if (!fullName.trim() || !phone.trim()) {
      setValidationErr('Please enter your name and phone number.');
      return;
    }
    setValidationErr(null);
    setSubmitError(null);
    setSubmitting(true);
    try {
      const result = await submitSiteVisitExperience(token, {
        fullName: fullName.trim(),
        phone: phone.trim(),
        siteVisited: invite?.site ?? undefined,
        visitDate: invite?.visitDate ?? undefined,
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
      setSubmitError(e instanceof Error ? e.message : 'Something went wrong -- please try again.');
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
            {invite && (invite.site || invite.visitDate) && (
              <div className={styles.card}>
                <div className={styles.visitMeta}>
                  {invite.site && (
                    <div className={styles.visitMetaLine}>
                      Visited <strong>{invite.site}</strong>
                      {invite.plot ? ` (${invite.plot})` : ''}
                    </div>
                  )}
                  {invite.visitDate && (
                    <div className={styles.visitMetaLine}>
                      On <strong>{invite.visitDate}</strong>
                    </div>
                  )}
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
            </div>

            <div className={styles.card}>
              <div className={styles.sectionTitle}>Your journey</div>
              <div className={styles.field}>
                <label className={styles.label}>How was your overall journey to the site?</label>
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
                <label className={styles.label}>Overall, how was your experience?</label>
                <StarRating value={overallRating} onChange={setOverallRating} />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>How likely are you to recommend Palmstead to a friend?</label>
                <NpsScale value={npsScore} onChange={setNpsScore} />
                <div className={styles.npsLabels}>
                  <span>Not likely</span>
                  <span>Very likely</span>
                </div>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Where are you at right now?</label>
                <div className={styles.pillGroup}>
                  {PURCHASE_INTENT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`${styles.pillOption} ${purchaseIntent === opt.value ? styles.pillOptionActive : ''}`}
                      onClick={() => setPurchaseIntent(opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>What could we improve?</label>
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
