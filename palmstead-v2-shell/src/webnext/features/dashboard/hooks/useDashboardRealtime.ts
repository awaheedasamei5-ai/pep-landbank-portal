"use client";

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSupabaseClient } from '../../../data/client';
import { useSessionStore } from '../../../auth/useSessionStore';

// Genuine cross-device/cross-tab live sync for every dashboard number
// this app shows -- mounted once at the app-shell level (same reasoning
// as useChatRealtime: a number must update even when the screen that
// "owns" that data isn't the one currently open, e.g. Elias completing
// a todo on his phone should move Manager Home's numbers on a manager's
// laptop without anyone refreshing). schedule_items/leads/payments/
// leave_requests are all already in the supabase_realtime publication
// (confirmed live via pg_publication_tables, no migration needed --
// same as messages was for Chat).
//
// Agents get a filtered subscription (their own schedule_items/leads/
// payments only, cheaper and enough for their own dashboard); managers
// get an unfiltered one, since Manager Home's company-wide KPIs need to
// react to ANY agent's change. TanStack Query's invalidateQueries does
// prefix matching on the query key array, so invalidating e.g.
// ['pipelineSummary'] correctly catches every agent-specific cached
// variant (['pipelineSummary', 'elias'], ['pipelineSummary', 'emmanuel']...)
// without needing to know which ones are actually cached right now.
export function useDashboardRealtime() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  const queryClient = useQueryClient();
  const myKey = profile?.key ?? '';
  const isManager = profile?.role === 'manager';

  useEffect(() => {
    if (demoMode || !myKey) return;
    const client = getSupabaseClient();
    if (!client) return;

    const invalidateTodos = () => {
      queryClient.invalidateQueries({ queryKey: ['todayTodos'] });
      queryClient.invalidateQueries({ queryKey: ['todayStreak'] });
    };
    const invalidatePipeline = () => {
      queryClient.invalidateQueries({ queryKey: ['pipelineSummary'] });
      queryClient.invalidateQueries({ queryKey: ['todayStreak'] });
      queryClient.invalidateQueries({ queryKey: ['myCommission'] });
      queryClient.invalidateQueries({ queryKey: ['managerOverview'] });
      queryClient.invalidateQueries({ queryKey: ['companyCommission'] });
      queryClient.invalidateQueries({ queryKey: ['leadsAll'] });
      queryClient.invalidateQueries({ queryKey: ['reportsLeads'] });
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
      // Master Spec Section 4's realtime gap: My Pipeline/Pipeline Detail/
      // Log Payment/Archived Leads all read their own query keys, none of
      // which the dashboard bridge used to touch -- a payment approved on
      // one device previously left every other open session's pipeline
      // screens stale until a manual refresh, even though the dashboard's
      // own KPI numbers already updated live.
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead'] });
      queryClient.invalidateQueries({ queryKey: ['leadsArchived'] });
      queryClient.invalidateQueries({ queryKey: ['paymentsPending'] });
      queryClient.invalidateQueries({ queryKey: ['paymentsNeedsCorrection'] });
      queryClient.invalidateQueries({ queryKey: ['activityForLead'] });
      queryClient.invalidateQueries({ queryKey: ['auditForLead'] });
    };
    const invalidateLeave = () => {
      queryClient.invalidateQueries({ queryKey: ['leaveRequests'] });
      // useColleagueAvailability.ts (Ops Tracker's My Day assign-task flow)
      // reads leave_requests directly but has its own 5-minute staleTime --
      // without this, a leave request approved on one device wouldn't show
      // up in an already-open Assign Task modal on another until it expired
      // on its own.
      queryClient.invalidateQueries({ queryKey: ['colleagueAvailability'] });
    };
    const invalidateImports = () => {
      queryClient.invalidateQueries({ queryKey: ['importBatches'] });
    };
    // Real gap found 2026-09-05, user-reported: "is the ops tracker even in
    // sync with other apps... do they talk to each other" prompted a full
    // audit -- allocation_requests/plots was the sharpest hit: two staff in
    // the small allocate-capable pool (manager/elias/emmanuel) could each
    // be looking at the same "Pending" request or "Available" plot and act
    // on it before either screen refreshed, risking the same physical plot
    // being confirmed to two different clients. Subscribed unfiltered for
    // everyone (not just managers) since an agent mid-request is exactly
    // who needs to see a plot go stale under them. Not per-agent filtered
    // on the channel -- invalidation only triggers a normal, still
    // RLS-scoped refetch, so there's no data exposure in skipping that.
    const invalidateAllocations = () => {
      queryClient.invalidateQueries({ queryKey: ['allocationRequests'] });
      queryClient.invalidateQueries({ queryKey: ['plots'] });
    };
    const invalidateContracts = () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['contractRequests'] });
    };
    const invalidateReferrals = () => {
      queryClient.invalidateQueries({ queryKey: ['referrals'] });
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
    };
    const invalidatePermissions = () => {
      // Real key is ['permissionOverrides', demoMode] (usePermissions.ts) --
      // prefix-matching on just the first element still catches both the
      // true/false demoMode variants without needing to know which is cached.
      queryClient.invalidateQueries({ queryKey: ['permissionOverrides'] });
    };
    // Real user ask (2026-09-05): "enquiries/complaints are supposed to
    // reach the person theyre assigned to and management... memos too
    // need to reach the person its been written to in real time... all
    // attendants need to go to management in real time." Complaints/
    // memos/attendance_log were confirmed already scoped correctly at the
    // query level (or fixed the same day, complaints' owner-reassignment
    // path) -- they were just never pushed live before.
    const invalidateComplaints = () => {
      queryClient.invalidateQueries({ queryKey: ['complaints'] });
    };
    const invalidateEnquiries = () => {
      queryClient.invalidateQueries({ queryKey: ['enquiries'] });
    };
    const invalidateMemos = () => {
      queryClient.invalidateQueries({ queryKey: ['memos'] });
    };
    const invalidateAttendance = () => {
      queryClient.invalidateQueries({ queryKey: ['attendanceToday'] });
      queryClient.invalidateQueries({ queryKey: ['attendanceHistory'] });
      queryClient.invalidateQueries({ queryKey: ['attendanceAllToday'] });
    };
    // Master Spec 11.3's Praise/Warning -- a manager on one device issuing
    // one should update another manager's Management dashboard live, and
    // land in the affected staff member's own attendance view without a
    // refresh, same live-everything push as attendance_log got 2026-09-05.
    const invalidateAttendanceNotes = () => {
      queryClient.invalidateQueries({ queryKey: ['attendanceNotes'] });
    };
    // Real gap found while building the delete feature (2026-09-11, user
    // ask: "site visit, site visit experience... apps, we would be able
    // to delete logged data from our apps and it effects at the other
    // ends of the system in real time"): site_visits and the SVE tables
    // were never in this bridge at all -- a visit logged, cancelled, or
    // an SVE submission/invite created on one device left every other
    // open session's Site Visits/SVE screens stale until a manual
    // refresh, unlike every other app here.
    const invalidateSiteVisits = () => {
      queryClient.invalidateQueries({ queryKey: ['siteVisits'] });
      queryClient.invalidateQueries({ queryKey: ['weekSiteVisits'] });
      queryClient.invalidateQueries({ queryKey: ['siteVisitsForLead'] });
    };
    const invalidateSve = () => {
      queryClient.invalidateQueries({ queryKey: ['sveVisits'] });
      queryClient.invalidateQueries({ queryKey: ['sveDayReport'] });
      queryClient.invalidateQueries({ queryKey: ['sveDayReports'] });
    };

    const channel = client.channel(`dashboard-${myKey}`);
    if (isManager) {
      channel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_items' }, invalidateTodos)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, invalidatePipeline)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, invalidatePipeline);
    } else {
      channel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_items', filter: `owner_key=eq.${myKey}` }, invalidateTodos)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'leads', filter: `agent_key=eq.${myKey}` }, invalidatePipeline)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'payments', filter: `agent_key=eq.${myKey}` }, invalidatePipeline);
    }
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'leave_requests' }, invalidateLeave);
    if (isManager) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'import_batches' }, invalidateImports);
    }
    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'allocation_requests' }, invalidateAllocations)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plots' }, invalidateAllocations)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contracts' }, invalidateContracts)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contract_requests' }, invalidateContracts)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'referrals' }, invalidateReferrals);
    if (isManager) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'staff_permission_overrides' }, invalidatePermissions);
    }
    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'complaints' }, invalidateComplaints)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'enquiries' }, invalidateEnquiries)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'memos' }, invalidateMemos)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'memo_recipients' }, invalidateMemos)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_log' }, invalidateAttendance)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_notes' }, invalidateAttendanceNotes)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'site_visits' }, invalidateSiteVisits)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'site_visit_experience_invites' }, invalidateSve)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'site_visit_experience_submissions' }, invalidateSve)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sve_day_reports' }, invalidateSve);
    channel.subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [demoMode, myKey, isManager, queryClient]);
}
