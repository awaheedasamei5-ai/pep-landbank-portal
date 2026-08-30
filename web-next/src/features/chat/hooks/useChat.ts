import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { getSupabaseClient } from '../../../data/client';
import { useSessionStore } from '../../../auth/useSessionStore';

function useMyKey(): string {
  const profile = useSessionStore((s) => s.profile);
  return profile?.key ?? '';
}

export function useConversations() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const myKey = useMyKey();
  return useQuery({ queryKey: ['chatConversations', myKey], enabled: !!myKey, queryFn: () => getDataSource(demoMode).chat.listConversations(myKey) });
}

export function useThread(otherKey: string) {
  const demoMode = useSessionStore((s) => s.demoMode);
  const myKey = useMyKey();
  return useQuery({
    queryKey: ['chatThread', myKey, otherKey],
    enabled: !!myKey && !!otherKey,
    queryFn: () => getDataSource(demoMode).chat.listThread(myKey, otherKey),
    // Keeps a thread reasonably fresh even without a realtime push
    // (demo mode has no realtime at all -- this is its only "live" feel).
    refetchInterval: 4000,
  });
}

export function useSendMessage() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  const myKey = profile?.key ?? '';
  const myName = profile?.name ?? '';
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ otherKey, body, replyToId }: { otherKey: string; body: string; replyToId?: string | null }) => getDataSource(demoMode).chat.send(myKey, myName, otherKey, body, replyToId),
    onSuccess: (_data, { otherKey }) => {
      queryClient.invalidateQueries({ queryKey: ['chatThread', myKey, otherKey] });
      queryClient.invalidateQueries({ queryKey: ['chatConversations', myKey] });
    },
  });
}

export function useMarkThreadRead(otherKey: string) {
  const demoMode = useSessionStore((s) => s.demoMode);
  const myKey = useMyKey();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => getDataSource(demoMode).chat.markThreadRead(myKey, otherKey),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['chatConversations', myKey] }),
  });
}

// Genuinely new capability for web-next -- every other feature this
// session polls/refetches on demand, nothing has used Supabase Realtime
// until now. `messages` is already in the supabase_realtime publication
// (confirmed live), so this needs no migration, just a subscription.
// Two separate postgres_changes registrations because a Realtime filter
// is a single `column=eq.value` -- catching both "a new message arrived
// for me" and "my sent message just got marked read" needs both
// directions watched independently. Mounted once at the app-shell level
// (not per-screen) so conversation-list badges update even when Chat
// itself isn't open, matching index.html's ensureChatSubscribed().
export function useChatRealtime() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const myKey = useMyKey();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (demoMode || !myKey) return;
    const client = getSupabaseClient();
    if (!client) return;

    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ['chatConversations', myKey] });
      queryClient.invalidateQueries({ queryKey: ['chatThread', myKey] });
    };

    const channel = client
      .channel(`chat-${myKey}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `recipient_key=eq.${myKey}` }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `sender_key=eq.${myKey}` }, invalidate)
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [demoMode, myKey, queryClient]);
}
