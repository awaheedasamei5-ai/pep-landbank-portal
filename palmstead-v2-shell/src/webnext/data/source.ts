import type { AchievementDef, ActivityLogEntry, AllocationHistoryEvent, AllocationRequest, AttendanceNote, AttendanceRecord, AttendanceReview, AuditEvent, BackupRecord, Banner, BannerStatus, ChatConversation, ChatMessage, Complaint, ComplaintUpdate, Config, Contract, ContractApproval, ContractApprovalStatus, ContractClause, ContractField, ContractFieldScope, ContractGeneration, ContractRequest, ContractSection, ContractTemplate, ContractTemplateVersion, ContractTemplateVersionStatus, DownloadRecord, Enquiry, EnquiryUpdate, FundRequest, ImportBatch, Lead, LeadUpdate, AttendanceException, AttendancePolicy, LeaderboardRow, LeaderboardScoreHistoryEntry, LeaveRequest, NewAttendanceException, NewOfficeLocation, OfficeLocation, ManagerOverview, Memo, NewAllocationRequest, NewBanner, NewComplaint, NewContractClause, NewContractRequest, NewContractTemplate, NewEnquiry, NewFundRequest, NewImportBatch, NewLead, NewLeaveRequest, NewMemo, NewNote, NewPaymentEntry, NewPlot, PaymentMethod, NewReferral, NewSiteVisit, NewTask, Note, Payment, PaymentDecisionResult, PaymentStatus, PermissionDef, PermissionOverride, Plot, PlotUpdate, PricingHistoryEntry, PricingPromotion, Profile, Referral, ReportArchiveEntry, ScheduleItem, ScheduleItemStatus, SignInInput, SignOutInput, SiteVisit, StaffAchievement, StaffInvite, NewMeeting, ScheduleItemAttachment, ScheduleItemInvitee, ScheduleItemPatch, SveDayReport, SveDayReportPatch, SveInviteRecord, SveVisitStatus, StreakRow, TaskEvent, WeeklyVisitForm, WeeklyVisitFormCostPatch } from '../types/domain';
import { deriveStageFromPayment, computeGrandTotal, STAGES } from '../features/pipeline/lib/pipelineLogic';
import { agentPoints } from '../features/manager/lib/leaderboardLogic';
import { today, monthKey, shiftMonth } from '../shared/lib/format';
import { getSupabaseClient } from './client';
import { friendlyErrorObj } from '../shared/lib/friendlyError';
import {
  mapAchievementDefRow,
  mapActivityLogRow,
  mapAllocationRequestRow,
  mapAttendanceComparisonRow,
  mapAttendanceNoteRow,
  mapAttendanceRow,
  mapAttendanceReviewRow,
  mapAuditEventRow,
  mapBackupRow,
  mapBannerRow,
  mapPricingHistoryRow,
  mapPricingPromotionRow,
  mapPermissionDefRow,
  mapPermissionOverrideRow,
  mapFundRequestRow,
  mapWeeklyVisitFormRow,
  mapChatMessageRow,
  mapComplaintRow,
  mapContractRequestRow,
  mapContractApprovalRow,
  mapContractClauseRow,
  mapContractFieldRow,
  mapContractGenerationRow,
  mapContractRow,
  mapContractTemplateRow,
  mapContractTemplateVersionRow,
  mapDownloadRow,
  mapEnquiryRow,
  mapStaffAchievementRow,
  mapAttendanceExceptionRow,
  mapAttendancePolicyRow,
  mapLeaderboardRawRow,
  mapLeaderboardScoreHistoryRow,
  mapLeaderboardScoreRow,
  mapLeadRow,
  mapOfficeLocationRow,
  mapLeaveRequestRow,
  mapMemoRow,
  mapNoteRow,
  mapPaymentRow,
  mapPlotRow,
  mapStaffInviteRow,
  mapProfileRow,
  mapReferralRow,
  mapReportArchiveRow,
  mapScheduleItemAttachmentRow,
  mapScheduleItemInviteeRow,
  mapScheduleItemRow,
  mapSiteVisitRow,
  mapSveDayReportRow,
  mapSveInviteRow,
  mapSveSubmissionRow,
  mapStreakRow,
  mapTaskEventRow,
  mapConfigRow,
  domainStatusToDb,
} from './mappers';

// Shared by leads.update() and the two import-atomicity methods below
// (createWithFollowup/reassignAndUpdate) -- same LeadUpdate-to-column
// mapping either way, factored out so the import path can build one
// merged insert/update statement instead of duplicating this by hand and
// risking drift from the one real, already-battle-tested mapping.
function buildLeadDbPatch(patch: LeadUpdate): Record<string, unknown> {
  const dbPatch: Record<string, unknown> = {};
  if ('name' in patch) dbPatch.name = patch.name;
  if ('contact' in patch) dbPatch.contact = patch.contact;
  if ('plotType' in patch) dbPatch.plot_type = patch.plotType;
  if ('noPlots' in patch) dbPatch.no_plots = patch.noPlots;
  if ('unitPrice' in patch) dbPatch.unit_price = patch.unitPrice;
  if ('discount' in patch) dbPatch.discount = patch.discount;
  if ('netTotal' in patch) dbPatch.net_total = patch.netTotal;
  if ('grandTotal' in patch) dbPatch.grand_total = patch.grandTotal;
  if ('paymentPlan' in patch) dbPatch.payment_plan = patch.paymentPlan;
  if ('amtPaid' in patch) dbPatch.amt_paid = patch.amtPaid;
  if ('stage' in patch) dbPatch.stage = patch.stage;
  if ('nextAction' in patch) dbPatch.next_action = patch.nextAction;
  if ('nextActionDate' in patch) dbPatch.next_action_date = patch.nextActionDate;
  if ('notes' in patch) dbPatch.notes = patch.notes;
  if ('tags' in patch) dbPatch.tags = patch.tags;
  if ('siteVisit' in patch) dbPatch.site_visit = patch.siteVisit;
  if ('depositTarget' in patch) dbPatch.deposit_target = patch.depositTarget;
  if ('priority' in patch) dbPatch.priority = patch.priority;
  if ('leadSource' in patch) dbPatch.lead_source = patch.leadSource;
  if ('bannerId' in patch) dbPatch.banner_id = patch.bannerId;
  if ('address' in patch) dbPatch.address = patch.address;
  if ('kyc' in patch) dbPatch.kyc = patch.kyc;
  if ('amtPaid' in patch && 'grandTotal' in patch) dbPatch.balance = Math.max((patch.grandTotal ?? 0) - (patch.amtPaid ?? 0), 0);
  return dbPatch;
}

// Master Spec 10.2: "Recurring tasks create future instances without
// duplicating history." Advances a date by one recurrence step -- used
// by scheduleItems.updateStatus (both demo and real) when a recurring
// task is closed, to compute the next instance's due date.
function nextRecurrenceDate(dateIso: string, freq: 'daily' | 'weekly' | 'monthly', interval: number): string {
  const d = new Date(`${dateIso}T00:00:00`);
  if (freq === 'daily') d.setDate(d.getDate() + interval);
  else if (freq === 'weekly') d.setDate(d.getDate() + interval * 7);
  else d.setMonth(d.getMonth() + interval);
  return d.toISOString().slice(0, 10);
}

// Small realistic roster for demo mode's staff picker -- names/keys match
// the real staff allowlist this session's schema research surfaced
// repeatedly across plots/site_visits/complaints RLS policies
// ('elias','emmanuel','elizabeth' + a manager), not invented.
// Real amount collected per month, oldest-to-newest, trailing 6 months
// including the current one -- zero-filled for months with no payments,
// never interpolated. Feeds Manager Home's KPI sparkline.
function computeMonthlyTrend(payments: Payment[]): number[] {
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(today().slice(0, 7), i - 5));
  return months.map((mk) => payments.filter((p) => monthKey(p.date) === mk).reduce((s, p) => s + p.amount, 0));
}
export interface ReceivedMemo {
  memo: Memo;
  viaCC: boolean;
  recipientRowId: string | null;
}

