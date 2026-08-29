import { env, isConfigured } from './env';

// One reporting seam for the whole app. Today this always just logs
// structured context to the console (visible in dev, and in prod via
// browser devtools if a user hits an error and reports it). The moment
// VITE_SENTRY_DSN is set (see .env.local.example), swap the body of
// report() for a real `Sentry.captureException(error, {extra: context})`
// call -- everything that calls report() today needs no changes, since the
// seam is already in place at every real crash/error boundary.
export interface ErrorContext {
  route?: string;
  role?: string;
  demoMode?: boolean;
  [key: string]: unknown;
}

export function report(error: unknown, context: ErrorContext = {}): void {
  if (isConfigured('sentryDsn')) {
    // Placeholder for the real Sentry.captureException call once the SDK
    // is installed and initialized -- kept as a single, obvious spot to
    // wire up rather than scattered report() call sites.
    console.error('[error-reporting: Sentry configured, forwarding not yet wired]', error, context);
    return;
  }
  console.error('[error-reporting]', error, context);
}

export function initErrorReporting(): void {
  if (!isConfigured('sentryDsn')) return;
  // Real Sentry.init(...) goes here once the SDK is installed. Left as a
  // documented no-op so setting the env var alone doesn't silently do
  // nothing without a visible trace in the console.
  console.info('[error-reporting] VITE_SENTRY_DSN is set, but the Sentry SDK is not installed yet -- errors are still only logged to console.');
  void env.sentryDsn;
}
