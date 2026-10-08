"use client";

import { usePathname } from "next/navigation";

import styles from "./page-transition.module.css";

// Next's App Router swaps route content with no transition of its own --
// the user's own complaint ("transitions and animations between pages are
// not there, the whole thing feels rigid"). An occasional, deliberate
// navigation (clicking a sidebar item, a search result) -- not a
// 100+/day action -- so a standard entrance animation is warranted;
// purpose is preventing a jarring teleport between pages, not decoration.
//
// CSS animation (not a transition, not Motion): purely an entrance with no
// interactive/interruptible state to track, so remounting via `key={pathname}`
// and letting the keyframe play on mount is the cheapest tool that works --
// no library, runs off the main thread even while the new route's own data
// is still loading.
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className={styles.page}>
      {children}
    </div>
  );
}
