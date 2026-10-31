"use client";

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { buildLeaveLetterText } from '../lib/leaveLetterPdf';
import { requireLeaveSelectionYear } from '../lib/leaveDates';
import { fmtLongDate } from '../../../shared/lib/format';
import type { LeaveRequest, NewLeaveRequest } from '../../../types/domain';

export function useCanDecideLeave(): boolean {
  const profile = useSessionStore((s) => s.profile);
  return profile?.role === 'manager';
}

// Staff request reads are owner-scoped by RLS; Management can read the
// company queue. Coworker availability comes from a separate RPC that
// returns dates only, so the calendar never needs another employee's
// letter, reason, name, or manager note.
export function useLeaveRequests() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profileKey = useSessionStore((s) => s.profile?.key);
  return useQuery({
    queryKey: ['leaveRequests', profileKey],
    queryFn: () => getDataSource(demoMode).leaveRequests.list(),
    refetchInterval: 30_000,
    enabled: !!profileKey,
  });
}

// Date-only team availability is returned by a bounded SECURITY DEFINER RPC.
// It keeps the staff calendar useful while request reasons, letters, names,
// and management notes stay private under the Leave row policy.
export function useLeaveConflictDates(year: number, excludeRequestId?: string) {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profileKey = useSessionStore((s) => s.profile?.key);
  return useQuery({
    queryKey: ['leaveConflictDates', profileKey, year, excludeRequestId ?? null],
    queryFn: () => getDataSource(demoMode).leaveRequests.conflictDates(`${year}-01-01`, `${year}-12-31`, excludeRequestId),
    staleTime: 30_000,
    refetchInterval: 30_000,
    enabled: !!profileKey,
  });
}

// Phase 6 (C2.7) -- a single agent's today-status, for a soft warning
// elsewhere in the app (Allocations) before work gets assigned. Same
// SECURITY DEFINER RPC discipline as useLeaveConflictDates above: works
// for any authenticated viewer, not just Management, and never exposes
// the agent's actual leave reason/letter.
export function useIsAgentOnLeaveToday(agentKey: string | undefined, dateIso: string) {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profileKey = useSessionStore((s) => s.profile?.key);
  return useQuery({
    queryKey: ['isAgentOnLeaveToday', agentKey, dateIso],
    queryFn: () => getDataSource(demoMode).leaveRequests.isOnLeaveOn(agentKey as string, dateIso),
    enabled: !!profileKey && !!agentKey,
    staleTime: 30_000,
  });
}

// The database commits the request, recipient inbox messages, and SMS outbox
// together. Keeping notification sends off the client avoids lost messages
// when a tab closes and duplicates when an action is retried.
export function useCreateLeaveRequest() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const agentKey = profile?.key ?? '';
  const agentName = profile?.name ?? '';
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewLeaveRequest) => {
      const ds = getDataSource(demoMode);
      const request = await ds.leaveRequests.create(agentKey, agentName, input);
      return request;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leaveRequests'] }),
  });
}

// V1's real "planned -> pending" transition -- a private draft only
// enters the decision queue when explicitly sent or automatically due.
// Database triggers create the corresponding notifications.
export function useSendPlannedLeave() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const ds = getDataSource(demoMode);
      const request = await ds.leaveRequests.sendPlanned(id);
      return request;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leaveRequests'] }),
  });
}

// V1's real delete-planned action -- only a still-'planned' request may
// be removed outright (a submitted one must be declined/rescheduled by
// Management instead, never silently deleted by the staff member).
export function useDeletePlannedLeave() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getDataSource(demoMode).leaveRequests.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leaveRequests'] }),
  });
}

// Plan Part 1: "every decision generates a notification" (SMS + in-app),
// both outcomes. Reschedule is its own hook below (useRescheduleLeaveRequest)
// -- V1's own real split between approve/decline and reschedule, which has
// two distinct outcomes decide() can't express.
export function useDecideLeaveRequest() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      outcome,
      agentKey,
      agentName,
      daysCount,
      year,
      note,
      deductQuota,
    }: {
      id: string;
      outcome: 'approved' | 'declined';
      agentKey: string;
      agentName: string;
      daysCount: number;
      year: number;
      note?: string;
      deductQuota?: boolean;
    }) => {
      const ds = getDataSource(demoMode);
      const result = await ds.leaveRequests.decide(id, outcome, profile?.key ?? '', profile?.name ?? '', profile?.signatureData ?? null, note, deductQuota);
      ds.audit
        .log(
          `leave.${outcome}`,
          'info',
          `${agentName}'s leave request (${daysCount} day(s), ${year}) was ${outcome}${note ? ` — ${note}` : ''}`,
          { agentKey, daysCount, year, deductQuota: deductQuota ?? true },
          'leave_request',
          id,
        )
        .catch(() => {});
      return result;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leaveRequests'] }),
  });
}

