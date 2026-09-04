import type { AchievementDef, AllocationHistoryEvent, AllocationRequest, AttendanceRecord, AuditEvent, BackupRecord, Banner, BannerStatus, ChatConversation, ChatMessage, Complaint, ComplaintUpdate, Config, Contract, ContractRequest, DownloadRecord, Enquiry, FundRequest, ImportBatch, Lead, LeadUpdate, LeaderboardRow, LeaveRequest, ManagerOverview, Memo, NewAllocationRequest, NewBanner, NewComplaint, NewContractRequest, NewEnquiry, NewFundRequest, NewImportBatch, NewLead, NewLeaveRequest, NewMemo, NewNote, NewPaymentEntry, NewPlot, NewReferral, NewSiteVisit, NewTask, Note, Payment, PaymentDecisionResult, PaymentStatus, PermissionDef, PermissionOverride, Plot, PlotUpdate, Profile, Referral, ReportArchiveEntry, ScheduleItem, ScheduleItemStatus, SignInInput, SignOutInput, SiteVisit, StaffAchievement, StaffInvite, SveInviteRecord, SveVisitStatus, StreakRow, WeeklyVisitForm, WeeklyVisitFormCostPatch } from '../types/domain';
import { demoLoad, demoSave } from './demo/store';
import type { DemoDb } from './demo/store';
import { deriveStageFromPayment, computeGrandTotal, STAGES } from '../features/pipeline/lib/pipelineLogic';
import { today, monthKey, shiftMonth } from '../shared/lib/format';
import { getSupabaseClient } from './client';
import { friendlyErrorObj } from '../shared/lib/friendlyError';
import {
  mapAchievementDefRow,
  mapAllocationRequestRow,
  mapAttendanceRow,
  mapAuditEventRow,
  mapBackupRow,
  mapBannerRow,
  mapPermissionDefRow,
  mapPermissionOverrideRow,
  mapFundRequestRow,
  mapWeeklyVisitFormRow,
  mapChatMessageRow,
  mapComplaintRow,
  mapContractRequestRow,
  mapContractRow,
  mapDownloadRow,
  mapEnquiryRow,
  mapStaffAchievementRow,
  mapLeaderboardRawRow,
  mapLeadRow,
  mapLeaveRequestRow,
  mapMemoRow,
  mapNoteRow,
  mapPaymentRow,
  mapPlotRow,
  mapStaffInviteRow,
  mapProfileRow,
  mapReferralRow,
  mapReportArchiveRow,
  mapScheduleItemRow,
  mapSiteVisitRow,
  mapSveInviteRow,
  mapSveSubmissionRow,
  mapStreakRow,
  mapConfigRow,
  domainStatusToDb,
} from './mappers';

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

const DEMO_STAFF: Profile[] = [
  { key: 'management', name: 'Management', role: 'manager', email: 'management@landbankghana.com', active: true },
  { key: 'elias', name: 'Elias Torgbuivi', role: 'agent', email: 'opsofficer@landbankghana.com', active: true },
  { key: 'emmanuel', name: 'Emmanuel Owusu', role: 'agent', email: 'operations@landbankghana.com', active: true },
  { key: 'elizabeth', name: 'Elizabeth Misiame', role: 'agent', email: 'executiveassistant@landbankghana.com', active: true },
  // Deactivated on purpose -- gives the Team Roster screen's toggle a real
  // "reactivate" case to test, not just always-active rows. Key matches
  // production's real 'adams' staff member (confirmed live).
  { key: 'adams', name: 'Adams', role: 'agent', email: 'digitalopsofficer@landbankghana.com', active: false },
];

// The real 8 achievement definitions (confirmed live, identical on both
// projects -- staging is already fully seeded, no migration needed).
// Reused as-is for demo mode rather than inventing placeholder ones,
// since these ARE the real production data, not a guess.
const DEMO_ACHIEVEMENT_DEFS: AchievementDef[] = [
  { id: 'task_master', key: 'task_master', label: 'Task Master', description: null, icon: '🏅', criteriaType: 'tasksCompleted', criteriaConfig: { threshold: 20 }, points: 250, active: true, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'site_visit_pro', key: 'site_visit_pro', label: 'Site Visit Pro', description: null, icon: '🏅', criteriaType: 'siteVisits', criteriaConfig: { threshold: 10 }, points: 100, active: true, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'deal_closer', key: 'deal_closer', label: 'Deal Closer', description: null, icon: '🏅', criteriaType: 'dealsClosedYear', criteriaConfig: { threshold: 5 }, points: 200, active: true, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'punctuality_star', key: 'punctuality_star', label: 'Punctuality Star', description: null, icon: '🏅', criteriaType: 'onTimeDays', criteriaConfig: { threshold: 20 }, points: 100, active: true, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'perfect_attendance', key: 'perfect_attendance', label: 'Perfect Attendance', description: null, icon: '🏅', criteriaType: 'daysAttended', criteriaConfig: { threshold: 22 }, points: 150, active: true, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'referral_champion', key: 'referral_champion', label: 'Referral Champion', description: null, icon: '🏅', criteriaType: 'referralConversions', criteriaConfig: { threshold: 3 }, points: 150, active: true, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'todo_titan', key: 'todo_titan', label: 'To-Do Titan', description: null, icon: '🏅', criteriaType: 'todosCompleted', criteriaConfig: { threshold: 30 }, points: 100, active: true, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'top_collector', key: 'top_collector', label: 'Top Collector', description: null, icon: '🏅', criteriaType: 'totalCollected', criteriaConfig: { threshold: 100000 }, points: 300, active: true, createdAt: '2026-01-01T00:00:00Z' },
];

// The real 4 permission keys (confirmed live on staging -- see
// PHASE0_INVENTORY.md §4), reused as-is rather than inventing placeholders.
const DEMO_PERMISSION_DEFS: PermissionDef[] = [
  { key: 'payments.manage', label: 'Manage payments', description: 'Log, edit, delete payments' },
  { key: 'contracts.generate', label: 'Generate contracts', description: 'Create Contract of Sale records' },
  { key: 'allocations.manage', label: 'Manage plot allocations', description: 'Suggest/confirm/revert allocation requests' },
  { key: 'ops.view_all', label: 'View all staff back-office data', description: 'Cross-staff visibility on payments/contracts/site visits' },
];

function applyStaffOverrides(s: Profile, db: DemoDb): Profile {
  const active = s.key in db.staffActiveOverrides ? db.staffActiveOverrides[s.key] : s.active;
  const signatureData = db.staffSignatures[s.key] ?? null;
  return { ...s, active, signatureData };
}

// A memo a staff member "received" either because they're the primary
// to_key, or because they were CC'd via a memo_recipients row -- the two
// cases read `read` from different columns (memos.read vs
// memo_recipients.read) and are only deletable in the primary case (see
// the Memo type's comment in types/domain.ts: memo_recipients has no
// DELETE policy on production at all).
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
    setSource(id: string, source: string): Promise<Lead>;
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
    // (see PipelineDetailScreen's danger zone).
    remove(id: string): Promise<void>;
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
  scheduleItems: {
    listForAgentOnDate(agentKey: string, date: string): Promise<ScheduleItem[]>;
    // assignedTo defaults to the creator (agentKey) when omitted, matching
    // every existing call site's behavior exactly. When it's a different
    // key, this is a real "assign a task to a colleague" write -- owner_key
    // (the creator, real schedule_items_ins RLS: WITH CHECK owner_key =
    // my_key(), confirmed live) always stays agentKey; only assigned_to
    // changes, matching index.html's own owner/assignee split. The
    // colleague's own listForAgentOnDate already filters by assigned_to
    // (not owner_key), so this needs no read-side change at all.
    create(agentKey: string, date: string, title: string, assignedTo?: string): Promise<ScheduleItem>;
    updateStatus(id: string, status: ScheduleItemStatus): Promise<ScheduleItem>;
    // Task Board (kind='task', distinct from My Day's kind='todo' rows
    // above -- same table, always filtered apart). listAllTasks() is
    // manager-only (gated client-side, matching every other company-wide
    // list in this DataSource); listTasksForAgent() is what a staff
    // member's own board shows, same shape either way.
    listTasksForAgent(agentKey: string): Promise<ScheduleItem[]>;
    listAllTasks(): Promise<ScheduleItem[]>;
    createTask(ownerKey: string, ownerName: string, input: NewTask): Promise<ScheduleItem>;
    // Real reassignment (owner_key never changes -- matches create()'s own
    // owner/assignee split above); byKey/byName are stamped as
    // assigned_by/assigned_by_name so a reassign is attributable, per the
    // master spec's "records who reassigned and why" -- the "why" itself
    // isn't collected yet (no reason field wired into this pass).
    reassignTask(id: string, toKey: string, toName: string, byKey: string, byName: string): Promise<ScheduleItem>;
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
    update(patch: Partial<Pick<Config, 'leaderboardWeights' | 'commissionFullCap' | 'commissionHalfCap' | 'commissionPoolPerPlot'>>): Promise<Config>;
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
    listForAgent(agentKey: string): Promise<Enquiry[]>;
    listAll(): Promise<Enquiry[]>;
    create(agentKey: string, agentName: string, input: NewEnquiry): Promise<Enquiry>;
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
    decide(id: string, approve: boolean, decidedBy: string, decidedByName: string, decidedSignature: string | null): Promise<LeaveRequest>;
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
    list(filter?: { category?: string; criticalOnly?: boolean }): Promise<AuditEvent[]>;
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
    signIn(staffKey: string, staffName: string, input: SignInInput): Promise<AttendanceRecord>;
    signOut(staffKey: string, id: string, input: SignOutInput): Promise<AttendanceRecord>;
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
}

let cachedDemo: DataSource | null = null;
let cachedLive: DataSource | null = null;

export function getDataSource(demoMode: boolean): DataSource {
  if (!demoMode) {
    if (!cachedLive) cachedLive = createLiveDataSource();
    return cachedLive;
  }
  if (!cachedDemo) cachedDemo = createDemoDataSource();
  return cachedDemo;
}

