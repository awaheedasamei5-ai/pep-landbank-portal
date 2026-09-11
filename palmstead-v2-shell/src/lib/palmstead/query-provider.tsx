"use client";

import { type ReactNode, useState } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Real data-fetching layer for every Palmstead app built into this
// shell -- same @tanstack/react-query web-next already uses against the
// same Supabase project, reused rather than hand-rolling fetch/useEffect
// per page. One QueryClient per browser session (not per-request), same
// discipline as the official Next.js App Router + react-query guidance.
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } }));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
