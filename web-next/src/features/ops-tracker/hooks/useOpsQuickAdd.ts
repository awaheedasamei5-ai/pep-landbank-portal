import { useMutation } from '@tanstack/react-query';
import { getSupabaseClient } from '../../../data/client';
import { redactPII } from '../../../shared/lib/redact';
import { parseOpsTaskFields, resolveDateHint, resolveTimeHint, type ParsedQuickAddFields } from '../lib/opsQuickAddLogic';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface QuickAddResult extends ParsedQuickAddFields {
  resolvedDate: string | null;
  resolvedTime: string | null;
}

// Real user ask: "help u schedule a task." kind='ops_task_parse' only
// extracts which words look like a date/time/priority/category from the
// raw text -- the actual date math (resolveDateHint/resolveTimeHint) runs
// deterministically client-side against the real browser clock, never
// trusted to the model itself. Never auto-creates anything: the caller
// gets back fields to show the user for confirmation/editing before
// useCreateTask/useCreateTodo is ever called, same human-in-the-loop
// discipline every other AI-draft feature in this app already follows.
export function useParseQuickAddTask() {
  return useMutation({
    mutationFn: async (text: string): Promise<QuickAddResult> => {
      const client = getSupabaseClient();
      const today = new Date();
      const fallback: QuickAddResult = { title: text.trim(), dateHint: null, timeHint: null, priorityHint: null, categoryHint: null, resolvedDate: null, resolvedTime: null };
      if (!client) return fallback;
      const { data, error } = await client.functions.invoke('ai-insights', {
        body: { kind: 'ops_task_parse', context: { textRedacted: redactPII(text), todayDayOfWeek: DAY_NAMES[today.getDay()] } },
      });
      if (error) return fallback;
      const message = (data as { message?: string } | null)?.message;
      if (!message) return fallback;
      const parsed = parseOpsTaskFields(message, text.trim());
      return { ...parsed, resolvedDate: resolveDateHint(parsed.dateHint, today), resolvedTime: resolveTimeHint(parsed.timeHint) };
    },
  });
}