// Swappable data-source seam -- every feature hook calls through this, never
// branching on demo-vs-live itself (mirrors index.html's api*() functions,
// which are the only place `if(DEMO_MODE)` ever appears; the UI layer never
// branches). Phase 1 only wires the demo implementation -- live Supabase
// wiring is explicitly deferred to a later phase, but the interface is real
// now so that seam never has to be retrofitted later.
export interface DataSource {
  leads: {
    listForAgent(agentKey: string): Promise<Lead[]>;
    // Company-wide, unfiltered -- the Log Payment lead-picker needs to
    // search across every agent's leads (real RLS lets manager/elias see
    // all leads already, confirmed live; this just doesn't add an
    // agent_key filter on top of that, same reasoning as
    // manager.overview() and sve.listVisitsWithStatus()).
    listAll(): Promise<Lead[]>;
    create(agentKey: string, input: NewLead): Promise<Lead>;
    get(agentKey: string, id: string): Promise<Lead | undefined>;
    // Real RLS carve-out `leads_upd_company` (confirmed live): manager or
    // elias/emmanuel/elizabeth can UPDATE a lead ONLY when its agent_key is
    // literally 'company' -- clients who came to the company directly, not
    // through a specific agent, sit in this shared pool until assigned.
    // Same gate as Plot Inventory (canViewClientDatabase() in index.html).
    listCompany(): Promise<Lead[]>;
    assign(id: string, agentKey: string): Promise<Lead>;
    // This shell only (not real web-next) -- hands a Company Lead to a
    // staff member for follow-up WITHOUT the real ownership transfer
    // assign() above does: agent_key stays 'company', so the lead never
    // enters that staff's personal pipeline. null clears the assignment.
    assignHandler(id: string, agentKey: string | null): Promise<Lead>;
    setSource(id: string, source: string): Promise<Lead>;
    // Phase 2 punch-list item 4: single-statement equivalents of
    // create()+update() / assign()+update(), used by the pipeline import
    // commit so a mid-row failure can never leave a lead half-written
    // (created but missing its follow-up fields). See createWithFollowup's
    // own comment in the live implementation for the full reasoning.
    createWithFollowup(agentKey: string, input: NewLead, followupPatch: LeadUpdate): Promise<Lead>;
    reassignAndUpdate(id: string, agentKey: string | null, patch: LeadUpdate): Promise<Lead>;
    // Plain leads_upd RLS UPDATE (confirmed live, no WITH CHECK) -- matches
    // index.html's apiUpdateLead()/saveUpdate() exactly, including that a
    // NEW payment amount is never part of this patch (that goes through
    // payments.create() separately, so a pending payment can never leak
    // into the lead's running balance before Management approves it).
    update(id: string, patch: LeadUpdate): Promise<Lead>;
    // Real update_lead_doc_stage RPC (SECURITY DEFINER, manager/elias/
    // emmanuel/elizabeth only, confirmed live) -- stage must be one of the
    // 6 real DOC_STAGE keys or the RPC itself rejects it.
    updateDocStage(id: string, stage: string): Promise<void>;
    // Fixed 2026-09-03 (master spec's "Pipeline deletion mismatch" --
    // flagged critical): this used to be a real hard DELETE, which a real
    // ON DELETE CASCADE on allocation_requests/target_selections/
    // payment_reminders_log/client_notifications would have destroyed, and
    // which orphans payments via ON DELETE SET NULL -- all confirmed live.
    // Now a soft delete (sets deleted_at), matching legacy's real
    // apiDeleteLead() exactly, not the hard-DELETE deleteLeadConfirm() UI
    // wrapper this comment used to (wrongly) cite. Vacating an allocated
    // plot on a refund/opt-out delete stays the caller's own responsibility
    // (see PipelineDetailScreen's danger zone). Master Spec Section 4.5:
    // the chosen reason is now actually persisted (deleted_by/
    // deleted_by_name/deletion_reason columns, added 2026-09-06 --
    // previously captured in the UI and silently discarded) so Management
    // can see why a lead was archived, not just that it was.
    remove(id: string, reason: string, deletedBy: string, deletedByName: string): Promise<void>;
    // Manager-only in practice (leads_sel's RLS only lets deleted_at IS NOT
    // NULL rows through for my_role()='manager') -- every archived lead
    // with its deletion reason, newest first.
    listArchived(): Promise<Lead[]>;
    // Clears deleted_at only; deleted_by/deleted_by_name/deletion_reason
    // are left in place as a historical record of the most recent
    // deletion, matching how decidedBy/decidedByName on payments are
    // never cleared either.
    restore(id: string): Promise<Lead>;
  };
  // Real workflow (confirmed live via RLS + the actual production RPCs +
  // reading index.html's own logNewPayment()/applyApprovedPaymentToLead()
  // functions, not guessed): only manager or the 'elias' key can insert a
  // payment at all (payments_ins WITH CHECK). A manager's own entry is
  // immediately 'approved' and this app applies the lead balance/stage
  // recompute itself, matching applyApprovedPaymentToLead() exactly.
  // elias's entry is always 'pending' and touches nothing on the lead
  // until a real manager calls approve()/decline() below -- which must
  // go through the real approve_payment/decline_payment RPCs, never a
  // raw UPDATE, since those RPCs also write activity_log/messages and
  // conditionally create allocation_requests (the latter two are NOT
  // replicated here -- allocation_requests is a distinct, larger
  // unbuilt feature (Plot Allocation), and there's no SMS provider
  // wired anywhere in this app, matching this session's "no free SMS
  // API exists" finding -- both deliberately out of scope for this pass).
  payments: {
    listForAgent(agentKey: string): Promise<Payment[]>;
    // Real bug found while testing the payment-receipt feature: Pipeline
    // Update's payment history used listForAgent(viewerKey), so a manager
    // opening an agent's lead (via Manager Home's drill-down or Company
    // Pipeline) always saw "no payments" even when real ones existed --
    // filtering by the VIEWER's own key, not the lead being looked at. No
    // agent_key filter needed here: real payments_sel RLS already scopes
    // a non-privileged caller to agent_key = my_key() on its own, so
    // filtering by lead_id alone is correct for every caller, not just
    // manager/allowlist staff (same reasoning that let useLead's fix work
    // without a live-side query change either).
    listForLead(leadId: string): Promise<Payment[]>;
    // Unfiltered on purpose, same reasoning as listForLead above -- real
    // payments_sel RLS already scopes correctly per caller (own agent_key,
    // or every row for manager/elias/emmanuel/elizabeth). Used by Data
    // Check's company-wide "ledger mismatch" scan, which needs every
    // payment to sum per-lead, not one lead or one agent at a time.
    listAll(): Promise<Payment[]>;
    listPending(): Promise<Payment[]>;
    create(input: NewPaymentEntry, leadName: string, leadAgentKey: string, requestedStatus: PaymentStatus): Promise<Payment>;
    approve(paymentId: string, decidedBy: string, decidedByName: string): Promise<PaymentDecisionResult>;
    decline(paymentId: string, decidedBy: string, decidedByName: string, reason?: string): Promise<void>;
    // Master Spec Section 6's Needs-Correction workflow -- a middle ground
    // between pending and declined. flagNeedsCorrection is manager-only,
    // requires a reason, and moves a pending payment sideways rather than
    // killing it; resubmit (manager or the logging staff/'elias') edits the
    // amount/method/note/proof and sends it back to 'pending' for a fresh
    // review. Both go through RPCs, never a raw client UPDATE, matching
    // approve/decline's own reasoning exactly.
    listNeedsCorrection(): Promise<Payment[]>;
    flagNeedsCorrection(paymentId: string, reason: string): Promise<void>;
    resubmit(paymentId: string, input: { amount: number; paymentMethod?: PaymentMethod | null; note?: string | null; receiptProofPath?: string | null }): Promise<void>;
    // Real SECURITY DEFINER RPC `ensure_receipt_number` (confirmed live,
    // authenticated-only -- staging had this over-permissively granted to
    // anon too, fixed to match production, same drift class as
    // leaderboard_rows earlier). Mints a permanent receipt number the
    // first time anyone requests one for a payment (logged to
    // receipt_log, an insert-only audit trail) and returns the same
    // number on every later call for that payment -- never a new one.
    ensureReceiptNumber(paymentId: string): Promise<string>;
    // Uploads a proof-of-payment photo to the private 'payment-proofs'
    // Storage bucket and returns its storage path (stored on the payment
    // row via receipt_proof_path, not the URL itself -- the bucket is
    // private, a viewer resolves a signed URL client-side only when they
    // actually need to see it). Demo mode has no real Storage, so it
    // simulates this the same way signatureImage.ts does -- a downscaled
    // canvas data URI stored directly as the "path", good enough to
    // preview in-app, same honest demo/live boundary as every other
    // Storage-backed feature here.
    uploadProof(paymentId: string, agentKey: string, file: File): Promise<string>;
    // Returns a signed URL (live) or the raw data URI (demo) for a
    // receipt_proof_path value -- the one place that actually resolves
    // the private path into something an <img> can render.
    resolveProofUrl(path: string): Promise<string | null>;
    // Generates the approved receipt PDF, uploads it to the private
    // 'payment-receipts' bucket, and creates a receipt_share_links row --
    // returns the token the /receipt/:token public page (via the
    // get-receipt edge function) resolves into a signed download URL.
    // Demo mode creates a real-shaped local token, but it will correctly
    // never resolve on the public page (that page only ever talks to the
    // real staging project, no demoMode concept at all) -- same
    // documented demo/live boundary as SVE invites.
    issueReceiptLink(paymentId: string, pdfBlob: Blob, createdBy: string): Promise<string>;
  };
  // Master Spec Section 10 (Operations Tracker) -- schedule_items is the
  // one shared table behind My Day (kind='todo'), Task Board/Team
  // Schedule/Week/Month Calendar (kind='task'), and Meetings (kind=
  // 'meeting'). schedule_item_invitees/task_events/schedule_item_attachments
  // are separate real tables (added or discovered live 2026-09-06) this
  // one feature also owns.
  scheduleItems: {
    listForAgentOnDate(agentKey: string, date: string): Promise<ScheduleItem[]>;
    // Week/Month Calendar and Team Schedule all need a date-range read
    // rather than My Day's single-day one -- kind is deliberately NOT
    // filtered here (a calendar view shows todos+tasks+meetings together
    // on the days they fall), unlike listForAgentOnDate which stays
    // todo-only so My Day's existing behavior never changes.
    listForAgentInRange(agentKey: string, fromDate: string, toDate: string): Promise<ScheduleItem[]>;
    // Team Schedule (manager-only, gated client-side like every other
    // company-wide list here) -- every staff member's items in range.
    listAllInRange(fromDate: string, toDate: string): Promise<ScheduleItem[]>;
    // assignedTo defaults to the creator (agentKey) when omitted, matching
    // every existing call site's behavior exactly. When it's a different
    // key, this is a real "assign a task to a colleague" write -- owner_key
    // (the creator, real schedule_items_ins RLS: WITH CHECK owner_key =
    // my_key(), confirmed live) always stays agentKey; only assigned_to
    // changes, matching index.html's own owner/assignee split. The
    // colleague's own listForAgentOnDate already filters by assigned_to
    // (not owner_key), so this needs no read-side change at all.
    create(agentKey: string, date: string, title: string, assignedTo?: string): Promise<ScheduleItem>;
    // Full-record edit (title/description/notes/category/priority/dates/
    // times/links/dependency) -- real gap closed 2026-09-06: nothing
    // before this could revise a task/todo after creation at all.
    update(id: string, patch: ScheduleItemPatch): Promise<ScheduleItem>;
    // actorKey/actorName log a real task_events row for every status
    // change (Master Spec 10.2's "activity history"), and a transition
    // into/out of 'closed' now actually stamps completed_at -- real bug
    // fixed 2026-09-06: the live leaderboard_rows() RPC's tasks_completed/
    // avg_task_days already depended on completed_at, but nothing ever
    // set it, so every task closed through this app previously
    // undercounted. Completing a task also auto-clears 'blocked' on any
    // OTHER task whose blockedById pointed at this one and whose
    // predecessor is now actually done (Master Spec 10.2: "a task cannot
    // be marked ready when a required predecessor is incomplete" implies
    // the reverse too -- it becomes ready the moment that predecessor is).
    updateStatus(id: string, status: ScheduleItemStatus, actorKey: string, actorName: string): Promise<ScheduleItem>;
    // Task Board (kind='task', distinct from My Day's kind='todo' rows
    // above -- same table, always filtered apart). listAllTasks() is
    // manager-only (gated client-side, matching every other company-wide
    // list in this DataSource); listTasksForAgent() is what a staff
    // member's own board shows, same shape either way.
    listTasksForAgent(agentKey: string): Promise<ScheduleItem[]>;
    listAllTasks(): Promise<ScheduleItem[]>;
    // If input.blockedById names a predecessor that isn't done yet, the
    // new task starts life with status='blocked' instead of 'open' --
    // real enforcement of Master Spec 10.2's dependency gate, not just a
    // label.
    createTask(ownerKey: string, ownerName: string, input: NewTask): Promise<ScheduleItem>;
    // Real reassignment (owner_key never changes -- matches create()'s own
    // owner/assignee split above); byKey/byName are stamped as
    // assigned_by/assigned_by_name so a reassign is attributable, per the
    // master spec's "records who reassigned and why" -- reason is now
    // collected and logged to task_events (real gap closed 2026-09-06).
    reassignTask(id: string, toKey: string, toName: string, byKey: string, byName: string, reason: string): Promise<ScheduleItem>;
    // Master Spec 10.3 Meetings -- one schedule_items row (kind='meeting')
    // plus one schedule_item_invitees row per invited staff member.
    createMeeting(ownerKey: string, ownerName: string, input: NewMeeting): Promise<ScheduleItem>;
    listMeetingsForAgent(agentKey: string, fromDate: string, toDate: string): Promise<ScheduleItem[]>;
    // Real conflict check via the check_schedule_conflicts() SECURITY
    // DEFINER function (added 2026-09-06) -- returns only a boolean per
    // staff key, never the conflicting event's own details, since a
    // non-manager organizer has no RLS visibility into a colleague's
    // actual schedule (same real limitation useColleagueAvailability.ts
    // already documented for task counts).
    checkConflicts(staffKeys: string[], date: string, startTime: string, endTime: string, excludeId?: string): Promise<{ staffKey: string; hasConflict: boolean }[]>;
  };
  scheduleItemInvitees: {
    listForItem(scheduleItemId: string): Promise<ScheduleItemInvitee[]>;
    respond(inviteeId: string, status: 'accepted' | 'declined'): Promise<ScheduleItemInvitee>;
  };
  // Real table `task_events` (discovered live 2026-09-06, RLS already in
  // place from an earlier phase, zero application code touched it before
  // now) -- Master Spec 10.2's "activity history."
  taskEvents: {
    listForTask(taskId: string): Promise<TaskEvent[]>;
    log(taskId: string, type: string, actorKey: string, actorName: string, extra?: { fromKey?: string | null; fromName?: string | null; toKey?: string | null; toName?: string | null; note?: string | null }): Promise<void>;
  };
  // Real table `schedule_item_attachments` (added 2026-09-06) -- Master
  // Spec 10.2's "attachments." Storage path convention
  // `{scheduleItemId}/{filename}` in the `task-attachments` bucket.
  scheduleItemAttachments: {
    listForItem(scheduleItemId: string): Promise<ScheduleItemAttachment[]>;
    upload(scheduleItemId: string, file: Blob, fileName: string, contentType: string, uploadedBy: string, uploadedByName: string): Promise<ScheduleItemAttachment>;
    getUrl(storagePath: string): Promise<string | null>;
    remove(attachmentId: string, storagePath: string): Promise<void>;
  };
  streaks: {
    history(staffKey: string, days: number): Promise<StreakRow[]>;
    // Real write-back, ported from apiUpsertMyStreakToday (index.html:10168-
    // 10180) -- Phase 1 shipped read-only. dayMet is todoLogged alone
    // (leadAdded/siteVisitBooked are recorded as activity signal only, they
    // don't independently keep a streak alive), and this always targets
    // TODAY's row -- see computeRunningStreakLength for why writing it can't
    // move the headline number until the day actually rolls over.
    markToday(staffKey: string, patch: { todoLogged: boolean; leadAdded: boolean; siteVisitBooked: boolean }): Promise<StreakRow>;
  };
  config: {
    get(): Promise<Config>;
    // Real p_config_upd RLS (confirmed live): manager only. Partial --
    // only writes the fields the caller actually passes, leaving every
    // other real app_config column (quotation text, pricing, targets,
    // etc. -- all out of scope here) untouched.
    update(
      patch: Partial<
        Pick<
          Config,
          | 'leaderboardWeights'
          | 'commissionFullCap'
          | 'commissionHalfCap'
          | 'commissionPoolPerPlot'
          | 'allocationThresholdPct'
          | 'fullPrice'
          | 'halfPrice'
          | 'fullDiscount'
          | 'halfDiscount'
          | 'int3'
          | 'int6'
          | 'int9'
          | 'int12'
          | 'techFullPlotLengthFt'
          | 'techFullPlotWidthFt'
          | 'techHalfPlotLengthFt'
          | 'techHalfPlotWidthFt'
          | 'officeLat'
          | 'officeLng'
          | 'officeRadiusMeters'
          | 'attendanceCutoffTime'
          | 'workStartTime'
          | 'workEndTime'
          | 'workDays'
          | 'leaveTotalDays'
          | 'eidObservingStaff'
          | 'eidWindows'
        >
      >
    ): Promise<Config>;
  };
  // Real RLS restricts this to manager + specifically the 'elias'/
  // 'emmanuel' staff keys (confirmed live) -- not every agent. Callers
  // must gate visibility accordingly, not rely on this returning empty.
  // Real RLS (confirmed live: plots_sel/plots_ins/plots_upd/plots_del) is
  // manager/elias/emmanuel only -- no plain agent can read this table at
  // all. create/update/remove are plain table writes (apiInsertPlot/
  // apiUpdatePlot/apiDeletePlot in index.html); split() calls the real
  // split_plot_for_half_sale RPC (SECURITY DEFINER, same role gate) since
  // it must atomically insert two child rows and flip the parent to
  // Subdivided -- a client-side two-step insert+update could leave a plot
  // half-split if the second call failed.
  plots: {
    list(): Promise<Plot[]>;
    create(input: NewPlot): Promise<Plot>;
    update(id: string, patch: PlotUpdate): Promise<Plot>;
    remove(id: string): Promise<void>;
    split(plotId: string): Promise<{ alreadySplit: boolean; plotA: Plot | null; plotB: Plot | null }>;
  };
  // Real RLS (confirmed live): agent sees/edits only their own visits
  // (agent_key = my_key()); manager + a small staff allowlist see all.
  // agentName is passed separately from agentKey because the real table
  // stores both columns (agent_name is a display-only denormalization,
  // not derived from agent_key at write time).
  siteVisits: {
    listForAgent(agentKey: string): Promise<SiteVisit[]>;
    // Unfiltered -- Reports' company-wide CSV export. Real site_visits_sel
    // RLS already lets a manager SELECT every row (sve.listVisitsWithStatus
    // below already relies on this same fact for the SVE staff screen).
    listAll(): Promise<SiteVisit[]>;
    create(agentKey: string, agentName: string, input: NewSiteVisit): Promise<SiteVisit>;
    // Master Spec Section 4's Site Visits lead-record section -- real
    // site_visits.lead_id FK, not a fuzzy name/contact match at read time.
    listForLead(leadId: string): Promise<SiteVisit[]>;
    // Master Spec 9.4: "Delete icon must work. Deletion requires
    // confirmation and reason; it archives/cancels the visit and
    // preserves audit history." A soft cancel (UPDATE, deleted_at set),
    // never a hard DELETE -- real site_visits_del RLS would allow a hard
    // delete, but that would destroy the cost/history record the spec
    // explicitly says must survive.
    cancel(id: string, reason: string, deletedBy: string, deletedByName: string): Promise<SiteVisit>;
  };
  // Master Spec Section 4's "combined activity timeline" lead-record
  // section. Real activity_log.lead_id FK (added this session, see
  // ActivityLogEntry's own comment). RLS (activity_log_ins/sel, confirmed
  // live) already lets any authenticated caller insert their own
  // agent_key row and read own-or-manager -- log() is a direct insert,
  // not an RPC, matching that real permission shape (no privileged write
  // path needed, unlike audit_events).
  activityLog: {
    listForLead(leadId: string): Promise<ActivityLogEntry[]>;
    log(agentKey: string, agentName: string, client: string, action: string, detail?: string | null, leadId?: string | null): Promise<void>;
  };
  // Deliberately read-only-plus-create: no "mark cleared"/payout method
  // exists on this interface at all. See the Referral type's comment in
  // types/domain.ts -- real RLS lets a raw UPDATE bypass the one safe
  // clear_referral() RPC, and this app never touches that path.
  // listForAgent replicates, client-side for demo mode, the exact same
  // scoping the real RLS policy applies live: visible only if
  // referrer_lead_id points at one of the agent's own leads.
  referrals: {
    // `viewAll` mirrors real RLS (referrals_sel_staff): manager/elias/
    // emmanuel/elizabeth see every referral regardless of whose lead it's
    // tied to; a plain agent only ever sees their own. Threaded through
    // explicitly here so the demo store matches that instead of always
    // filtering to one agent.
    listForAgent(agentKey: string, viewAll?: boolean): Promise<Referral[]>;
    create(agentKey: string, input: NewReferral): Promise<Referral>;
    // Safe to do as a plain UPDATE (referrals_upd_staff RLS has no WITH
    // CHECK restricting this column) -- the dangerous path is status/
    // points, which must go exclusively through clear() below.
    linkLead(id: string, leadId: string): Promise<Referral>;
    // Calls the real clear_referral(p_referral_id, p_points) RPC
    // (SECURITY DEFINER, manager/elias/emmanuel/elizabeth only) -- it
    // re-validates server-side that the linked lead has paid >=30% of
    // its grand total before setting status='Cleared'. Never call
    // .update() on status/points_awarded directly; that's the exact
    // bypass that produced the real bad row this app is working around
    // (see the Referral type's comment).
    clear(id: string, points: number): Promise<Referral>;
  };
  // Agent-scoped via agent_key exactly like leads/site_visits (confirmed
  // live) -- straightforward, unlike referrals' lead-linked scoping.
  enquiries: {
    // listForAgent now also matches `owner` (RLS updated the same day to
    // match) -- an enquiry escalated to a colleague via owner must reach
    // that colleague's own view, same fix as complaints.
    listForAgent(agentKey: string): Promise<Enquiry[]>;
    listAll(): Promise<Enquiry[]>;
    create(agentKey: string, agentName: string, input: NewEnquiry): Promise<Enquiry>;
    update(id: string, patch: EnquiryUpdate): Promise<Enquiry>;
  };
  // Agent-scoped via agent_key exactly like enquiries -- but unlike
  // payments, complaints_upd (confirmed live) is ALSO agent-scoped, not
  // manager-only. Any owning agent can already resolve their own
  // complaint via a plain UPDATE; no RPC exists or is needed here, a
  // real and deliberate difference from the payments approve/decline
  // workflow, not an inconsistency.
  complaints: {
    listForAgent(agentKey: string): Promise<Complaint[]>;
    listAll(): Promise<Complaint[]>;
    create(agentKey: string, agentName: string, input: NewComplaint): Promise<Complaint>;
    update(id: string, patch: ComplaintUpdate): Promise<Complaint>;
  };
  // Real table `contract_requests` (confirmed live). RLS SELECT is
  // `requested_by = my_key() OR manager OR elizabeth` -- so an unfiltered
  // list() naturally scopes itself correctly per viewer in live mode (RLS
  // does the real work); demo mode has no RLS, so it replicates the same
  // scoping client-side from the explicit viewerKey/viewerRole passed in.
  // fulfil() is manager/elizabeth-only (contract_requests_upd), matching
  // the special-key pattern Plot Inventory already uses for elias/emmanuel.
  contractRequests: {
    list(viewerKey: string, viewerRole: string): Promise<ContractRequest[]>;
    create(agentKey: string, agentName: string, input: NewContractRequest): Promise<ContractRequest>;
    fulfil(id: string): Promise<ContractRequest>;
  };
  // Real table `contracts` (confirmed live) -- metadata-only record of a
  // generated Contract of Sale PDF (no blob stored, see the Contract
  // type's own comment). contracts_ins RLS is manager/elizabeth only;
  // list() is broader (also the lead's own agent, or the elias/emmanuel/
  // elizabeth allowlist) but this app only calls it from the generator
  // screen, itself gated to canManageContracts-equivalent staff.
  contracts: {
    list(): Promise<Contract[]>;
    create(leadId: string, clientName: string, agentKey: string, createdBy: string, createdByName: string): Promise<Contract>;
  };
  // CONTRACT_OF_SALE_BLUEPRINT.md §4/§16 -- the real template studio.
  // RLS on all 6 tables is manager-or-elizabeth (matching the existing
  // contract_requests_upd / useCanFulfilContracts() gate for this whole
  // feature area), except contractGenerations.list() which is broader
  // (also the lead's own agent) and .create(), which stays gated to the
  // same contracts.generate permission the existing contracts_ins uses.
  contractTemplates: {
    list(): Promise<ContractTemplate[]>;
    create(createdBy: string, createdByName: string, input: NewContractTemplate): Promise<ContractTemplate>;
    update(id: string, patch: Partial<NewContractTemplate & { isActive: boolean }>): Promise<ContractTemplate>;
  };
  contractTemplateVersions: {
    listForTemplate(templateId: string): Promise<ContractTemplateVersion[]>;
    // CONTRACT_OF_SALE_BLUEPRINT.md §8 -- every currently-published version
    // across all templates, for the generator's template picker (a manager
    // may only ever generate from a published version, never a draft).
    listPublished(): Promise<ContractTemplateVersion[]>;
    create(templateId: string, versionNumber: number, createdBy: string, createdByName: string): Promise<ContractTemplateVersion>;
    update(id: string, patch: { content?: ContractSection[]; status?: ContractTemplateVersionStatus }): Promise<ContractTemplateVersion>;
    // Real SECURITY DEFINER RPC (set_contract_template_version_published)
    // -- atomically publishes this version and archives any other
    // published version of the same template, mirroring
    // set_attendance_policy's own one-active-row discipline.
    publish(id: string): Promise<ContractTemplateVersion>;
  };
  contractClauses: {
    list(): Promise<ContractClause[]>;
    create(createdBy: string, createdByName: string, input: NewContractClause): Promise<ContractClause>;
  };
  contractFields: {
    list(): Promise<ContractField[]>;
    create(createdBy: string, key: string, scope: ContractFieldScope, templateId: string | null): Promise<ContractField>;
  };
  contractGenerations: {
    list(): Promise<ContractGeneration[]>;
    create(input: {
      contractRequestId: string | null;
      leadId: string;
      clientName: string;
      templateId: string | null;
      templateVersionId: string | null;
      versionNumberSnapshot: number | null;
      contentSnapshot: ContractSection[];
      fieldValuesSnapshot: Record<string, string>;
      pdfStoragePath: string | null;
      generatedBy: string;
      generatedByName: string;
    }): Promise<ContractGeneration>;
    // CONTRACT_OF_SALE_BLUEPRINT.md §8 step 2 -- private contract-pdfs
    // bucket, folder-per-lead, same shape as payments.uploadProof/
    // issueReceiptLink. Returns the storage path to record on the
    // contract_generations row (not a signed URL -- resolved on demand).
    uploadPdf(path: string, blob: Blob): Promise<string>;
  };
  contractApprovals: {
    listForVersion(templateVersionId: string): Promise<ContractApproval[]>;
    decide(templateVersionId: string, status: ContractApprovalStatus, reason: string | null, decidedBy: string, decidedByName: string): Promise<ContractApproval>;
  };
  // Real table `leave_requests` (confirmed live). Unlike contract_requests,
  // SELECT RLS here is genuinely open to any authenticated staff member
  // (not agent/manager-scoped) -- list() is a real unfiltered read in live
  // mode, matched in demo mode too (no artificial scoping needed). decide()
  // is manager-only in practice (leave_requests_upd: own row or manager;
  // approve/decline is gated client-side to manager since a regular agent
  // deciding their own request makes no sense even though RLS permits self
  // UPDATE for other real reasons like cancelling your own pending
  // request -- not built here either).
  leaveRequests: {
    list(): Promise<LeaveRequest[]>;
    create(agentKey: string, agentName: string, input: NewLeaveRequest): Promise<LeaveRequest>;
    // Master Spec 12.4: "Management may approve, decline or reschedule
    // with reason". Exact port of v1's own split (index.html:5503-5532):
    // decide() only ever does approve/declined (apiDecideLeaveRequest) --
    // reschedule is its own method below (apiRescheduleLeaveRequest), since
    // v1's real reschedule has two distinct outcomes decide() can't express.
    // note on decline carries the decline reason (stored in the real
    // reschedule_note column, same as v1); deductQuota is Management's
    // explicit call at approval time (12.4's "normally yes, Management can
    // choose no for exceptional cases"), left unchanged when omitted.
    decide(id: string, outcome: 'approved' | 'declined', decidedBy: string, decidedByName: string, decidedSignature: string | null, note?: string, deductQuota?: boolean): Promise<LeaveRequest>;
    // Exact port of v1's apiRescheduleLeaveRequest (index.html:5513-5532).
    // Two real outcomes: newDates given (Management picked the actual
    // replacement date(s) via the calendar in the reschedule UI) -- this
    // IS the reschedule, dates are updated in place and it's approved+
    // signed immediately, nothing further needed from the staff member.
    // newDates omitted/empty -- Management just needs different dates from
    // the staff member; frees the original dates back up (status
    // 'rescheduled' doesn't block, same as leaveIsBlocking()) without
    // approving anything yet.
    reschedule(id: string, note: string | undefined, newDates: string[] | null, decidedBy: string, decidedByName: string, decidedSignature: string | null): Promise<LeaveRequest>;
    // v1's real "planned -> pending" transition (index.html's
    // sendPlannedLeaveNow) -- a private draft becomes a real request
    // Management can see/act on.
    sendPlanned(id: string): Promise<LeaveRequest>;
    // v1's real delete-a-planned-entry action (data-leaveplandel) -- only
    // ever offered in the UI for a still-'planned' row, never a sent one.
    remove(id: string): Promise<void>;
    // New 2026-09-05, genuinely no v1 precedent. Real column
    // `used_confirmed_at` -- only the requester themselves can confirm they
    // actually took an approved, already-passed leave, which is what backs
    // leaveDaysConfirmedUsed() (see leaveLogic.ts's header comment on why
    // this is a separate concept from the entitlement-protecting "reserved"
    // count that leaveDaysUsed() still computes from status alone).
    confirmUsed(id: string): Promise<LeaveRequest>;
  };
  // Real table `banners` (confirmed live) -- physical banner/scouted-
  // location tracking. Unlike Plot Inventory, banners_sel/ins/upd RLS is
  // open to any authenticated staff member (banners_del is owner-or-
  // manager only, not exposed here -- this pass is create/list/update
  // only, matching the Dashboard+List scope actually built). Map & Routes
  // (Leaflet) and Reports tabs, plus the separate banner_status_log audit
  // trail, are deliberately out of scope -- a real, much larger geo/
  // reporting feature, same scoping discipline as Allocations' deferred
  // PDF/chat-send.
  banners: {
    list(): Promise<Banner[]>;
    create(createdBy: string, createdByName: string, input: NewBanner): Promise<Banner>;
    updateStatus(id: string, status: BannerStatus): Promise<Banner>;
  };
  // Real table `pricing_history` (confirmed live) -- port of v1's
  // apiLogPricingChange/apiLoadPricingHistory. log() is called once per
  // changed field by Settings' own save handler (matching v1's own
  // architecture exactly: the diff is computed at the call site, not
  // inside config.update() itself), never automatically.
  pricingHistory: {
    list(): Promise<PricingHistoryEntry[]>;
    log(changedBy: string, changedByName: string, field: string, fieldLabel: string, oldValue: number, newValue: number): Promise<PricingHistoryEntry>;
  };
  // Real table `pricing_promotions` -- a promo window Management sets up
  // (plot type, discount/increase, amount, date range) that only ever
  // affects leads CREATED inside that window; it never touches a lead
  // already in the system (replaces an earlier "bulk-adjust every
  // existing lead now" tool that did the opposite of what was wanted).
  // AddLeadScreen calls list() and finds the match itself rather than a
  // separate server-side "what applies today" endpoint, since the set is
  // always small and the match logic (date range + plot type) is trivial.
  pricingPromotions: {
    list(): Promise<PricingPromotion[]>;
    create(createdBy: string, createdByName: string, input: Omit<PricingPromotion, 'id' | 'createdBy' | 'createdByName' | 'createdAt'>): Promise<PricingPromotion>;
    remove(id: string): Promise<void>;
  };
  // Real V3 chapter-01 entity (office_locations table, new 2026-09-10) --
  // a genuine multi-site geofence list, superseding the single flat
  // Config.officeLat/officeLng. Readable by any authenticated staff member
  // (AttendanceScreen's off-site check needs to read it too, not just
  // Management); writes are manager-only, RLS-enforced. See
  // project-attendance-v3-chapter01-gap memory.
  officeLocations: {
    list(): Promise<OfficeLocation[]>;
    create(createdBy: string, createdByName: string, input: NewOfficeLocation): Promise<OfficeLocation>;
    update(id: string, patch: Partial<NewOfficeLocation & { isActive: boolean }>): Promise<OfficeLocation>;
    remove(id: string): Promise<void>;
  };
  // Real V3 chapter-01 entity (attendance_policy table) -- see
  // AttendancePolicy's own doc comment in types/domain.ts. `update()`
  // calls the set_attendance_policy() SECURITY DEFINER RPC (manager-only,
  // atomically versions the row) rather than a direct table write.
  attendancePolicy: {
    current(): Promise<AttendancePolicy | null>;
    history(): Promise<AttendancePolicy[]>;
    update(createdBy: string, createdByName: string, input: { workStartTime: string; workEndTime: string; graceMinutes: number; workDays: number[] }): Promise<AttendancePolicy>;
  };
  // Real V3 chapter-01 entity (attendance_exceptions table) -- see
  // AttendanceException's own doc comment in types/domain.ts. list()
  // trusts RLS to scope results (own requests, or every request for a
  // manager session), same pattern as leaveRequests.list().
  attendanceExceptions: {
    list(): Promise<AttendanceException[]>;
    create(agentKey: string, agentName: string, input: NewAttendanceException): Promise<AttendanceException>;
    decide(id: string, status: 'approved' | 'declined', decidedBy: string, decidedByName: string): Promise<AttendanceException>;
  };
  // Real table `fund_requests` -- see the FundRequest type's comment in
  // types/domain.ts for the real reason this is only ever the request/
  // approval half of Expenses, not the whole feature. Real RLS
  // (fundreq_ins/sel/upd, confirmed live) technically lets any signed-in
  // staff request their own funds, but the real UI gate (canManageExpenses
  // in index.html) is stricter -- manager or 'elias' only, matching
  // Log Payment's own precedent of a UI gate tighter than RLS allows.
  fundRequests: {
    list(viewerKey: string, viewerRole: string): Promise<FundRequest[]>;
    create(requestedBy: string, requestedByName: string, input: NewFundRequest): Promise<FundRequest>;
    decide(id: string, approve: boolean, decidedBy: string, decidedByName: string, note?: string): Promise<FundRequest>;
  };
  // Real table `weekly_visit_forms`, one row per (week_start, visit_date)
  // -- real unique index confirmed live, matching index.html's own get-or-
  // create-on-demand pattern (apiLoadOrCreateWeeklyVisitForm). Gated the
  // same as SVE Management (canViewClientDatabase(): manager/elias/
  // emmanuel/elizabeth, confirmed live via wvf_staff_sel/ins/upd RLS).
  weeklyVisitForms: {
    getOrCreate(weekStart: string, visitDate: string): Promise<WeeklyVisitForm>;
    saveCosts(id: string, patch: WeeklyVisitFormCostPatch): Promise<WeeklyVisitForm>;
    finalize(id: string, approvedBy: string, approvedByName: string, signature: string | null): Promise<WeeklyVisitForm>;
  };
  // Real table `downloads` (confirmed live, both projects) -- every PDF/
  // Excel report a staff member generates gets logged here with its full
  // file data, so it can be re-opened later without regenerating it.
  // Real RLS (downloads_sel, confirmed live): a manager sees every staff
  // member's downloads, everyone else only their own -- list() needs no
  // client-side filtering in live mode, RLS already does it.
  downloads: {
    list(viewerKey: string, viewerRole: string): Promise<DownloadRecord[]>;
    log(userKey: string, userName: string, filename: string, kind: string, fileData: string | null): Promise<DownloadRecord>;
  };
  // Real table `import_batches` (ported to staging 2026-09-03 -- see
  // PHASE0_INVENTORY.md; already live on production). Archives every
  // pipeline Excel import, matching apiInsertImportBatch() (index.html:
  // 20451-20463). Real import_batches_ins RLS WITH CHECK requires
  // imported_by = my_key() -- create() always stamps the caller's own
  // key/name, never a caller-supplied one.
  importBatches: {
    create(importedBy: string, importedByName: string, batch: NewImportBatch): Promise<void>;
  };
  // Real table `report_archive` (ported to staging 2026-09-03; already live
  // on production, written by daily-management-report on every run). Read-
  // only from this app -- report_archive_sel RLS is manager-only SELECT
  // with zero INSERT/UPDATE policies, the edge function's service-role
  // client is the sole write path, same shape as audit_events/backups.
  // Closes the master spec's "Admin System Health page:... last successful
  // report" line -- System Health had no visibility into this at all before.
  reportArchive: {
    list(limit?: number): Promise<ReportArchiveEntry[]>;
  };
  // Real tables `achievement_definitions`/`staff_achievements` (confirmed
  // live, already fully seeded on both projects with the same 8 real
  // definitions -- see the type's own comment in types/domain.ts).
  // award() is the real upsert-with-ignoreDuplicates pattern
  // (apiAwardAchievement, index.html:19674-19679) -- returns null when
  // the achievement was already earned (a silent no-op, not an error),
  // so a caller can re-run evaluation on every visit without worrying
  // about double-awarding or double-celebrating.
  achievements: {
    listDefs(): Promise<AchievementDef[]>;
    listEarned(staffKeys: string[]): Promise<StaffAchievement[]>;
    award(staffKey: string, staffName: string, achievementId: string, progress: { value: number; threshold: number }): Promise<StaffAchievement | null>;
  };
  // Real table `audit_events` + RPC `record_audit_event` (ported to
  // staging this session -- see web-next/docs/PHASE0_INVENTORY.md; live on
  // production since 2026-08-22). RLS is manager-only SELECT with zero
  // INSERT policies, so log() must go through the RPC, not a direct
  // insert -- matches index.html's logAudit()/logClientError(), called
  // from a narrow, deliberately-chosen set of call sites, never a blanket
  // instrumentation sweep.
  audit: {
    // entityType/entityIds -- Master Spec Section 4's lead-record Audit
    // Trail section. Manager-only per audit_events' own RLS (unchanged);
    // the UI calls this once for entityType='lead' and once for
    // entityType='payment' (that lead's own payment ids) and merges.
    list(filter?: { category?: string; criticalOnly?: boolean; entityType?: string; entityIds?: string[] }): Promise<AuditEvent[]>;
    log(eventType: string, severity: AuditEvent['severity'], summary: string, detail?: Record<string, unknown> | null, entityType?: string | null, entityId?: string | null): Promise<void>;
  };
  // Real table `push_subscriptions` (confirmed live on both projects with
  // full RLS -- ps_ins_staff/ps_upd_staff gated on owner_kind='staff' AND
  // owner_id=my_key()). save() upserts on endpoint, matching
  // apiSaveWebPushSubscription (index.html:5785-5800) exactly -- a
  // resubscribe (same device, new push service registration) must
  // replace the old row rather than duplicate it.
  pushSubscriptions: {
    save(ownerKind: 'staff' | 'client', ownerId: string, sub: { endpoint: string; p256dh: string; auth: string }): Promise<void>;
  };
  // Real Edge Function `send-sms` (Arkesel proxy, already live and used
  // elsewhere -- payment reminders, SVE invites) + table `sms_log`
  // (confirmed live RLS on both projects: any authenticated user can
  // insert their own row; select is own-or-manager). Mirrors apiSendSms
  // (index.html:4307-4322) exactly: never throws -- a failed SMS should
  // never roll back or block whatever real action triggered it, so
  // callers fire-and-forget this rather than awaiting inside a try/catch
  // of their own.
  sms: {
    send(to: string, message: string, trigger: string, sentByKey: string | null): Promise<boolean>;
  };
  // Real RPCs `create_backup`/`restore_backup` + table `backups`
  // (confirmed live on both projects -- production runs these on a
  // 6am/2pm/10pm cron plus a manual trigger, 30 real backups on file).
  // restore() is manager-gated server-side (the RPC itself raises if the
  // caller isn't a manager) and takes its own pre-restore safety snapshot
  // automatically before restoring -- nothing extra to build for safety,
  // this just surfaces the existing capability.
  backups: {
    list(): Promise<BackupRecord[]>;
    createNow(triggeredBy: string, triggeredByName: string): Promise<BackupRecord>;
    restore(backupId: string, triggeredBy: string, triggeredByName: string): Promise<void>;
  };
  // Real tables `permissions`/`staff_permission_overrides` + RPCs
  // `set_permission_override`/`clear_permission_override` (staging only,
  // ported this session -- see PHASE0_INVENTORY.md §4). grant()/clear()
  // are the only two actions surfaced -- see the PermissionOverride type's
  // own comment in types/domain.ts for why an explicit granted:false
  // override isn't exposed here.
  permissions: {
    listDefs(): Promise<PermissionDef[]>;
    listOverrides(): Promise<PermissionOverride[]>;
    grant(staffKey: string, permissionKey: string, grantedBy: string): Promise<void>;
    clear(staffKey: string, permissionKey: string): Promise<void>;
  };
  // Real column `leads.banner_id` -- how many real leads are attributed to
  // each banner, keyed by banner id. Confirmed live: `leads` RLS already
  // scopes SELECT correctly per caller, so this naturally undercounts for
  // a plain agent (their own leads only) exactly like index.html's own
  // apiLoadLeadBannerCounts() does -- not a bug, matches production.
  leadBannerCounts(): Promise<Record<string, number>>;
  // Real table `allocation_requests` -- same manager/elias/emmanuel gate
  // as Plot Inventory (alloc_sel/alloc_upd, confirmed live). list()
  // naturally self-scopes in live mode (own rows, or every row for that
  // roster); demo mode replicates the same scoping client-side from the
  // explicit viewerKey/viewerRole, matching the contractRequests pattern.
  // allocate() is manager/elias/emmanuel-only in practice, gated client-
  // side (RLS also permits an agent's own-row UPDATE, for agent_seen
  // marking in the real app -- not built here).
  // Real 3-stage workflow (confirmed live via the actual confirm_allocation/
  // edit_allocated_plot/revert_allocation/delete_allocation RPCs, ported
  // verbatim to staging for this pass, which never had them before): a bare
  // status update from Pending straight to Allocated (the old shape of this
  // interface) never touched the real `plots` table at all -- a genuine
  // inventory-sync gap. suggest()/flag()/resolveFlag() stay plain table
  // writes (alloc_upd RLS has no WITH CHECK restricting these columns,
  // matching referrals.linkLead's reasoning); confirm/revert/editPlot/
  // remove all go through the SECURITY DEFINER RPCs since those are the
  // only path that also syncs `plots` atomically.
  allocationRequests: {
    list(viewerKey: string, viewerRole: string): Promise<AllocationRequest[]>;
    create(agentKey: string, agentName: string, input: NewAllocationRequest): Promise<AllocationRequest>;
    suggest(id: string, plotNumbers: string[]): Promise<AllocationRequest>;
    confirm(id: string, plotNumber: string, note: string | undefined, confirmedBy: string): Promise<AllocationRequest>;
    revert(id: string): Promise<AllocationRequest>;
    editPlot(id: string, newPlotNumber: string): Promise<AllocationRequest>;
    remove(id: string): Promise<void>;
    flag(id: string, reason: string, flaggedBy: string): Promise<AllocationRequest>;
    resolveFlag(id: string): Promise<AllocationRequest>;
    // Master Spec 7.5: "Management approves one suggestion or sends back
    // with reason" -- only confirm existed before this. Reuses the exact
    // same flag_reason/flagged_by fields flag() above already writes
    // (plain columns, not RPC-gated by status), just also reverting
    // status back to Pending and clearing the old suggestion so staff
    // re-suggest fresh. That combination is deliberate: a Pending request
    // with a flag_reason already renders RequestRow's own "fix and
    // resubmit" panel with zero new UI needed, the same real path staff
    // already use for a suggestion-stage data problem.
    sendBack(id: string, reason: string, sentBackBy: string): Promise<AllocationRequest>;
    // Master Spec 7.5's physical sign-off gate: staff photograph
    // Management's signed authorization form and attach it here (same
    // storage-bucket-per-agent-folder pattern as payments.uploadProof).
    // resolveAuthDocUrl turns the stored path into something viewable/
    // sendable to the AI. analyzeAuthDoc calls the vision check and
    // persists its result onto the row -- soft signal only, never a hard
    // gate on confirm() itself.
    uploadAuthDoc(id: string, agentKey: string, file: File): Promise<string>;
    resolveAuthDocUrl(path: string): Promise<string | null>;
    analyzeAuthDoc(id: string, imageUrl: string, clientName: string, plotNumber: string): Promise<AllocationRequest>;
  };
  // Real table `notes` -- a private per-staff scratchpad. notes_sel also
  // lets a manager SELECT anyone's notes (confirmed live), not used here --
  // this always scopes to the caller's own via ownerKey, matching every
  // real write policy (INSERT/UPDATE/DELETE are all strictly owner-only).
  notes: {
    listForOwner(ownerKey: string): Promise<Note[]>;
    create(ownerKey: string, input: NewNote): Promise<Note>;
    update(id: string, input: NewNote): Promise<Note>;
    remove(id: string): Promise<void>;
  };
  // Real table `attendance_log` (confirmed live, currently 0 production
  // rows), one row per (staff_key, work_date) enforced by a real unique
  // index. No RPC exists -- signIn/signOut here do the "does today's row
  // exist" / "is sign_out_at already set" checks the app itself must make
  // instead of relying on a server-side function. Late/off-site ARE now
  // computed client-side (AttendanceScreen, using Config's office geofence
  // + cutoff-time columns) rather than pure self-report -- this layer just
  // persists whatever the caller determined, same as before.
  attendance: {
    today(staffKey: string): Promise<AttendanceRecord | null>;
    history(staffKey: string, days: number): Promise<AttendanceRecord[]>;
    // Real user ask (2026-09-05): "all attendance needs to go to
    // management in real time with all the data" -- today()/history()
    // above are staff-scoped only; Management had no way to see anyone's
    // attendance at all before this, live or otherwise.
    listToday(): Promise<AttendanceRecord[]>;
    // Company-wide, trailing-window (unlike history() above, which is one
    // staff member's own). Backs the AI attendance-pattern suggestions
    // (attendanceRosterLogic.ts's detectAttendancePatterns) -- new
    // 2026-09-07, user correction: Praise/Warning must come from the
    // system detecting a real pattern, not Management clicking a button
    // per staff member.
    listRange(days: number): Promise<AttendanceRecord[]>;
    // Explicit from/to bounds (inclusive), company-wide -- backs the
    // Attendance Records screen's date-range filter (new 2026-09-10, user
    // correction: "the attandance app doenst have a records page,
    // analytics nothing and managemnt cant even pull filter or compare
    // staff attendance trends or even pull a report on attendance").
    // Deliberately its own method rather than reusing listRange(days) --
    // a UI-driven date picker needs real bounds, not "N days back from
    // whenever this happens to be called".
    listBetween(startDate: string, endDate: string): Promise<AttendanceRecord[]>;
    signIn(staffKey: string, staffName: string, input: SignInInput): Promise<AttendanceRecord>;
    signOut(staffKey: string, id: string, input: SignOutInput): Promise<AttendanceRecord>;
    // ATTENDANCE_BLUEPRINT.md §8 -- Management-only record correction
    // (sign-in/out time only, matching the real `al_upd_own_or_mgr` RLS
    // policy already live) and delete (real `al_del_mgr` policy, manager-
    // only). Callers gate the UI to role==='manager'; RLS is the real
    // backstop on production.
    update(id: string, patch: { signInAt?: string | null; signOutAt?: string | null }): Promise<AttendanceRecord>;
    remove(id: string): Promise<void>;
    // ATTENDANCE_BLUEPRINT.md §6 "You vs the team" -- a regular staff
    // session can't read anyone else's attendance_log rows at all under
    // real RLS (al_sel_own_or_mgr is staff_key = my_key() OR manager,
    // confirmed live 2026-09-11), so this can't be computed from listRange
    // client-side the way the blueprint first assumed. Aggregate-only,
    // same privacy shape as the leaderboard rankings already visible to
    // every staff member (no coordinates/photos/reasons).
    monthComparison(monthKey: string, cutoff: string): Promise<{ staffKey: string; staffName: string; daysAttended: number; onTimeDays: number }[]>;
    // ATTENDANCE_BLUEPRINT.md §9 -- Management-only, company-wide, deletes
    // every attendance_log row. Real `al_del_mgr` RLS already permits a
    // manager to delete any row; no new policy needed, the client just
    // issues one unscoped delete instead of one row at a time. Gated
    // behind two sequential confirm() dialogs in the UI (v1's exact
    // pattern for this specific destructive action).
    resetAll(): Promise<void>;
  };
  // Real table `attendance_notes` (new -- Master Spec 11.3's Praise/Warning
  // action, no v1 precedent). SELECT RLS is own-or-manager (same shape as
  // attendance_log); INSERT is manager-only. Append-only by design -- no
  // update()/remove() here, matching the fact that no UPDATE/DELETE policy
  // exists on the table either. list() returns every note the caller is
  // allowed to see (their own, or -- for a manager -- everyone's), same
  // unfiltered-then-RLS-scoped shape as leaveRequests.list().
  attendanceNotes: {
    list(): Promise<AttendanceNote[]>;
    issue(staffKey: string, staffName: string, kind: AttendanceNote['kind'], reason: string, workDate: string, createdBy: string, createdByName: string): Promise<AttendanceNote>;
  };
  // ATTENDANCE_BLUEPRINT.md §13 -- post-hoc classification of an off-site
  // sign-in/out, distinct from attendanceExceptions (ask permission ahead
  // of time). Real table + RLS already existed from earlier schema-
  // foundation work this session (own-or-manager SELECT, manager-only
  // INSERT/UPDATE); this session added the real `classification` enum
  // column. decide() always creates an already-'reviewed' row (the UI
  // never shows an interim "pending" state -- Management picks a
  // classification in the same action that opens the review), so no
  // separate update() method is needed yet.
  attendanceReviews: {
    list(): Promise<AttendanceReview[]>;
    decide(attendanceLogId: string, staffKey: string, staffName: string, classification: 'authorized' | 'exception', note: string, reviewedBy: string, reviewedByName: string): Promise<AttendanceReview>;
  };
  // Real `profiles` table -- needed as a recipient/CC picker for
  // Memorandum. RLS (p_profiles_sel) lets any authenticated staff member
  // see every profile, so this is a plain unfiltered list.
  staff: {
    list(): Promise<Profile[]>;
    // Unfiltered version of list() (which only returns active=true) --
    // the Team Roster screen needs deactivated staff visible too, to
    // reactivate them. Real p_profiles_sel RLS lets any authenticated
    // staff member see every profile regardless of active status.
    listAll(): Promise<Profile[]>;
    // Real p_profiles_upd RLS (confirmed live): own row OR manager --
    // matches index.html's own comment that deactivating blocks sign-in
    // but keeps historical leads/stats intact everywhere, including the
    // Leaderboard. Real account CREATION (index.html's create-employee
    // Edge Function, which provisions a real Supabase Auth user) is
    // deliberately out of scope -- not something to wire up and exercise
    // in a demo/testing pass.
    setActive(key: string, active: boolean): Promise<Profile>;
    // Real column `signature_data` (confirmed live, text) -- a self-
    // service upload in Settings, real p_profiles_upd RLS (own row OR
    // manager) matches setActive's own-row-update shape exactly. Used to
    // auto-stamp the signed-in staff member's own signature onto
    // documents they generate/approve (index.html's getStaffSignature()).
    updateSignature(key: string, dataUrl: string | null): Promise<Profile>;
  };
  // Real table `allowed_emails` (confirmed live) -- manager-only invite
  // list, gated by real RLS added 2026-09-04 alongside the
  // handle_new_auth_user() fix (see StaffInvite's comment in types/
  // domain.ts): a new sign-up is only allowed to create a profile if
  // their email is here, and a successful sign-up consumes the row.
  // create()/remove() are plain manager-gated table writes; the actual
  // account-creation step (a new hire filling in name/email/password) is
  // real Supabase Auth signUp(), handled by the public join screen
  // (auth/useJoinPortal.ts), not by this namespace.
  staffInvites: {
    list(): Promise<StaffInvite[]>;
    create(email: string, name: string, invitedBy: string): Promise<void>;
    remove(email: string): Promise<void>;
  };
  // Real tables `memos` + `memo_recipients` -- see the Memo type's comment
  // in types/domain.ts for the RLS/draft/CC shape. delete() throws if
  // called on a memo the caller didn't send and isn't a manager for,
  // matching real RLS (memos_del) rather than silently no-opping.
  memos: {
    sent(myKey: string): Promise<Memo[]>;
    drafts(myKey: string): Promise<Memo[]>;
    received(myKey: string): Promise<ReceivedMemo[]>;
    create(fromKey: string, fromName: string, input: NewMemo): Promise<Memo>;
    send(id: string): Promise<Memo>;
    markRead(item: ReceivedMemo): Promise<void>;
    remove(id: string): Promise<void>;
  };
  // Company-wide aggregation for Manager Home. Confirmed live: leads_sel/
  // payments_sel/complaints_sel RLS all let a real manager-role session
  // SELECT every row -- a real unfiltered query, not client-side illusion.
  manager: {
    overview(): Promise<ManagerOverview>;
    // Raw leaderboard_rows() RPC rows for a date range, unscored (no
    // `points` -- callers combine with config.get().leaderboardWeights via
    // agentPoints()). Matches index.html's own real DEMO_MODE behavior:
    // the demo store has no multi-agent staff roster to rank, so this
    // returns [] in demo, same as apiLoadLeaderboardRows() always has.
    leaderboardRows(fromDate: string, toDate: string): Promise<Omit<LeaderboardRow, 'points'>[]>;
    // Server-authoritative scored rows -- calls recompute_leaderboard_
    // scores(), a SECURITY DEFINER SQL function that computes `points`
    // itself (same formula as the old client-side agentPoints(), now
    // fixing a real bug: total_collected used to be leads.amt_paid
    // unscoped by date, now approved payments actually received in
    // range) and persists it to leaderboard_scores, logging a
    // leaderboard_score_history row whenever a score changes. Both
    // Leaderboard and Portfolio must call this (not leaderboardRows +
    // client agentPoints()) so score is computed once, in one place, and
    // is auditable. See project-leaderboard-v3-audit-and-plan memory.
    leaderboardScores(fromDate: string, toDate: string): Promise<LeaderboardRow[]>;
    // Real audit trail from `leaderboard_score_history` -- a row only
    // exists when a persisted score's points actually changed, written
    // by a DB trigger, never by the client. Backs the Leaderboard admin
    // workspace's "Recent score changes" panel. Demo mode has no
    // persisted score ledger to audit (leaderboardScores() recomputes
    // fresh client-side every call), so this returns [] there.
    leaderboardScoreHistory(limit: number): Promise<LeaderboardScoreHistoryEntry[]>;
    // Unfiltered payments/leads (real payments_sel/leads_sel RLS confirmed
    // to let a manager session SELECT every row) + the agent roster --
    // commissionLogic.ts does the actual monthly computation client-side
    // from this, same shape index.html's DB.payments/DB.leads/allAgentLists()
    // gave computeCommissionForMonth(). Every payment status comes back
    // (not just approved) -- commissionLogic.ts is responsible for
    // filtering to approved before any arithmetic, never this layer.
    commissionData(): Promise<{ payments: Payment[]; leads: Lead[]; staff: { key: string; name: string }[] }>;
    // Real RPC `staff_referral_conversions(p_from, p_to)` (confirmed live,
    // both projects) -- how many of each staff member's referrals
    // actually converted (became a paying lead) in the range, the one
    // metric leaderboard_rows() doesn't already cover. Only real caller
    // today is the Referral Champion achievement (Portfolio).
    referralConversions(fromDate: string, toDate: string): Promise<{ staffKey: string; referralConversions: number }[]>;
  };
  // Staff-authenticated side of Site Visit Experience (distinct from the
  // public RPC-based data/sveClient.ts a visitor uses). Real RLS
  // (confirmed live) restricts these tables to manager + the 'elias'/
  // 'emmanuel'/'elizabeth' allowlist -- same shape as site_visits itself
  // -- so listVisitsWithStatus() intentionally does an UNFILTERED query
  // against site_visits/invites/submissions, relying on RLS itself to
  // scope what comes back rather than an agent_key filter (which
  // wouldn't make sense here: this screen is for staff who can already
  // see every visit, not "my own"). token is server-generated (real
  // column default), never passed in from the client.
  sve: {
    listVisitsWithStatus(): Promise<SveVisitStatus[]>;
    createInvite(siteVisitId: string, clientName: string, clientContact: string, sentBy: string): Promise<SveInviteRecord>;
    // Real table `sve_report_links` -- mirrors payments.issueReceiptLink()
    // exactly (upload the PDF, insert a row, return its server-generated
    // token) for the AI-assisted report a staff member sends Management
    // after reviewing a client's Site Visit Experience feedback. Also
    // stamps report_pdf_path/report_sent_at on the submission itself so
    // the UI knows a report already went out.
    issueReportLink(submissionId: string, pdfBlob: Blob, createdBy: string, createdByName: string): Promise<string>;
    // Real table `sve_day_reports` -- one row per site-visit day, covering
    // every client visited that day (not one row per submission). Real
    // user ask: "the report isn't supposed to be for a single client
    // after client but a full report after every site visit." Same
    // getOrCreate/save shape as weeklyVisitForms.
    getOrCreateDayReport(visitDate: string): Promise<SveDayReport>;
    saveDayReport(id: string, patch: SveDayReportPatch): Promise<SveDayReport>;
    listDayReports(): Promise<SveDayReport[]>;
    // Same tokenized-share pattern as issueReportLink above, pointed at a
    // day report instead of a single submission (sve_report_links.
    // day_report_id, added alongside the existing nullable submission_id).
    issueDayReportLink(dayReportId: string, pdfBlob: Blob, createdBy: string, createdByName: string): Promise<string>;
  };
  // Real table `messages` -- strictly 1:1 staff-to-staff, kind IS NULL
  // rows only (the same table also carries system notifications with a
  // real `kind` set, deliberately left alone here). See the ChatMessage
  // type's comment in types/domain.ts for the read-receipt RLS fix
  // (messages_upd_recipient) applied this session.
  chat: {
    listConversations(myKey: string): Promise<ChatConversation[]>;
    listThread(myKey: string, otherKey: string): Promise<ChatMessage[]>;
    send(myKey: string, myName: string, otherKey: string, body: string, replyToId?: string | null): Promise<ChatMessage>;
    markThreadRead(myKey: string, otherKey: string): Promise<void>;
  };
  // The system-notification half of the same `messages` table chat.*
  // above deliberately leaves alone (kind IS NOT NULL rows). A
  // notification is just a message with a real `kind`/`refType`/`refId`
  // set and no thread concept -- chat.listConversations()/listThread()
  // already exclude these via .is('kind', null), so the two inboxes can
  // never leak into each other. RLS is unchanged (messages_ins still
  // requires sender_key = my_key()), so notify() always sends as the
  // real acting staff member who triggered it, never a fabricated
  // 'system' sender -- e.g. the agent whose allocation request just went
  // in is the sender_key on the notification that reaches Management.
  notifications: {
    list(myKey: string): Promise<ChatMessage[]>;
    unreadCount(myKey: string): Promise<number>;
    markRead(id: string): Promise<void>;
    markAllRead(myKey: string): Promise<void>;
    notify(fromKey: string, fromName: string, toKeys: string[], body: string, kind: string, refType?: string | null, refId?: string | null): Promise<void>;
  };
}

