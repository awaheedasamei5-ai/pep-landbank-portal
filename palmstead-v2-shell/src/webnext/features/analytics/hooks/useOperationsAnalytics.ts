import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { requireSupabase } from '@/lib/supabase.client';
import { today, shiftMonth, monthKey } from '../../../shared/lib/format';

function pctDelta(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

interface ScheduleItemRow {
  kind: 'task' | 'todo';
  status: string;
  due_date: string | null;
  completed_at: string | null;
}

// docs/plans/27-analytics-v2-cross-app-plan.md -- real Operations
// Tracker tab. `schedule_items` is confirmed this session to mirror
// `op_issues`/`op_todos` 1:1 (same real counts), so this reads it
// directly rather than joining through op_issues/op_states -- the same
// real data Leaderboard's own tasks/todos scoring already uses.
export function useOperationsAnalytics() {
  const thisM = today().slice(0, 7);
  const lastM = shiftMonth(thisM, -1);

  const query = useQuery({
    queryKey: ['analyticsOperations'],
    queryFn: async () => {
      const sb = requireSupabase();
      const { data, error } = await sb.from('schedule_items').select('kind,status,due_date,completed_at').in('kind', ['task', 'todo']);
      if (error) throw error;
      return (data ?? []) as ScheduleItemRow[];
    },
  });

  const metrics = useMemo(() => {
    const rows = query.data ?? [];
    const todayIso = today();
    const open = rows.filter((r) => r.status === 'open');
    const overdue = open.filter((r) => r.due_date && r.due_date < todayIso);
    const completedThisMonth = rows.filter((r) => r.completed_at && monthKey(r.completed_at) === thisM).length;
    const completedLastMonth = rows.filter((r) => r.completed_at && monthKey(r.completed_at) === lastM).length;
    const total = rows.length;
    const doneTotal = rows.filter((r) => r.status === 'done').length;
    const completionRate = total ? Math.round((doneTotal / total) * 100) : 0;
    return {
      open: open.length,
      overdue: overdue.length,
      completed: { current: completedThisMonth, previous: completedLastMonth, deltaPct: pctDelta(completedThisMonth, completedLastMonth) },
      completionRate,
    };
  }, [query.data, thisM, lastM]);

  return { isLoading: query.isLoading, metrics };
}