function createDemoDataSource(): DataSource {
  return {
    leads: {
      async listForAgent(agentKey) {
        // Soft-deleted leads (deletedAt set) never appear -- matches real
        // leads_sel RLS, which filters deleted_at IS NULL (confirmed live,
        // ported to staging this session).
        return demoLoad().leads.filter((l) => l.agent === agentKey && !l.deletedAt);
      },
      async listAll() {
        return demoLoad().leads.filter((l) => !l.deletedAt);
      },
      async create(agentKey, input) {
        // Same rule as live mode -- see live leads.create()'s comment.
        // amt_paid always starts at 0 here regardless of input.amtPaid;
        // useCreateLead creates a real Payment row for a nonzero deposit.
        const grandTotal = computeGrandTotal(input.unitPrice, input.noPlots);
        const lead: Lead = {
          id: Math.random().toString(36).slice(2, 10),
          agent: agentKey,
          name: input.name,
          contact: input.contact,
          date: new Date().toISOString().slice(0, 10),
          plotType: input.plotType,
          noPlots: input.noPlots,
          unitPrice: input.unitPrice,
          paymentPlan: input.paymentPlan,
          amtPaid: 0,
          grandTotal,
          stage: deriveStageFromPayment(0, grandTotal),
          notes: input.notes,
        };
        const db = demoLoad();
        db.leads.push(lead);
        demoSave();
        return lead;
      },
      async get(agentKey, id) {
        return demoLoad().leads.find((l) => l.agent === agentKey && l.id === id && !l.deletedAt);
      },
      async listCompany() {
        return demoLoad().leads.filter((l) => l.agent === 'company' && !l.deletedAt);
      },
      async assign(id, agentKey) {
        const db = demoLoad();
        const index = db.leads.findIndex((l) => l.id === id);
        if (index === -1) throw new Error('Lead not found');
        // Immutable update -- assigning removes this lead from the
        // Company Leads list (agent no longer 'company'), the exact shape
        // that bit contractRequests.fulfil()/payments.approve() before
        // (see their comments): mutating in place there let the query
        // cache pick up the change before the invalidated refetch ran,
        // leaving the list one render behind.
        const updated: Lead = { ...db.leads[index], agent: agentKey };
        db.leads = [...db.leads.slice(0, index), updated, ...db.leads.slice(index + 1)];
        demoSave();
        return updated;
      },
      async setSource(id, source) {
        const db = demoLoad();
        const index = db.leads.findIndex((l) => l.id === id);
        if (index === -1) throw new Error('Lead not found');
        const updated: Lead = { ...db.leads[index], leadSource: source };
        db.leads = [...db.leads.slice(0, index), updated, ...db.leads.slice(index + 1)];
        demoSave();
        return updated;
      },
      async update(id, patch) {
        const db = demoLoad();
        const index = db.leads.findIndex((l) => l.id === id);
        if (index === -1) throw new Error('Lead not found');
        const updated: Lead = { ...db.leads[index], ...patch };
        db.leads = [...db.leads.slice(0, index), updated, ...db.leads.slice(index + 1)];
        demoSave();
        return updated;
      },
      async updateDocStage(id, stage) {
        const db = demoLoad();
        const index = db.leads.findIndex((l) => l.id === id);
        if (index === -1) throw new Error('Lead not found');
        const updated: Lead = { ...db.leads[index], docStage: stage, docStageUpdatedAt: new Date().toISOString() };
        db.leads = [...db.leads.slice(0, index), updated, ...db.leads.slice(index + 1)];
        demoSave();
      },
      async remove(id) {
        // Soft delete -- matches the real fix (see the interface's own
        // comment above). The row stays in db.leads (still joinable by any
        // code that looks it up by id, e.g. a payment's linked lead name --
        // matches real production, where a soft-deleted row still
        // physically exists), just excluded from listForAgent/listAll/get/
        // listCompany from now on.
        const db = demoLoad();
        const index = db.leads.findIndex((l) => l.id === id);
        if (index === -1) return;
        const updated: Lead = { ...db.leads[index], deletedAt: new Date().toISOString() };
        db.leads = [...db.leads.slice(0, index), updated, ...db.leads.slice(index + 1)];
        demoSave();
      },
    },
    payments: {
      async listForAgent(agentKey) {
        return demoLoad().payments.filter((p) => p.agentKey === agentKey);
      },
      async listForLead(leadId) {
        return demoLoad().payments.filter((p) => p.leadId === leadId);
      },
      async listAll() {
        return demoLoad().payments;
      },
      async listPending() {
        return demoLoad().payments.filter((p) => p.status === 'pending');
      },
      async create(input, leadName, leadAgentKey, requestedStatus) {
        const db = demoLoad();
        const payment: Payment = {
          id: Math.random().toString(36).slice(2, 10),
          leadId: input.leadId,
          agentKey: leadAgentKey,
          amount: input.amount,
          date: input.paymentDate ?? new Date().toISOString().slice(0, 10),
          clientName: leadName,
          paymentMethod: input.paymentMethod ?? null,
          note: input.note ?? null,
          status: requestedStatus,
          decidedBy: null,
          decidedByName: null,
          decidedAt: null,
          receiptNumber: null,
        };
        db.payments.push(payment);
        if (requestedStatus === 'approved') {
          const lead = db.leads.find((l) => l.id === input.leadId);
          if (lead) {
            lead.amtPaid += input.amount;
            lead.stage = deriveStageFromPayment(lead.amtPaid, lead.grandTotal);
          }
        }
        demoSave();
        return payment;
      },
      async approve(paymentId, decidedBy, decidedByName) {
        const db = demoLoad();
        const index = db.payments.findIndex((p) => p.id === paymentId);
        if (index === -1) throw new Error('Payment not found');
        if (db.payments[index].status !== 'pending') throw new Error('This payment is no longer pending');
        // Immutable update (new object + new array), same fix as
        // contractRequests.fulfil() -- mutating in place here let the
        // query cache pick up 'approved' before the invalidated refetch
        // ran, leaving the Pending Approvals list one render behind.
        const decidedAt = new Date().toISOString();
        const updated = { ...db.payments[index], status: 'approved' as const, decidedBy, decidedByName, decidedAt };
        db.payments = [...db.payments.slice(0, index), updated, ...db.payments.slice(index + 1)];
        const leadIndex = db.leads.findIndex((l) => l.id === updated.leadId);
        let newAmtPaid = 0;
        let newBalance = 0;
        if (leadIndex !== -1) {
          const amtPaid = db.leads[leadIndex].amtPaid + updated.amount;
          const stage = deriveStageFromPayment(amtPaid, db.leads[leadIndex].grandTotal);
          const updatedLead = { ...db.leads[leadIndex], amtPaid, stage };
          db.leads = [...db.leads.slice(0, leadIndex), updatedLead, ...db.leads.slice(leadIndex + 1)];
          newAmtPaid = amtPaid;
          newBalance = Math.max(updatedLead.grandTotal - amtPaid, 0);
        }
        demoSave();
        return { decidedBy, decidedByName, newAmtPaid, newBalance };
      },
      async decline(paymentId, decidedBy, decidedByName) {
        const db = demoLoad();
        const index = db.payments.findIndex((p) => p.id === paymentId);
        if (index === -1) throw new Error('Payment not found');
        if (db.payments[index].status !== 'pending') throw new Error('This payment is no longer pending');
        const decidedAt = new Date().toISOString();
        const updated = { ...db.payments[index], status: 'declined' as const, decidedBy, decidedByName, decidedAt };
        db.payments = [...db.payments.slice(0, index), updated, ...db.payments.slice(index + 1)];
        demoSave();
      },
      async ensureReceiptNumber(paymentId) {
        const db = demoLoad();
        const index = db.payments.findIndex((p) => p.id === paymentId);
        if (index === -1) throw new Error('Payment not found');
        const existing = db.payments[index].receiptNumber;
        if (existing) return existing;
        // Matches index.html's own DEMO_MODE fallback exactly:
        // 'RCT-'+String(paymentId).slice(0,6).toUpperCase().
        const number = `RCT-${paymentId.slice(0, 6).toUpperCase()}`;
        const updated = { ...db.payments[index], receiptNumber: number };
        db.payments = [...db.payments.slice(0, index), updated, ...db.payments.slice(index + 1)];
        demoSave();
        return number;
      },
      async uploadProof(paymentId, _agentKey, file) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
        const db = demoLoad();
        const index = db.payments.findIndex((p) => p.id === paymentId);
        if (index === -1) throw new Error('Payment not found');
        const updated = { ...db.payments[index], receiptProofPath: dataUrl };
        db.payments = [...db.payments.slice(0, index), updated, ...db.payments.slice(index + 1)];
        demoSave();
        return dataUrl;
      },
      async resolveProofUrl(path) {
        // Demo's "path" already IS a data URI (see uploadProof above), so
        // there's nothing to resolve -- just hand it back.
        return path;
      },
      async issueReceiptLink(paymentId, _pdfBlob, _createdBy) {
        const db = demoLoad();
        const token = `demo-${Math.random().toString(36).slice(2, 12)}`;
        db.receiptShareLinks = [...db.receiptShareLinks, { id: Math.random().toString(36).slice(2, 10), paymentId, token, createdAt: new Date().toISOString() }];
        demoSave();
        return token;
      },
    },
    scheduleItems: {
      async listForAgentOnDate(agentKey, date) {
        // kind==='todo' filter added alongside Task Board -- previously
        // harmless (no kind='task' demo rows existed yet), but with real
        // task rows now seedable this would otherwise leak tasks into My
        // Day's todo list, unlike live mode's query which always filtered
        // by kind already.
        return demoLoad().scheduleItems.filter((s) => s.kind === 'todo' && s.assignedTo === agentKey && s.date === date);
      },
      async create(agentKey, date, title, assignedTo) {
        const item: ScheduleItem = {
          id: Math.random().toString(36).slice(2, 10),
          kind: 'todo',
          ownerKey: agentKey,
          assignedTo: assignedTo ?? agentKey,
          date,
          status: 'open',
          title,
        };
        const db = demoLoad();
        db.scheduleItems.push(item);
        demoSave();
        return item;
      },
      async updateStatus(id, status) {
        const db = demoLoad();
        const item = db.scheduleItems.find((s) => s.id === id);
        if (!item) throw new Error('Schedule item not found');
        item.status = status;
        demoSave();
        return item;
      },
      async listTasksForAgent(agentKey) {
        return demoLoad()
          .scheduleItems.filter((s) => s.kind === 'task' && s.assignedTo === agentKey);
      },
      async listAllTasks() {
        return demoLoad().scheduleItems.filter((s) => s.kind === 'task');
      },
      async createTask(ownerKey, ownerName, input) {
        const item: ScheduleItem = {
          id: Math.random().toString(36).slice(2, 10),
          kind: 'task',
          ownerKey,
          ownerName,
          assignedTo: input.assignedTo,
          assignedToName: input.assignedToName,
          date: input.dueDate ?? new Date().toISOString().slice(0, 10),
          status: 'open',
          title: input.title,
          description: input.description ?? null,
          category: input.category ?? null,
          priority: input.priority ?? null,
        };
        const db = demoLoad();
        db.scheduleItems.push(item);
        demoSave();
        return item;
      },
      async reassignTask(id, toKey, toName) {
        const db = demoLoad();
        const item = db.scheduleItems.find((s) => s.id === id);
        if (!item) throw new Error('Task not found');
        item.assignedTo = toKey;
        item.assignedToName = toName;
        demoSave();
        return item;
      },
    },
    streaks: {
      async history(staffKey, days) {
        const from = new Date();
        from.setDate(from.getDate() - days);
        const fromIso = from.toISOString().slice(0, 10);
        return demoLoad().streaks.filter((s) => s.staffKey === staffKey && s.date >= fromIso);
      },
      async markToday(staffKey, patch) {
        const db = demoLoad();
        const t = today();
        const row: StreakRow = { staffKey, date: t, dayMet: !!patch.todoLogged };
        const exists = db.streaks.some((s) => s.staffKey === staffKey && s.date === t);
        db.streaks = exists ? db.streaks.map((s) => (s.staffKey === staffKey && s.date === t ? row : s)) : [...db.streaks, row];
        demoSave();
        return row;
      },
    },
    config: {
      async get() {
        return demoLoad().config;
      },
      async update(patch) {
        const db = demoLoad();
        db.config = { ...db.config, ...patch };
        demoSave();
        return db.config;
      },
    },
    plots: {
      async list() {
        return demoLoad().plots;
      },
      async create(input) {
        const db = demoLoad();
        const plot: Plot = {
          id: crypto.randomUUID(),
          site: input.site,
          plotNumber: input.plotNumber,
          plotType: input.plotType,
          status: input.status,
          price: input.price ?? null,
          clientName: input.clientName ?? null,
          clientContact: input.clientContact ?? null,
          agentKey: input.agentKey ?? null,
          notes: input.notes ?? null,
          unitKind: 'whole',
          parentPlotId: null,
          section: input.section ?? null,
          widthFt: input.widthFt ?? null,
          lengthFt: input.lengthFt ?? null,
          areaSqft: input.widthFt != null && input.lengthFt != null ? input.widthFt * input.lengthFt : null,
        };
        db.plots = [plot, ...db.plots];
        demoSave();
        return plot;
      },
      async update(id, patch) {
        const db = demoLoad();
        db.plots = db.plots.map((p) => {
          if (p.id !== id) return p;
          const next = { ...p, ...patch };
          // areaSqft mirrors the real generated column -- recomputed
          // whenever either dimension changes, never set directly.
          if ('widthFt' in patch || 'lengthFt' in patch) {
            next.areaSqft = next.widthFt != null && next.lengthFt != null ? next.widthFt * next.lengthFt : null;
          }
          return next;
        });
        demoSave();
        const updated = db.plots.find((p) => p.id === id);
        if (!updated) throw new Error('Plot not found');
        return updated;
      },
      async remove(id) {
        const db = demoLoad();
        db.plots = db.plots.filter((p) => p.id !== id);
        demoSave();
      },
      async split(plotId) {
        const db = demoLoad();
        const p = db.plots.find((x) => x.id === plotId);
        if (!p) throw new Error('Plot not found');
        if (p.status === 'Subdivided') {
          const kids = db.plots.filter((x) => x.parentPlotId === plotId);
          const plotA = kids.find((k) => k.plotNumber === p.plotNumber + 'a') ?? null;
          const plotB = kids.find((k) => k.plotNumber === p.plotNumber + 'b') ?? null;
          if (plotA && plotB) return { alreadySplit: true, plotA, plotB };
          throw new Error('Plot is marked Subdivided but its children could not be found');
        }
        if (p.plotType !== 'Full Plot') throw new Error('Only a Full Plot can be split into halves');
        if (p.status !== 'Available') throw new Error(`Only an Available plot can be split (current status: ${p.status})`);
        if (p.unitKind === 'half' || p.parentPlotId) throw new Error('This plot is already a half-unit and cannot be split further');
        const half = p.price != null ? p.price / 2 : null;
        // Dimensions deliberately left null on both halves -- splitting a
        // parent's width_ft/length_ft evenly would be a guess without a
        // real geometry/survey source (Master Spec 7.2: a half sale must
        // identify which physical sub-unit is reserved, not just halve a
        // number). section carries over since both halves share the
        // parent's physical location.
        const plotA: Plot = { id: crypto.randomUUID(), site: p.site, plotNumber: p.plotNumber + 'a', plotType: 'Half Plot', status: 'Available', price: half, clientName: null, clientContact: null, agentKey: null, notes: null, unitKind: 'half', parentPlotId: p.id, section: p.section, widthFt: null, lengthFt: null, areaSqft: null };
        const plotB: Plot = { id: crypto.randomUUID(), site: p.site, plotNumber: p.plotNumber + 'b', plotType: 'Half Plot', status: 'Available', price: half, clientName: null, clientContact: null, agentKey: null, notes: null, unitKind: 'half', parentPlotId: p.id, section: p.section, widthFt: null, lengthFt: null, areaSqft: null };
        db.plots = [plotB, plotA, ...db.plots.map((x) => (x.id === plotId ? { ...x, status: 'Subdivided' as const } : x))];
        demoSave();
        return { alreadySplit: false, plotA, plotB };
      },
    },
    siteVisits: {
      async listForAgent(agentKey) {
        return demoLoad().siteVisits.filter((v) => v.agentKey === agentKey);
      },
      async listAll() {
        return demoLoad().siteVisits;
      },
      async create(agentKey, agentName, input) {
        const visit: SiteVisit = {
          id: Math.random().toString(36).slice(2, 10),
          agentKey,
          agentName,
          name: input.name,
          contact: input.contact,
          site: input.site,
          plot: input.plot ?? null,
          visitDate: input.visitDate,
          visitTime: input.visitTime ?? null,
          people: input.people ?? null,
          transport: input.transport ?? null,
          pickup: input.pickup ?? null,
          placeOfWork: input.placeOfWork ?? null,
          position: input.position ?? null,
          nationality: input.nationality ?? null,
          purpose: input.purpose ?? null,
          discussionSoFar: input.discussionSoFar ?? null,
          keyUnderstanding: input.keyUnderstanding ?? null,
          feedbackAfter: null,
          keyNextSteps: null,
          source: input.source ?? null,
          accompanied: input.accompanied ?? null,
          notes: input.notes ?? null,
          status: 'Pending',
          createdAt: new Date().toISOString(),
        };
        const db = demoLoad();
        db.siteVisits.push(visit);
        demoSave();
        return visit;
      },
    },
    referrals: {
      async listForAgent(agentKey, viewAll) {
        const db = demoLoad();
        if (viewAll) return db.referrals;
        return db.referrals.filter((r) => r.referrerLeadId && db.leads.some((l) => l.id === r.referrerLeadId && l.agent === agentKey));
      },
      async linkLead(id, leadId) {
        const db = demoLoad();
        db.referrals = db.referrals.map((r) => (r.id === id ? { ...r, referredLeadId: leadId } : r));
        demoSave();
        return db.referrals.find((r) => r.id === id)!;
      },
      async clear(id, points) {
        const db = demoLoad();
        const referral = db.referrals.find((r) => r.id === id);
        if (!referral) throw new Error('Referral not found');
        if (!referral.referredLeadId) throw new Error('Link this referral to a lead before clearing it');
        const lead = db.leads.find((l) => l.id === referral.referredLeadId);
        if (!lead) throw new Error('Linked lead not found');
        const pct = lead.grandTotal > 0 ? lead.amtPaid / lead.grandTotal : 0;
        if (pct < 0.3) throw new Error(`Linked lead has only paid ${Math.round(pct * 100)}% of the plot price -- needs at least 30% before this referral can be cleared`);
        db.referrals = db.referrals.map((r) => (r.id === id ? { ...r, status: 'Cleared', pointsAwarded: points, clearedAt: new Date().toISOString() } : r));
        demoSave();
        return db.referrals.find((r) => r.id === id)!;
      },
      async create(agentKey, input) {
        const db = demoLoad();
        const referrerLead = db.leads.find((l) => l.id === input.referrerLeadId && l.agent === agentKey);
        if (!referrerLead) throw new Error('Pick one of your own leads as the referrer');
        const referral: Referral = {
          id: Math.random().toString(36).slice(2, 10),
          referrerLeadId: referrerLead.id,
          referrerName: referrerLead.name,
          referrerContact: referrerLead.contact,
          referredName: input.referredName,
          referredContact: input.referredContact,
          referredLocation: input.referredLocation ?? null,
          referredNoPlots: input.referredNoPlots ?? 1,
          referredLeadId: null,
          status: 'Pending',
          pointsAwarded: 0,
          source: 'staff',
          createdByKey: agentKey,
          createdAt: new Date().toISOString(),
          clearedAt: null,
          archived: false,
        };
        db.referrals.push(referral);
        demoSave();
        return referral;
      },
    },
    enquiries: {
      async listForAgent(agentKey) {
        return demoLoad().enquiries.filter((e) => e.agentKey === agentKey);
      },
      async listAll() {
        return demoLoad().enquiries;
      },
      async create(agentKey, agentName, input) {
        const enquiry: Enquiry = {
          id: Math.random().toString(36).slice(2, 10),
          agentKey,
          agentName,
          name: input.name,
          contact: input.contact,
          location: input.location ?? null,
          types: input.types && input.types.length > 0 ? input.types.join(',') : null,
          plot: input.plot ?? null,
          source: input.source ?? null,
          details: input.details ?? null,
          follow: input.follow ?? null,
          followDate: input.followDate ?? null,
          createdAt: new Date().toISOString(),
        };
        const db = demoLoad();
        db.enquiries.push(enquiry);
        demoSave();
        return enquiry;
      },
    },
    complaints: {
      async listForAgent(agentKey) {
        return demoLoad().complaints.filter((c) => c.agentKey === agentKey);
      },
      async listAll() {
        return demoLoad().complaints;
      },
      async create(agentKey, agentName, input) {
        const complaint: Complaint = {
          id: Math.random().toString(36).slice(2, 10),
          agentKey,
          agentName,
          name: input.name,
          contact: input.contact,
          plot: input.plot ?? null,
          category: input.category ?? null,
          details: input.details ?? null,
          owner: null,
          priority: input.priority ?? null,
          resolution: null,
          status: 'Open',
          createdAt: new Date().toISOString(),
          source: null,
          sentiment: null,
        };
        const db = demoLoad();
        db.complaints.push(complaint);
        demoSave();
        return complaint;
      },
      async update(id, patch) {
        const db = demoLoad();
        const complaint = db.complaints.find((c) => c.id === id);
        if (!complaint) throw new Error('Complaint not found');
        Object.assign(complaint, patch);
        demoSave();
        return complaint;
      },
    },
    contractRequests: {
      async list(viewerKey, viewerRole) {
        const db = demoLoad();
        const canSeeAll = viewerRole === 'manager' || viewerKey === 'elizabeth';
        return db.contractRequests.filter((r) => canSeeAll || r.requestedBy === viewerKey);
      },
      async create(agentKey, agentName, input) {
        const request: ContractRequest = {
          id: Math.random().toString(36).slice(2, 10),
          leadId: input.leadId,
          clientName: input.clientName,
          requestedBy: agentKey,
          requestedByName: agentName,
          note: input.note ?? null,
          status: 'pending',
          createdAt: new Date().toISOString(),
          fulfilledAt: null,
        };
        const db = demoLoad();
        db.contractRequests.push(request);
        demoSave();
        return request;
      },
      async fulfil(id) {
        const db = demoLoad();
        const index = db.contractRequests.findIndex((r) => r.id === id);
        if (index === -1) throw new Error('Contract request not found');
        // Builds a NEW object/array rather than mutating in place -- an
        // earlier version mutated the existing object directly, which (via
        // TanStack Query's structural-sharing/reference-equality checks)
        // let the query cache silently pick up the new status before the
        // refetch it was invalidated for ever ran, leaving a real observed
        // bug: the row's own re-render showed "Fulfilled" correctly, but
        // the LIST-level pending/fulfilled grouping one level up never
        // re-rendered, since React Query saw "no change" in the refetch.
        // Always returning fresh references here makes a real query-cache
        // update happen, not just a lucky same-tick mutation.
        const updated: ContractRequest = { ...db.contractRequests[index], status: 'fulfilled', fulfilledAt: new Date().toISOString() };
        db.contractRequests = [...db.contractRequests.slice(0, index), updated, ...db.contractRequests.slice(index + 1)];
        demoSave();
        return updated;
      },
    },
    contracts: {
      async list() {
        return demoLoad().contracts;
      },
      async create(leadId, clientName, agentKey, createdBy, createdByName) {
        const record: Contract = {
          id: Math.random().toString(36).slice(2, 10),
          leadId,
          clientName,
          agentKey,
          createdBy,
          createdByName,
          createdAt: new Date().toISOString(),
        };
        const db = demoLoad();
        db.contracts = [record, ...db.contracts];
        demoSave();
        return record;
      },
    },
    leaveRequests: {
      async list() {
        return demoLoad().leaveRequests;
      },
      async create(agentKey, agentName, input) {
        const request: LeaveRequest = {
          id: Math.random().toString(36).slice(2, 10),
          agentKey,
          agentName,
          year: new Date(input.dates[0]).getFullYear(),
          dates: input.dates,
          daysCount: input.dates.length,
          letterText: input.letterText ?? null,
          status: 'pending',
          createdAt: new Date().toISOString(),
          decidedAt: null,
          decidedBy: null,
          decidedByName: null,
          decidedSignature: null,
        };
        const db = demoLoad();
        db.leaveRequests.push(request);
        demoSave();
        return request;
      },
      async decide(id, approve, decidedBy, decidedByName, decidedSignature) {
        const db = demoLoad();
        const index = db.leaveRequests.findIndex((r) => r.id === id);
        if (index === -1) throw new Error('Leave request not found');
        const updated: LeaveRequest = { ...db.leaveRequests[index], status: approve ? 'approved' : 'declined', decidedAt: new Date().toISOString(), decidedBy, decidedByName, decidedSignature: approve ? decidedSignature : null };
        db.leaveRequests = [...db.leaveRequests.slice(0, index), updated, ...db.leaveRequests.slice(index + 1)];
        demoSave();
        return updated;
      },
    },
    banners: {
      async list() {
        return demoLoad().banners;
      },
      async create(createdBy, createdByName, input) {
        const banner: Banner = {
          id: crypto.randomUUID(),
          name: input.name,
          area: input.area,
          status: input.status,
          lat: null,
          lng: null,
          image: null,
          notes: input.notes ?? null,
          createdBy,
          createdByName,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const db = demoLoad();
        db.banners = [banner, ...db.banners];
        demoSave();
        return banner;
      },
      async updateStatus(id, status) {
        const db = demoLoad();
        const index = db.banners.findIndex((b) => b.id === id);
        if (index === -1) throw new Error('Banner not found');
        const updated: Banner = { ...db.banners[index], status, updatedAt: new Date().toISOString() };
        db.banners = [...db.banners.slice(0, index), updated, ...db.banners.slice(index + 1)];
        demoSave();
        return updated;
      },
    },
    async leadBannerCounts() {
      const counts: Record<string, number> = {};
      demoLoad().leads.forEach((l) => {
        if (l.bannerId) counts[l.bannerId] = (counts[l.bannerId] ?? 0) + 1;
      });
      return counts;
    },
    fundRequests: {
      async list(viewerKey, viewerRole) {
        const db = demoLoad();
        const canSeeAll = viewerRole === 'manager';
        return db.fundRequests.filter((f) => canSeeAll || f.requestedBy === viewerKey);
      },
      async create(requestedBy, requestedByName, input) {
        const fr: FundRequest = {
          id: crypto.randomUUID(),
          type: input.type,
          amount: input.amount,
          purpose: input.purpose,
          requestedBy,
          requestedByName,
          status: 'pending',
          decidedBy: null,
          decidedByName: null,
          decidedAt: null,
          decisionNote: null,
          receiptData: input.receiptData ?? null,
          receiptName: input.receiptName ?? null,
          createdAt: new Date().toISOString(),
        };
        const db = demoLoad();
        db.fundRequests = [fr, ...db.fundRequests];
        demoSave();
        return fr;
      },
      async decide(id, approve, decidedBy, decidedByName, note) {
        const db = demoLoad();
        const index = db.fundRequests.findIndex((f) => f.id === id);
        if (index === -1) throw new Error('Fund request not found');
        const updated: FundRequest = { ...db.fundRequests[index], status: approve ? 'approved' : 'rejected', decidedBy, decidedByName, decidedAt: new Date().toISOString(), decisionNote: note ?? null };
        db.fundRequests = [...db.fundRequests.slice(0, index), updated, ...db.fundRequests.slice(index + 1)];
        demoSave();
        return updated;
      },
    },
    weeklyVisitForms: {
      async getOrCreate(weekStart, visitDate) {
        const db = demoLoad();
        db.weeklyVisitForms = db.weeklyVisitForms ?? [];
        let f = db.weeklyVisitForms.find((x) => x.weekStart === weekStart && x.visitDate === visitDate);
        if (!f) {
          f = {
            id: crypto.randomUUID(),
            weekStart,
            visitDate,
            vehicleRentalEst: 0,
            driversTipEst: 0,
            fuelEst: 0,
            refreshmentEst: 0,
            tntEst: 0,
            vehicleRentalAct: 0,
            driversTipAct: 0,
            fuelAct: 0,
            refreshmentAct: 0,
            tntAct: 0,
            siteManagerName: null,
            status: 'Open',
            approvedBy: null,
            approvedByName: null,
            approvedSignature: null,
            finalizedAt: null,
          };
          db.weeklyVisitForms = [f, ...db.weeklyVisitForms];
          demoSave();
        }
        return { ...f };
      },
      async saveCosts(id, patch) {
        const db = demoLoad();
        const index = db.weeklyVisitForms.findIndex((f) => f.id === id);
        if (index === -1) throw new Error('Form not found');
        const updated: WeeklyVisitForm = { ...db.weeklyVisitForms[index], ...patch };
        db.weeklyVisitForms = [...db.weeklyVisitForms.slice(0, index), updated, ...db.weeklyVisitForms.slice(index + 1)];
        demoSave();
        return updated;
      },
      async finalize(id, approvedBy, approvedByName, signature) {
        const db = demoLoad();
        const index = db.weeklyVisitForms.findIndex((f) => f.id === id);
        if (index === -1) throw new Error('Form not found');
        const updated: WeeklyVisitForm = { ...db.weeklyVisitForms[index], status: 'Finalized', approvedBy, approvedByName, approvedSignature: signature, finalizedAt: new Date().toISOString() };
        db.weeklyVisitForms = [...db.weeklyVisitForms.slice(0, index), updated, ...db.weeklyVisitForms.slice(index + 1)];
        demoSave();
        return updated;
      },
    },
    downloads: {
      async list(viewerKey, viewerRole) {
        const db = demoLoad();
        const canSeeAll = viewerRole === 'manager';
        return (db.downloads ?? []).filter((d) => canSeeAll || d.userKey === viewerKey);
      },
      async log(userKey, userName, filename, kind, fileData) {
        const db = demoLoad();
        const rec: DownloadRecord = { id: crypto.randomUUID(), userKey, userName, filename, kind, fileData, createdAt: new Date().toISOString() };
        db.downloads = [rec, ...(db.downloads ?? [])];
        demoSave();
        return rec;
      },
    },
    importBatches: {
      async create(importedBy, importedByName, batch) {
        const db = demoLoad();
        const rec: ImportBatch = { id: crypto.randomUUID(), importedBy, importedByName, ...batch, createdAt: new Date().toISOString() };
        db.importBatches = [rec, ...(db.importBatches ?? [])];
        demoSave();
      },
    },
    reportArchive: {
      async list(limit = 30) {
        const db = demoLoad();
        return (db.reportArchive ?? []).slice(0, limit);
      },
    },
    achievements: {
      async listDefs() {
        return DEMO_ACHIEVEMENT_DEFS;
      },
      async listEarned(staffKeys) {
        const db = demoLoad();
        return (db.staffAchievements ?? []).filter((a) => staffKeys.includes(a.staffKey));
      },
      async award(staffKey, staffName, achievementId, progress) {
        const db = demoLoad();
        db.staffAchievements = db.staffAchievements ?? [];
        if (db.staffAchievements.some((a) => a.staffKey === staffKey && a.achievementId === achievementId)) return null;
        const rec: StaffAchievement = { id: crypto.randomUUID(), staffKey, staffName, achievementId, earnedAt: new Date().toISOString(), progress };
        db.staffAchievements = [rec, ...db.staffAchievements];
        demoSave();
        return rec;
      },
    },
    audit: {
      async list(filter) {
        const db = demoLoad();
        return (db.auditEvents ?? [])
          .filter((e) => !filter?.category || filter.category === 'all' || e.category === filter.category)
          .filter((e) => !filter?.criticalOnly || e.severity === 'critical')
          .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      },
      async log(eventType, severity, summary, detail, entityType, entityId) {
        const db = demoLoad();
        db.auditEvents = db.auditEvents ?? [];
        const nextId = (db.auditEvents.reduce((max, e) => Math.max(max, e.id), 0) || 0) + 1;
        const rec: AuditEvent = { id: nextId, createdAt: new Date().toISOString(), category: 'audit', eventType, severity, actorKey: null, actorName: null, entityType: entityType ?? null, entityId: entityId ?? null, summary, detail: detail ?? null, source: 'client' };
        db.auditEvents = [rec, ...db.auditEvents];
        demoSave();
      },
    },
    pushSubscriptions: {
      async save() {
        // Demo mode has no real push service to register with (and no
        // server-side push_subscriptions table to write to) -- the
        // subscribe flow itself already short-circuits before calling
        // this in demo mode, this is just here to satisfy the interface.
      },
    },
    sms: {
      async send() {
        // Demo mode never sends a real SMS (no Arkesel key, no real phone
        // number to text) -- matches apiSendSms's own DEMO_MODE branch,
        // which just returns true without a network call.
        return true;
      },
    },
    backups: {
      async list() {
        const db = demoLoad();
        return (db.backups ?? []).map(({ snapshot: _snapshot, ...rest }) => rest).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      },
      async createNow(triggeredBy, triggeredByName) {
        const db = demoLoad();
        db.backups = db.backups ?? [];
        // Same real table set create_backup() snapshots server-side,
        // narrowed to what DemoDb actually carries -- see restore()'s
        // matching field list below.
        const snapshot: Partial<DemoDb> = {
          leads: db.leads,
          payments: db.payments,
          plots: db.plots,
          enquiries: db.enquiries,
          complaints: db.complaints,
          siteVisits: db.siteVisits,
          allocationRequests: db.allocationRequests,
          scheduleItems: db.scheduleItems,
          leaveRequests: db.leaveRequests,
          memos: db.memos,
          contracts: db.contracts,
          contractRequests: db.contractRequests,
          config: db.config,
        };
        const tableCounts: Record<string, number> = Object.fromEntries(Object.entries(snapshot).map(([k, v]) => [k, Array.isArray(v) ? v.length : 1]));
        const cloned = JSON.parse(JSON.stringify(snapshot)) as Partial<DemoDb>;
        const sizeBytes = JSON.stringify(cloned).length;
        const rec: BackupRecord & { snapshot: Partial<DemoDb> } = {
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          triggerType: 'manual',
          triggeredBy,
          triggeredByName,
          tableCounts,
          sizeBytes,
          checksum: sizeBytes.toString(36),
          snapshot: cloned,
        };
        db.backups = [rec, ...db.backups].slice(0, 30);
        demoSave();
        const { snapshot: _snapshot, ...publicRec } = rec;
        return publicRec;
      },
      async restore(backupId, triggeredBy, triggeredByName) {
        const db = demoLoad();
        const found = (db.backups ?? []).find((b) => b.id === backupId);
        if (!found) throw new Error('Backup not found');
        // Real restore_backup() always takes a fresh pre-restore safety
        // snapshot before touching anything -- ported here too rather than
        // simplified away, so the demo genuinely exercises the same
        // safety property, not just the happy path.
        await getDataSource(true).backups.createNow(triggeredBy, triggeredByName + ' (pre-restore safety backup)');
        const fresh = demoLoad();
        Object.assign(fresh, found.snapshot);
        demoSave();
        await getDataSource(true).audit.log('backup.restored', 'critical', `Full system backup restored from ${backupId}`, { restoredFrom: backupId }, 'backup', backupId);
      },
    },
    permissions: {
      async listDefs() {
        return DEMO_PERMISSION_DEFS;
      },
      async listOverrides() {
        const db = demoLoad();
        return db.permissionOverrides ?? [];
      },
      async grant(staffKey, permissionKey, grantedBy) {
        const db = demoLoad();
        db.permissionOverrides = db.permissionOverrides ?? [];
        const existing = db.permissionOverrides.find((o) => o.staffKey === staffKey && o.permissionKey === permissionKey);
        if (existing) {
          existing.granted = true;
          existing.grantedBy = grantedBy;
          existing.grantedAt = new Date().toISOString();
        } else {
          db.permissionOverrides = [...db.permissionOverrides, { staffKey, permissionKey, granted: true, grantedBy, grantedAt: new Date().toISOString() }];
        }
        demoSave();
        await getDataSource(true).audit.log('permission_override.granted', 'warning', `${grantedBy} granted permission "${permissionKey}" to ${staffKey}`, { staffKey, permissionKey, granted: true }, 'staff_permission_override', staffKey);
      },
      async clear(staffKey, permissionKey) {
        const db = demoLoad();
        db.permissionOverrides = (db.permissionOverrides ?? []).filter((o) => !(o.staffKey === staffKey && o.permissionKey === permissionKey));
        demoSave();
        await getDataSource(true).audit.log('permission_override.cleared', 'warning', `permission "${permissionKey}" override for ${staffKey} cleared`, { staffKey, permissionKey }, 'staff_permission_override', staffKey);
      },
    },
    allocationRequests: {
      async list(viewerKey, viewerRole) {
        const db = demoLoad();
        const canSeeAll = viewerRole === 'manager' || ['elias', 'emmanuel'].includes(viewerKey);
        return db.allocationRequests.filter((r) => canSeeAll || r.agentKey === viewerKey);
      },
      async create(agentKey, agentName, input) {
        const db = demoLoad();
        const lead = db.leads.find((l) => l.id === input.leadId && l.agent === agentKey);
        if (!lead) throw new Error("Pick one of your own leads");
        const request: AllocationRequest = {
          id: Math.random().toString(36).slice(2, 10),
          leadId: lead.id,
          clientName: lead.name,
          agentKey,
          agentName,
          percentPaid: lead.grandTotal > 0 ? Math.round((lead.amtPaid / lead.grandTotal) * 1000) / 10 : null,
          grandTotal: lead.grandTotal,
          amtPaid: lead.amtPaid,
          status: 'Pending',
          plotNumber: null,
          suggestedPlots: null,
          note: null,
          allocatedBy: null,
          flagReason: null,
          flaggedBy: null,
          flaggedAt: null,
          history: [{ type: 'requested', at: new Date().toISOString(), by: agentName }],
          createdAt: new Date().toISOString(),
          resolvedAt: null,
        };
        db.allocationRequests.push(request);
        demoSave();
        return request;
      },
      async suggest(id, plotNumbers) {
        const db = demoLoad();
        for (const pn of plotNumbers) {
          const p = db.plots.find((x) => x.plotNumber.toLowerCase() === pn.toLowerCase());
          if (p && p.status === 'Allocated') throw new Error(`Plot ${pn} has already been allocated${p.clientName ? ` to ${p.clientName}` : ''}`);
          if (p && p.status === 'Subdivided') throw new Error(`Plot ${pn} has been split into halves -- pick ${pn}a or ${pn}b instead`);
        }
        const index = db.allocationRequests.findIndex((r) => r.id === id);
        if (index === -1) throw new Error('Allocation request not found');
        const updated: AllocationRequest = { ...db.allocationRequests[index], status: 'Awaiting Authorization', suggestedPlots: plotNumbers.join(',') };
        db.allocationRequests = [...db.allocationRequests.slice(0, index), updated, ...db.allocationRequests.slice(index + 1)];
        demoSave();
        return updated;
      },
      async confirm(id, plotNumber, note, confirmedBy) {
        const db = demoLoad();
        const index = db.allocationRequests.findIndex((r) => r.id === id);
        if (index === -1) throw new Error('Allocation request not found');
        const alloc = db.allocationRequests[index];
        if (alloc.status !== 'Awaiting Authorization') throw new Error(`Allocation is not awaiting authorization (current status: ${alloc.status})`);
        const plotNumbers = plotNumber
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        for (const pn of plotNumbers) {
          const p = db.plots.find((x) => x.plotNumber.toLowerCase() === pn.toLowerCase());
          if (p && p.status === 'Allocated') throw new Error(`Plot ${pn} has already been allocated${p.clientName ? ` to ${p.clientName}` : ''}`);
          if (p && p.status === 'Subdivided') throw new Error(`Plot ${pn} has been split into halves -- pick ${pn}a or ${pn}b instead`);
        }
        const now = new Date().toISOString();
        const event: AllocationHistoryEvent = { type: 'allocated', plotNumber, note: note ?? null, by: confirmedBy, at: now };
        const updated: AllocationRequest = { ...alloc, status: 'Allocated', plotNumber, note: note ?? null, allocatedBy: confirmedBy, resolvedAt: now, history: [...alloc.history, event] };
        db.allocationRequests = [...db.allocationRequests.slice(0, index), updated, ...db.allocationRequests.slice(index + 1)];
        db.plots = db.plots.map((p) => (plotNumbers.some((pn) => pn.toLowerCase() === p.plotNumber.toLowerCase()) ? { ...p, status: 'Allocated' as const, clientName: alloc.clientName, agentKey: alloc.agentKey } : p));
        for (const pn of plotNumbers) {
          if (!db.plots.some((p) => p.plotNumber.toLowerCase() === pn.toLowerCase())) {
            db.plots = [{ id: crypto.randomUUID(), site: db.plots[0]?.site ?? 'Royal Palm Enclave, Tsopoli', plotNumber: pn, plotType: 'Full Plot', status: 'Allocated', price: null, clientName: alloc.clientName, clientContact: null, agentKey: alloc.agentKey, notes: 'Allocated via signed authorization', unitKind: 'whole', parentPlotId: null, section: null, widthFt: null, lengthFt: null, areaSqft: null }, ...db.plots];
          }
        }
        demoSave();
        return updated;
      },
      async revert(id) {
        const db = demoLoad();
        const index = db.allocationRequests.findIndex((r) => r.id === id);
        if (index === -1) throw new Error('Allocation request not found');
        const alloc = db.allocationRequests[index];
        if (alloc.status !== 'Allocated') throw new Error(`Allocation is not in Allocated status (current status: ${alloc.status})`);
        const plotNumbers = (alloc.plotNumber ?? '').split(',').map((s) => s.trim()).filter(Boolean);
        db.plots = db.plots.map((p) => (plotNumbers.some((pn) => pn.toLowerCase() === p.plotNumber.toLowerCase()) && p.status === 'Allocated' ? { ...p, status: 'Available' as const, clientName: null, clientContact: null, agentKey: null } : p));
        const event: AllocationHistoryEvent = { type: 'reverted', plotNumber: alloc.plotNumber, by: alloc.allocatedBy ?? '', at: new Date().toISOString() };
        const updated: AllocationRequest = { ...alloc, status: 'Pending', plotNumber: null, note: null, allocatedBy: null, resolvedAt: null, history: [...alloc.history, event] };
        db.allocationRequests = [...db.allocationRequests.slice(0, index), updated, ...db.allocationRequests.slice(index + 1)];
        demoSave();
        return updated;
      },
      async editPlot(id, newPlotNumber) {
        const db = demoLoad();
        const index = db.allocationRequests.findIndex((r) => r.id === id);
        if (index === -1) throw new Error('Allocation request not found');
        const alloc = db.allocationRequests[index];
        if (alloc.status !== 'Allocated') throw new Error(`Allocation is not in Allocated status (current status: ${alloc.status})`);
        if (newPlotNumber.trim().toLowerCase() === (alloc.plotNumber ?? '').toLowerCase()) throw new Error('That is already the allocated plot');
        const conflict = db.plots.find((p) => p.plotNumber.toLowerCase() === newPlotNumber.toLowerCase());
        if (conflict && conflict.status === 'Allocated') throw new Error(`Plot ${newPlotNumber} is already allocated${conflict.clientName ? ` to ${conflict.clientName}` : ''}`);
        const oldNumbers = (alloc.plotNumber ?? '').split(',').map((s) => s.trim()).filter(Boolean);
        db.plots = db.plots.map((p) => (oldNumbers.some((pn) => pn.toLowerCase() === p.plotNumber.toLowerCase()) && p.status === 'Allocated' ? { ...p, status: 'Available' as const, clientName: null, clientContact: null, agentKey: null } : p));
        if (conflict) {
          db.plots = db.plots.map((p) => (p.id === conflict.id ? { ...p, status: 'Allocated' as const, clientName: alloc.clientName, agentKey: alloc.agentKey } : p));
        } else {
          db.plots = [{ id: crypto.randomUUID(), site: db.plots[0]?.site ?? 'Royal Palm Enclave, Tsopoli', plotNumber: newPlotNumber.trim(), plotType: 'Full Plot', status: 'Allocated', price: null, clientName: alloc.clientName, clientContact: null, agentKey: alloc.agentKey, notes: `Reassigned from Plot ${alloc.plotNumber ?? '—'}`, unitKind: 'whole', parentPlotId: null, section: null, widthFt: null, lengthFt: null, areaSqft: null }, ...db.plots];
        }
        const event: AllocationHistoryEvent = { type: 'reassigned', fromPlot: alloc.plotNumber, toPlot: newPlotNumber.trim(), by: alloc.allocatedBy ?? '', at: new Date().toISOString() };
        const updated: AllocationRequest = { ...alloc, plotNumber: newPlotNumber.trim(), history: [...alloc.history, event] };
        db.allocationRequests = [...db.allocationRequests.slice(0, index), updated, ...db.allocationRequests.slice(index + 1)];
        demoSave();
        return updated;
      },
      async remove(id) {
        const db = demoLoad();
        const alloc = db.allocationRequests.find((r) => r.id === id);
        if (!alloc) throw new Error('Allocation request not found');
        const plotNumbers = (alloc.plotNumber ?? '').split(',').map((s) => s.trim()).filter(Boolean);
        db.plots = db.plots.map((p) => (plotNumbers.some((pn) => pn.toLowerCase() === p.plotNumber.toLowerCase()) && p.status === 'Allocated' ? { ...p, status: 'Available' as const, clientName: null, clientContact: null, agentKey: null } : p));
        db.allocationRequests = db.allocationRequests.filter((r) => r.id !== id);
        demoSave();
      },
      async flag(id, reason, flaggedBy) {
        const db = demoLoad();
        const index = db.allocationRequests.findIndex((r) => r.id === id);
        if (index === -1) throw new Error('Allocation request not found');
        const updated: AllocationRequest = { ...db.allocationRequests[index], flagReason: reason, flaggedBy, flaggedAt: new Date().toISOString() };
        db.allocationRequests = [...db.allocationRequests.slice(0, index), updated, ...db.allocationRequests.slice(index + 1)];
        demoSave();
        return updated;
      },
      async resolveFlag(id) {
        const db = demoLoad();
        const index = db.allocationRequests.findIndex((r) => r.id === id);
        if (index === -1) throw new Error('Allocation request not found');
        const updated: AllocationRequest = { ...db.allocationRequests[index], flagReason: null, flaggedBy: null, flaggedAt: null };
        db.allocationRequests = [...db.allocationRequests.slice(0, index), updated, ...db.allocationRequests.slice(index + 1)];
        demoSave();
        return updated;
      },
    },
    notes: {
      async listForOwner(ownerKey) {
        return demoLoad()
          .notes.filter((n) => n.ownerKey === ownerKey)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      },
      async create(ownerKey, input) {
        const now = new Date().toISOString();
        const note: Note = { id: Math.random().toString(36).slice(2, 10), ownerKey, title: input.title, body: input.body, createdAt: now, updatedAt: now };
        const db = demoLoad();
        db.notes.push(note);
        demoSave();
        return note;
      },
      async update(id, input) {
        const db = demoLoad();
        const index = db.notes.findIndex((n) => n.id === id);
        if (index === -1) throw new Error('Note not found');
        const updated: Note = { ...db.notes[index], title: input.title, body: input.body, updatedAt: new Date().toISOString() };
        db.notes = [...db.notes.slice(0, index), updated, ...db.notes.slice(index + 1)];
        demoSave();
        return updated;
      },
      async remove(id) {
        const db = demoLoad();
        db.notes = db.notes.filter((n) => n.id !== id);
        demoSave();
      },
    },
    attendance: {
      async today(staffKey) {
        const workDate = new Date().toISOString().slice(0, 10);
        return demoLoad().attendance.find((a) => a.staffKey === staffKey && a.workDate === workDate) ?? null;
      },
      async history(staffKey, days) {
        const from = new Date();
        from.setDate(from.getDate() - days);
        const fromIso = from.toISOString().slice(0, 10);
        return demoLoad()
          .attendance.filter((a) => a.staffKey === staffKey && a.workDate >= fromIso)
          .sort((a, b) => (a.workDate < b.workDate ? 1 : -1));
      },
      async signIn(staffKey, staffName, input) {
        const workDate = new Date().toISOString().slice(0, 10);
        const db = demoLoad();
        if (db.attendance.some((a) => a.staffKey === staffKey && a.workDate === workDate)) {
          throw new Error("You've already signed in today");
        }
        const record: AttendanceRecord = {
          id: Math.random().toString(36).slice(2, 10),
          staffKey,
          staffName,
          workDate,
          signInAt: new Date().toISOString(),
          signInLat: input.lat ?? null,
          signInLng: input.lng ?? null,
          signOutAt: null,
          signOutLat: null,
          signOutLng: null,
          notes: null,
          createdAt: new Date().toISOString(),
          lateReason: input.late ? (input.lateReason ?? null) : null,
          signInReason: input.offSite ? (input.reason ?? null) : null,
          signOutReason: null,
          isOffSiteIn: input.offSite ?? false,
          isOffSiteOut: null,
          signInPhoto: input.photo ?? null,
        };
        db.attendance.push(record);
        demoSave();
        return record;
      },
      async signOut(staffKey, id, input) {
        const db = demoLoad();
        const record = db.attendance.find((a) => a.id === id && a.staffKey === staffKey);
        if (!record) throw new Error('Sign in first before signing out');
        if (record.signOutAt) throw new Error("You've already signed out today");
        record.signOutAt = new Date().toISOString();
        record.signOutLat = input.lat ?? null;
        record.signOutLng = input.lng ?? null;
        record.isOffSiteOut = input.offSite ?? false;
        record.signOutReason = input.offSite ? (input.reason ?? null) : null;
        demoSave();
        return record;
      },
    },
    staff: {
      async list() {
        const db = demoLoad();
        return DEMO_STAFF.map((s) => applyStaffOverrides(s, db)).filter((s) => s.active);
      },
      async listAll() {
        const db = demoLoad();
        return DEMO_STAFF.map((s) => applyStaffOverrides(s, db));
      },
      async setActive(key, active) {
        const db = demoLoad();
        db.staffActiveOverrides = { ...db.staffActiveOverrides, [key]: active };
        demoSave();
        const staff = DEMO_STAFF.find((s) => s.key === key);
        if (!staff) throw new Error('Staff not found');
        return applyStaffOverrides({ ...staff, active }, db);
      },
      async updateSignature(key, dataUrl) {
        const db = demoLoad();
        db.staffSignatures = { ...db.staffSignatures, [key]: dataUrl };
        demoSave();
        const staff = DEMO_STAFF.find((s) => s.key === key);
        if (!staff) throw new Error('Staff not found');
        return applyStaffOverrides(staff, db);
      },
    },
    staffInvites: {
      async list() {
        return demoLoad().invites ?? [];
      },
      async create(email, name, invitedBy) {
        const db = demoLoad();
        db.invites = [{ email, name, invitedBy, createdAt: new Date().toISOString() }, ...(db.invites ?? []).filter((i) => i.email.toLowerCase() !== email.toLowerCase())];
        demoSave();
      },
      async remove(email) {
        const db = demoLoad();
        db.invites = (db.invites ?? []).filter((i) => i.email.toLowerCase() !== email.toLowerCase());
        demoSave();
      },
    },
    memos: {
      async sent(myKey) {
        return demoLoad().memos.filter((m) => m.fromKey === myKey);
      },
      async drafts(myKey) {
        return demoLoad().memos.filter((m) => m.fromKey === myKey && m.status === 'draft');
      },
      async received(myKey) {
        const db = demoLoad();
        const direct: ReceivedMemo[] = db.memos.filter((m) => m.toKey === myKey && m.status !== 'draft').map((memo) => ({ memo, viaCC: false, recipientRowId: null }));
        const viaCc: ReceivedMemo[] = db.memoRecipients
          .filter((r) => r.staffKey === myKey)
          .map((r): ReceivedMemo | null => {
            const memo = db.memos.find((m) => m.id === r.memoId);
            return memo ? { memo, viaCC: true, recipientRowId: r.id } : null;
          })
          .filter((x): x is ReceivedMemo => x !== null);
        return [...direct, ...viaCc].sort((a, b) => (a.memo.createdAt < b.memo.createdAt ? 1 : -1));
      },
      async create(fromKey, fromName, input) {
        const db = demoLoad();
        const memo: Memo = {
          id: Math.random().toString(36).slice(2, 10),
          fromKey,
          fromName,
          toKey: input.toKey,
          toName: input.toName,
          subject: input.subject,
          bodyHtml: input.bodyHtml,
          parentId: null,
          kind: 'memo',
          createdAt: new Date().toISOString(),
          read: false,
          status: input.status,
        };
        db.memos.push(memo);
        for (const cc of input.cc ?? []) {
          db.memoRecipients.push({
            id: Math.random().toString(36).slice(2, 10),
            memoId: memo.id,
            staffKey: cc.key,
            staffName: cc.name,
            read: false,
            createdAt: new Date().toISOString(),
          });
        }
        demoSave();
        return memo;
      },
      async send(id) {
        const db = demoLoad();
        const memo = db.memos.find((m) => m.id === id);
        if (!memo) throw new Error('Memo not found');
        memo.status = 'sent';
        demoSave();
        return memo;
      },
      async markRead(item) {
        const db = demoLoad();
        if (item.viaCC && item.recipientRowId) {
          const r = db.memoRecipients.find((x) => x.id === item.recipientRowId);
          if (r) r.read = true;
        } else {
          const m = db.memos.find((x) => x.id === item.memo.id);
          if (m) m.read = true;
        }
        demoSave();
      },
      async remove(id) {
        const db = demoLoad();
        db.memos = db.memos.filter((m) => m.id !== id);
        db.memoRecipients = db.memoRecipients.filter((r) => r.memoId !== id);
        demoSave();
      },
    },
    manager: {
      async overview() {
        const db = demoLoad();
        const leads = db.leads;
        const pipelineValue = leads.reduce((s, l) => s + l.grandTotal, 0);
        const collected = leads.reduce((s, l) => s + l.amtPaid, 0);
        const stageFunnel = STAGES.map((stage) => ({ stage, count: leads.filter((l) => l.stage === stage).length }));

        const byAgentMap = new Map<string, { key: string; name: string; leadCount: number; value: number }>();
        for (const l of leads) {
          const match = DEMO_STAFF.find((s) => s.key === l.agent);
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
          openComplaints: db.complaints.filter((c) => c.status !== 'Resolved').length,
          siteVisitsCount: db.siteVisits.length,
          stageFunnel,
          byAgent: [...byAgentMap.values()].sort((a, b) => b.value - a.value),
          // approved-only, matching the live query's .eq('status','approved')
          // -- see that call site's comment for why.
          collectedTrend: computeMonthlyTrend(db.payments.filter((p) => (p.status ?? 'approved') === 'approved')),
        };
      },
      // No dedicated demo RPC to call -- this mirrors leaderboard_rows()'s
      // own aggregation (agents-only roster, 90-day windows for tasks/
      // todos/attendance, date-ranged deals-closed) against the demo
      // store's existing multi-agent leads/siteVisits/scheduleItems/
      // attendance data, the same fixture set Manager Home's overview
      // already aggregates. avgTaskDays stays null -- the demo ScheduleItem
      // shape has no completed-at timestamp to compute a duration from.
      async leaderboardRows(fromDate, toDate) {
        const db = demoLoad();
        const windowStart = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
        return DEMO_STAFF.filter((s) => s.role === 'agent').map((s) => {
          const agentLeads = db.leads.filter((l) => l.agent === s.key);
          const attendanceWindow = db.attendance.filter((a) => a.staffKey === s.key && a.workDate >= windowStart);
          return {
            staffKey: s.key,
            staffName: s.name,
            totalCollected: agentLeads.reduce((sum, l) => sum + l.amtPaid, 0),
            dealsClosedYear: agentLeads.filter((l) => l.grandTotal > 0 && l.amtPaid >= l.grandTotal && l.date >= fromDate && l.date <= toDate).length,
            siteVisits: db.siteVisits.filter((v) => v.agentKey === s.key).length,
            tasksCompleted: db.scheduleItems.filter((t) => t.kind === 'task' && t.status === 'closed' && t.assignedTo === s.key && t.date >= windowStart).length,
            avgTaskDays: null,
            todosCompleted: db.scheduleItems.filter((t) => t.kind === 'todo' && t.status === 'closed' && t.ownerKey === s.key && t.date >= windowStart).length,
            daysAttended: attendanceWindow.filter((a) => a.signInAt).length,
            onTimeDays: attendanceWindow.filter((a) => a.signInAt && a.signInAt.slice(11, 16) <= '09:00').length,
          };
        });
      },
      async commissionData() {
        const db = demoLoad();
        return {
          payments: db.payments,
          leads: db.leads,
          staff: DEMO_STAFF.filter((s) => s.role === 'agent').map((s) => ({ key: s.key, name: s.name })),
        };
      },
      async referralConversions(fromDate, toDate) {
        // Same real rule as the live RPC (staff_referral_conversions,
        // verified live): status='Cleared', clearedAt in range, grouped
        // by the REFERRER lead's own agent -- not the referral row's
        // createdByKey.
        const db = demoLoad();
        const counts = new Map<string, number>();
        db.referrals
          .filter((r) => r.status === 'Cleared' && r.clearedAt && r.clearedAt.slice(0, 10) >= fromDate && r.clearedAt.slice(0, 10) <= toDate)
          .forEach((r) => {
            const referrerLead = db.leads.find((l) => l.id === r.referrerLeadId);
            if (!referrerLead) return;
            counts.set(referrerLead.agent, (counts.get(referrerLead.agent) ?? 0) + 1);
          });
        return [...counts.entries()].map(([staffKey, referralConversions]) => ({ staffKey, referralConversions }));
      },
    },
    sve: {
      async listVisitsWithStatus() {
        const db = demoLoad();
        return db.siteVisits.map((siteVisit) => {
          const invite = db.sveInvites.find((i) => i.siteVisitId === siteVisit.id) ?? null;
          const submission = invite ? (db.sveSubmissions.find((s) => s.inviteId === invite.id) ?? null) : null;
          return { siteVisit, invite, submission };
        });
      },
      async createInvite(siteVisitId, clientName, clientContact, sentBy) {
        const db = demoLoad();
        const invite: SveInviteRecord = {
          id: Math.random().toString(36).slice(2, 10),
          siteVisitId,
          token: Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10),
          clientName,
          clientContact,
          sentAt: new Date().toISOString(),
          sentVia: 'link',
          sentBy,
          submittedAt: null,
          createdAt: new Date().toISOString(),
        };
        db.sveInvites.push(invite);
        demoSave();
        return invite;
      },
    },
    chat: {
      async listConversations(myKey) {
        const db = demoLoad();
        const mine = db.chatMessages.filter((m) => !m.kind && (m.senderKey === myKey || m.recipientKey === myKey));
        const byOther = new Map<string, ChatMessage[]>();
        for (const m of mine) {
          const other = m.senderKey === myKey ? (m.recipientKey ?? '') : m.senderKey;
          if (!other) continue;
          const arr = byOther.get(other) ?? [];
          arr.push(m);
          byOther.set(other, arr);
        }
        return [...byOther.entries()]
          .map(([otherKey, msgs]) => {
            const sorted = [...msgs].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
            const staffMatch = DEMO_STAFF.find((s) => s.key === otherKey);
            const fromTheirOwnMessage = msgs.find((m) => m.senderKey === otherKey)?.senderName;
            return {
              otherKey,
              otherName: staffMatch?.name ?? fromTheirOwnMessage ?? otherKey,
              lastMessage: sorted[0] ?? null,
              unreadCount: msgs.filter((m) => m.recipientKey === myKey && !m.read).length,
            };
          })
          .sort((a, b) => ((a.lastMessage?.createdAt ?? '') < (b.lastMessage?.createdAt ?? '') ? 1 : -1));
      },
      async listThread(myKey, otherKey) {
        return demoLoad()
          .chatMessages.filter((m) => !m.kind && ((m.senderKey === myKey && m.recipientKey === otherKey) || (m.senderKey === otherKey && m.recipientKey === myKey)))
          .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
      },
      async send(myKey, myName, otherKey, body, replyToId) {
        const db = demoLoad();
        const message: ChatMessage = {
          id: Math.random().toString(36).slice(2, 10),
          senderKey: myKey,
          senderName: myName,
          recipientKey: otherKey,
          body,
          createdAt: new Date().toISOString(),
          read: false,
          attachmentData: null,
          attachmentType: null,
          attachmentName: null,
          kind: null,
          refType: null,
          refId: null,
          replyToId: replyToId ?? null,
        };
        db.chatMessages.push(message);
        demoSave();
        return message;
      },
      async markThreadRead(myKey, otherKey) {
        const db = demoLoad();
        for (const m of db.chatMessages) {
          if (m.recipientKey === myKey && m.senderKey === otherKey && !m.read) m.read = true;
        }
        demoSave();
      },
    },
  };
}

