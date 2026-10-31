"use client";

import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, FileText, Link2Off } from 'lucide-react';
import { resolveQuotationLink } from '../../../data/quotationShareClient';
import styles from './QuotationDownloadScreen.module.css';

// docs/plans/42-urgent-bug-fixes-oct31.md -- public, unauthenticated,
// byte-for-byte structural mirror of ContractDownloadScreen/
// ReceiptDownloadScreen/SveReportDownloadScreen: no session, no demoMode,
// just a short-lived signed Storage URL to open.
export function QuotationDownloadScreen() {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['quotationLink', token],
    queryFn: () => resolveQuotationLink(token as string),
    enabled: !!token,
    retry: false,
  });

  const state = !token ? 'not_found' : isLoading ? 'loading' : isError ? 'unavailable' : data?.notFound ? 'not_found' : data?.url ? 'ready' : 'unavailable';

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div className={styles.heroTitle}>Your Quotation</div>
        <div className={styles.heroSub}>Trulander JSF — Palmstead</div>
      </div>
      <div className={styles.body}>
        {state === 'loading' && (
          <div className={`${styles.card} ${styles.centerState}`}>
            <p className={styles.centerSub}>Preparing your quotation…</p>
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
            <div className={styles.centerTitle}>This quotation isn&apos;t available right now</div>
            <p className={styles.centerSub}>Please try again in a little while, or ask the staff member to send the link again.</p>
          </div>
        )}

        {state === 'ready' && data?.url && (
          <div className={`${styles.card} ${styles.centerState}`}>
            <FileText className={styles.centerIcon} aria-hidden="true" />
            <div className={styles.centerTitle}>Your quotation is ready</div>
            <p className={styles.centerSub}>Tap below to view or download the PDF. A staff member will reach out shortly to explain your payment schedule.</p>
            <a className={styles.downloadBtn} href={data.url} target="_blank" rel="noreferrer">
              Download Quotation
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
