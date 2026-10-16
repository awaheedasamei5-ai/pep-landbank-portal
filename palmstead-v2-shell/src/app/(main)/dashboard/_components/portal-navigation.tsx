"use client";

import {
  type ComponentProps,
  createContext,
  type ReactNode,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  applyPortalReturn,
  emptyPortalTrail,
  type PortalRole,
  type PortalTrail,
  portalHrefWithReturnTo,
  portalTitle,
  recordPortalVisit,
  resolvePortalReturn,
  safePortalHref,
} from "@/lib/palmstead/portal-navigation";
import { useAuthStore } from "@/stores/auth/auth-store";

type Navigation = {
  trail: PortalTrail;
  role: PortalRole;
  observe: (href: string) => void;
  back: (current: string, fallback?: string) => void;
};
const NavigationContext = createContext<Navigation | null>(null);

function RouteObserver() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const navigation = useContext(NavigationContext);
  const href = search ? `${pathname}?${search}` : pathname;
  useEffect(() => navigation?.observe(href), [href, navigation?.observe]);
  return null;
}

function NavigationSession({ children, role }: { children: ReactNode; role: PortalRole }) {
  const router = useRouter();
  const [trail, setTrail] = useState(emptyPortalTrail);
  const popped = useRef<string | null>(null);
  const current = useRef<string | null>(null);
  const positions = useRef(new Map<string, number>());
  const restore = useRef<{ href: string; top: number } | null>(null);
  const cancelRestore = useRef<(() => void) | null>(null);

  useEffect(() => {
    const pop = () => {
      popped.current = safePortalHref(`${window.location.pathname}${window.location.search}`, role);
    };
    const scroll = () => {
      if (current.current) positions.current.set(current.current, window.scrollY);
    };
    window.addEventListener("popstate", pop);
    window.addEventListener("scroll", scroll, { passive: true });
    return () => {
      window.removeEventListener("popstate", pop);
      window.removeEventListener("scroll", scroll);
      cancelRestore.current?.();
    };
  }, [role]);

  const observe = useCallback(
    (raw: string) => {
      const href = safePortalHref(raw, role);
      if (!href) return;
      const kind = popped.current === href ? "pop" : "visit";
      popped.current = null;
      current.current = href;
      setTrail((previous) => recordPortalVisit(previous, raw, kind, role));
      while (positions.current.size > 80) {
        const first = positions.current.keys().next().value;
        if (first !== undefined) positions.current.delete(first);
      }
      cancelRestore.current?.();
      const target = restore.current;
      restore.current = null;
      if (target?.href !== href) return;
      let timer: ReturnType<typeof setTimeout>;
      let attempts = 0;
      const cancel = () => {
        clearTimeout(timer);
        window.removeEventListener("wheel", cancel);
        window.removeEventListener("touchstart", cancel);
        window.removeEventListener("keydown", cancel);
      };
      const attempt = () => {
        const available = document.documentElement.scrollHeight - window.innerHeight;
        if (available >= target.top || ++attempts >= 20) {
          window.scrollTo({ top: target.top, behavior: "instant" });
          cancel();
        } else timer = setTimeout(attempt, 100);
      };
      window.addEventListener("wheel", cancel, { passive: true });
      window.addEventListener("touchstart", cancel, { passive: true });
      window.addEventListener("keydown", cancel);
      cancelRestore.current = cancel;
      timer = setTimeout(attempt, 0);
    },
    [role],
  );

  const back = useCallback(
    (raw: string, fallback?: string) => {
      const target = resolvePortalReturn(raw, trail, fallback, role);
      setTrail((previous) => applyPortalReturn(previous, target));
      restore.current = { href: target.href, top: positions.current.get(target.href) ?? 0 };
      router.push(target.href, { scroll: false });
    },
    [role, router, trail],
  );
  const value = useMemo(() => ({ trail, role, observe, back }), [trail, role, observe, back]);
  return (
    <NavigationContext.Provider value={value}>
      <Suspense fallback={null}>
        <RouteObserver />
      </Suspense>
      {children}
    </NavigationContext.Provider>
  );
}

/** Outside PageTransition; remount on identity/role changes so no other staff trail survives. */
export function PortalNavigationProvider({ children }: { children: ReactNode }) {
  const profile = useAuthStore((state) => state.profile);
  return (
    <NavigationSession
      key={`${profile?.key ?? "signed-out"}:${profile?.role ?? "agent"}`}
      role={profile?.role === "manager" ? "manager" : "agent"}
    >
      {children}
    </NavigationSession>
  );
}

export function usePortalNavigation() {
  return useContext(NavigationContext);
}

/** Drill-through links retain a validated source view even after reload/new-tab. */
export function PortalForwardLink({ href, ...props }: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const navigation = usePortalNavigation();
  const from = search ? `${pathname}?${search}` : pathname;
  return <Link {...props} href={portalHrefWithReturnTo(href, from, navigation?.role)} />;
}

export function PortalBackLink({ fallback, className }: { fallback?: string; className?: string }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const navigation = usePortalNavigation();
  const href = search ? `${pathname}?${search}` : pathname;
  const target = resolvePortalReturn(href, navigation?.trail ?? emptyPortalTrail(), fallback, navigation?.role);
  return (
    <Button variant="ghost" size="sm" className={className} asChild>
      <Link
        href={target.href}
        onNavigate={(event) => {
          if (!navigation) return;
          event.preventDefault();
          navigation.back(href, fallback);
        }}
      >
        <ArrowLeft aria-hidden="true" data-icon="inline-start" />
        Back to {portalTitle(target.href)}
      </Link>
    </Button>
  );
}

/** Validated meaningful tabs use push; other filter values remain on the current URL. */
export function usePortalTab<const T extends readonly string[]>(key: "tab" | "view", values: T, initial: T[number]) {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const selected = params.get(key);
  const value = selected && values.includes(selected) ? (selected as T[number]) : initial;
  const select = (next: string) => {
    if (!values.includes(next) || next === value) return;
    const query = new URLSearchParams(params.toString());
    query.delete("returnTo");
    query.set(key, next);
    router.push(`${pathname}?${query.toString()}`, { scroll: false });
  };
  return [value, select] as const;
}
