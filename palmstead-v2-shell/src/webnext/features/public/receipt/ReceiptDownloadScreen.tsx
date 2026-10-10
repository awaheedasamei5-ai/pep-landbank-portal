"use client";

import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { resolveReceiptLink } from '../../../data/receiptClient';
import styles from './ReceiptDownloadScreen.module.css';

// Public, unauthenticated -- the link a client or staff member gets after
// a payment is approved (see PaymentsPanel's post-approve/log flow). Same
// shape as SveReportDownloadScreen (no session, no demoMode): just a
// signed Storage URL to open. The signed URL itself expires in 5 minutes
// (see get-receipt's createSignedUrl call), so this re-resolves on every
// load rather than caching one long-term.
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
        <div className={styles.heroTitle}>Payment Receipt</div>
        <div className={styles.heroSub}>Palmstead — Royal Palm Enclave</div>
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
            <p className={styles.centerSub}>Double-check the link you were sent, or ask the staff member for a fresh one.</p>
          </div>
        )}

        {state === 'unavailable' && (
          <div className={`${styles.card} ${styles.centerState}`}>
            <div className={styles.centerIcon}>⚠️</div>
            <div className={styles.centerTitle}>This receipt isn&apos;t available right now</div>
            <p className={styles.centerSub}>Please try again in a little while, or ask the staff member to send the link again.</p>
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
