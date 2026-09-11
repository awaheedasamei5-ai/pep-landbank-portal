"use client";

import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { resolveSveReportLink } from '../../../data/sveReportClient';
import styles from './SveReportDownloadScreen.module.css';

// Public, unauthenticated -- the link Management receives by SMS once a
// staff member sends a Site Visit Experience report. Same shape as
// ReceiptDownloadScreen (no session, no demoMode): just a signed Storage
// URL to open. The signed URL itself expires in 5 minutes (see
// get-sve-report's createSignedUrl call), so this re-resolves on every
// load rather than caching one long-term.
export function SveReportDownloadScreen() {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['sveReportLink', token],
    queryFn: () => resolveSveReportLink(token as string),
    enabled: !!token,
    retry: false,
  });

  const state = !token ? 'not_found' : isLoading ? 'loading' : isError ? 'unavailable' : data?.notFound ? 'not_found' : data?.url ? 'ready' : 'unavailable';

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div className={styles.heroTitle}>Site Visit Experience Report</div>
        <div className={styles.heroSub}>Palmstead — Royal Palm Enclave</div>
      </div>
      <div className={styles.body}>
        {state === 'loading' && (
          <div className={`${styles.card} ${styles.centerState}`}>
            <p className={styles.centerSub}>Preparing the report…</p>
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
            <div className={styles.centerTitle}>This report isn&apos;t available right now</div>
            <p className={styles.centerSub}>Please try again in a little while, or ask the staff member to send the link again.</p>
          </div>
        )}

        {state === 'ready' && data?.url && (
          <div className={`${styles.card} ${styles.centerState}`}>
            <div className={styles.centerIcon}>📋</div>
            <div className={styles.centerTitle}>The report is ready</div>
            <p className={styles.centerSub}>Tap below to view or download the PDF.</p>
            <a className={styles.downloadBtn} href={data.url} target="_blank" rel="noreferrer">
              View report
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
