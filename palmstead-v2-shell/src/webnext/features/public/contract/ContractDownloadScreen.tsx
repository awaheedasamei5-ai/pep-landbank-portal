"use client";

import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, FileText, Link2Off } from 'lucide-react';
import { resolveContractLink } from '../../../data/contractShareClient';
import styles from './ContractDownloadScreen.module.css';

// docs/plans/29-company-leads-full-system-blueprint.md Phase F -- public,
// unauthenticated, byte-for-byte structural mirror of
// ReceiptDownloadScreen/SveReportDownloadScreen: no session, no demoMode,
// just a short-lived signed Storage URL to open. Icons are lucide-react
// (not emoji), per the user's explicit instruction for this build.
export function ContractDownloadScreen() {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['contractLink', token],
    queryFn: () => resolveContractLink(token as string),
    enabled: !!token,
    retry: false,
  });

  const state = !token ? 'not_found' : isLoading ? 'loading' : isError ? 'unavailable' : data?.notFound ? 'not_found' : data?.url ? 'ready' : 'unavailable';

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div className={styles.heroTitle}>Contract of Sale</div>
        <div className={styles.heroSub}>Palmstead — Royal Palm Enclave</div>
      </div>
      <div className={styles.body}>
        {state === 'loading' && (
          <div className={`${styles.card} ${styles.centerState}`}>
            <p className={styles.centerSub}>Preparing your contract…</p>
          </div>
        )}

        {state === 'not_found' && (
          <div className={`${styles.card} ${styles.centerState}`}>
            <Link2Off className={styles.centerIcon} aria-hidden="true" />
            <div className={styles.centerTitle}>This link isn&apos;t valid</div>
            <p className={styles.centerSub}>Double-check the link you were sent, or ask the staff member for a fresh one.</p>
          </div>
        )}

        {state === 'unavailable' && (
          <div className={`${styles.card} ${styles.centerState}`}>
            <AlertTriangle className={styles.centerIcon} aria-hidden="true" />
            <div className={styles.centerTitle}>This contract isn&apos;t available right now</div>
            <p className={styles.centerSub}>Please try again in a little while, or ask the staff member to send the link again.</p>
          </div>
        )}

        {state === 'ready' && data?.url && (
          <div className={`${styles.card} ${styles.centerState}`}>
            <FileText className={styles.centerIcon} aria-hidden="true" />
            <div className={styles.centerTitle}>Your contract is ready</div>
            <p className={styles.centerSub}>Tap below to view or download the PDF.</p>
            <a className={styles.downloadBtn} href={data.url} target="_blank" rel="noreferrer">
              Download Contract of Sale
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
