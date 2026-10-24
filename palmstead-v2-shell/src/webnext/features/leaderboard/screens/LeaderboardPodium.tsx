'use client';

import { useEffect, useState } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Trophy } from 'lucide-react';
import type { LeaderboardRow } from '../../../types/domain';
import styles from './LeaderboardPodium.module.css';

// docs/plans/25-leaderboard-v2-cross-app-plan.md -- real podium
// structure (center-elevated #1, flanking #2/#3), the one real,
// stack-matched GitHub component found in this session's research
// (nayanrdeveloper/shadcn-extras' LeaderboardCard, MIT, shadcn+Tailwind
// +Motion) hand-adapted into this app's own token system rather than
// installed as a dependency -- its one real component was small enough
// that a clean adaptation beats a new dependency for one card shape.
// rAF is throttled or fully paused in a backgrounded/not-yet-visible tab
// (confirmed live: a podium loaded in a background tab stayed stuck at
// 0 indefinitely) -- a safety setTimeout forces the real final value
// after durationMs regardless of whether rAF ever actually ran, so the
// displayed points can never be wrong, only (at worst) un-animated.
function useCountUp(target: number, durationMs = 700): number {
  const [value, setValue] = useState(target);
  useEffect(() => {
    setValue(0);
    let raf = 0;
    const start = performance.now();
    function tick(now: number) {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - t) * (1 - t);
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    const safety = setTimeout(() => setValue(target), durationMs + 50);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(safety);
    };
  }, [target, durationMs]);
  return value;
}

function PodiumSlot({ row, place }: { row: LeaderboardRow; place: 1 | 2 | 3 }) {
  const points = useCountUp(row.points);
  return (
    <div className={`${styles.slot} ${styles[`place${place}`]}`}>
      {place === 1 && <Trophy className={styles.crown} />}
      <Avatar className={styles.avatar}>
        <AvatarFallback className={styles.avatarFallback}>{row.staffName.charAt(0)}</AvatarFallback>
      </Avatar>
      <div className={styles.name}>{row.staffName}</div>
      <div className={styles.points}>{points}</div>
      <div className={styles.pointsLabel}>points</div>
      <div className={styles.stand}>{place}</div>
    </div>
  );
}

export function LeaderboardPodium({ rows }: { rows: LeaderboardRow[] }) {
  const [first, second, third] = rows;
  if (!first) return null;
  return (
    <div className={styles.podium}>
      {second && <PodiumSlot row={second} place={2} />}
      <PodiumSlot row={first} place={1} />
      {third && <PodiumSlot row={third} place={3} />}
    </div>
  );
}
