import type { ReactNode } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { ErrorBoundary } from '../shared/ui/ErrorBoundary';
import { LiveSessionGate } from '../auth/LiveSessionGate';

const queryClient = new QueryClient({
  defaultOptions: {
    // gcTime must exceed maxAge below or a rehydrated query gets garbage
    // collected before persistence code ever gets to restore it -- default
    // gcTime (5 min) is far too short for "reopen the app after a night
    // offline" to still show anything.
    queries: { gcTime: 1000 * 60 * 60 * 24 },
  },
});

// TanStack Query v5's default networkMode ('online') already pauses
// in-flight mutations while offline and auto-resumes them the moment
// onlineManager sees connectivity return -- that part needs no extra code.
// What's genuinely missing without this persister is surviving a reload
// (tab closed/reopened, phone locked) while offline: without it, a paused
// mutation and any cached query data both vanish, so a field agent who
// loses signal mid-task and reopens the app to retry sees a blank screen
// instead of their pending work. localStorage (not IndexedDB) matches
// what the sync persister supports directly; the write volume here (query
// cache snapshots, not raw business data streams) is well within its size
// limits for this app's real usage pattern.
const persister = createSyncStoragePersister({
  storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  key: 'palmstead-query-cache',
});

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister, maxAge: 1000 * 60 * 60 * 24 }}
      >
        <LiveSessionGate>{children}</LiveSessionGate>
      </PersistQueryClientProvider>
    </ErrorBoundary>
  );
}
