import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '../shared/ui/ErrorBoundary';
import { LiveSessionGate } from '../auth/LiveSessionGate';

const queryClient = new QueryClient();

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <LiveSessionGate>{children}</LiveSessionGate>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
