// Safe reader for the optional third-party integration keys (see
// .env.local.example). Every feature that uses one of these must treat an
// empty string as "integration not configured yet" and degrade gracefully
// -- never throw, never block the demo-mode happy path. Vite only exposes
// env vars prefixed VITE_ to client code, and only ever at build/dev-server
// start (no runtime env changes), which is why every key here needs that
// prefix.
export const env = {
  resendApiKey: import.meta.env.VITE_RESEND_API_KEY ?? '',
  mapboxToken: import.meta.env.VITE_MAPBOX_TOKEN ?? '',
  sentryDsn: import.meta.env.VITE_SENTRY_DSN ?? '',
  arkeselApiKey: import.meta.env.VITE_ARKESEL_API_KEY ?? '',
};

export function isConfigured(key: keyof typeof env): boolean {
  return env[key].length > 0;
}
