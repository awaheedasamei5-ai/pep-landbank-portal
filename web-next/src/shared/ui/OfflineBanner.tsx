import { useEffect, useState } from 'react';
import { useIsMutating } from '@tanstack/react-query';
import styles from './OfflineBanner.module.css';

// TanStack Query already pauses mutations while offline and resumes them
// automatically on reconnect (see app/providers.tsx) -- the one thing that
// silently missing is any indication to the person actually using the app
// that this is happening, so a payment/lead edit made in a dead zone just
// looks like it did nothing. This surfaces both states: offline (nothing
// pending yet, or about to be) and "back online, sending your changes now"
// (mutations actively flushing), then hides itself once neither applies.
export function OfflineBanner() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const mutatingCount = useIsMutating();

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (online && mutatingCount === 0) return null;

  return (
    <div className={`${styles.banner} ${online ? styles.syncing : styles.offline}`}>
      {online ? 'Back online -- syncing your changes...' : "You're offline. Changes you make will send once you're back online."}
    </div>
  );
}
