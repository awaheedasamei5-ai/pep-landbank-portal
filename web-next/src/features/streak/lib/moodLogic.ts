import type { Config, Lead, Payment, ScheduleItem, StreakRow } from '../../../types/domain';
import { monthKey, num, today } from '../../../shared/lib/format';

// Direct ports of index.html's streak/mood computation (index.html:10196-10397).
// Kept as pure functions taking plain data in, matching the original's shape,
// so this logic is trivially unit-testable and has zero dependency on the
// DataSource/React layers above it.

export function computeRunningStreakLength(history: StreakRow[], workEndTime: string): number {
  const nowHHMM = new Date().toISOString().slice(11, 16);
  const deadlinePassed = nowHHMM > (workEndTime || '17:00');
  const t = today();
  const todayRow = history.find((r) => r.date === t);
  let rows = [...history].sort((a, b) => b.date.localeCompare(a.date));
  if (todayRow && !todayRow.dayMet && !deadlinePassed) rows = rows.filter((r) => r.date !== t);
  let len = 0;
  for (const r of rows) {
    if (r.dayMet) len++;
    else break;
  }
  return len;
}

export type TodayProgress = 'notStarted' | 'halfway' | 'allDone' | 'skipped';

export function computeTodayTodoProgress(todos: ScheduleItem[]): TodayProgress {
  const list = todos.filter((t) => t.status !== 'rescheduled');
  const total = list.length;
  if (total === 0) return 'notStarted';
  const doneCount = list.filter((t) => t.status === 'closed').length;
  const openCount = list.filter((t) => t.status === 'open').length;
  if (doneCount === 0 && openCount === 0) return 'skipped';
  if (doneCount === 0) return 'notStarted';
  if (openCount === 0) return 'allDone';
  return 'halfway';
}

export interface MonthlyRisk {
  daysLeft: number;
  tier: 'on track' | 'at risk' | 'critical';
  closedCount: number;
  quota: number;
}

export function computeMonthlyRisk(leads: Lead[], agentKey: string, config: Config): MonthlyRisk {
  const d = new Date(today() + 'T00:00:00');
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const dayOfMonth = d.getDate();
  const daysLeft = daysInMonth - dayOfMonth;
  const monthProgress = dayOfMonth / daysInMonth;
  const quota = num(config.targetPlotsPerMonth) || 2;
  const thisMonth = today().slice(0, 7);
  const closedCount = leads.filter((l) => l.agent === agentKey && l.amtPaid >= l.grandTotal && l.grandTotal > 0 && monthKey(l.date) === thisMonth).length;
  const pipelineProgress = quota ? closedCount / quota : 1;
  const tier = pipelineProgress >= monthProgress ? 'on track' : pipelineProgress >= monthProgress * 0.6 ? 'at risk' : 'critical';
  return { daysLeft, tier, closedCount, quota };
}

export interface PetMood {
  key: 'pet_happy' | 'pet_neutral' | 'pet_worried';
  severity: 'moderate' | 'severe' | null;
  progressRatio: number | null;
  paceDelta: number;
}

export function computePipelinePetMood(payments: Payment[], agentKey: string, config: Config): PetMood {
  const d = new Date(today() + 'T00:00:00');
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const dayOfMonth = d.getDate();
  const thisMonth = today().slice(0, 7);
  const target = num((config.targets || {})[agentKey]) || 0;
  const monthCollected = payments.filter((p) => p.agentKey === agentKey && monthKey(p.date) === thisMonth).reduce((s, p) => s + num(p.amount), 0);
  const progressRatio = target > 0 ? monthCollected / target : null;
  const expectedPaceRatio = dayOfMonth / daysInMonth;
  const paceDelta = progressRatio != null ? progressRatio - expectedPaceRatio : 0;

  let key: PetMood['key'] = 'pet_neutral';
  let severity: PetMood['severity'] = null;
  if (progressRatio == null) {
    key = 'pet_neutral';
  } else if (dayOfMonth <= 5 && paceDelta < 0.15) {
    key = 'pet_neutral';
  } else if (paceDelta >= 0.15) {
    key = 'pet_happy';
  } else if (paceDelta >= -0.15) {
    key = 'pet_neutral';
  } else if (paceDelta >= -0.35) {
    key = 'pet_worried';
    severity = 'moderate';
  } else {
    key = 'pet_worried';
    severity = 'severe';
  }
  return { key, severity, progressRatio, paceDelta };
}

export interface PillowPetDisplay {
  img: string;
  bg: string;
  label: string;
  color: string;
  dotClass: 'ok' | 'warn' | 'dgr';
}

const PIPELINE_PET: Record<string, PillowPetDisplay> = {
  pet_happy: { img: '/pet/pet_happy.gif', bg: 'linear-gradient(135deg,#34D399,#059669)', label: 'AHEAD OF PACE', color: '#4ADE80', dotClass: 'ok' },
  pet_neutral: { img: '/pet/pet_neutral.gif', bg: 'linear-gradient(135deg,#3B82F6,#1D4ED8)', label: 'ON PACE', color: '#93C5FD', dotClass: 'ok' },
  pet_worried_moderate: { img: '/pet/pet_worried.gif', bg: 'linear-gradient(135deg,#F59E0B,#B45309)', label: 'BEHIND PACE', color: '#FBBF24', dotClass: 'warn' },
  pet_worried_severe: { img: '/pet/pet_worried.gif', bg: 'linear-gradient(135deg,#DC2626,#7F1D1D)', label: 'CRITICAL', color: '#F87171', dotClass: 'dgr' },
};