// Real Supabase queries, verified against the actual production schema
// (columns, types, and RLS policies all confirmed live via the Supabase
// MCP tools -- not guessed). Points at whichever project client.ts is
// configured for, which during this build phase is deliberately the
// STAGING project, never production.
//
// Payment recording is fully wired (payments.create/approve/decline
// below) -- an earlier phase left this unwired under the assumption that
// any agent could self-log a payment as 'pending' for review. That
// assumption was wrong: confirmed live via payments_ins RLS that only
// manager or the 'elias' key can insert a payment at all, and reading
// index.html's real logNewPayment()/applyApprovedPaymentToLead()
// functions directly (not guessed) to match the exact real behavior --
// see the Payment/NewPaymentEntry types' comments in types/domain.ts.
function createLiveDataSource(): DataSource {
  function requireClient() {
    const client = getSupabaseClient();
    if (!client) throw new Error('Supabase is not configured -- set VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY (see .env.local.example).');
    return client;
  }

  return {
    leads: {
      async listForAgent(agentKey) {
        const { data, error } = await requireClient().from('leads').select('*').eq('agent_key', agentKey);
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
        const grandTotal = computeGrandTotal(input.unitPrice, input.noPlots);
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
          })
          .select()
          .single();
        if (error) throw error;
        return mapLeadRow(data);
      },
      async get(agentKey, id) {
        const { data, error } = await requireClient().from('leads').select('*').eq('agent_key', agentKey).eq('id', id).maybeSingle();
        if (error) throw error;
        return data ? mapLeadRow(data) : undefined;
      },
      async listAll() {
        const { data, error } = await requireClient().from('leads').select('*').order('name');
        if (error) throw error;
        return (data ?? []).map(mapLeadRow);
      },
      async listCompany() {
        const { data, error } = await requireClient().from('leads').select('*').eq('agent_key', 'company').order('date_added', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(mapLeadRow);
      },
      async assign(id, agentKey) {
        const { data, error } = await requireClient().from('leads').update({ agent_key: agentKey }).eq('id', id).select().single();
        if (error) throw error;
        return mapLeadRow(data);
      },
      async setSource(id, source) {
        const { data, error } = await requireClient().from('leads').update({ lead_source: source }).eq('id', id).select().single();
        if (error) throw error;
        return mapLeadRow(data);
      },
      async update(id, patch) {
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
        if ('notes' in patch) dbPatch.notes = patch.notes;
        if ('tags' in patch) dbPatch.tags = patch.tags;
        if ('siteVisit' in patch) dbPatch.site_visit = patch.siteVisit;
        if ('depositTarget' in patch) dbPatch.deposit_target = patch.depositTarget;
        if ('priority' in patch) dbPatch.priority = patch.priority;
        if ('leadSource' in patch) dbPatch.lead_source = patch.leadSource;
        if ('amtPaid' in patch && 'grandTotal' in patch) dbPatch.balance = Math.max((patch.grandTotal ?? 0) - (patch.amtPaid ?? 0), 0);
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
      async remove(id) {
        // Soft delete, not a hard DELETE -- matches legacy's real
        // apiDeleteLead() (index.html:4622-4629). A real ON DELETE CASCADE
        // on allocation_requests/target_selections/payment_reminders_log/
        // client_notifications would destroy their history, and payments
        // would be orphaned via ON DELETE SET NULL -- all confirmed live.
        // leads_sel/leads_client_sel RLS already filters deleted_at IS
        // NULL, so this needs no client-side filtering anywhere else.
        const { error } = await requireClient().from('leads').update({ deleted_at: new Date().toISOString() }).eq('id', id);
        if (error) throw error;
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
        return { decidedBy: data.decided_by, decidedByName: data.decided_by_name, newAmtPaid: Number(data.new_amt_paid), newBalance: Number(data.new_balance) };
      },
      async decline(paymentId, _decidedBy, _decidedByName, reason) {
        const { error } = await requireClient().rpc('decline_payment', { p_payment_id: paymentId, p_reason: reason ?? null });
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
      async create(agentKey, date, title, assignedTo) {
        const { data, error } = await requireClient()
          .from('schedule_items')
          .insert({ kind: 'todo', owner_key: agentKey, assigned_to: assignedTo ?? agentKey, item_date: date, title, status: 'open' })
          .select()
          .single();
        if (error) throw error;
        return mapScheduleItemRow(data);
      },
      async updateStatus(id, status) {
        const { data, error } = await requireClient()
          .from('schedule_items')
          .update({ status: domainStatusToDb(status) })
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
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
        const { data, error } = await requireClient()
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
            category: input.category ?? null,
            priority: input.priority ?? null,
            due_date: input.dueDate ?? null,
            status: 'open',
          })
          .select()
          .single();
        if (error) throw error;
        return mapScheduleItemRow(data);
      },
      async reassignTask(id, toKey, toName, byKey, byName) {
        const { data, error } = await requireClient()
          .from('schedule_items')
          .update({ assigned_to: toKey, assigned_to_name: toName, assigned_by: byKey, assigned_by_name: byName })
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        return mapScheduleItemRow(data);
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
          .insert({ site: input.site, plot_number: input.plotNumber, plot_type: input.plotType, status: input.status, price: input.price ?? null, client_name: input.clientName ?? null, client_contact: input.clientContact ?? null, agent_key: input.agentKey ?? null, notes: input.notes ?? null, section: input.section ?? null, width_ft: input.widthFt ?? null, length_ft: input.lengthFt ?? null })
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
              }
            : null;
        return { alreadySplit: r.alreadySplit, plotA: norm(r.plotA), plotB: norm(r.plotB) };
      },
    },
    siteVisits: {
      async listForAgent(agentKey) {
        const { data, error } = await requireClient().from('site_visits').select('*').eq('agent_key', agentKey).order('visit_date', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(mapSiteVisitRow);
      },
      async listAll() {
        const { data, error } = await requireClient().from('site_visits').select('*').order('visit_date', { ascending: false });
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
            source: input.source ?? null,
            accompanied: input.accompanied ?? null,
            notes: input.notes ?? null,
          })
          .select()
          .single();
        if (error) throw error;
        return mapSiteVisitRow(data);
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
      async listForAgent(agentKey) {
        const { data, error } = await requireClient().from('enquiries').select('*').eq('agent_key', agentKey).order('created_at', { ascending: false });
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
    },
    complaints: {
      async listForAgent(agentKey) {
        const { data, error } = await requireClient().from('complaints').select('*').eq('agent_key', agentKey).order('created_at', { ascending: false });
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
            status: 'pending',
            is_emergency: false,
            deduct_quota: true,
          })
          .select()
          .single();
        if (error) throw error;
        return mapLeaveRequestRow(data);
      },
      async decide(id, approve, decidedBy, decidedByName, decidedSignature) {
        const { data, error } = await requireClient()
          .from('leave_requests')
          .update({ status: approve ? 'approved' : 'declined', decided_at: new Date().toISOString(), decided_by: decidedBy, decided_by_name: decidedByName, decided_signature: approve ? decidedSignature : null })
          .eq('id', id)
          .select()
          .single();
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
    async leadBannerCounts() {
      const { data, error } = await requireClient().from('leads').select('banner_id').not('banner_id', 'is', null);
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
          })
          .eq('id', id)
          .eq('staff_key', staffKey)
          .select()
          .single();
        if (error) throw error;
        return mapAttendanceRow(data);
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
  };
}
