import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import type { NewLeaveRequest } from '../../../types/domain';

export function useCanDecideLeave(): boolean {
  const profile = useSessionStore((s) => s.profile);
  return profile?.role === 'manager';
}

export function useLeaveRequests() {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({ queryKey: ['leaveRequests'], queryFn: () => getDataSource(demoMode).leaveRequests.list() });
}

export function useCreateLeaveRequest() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const agentKey = profile?.key ?? '';
  const agentName = profile?.name ?? '';
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewLeaveRequest) => getDataSource(demoMode).leaveRequests.create(agentKey, agentName, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leaveRequests'] }),
  });
}

// Notifies the requesting staff member by SMS once a decision is made --
// matches the real staffMsg text in index.html's approve/decline handlers
// (24248/24277), minus the specific decline reason: web-next's decide()
// doesn't carry one yet (a real, separate gap -- Leave has no decline-
// reason UI/column here today, unlike Log Payment's decline flow).
export function useDecideLeaveRequest() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, approve, agentKey, daysCount, year }: { id: string; approve: boolean; agentKey: string; daysCount: number; year: number }) => {
      const result = await getDataSource(demoMode).leaveRequests.decide(id, approve, profile?.key ?? '', profile?.name ?? '', profile?.signatureData ?? null);
      const staff = await getDataSource(demoMode)
        .staff.listAll()
        .catch(() => []);
      const phone = staff.find((s) => s.key === agentKey)?.phone;
      if (phone) {
        const msg = approve
          ? `Your leave request for ${daysCount} day(s) in ${year} has been approved -- you can now download the signed letter from Office > Leave Schedules.`
          : `Your leave request for ${daysCount} day(s) in ${year} was declined -- open Office > Leave Schedules for details.`;
        getDataSource(demoMode)
          .sms.send(phone, msg, approve ? 'leave_approved' : 'leave_declined', profile?.key ?? null)
          .catch(() => {});
      }
      return result;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leaveRequests'] }),
  });
}
