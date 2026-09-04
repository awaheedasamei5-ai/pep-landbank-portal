import { useMutation } from '@tanstack/react-query';
import { getSupabaseClient } from '../../../data/client';

// Real LLM-expanded task description -- kind='task_description_draft' on
// the shared ai-insights function. Only the title/category/priority the
// creator already typed/picked cross the wire -- no assignee name, no
// client data of any kind, so there's nothing here for redactPII to do.
export function useTaskDescriptionDraft() {
  return useMutation({
    mutationFn: async (input: { title: string; category?: string; priority?: string }) => {
      const client = getSupabaseClient();
      if (!client) return null;
      const { data, error } = await client.functions.invoke('ai-insights', {
        body: { kind: 'task_description_draft', context: { title: input.title, category: input.category ?? null, priority: input.priority ?? null } },
      });
      if (error) throw error;
      return (data as { message?: string } | null)?.message ?? null;
    },
  });
}
