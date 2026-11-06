// Real public base URL for links sent to clients outside this app (SMS
// share links, etc.). `window.location.origin` is wrong for this purpose
// -- it resolves to whatever host the STAFF MEMBER happens to be browsing
// from (e.g. http://localhost:3000 during local dev/testing), which a
// client's phone cannot reach. The real production domain is already
// hardcoded this same way server-side in
// supabase/functions/process-finance-receipt-sms/index.ts; this is the
// client-side equivalent, overridable via NEXT_PUBLIC_APP_URL if the real
// domain ever changes.
export const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || "https://palmstead-v2-shell.vercel.app";
