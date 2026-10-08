"use client";

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource, type DataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { fmtLongDate } from '../../../shared/lib/format';
import type { Config, LeaveRequest, NewLeaveRequest } from '../../../types/domain';

export function useCanDecideLeave(): boolean {
  const profile = useSessionStore((s) => s.profile);
  return profile?.role === 'manager';
}

// Real table `leave_requests`: SELECT RLS is genuinely open to any
// signed-in staff member (not agent/manager-scoped) -- V1's own real
// cross-staff "who's on leave" checks work the same way. A 'planned' row
// is the one exception: V1's real private draft, filtered out of every
// other viewer's list client-side (nothing in RLS hides it).
export function useLeaveRequests() {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({ queryKey: ['leaveRequests'], queryFn: () => getDataSource(demoMode).leaveRequests.list() });
}

// V1's real rule: Management is notified the moment a request becomes
// visible to them -- whether that's an immediate pending request or a
// planned one just sent on via sendPlanned() below. A 'planned' (draft)
// request is deliberately NOT notified here -- it isn't visible to
// Management at all until the staff member sends it.
async function notifyManagementOfLeaveRequest(ds: DataSource, config: Config | undefined, agentKey: string, agentName: string, request: LeaveRequest) {
  const managers = await ds.staff.listAll().catch(() => []);
  const toManagers = managers.filter((m) => m.role === 'manager' && m.key !== agentKey);
  const body = `${agentName} submitted a leave request for ${request.daysCount} day(s) in ${request.year}. Review it in Palmstead.`;
  if (toManagers.length > 0) {
    ds.notifications.notify(agentKey, agentName, toManagers.map((m) => m.key), body, 'leave_pending', 'leave_request', request.id).catch(() => {});
  }
  const phones = new Set(toManagers.map((m) => m.phone).filter((p): p is string => !!p));
  if (config?.companyPhone) phones.add(config.companyPhone);
  for (const phone of phones) ds.sms.send(phone, body, 'leave_pending', agentKey).catch(() => {});
}

export function useCreateLeaveRequest() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const { data: config } = useConfig();
  const agentKey = profile?.key ?? '';
  const agentName = profile?.name ?? '';
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewLeaveRequest) => {
      const ds = getDataSource(demoMode);
      const request = await ds.leaveRequests.create(agentKey, agentName, input);
      if (!input.asDraft) notifyManagementOfLeaveRequest(ds, config, agentKey, agentName, request).catch(() => {});
      return request;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leaveRequests'] }),
  });
}

// V1's real "planned -> pending" transition -- a private draft only
// becomes visible to Management once explicitly sent on, so that's when
// the notify+SMS fires, same as a fresh pending request.
export function useSendPlannedLeave() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const { data: config } = useConfig();
  const agentKey = profile?.key ?? '';
  const agentName = profile?.name ?? '';
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const ds = getDataSource(demoMode);
      const request = await ds.leaveRequests.sendPlanned(id);
      notifyManagementOfLeaveRequest(ds, config, agentKey, agentName, request).catch(() => {});
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
      const staff = await ds.staff.listAll().catch(() => []);
      const phone = staff.find((s) => s.key === agentKey)?.phone;
      if (phone) {
        const msg =
          outcome === 'approved'
            ? `Your leave request for ${daysCount} day(s) in ${year} has been approved -- you can view the details in Office > Leave.`
            : `Your leave request for ${daysCount} day(s) in ${year} was declined${note ? `: ${note}` : ''}. Open Office > Leave for details.`;
        ds.sms.send(phone, msg, `leave_${outcome}`, profile?.key ?? null).catch(() => {});
      }
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
// omitted -- goes to 'rescheduled' (a non-blocking status) and the staff
// member picks fresh dates themselves via a normal request.
export function useRescheduleLeaveRequest() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      note,
      newDates,
      agentKey,
      agentName,
      daysCount,
      year,
    }: {
      id: string;
      note?: string;
      newDates: string[] | null;
      agentKey: string;
      agentName: string;
      daysCount: number;
      year: number;
    }) => {
      const ds = getDataSource(demoMode);
      const result = await ds.leaveRequests.reschedule(id, note, newDates, profile?.key ?? '', profile?.name ?? '', profile?.signatureData ?? null);
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
      const staff = await ds.staff.listAll().catch(() => []);
      const phone = staff.find((s) => s.key === agentKey)?.phone;
      if (phone) {
        const msg = approvedWithNewDates
          ? `Management has rescheduled your leave to ${newDates.map(fmtLongDate).join(', ')} and approved it -- you can download the signed letter from Office > Leave.${note ? ` Note: "${note}"` : ''}`
          : `Management has asked you to reschedule your leave request for ${daysCount} day(s) in ${year}: "${note}" -- open Office > Leave to pick new dates.`;
        ds.sms.send(phone, msg, approvedWithNewDates ? 'leave_rescheduled_approved' : 'leave_reschedule_requested', profile?.key ?? null).catch(() => {});
      }
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
