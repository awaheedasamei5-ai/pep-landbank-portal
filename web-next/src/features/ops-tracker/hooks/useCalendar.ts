import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import type { NewMeeting } from '../../../types/domain';

// Master Spec 10.1's Week/Month Calendar and Team Schedule views, and
// 10.3's Meetings -- all read/write the same schedule_items table
// useTasks.ts/useTodayTodos.ts already own, just over a date range or
// company-wide instead of one day/one person.
export function useMyScheduleRange(fromDate: string, toDate: string) {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const agentKey = profile?.key ?? '';
  return useQuery({
    queryKey: ['scheduleRange', agentKey, fromDate, toDate],
    enabled: !!agentKey,
    queryFn: () => getDataSource(demoMode).scheduleItems.listForAgentInRange(agentKey, fromDate, toDate),
  });
}

// Manager-only (Team Schedule) -- gated client-side like every other
// company-wide list in this app; real RLS backs it up regardless.
export function useTeamScheduleRange(fromDate: string, toDate: string) {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({
    queryKey: ['scheduleRangeAll', fromDate, toDate],
    queryFn: () => getDataSource(demoMode).scheduleItems.listAllInRange(fromDate, toDate),
  });
}

export function useMyMeetings(fromDate: string, toDate: string) {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const agentKey = profile?.key ?? '';
  return useQuery({
    queryKey: ['meetings', agentKey, fromDate, toDate],
    enabled: !!agentKey,
    queryFn: () => getDataSource(demoMode).scheduleItems.listMeetingsForAgent(agentKey, fromDate, toDate),
  });
}

export function useMeetingInvitees(scheduleItemId: string | null) {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({
    queryKey: ['meetingInvitees', scheduleItemId],
    queryFn: () => getDataSource(demoMode).scheduleItemInvitees.listForItem(scheduleItemId as string),
    enabled: !!scheduleItemId,
  });
}

// Real conflict detection (Master Spec 10.3: "detect schedule conflicts
// before save") via the check_schedule_conflicts() SECURITY DEFINER
// function -- a mutation (called explicitly before create, not a query)
// since it's meant to run once, right before the organizer commits.
export function useCheckScheduleConflicts() {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useMutation({
    mutationFn: ({ staffKeys, date, startTime, endTime, excludeId }: { staffKeys: string[]; date: string; startTime: string; endTime: string; excludeId?: string }) =>
      getDataSource(demoMode).scheduleItems.checkConflicts(staffKeys, date, startTime, endTime, excludeId),
  });
}

export function useCreateMeeting() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewMeeting) => {
      const ds = getDataSource(demoMode);
      const meeting = await ds.scheduleItems.createMeeting(profile?.key ?? '', profile?.name ?? '', input);
      // Master Spec 10.3: "Reminder settings: in-app and optional SMS" --
      // the invite itself is the first reminder, sent the same real
      // in-app-notify + best-effort-SMS way every other cross-staff event
      // in this app already uses.
      const staff = await ds.staff.list().catch(() => []);
      const invitees = staff.filter((s) => input.inviteeKeys.includes(s.key));
      if (invitees.length > 0) {
        const body = `${profile?.name ?? 'A colleague'} invited you to "${input.title}" on ${input.date} at ${input.startTime}${input.meetingLocation ? ` — ${input.meetingLocation}` : ''}.`;
        ds.notifications.notify(profile?.key ?? '', profile?.name ?? '', invitees.map((s) => s.key), body, 'meeting_invite', 'schedule_item', meeting.id).catch(() => {});
        invitees.forEach((s) => {
          if (s.phone) ds.sms.send(s.phone, body, 'meeting_invite', profile?.key ?? null).catch(() => {});
        });
      }
      return meeting;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      queryClient.invalidateQueries({ queryKey: ['scheduleRange'] });
      queryClient.invalidateQueries({ queryKey: ['scheduleRangeAll'] });
    },
  });
}

export function useRespondToMeeting() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ inviteeId, status }: { inviteeId: string; status: 'accepted' | 'declined' }) => getDataSource(demoMode).scheduleItemInvitees.respond(inviteeId, status),
    onSuccess: (_r, { inviteeId }) => queryClient.invalidateQueries({ queryKey: ['meetingInvitees'], exact: false }).then(() => inviteeId),
  });
}
