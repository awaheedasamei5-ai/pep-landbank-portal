import { useQuery } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import { today } from '../../../shared/lib/format';
import {
  computeMonthlyRisk,
  computePipelinePetMood,
  computeRunningStreakLength,
  computeStreakMoodKey,
  computeTodayTodoProgress,
  isBestCollectedMonthEver,
  pipelinePetDisplay,
  riskMoodLabel,
  STREAK_MOOD,
  type MonthlyRisk,
  type PetMood,
} from '../lib/moodLogic';

// React-Query port of index.html's evaluateMyStreak() (index.html:10379-10400).
// Streak-continuity writes (apiUpsertMyStreakToday) are out of scope for
// Phase 1 -- this reads demo-seeded history/leads/payments/todos and derives
// the same MY_STREAK shape, but doesn't persist a "today" row back yet.
export interface TodayStreak {
  streakLen: number;
  moodKey: string;
  mood: (typeof STREAK_MOOD)[string];
  petMood: PetMood;
  pet: ReturnType<typeof pipelinePetDisplay>;
  risk: MonthlyRisk;
  riskLabel: string;
  weekHistory: { date: string; dayMet: boolean }[];
}

export function useTodayStreak() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const agentKey = profile?.key ?? '';

  return useQuery<TodayStreak>({
    queryKey: ['todayStreak', agentKey],
    enabled: !!agentKey && profile?.role === 'agent',
    queryFn: async () => {
      const ds = getDataSource(demoMode);
      const [leads, payments, todayTodos, history, config] = await Promise.all([
        ds.leads.listForAgent(agentKey),
        ds.payments.listForAgent(agentKey),
        ds.scheduleItems.listForAgentOnDate(agentKey, today()),
        ds.streaks.history(agentKey, 60),
        ds.config.get(),
      ]);

      const streakLen = computeRunningStreakLength(history, config.workEndTime);
      const priorStreakLen = computeRunningStreakLength(
        history.filter((r) => r.date !== today()),
        config.workEndTime,
      );
      const justBrokeStreak = priorStreakLen >= 3 && streakLen === 0;
      const risk = computeMonthlyRisk(leads, agentKey, config);
      const isBestMonthEver = isBestCollectedMonthEver(payments, agentKey);
      const todayProgress = computeTodayTodoProgress(todayTodos);
      // todayMet mirrors index.html's todoLogged flag (>=1 todo logged today,
      // regardless of completion) -- approximated here from the same
      // schedule_items query since Phase 1 doesn't yet write a live
      // staff_streaks "today" row to read back.
      const todayMet = todayTodos.length > 0;

      const moodKey = computeStreakMoodKey(streakLen, todayMet, risk.tier, justBrokeStreak, isBestMonthEver, todayProgress, config.workEndTime);
      const petMood = computePipelinePetMood(payments, agentKey, config);
      const pet = pipelinePetDisplay(petMood);

      // Simplified proxy for computeAgentActivitySignals()'s unpaidThisMonth
      // detection (the real version needs the installment-schedule engine,
      // out of scope for Phase 1): any lead with a balance and no payment
      // logged this month.
      const thisMonth = today().slice(0, 7);
      const unpaidThisMonthCount = leads.filter((l) => l.amtPaid < l.grandTotal && !payments.some((p) => p.leadId === l.id && p.date.slice(0, 7) === thisMonth)).length;

      return {
        streakLen,
        moodKey,
        mood: STREAK_MOOD[moodKey] ?? STREAK_MOOD.notStarted,
        petMood,
        pet,
        risk,
        riskLabel: riskMoodLabel(risk, unpaidThisMonthCount),
        weekHistory: history.map((h) => ({ date: h.date, dayMet: h.dayMet })),
      };
    },
  });
}