// V1's real reschedule (Plan Part 1: "reschedule means Management enters
// a new date plus a reason, and that request's actual dates change -- a
// real data mutation, not a status relabel"): two real outcomes
// depending on whether Management supplied replacement dates. newDates
// given -- approves+signs the request in the same action; newDates
// omitted -- goes to 'rescheduled', keeps its reserved days, and the staff
// member supplies replacement dates on the same request.
export function useRescheduleLeaveRequest() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      note,
      newDates,
      deductQuota,
      agentKey,
      agentName,
      daysCount,
      year,
    }: {
      id: string;
      note?: string;
      newDates: string[] | null;
      deductQuota?: boolean;
      agentKey: string;
      agentName: string;
      daysCount: number;
      year: number;
    }) => {
      const ds = getDataSource(demoMode);
      const result = await ds.leaveRequests.reschedule(id, note, newDates, profile?.key ?? '', profile?.name ?? '', profile?.signatureData ?? null, deductQuota);
      const approvedWithNewDates = !!(newDates && newDates.length);
      ds.audit
        .log(
          approvedWithNewDates ? 'leave.rescheduled_approved' : 'leave.reschedule_requested',
          'info',
          approvedWithNewDates
            ? `${agentName}'s leave request was rescheduled to ${newDates.map(fmtLongDate).join(', ')} and approved${note ? ` — ${note}` : ''}`
            : `${agentName} was asked to reschedule their leave request (${daysCount} day(s), ${year})${note ? ` — ${note}` : ''}`,
          { agentKey, daysCount, year, newDates },
          'leave_request',
          id,
        )
        .catch(() => {});
      return result;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leaveRequests'] }),
  });
}

// Genuinely no V1 precedent (Plan Part 1's real gap list). User rule:
// leave must not read as "used" until the dates have passed AND the
// staff member actively confirms they took it -- only the requester can
// confirm their own leave (RLS: leave_requests_upd allows agent_key =
// my_key()).
// Real request-detail history (leave_request_logs, never read anywhere
// until the detail page) -- one row per status change, written by a
// trigger, not by the client.
export function useLeaveRequestLogs(requestId: string | null) {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profileKey = useSessionStore((s) => s.profile?.key);
  return useQuery({
    queryKey: ['leaveRequestLogs', profileKey, requestId],
    queryFn: () => getDataSource(demoMode).leaveRequests.logs(requestId as string),
    enabled: !!requestId && !!profileKey,
  });
}

// Edit a still-'planned' draft's dates -- same scope as delete-planned
// (useDeletePlannedLeave): only ever offered while status is 'planned',
// never a request already sent to Management.
export function useUpdatePlannedLeave() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  const { data: config } = useConfig();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dates }: { id: string; dates: string[] }) => {
      const letterText = profile ? buildLeaveLetterText(profile.name, dates.slice().sort(), requireLeaveSelectionYear(dates), config?.quoteCompanyName) : null;
      return getDataSource(demoMode).leaveRequests.updatePlanned(id, { dates, letterText });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leaveRequests'] }),
  });
}

export function useSubmitRescheduledLeave() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dates }: { id: string; dates: string[] }) => {
      if (!profile) throw new Error('Your staff profile could not be loaded. Sign in again and retry.');
      const ds = getDataSource(demoMode);
      const sortedDates = [...dates].sort();
      // Replacement dates amend the schedule, not the applicant's original
      // letter. Retain emergency reasons and any reviewed staff wording.
      const request = await ds.leaveRequests.updateRescheduledByStaff(id, { dates: sortedDates });
      return request;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leaveRequests'] }),
  });
}

export function useConfirmLeaveUsed() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (request: LeaveRequest) => {
      const ds = getDataSource(demoMode);
      const result = await ds.leaveRequests.confirmUsed(request.id);
      ds.audit
        .log('leave.confirmed_used', 'info', `${profile?.name ?? request.agentName} confirmed they took their leave (${request.daysCount} day(s), ${request.year})`, { agentKey: request.agentKey, daysCount: request.daysCount, year: request.year }, 'leave_request', request.id)
        .catch(() => {});
      return result;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leaveRequests'] }),
  });
}