export function pipelinePetDisplay(mood: PetMood): PillowPetDisplay {
  const k = mood.key === 'pet_worried' ? `pet_worried_${mood.severity || 'moderate'}` : mood.key;
  return PIPELINE_PET[k] || PIPELINE_PET.pet_neutral;
}

export interface StreakMoodDisplay {
  emoji: string;
  img: string;
  bg: string;
  label: string;
}

export const STREAK_MOOD: Record<string, StreakMoodDisplay> = {
  notStarted: { emoji: '😎', img: '/pet/cool_chill.gif', bg: 'linear-gradient(135deg,#64748B,#475569)', label: "Log today's to-do to wake me up" },
  halfway: { emoji: '🙂', img: '/pet/relieved_happy.gif', bg: 'linear-gradient(135deg,#0D9488,#0369A1)', label: 'Halfway there — keep going' },
  allDone: { emoji: '🎉', img: '/pet/party_idle.gif', bg: 'linear-gradient(135deg,#22C55E,#15803D)', label: "Today's to-do list, cleared!" },
  skipped: { emoji: '😬', img: '/pet/hot_overwhelmed.gif', bg: 'linear-gradient(135deg,#EA580C,#9A3412)', label: "Skipped today's list — try again tomorrow" },
  danger: { emoji: '😨', img: '/pet/shocked.gif', bg: 'linear-gradient(135deg,#DC2626,#7F1D1D)', label: "Don't let it break!" },
  justBroken: { emoji: '😭', img: '/pet/crying_hard.gif', bg: 'linear-gradient(135deg,#B91C1C,#78350F)', label: 'Streak broken — start a new one today' },
  zero: { emoji: '😎', img: '/pet/cool_chill.gif', bg: 'linear-gradient(135deg,#0EA5E9,#0284C7)', label: "Let's start a streak" },
  building: { emoji: '😅', img: '/pet/relieved_happy.gif', bg: 'linear-gradient(135deg,#2563EB,#1D4ED8)', label: 'Keep it going' },
  growing: { emoji: '😂', img: '/pet/laughing_joy.gif', bg: 'linear-gradient(135deg,#FB923C,#EC4899)', label: 'Really building now' },
  solid: { emoji: '🔥', img: '/pet/fire_animated.gif', bg: 'linear-gradient(135deg,#F59E0B,#D97706)', label: 'On fire' },
  legendary: { emoji: '👽', img: '/pet/alien.gif', bg: 'linear-gradient(135deg,#7C3AED,#0EA5E9)', label: 'Legendary' },
  bestMonth: { emoji: '💯', img: '/pet/hundred.gif', bg: 'linear-gradient(135deg,#DC2626,#EAB308)', label: 'Best month yet — keep it up' },
  peakPerformance: { emoji: '🤯', img: '/pet/mindblown.gif', bg: 'linear-gradient(135deg,#FACC15,#7C3AED)', label: 'Peak performance — best month of a legendary streak' },
};

export function computeStreakMoodKey(
  streakLen: number,
  todayMet: boolean,
  monthRiskTier: MonthlyRisk['tier'],
  justBrokeStreak: boolean,
  isBestMonthEver: boolean,
  todayProgress: TodayProgress,
  workEndTime: string,
): string {
  const nowHHMM = new Date().toISOString().slice(11, 16);
  const deadlinePassed = nowHHMM > (workEndTime || '17:00');
  if (!deadlinePassed) return todayProgress || 'notStarted';
  if (!todayMet) {
    if (justBrokeStreak) return 'justBroken';
    return streakLen > 0 ? 'danger' : 'zero';
  }
  if (streakLen >= 30) {
    if (monthRiskTier === 'critical') return 'solid';
    return isBestMonthEver ? 'peakPerformance' : 'legendary';
  }
  if (streakLen >= 7) return isBestMonthEver ? 'bestMonth' : 'solid';
  if (streakLen >= 4) return 'growing';
  if (streakLen >= 1) return 'building';
  return 'zero';
}

export function isBestCollectedMonthEver(payments: Payment[], agentKey: string): boolean {
  const byMonth: Record<string, number> = {};
  payments
    .filter((p) => p.agentKey === agentKey)
    .forEach((p) => {
      const mk = monthKey(p.date);
      byMonth[mk] = (byMonth[mk] || 0) + num(p.amount);
    });
  const thisMonth = today().slice(0, 7);
  const priorMonths = Object.keys(byMonth).filter((mk) => mk !== thisMonth);
  if (!priorMonths.length) return false;
  const thisVal = byMonth[thisMonth] || 0;
  return thisVal > 0 && thisVal > Math.max(...priorMonths.map((mk) => byMonth[mk]));
}

export function riskMoodLabel(risk: MonthlyRisk, unpaidThisMonthCount: number): string {
  if (unpaidThisMonthCount > 0) {
    return `${unpaidThisMonthCount} monthly-plan client${unpaidThisMonthCount === 1 ? '' : 's'} haven't paid yet this month`;
  }
  if (risk.tier === 'on track') return "On pace to hit this month's target";
  if (risk.tier === 'at risk') return "Falling behind this month's target";
  return `${risk.daysLeft} day${risk.daysLeft === 1 ? '' : 's'} left — act now`;
}
