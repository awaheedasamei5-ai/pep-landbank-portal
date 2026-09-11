import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSupabaseClient } from '../../../data/client';
import { useSessionStore } from '../../../auth/useSessionStore';

// Real gap found 2026-09-05: schedule_items/schedule_item_invitees/
// task_events/schedule_item_attachments were already added to the
// supabase_realtime publication when this feature was first built, but
// nothing in the app ever actually subscribed to it -- so a task closed
// on one device, a meeting invite accepted by a colleague, or a task
// reassigned by a manager never showed up here without a manual refetch
// (leaving the tab, or the underlying query happening to refire). Same
// pattern as the already-proven useSveRealtime(): one shared channel,
// mounted once at the Operations Tracker shell so every tab benefits,
// invalidating the real query keys every ops-tracker hook actually reads.
export function useOpsTrackerRealtime() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (demoMode) return;
    const client = getSupabaseClient();
    if (!client) return;

    function invalidateScheduleItems() {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['todayTodos'] });
      queryClient.invalidateQueries({ queryKey: ['todayStreak'] });
      queryClient.invalidateQueries({ queryKey: ['scheduleRange'] });
      queryClient.invalidateQueries({ queryKey: ['scheduleRangeAll'] });
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
    }
    function invalidateInvitees() {
      queryClient.invalidateQueries({ queryKey: ['meetingInvitees'] });
    }
    function invalidateEvents() {
      queryClient.invalidateQueries({ queryKey: ['taskEvents'] });
    }
    function invalidateAttachments() {
      queryClient.invalidateQueries({ queryKey: ['taskAttachments'] });
    }

    const channel = client
      .channel('ops-tracker')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_items' }, invalidateScheduleItems)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_item_invitees' }, invalidateInvitees)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_events' }, invalidateEvents)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_item_attachments' }, invalidateAttachments)
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [demoMode, queryClient]);
}