let cachedLive: DataSource | null = null;

// Trimmed from web-next's real src/data/source.ts -- this shell never
// runs demo mode (no localStorage demo layer copied over), so
// createDemoDataSource() was removed and getDataSource() always returns
// the real live implementation. Every method body inside
// createLiveDataSource() below is byte-for-byte the same real Supabase
// code web-next runs -- nothing here was rewritten, only the never-
// invoked demo half was dropped.
export function getDataSource(_demoMode?: boolean): DataSource {
  if (!cachedLive) cachedLive = createLiveDataSource();
  return cachedLive;
}

function createLiveDataSource(): DataSource {
  function requireClient() {
    const client = getSupabaseClient();
    if (!client) throw new Error('Supabase is not configured -- set VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY (see .env.local.example).');
    return client;
  }

  return {
    leads: {
      async listForAgent(agentKey) {
        // Real bug found live: no deleted_at filter here meant a manager
        // session (leads_sel RLS deliberately lets managers see
        // soft-deleted rows too, for audit) saw an archived lead as if it
        // were a real, pickable client everywhere useLeads() is used --
        // Allocations' own "Request allocation" search caught a
        // leftover archived test lead this way. Same fix already applied
        // to listCompany()/manager.overview() earlier this session.
        const { data, error } = await requireClient().from('leads').select('*').eq('agent_key', agentKey).is('deleted_at', null);
        if (error) throw error;
        return (data ?? []).map(mapLeadRow);
      },
      async create(agentKey, input) {
        // Master Spec Section 4.4: amt_paid is never a free field written
        // from form input -- always starts at 0 regardless of what the
        // caller's `input.amtPaid` says. A nonzero opening deposit becomes
        // a real Payment row instead, created by useCreateLead right after
        // this resolves (see that hook's own comment for why it isn't
        // folded into one call here: the lead must exist first to supply
        // payments.create() a real leadId).
        const grandTotal = input.grandTotal ?? computeGrandTotal(input.unitPrice, input.noPlots);
        const { data, error } = await requireClient()
          .from('leads')
          .insert({
            agent_key: agentKey,
            name: input.name,
            contact: input.contact,
            date_added: input.date || undefined,
            plot_type: input.plotType,
            no_plots: input.noPlots,
            unit_price: input.unitPrice,
            payment_plan: input.paymentPlan,
            amt_paid: 0,
            grand_total: grandTotal,
            net_total: input.netTotal ?? null,
            discount: input.discount ?? null,
            balance: grandTotal,
            stage: deriveStageFromPayment(0, grandTotal),
            notes: input.notes ?? null,
            lead_source: input.leadSource ?? null,
            banner_id: input.bannerId ?? null,
            priority: input.priority ?? null,
            address: input.address ?? null,
            site_visit: input.siteVisit ?? null,
            next_action: input.nextAction ?? null,
            deposit_target: input.depositTarget ?? null,
          })
          .select()
          .single();
        if (error) throw error;
        return mapLeadRow(data);
      },
      // Phase 2 punch-list item 4 ("import commit is not one transaction"):
      // the pipeline import used to insert a lead via create() and then
      // immediately patch its follow-up fields (stage/discount/priority/
      // etc.) via a SEPARATE update() call -- two independent REST round
      // trips per inserted row. If the second one failed (network blip,
      // RLS denial), the first had already committed, leaving a real lead
      // sitting in the database with none of its follow-up fields set and
      // no error attributing the row to that half-finished state clearly.
      // One INSERT statement is atomic on its own -- merging both steps
      // into a single insert closes that gap without needing a new RPC or
      // a cross-row all-or-nothing transaction (a bigger, more speculative
      // change the master spec's own wording doesn't clearly call for).
      async createWithFollowup(agentKey, input, followupPatch) {
        const grandTotal = computeGrandTotal(input.unitPrice, input.noPlots);
        const followupCols = buildLeadDbPatch(followupPatch);
        const { data, error } = await requireClient()
          .from('leads')
          .insert({
            agent_key: agentKey,
            name: input.name,
            contact: input.contact,
            plot_type: input.plotType,
            no_plots: input.noPlots,
            unit_price: input.unitPrice,
            payment_plan: input.paymentPlan,
            amt_paid: 0,
            grand_total: grandTotal,
            balance: grandTotal,
            stage: deriveStageFromPayment(0, grandTotal),
            notes: input.notes ?? null,
            ...followupCols,
          })
          .select()
          .single();
        if (error) throw error;
        return mapLeadRow(data);
      },
      // Same reasoning as createWithFollowup above, for the update path:
      // a reassignment (assign()) followed by a separate patch (update())
      // used to be two independent REST calls; merged into one UPDATE.
      async reassignAndUpdate(id, agentKey, patch) {
        const dbPatch = buildLeadDbPatch(patch);
        if (agentKey) dbPatch.agent_key = agentKey;
        const { data, error } = await requireClient().from('leads').update(dbPatch).eq('id', id).select().single();
        if (error) throw error;
        return mapLeadRow(data);
      },
      async get(agentKey, id) {
        const { data, error } = await requireClient().from('leads').select('*').eq('agent_key', agentKey).eq('id', id).maybeSingle();
        if (error) throw error;
        return data ? mapLeadRow(data) : undefined;
      },
      async listAll() {
        // Real bug found live: Home dashboard's own leads query already
        // filtered deleted_at (fixed earlier this session), but this one
        // -- which powers Master Pipeline, Client Database, Log Payment's
        // lead search, and Referrals' lead picker via useAllLeads()/
        // useAllLeadsForLinking() -- didn't, so Master Pipeline/Client
        // Database showed a real, different (higher) total lead count
        // than Home. useLead()'s own fallback through this same method
        // already documents the intended behavior: a deleted lead should
        // "vanish from a subsequent refetch," not keep appearing here.
        const { data, error } = await requireClient().from('leads').select('*').is('deleted_at', null).order('name');
        if (error) throw error;
        return (data ?? []).map(mapLeadRow);
      },
      async listCompany() {
        const { data, error } = await requireClient().from('leads').select('*').eq('agent_key', 'company').is('deleted_at', null).order('date_added', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(mapLeadRow);
      },
      async assign(id, agentKey) {
        const { data, error } = await requireClient().from('leads').update({ agent_key: agentKey }).eq('id', id).select().single();
        if (error) throw error;
        return mapLeadRow(data);
      },
      async assignHandler(id, agentKey) {
        const { data, error } = await requireClient().from('leads').update({ assigned_agent_key: agentKey }).eq('id', id).select().single();
        if (error) throw error;
        return mapLeadRow(data);
      },
      async setSource(id, source) {
        const { data, error } = await requireClient().from('leads').update({ lead_source: source }).eq('id', id).select().single();
        if (error) throw error;
        return mapLeadRow(data);
      },
      async update(id, patch) {
        const dbPatch = buildLeadDbPatch(patch);
        // Real optimistic-concurrency guard (Master Spec Section 3.4's own
        // worked example) -- opt-in via patch.expectedVersion. With it, the
        // WHERE clause only matches the row the caller actually loaded; if
        // someone else's update landed first, version has already moved on
        // and this UPDATE affects zero rows, so .single() throws PGRST116
        // ("no rows"), which we translate into a real stale_version conflict
        // rather than letting the caller silently overwrite unseen changes.
        let query = requireClient().from('leads').update(dbPatch).eq('id', id);
        if (patch.expectedVersion != null) query = query.eq('version', patch.expectedVersion);
        const { data, error } = await query.select().single();
        if (error) {
          if (patch.expectedVersion != null && error.code === 'PGRST116') throw friendlyErrorObj('This record has already been updated by another user. Refresh and review the latest version before saving.');
          throw error;
        }
        return mapLeadRow(data);
      },
      async updateDocStage(id, stage) {
        const { error } = await requireClient().rpc('update_lead_doc_stage', { p_lead_id: id, p_stage: stage });
        if (error) throw error;
      },
      async remove(id, reason, deletedBy, deletedByName) {
        // Real SECURITY DEFINER RPC (added this session) -- soft-deletes
        // the lead (matches legacy's real apiDeleteLead(), index.html:
        // 4622-4629) AND vacates any plot(s) currently Allocated to this
        // lead's own allocation_request(s) back to Available, reverting
        // those requests to Pending with a real history entry rather
        // than leaving a plot permanently locked out of resale just
        // because the client record was archived -- a real gap the user
        // caught live (danger-zone reason text already implied this, the
        // actual delete path never did it). Also writes the audit event
        // itself now (was a separate fire-and-forget RPC call before),
        // so archiving and vacating are one atomic transaction.
        const { error } = await requireClient().rpc('archive_lead_and_vacate', { p_lead_id: id, p_reason: reason, p_deleted_by: deletedBy, p_deleted_by_name: deletedByName });
        if (error) throw error;
      },
      async listArchived() {
        // Explicit filter needed here even though RLS already restricts
        // this to managers -- leads_sel's own WHERE lets BOTH active and
        // archived rows through for a manager, so a plain select('*')
        // would mix them.
        const { data, error } = await requireClient().from('leads').select('*').not('deleted_at', 'is', null).order('deleted_at', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(mapLeadRow);
      },
      async restore(id) {
        const { data, error } = await requireClient().from('leads').update({ deleted_at: null }).eq('id', id).select().single();
        if (error) throw error;
        requireClient()
          .rpc('record_audit_event', { p_category: 'audit', p_event_type: 'lead.restored', p_severity: 'info', p_entity_type: 'lead', p_entity_id: id, p_summary: `${data.name} was restored from the archive`, p_detail: null })
          .then(({ error: auditError }) => {
            if (auditError) console.error('record_audit_event failed', auditError);
          });
        return mapLeadRow(data);
      },
    },
    payments: {
      async listForAgent(agentKey) {
        const { data, error } = await requireClient().from('payments').select('*').eq('agent_key', agentKey);
        if (error) throw error;
        return (data ?? []).map(mapPaymentRow);
      },
      async listForLead(leadId) {
        const { data, error } = await requireClient().from('payments').select('*').eq('lead_id', leadId);
        if (error) throw error;
        return (data ?? []).map(mapPaymentRow);
      },
      async listAll() {
        const { data, error } = await requireClient().from('payments').select('*');
        if (error) throw error;
        return (data ?? []).map(mapPaymentRow);
      },
      async listPending() {
        const { data, error } = await requireClient().from('payments').select('*').eq('status', 'pending').order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(mapPaymentRow);
      },
      async create(input, leadName, leadAgentKey, requestedStatus) {
        const { data, error } = await requireClient()
          .from('payments')
          .insert({
            lead_id: input.leadId,
            agent_key: leadAgentKey,
            client_name: leadName,
            amount: input.amount,
            payment_date: input.paymentDate ?? new Date().toISOString().slice(0, 10),
            payment_method: input.paymentMethod ?? null,
            note: input.note ?? null,
            status: requestedStatus,
            reference_number: input.referenceNumber ?? null,
          })
          .select()
          .single();
        if (error) throw error;
        const payment = mapPaymentRow(data);
        // Mirrors applyApprovedPaymentToLead() exactly for the manager-
        // self-approves case -- allocation_requests creation and the
        // client thank-you SMS are the RPC's job for the review-and-
        // approve path below, deliberately not replicated here (no SMS
        // provider wired anywhere in this app; allocation_requests is a
        // distinct, larger unbuilt feature).
        if (requestedStatus === 'approved') {
          const { data: leadRow, error: leadError } = await requireClient().from('leads').select('amt_paid,grand_total').eq('id', input.leadId).single();
          if (leadError) throw leadError;
          const newAmtPaid = Number(leadRow.amt_paid ?? 0) + input.amount;
          const grandTotal = Number(leadRow.grand_total ?? 0);
          const newBalance = Math.max(grandTotal - newAmtPaid, 0);
          const newStage = deriveStageFromPayment(newAmtPaid, grandTotal);
          const { error: updError } = await requireClient().from('leads').update({ amt_paid: newAmtPaid, balance: newBalance, stage: newStage }).eq('id', input.leadId);
          if (updError) throw updError;
        }
        return payment;
      },
      // Deliberately the ONLY path that can move a payment out of
      // 'pending' -- both call the real production RPCs, never a raw
      // UPDATE. A raw update would satisfy RLS/the trigger fine (manager
      // role passes both) but would silently skip the lead balance
      // recompute, activity_log write, agent notification, and
      // allocation-threshold check that approve_payment does atomically
      // server-side -- exactly the class of bug this project's own
      // history warns about.
      async approve(paymentId) {
        const { data, error } = await requireClient().rpc('approve_payment', { p_payment_id: paymentId });
        if (error) throw error;
        const a = data.allocation;
        return {
          decidedBy: data.decided_by,
          decidedByName: data.decided_by_name,
          newAmtPaid: Number(data.new_amt_paid),
          newBalance: Number(data.new_balance),
          autoAllocation: a
            ? { id: a.id, leadId: a.leadId, clientName: a.clientName, agentKey: a.agentKey, agentName: a.agentName, agentPhone: a.agentPhone ?? null }
            : undefined,
        };
      },
      async decline(paymentId, _decidedBy, _decidedByName, reason) {
        const { error } = await requireClient().rpc('decline_payment', { p_payment_id: paymentId, p_reason: reason ?? null });
        if (error) throw error;
      },
      async listNeedsCorrection() {
        const { data, error } = await requireClient().from('payments').select('*').eq('status', 'needs_correction').order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(mapPaymentRow);
      },
      async flagNeedsCorrection(paymentId, reason) {
        const { error } = await requireClient().rpc('flag_payment_needs_correction', { p_payment_id: paymentId, p_reason: reason });
        if (error) throw error;
      },
      async resubmit(paymentId, input) {
        const { error } = await requireClient().rpc('resubmit_payment', {
          p_payment_id: paymentId,
          p_amount: input.amount,
          p_payment_method: input.paymentMethod ?? null,
          p_note: input.note ?? null,
          p_receipt_proof_path: input.receiptProofPath ?? null,
        });
        if (error) throw error;
      },
      async ensureReceiptNumber(paymentId) {
        const { data, error } = await requireClient().rpc('ensure_receipt_number', { p_payment_id: paymentId, p_channel: 'download' });
        if (error) throw error;
        return data as string;
      },
      async uploadProof(paymentId, agentKey, file) {
        const client = requireClient();
        const ext = file.name.split('.').pop() || 'jpg';
        const path = `${agentKey}/${paymentId}.${ext}`;
        const { error: uploadError } = await client.storage.from('payment-proofs').upload(path, file, { upsert: true });
        if (uploadError) throw uploadError;
        const { error: updError } = await client.from('payments').update({ receipt_proof_path: path }).eq('id', paymentId);
        if (updError) throw updError;
        return path;
      },
      async resolveProofUrl(path) {
        if (path.startsWith('data:')) return path;
        const { data, error } = await requireClient().storage.from('payment-proofs').createSignedUrl(path, 300);
        if (error) throw error;
        return data?.signedUrl ?? null;
      },
      async issueReceiptLink(paymentId, pdfBlob, createdBy) {
        const client = requireClient();
        const path = `${paymentId}/receipt-${Date.now()}.pdf`;
        const { error: uploadError } = await client.storage.from('payment-receipts').upload(path, pdfBlob, { contentType: 'application/pdf', upsert: true });
        if (uploadError) throw uploadError;
        const { data, error } = await client.from('receipt_share_links').insert({ payment_id: paymentId, storage_path: path, created_by: createdBy }).select('token').single();
        if (error) throw error;
        return data.token as string;
      },
    },
    scheduleItems: {
      async listForAgentOnDate(agentKey, date) {
        const { data, error } = await requireClient().from('schedule_items').select('*').eq('kind', 'todo').eq('assigned_to', agentKey).eq('item_date', date);
        if (error) throw error;
        return (data ?? []).map(mapScheduleItemRow);
      },
      async listForAgentInRange(agentKey, fromDate, toDate) {
        const { data, error } = await requireClient()
          .from('schedule_items')
          .select('*')
          .or(`assigned_to.eq.${agentKey},owner_key.eq.${agentKey}`)
          .gte('item_date', fromDate)
          .lte('item_date', toDate);
        if (error) throw error;
        return (data ?? []).map(mapScheduleItemRow);
      },
      async listAllInRange(fromDate, toDate) {
        const { data, error } = await requireClient().from('schedule_items').select('*').gte('item_date', fromDate).lte('item_date', toDate);
        if (error) throw error;
        return (data ?? []).map(mapScheduleItemRow);
      },
      async create(agentKey, date, title, assignedTo) {
        const { data, error } = await requireClient()
          .from('schedule_items')
          .insert({ kind: 'todo', owner_key: agentKey, assigned_to: assignedTo ?? agentKey, item_date: date, title, status: 'open' })
          .select()
          .single();
        if (error) throw error;
        return mapScheduleItemRow(data);
      },
      async update(id, patch) {
        const dbPatch: Record<string, unknown> = {};
        if ('title' in patch) dbPatch.title = patch.title;
        if ('description' in patch) dbPatch.description = patch.description;
        if ('notes' in patch) dbPatch.notes = patch.notes;
        if ('category' in patch) dbPatch.category = patch.category;
        if ('priority' in patch) dbPatch.priority = patch.priority;
        if ('date' in patch) dbPatch.item_date = patch.date;
        if ('dueDate' in patch) dbPatch.due_date = patch.dueDate;
        if ('startTime' in patch) dbPatch.start_time = patch.startTime;
        if ('endTime' in patch) dbPatch.end_time = patch.endTime;
        if ('linkedLeadId' in patch) dbPatch.linked_lead_id = patch.linkedLeadId;
        if ('linkedSiteVisitId' in patch) dbPatch.linked_site_visit_id = patch.linkedSiteVisitId;
        if ('blockedById' in patch) dbPatch.blocked_by_id = patch.blockedById;
        const { data, error } = await requireClient().from('schedule_items').update(dbPatch).eq('id', id).select().single();
        if (error) throw error;
        return mapScheduleItemRow(data);
      },
      async updateStatus(id, status, actorKey, actorName) {
        const client = requireClient();
        const existing = await client.from('schedule_items').select('*').eq('id', id).single();
        if (existing.error) throw existing.error;
        const fromDbStatus = existing.data.status as string;
        const dbStatus = domainStatusToDb(status);
        const patch: Record<string, unknown> = { status: dbStatus };
        if (dbStatus === 'done') patch.completed_at = new Date().toISOString();
        else if (fromDbStatus === 'done') patch.completed_at = null;
        if (dbStatus === 'cancelled') patch.cancelled_at = new Date().toISOString();
        const { data, error } = await client.from('schedule_items').update(patch).eq('id', id).select().single();
        if (error) throw error;
        await client.from('task_events').insert({ task_id: id, type: 'status_changed', actor_key: actorKey, actor_name: actorName, from_key: fromDbStatus, to_key: dbStatus }).then(
          () => {},
          () => {}
        );
        if (dbStatus === 'done') {
          // Real enforcement of Master Spec 10.2's dependency gate in
          // reverse: a task blocked on this one becomes ready the moment
          // this one is actually done, not left stuck on 'blocked' forever.
          await client.from('schedule_items').update({ status: 'open' }).eq('blocked_by_id', id).eq('status', 'blocked');

          // Real spawn of the next recurring instance -- a fresh row with
          // its own id (so its own task_events/attachments start empty,
          // "without duplicating history"), recurs_parent_id pointing at
          // the ORIGINAL instance (not this one, if this itself was
          // already a spawned instance) so the whole series stays linkable.
          const freq = existing.data.recurs_freq as 'daily' | 'weekly' | 'monthly' | null;
          if (freq) {
            const baseDate = (existing.data.item_date as string) ?? (existing.data.due_date as string) ?? new Date().toISOString().slice(0, 10);
            const interval = Number(existing.data.recurs_interval ?? 1) || 1;
            const nextDate = nextRecurrenceDate(baseDate, freq, interval);
            const until = existing.data.recurs_until as string | null;
            if (!until || nextDate <= until) {
              const spawn = await client
                .from('schedule_items')
                .insert({
                  kind: existing.data.kind,
                  owner_key: existing.data.owner_key,
                  owner_name: existing.data.owner_name,
                  assigned_to: existing.data.assigned_to,
                  assigned_to_name: existing.data.assigned_to_name,
                  assigned_by: existing.data.assigned_by,
                  assigned_by_name: existing.data.assigned_by_name,
                  title: existing.data.title,
                  description: existing.data.description,
                  notes: existing.data.notes,
                  category: existing.data.category,
                  priority: existing.data.priority,
                  item_date: existing.data.item_date ? nextDate : null,
                  due_date: existing.data.due_date ? nextDate : null,
                  start_time: existing.data.start_time,
                  end_time: existing.data.end_time,
                  recurs_freq: freq,
                  recurs_interval: interval,
                  recurs_until: until,
                  recurs_parent_id: (existing.data.recurs_parent_id as string | null) ?? id,
                  status: 'open',
                })
                .select()
                .single();
              if (!spawn.error) {
                await client.from('task_events').insert({ task_id: spawn.data.id, type: 'created', actor_key: actorKey, actor_name: actorName, note: 'Recurring instance' }).then(
                  () => {},
                  () => {}
                );
              }
            }
          }
        }
        return mapScheduleItemRow(data);
      },
      async listTasksForAgent(agentKey) {
        const { data, error } = await requireClient().from('schedule_items').select('*').eq('kind', 'task').eq('assigned_to', agentKey).order('due_date', { ascending: true, nullsFirst: false });
        if (error) throw error;
        return (data ?? []).map(mapScheduleItemRow);
      },
      async listAllTasks() {
        const { data, error } = await requireClient().from('schedule_items').select('*').eq('kind', 'task').order('due_date', { ascending: true, nullsFirst: false });
        if (error) throw error;
        return (data ?? []).map(mapScheduleItemRow);
      },
      async createTask(ownerKey, ownerName, input) {
        const client = requireClient();
        let initialStatus = 'open';
        if (input.blockedById) {
          const pred = await client.from('schedule_items').select('status').eq('id', input.blockedById).maybeSingle();
          if (pred.data && pred.data.status !== 'done') initialStatus = 'blocked';
        }
        const { data, error } = await client
          .from('schedule_items')
          .insert({
            kind: 'task',
            owner_key: ownerKey,
            owner_name: ownerName,
            assigned_to: input.assignedTo,
            assigned_to_name: input.assignedToName,
            assigned_by: ownerKey,
            assigned_by_name: ownerName,
            title: input.title,
            description: input.description ?? null,
            notes: input.notes ?? null,
            category: input.category ?? null,
            priority: input.priority ?? null,
            due_date: input.dueDate ?? null,
            start_time: input.startTime ?? null,
            end_time: input.endTime ?? null,
            linked_lead_id: input.linkedLeadId ?? null,
            linked_site_visit_id: input.linkedSiteVisitId ?? null,
            blocked_by_id: input.blockedById ?? null,
            recurs_freq: input.recursFreq ?? null,
            recurs_interval: input.recursInterval ?? null,
            recurs_until: input.recursUntil ?? null,
            tags: input.tags ?? [],
            status: initialStatus,
          })
          .select()
          .single();
        if (error) throw error;
        await client.from('task_events').insert({ task_id: data.id, type: 'created', actor_key: ownerKey, actor_name: ownerName }).then(
          () => {},
          () => {}
        );
        return mapScheduleItemRow(data);
      },
      async reassignTask(id, toKey, toName, byKey, byName, reason) {
        const client = requireClient();
        const existing = await client.from('schedule_items').select('assigned_to,assigned_to_name').eq('id', id).single();
        if (existing.error) throw existing.error;
        const { data, error } = await client
          .from('schedule_items')
          .update({ assigned_to: toKey, assigned_to_name: toName, assigned_by: byKey, assigned_by_name: byName })
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        await client
          .from('task_events')
          .insert({ task_id: id, type: 'reassigned', actor_key: byKey, actor_name: byName, from_key: existing.data.assigned_to, from_name: existing.data.assigned_to_name, to_key: toKey, to_name: toName, note: reason || null })
          .then(
            () => {},
            () => {}
          );
        return mapScheduleItemRow(data);
      },
      async createMeeting(ownerKey, ownerName, input) {
        const client = requireClient();
        const { data, error } = await client
          .from('schedule_items')
          .insert({
            kind: 'meeting',
            owner_key: ownerKey,
            owner_name: ownerName,
            assigned_to: ownerKey,
            assigned_to_name: ownerName,
            title: input.title,
            description: input.description ?? null,
            item_date: input.date,
            start_time: input.startTime,
            end_time: input.endTime,
            meeting_location: input.meetingLocation ?? null,
            status: 'open',
          })
          .select()
          .single();
        if (error) throw error;
        if (input.inviteeKeys.length > 0) {
          const { error: inviteErr } = await client.from('schedule_item_invitees').insert(input.inviteeKeys.map((staffKey) => ({ schedule_item_id: data.id, staff_key: staffKey })));
          if (inviteErr) throw inviteErr;
        }
        return mapScheduleItemRow(data);
      },
      async listMeetingsForAgent(agentKey, fromDate, toDate) {
        const client = requireClient();
        const [ownedRes, inviteeRes] = await Promise.all([
          client.from('schedule_items').select('*').eq('kind', 'meeting').eq('owner_key', agentKey).gte('item_date', fromDate).lte('item_date', toDate),
          client.from('schedule_item_invitees').select('schedule_item_id').eq('staff_key', agentKey),
        ]);
        if (ownedRes.error) throw ownedRes.error;
        if (inviteeRes.error) throw inviteeRes.error;
        const invitedIds = (inviteeRes.data ?? []).map((r) => r.schedule_item_id as string);
        let invited: Record<string, unknown>[] = [];
        if (invitedIds.length > 0) {
          const invitedRes = await client.from('schedule_items').select('*').eq('kind', 'meeting').in('id', invitedIds).gte('item_date', fromDate).lte('item_date', toDate);
          if (invitedRes.error) throw invitedRes.error;
          invited = invitedRes.data ?? [];
        }
        const byId = new Map<string, Record<string, unknown>>();
        [...(ownedRes.data ?? []), ...invited].forEach((r) => byId.set(r.id as string, r));
        return [...byId.values()].map(mapScheduleItemRow);
      },
      async checkConflicts(staffKeys, date, startTime, endTime, excludeId) {
        const { data, error } = await requireClient().rpc('check_schedule_conflicts', {
          p_staff_keys: staffKeys,
          p_date: date,
          p_start: startTime,
          p_end: endTime,
          p_exclude_id: excludeId ?? null,
        });
        if (error) throw error;
        return (data ?? []).map((r: { staff_key: string; has_conflict: boolean }) => ({ staffKey: r.staff_key, hasConflict: !!r.has_conflict }));
      },
    },
    scheduleItemInvitees: {
      async listForItem(scheduleItemId) {
        const { data, error } = await requireClient().from('schedule_item_invitees').select('*').eq('schedule_item_id', scheduleItemId);
        if (error) throw error;
        return (data ?? []).map(mapScheduleItemInviteeRow);
      },
      async respond(inviteeId, status) {
        const { data, error } = await requireClient().from('schedule_item_invitees').update({ status, responded_at: new Date().toISOString() }).eq('id', inviteeId).select().single();
        if (error) throw error;
        return mapScheduleItemInviteeRow(data);
      },
    },
    taskEvents: {
      async listForTask(taskId) {
        const { data, error } = await requireClient().from('task_events').select('*').eq('task_id', taskId).order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(mapTaskEventRow);
      },
      async log(taskId, type, actorKey, actorName, extra) {
        const { error } = await requireClient()
          .from('task_events')
          .insert({ task_id: taskId, type, actor_key: actorKey, actor_name: actorName, from_key: extra?.fromKey ?? null, from_name: extra?.fromName ?? null, to_key: extra?.toKey ?? null, to_name: extra?.toName ?? null, note: extra?.note ?? null });
        if (error) throw error;
      },
    },
    scheduleItemAttachments: {
      async listForItem(scheduleItemId) {
        const { data, error } = await requireClient().from('schedule_item_attachments').select('*').eq('schedule_item_id', scheduleItemId).order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(mapScheduleItemAttachmentRow);
      },
      async upload(scheduleItemId, file, fileName, contentType, uploadedBy, uploadedByName) {
        const client = requireClient();
        const path = `${scheduleItemId}/${Date.now()}-${fileName}`;
        const { error: uploadError } = await client.storage.from('task-attachments').upload(path, file, { contentType, upsert: false });
        if (uploadError) throw uploadError;
        const { data, error } = await client
          .from('schedule_item_attachments')
          .insert({ schedule_item_id: scheduleItemId, file_name: fileName, storage_path: path, content_type: contentType, uploaded_by: uploadedBy, uploaded_by_name: uploadedByName })
          .select()
          .single();
        if (error) throw error;
        return mapScheduleItemAttachmentRow(data);
      },
      async getUrl(storagePath) {
        const { data, error } = await requireClient().storage.from('task-attachments').createSignedUrl(storagePath, 300);
        if (error) return null;
        return data?.signedUrl ?? null;
      },
      async remove(attachmentId, storagePath) {
        const client = requireClient();
        await client.storage.from('task-attachments').remove([storagePath]);
        const { error } = await client.from('schedule_item_attachments').delete().eq('id', attachmentId);
        if (error) throw error;
      },
    },
    streaks: {
      async history(staffKey, days) {
        const from = new Date();
        from.setDate(from.getDate() - days);
        const fromIso = from.toISOString().slice(0, 10);
        const { data, error } = await requireClient().from('staff_streaks').select('*').eq('staff_key', staffKey).gte('streak_date', fromIso);
        if (error) throw error;
        return (data ?? []).map(mapStreakRow);
      },
      async markToday(staffKey, patch) {
        const t = today();
        const dayMet = !!patch.todoLogged;
        const { data, error } = await requireClient()
          .from('staff_streaks')
          .upsert(
            {
              staff_key: staffKey,
              streak_date: t,
              todo_logged_by_deadline: !!patch.todoLogged,
              lead_added: !!patch.leadAdded,
              site_visit_booked: !!patch.siteVisitBooked,
              streak_day_met: dayMet,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'staff_key,streak_date' },
          )
          .select()
          .single();
        if (error) throw error;
        return mapStreakRow(data);
      },
    },
    config: {
      async get() {
        const { data, error } = await requireClient().from('app_config').select('*').eq('id', 1).single();
        if (error) throw error;
        return mapConfigRow(data);
      },
      async update(patch) {
        const dbPatch: Record<string, unknown> = {};
        if (patch.leaderboardWeights !== undefined) dbPatch.leaderboard_weights = patch.leaderboardWeights;
        if (patch.commissionFullCap !== undefined) dbPatch.commission_full_cap = patch.commissionFullCap;
        if (patch.commissionHalfCap !== undefined) dbPatch.commission_half_cap = patch.commissionHalfCap;
        if (patch.commissionPoolPerPlot !== undefined) dbPatch.commission_pool_per_plot = patch.commissionPoolPerPlot;
        if (patch.allocationThresholdPct !== undefined) dbPatch.allocation_threshold_pct = patch.allocationThresholdPct;
        if (patch.fullPrice !== undefined) dbPatch.full_price = patch.fullPrice;
        if (patch.halfPrice !== undefined) dbPatch.half_price = patch.halfPrice;
        if (patch.fullDiscount !== undefined) dbPatch.full_discount = patch.fullDiscount;
        if (patch.halfDiscount !== undefined) dbPatch.half_discount = patch.halfDiscount;
        if (patch.int3 !== undefined) dbPatch.int_3 = patch.int3;
        if (patch.int6 !== undefined) dbPatch.int_6 = patch.int6;
        if (patch.int9 !== undefined) dbPatch.int_9 = patch.int9;
        if (patch.int12 !== undefined) dbPatch.int_12 = patch.int12;
        if (patch.techFullPlotLengthFt !== undefined) dbPatch.tech_full_plot_length_ft = patch.techFullPlotLengthFt;
        if (patch.techFullPlotWidthFt !== undefined) dbPatch.tech_full_plot_width_ft = patch.techFullPlotWidthFt;
        if (patch.techHalfPlotLengthFt !== undefined) dbPatch.tech_half_plot_length_ft = patch.techHalfPlotLengthFt;
        if (patch.techHalfPlotWidthFt !== undefined) dbPatch.tech_half_plot_width_ft = patch.techHalfPlotWidthFt;
        // Real gap found 2026-09-05 auditing Phase 6 (Attendance + Leave):
        // these columns were already read by mapConfigRow and consumed by
        // AttendanceScreen/leaveLogic, but never whitelisted here for
        // WRITING -- a Management settings UI built on top of update()
        // as it stood would have silently dropped every one of these
        // fields, the exact "no Settings UI exists" gap traced to its
        // real root cause instead of just re-adding a UI on the same bug.
        if (patch.officeLat !== undefined) dbPatch.office_lat = patch.officeLat;
        if (patch.officeLng !== undefined) dbPatch.office_lng = patch.officeLng;
        if (patch.officeRadiusMeters !== undefined) dbPatch.office_radius_meters = patch.officeRadiusMeters;
        if (patch.attendanceCutoffTime !== undefined) dbPatch.attendance_cutoff_time = patch.attendanceCutoffTime;
        if (patch.workStartTime !== undefined) dbPatch.work_start_time = patch.workStartTime;
        if (patch.workEndTime !== undefined) dbPatch.work_end_time = patch.workEndTime;
        if (patch.workDays !== undefined) dbPatch.work_days = patch.workDays;
        if (patch.leaveTotalDays !== undefined) dbPatch.leave_total_days = patch.leaveTotalDays;
        if (patch.eidObservingStaff !== undefined) dbPatch.eid_observing_staff = patch.eidObservingStaff;
        if (patch.eidWindows !== undefined) dbPatch.eid_windows = patch.eidWindows;
        const { data, error } = await requireClient().from('app_config').update(dbPatch).eq('id', 1).select().single();
        if (error) throw error;
        return mapConfigRow(data);
      },
    },
    plots: {
      async list() {
        const { data, error } = await requireClient().from('plots').select('*').order('site').order('plot_number');
        if (error) throw error;
        return (data ?? []).map(mapPlotRow);
      },
      async create(input) {
        const { data, error } = await requireClient()
          .from('plots')
          .insert({ site: input.site, plot_number: input.plotNumber, plot_type: input.plotType, status: input.status, price: input.price ?? null, client_name: input.clientName ?? null, client_contact: input.clientContact ?? null, agent_key: input.agentKey ?? null, notes: input.notes ?? null, section: input.section ?? null, width_ft: input.widthFt ?? null, length_ft: input.lengthFt ?? null, factor: input.factor ?? null, customer_code: input.customerCode ?? null })
          .select()
          .single();
        if (error) throw error;
        return mapPlotRow(data);
      },
      async update(id, patch) {
        const dbPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if ('status' in patch) dbPatch.status = patch.status;
        if ('plotType' in patch) dbPatch.plot_type = patch.plotType;
        if ('price' in patch) dbPatch.price = patch.price;
        if ('clientName' in patch) dbPatch.client_name = patch.clientName;
        if ('clientContact' in patch) dbPatch.client_contact = patch.clientContact;
        if ('agentKey' in patch) dbPatch.agent_key = patch.agentKey;
        if ('notes' in patch) dbPatch.notes = patch.notes;
        if ('section' in patch) dbPatch.section = patch.section;
        if ('widthFt' in patch) dbPatch.width_ft = patch.widthFt;
        if ('lengthFt' in patch) dbPatch.length_ft = patch.lengthFt;
        if ('factor' in patch) dbPatch.factor = patch.factor;
        if ('customerCode' in patch) dbPatch.customer_code = patch.customerCode;
        const { data, error } = await requireClient().from('plots').update(dbPatch).eq('id', id).select().single();
        if (error) throw error;
        return mapPlotRow(data);
      },
      async remove(id) {
        const { error } = await requireClient().from('plots').delete().eq('id', id);
        if (error) throw error;
      },
      async split(plotId) {
        const { data, error } = await requireClient().rpc('split_plot_for_half_sale', { p_plot_id: plotId });
        if (error) throw error;
        const r = data as { alreadySplit: boolean; plotA: Record<string, unknown> | null; plotB: Record<string, unknown> | null };
        const norm = (x: Record<string, unknown> | null): Plot | null =>
          x
            ? {
                id: x.id as string,
                plotNumber: x.plotNumber as string,
                status: x.status as Plot['status'],
                plotType: x.plotType as Plot['plotType'],
                price: x.price == null ? null : Number(x.price),
                site: '',
                clientName: null,
                clientContact: null,
                agentKey: null,
                notes: null,
                unitKind: 'half',
                parentPlotId: plotId,
                // Dimensions deliberately null on both halves -- same
                // reasoning as the demo-mode split (see that code's own
                // comment): no real geometry source to halve from yet.
                section: (x.section as string) ?? null,
                widthFt: null,
                lengthFt: null,
                areaSqft: null,
                factor: 0.5,
                customerCode: null,
              }
            : null;
        return { alreadySplit: r.alreadySplit, plotA: norm(r.plotA), plotB: norm(r.plotB) };
      },
    },
    siteVisits: {
      async listForAgent(agentKey) {
        const { data, error } = await requireClient().from('site_visits').select('*').eq('agent_key', agentKey).is('deleted_at', null).order('visit_date', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(mapSiteVisitRow);
      },
      async listAll() {
        const { data, error } = await requireClient().from('site_visits').select('*').is('deleted_at', null).order('visit_date', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(mapSiteVisitRow);
      },
      async create(agentKey, agentName, input) {
        const { data, error } = await requireClient()
          .from('site_visits')
          .insert({
            agent_key: agentKey,
            agent_name: agentName,
            name: input.name,
            contact: input.contact,
            site: input.site,
            plot: input.plot ?? null,
            visit_date: input.visitDate,
            visit_time: input.visitTime ?? null,
            people: input.people ?? null,
            transport: input.transport ?? null,
            pickup: input.pickup ?? null,
            place_of_work: input.placeOfWork ?? null,
            position: input.position ?? null,
            nationality: input.nationality ?? null,
            purpose: input.purpose ?? null,
            discussion_so_far: input.discussionSoFar ?? null,
            key_understanding: input.keyUnderstanding ?? null,
            feedback_after: input.feedbackAfter ?? null,
            key_next_steps: input.keyNextSteps ?? null,
            source: input.source ?? null,
            accompanied: input.accompanied ?? null,
            notes: input.notes ?? null,
            lead_id: input.leadId ?? null,
          })
          .select()
          .single();
        if (error) throw error;
        return mapSiteVisitRow(data);
      },
      async listForLead(leadId) {
        const { data, error } = await requireClient().from('site_visits').select('*').eq('lead_id', leadId).is('deleted_at', null).order('visit_date', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(mapSiteVisitRow);
      },
      async cancel(id, reason, deletedBy, deletedByName) {
        const { data, error } = await requireClient()
          .from('site_visits')
          .update({ deleted_at: new Date().toISOString(), deleted_by: deletedBy, deleted_by_name: deletedByName, cancellation_reason: reason })
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        return mapSiteVisitRow(data);
      },
    },
    activityLog: {
      async listForLead(leadId) {
        const { data, error } = await requireClient().from('activity_log').select('*').eq('lead_id', leadId).order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(mapActivityLogRow);
      },
      async log(agentKey, agentName, client, action, detail, leadId) {
        const { error } = await requireClient()
          .from('activity_log')
          .insert({ agent_key: agentKey, agent_name: agentName, client, action, detail: detail ?? null, lead_id: leadId ?? null });
        // Never blocks the calling flow, same discipline as audit.log().
        if (error) console.error('activity_log insert failed', error);
      },
    },
    referrals: {
      // No agent_key column exists on this table -- RLS itself already
      // restricts a non-staff caller to rows whose referrer_lead_id
      // belongs to one of their own leads, so a plain select('*') is
      // correct here, not a gap. See the Referral type's comment.
      async listForAgent() {
        const { data, error } = await requireClient().from('referrals').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(mapReferralRow);
      },
      async linkLead(id, leadId) {
        const { data, error } = await requireClient().from('referrals').update({ referred_lead_id: leadId }).eq('id', id).select().single();
        if (error) throw error;
        return mapReferralRow(data);
      },
      async clear(id, points) {
        const { data, error } = await requireClient().rpc('clear_referral', { p_referral_id: id, p_points: points });
        if (error) throw error;
        return mapReferralRow(data as Record<string, unknown>);
      },
      async create(agentKey, input) {
        const client = requireClient();
        const { data: lead, error: leadError } = await client.from('leads').select('name,contact').eq('id', input.referrerLeadId).eq('agent_key', agentKey).single();
        if (leadError) throw leadError;
        const { data, error } = await client
          .from('referrals')
          .insert({
            referrer_lead_id: input.referrerLeadId,
            referrer_name: lead.name,
            referrer_contact: lead.contact,
            referred_name: input.referredName,
            referred_contact: input.referredContact,
            referred_location: input.referredLocation ?? null,
            referred_no_plots: input.referredNoPlots ?? 1,
            created_by_key: agentKey,
          })
          .select()
          .single();
        if (error) throw error;
        return mapReferralRow(data);
      },
    },
    enquiries: {
      // Same real fix as complaints -- an enquiry escalated via `owner`
      // must reach that colleague's own view (RLS updated the same day
      // to match, not just this client-side filter).
      async listForAgent(agentKey) {
        const { data, error } = await requireClient().from('enquiries').select('*').or(`agent_key.eq.${agentKey},owner.eq.${agentKey}`).order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(mapEnquiryRow);
      },
      async listAll() {
        const { data, error } = await requireClient().from('enquiries').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(mapEnquiryRow);
      },
      async create(agentKey, agentName, input) {
        const { data, error } = await requireClient()
          .from('enquiries')
          .insert({
            agent_key: agentKey,
            agent_name: agentName,
            name: input.name,
            contact: input.contact,
            location: input.location ?? null,
            types: input.types && input.types.length > 0 ? input.types.join(',') : null,
            plot: input.plot ?? null,
            source: input.source ?? null,
            details: input.details ?? null,
            follow: input.follow ?? null,
            follow_date: input.followDate ?? null,
          })
          .select()
          .single();
        if (error) throw error;
        return mapEnquiryRow(data);
      },
      async update(id, patch) {
        const { data, error } = await requireClient()
          .from('enquiries')
          .update({
            status: patch.status,
            owner: patch.owner,
            follow: patch.follow,
            follow_date: patch.followDate,
          })
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        return mapEnquiryRow(data);
      },
    },
    complaints: {
      // Same real fix as demo mode above -- a complaint whose `owner` was
      // reassigned to a colleague must reach that colleague's own view too.
      async listForAgent(agentKey) {
        const { data, error } = await requireClient().from('complaints').select('*').or(`agent_key.eq.${agentKey},owner.eq.${agentKey}`).order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(mapComplaintRow);
      },
      async listAll() {
        const { data, error } = await requireClient().from('complaints').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(mapComplaintRow);
      },
      async create(agentKey, agentName, input) {
        const { data, error } = await requireClient()
          .from('complaints')
          .insert({
            agent_key: agentKey,
            agent_name: agentName,
            name: input.name,
            contact: input.contact,
            plot: input.plot ?? null,
            category: input.category ?? null,
            details: input.details ?? null,
            priority: input.priority ?? null,
          })
          .select()
          .single();
        if (error) throw error;
        return mapComplaintRow(data);
      },
      async update(id, patch) {
        const { data, error } = await requireClient()
          .from('complaints')
          .update({
            status: patch.status,
            resolution: patch.resolution,
            priority: patch.priority,
            owner: patch.owner,
          })
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        return mapComplaintRow(data);
      },
    },
    contractRequests: {
      async list() {
        // Unfiltered on purpose -- contract_requests_sel RLS already scopes
        // this correctly per real session (own requests, or every request
        // for manager/elizabeth). viewerKey/viewerRole are unused here,
        // kept only so the interface matches demo mode's explicit scoping.
        const { data, error } = await requireClient().from('contract_requests').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(mapContractRequestRow);
      },
      async create(agentKey, agentName, input) {
        const { data, error } = await requireClient()
          .from('contract_requests')
          .insert({
            lead_id: input.leadId,
            client_name: input.clientName,
            requested_by: agentKey,
            requested_by_name: agentName,
            note: input.note ?? null,
            source: 'staff',
          })
          .select()
          .single();
        if (error) throw error;
        return mapContractRequestRow(data);
      },
      async fulfil(id) {
        const { data, error } = await requireClient().from('contract_requests').update({ status: 'fulfilled', fulfilled_at: new Date().toISOString() }).eq('id', id).select().single();
        if (error) throw error;
        return mapContractRequestRow(data);
      },
    },
    contracts: {
      async list() {
        const { data, error } = await requireClient().from('contracts').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(mapContractRow);
      },
      async create(leadId, clientName, agentKey, createdBy, createdByName) {
        const { data, error } = await requireClient()
          .from('contracts')
          .insert({ lead_id: leadId, client_name: clientName, agent_key: agentKey, created_by: createdBy, created_by_name: createdByName })
          .select()
          .single();
        if (error) throw error;
        return mapContractRow(data);
      },
    },
    contractTemplates: {
      async list() {
        const { data, error } = await requireClient().from('contract_templates').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(mapContractTemplateRow);
      },
      async create(createdBy, createdByName, input) {
        const { data, error } = await requireClient()
          .from('contract_templates')
          .insert({ name: input.name, description: input.description ?? null, created_by: createdBy, created_by_name: createdByName })
          .select()
          .single();
        if (error) throw error;
        return mapContractTemplateRow(data);
      },
      async update(id, patch) {
        const dbPatch: Record<string, unknown> = {};
        if ('name' in patch) dbPatch.name = patch.name;
        if ('description' in patch) dbPatch.description = patch.description;
        if ('isActive' in patch) dbPatch.is_active = patch.isActive;
        const { data, error } = await requireClient().from('contract_templates').update(dbPatch).eq('id', id).select().single();
        if (error) throw error;
        return mapContractTemplateRow(data);
      },
    },
    contractTemplateVersions: {
      async listForTemplate(templateId) {
        const { data, error } = await requireClient().from('contract_template_versions').select('*').eq('template_id', templateId).order('version_number', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(mapContractTemplateVersionRow);
      },
      async listPublished() {
        const { data, error } = await requireClient().from('contract_template_versions').select('*').eq('status', 'published');
        if (error) throw error;
        return (data ?? []).map(mapContractTemplateVersionRow);
      },
      async create(templateId, versionNumber, createdBy, createdByName) {
        const { data, error } = await requireClient()
          .from('contract_template_versions')
          .insert({ template_id: templateId, version_number: versionNumber, status: 'draft', content: [], created_by: createdBy, created_by_name: createdByName })
          .select()
          .single();
        if (error) throw error;
        return mapContractTemplateVersionRow(data);
      },
      async update(id, patch) {
        const dbPatch: Record<string, unknown> = {};
        if ('content' in patch) dbPatch.content = patch.content;
        if ('status' in patch) dbPatch.status = patch.status;
        const { data, error } = await requireClient().from('contract_template_versions').update(dbPatch).eq('id', id).select().single();
        if (error) throw error;
        return mapContractTemplateVersionRow(data);
      },
      async publish(id) {
        const { data, error } = await requireClient().rpc('set_contract_template_version_published', { p_version_id: id });
        if (error) throw error;
        return mapContractTemplateVersionRow(data);
      },
    },
    contractClauses: {
      async list() {
        const { data, error } = await requireClient().from('contract_clauses').select('*').eq('is_active', true).order('name', { ascending: true });
        if (error) throw error;
        return (data ?? []).map(mapContractClauseRow);
      },
      async create(createdBy, createdByName, input) {
        const { data, error } = await requireClient()
          .from('contract_clauses')
          .insert({ name: input.name, category: input.category ?? null, body: input.body, created_by: createdBy, created_by_name: createdByName })
          .select()
          .single();
        if (error) throw error;
        return mapContractClauseRow(data);
      },
    },
    contractFields: {
      async list() {
        const { data, error } = await requireClient().from('contract_fields').select('*');
        if (error) throw error;
        return (data ?? []).map(mapContractFieldRow);
      },
      async create(createdBy, key, scope, templateId) {
        const { data, error } = await requireClient()
          .from('contract_fields')
          .insert({ key, scope, template_id: templateId, created_by: createdBy })
          .select()
          .single();
        if (error) throw error;
        return mapContractFieldRow(data);
      },
    },
    contractGenerations: {
      async list() {
        const { data, error } = await requireClient().from('contract_generations').select('*').order('generated_at', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(mapContractGenerationRow);
      },
      async create(input) {
        const { data, error } = await requireClient()
          .from('contract_generations')
          .insert({
            contract_request_id: input.contractRequestId,
            lead_id: input.leadId,
            client_name: input.clientName,
            template_id: input.templateId,
            template_version_id: input.templateVersionId,
            version_number_snapshot: input.versionNumberSnapshot,
            content_snapshot: input.contentSnapshot,
            field_values_snapshot: input.fieldValuesSnapshot,
            pdf_storage_path: input.pdfStoragePath,
            generated_by: input.generatedBy,
            generated_by_name: input.generatedByName,
          })
          .select()
          .single();
        if (error) throw error;
        return mapContractGenerationRow(data);
      },
      async uploadPdf(path, blob) {
        const client = requireClient();
        const { error: uploadError } = await client.storage.from('contract-pdfs').upload(path, blob, { contentType: 'application/pdf', upsert: true });
        if (uploadError) throw uploadError;
        return path;
      },
    },
    contractApprovals: {
      async listForVersion(templateVersionId) {
        const { data, error } = await requireClient().from('contract_approvals').select('*').eq('template_version_id', templateVersionId).order('decided_at', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(mapContractApprovalRow);
      },
      async decide(templateVersionId, status, reason, decidedBy, decidedByName) {
        const { data, error } = await requireClient()
          .from('contract_approvals')
          .insert({ template_version_id: templateVersionId, status, reason, decided_by: decidedBy, decided_by_name: decidedByName })
          .select()
          .single();
        if (error) throw error;
        return mapContractApprovalRow(data);
      },
    },
    leaveRequests: {
      async list() {
        const { data, error } = await requireClient().from('leave_requests').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(mapLeaveRequestRow);
      },
      async create(agentKey, agentName, input) {
        const year = new Date(input.dates[0]).getFullYear();
        const { data, error } = await requireClient()
          .from('leave_requests')
          .insert({
            agent_key: agentKey,
            agent_name: agentName,
            year,
            dates: input.dates,
            days_count: input.dates.length,
            letter_text: input.letterText ?? null,
            status: input.asDraft ? 'planned' : 'pending',
            is_emergency: input.isEmergency ?? false,
            deduct_quota: true,
          })
          .select()
          .single();
        if (error) throw error;
        return mapLeaveRequestRow(data);
      },
      async decide(id, outcome, decidedBy, decidedByName, decidedSignature, note, deductQuota) {
        const dbPatch: Record<string, unknown> = {
          status: outcome,
          decided_at: new Date().toISOString(),
          decided_by: decidedBy,
          decided_by_name: decidedByName,
          decided_signature: outcome === 'approved' ? decidedSignature : null,
        };
        if (note !== undefined) dbPatch.reschedule_note = note;
        if (deductQuota !== undefined) dbPatch.deduct_quota = deductQuota;
        const { data, error } = await requireClient().from('leave_requests').update(dbPatch).eq('id', id).select().single();
        if (error) throw error;
        return mapLeaveRequestRow(data);
      },
      async reschedule(id, note, newDates, decidedBy, decidedByName, decidedSignature) {
        const dbPatch: Record<string, unknown> =
          newDates && newDates.length
            ? {
                status: 'approved',
                dates: newDates,
                days_count: newDates.length,
                year: new Date(newDates[0]).getFullYear(),
                reschedule_note: note ?? null,
                decided_at: new Date().toISOString(),
                decided_by: decidedBy,
                decided_by_name: decidedByName,
                decided_signature: decidedSignature,
              }
            : { status: 'rescheduled', reschedule_note: note ?? null, decided_at: new Date().toISOString(), decided_by: decidedBy, decided_by_name: decidedByName };
        const { data, error } = await requireClient().from('leave_requests').update(dbPatch).eq('id', id).select().single();
        if (error) throw error;
        return mapLeaveRequestRow(data);
      },
      async sendPlanned(id) {
        const { data, error } = await requireClient().from('leave_requests').update({ status: 'pending' }).eq('id', id).select().single();
        if (error) throw error;
        return mapLeaveRequestRow(data);
      },
      async remove(id) {
        const { error } = await requireClient().from('leave_requests').delete().eq('id', id);
        if (error) throw error;
      },
      async confirmUsed(id) {
        const { data, error } = await requireClient().from('leave_requests').update({ used_confirmed_at: new Date().toISOString() }).eq('id', id).select().single();
        if (error) throw error;
        return mapLeaveRequestRow(data);
      },
    },
    banners: {
      async list() {
        const { data, error } = await requireClient().from('banners').select('*').order('updated_at', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(mapBannerRow);
      },
      async create(createdBy, createdByName, input) {
        const { data, error } = await requireClient()
          .from('banners')
          .insert({ name: input.name, area: input.area, status: input.status, notes: input.notes ?? null, created_by: createdBy, created_by_name: createdByName })
          .select()
          .single();
        if (error) throw error;
        return mapBannerRow(data);
      },
      async updateStatus(id, status) {
        const { data, error } = await requireClient().from('banners').update({ status, updated_at: new Date().toISOString() }).eq('id', id).select().single();
        if (error) throw error;
        return mapBannerRow(data);
      },
    },
    pricingHistory: {
      async list() {
        const { data, error } = await requireClient().from('pricing_history').select('*').order('changed_at', { ascending: false }).limit(30);
        if (error) throw error;
        return (data ?? []).map(mapPricingHistoryRow);
      },
      async log(changedBy, changedByName, field, fieldLabel, oldValue, newValue) {
        const { data, error } = await requireClient()
          .from('pricing_history')
          .insert({ changed_by: changedBy, changed_by_name: changedByName, field, field_label: fieldLabel, old_value: oldValue, new_value: newValue })
          .select()
          .single();
        if (error) throw error;
        return mapPricingHistoryRow(data);
      },
    },
    pricingPromotions: {
      async list() {
        const { data, error } = await requireClient().from('pricing_promotions').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(mapPricingPromotionRow);
      },
      async create(createdBy, createdByName, input) {
        const { data, error } = await requireClient()
          .from('pricing_promotions')
          .insert({
            plot_type: input.plotType,
            mode: input.mode,
            amount_per_plot: input.amountPerPlot,
            date_from: input.dateFrom,
            date_to: input.dateTo,
            created_by: createdBy,
            created_by_name: createdByName,
          })
          .select()
          .single();
        if (error) throw error;
        return mapPricingPromotionRow(data);
      },
      async remove(id) {
        const { error } = await requireClient().from('pricing_promotions').delete().eq('id', id);
        if (error) throw error;
      },
    },
    officeLocations: {
      async list() {
        const { data, error } = await requireClient().from('office_locations').select('*').order('created_at', { ascending: true });
        if (error) throw error;
        return (data ?? []).map(mapOfficeLocationRow);
      },
      async create(createdBy, createdByName, input) {
        const { data, error } = await requireClient()
          .from('office_locations')
          .insert({ name: input.name, lat: input.lat, lng: input.lng, radius_meters: input.radiusMeters, created_by: createdBy, created_by_name: createdByName })
          .select('*')
          .single();
        if (error) throw error;
        return mapOfficeLocationRow(data);
      },
      async update(id, patch) {
        const dbPatch: Record<string, unknown> = {};
        if (patch.name !== undefined) dbPatch.name = patch.name;
        if (patch.lat !== undefined) dbPatch.lat = patch.lat;
        if (patch.lng !== undefined) dbPatch.lng = patch.lng;
        if (patch.radiusMeters !== undefined) dbPatch.radius_meters = patch.radiusMeters;
        if (patch.isActive !== undefined) dbPatch.is_active = patch.isActive;
        const { data, error } = await requireClient().from('office_locations').update(dbPatch).eq('id', id).select('*').single();
        if (error) throw error;
        return mapOfficeLocationRow(data);
      },
      async remove(id) {
        const { error } = await requireClient().from('office_locations').delete().eq('id', id);
        if (error) throw error;
      },
    },
    attendancePolicy: {
      async current() {
        const { data, error } = await requireClient().from('attendance_policy').select('*').eq('is_active', true).maybeSingle();
        if (error) throw error;
        return data ? mapAttendancePolicyRow(data) : null;
      },
      async history() {
        const { data, error } = await requireClient().from('attendance_policy').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(mapAttendancePolicyRow);
      },
      async update(_createdBy, _createdByName, input) {
        const { data, error } = await requireClient().rpc('set_attendance_policy', {
          p_work_start_time: input.workStartTime,
          p_work_end_time: input.workEndTime,
          p_grace_minutes: input.graceMinutes,
          p_work_days: input.workDays,
        });
        if (error) throw error;
        return mapAttendancePolicyRow(data);
      },
    },
    attendanceExceptions: {
      async list() {
        const { data, error } = await requireClient().from('attendance_exceptions').select('*').order('exception_date', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(mapAttendanceExceptionRow);
      },
      async create(agentKey, agentName, input) {
        const { data, error } = await requireClient()
          .from('attendance_exceptions')
          .insert({
            staff_key: agentKey,
            staff_name: agentName,
            exception_date: input.exceptionDate,
            exception_type: input.exceptionType,
            reason: input.reason,
            requested_by: agentKey,
            requested_by_name: agentName,
          })
          .select()
          .single();
        if (error) throw error;
        return mapAttendanceExceptionRow(data);
      },
      async decide(id, status, decidedBy, decidedByName) {
        const { data, error } = await requireClient()
          .from('attendance_exceptions')
          .update({ status, decided_by: decidedBy, decided_by_name: decidedByName, decided_at: new Date().toISOString() })
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        return mapAttendanceExceptionRow(data);
      },
    },
    async leadBannerCounts() {
      // Same real deleted_at gap as listForAgent()/listCompany() -- an
      // archived lead shouldn't still count toward a banner's real totals.
      const { data, error } = await requireClient().from('leads').select('banner_id').not('banner_id', 'is', null).is('deleted_at', null);
      if (error) return {};
      const counts: Record<string, number> = {};
      (data ?? []).forEach((r: { banner_id: string | null }) => {
        if (r.banner_id) counts[r.banner_id] = (counts[r.banner_id] ?? 0) + 1;
      });
      return counts;
    },
    fundRequests: {
      async list() {
        // Unfiltered on purpose -- fundreq_sel RLS already scopes this
        // correctly per real session (own rows, or every row for manager).
        const { data, error } = await requireClient().from('fund_requests').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(mapFundRequestRow);
      },
      async create(requestedBy, requestedByName, input) {
        const { data, error } = await requireClient()
          .from('fund_requests')
          .insert({ req_type: input.type, amount: input.amount, purpose: input.purpose, requested_by: requestedBy, requested_by_name: requestedByName, receipt_data: input.receiptData ?? null, receipt_name: input.receiptName ?? null })
          .select()
          .single();
        if (error) throw error;
        return mapFundRequestRow(data);
      },
      async decide(id, approve, decidedBy, decidedByName, note) {
        const { data, error } = await requireClient()
          .from('fund_requests')
          .update({ status: approve ? 'approved' : 'rejected', decided_by: decidedBy, decided_by_name: decidedByName, decided_at: new Date().toISOString(), decision_note: note ?? null })
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        return mapFundRequestRow(data);
      },
    },
    weeklyVisitForms: {
      async getOrCreate(weekStart, visitDate) {
        const client = requireClient();
        const { data, error } = await client.from('weekly_visit_forms').select('*').eq('week_start', weekStart).eq('visit_date', visitDate).maybeSingle();
        if (error) throw error;
        if (data) return mapWeeklyVisitFormRow(data);
        const ins = await client.from('weekly_visit_forms').insert({ week_start: weekStart, visit_date: visitDate }).select().single();
        if (ins.error) {
          // Real race guard, matching index.html's own retry-on-conflict --
          // the unique index on (week_start, visit_date) means a second
          // staff member opening the same day at the same moment can lose
          // the insert race; the row they were racing against already
          // exists, so just re-select it instead of surfacing an error.
          const retry = await client.from('weekly_visit_forms').select('*').eq('week_start', weekStart).eq('visit_date', visitDate).maybeSingle();
          if (retry.error || !retry.data) throw retry.error ?? ins.error;
          return mapWeeklyVisitFormRow(retry.data);
        }
        return mapWeeklyVisitFormRow(ins.data);
      },
      async saveCosts(id, patch) {
        const dbPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if ('vehicleRentalEst' in patch) dbPatch.vehicle_rental_est = patch.vehicleRentalEst;
        if ('driversTipEst' in patch) dbPatch.drivers_tip_est = patch.driversTipEst;
        if ('fuelEst' in patch) dbPatch.fuel_est = patch.fuelEst;
        if ('refreshmentEst' in patch) dbPatch.refreshment_est = patch.refreshmentEst;
        if ('tntEst' in patch) dbPatch.tnt_est = patch.tntEst;
        if ('vehicleRentalAct' in patch) dbPatch.vehicle_rental_act = patch.vehicleRentalAct;
        if ('driversTipAct' in patch) dbPatch.drivers_tip_act = patch.driversTipAct;
        if ('fuelAct' in patch) dbPatch.fuel_act = patch.fuelAct;
        if ('refreshmentAct' in patch) dbPatch.refreshment_act = patch.refreshmentAct;
        if ('tntAct' in patch) dbPatch.tnt_act = patch.tntAct;
        if ('siteManagerName' in patch) dbPatch.site_manager_name = patch.siteManagerName;
        const { data, error } = await requireClient().from('weekly_visit_forms').update(dbPatch).eq('id', id).select().single();
        if (error) throw error;
        return mapWeeklyVisitFormRow(data);
      },
      async finalize(id, approvedBy, approvedByName, signature) {
        const { data, error } = await requireClient()
          .from('weekly_visit_forms')
          .update({ status: 'Finalized', approved_by: approvedBy, approved_by_name: approvedByName, approved_signature: signature, finalized_at: new Date().toISOString() })
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        return mapWeeklyVisitFormRow(data);
      },
    },
    downloads: {
      async list() {
        // viewerKey/viewerRole unused here -- downloads_sel RLS already
        // scopes this correctly per real session (own rows, or every row
        // for manager), kept only so the interface matches demo mode's
        // explicit scoping.
        const { data, error } = await requireClient().from('downloads').select('id,user_key,user_name,filename,kind,created_at').order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(mapDownloadRow);
      },
      async log(userKey, userName, filename, kind, fileData) {
        const { data, error } = await requireClient().from('downloads').insert({ user_key: userKey, user_name: userName, filename, kind, file_data: fileData }).select().single();
        if (error) throw error;
        return mapDownloadRow(data);
      },
    },
    importBatches: {
      async create(importedBy, importedByName, batch) {
        const { error } = await requireClient()
          .from('import_batches')
          .insert({
            imported_by: importedBy,
            imported_by_name: importedByName,
            source_label: batch.sourceLabel,
            added_count: batch.addedCount,
            updated_count: batch.updatedCount,
            unchanged_count: batch.unchangedCount,
            skipped_count: batch.skippedCount,
            conflict_count: batch.conflictCount,
            error_count: batch.errorCount,
            payment_changes_ignored_count: batch.paymentChangesIgnoredCount,
            details: batch.details,
          });
        if (error) throw error;
      },
    },
    reportArchive: {
      async list(limit = 30) {
        const { data, error } = await requireClient().from('report_archive').select('*').order('generated_at', { ascending: false }).limit(limit);
        if (error) throw error;
        return (data ?? []).map(mapReportArchiveRow);
      },
    },
    achievements: {
      async listDefs() {
        const { data, error } = await requireClient().from('achievement_definitions').select('*').eq('active', true).order('created_at');
        if (error) throw error;
        return (data ?? []).map(mapAchievementDefRow);
      },
      async listEarned(staffKeys) {
        const { data, error } = await requireClient().from('staff_achievements').select('*').in('staff_key', staffKeys);
        if (error) throw error;
        return (data ?? []).map(mapStaffAchievementRow);
      },
      async award(staffKey, staffName, achievementId, progress) {
        // Real upsert-with-ignoreDuplicates pattern (apiAwardAchievement,
        // index.html:19674-19679) -- the unique(staff_key,achievement_id)
        // constraint makes re-awarding an already-earned achievement a
        // silent no-op (maybeSingle() returns null, not an error), so
        // this is safe to call every time evaluation runs.
        const { data, error } = await requireClient()
          .from('staff_achievements')
          .upsert({ staff_key: staffKey, staff_name: staffName, achievement_id: achievementId, progress }, { onConflict: 'staff_key,achievement_id', ignoreDuplicates: true })
          .select()
          .maybeSingle();
        if (error) throw error;
        return data ? mapStaffAchievementRow(data) : null;
      },
    },
    audit: {
      async list(filter) {
        let q = requireClient().from('audit_events').select('*').order('created_at', { ascending: false }).limit(200);
        if (filter?.category && filter.category !== 'all') q = q.eq('category', filter.category);
        if (filter?.criticalOnly) q = q.eq('severity', 'critical');
        if (filter?.entityType) q = q.eq('entity_type', filter.entityType);
        if (filter?.entityIds) q = q.in('entity_id', filter.entityIds);
        const { data, error } = await q;
        if (error) throw error;
        return (data ?? []).map(mapAuditEventRow);
      },
      async log(eventType, severity, summary, detail, entityType, entityId) {
        const { error } = await requireClient().rpc('record_audit_event', {
          p_category: 'audit',
          p_event_type: eventType,
          p_severity: severity,
          p_entity_type: entityType ?? null,
          p_entity_id: entityId ?? null,
          p_summary: summary,
          p_detail: detail ?? null,
        });
        // Auditing must never break the calling flow -- matches
        // logAudit()'s own try/catch in index.html.
        if (error) console.error('record_audit_event failed', error);
      },
    },
    pushSubscriptions: {
      async save(ownerKind, ownerId, sub) {
        const { error } = await requireClient()
          .from('push_subscriptions')
          .upsert({ owner_kind: ownerKind, owner_id: ownerId, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }, { onConflict: 'endpoint' });
        if (error) throw error;
      },
    },
    sms: {
      async send(to, message, trigger, sentByKey) {
        if (!to) return false;
        let ok = false;
        let errMsg: string | null = null;
        try {
          const { data, error } = await requireClient().functions.invoke('send-sms', { body: { to, message, sender: 'Trulander' } });
          if (error) throw error;
          ok = !!data?.ok;
          if (!ok) errMsg = data?.data?.message ? String(data.data.message) : 'SMS provider rejected the request';
        } catch (e) {
          errMsg = e instanceof Error ? e.message : String(e);
        }
        try {
          await requireClient()
            .from('sms_log')
            .insert({ recipient: to, message, trigger: trigger || null, sent_by: sentByKey, status: ok ? 'sent' : 'failed', error: errMsg });
        } catch {
          // Logging the send is best-effort too -- never let a sms_log
          // insert failure mask the real send result the caller needs.
        }
        return ok;
      },
    },
    backups: {
      async list() {
        const { data, error } = await requireClient().from('backups').select('id,created_at,trigger_type,triggered_by,triggered_by_name,table_counts,size_bytes,checksum').order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(mapBackupRow);
      },
      async createNow(triggeredBy, triggeredByName) {
        const { data: id, error } = await requireClient().rpc('create_backup', { p_trigger: 'manual', p_by: triggeredBy, p_by_name: triggeredByName });
        if (error) throw error;
        const { data, error: selError } = await requireClient().from('backups').select('id,created_at,trigger_type,triggered_by,triggered_by_name,table_counts,size_bytes,checksum').eq('id', id).single();
        if (selError) throw selError;
        return mapBackupRow(data);
      },
      async restore(backupId, triggeredBy, triggeredByName) {
        const { error } = await requireClient().rpc('restore_backup', { p_backup_id: backupId, p_by: triggeredBy, p_by_name: triggeredByName });
        if (error) throw error;
      },
    },
    permissions: {
      async listDefs() {
        const { data, error } = await requireClient().from('permissions').select('*').order('key');
        if (error) throw error;
        return (data ?? []).map(mapPermissionDefRow);
      },
      async listOverrides() {
        const { data, error } = await requireClient().from('staff_permission_overrides').select('*');
        if (error) throw error;
        return (data ?? []).map(mapPermissionOverrideRow);
      },
      async grant(staffKey, permissionKey) {
        const { error } = await requireClient().rpc('set_permission_override', { p_staff_key: staffKey, p_permission_key: permissionKey, p_granted: true });
        if (error) throw error;
      },
      async clear(staffKey, permissionKey) {
        const { error } = await requireClient().rpc('clear_permission_override', { p_staff_key: staffKey, p_permission_key: permissionKey });
        if (error) throw error;
      },
    },
    allocationRequests: {
      async list() {
        // Unfiltered on purpose -- alloc_sel RLS already scopes this
        // correctly per real session (own rows, or every row for manager/
        // elias/emmanuel). viewerKey/viewerRole are unused here, kept only
        // so the interface matches demo mode's explicit scoping.
        const { data, error } = await requireClient().from('allocation_requests').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(mapAllocationRequestRow);
      },
      async create(agentKey, agentName, input) {
        const { data: leadRow, error: leadError } = await requireClient().from('leads').select('name,grand_total,amt_paid').eq('id', input.leadId).eq('agent_key', agentKey).single();
        if (leadError) throw leadError;
        const grandTotal = Number(leadRow.grand_total ?? 0);
        const amtPaid = Number(leadRow.amt_paid ?? 0);
        const { data, error } = await requireClient()
          .from('allocation_requests')
          .insert({
            lead_id: input.leadId,
            client_name: leadRow.name,
            agent_key: agentKey,
            agent_name: agentName,
            percent_paid: grandTotal > 0 ? Math.round((amtPaid / grandTotal) * 1000) / 10 : null,
            grand_total: grandTotal,
            amt_paid: amtPaid,
            status: 'Pending',
            agent_seen: true,
          })
          .select()
          .single();
        if (error) throw error;
        return mapAllocationRequestRow(data);
      },
      async suggest(id, plotNumbers) {
        const { data, error } = await requireClient()
          .from('allocation_requests')
          .update({ status: 'Awaiting Authorization', suggested_plots: plotNumbers.join(',') })
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        return mapAllocationRequestRow(data);
      },
      // Real SECURITY DEFINER RPC -- one transaction that re-verifies the
      // plot isn't already taken server-side (closing a race a client-side
      // check can't catch) and syncs the real `plots` row, unlike the old
      // bare .update() this replaces. confirmedBy is demo-only (the RPC
      // derives the caller's name itself via auth.uid()), so it's not
      // passed here -- fewer params than the interface is a valid
      // structural implementation, same pattern list() above already uses.
      async confirm(id, plotNumber, note) {
        const { error } = await requireClient().rpc('confirm_allocation', { p_allocation_id: id, p_plot_number: plotNumber, p_note: note ?? null });
        if (error) throw error;
        const { data, error: selError } = await requireClient().from('allocation_requests').select('*').eq('id', id).single();
        if (selError) throw selError;
        return mapAllocationRequestRow(data);
      },
      async revert(id) {
        const { error } = await requireClient().rpc('revert_allocation', { p_allocation_id: id });
        if (error) throw error;
        const { data, error: selError } = await requireClient().from('allocation_requests').select('*').eq('id', id).single();
        if (selError) throw selError;
        return mapAllocationRequestRow(data);
      },
      async editPlot(id, newPlotNumber) {
        const { error } = await requireClient().rpc('edit_allocated_plot', { p_allocation_id: id, p_new_plot_number: newPlotNumber });
        if (error) throw error;
        const { data, error: selError } = await requireClient().from('allocation_requests').select('*').eq('id', id).single();
        if (selError) throw selError;
        return mapAllocationRequestRow(data);
      },
      async remove(id) {
        const { error } = await requireClient().rpc('delete_allocation', { p_allocation_id: id });
        if (error) throw error;
      },
      async flag(id, reason, flaggedBy) {
        const { data, error } = await requireClient().from('allocation_requests').update({ flag_reason: reason, flagged_by: flaggedBy, flagged_at: new Date().toISOString() }).eq('id', id).select().single();
        if (error) throw error;
        return mapAllocationRequestRow(data);
      },
      async resolveFlag(id) {
        const { data, error } = await requireClient().from('allocation_requests').update({ flag_reason: null, flagged_by: null, flagged_at: null }).eq('id', id).select().single();
        if (error) throw error;
        return mapAllocationRequestRow(data);
      },
      async sendBack(id, reason, sentBackBy) {
        const { data, error } = await requireClient()
          .from('allocation_requests')
          .update({ status: 'Pending', suggested_plots: null, flag_reason: reason, flagged_by: sentBackBy, flagged_at: new Date().toISOString() })
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        return mapAllocationRequestRow(data);
      },
      async uploadAuthDoc(id, agentKey, file) {
        const client = requireClient();
        const ext = file.name.split('.').pop() || 'jpg';
        const path = `${agentKey}/${id}.${ext}`;
        const { error: uploadError } = await client.storage.from('allocation-auth-docs').upload(path, file, { upsert: true });
        if (uploadError) throw uploadError;
        const { error: updError } = await client
          .from('allocation_requests')
          .update({ auth_doc_photo_path: path, auth_doc_uploaded_by: agentKey, auth_doc_uploaded_at: new Date().toISOString(), auth_doc_ai_status: null, auth_doc_ai_note: null })
          .eq('id', id);
        if (updError) throw updError;
        return path;
      },
      async resolveAuthDocUrl(path) {
        const { data, error } = await requireClient().storage.from('allocation-auth-docs').createSignedUrl(path, 300);
        if (error) throw error;
        return data?.signedUrl ?? null;
      },
      async analyzeAuthDoc(id, imageUrl, clientName, plotNumber) {
        const client = requireClient();
        const { data, error } = await client.functions.invoke('ai-insights', { body: { kind: 'allocation_doc_verify', context: { imageUrl, clientName, plotNumber } } });
        if (error) throw error;
        const status = (data?.status ?? 'unavailable') as AllocationRequest['authDocAiStatus'];
        const note = String(data?.note ?? 'The AI did not return a clear result.');
        const { data: row, error: updError } = await client
          .from('allocation_requests')
          .update({ auth_doc_ai_status: status, auth_doc_ai_note: note })
          .eq('id', id)
          .select()
          .single();
        if (updError) throw updError;
        return mapAllocationRequestRow(row);
      },
    },
    notes: {
      async listForOwner(ownerKey) {
        const { data, error } = await requireClient().from('notes').select('*').eq('owner_key', ownerKey).order('updated_at', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(mapNoteRow);
      },
      async create(ownerKey, input) {
        const { data, error } = await requireClient().from('notes').insert({ owner_key: ownerKey, title: input.title, body: input.body }).select().single();
        if (error) throw error;
        return mapNoteRow(data);
      },
      async update(id, input) {
        const { data, error } = await requireClient().from('notes').update({ title: input.title, body: input.body, updated_at: new Date().toISOString() }).eq('id', id).select().single();
        if (error) throw error;
        return mapNoteRow(data);
      },
      async remove(id) {
        const { error } = await requireClient().from('notes').delete().eq('id', id);
        if (error) throw error;
      },
    },
    attendance: {
      async today(staffKey) {
        const workDate = new Date().toISOString().slice(0, 10);
        const { data, error } = await requireClient().from('attendance_log').select('*').eq('staff_key', staffKey).eq('work_date', workDate).maybeSingle();
        if (error) throw error;
        return data ? mapAttendanceRow(data) : null;
      },
      async history(staffKey, days) {
        const from = new Date();
        from.setDate(from.getDate() - days);
        const fromIso = from.toISOString().slice(0, 10);
        const { data, error } = await requireClient()
          .from('attendance_log')
          .select('*')
          .eq('staff_key', staffKey)
          .gte('work_date', fromIso)
          .order('work_date', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(mapAttendanceRow);
      },
      async listToday() {
        const workDate = new Date().toISOString().slice(0, 10);
        const { data, error } = await requireClient().from('attendance_log').select('*').eq('work_date', workDate).order('sign_in_at', { ascending: true });
        if (error) throw error;
        return (data ?? []).map(mapAttendanceRow);
      },
      async listRange(days) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        const cutoffIso = cutoff.toISOString().slice(0, 10);
        const { data, error } = await requireClient().from('attendance_log').select('*').gte('work_date', cutoffIso).order('work_date', { ascending: true });
        if (error) throw error;
        return (data ?? []).map(mapAttendanceRow);
      },
      async listBetween(startDate, endDate) {
        const { data, error } = await requireClient().from('attendance_log').select('*').gte('work_date', startDate).lte('work_date', endDate).order('work_date', { ascending: true });
        if (error) throw error;
        return (data ?? []).map(mapAttendanceRow);
      },
      async signIn(staffKey, staffName, input) {
        const client = requireClient();
        const workDate = new Date().toISOString().slice(0, 10);
        const { data: existing, error: existingError } = await client.from('attendance_log').select('id').eq('staff_key', staffKey).eq('work_date', workDate).maybeSingle();
        if (existingError) throw existingError;
        if (existing) throw new Error("You've already signed in today");
        const { data, error } = await client
          .from('attendance_log')
          .insert({
            staff_key: staffKey,
            staff_name: staffName,
            work_date: workDate,
            sign_in_at: new Date().toISOString(),
            sign_in_lat: input.lat ?? null,
            sign_in_lng: input.lng ?? null,
            is_off_site_in: input.offSite ?? false,
            sign_in_reason: input.offSite ? (input.reason ?? null) : null,
            late_reason: input.late ? (input.lateReason ?? null) : null,
            sign_in_photo: input.photo ?? null,
            sign_in_accuracy_meters: input.accuracy ?? null,
            device_info: input.deviceInfo ?? null,
          })
          .select()
          .single();
        if (error) throw error;
        return mapAttendanceRow(data);
      },
      async signOut(staffKey, id, input) {
        const client = requireClient();
        const { data: existing, error: existingError } = await client.from('attendance_log').select('sign_out_at').eq('id', id).eq('staff_key', staffKey).single();
        if (existingError) throw existingError;
        if (existing.sign_out_at) throw new Error("You've already signed out today");
        const { data, error } = await client
          .from('attendance_log')
          .update({
            sign_out_at: new Date().toISOString(),
            sign_out_lat: input.lat ?? null,
            sign_out_lng: input.lng ?? null,
            is_off_site_out: input.offSite ?? false,
            sign_out_reason: input.offSite ? (input.reason ?? null) : null,
            sign_out_accuracy_meters: input.accuracy ?? null,
          })
          .eq('id', id)
          .eq('staff_key', staffKey)
          .select()
          .single();
        if (error) throw error;
        return mapAttendanceRow(data);
      },
      // ATTENDANCE_BLUEPRINT.md §8 -- no staff_key filter here (unlike
      // signIn/signOut above): a manager corrects/deletes ANY staff
      // member's record, not just their own. The real `al_upd_own_or_mgr`/
      // `al_del_mgr` RLS policies (confirmed live 2026-09-11) are the
      // actual backstop; the UI itself only renders this action for
      // role==='manager'.
      async update(id, patch) {
        const dbPatch: Record<string, string | null> = {};
        if (patch.signInAt !== undefined) dbPatch.sign_in_at = patch.signInAt;
        if (patch.signOutAt !== undefined) dbPatch.sign_out_at = patch.signOutAt;
        const { data, error } = await requireClient().from('attendance_log').update(dbPatch).eq('id', id).select().single();
        if (error) throw error;
        return mapAttendanceRow(data);
      },
      async remove(id) {
        const { error } = await requireClient().from('attendance_log').delete().eq('id', id);
        if (error) throw error;
      },
      async monthComparison(monthKey, cutoff) {
        const { data, error } = await requireClient().rpc('get_attendance_month_comparison', { p_month_key: monthKey, p_cutoff: cutoff });
        if (error) throw error;
        return (data ?? []).map(mapAttendanceComparisonRow);
      },
      async resetAll() {
        const { error } = await requireClient().from('attendance_log').delete().gte('work_date', '1900-01-01');
        if (error) throw error;
      },
    },
    attendanceNotes: {
      async list() {
        const { data, error } = await requireClient().from('attendance_notes').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(mapAttendanceNoteRow);
      },
      async issue(staffKey, staffName, kind, reason, workDate, createdBy, createdByName) {
        const { data, error } = await requireClient()
          .from('attendance_notes')
          .insert({ staff_key: staffKey, staff_name: staffName, kind, reason, work_date: workDate, created_by: createdBy, created_by_name: createdByName })
          .select()
          .single();
        if (error) throw error;
        return mapAttendanceNoteRow(data);
      },
    },
    attendanceReviews: {
      async list() {
        const { data, error } = await requireClient().from('attendance_reviews').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(mapAttendanceReviewRow);
      },
      async decide(attendanceLogId, staffKey, staffName, classification, note, reviewedBy, reviewedByName) {
        const { data, error } = await requireClient()
          .from('attendance_reviews')
          .insert({
            attendance_log_id: attendanceLogId,
            staff_key: staffKey,
            staff_name: staffName,
            review_type: 'exception',
            status: 'reviewed',
            classification,
            note: note || null,
            reviewed_by: reviewedBy,
            reviewed_by_name: reviewedByName,
            reviewed_at: new Date().toISOString(),
          })
          .select()
          .single();
        if (error) throw error;
        return mapAttendanceReviewRow(data);
      },
    },
    staff: {
      async list() {
        const { data, error } = await requireClient().from('profiles').select('agent_key,name,role,email,active,phone').eq('active', true);
        if (error) throw error;
        return (data ?? []).map(mapProfileRow);
      },
      async listAll() {
        const { data, error } = await requireClient().from('profiles').select('agent_key,name,role,email,active,phone');
        if (error) throw error;
        return (data ?? []).map(mapProfileRow);
      },
      async setActive(key, active) {
        const { data, error } = await requireClient().from('profiles').update({ active }).eq('agent_key', key).select().single();
        if (error) throw error;
        return mapProfileRow(data);
      },
      async updateSignature(key, dataUrl) {
        const { data, error } = await requireClient().from('profiles').update({ signature_data: dataUrl }).eq('agent_key', key).select().single();
        if (error) throw error;
        return mapProfileRow(data);
      },
    },
    staffInvites: {
      async list() {
        const { data, error } = await requireClient().from('allowed_emails').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(mapStaffInviteRow);
      },
      async create(email, name, invitedBy) {
        const { error } = await requireClient().from('allowed_emails').insert({ email: email.toLowerCase(), name, invited_by: invitedBy });
        if (error) throw error;
      },
      async remove(email) {
        const { error } = await requireClient().from('allowed_emails').delete().eq('email', email.toLowerCase());
        if (error) throw error;
      },
    },
    memos: {
      async sent(myKey) {
        const { data, error } = await requireClient().from('memos').select('*').eq('from_key', myKey).order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(mapMemoRow);
      },
      async drafts(myKey) {
        const { data, error } = await requireClient().from('memos').select('*').eq('from_key', myKey).eq('status', 'draft').order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(mapMemoRow);
      },
      async received(myKey) {
        const client = requireClient();
        const { data: directData, error: directError } = await client.from('memos').select('*').eq('to_key', myKey).neq('status', 'draft');
        if (directError) throw directError;
        const direct: ReceivedMemo[] = (directData ?? []).map((m) => ({ memo: mapMemoRow(m), viaCC: false, recipientRowId: null }));

        const { data: ccData, error: ccError } = await client.from('memo_recipients').select('*, memo:memos(*)').eq('staff_key', myKey);
        if (ccError) throw ccError;
        const viaCc: ReceivedMemo[] = ((ccData ?? []) as (Record<string, unknown> & { memo?: Record<string, unknown> })[])
          .filter((r) => r.memo)
          .map((r) => ({ memo: mapMemoRow(r.memo as Record<string, unknown>), viaCC: true, recipientRowId: r.id as string }));

        return [...direct, ...viaCc].sort((a, b) => (a.memo.createdAt < b.memo.createdAt ? 1 : -1));
      },
      async create(fromKey, fromName, input) {
        const client = requireClient();
        const { data, error } = await client
          .from('memos')
          .insert({
            from_key: fromKey,
            from_name: fromName,
            to_key: input.toKey,
            to_name: input.toName,
            subject: input.subject,
            body_html: input.bodyHtml,
            status: input.status,
          })
          .select()
          .single();
        if (error) throw error;
        const memo = mapMemoRow(data);
        if (input.cc && input.cc.length > 0) {
          const { error: ccError } = await client.from('memo_recipients').insert(input.cc.map((c) => ({ memo_id: memo.id, staff_key: c.key, staff_name: c.name })));
          if (ccError) throw ccError;
        }
        return memo;
      },
      async send(id) {
        const { data, error } = await requireClient().from('memos').update({ status: 'sent' }).eq('id', id).select().single();
        if (error) throw error;
        return mapMemoRow(data);
      },
      async markRead(item) {
        const client = requireClient();
        if (item.viaCC && item.recipientRowId) {
          const { error } = await client.from('memo_recipients').update({ read: true }).eq('id', item.recipientRowId);
          if (error) throw error;
        } else {
          const { error } = await client.from('memos').update({ read: true }).eq('id', item.memo.id);
          if (error) throw error;
        }
      },
      async remove(id) {
        // No memo_recipients DELETE policy exists on production at all
        // (confirmed live) -- deleting a memo here only removes the memos
        // row; any CC rows referencing it become orphaned, matching a
        // real limitation of the production schema, not a bug to route
        // around from the client.
        const { data, error } = await requireClient().from('memos').delete().eq('id', id).select('id');
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('You can only delete memos you sent (or ask a manager to).');
      },
    },
    manager: {
      async overview() {
        const client = requireClient();
        const sixMonthsAgo = shiftMonth(today().slice(0, 7), -5) + '-01';
        const [leadsRes, complaintsRes, visitsRes, staffRes, paymentsRes] = await Promise.all([
          client.from('leads').select('*'),
          client.from('complaints').select('status'),
          client.from('site_visits').select('id'),
          client.from('profiles').select('agent_key,name,role,email').eq('active', true),
          // status='approved' matches the real app-wide rule (also enforced
          // in Data Check's Ledger mismatch check) that a pending payment
          // must not count as collected until a manager approves it.
          client.from('payments').select('amount,payment_date').eq('status', 'approved').gte('payment_date', sixMonthsAgo),
        ]);
        if (leadsRes.error) throw leadsRes.error;
        if (complaintsRes.error) throw complaintsRes.error;
        if (visitsRes.error) throw visitsRes.error;
        if (staffRes.error) throw staffRes.error;
        if (paymentsRes.error) throw paymentsRes.error;

        const leads = (leadsRes.data ?? []).map(mapLeadRow);
        const staff = (staffRes.data ?? []).map(mapProfileRow);
        const pipelineValue = leads.reduce((s, l) => s + l.grandTotal, 0);
        const collected = leads.reduce((s, l) => s + l.amtPaid, 0);
        const stageFunnel = STAGES.map((stage) => ({ stage, count: leads.filter((l) => l.stage === stage).length }));

        const byAgentMap = new Map<string, { key: string; name: string; leadCount: number; value: number }>();
        for (const l of leads) {
          const match = staff.find((s) => s.key === l.agent);
          const name = match?.name ?? l.agent;
          const existing = byAgentMap.get(l.agent);
          if (existing) {
            existing.leadCount += 1;
            existing.value += l.grandTotal;
          } else {
            byAgentMap.set(l.agent, { key: l.agent, name, leadCount: 1, value: l.grandTotal });
          }
        }

        return {
          totalLeads: leads.length,
          pipelineValue,
          collected,
          outstanding: Math.max(pipelineValue - collected, 0),
          fullyPaidCount: leads.filter((l) => l.grandTotal > 0 && l.amtPaid >= l.grandTotal).length,
          openComplaints: (complaintsRes.data ?? []).filter((c) => c.status !== 'Resolved').length,
          siteVisitsCount: (visitsRes.data ?? []).length,
          stageFunnel,
          byAgent: [...byAgentMap.values()].sort((a, b) => b.value - a.value),
          collectedTrend: computeMonthlyTrend((paymentsRes.data ?? []).map((r) => ({ date: r.payment_date as string, amount: Number(r.amount ?? 0) }) as Payment)),
        };
      },
      async leaderboardRows(fromDate, toDate) {
        const { data, error } = await requireClient().rpc('leaderboard_rows', { p_from: fromDate, p_to: toDate });
        if (error) throw error;
        return (data ?? []).map(mapLeaderboardRawRow);
      },
      async leaderboardScores(fromDate, toDate) {
        const { data, error } = await requireClient().rpc('recompute_leaderboard_scores', { p_from: fromDate, p_to: toDate });
        if (error) throw error;
        return (data ?? []).map(mapLeaderboardScoreRow);
      },
      async leaderboardScoreHistory(limit) {
        const { data, error } = await requireClient().from('leaderboard_score_history').select('*').order('changed_at', { ascending: false }).limit(limit);
        if (error) throw error;
        return (data ?? []).map(mapLeaderboardScoreHistoryRow);
      },
      async commissionData() {
        const client = requireClient();
        const [paymentsRes, leadsRes, staffRes] = await Promise.all([client.from('payments').select('*'), client.from('leads').select('*'), client.from('profiles').select('agent_key,name').eq('role', 'agent')]);
        if (paymentsRes.error) throw paymentsRes.error;
        if (leadsRes.error) throw leadsRes.error;
        if (staffRes.error) throw staffRes.error;
        return {
          payments: (paymentsRes.data ?? []).map(mapPaymentRow),
          leads: (leadsRes.data ?? []).map(mapLeadRow),
          staff: (staffRes.data ?? []).map((r) => ({ key: r.agent_key as string, name: r.name as string })),
        };
      },
      async referralConversions(fromDate, toDate) {
        const { data, error } = await requireClient().rpc('staff_referral_conversions', { p_from: fromDate, p_to: toDate });
        if (error) throw error;
        return (data ?? []).map((r: Record<string, unknown>) => ({ staffKey: r.staff_key as string, referralConversions: Number(r.referral_conversions ?? 0) }));
      },
    },
    sve: {
      async listVisitsWithStatus() {
        const client = requireClient();
        const [visitsRes, invitesRes, submissionsRes] = await Promise.all([
          client.from('site_visits').select('*').order('visit_date', { ascending: false }),
          client.from('site_visit_experience_invites').select('*'),
          client.from('site_visit_experience_submissions').select('*'),
        ]);
        if (visitsRes.error) throw visitsRes.error;
        if (invitesRes.error) throw invitesRes.error;
        if (submissionsRes.error) throw submissionsRes.error;

        const invites = (invitesRes.data ?? []).map(mapSveInviteRow);
        const submissions = (submissionsRes.data ?? []).map(mapSveSubmissionRow);

        return (visitsRes.data ?? []).map(mapSiteVisitRow).map((siteVisit) => {
          const invite = invites.find((i) => i.siteVisitId === siteVisit.id) ?? null;
          const submission = invite ? (submissions.find((s) => s.inviteId === invite.id) ?? null) : null;
          return { siteVisit, invite, submission };
        });
      },
      async createInvite(siteVisitId, clientName, clientContact, sentBy) {
        const { data, error } = await requireClient()
          .from('site_visit_experience_invites')
          .insert({
            site_visit_id: siteVisitId,
            client_name: clientName,
            client_contact: clientContact,
            sent_at: new Date().toISOString(),
            sent_via: 'link',
            sent_by: sentBy,
          })
          .select()
          .single();
        if (error) throw error;
        return mapSveInviteRow(data);
      },
      async issueReportLink(submissionId, pdfBlob, createdBy, createdByName) {
        const client = requireClient();
        const path = `${submissionId}/report-${Date.now()}.pdf`;
        const { error: uploadError } = await client.storage.from('sve-reports').upload(path, pdfBlob, { contentType: 'application/pdf', upsert: true });
        if (uploadError) throw uploadError;
        const { data, error } = await client.from('sve_report_links').insert({ submission_id: submissionId, storage_path: path, created_by: createdBy, created_by_name: createdByName }).select('token').single();
        if (error) throw error;
        const { error: updError } = await client
          .from('site_visit_experience_submissions')
          .update({ report_pdf_path: path, report_sent_at: new Date().toISOString() })
          .eq('id', submissionId);
        if (updError) throw updError;
        return data.token as string;
      },
      async getOrCreateDayReport(visitDate) {
        const client = requireClient();
        const existing = await client.from('sve_day_reports').select('*').eq('visit_date', visitDate).maybeSingle();
        if (existing.error) throw existing.error;
        if (existing.data) return mapSveDayReportRow(existing.data);

        // Real starting point for a new day report: every client actually
        // visited that day, each carrying whatever feedback submission
        // already exists for them (if any) -- the AI feedback summary
        // itself is generated later, on demand, not auto-filled here.
        const [visitsRes, invitesRes, submissionsRes] = await Promise.all([
          client.from('site_visits').select('*').eq('visit_date', visitDate).is('deleted_at', null),
          client.from('site_visit_experience_invites').select('*'),
          client.from('site_visit_experience_submissions').select('id,invite_id'),
        ]);
        if (visitsRes.error) throw visitsRes.error;
        if (invitesRes.error) throw invitesRes.error;
        if (submissionsRes.error) throw submissionsRes.error;
        const visits = (visitsRes.data ?? []).map(mapSiteVisitRow);
        const entries: SveDayReport['entries'] = visits.map((v) => {
          const invite = (invitesRes.data ?? []).find((i) => i.site_visit_id === v.id) ?? null;
          const submission = invite ? (submissionsRes.data ?? []).find((s) => s.invite_id === invite.id) : null;
          return {
            siteVisitId: v.id,
            clientName: v.name,
            clientContact: v.contact,
            submissionId: (submission?.id as string) ?? null,
            aiFeedbackSummary: null,
            managerReview: null,
            managerNotesAi: null,
          };
        });
        const ins = await client
          .from('sve_day_reports')
          .insert({ visit_date: visitDate, site: visits[0]?.site ?? 'Royal Palm Enclave', entries })
          .select()
          .single();
        if (ins.error) {
          // Same unique-index race guard as weeklyVisitForms.getOrCreate --
          // two staff opening the same day's report at once shouldn't error
          // out, just fall back to whichever row won the insert race.
          const retry = await client.from('sve_day_reports').select('*').eq('visit_date', visitDate).maybeSingle();
          if (retry.error || !retry.data) throw retry.error ?? ins.error;
          return mapSveDayReportRow(retry.data);
        }
        return mapSveDayReportRow(ins.data);
      },
      async saveDayReport(id, patch) {
        const client = requireClient();
        const dbPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if ('entries' in patch) dbPatch.entries = patch.entries;
        if ('siteSummary' in patch) dbPatch.site_summary = patch.siteSummary;
        if ('siteSummaryAi' in patch) dbPatch.site_summary_ai = patch.siteSummaryAi;
        if ('preparedBy' in patch) dbPatch.prepared_by = patch.preparedBy;
        if ('preparedByName' in patch) dbPatch.prepared_by_name = patch.preparedByName;
        const { data, error } = await client.from('sve_day_reports').update(dbPatch).eq('id', id).select().single();
        if (error) throw error;
        return mapSveDayReportRow(data);
      },
      async listDayReports() {
        const { data, error } = await requireClient().from('sve_day_reports').select('*').order('visit_date', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(mapSveDayReportRow);
      },
      async issueDayReportLink(dayReportId, pdfBlob, createdBy, createdByName) {
        const client = requireClient();
        const path = `day-reports/${dayReportId}/report-${Date.now()}.pdf`;
        const { error: uploadError } = await client.storage.from('sve-reports').upload(path, pdfBlob, { contentType: 'application/pdf', upsert: true });
        if (uploadError) throw uploadError;
        const { data, error } = await client.from('sve_report_links').insert({ day_report_id: dayReportId, storage_path: path, created_by: createdBy, created_by_name: createdByName }).select('token').single();
        if (error) throw error;
        const { error: updError } = await client.from('sve_day_reports').update({ status: 'sent', report_pdf_path: path, sent_at: new Date().toISOString() }).eq('id', dayReportId);
        if (updError) throw updError;
        return data.token as string;
      },
    },
    chat: {
      async listConversations(myKey) {
        const client = requireClient();
        const [messagesRes, staffRes] = await Promise.all([
          client.from('messages').select('*').is('kind', null).or(`sender_key.eq.${myKey},recipient_key.eq.${myKey}`).order('created_at', { ascending: false }),
          client.from('profiles').select('agent_key,name,role,email').eq('active', true),
        ]);
        if (messagesRes.error) throw messagesRes.error;
        if (staffRes.error) throw staffRes.error;

        const staff = (staffRes.data ?? []).map(mapProfileRow);
        const mine = (messagesRes.data ?? []).map(mapChatMessageRow);
        const byOther = new Map<string, ChatMessage[]>();
        for (const m of mine) {
          const other = m.senderKey === myKey ? (m.recipientKey ?? '') : m.senderKey;
          if (!other) continue;
          const arr = byOther.get(other) ?? [];
          arr.push(m);
          byOther.set(other, arr);
        }
        return [...byOther.entries()].map(([otherKey, msgs]) => {
          const staffMatch = staff.find((s) => s.key === otherKey);
          const fromTheirOwnMessage = msgs.find((m) => m.senderKey === otherKey)?.senderName;
          return {
            otherKey,
            otherName: staffMatch?.name ?? fromTheirOwnMessage ?? otherKey,
            lastMessage: msgs[0] ?? null,
            unreadCount: msgs.filter((m) => m.recipientKey === myKey && !m.read).length,
          };
        });
      },
      async listThread(myKey, otherKey) {
        const { data, error } = await requireClient()
          .from('messages')
          .select('*')
          .is('kind', null)
          .or(`and(sender_key.eq.${myKey},recipient_key.eq.${otherKey}),and(sender_key.eq.${otherKey},recipient_key.eq.${myKey})`)
          .order('created_at', { ascending: true });
        if (error) throw error;
        return (data ?? []).map(mapChatMessageRow);
      },
      async send(myKey, myName, otherKey, body, replyToId) {
        const { data, error } = await requireClient()
          .from('messages')
          .insert({ sender_key: myKey, sender_name: myName, recipient_key: otherKey, body, reply_to_id: replyToId ?? null })
          .select()
          .single();
        if (error) throw error;
        return mapChatMessageRow(data);
      },
      async markThreadRead(myKey, otherKey) {
        const { error } = await requireClient().from('messages').update({ read: true }).eq('recipient_key', myKey).eq('sender_key', otherKey).eq('read', false);
        if (error) throw error;
      },
    },
    notifications: {
      async list(myKey) {
        const { data, error } = await requireClient()
          .from('messages')
          .select('*')
          .not('kind', 'is', null)
          .eq('recipient_key', myKey)
          .order('created_at', { ascending: false })
          .limit(50);
        if (error) throw error;
        return (data ?? []).map(mapChatMessageRow);
      },
      async unreadCount(myKey) {
        const { count, error } = await requireClient()
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .not('kind', 'is', null)
          .eq('recipient_key', myKey)
          .eq('read', false);
        if (error) throw error;
        return count ?? 0;
      },
      async markRead(id) {
        const { error } = await requireClient().from('messages').update({ read: true }).eq('id', id);
        if (error) throw error;
      },
      async markAllRead(myKey) {
        const { error } = await requireClient().from('messages').update({ read: true }).eq('recipient_key', myKey).not('kind', 'is', null).eq('read', false);
        if (error) throw error;
      },
      async notify(fromKey, fromName, toKeys, body, kind, refType, refId) {
        if (toKeys.length === 0) return;
        const { error } = await requireClient()
          .from('messages')
          .insert(toKeys.map((toKey) => ({ sender_key: fromKey, sender_name: fromName, recipient_key: toKey, body, kind, ref_type: refType ?? null, ref_id: refId ?? null })));
        if (error) throw error;
      },
    },
  };
}
