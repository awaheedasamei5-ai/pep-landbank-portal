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

export function useLeaveRequests() {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({ queryKey: ['leaveRequests'], queryFn: () => getDataSource(demoMode).leaveRequests.list() });
}

// Master Spec 12.5: "Management receives each formal request as it is
// submitted" -- this is the moment of submission, whether that's an
// immediate pending request or a planned one just sent on with
// sendPlanned() below, so both call this. A 'planned' (draft) request is
// deliberately NOT submitted here -- it isn't visible to Management at all
// until the staff member sends it (v1's real private-draft behaviour).
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

// v1's real sendPlannedLeaveNow -- a planned (draft) request only becomes
// visible to Management once explicitly sent on, so that's when the
// notify+SMS fires, same as a fresh pending request.
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

// v1's real delete-planned action -- only a still-'planned' request may be
// removed outright (a submitted one must be declined/rescheduled by
// Management instead, never silently deleted by the staff member).
export function useDeletePlannedLeave() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getDataSource(demoMode).leaveRequests.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leaveRequests'] }),
  });
}

// Master Spec 12.4: "Management may approve or decline with reason...
// every decision generates an audit event and notification." Reschedule is
// its own hook below (useRescheduleLeaveRequest) -- exact port of v1's own
// split between apiDecideLeaveRequest (approve/decline only) and
// apiRescheduleLeaveRequest (index.html:5503-5532). Both real gaps closed
// 2026-09-05: the SMS used to point staff at "Office > Leave Schedules", a
// screen that has never existed anywhere in this app (a dead link in the
// UX) -- now points at the real "Office > Leave" path; and decide() never
// logged anything to audit_events despite every comparable decision flow
// in this app doing so.
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
          id
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

// Exact port of v1's apiRescheduleLeaveRequest (index.html:5513-5532, SMS
// text at 24365/24379): two real outcomes depending on whether Management
// supplied replacement dates. newDates given -- Management picked the
// actual new date(s) themselves, this approves+signs the request in the
// same action and the staff member just gets a confirmation; newDates
// omitted -- Management is only asking for different dates, the request
// goes to 'rescheduled' (a non-blocking status, see leaveIsBlocking()) and
// the staff member has to pick fresh ones themselves via a normal request.
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
          id
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

// New 2026-09-05, genuinely no v1 precedent. User correction: leave must
// not read as "used" until the dates have passed AND the staff member
// actively confirms they took it -- see leaveLogic.ts's leaveDaysReserved/
// leaveDaysConfirmedUsed for why this is a separate concept from the
// entitlement-protecting reserved count. Only the requester can confirm
// their own leave (RLS: leave_requests_upd allows agent_key = my_key()).
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
