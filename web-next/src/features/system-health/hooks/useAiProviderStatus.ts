import { useQuery } from '@tanstack/react-query';
import { getSupabaseClient } from '../../../data/client';

// Closes a real, explicitly-named spec gap: Master Spec line 217 lists
// "AI [provider status]" as part of the Admin System Health page, and it
// never existed here. Calls ai-insights with kind='health_check', a fast
// path that reports whether GROQ_API_KEY is set server-side WITHOUT
// spending a real Groq call -- this is a status check, not content
// generation, so no `kind` prompt or system prompt applies.
export function useAiProviderStatus() {
  return useQuery({
    queryKey: ['aiProviderStatus'],
    staleTime: 1000 * 60 * 5,
    retry: false,
    queryFn: async (): Promise<'connected' | 'not_configured' | 'unreachable'> => {
      const client = getSupabaseClient();
      if (!client) return 'unreachable';
      const { data, error } = await client.functions.invoke('ai-insights', { body: { kind: 'health_check' } });
      if (error) return 'unreachable';
      return (data as { configured?: boolean } | null)?.configured ? 'connected' : 'not_configured';
    },
  });
}
