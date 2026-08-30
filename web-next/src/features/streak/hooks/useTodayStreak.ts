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
// V2 adds the real write-back the old app always did (apiUpsertMyStreakToday)
// and Phase 1 explicitly deferred: today's row is now genuinely persisted via
// ds.streaks.markToday() on every read, same as the original. What's
// deliberately different from the original is what that write is allowed to
// do to the headline number -- see the comment on computeRunningStreakLength.
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
      const t = today();
      const [leads, payments, todayTodos, siteVisits, config] = await Promise.all([
        ds.leads.listForAgent(agentKey),
        ds.payments.listForAgent(agentKey),
        ds.scheduleItems.listForAgentOnDate(agentKey, t),
        ds.siteVisits.listForAgent(agentKey),
        ds.config.get(),
      ]);

      // todayMet mirrors index.html's todoLogged flag: >=1 todo logged today,
      // regardless of completion. leadAdded/siteVisitBooked are recorded for
      // the same reasons the old app tracked them (activity signal, not
      // streak-breaking on their own -- only todoLogged decides dayMet).
      const todayMet = todayTodos.length > 0;
      const leadAdded = leads.some((l) => l.date === t);
      const siteVisitBooked = siteVisits.some((v) => v.visitDate === t);
      await ds.streaks.markToday(agentKey, { todoLogged: todayMet, leadAdded, siteVisitBooked });
      const history = await ds.streaks.history(agentKey, 60);

      // streakLen never counts today (see computeRunningStreakLength), so it
      // already reads as "the streak as of yesterday" -- a break happening
      // TODAY (today unmet, once computeStreakMoodKey's own deadline check
      // allows it) shows as 'justBroken' precisely when that prior streak was
      // real (>=3), not a separate "before vs after" comparison.
      const streakLen = computeRunningStreakLength(history);
      const justBrokeStreak = streakLen >= 3 && !todayMet;
      const risk = computeMonthlyRisk(leads, agentKey, config);
      const isBestMonthEver = isBestCollectedMonthEver(payments, agentKey);
      const todayProgress = computeTodayTodoProgress(todayTodos);

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
