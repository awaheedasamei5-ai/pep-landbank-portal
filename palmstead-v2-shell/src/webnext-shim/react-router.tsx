"use client";

import { type ComponentPropsWithoutRef, createContext, type ReactNode, useContext, useEffect, useState } from "react";

import NextLink from "next/link";
import {
  useParams as useNextParams,
  useSearchParams as useNextSearchParams,
  usePathname,
  useRouter,
} from "next/navigation";

import { usePortalNavigation } from "@/app/(main)/dashboard/_components/portal-navigation";
import { emptyPortalTrail, resolvePortalReturn } from "@/lib/palmstead/portal-navigation";

// Mechanical routing adapter -- the real web-next screens copied verbatim
// into src/webnext/ import from the 'react-router' package (aliased to
// this file in next.config.mjs's turbopack.resolveAlias); this shim
// re-implements only the small real subset those screens actually use
// (useNavigate/useParams/useLocation/useSearchParams/Link/Outlet),
// backed by next/navigation, so none of the copied screen/hook code
// needs a single import-line edit. This is a routing-model translation
// (react-router's client-side router vs Next's App Router), not a
// rewrite of any real logic or UI.

// Keep navigation state tied to the destination. A source screen can
// re-render and call useLocation() while Next is transitioning; consuming
// a single unscoped value there loses the new screen's prefill and pool.
let pendingState: { pathname: string; value: unknown } | null = null;

export function useNavigate() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useNextSearchParams().toString();
  const navigation = usePortalNavigation();
  const current = search ? `${pathname}?${search}` : pathname;
  return (to: string | number, opts?: { replace?: boolean; state?: unknown }) => {
    if (typeof to === "number") {
      pendingState = null;
      if (to === -1) {
        if (navigation) navigation.back(current);
        else router.push(resolvePortalReturn(current, emptyPortalTrail()).href);
      } else if (to === 1) router.forward();
      return;
    }
    pendingState = opts?.state === undefined ? null : { pathname: new URL(to, window.location.href).pathname, value: opts.state };
    if (opts?.replace) router.replace(to);
    else router.push(to);
  };
}

export function useParams<T extends Record<string, string | undefined> = Record<string, string | undefined>>(): T {
  return useNextParams() as T;
}

export function useLocation() {
  const pathname = usePathname();
  const searchParams = useNextSearchParams();
  const search = searchParams.toString();
  // Several components may read useLocation() during the same transition.
  // Clear after the destination commits, not during its render.
  const [state] = useState<unknown>(() => {
    return pendingState?.pathname === pathname ? pendingState.value : null;
  });
  useEffect(() => {
    if (pendingState?.pathname === pathname) pendingState = null;
  }, [pathname]);
  return { pathname, search: search ? `?${search}` : "", hash: "", state, key: pathname };
}

export function useSearchParams(): [URLSearchParams, (next: URLSearchParams, options?: { replace?: boolean }) => void] {
  const searchParams = useNextSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const set = (next: URLSearchParams, options?: { replace?: boolean }) => {
    const query = next.toString();
    const href = query ? `${pathname}?${query}` : pathname;
    if (options?.replace === false) router.push(href, { scroll: false });
    else router.replace(href, { scroll: false });
  };
  return [new URLSearchParams(searchParams.toString()), set];
}

export function Link({ to, children, ...rest }: { to: string } & Omit<ComponentPropsWithoutRef<"a">, "href">) {
  return (
    <NextLink href={to} {...rest}>
      {children}
    </NextLink>
  );
}

// Real usage (PipelineListScreen/ClientDatabaseScreen/CompanyLeadsScreen/
// PlotInventoryScreen) renders <Outlet/> for a nested detail route drawn
// over the list. Next's structural equivalent is a layout.tsx rendering
// {children} -- each of those 4 screens' own route wiring
// (app/(main)/dashboard/.../layout.tsx) wraps the copied list screen in
// an <OutletProvider value={children}> carrying the real child page, so
// the copied screen's own unedited `<Outlet/>` JSX renders it via
// context instead of react-router's route tree.
const OutletContext = createContext<ReactNode>(null);

export function OutletProvider({ children, value }: { children: ReactNode; value: ReactNode }) {
  return <OutletContext.Provider value={value}>{children}</OutletContext.Provider>;
}

export function Outlet() {
  return <>{useContext(OutletContext)}</>;
}
