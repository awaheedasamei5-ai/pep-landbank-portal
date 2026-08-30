import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { resolveReceiptLink } from '../../../data/receiptClient';
import styles from './ReceiptDownloadScreen.module.css';

// Public, unauthenticated -- the link both the client and the staff
// member in charge receive after a payment is approved. Same shape as
// SveFeedbackScreen (no session, no demoMode), but simpler: there's
// nothing to fill in, just a signed Storage URL to open. The signed URL
// itself expires in 5 minutes (see get-receipt's createSignedUrl call),
// so this re-resolves on every load rather than caching one long-term.
export function ReceiptDownloadScreen() {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['receiptLink', token],
    queryFn: () => resolveReceiptLink(token as string),
    enabled: !!token,
    retry: false,
  });

  const state = !token ? 'not_found' : isLoading ? 'loading' : isError ? 'unavailable' : data?.notFound ? 'not_found' : data?.url ? 'ready' : 'unavailable';

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div className={styles.heroTitle}>Palmstead Payment Receipt</div>
        <div className={styles.heroSub}>Your official receipt, ready to view</div>
      </div>
      <div className={styles.body}>
        {state === 'loading' && (
          <div className={`${styles.card} ${styles.centerState}`}>
            <p className={styles.centerSub}>Preparing your receipt…</p>
          </div>
        )}

        {state === 'not_found' && (
          <div className={`${styles.card} ${styles.centerState}`}>
            <div className={styles.centerIcon}>🔗</div>
            <div className={styles.centerTitle}>This link isn&apos;t valid</div>
            <p className={styles.centerSub}>Double-check the link you were sent, or contact your agent for a fresh one.</p>
          </div>
        )}

        {state === 'unavailable' && (
          <div className={`${styles.card} ${styles.centerState}`}>
            <div className={styles.centerIcon}>⚠️</div>
            <div className={styles.centerTitle}>This receipt isn&apos;t available right now</div>
            <p className={styles.centerSub}>Please try again in a little while, or ask your agent to send the link again.</p>
          </div>
        )}

        {state === 'ready' && data?.url && (
          <div className={`${styles.card} ${styles.centerState}`}>
            <div className={styles.centerIcon}>🧾</div>
            <div className={styles.centerTitle}>Your receipt is ready</div>
            <p className={styles.centerSub}>Tap below to view or download the PDF.</p>
            <a className={styles.downloadBtn} href={data.url} target="_blank" rel="noreferrer">
              View receipt
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
