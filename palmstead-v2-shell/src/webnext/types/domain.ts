// App-level domain types -- deliberately only the fields Phase 1's Home/
// StreakCard slice actually touches. Widened as later phases port more of
// index.html's DB shape (leads/payments/schedule_items/etc.).

export type Role = 'agent' | 'manager';

export interface Profile {
  key: string;
  name: string;
  role: Role;
  email?: string;
  // Real column `active` (confirmed live, all 7 real staff currently
  // true) -- deactivating blocks sign-in but keeps historical leads/
  // stats intact everywhere (index.html's own comment on this exact
  // toggle). Defaults true since older mapped call sites never needed it.
  active: boolean;
  // Real column `signature_data` (confirmed live, text) -- a small PNG
  // data URI, uploaded once in Settings, used to auto-stamp the signed-in
  // staff member's own signature onto documents they generate/approve
  // (index.html's getStaffSignature()/pdfStampSignature()). Optional/null
  // since most staff never upload one.
  signatureData?: string | null;
  // Real column `phone` (confirmed live) -- used to send a staff member
  // an SMS (task assigned/escalated, leave decided) via phoneForStaffKey's
  // real equivalent (index.html), not shown anywhere in the UI itself.
  // Optional/undefined on call sites that never selected it.
  phone?: string;
}

// Real table `allowed_emails` (confirmed live) -- a manager-only invite
// list. Fixed 2026-09-04: `handle_new_auth_user()` now actually checks
// this table before creating a profile for a new sign-up (previously it
// didn't -- any email could self-register a real agent account). A
// consumed invite is deleted by that same trigger, not left to linger.
export interface StaffInvite {
  email: string;
  name: string;
  invitedBy: string | null;
  createdAt: string;
}

export type PlotType = 'Full Plot' | 'Half Plot';
export type PaymentPlan = 'Full Payment' | '3 Months' | '6 Months' | '9 Months' | '12 Months';
// Internal stage codes -- displayed to staff via the flipped
// DISPLAY_STAGE_CODE mapping (index.html:17138), never shown raw.
export type Stage = '1' | '2A' | '2B' | '3' | '4' | 'Lost';

export interface Lead {
  id: string;
  agent: string;
  name: string;
  contact: string;
  date: string;
  plotType: PlotType;
  noPlots: number;
  unitPrice: number;
  paymentPlan: PaymentPlan;
  amtPaid: number;
  grandTotal: number;
  stage: Stage;
  notes?: string;
  // Real columns `lead_source`/`banner_id` (confirmed live) -- optional
  // since only Company Leads currently sets them; every other lead has
  // both null. bannerId stays a dormant pass-through here (Banner
  // Tracking, the feature that gives it meaning, isn't built in web-next
  // yet), same treatment Complaints gave its unused source/sentiment.
  leadSource?: string | null;
  bannerId?: string | null;
  // Real column `assigned_agent_key` (added 2026-09-11, this shell only --
  // NOT a web-next real column). Staff handling a Company Lead without
  // owning it: agent_key stays 'company' (still in Company Leads, never
  // enters that staff's personal pipeline), this field just says who it
  // was handed to. Distinct from the real "Assign to agent" action, which
  // changes agent_key itself and is a genuine ownership transfer.
  assignedAgentKey?: string | null;
  // Real columns address/discount/net_total/deposit_target/kyc (all
  // confirmed live) -- manager-settable overrides on top of the standard
  // pricing (see computeLeadQuotationTotals in features/contracts/lib/
  // contractPdf.ts) plus the KYC bundle the Contract of Sale PDF's page 3
  // (KNOW YOUR CUSTOMER) is built from. Every real row currently has kyc
  // as either null or an object with every field present but blank --
  // optional here so a lead with no KYC captured yet renders blank fields
  // rather than crashing.
  address?: string | null;
  discount?: number | null;
  netTotal?: number | null;
  depositTarget?: number | null;
  kyc?: LeadKyc | null;
  nextAction?: string | null;
  // Real column next_action_date (added 2026-09-06, Master Spec Section
  // 4.6: "Next-action date overdue -> red overdue state and optional
  // task"). Optional -- a staff member can type a next step without a
  // date, but only a dated one can ever be "overdue".
  nextActionDate?: string | null;
  // Real column `priority` (confirmed live, text -- 'High'/'Medium'/'Low'
  // in practice, no enum constraint) -- was a real, unmapped column this
  // whole build; only surfaced when Smart Insights needed it for its
  // "high priority, no follow-up planned" nudge.
  priority?: string | null;
  tags?: string | null;
  siteVisit?: string | null;
  docStage?: string | null;
  docStageUpdatedAt?: string | null;
  // Real columns `version`/`last_modified_at`/`last_modified_by` (confirmed
  // live on production; staging was missing them plus the trigger that
  // populates them until this pass -- ported both, see Data Check's
  // comment). Auto-maintained server-side by `leads_track_modification`,
  // a BEFORE UPDATE trigger -- never set directly from the client.
  lastModifiedAt?: string | null;
  // Real column `version` (same trigger as lastModifiedAt above -- both
  // bumped/stamped together, never client-writable). Read-only signal a
  // caller can round-trip back as LeadUpdate.expectedVersion to get a real
  // optimistic-concurrency guard instead of last-write-wins.
  version?: number | null;
  // Real column `deleted_at` (ported to staging 2026-09-03 -- see
  // PHASE0_INVENTORY.md; live on production, matches legacy's real
  // apiDeleteLead()). Never a hard DELETE -- a real ON DELETE CASCADE on
  // allocation_requests/target_selections/payment_reminders_log/
  // client_notifications would destroy their history, and payments would
  // be orphaned via ON DELETE SET NULL. leads_sel/leads_client_sel RLS
  // (confirmed live) already filters deleted_at IS NULL, so a soft-deleted
  // lead never round-trips through listForAgent()/listAll()/get() at all
  // -- present on the type only so a caller could show "deleted" state if
  // some future screen ever fetched by raw id bypassing that filter.
  deletedAt?: string | null;
  // Real columns deleted_by/deleted_by_name/deletion_reason (added
  // 2026-09-06, Master Spec Section 4.5) -- who archived this lead, and
  // the reason they gave. Left in place across a restore (not cleared),
  // so an un-archived lead still shows its most recent deletion history.
  deletedBy?: string | null;
  deletedByName?: string | null;
  deletionReason?: string | null;
}

// Every field the Pipeline Update accordion's "Save update" can change in
// one request, mirroring index.html's saveUpdate()/apiUpdateLead() patch
// shape exactly (index.html:3552-3591) -- a plain leads_upd RLS UPDATE, not
// an RPC (confirmed live: no WITH CHECK restricts these columns for the
// owning agent/manager/elias).
export interface LeadUpdate {
  name?: string;
  contact?: string;
  plotType?: PlotType;
  noPlots?: number;
  unitPrice?: number;
  discount?: number;
  netTotal?: number;
  grandTotal?: number;
  paymentPlan?: PaymentPlan;
  amtPaid?: number;
  stage?: Stage;
  nextAction?: string;
  nextActionDate?: string | null;
  notes?: string;
  tags?: string;
  siteVisit?: string;
  depositTarget?: number;
  // Added for the pipeline Excel import (index.html's importPipelineExcel()
  // writes this on every reconciled row) -- not previously part of any
  // web-next write path since no screen exposed it as editable before now.
  priority?: string;
  // Added for the pipeline Excel import's canonical LEADS sheet ("Source"
  // column, spec 5.1) -- same reasoning as priority above.
  leadSource?: string;
  // Real column `banner_id` -- previously only ever set at lead creation
  // (AddLeadScreen); an existing lead's Source could be changed to
  // "Banner" but had no way to actually peg it to a real banner row, so
  // it never counted toward that banner's totals in Banner Tracking.
  bannerId?: string | null;
  // Real column `address` (confirmed live) had NO write path anywhere in
  // the app before this -- 4 separate PDF generators (Quotation, Technical
  // Quotation, Receipt, Contract of Sale) read it and always got blank.
  address?: string;
  // CONTRACT_OF_SALE_BLUEPRINT.md §6.4 -- real column `kyc` (jsonb,
  // confirmed live) also had NO write path anywhere in web-next despite
  // v1's own promptForLeadKyc() genuinely capturing it -- every screen
  // could only ever read/display lead.kyc, never save to it. Restoring
  // this closes a real production-parity regression, not new V3 scope.
  kyc?: LeadKyc;
  // Master Rebuild Spec Section 3.4's own worked example: "This client has
  // already been updated by another user. Refresh and review the latest
  // version before saving." Optional and opt-in -- a caller that loaded a
  // Lead and is now saving edits against it passes back `lead.version`
  // here to get a real conflict check; a caller that never loaded the full
  // record (e.g. a bulk/system update) omits it and keeps today's
  // last-write-wins behavior, matching every existing call site until each
  // is deliberately updated to pass it.
  expectedVersion?: number;
}

export interface LeadKyc {
  nationality?: string;
  occupation?: string;
  dob?: string;
  idType?: string;
  idNumber?: string;
  email?: string;
  location?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  contactAddress?: string;
  contactRelation?: string;
  landUsage?: string;
  landUsageDetail?: string;
}

export interface NewLead {
  name: string;
  contact: string;
  plotType: PlotType;
  noPlots: number;
  unitPrice: number;
  paymentPlan: PaymentPlan;
  // NOT written directly to leads.amt_paid (Master Spec Section 4.4: "Never
  // let ordinary staff directly edit amt_paid as a free field. Payments
  // are ledger events"). A caller passing a nonzero amount here gets a
  // real Payment row created right after the lead itself, through the
  // exact same pending/auto-approve rule Log Payment already uses -- see
  // useCreateLead's own comment. The lead is always inserted with
  // amt_paid=0 regardless of what's passed here.
  amtPaid: number;
  notes?: string;
  // Real columns with no way to ever be set before this (address had NO
  // write path anywhere in the app despite 4 separate PDF generators
  // reading it) -- captured at intake rather than forcing an immediate
  // second edit right after saving. discount/netTotal/grandTotal are the
  // real previewGrandTotal()-computed figures the Add Lead form already
  // shows on screen; passed through explicitly so what's stored matches
  // what staff saw, rather than leads.create() re-deriving its own
  // (previously interest-blind) total from scratch.
  leadSource?: string;
  bannerId?: string | null;
  priority?: string;
  address?: string;
  discount?: number;
  netTotal?: number;
  grandTotal?: number;
  // v1-parity fields (formAddLead, index.html:14132) that Add Lead never
  // captured at intake before -- date defaults to today if omitted;
  // siteVisit/nextAction/depositTarget were only ever editable after the
  // fact via Pipeline Detail, forcing an immediate second edit right after
  // saving for something staff already knew at intake.
  date?: string;
  siteVisit?: string;
  nextAction?: string;
  depositTarget?: number;
}

// Real distinct values seen on production's payment_method column
// (index.html's PAYMENT_METHODS constant, confirmed still the live set).
export type PaymentMethod = 'Ecobank' | 'Stanbic Bank' | 'MTN MoMo' | 'Vodafone Cash' | 'Hubtel' | 'Cash' | 'Other';
// 'needs_correction' -- Master Spec Section 6: a manager can send a
// pending payment back for correction instead of declining it outright
// (e.g. a typo'd amount/method), via flag_payment_needs_correction(); the
// logging staff member (or manager) then edits and resubmit_payment()s it,
// which resets status to 'pending' for a fresh review. Neither RPC is a
// raw client UPDATE, matching the existing approve/decline pattern.
export type PaymentStatus = 'pending' | 'approved' | 'declined' | 'needs_correction';

// Extended in place (not a parallel type) since this is the same real
// `payments` table "My pipeline"/pipeline detail already read from --
// those screens just never needed the fuller shape. See Log Payment's
// screen comment for the full real workflow this now models: only
// manager or the 'elias' key can log a payment at all (confirmed live
// RLS, payments_ins), status is 'approved' immediately when a manager
// logs it, 'pending' when elias does (awaiting a manager's review via
// the real approve_payment/decline_payment RPCs) -- there is no
// regular-agent self-service path in production today.
export interface Payment {
  id: string;
  leadId: string;
  agentKey: string;
  amount: number;
  date: string;
  clientName?: string;
  paymentMethod?: PaymentMethod | null;
  note?: string | null;
  status?: PaymentStatus;
  decidedBy?: string | null;
  decidedByName?: string | null;
  decidedAt?: string | null;
  receiptNumber?: string | null;
  // Real column receipt_proof_path (new this session) -- the storage path
  // of a photo the logging agent attaches as proof, so a manager can
  // visually compare it against the typed amount before approving. Path
  // only, not a URL: the 'payment-proofs' Storage bucket is private, a
  // caller resolves it to a signed URL client-side when they actually
  // need to view it (see useProofImageUrl).
  receiptProofPath?: string | null;
  // Staff-entered transaction reference (MoMo txn ID, bank teller slip
  // number, cheque number) captured at logging time -- distinct from
  // receiptNumber, which is this app's own internal number minted by
  // ensure_receipt_number() only after approval. Lets a manager cross-
  // check the payment against the real bank/MoMo statement before
  // approving, per Master Spec Section 6.
  referenceNumber?: string | null;
  // Set only while status === 'needs_correction' -- the manager's reason,
  // shown to the logging staff so they know what to fix before resubmitting.
  correctionReason?: string | null;
}

export interface NewPaymentEntry {
  leadId: string;
  amount: number;
  paymentDate?: string;
  paymentMethod?: PaymentMethod;
  note?: string;
  receiptProofPath?: string;
  referenceNumber?: string;
}

export interface PaymentDecisionResult {
  decidedBy: string;
  decidedByName: string;
  newAmtPaid: number;
  newBalance: number;
  // Set only when this approval newly crossed config.allocationThresholdPct
  // and auto-raised an allocation_requests row (approve_payment RPC, and
  // its demo-mode equivalent) -- lets the caller SMS the agent in charge
  // without a second round-trip to fetch the request it just created.
  autoAllocation?: {
    id: string;
    leadId: string;
    clientName: string;
    agentKey: string;
    agentName: string | null;
    agentPhone: string | null;
  };
}

// Real DB check constraint (schedule_items_status_check, confirmed live
// 2026-09-06): open/in_progress/done/cancelled/rescheduled/blocked/
// awaiting_approval. 'closed' here is this app's own domain name for DB
// 'done' (see mapScheduleItemRow's translation table) -- kept as-is
// rather than renamed, so every existing My Day call site touching a
// todo's status is untouched. 'blocked' is Master Spec 10.1's Task Board
// column -- a REAL stored status (confirmed live in the DB constraint,
// not something this app needs to derive/compute), set automatically
// when a task's blockedById predecessor is still open and cleared once
// that predecessor completes (see useTasks.ts). 'awaiting_approval' also
// exists in the live constraint but has no product definition anywhere
// in the spec or this app yet -- deliberately not surfaced here until it
// does; TS will reject anyone trying to set it by accident.
export type ScheduleItemStatus = 'open' | 'in_progress' | 'blocked' | 'closed' | 'cancelled' | 'rescheduled';

export type ScheduleItemKind = 'todo' | 'task' | 'meeting';

// Real DB check constraint (schedule_items_recurs_freq_check).
export type RecurrenceFreq = 'daily' | 'weekly' | 'monthly';

// Master Spec Section 10.2's full task model, plus 10.3's Meetings (a
// meeting is a third `kind` on this SAME table, per the spec's own "My
// Day/Week/Month/Team Schedule/Task Board" views all being one shared
// schedule -- not a parallel table). Every field below is a real column
// on schedule_items (confirmed live 2026-09-06) -- most already existed
// from an earlier phase but were never mapped/used until now; linkedLeadId/
// linkedSiteVisitId/blockedById/meetingLocation were added this session
// specifically to close the remaining spec 10.2/10.3 gaps.
export interface ScheduleItem {
  id: string;
  kind: ScheduleItemKind;
  ownerKey: string;
  ownerName?: string;
  assignedTo: string;
  assignedToName?: string;
  // Who assigned this to assignedTo (creator of the assignment, distinct
  // from ownerKey which never changes) -- real column, written on
  // create/reassign, never surfaced in the UI before this session.
  assignedBy?: string | null;
  assignedByName?: string | null;
  date: string;
  // The real deadline, distinct from `date` (which day this item is
  // slotted/shown on) -- both map to real, separate columns
  // (item_date/due_date); `date` keeps its existing item_date-first
  // fallback so no existing call site changes behavior.
  dueDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  status: ScheduleItemStatus;
  title: string;
  description?: string | null;
  notes?: string | null;
  category?: string | null;
  priority?: string | null;
  // Real FKs added 2026-09-06 (Master Spec 10.2: "linked lead, linked
  // site visit").
  linkedLeadId?: string | null;
  linkedSiteVisitId?: string | null;
  // Real FK added 2026-09-06 (Master Spec 10.2: "Dependencies: Blocked
  // by / Blocking"). A single predecessor -- "Blocking" is just the
  // inverse, computed by asking which other items point their
  // blockedById at this one, not a second stored column.
  blockedById?: string | null;
  // Real column added 2026-09-06 (Master Spec 10.3: "Meeting links/
  // location supported") -- only meaningful when kind='meeting'.
  meetingLocation?: string | null;
  recursFreq?: RecurrenceFreq | null;
  recursInterval?: number | null;
  recursUntil?: string | null;
  recursParentId?: string | null;
  // Real column added 2026-09-05 (reference "Add New Task" screen's own
  // Tags field) -- free-text labels, distinct from the fixed category
  // enum, genuinely stored and editable, not a cosmetic-only chip list.
  tags?: string[];
  // Real column, now actually stamped on close (see useTasks.ts's own
  // comment) -- the live leaderboard_rows() RPC's tasks_completed/
  // avg_task_days already depend on this, but nothing ever set it before
  // this session, so every task closed through this app undercounted.
  completedAt?: string | null;
  createdAt?: string;
}

export interface NewTask {
  title: string;
  description?: string;
  notes?: string;
  category?: string;
  priority?: string;
  assignedTo: string;
  assignedToName: string;
  dueDate?: string;
  startTime?: string;
  endTime?: string;
  linkedLeadId?: string;
  linkedSiteVisitId?: string;
  blockedById?: string;
  recursFreq?: RecurrenceFreq;
  recursInterval?: number;
  recursUntil?: string;
  tags?: string[];
}

// Editable fields after creation -- Master Spec 10.2 implies a task's
// full record (title/description/notes/category/priority/dates/times/
// links/dependency) can be revised as work develops, not fixed forever
// at creation time.
export interface ScheduleItemPatch {
  title?: string;
  description?: string | null;
  notes?: string | null;
  category?: string | null;
  priority?: string | null;
  date?: string;
  dueDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  linkedLeadId?: string | null;
  linkedSiteVisitId?: string | null;
  blockedById?: string | null;
  tags?: string[];
}

// Master Spec 10.3's Meetings ride the same schedule_items row (kind=
// 'meeting') as a task/todo -- this is just the extra fields a meeting
// needs when creating one, mirroring NewTask's shape.
export interface NewMeeting {
  title: string;
  description?: string;
  date: string;
  startTime: string;
  endTime: string;
  meetingLocation?: string;
  inviteeKeys: string[];
}

// Real table `schedule_item_invitees` (confirmed live 2026-09-06, RLS
// already in place from an earlier phase) -- one row per invited staff
// member on a meeting, Master Spec 10.3's "Attendees can accept/decline;
// organizer sees responses."
export interface ScheduleItemInvitee {
  id: string;
  scheduleItemId: string;
  staffKey: string;
  staffName: string | null;
  status: 'invited' | 'accepted' | 'declined';
  respondedAt: string | null;
  createdAt: string;
}

// Real table `task_events` (confirmed live 2026-09-06, RLS already in
// place) -- Master Spec 10.2's "activity history" and "Task reassignment
// records who reassigned and why." `type` is a short verb ('created',
// 'status_changed', 'reassigned', 'blocked', 'unblocked', etc.); from/to
// carry whatever changed (staff keys for reassignment, status values for
// a status change) so one generic table covers every kind of event.
export interface TaskEvent {
  id: string;
  taskId: string;
  type: string;
  actorKey: string | null;
  actorName: string | null;
  fromKey: string | null;
  fromName: string | null;
  toKey: string | null;
  toName: string | null;
  note: string | null;
  createdAt: string;
}

// Real table `schedule_item_attachments` (added 2026-09-06, Master Spec
// 10.2: "attachments"). Storage path convention `{scheduleItemId}/
// {filename}` in the `task-attachments` bucket -- lets storage RLS reuse
// the same can_see_task() visibility this metadata row's own RLS uses,
// instead of a second, separately-derived access rule.
export interface ScheduleItemAttachment {
  id: string;
  scheduleItemId: string;
  fileName: string;
  storagePath: string;
  contentType: string | null;
  uploadedBy: string | null;
  uploadedByName: string | null;
  createdAt: string;
}

export interface StreakRow {
  staffKey: string;
  date: string;
  dayMet: boolean;
}

// Real column `leaderboard_weights` (jsonb) on app_config -- confirmed live,
// same shape on both projects. Feeds agentPoints() below; a manager can
// tune these from the Leaderboard screen's Weights control.
export interface LeaderboardWeights {
  collected: number;
  dealsClosed: number;
  siteVisits: number;
  tasksCompleted: number;
  todosCompleted: number;
  taskSpeedBonus: number;
  regularity: number;
  punctuality: number;
}

// Real user/spec ask (Master Spec 12.3): Eid dates cannot be reliably
// predicted, so Management maintains this list directly instead of an
// algorithmic Islamic-calendar calculation.
export interface EidWindow {
  id: string;
  name: string;
  centerDate: string;
  daysBefore: number;
  daysAfter: number;
}

export interface Config {
  workEndTime: string;
  targetPlotsPerMonth: number;
  targets: Record<string, number>;
  leaderboardWeights: LeaderboardWeights;
  // Real app_config columns (confirmed live, same values on both projects):
  // commission is capped-per-payment, not a flat percentage -- see
  // commissionLogic.ts's paymentContribution() for the exact formula.
  commissionFullCap: number;
  commissionHalfCap: number;
  commissionPoolPerPlot: number;
  fullPrice: number;
  halfPrice: number;
  // Real columns full_discount/half_discount/int_3/int_6/int_9/int_12
  // (confirmed live -- note the underscored int_N naming, NOT int3/int6/
  // int9/int12 like the JS-side CONFIG object uses; a real place a naive
  // port would have silently broken). Interest is a flat per-full-plot-
  // equivalent figure for each payment plan length -- see
  // quotationLogic.ts for the exact formula this feeds.
  fullDiscount: number;
  halfDiscount: number;
  int3: number;
  int6: number;
  int9: number;
  int12: number;
  // Real columns quote_company_name/quote_site_name/company_phone/
  // company_email/company_tin/quote_footer_address/receipt_thanks_text/
  // receipt_logo_image (confirmed live) -- company identity shown on
  // quotations and payment receipts. phone/email/tin are empty strings in
  // real production today (never filled in), not a gap in this port.
  quoteCompanyName: string;
  quoteSiteName: string;
  companyPhone: string;
  companyEmail: string;
  companyTin: string;
  quoteFooterAddress: string;
  receiptThanksText: string;
  receiptLogoImage: string | null;
  // Real columns quote_doc_type_text/quote_notes_text/quote_land_note_text
  // (confirmed live) -- quoteNotesText is newline-separated, numbered
  // automatically on the rendered PDF.
  quoteDocTypeText: string;
  quoteNotesText: string;
  quoteLandNoteText: string;
  // Real columns quote_logo_image/quote_accent_color, added 2026-09-11
  // for the new Template Settings tab -- an uploaded logo/brand-color
  // override for the Quotation and Technical Quotation PDFs. Null falls
  // back to the existing hardcoded orange logo file / green brand color.
  quoteLogoImage: string | null;
  quoteAccentColor: string | null;
  // Real columns contract_ceo_name/contract_preamble/contract_definitions/
  // contract_terms/contract_cover_image/contract_wordmark_image (confirmed
  // live) -- feed the Contract of Sale PDF (buildContractOfSalePDF).
  // contractPreamble contains a literal '{ACRES}' placeholder the PDF
  // substitutes per-lead; the images fall back to the bundled defaults
  // (public/contract-cover.jpg, public/trulander-wordmark.png) when null,
  // matching production (both currently null there).
  contractCeoName: string;
  contractPreamble: string;
  contractDefinitions: string;
  contractTerms: string;
  contractCoverImage: string | null;
  contractWordmarkImage: string | null;
  // Real columns tech_full_plot_length_ft/tech_full_plot_width_ft/
  // tech_half_plot_length_ft/tech_half_plot_width_ft (confirmed live,
  // production values 70x100 / 50x70 -- same baseline dimensions
  // contractAcres() derives its 0.1607/0.0804 acre-per-plot figures
  // from). Technical Quotation's GHS/sqft rate is always full_price /
  // (techFullPlotLengthFt * techFullPlotWidthFt), never hardcoded, so a
  // pricing or standard-size change updates the rate system-wide.
  techFullPlotLengthFt: number;
  techFullPlotWidthFt: number;
  techHalfPlotLengthFt: number;
  techHalfPlotWidthFt: number;
  // Real column `allocation_threshold_pct` (added this session -- Master
  // Spec 7.3's "Default allocation threshold: 30% of grand total, subject
  // to management configuration" had no config field anywhere until now;
  // every allocation-eligibility check reads this, never a hardcoded 30).
  allocationThresholdPct: number;
  // Real columns leave_total_days/work_days/eid_observing_staff
  // (confirmed live) -- feed the leave-quota calendar engine
  // (shared/lib/ghanaHolidays.ts, features/leave/lib/leaveLogic.ts).
  // work_days is a 0=Sunday..6=Saturday day-of-week array (production
  // value [1,2,3,4,5], Mon-Fri); eid_observing_staff is a real, short
  // allowlist of staff keys for whom the two Eid holiday windows do NOT
  // block leave selection (everyone else treats them as holidays).
  leaveTotalDays: number;
  workDays: number[];
  eidObservingStaff: string[];
  // Real column eid_windows (added 2026-09-05, Master Spec 12.3) -- a
  // Management-maintained list of Eid windows, replacing an earlier
  // algorithmic Islamic-calendar prediction the spec explicitly says is
  // the wrong approach ("cannot be reliably calculated in advance").
  eidWindows: EidWindow[];
  // Real column referral_points_per_referral (confirmed live, current
  // value 50) -- the default point award clear_referral() expects a
  // caller to pass explicitly (the RPC takes points as a free parameter,
  // not a lookup, so a manager can still override it per referral).
  referralPointsPerReferral: number;
  // Real columns office_lat/office_lng/office_radius_meters/
  // attendance_cutoff_time/work_start_time (confirmed live on both
  // projects, real values e.g. 5.602694/-0.064479/297m/09:00) --
  // work_end_time was already mapped above as workEndTime, these are new.
  // Never mapped anywhere before this -- AttendanceScreen's late/off-site
  // used to be pure self-report (a checkbox nobody was required to check)
  // even though the real geofence/cutoff config to compute both for real
  // has existed the whole time. officeLat/officeLng are null when the
  // office location has never been set (fresh installs) -- AttendanceScreen
  // must fall back to self-report only in that case, never treat a
  // missing config as "0,0 is the office."
  officeLat: number | null;
  officeLng: number | null;
  officeRadiusMeters: number;
  attendanceCutoffTime: string;
  workStartTime: string;
}

// Real V3 chapter-01 entity, new 2026-09-10 -- supersedes the single flat
// Config.officeLat/officeLng/officeRadiusMeters above with a genuine
// multi-site list (real companies have more than one office/yard). The
// old Config fields are kept, not deleted. The real authoritative check
// lives server-side (a DB trigger, recompute_attendance_offsite(), fires
// on attendance_log write and prefers the nearest active row here,
// falling back to the legacy single point only if none exist) -- the
// CLIENT's own off-site check (AttendanceScreen's computeOffSite()) still
// only reads the legacy single point and is UX-only regardless, so it
// stays visually accurate to the real point only until it's updated to
// read this list too (not yet done). See project-attendance-v3-chapter01-gap memory.
export interface OfficeLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  isActive: boolean;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface NewOfficeLocation {
  name: string;
  lat: number;
  lng: number;
  radiusMeters: number;
}

// Real V3 chapter-01 entity (attendance_policy table, new 2026-09-10) --
// a versioned shift/grace-period policy, exactly one row is_active=true
// at a time (enforced by a partial unique index server-side). Written
// only via the set_attendance_policy() SECURITY DEFINER RPC (manager-
// only, atomically deactivates the old row and inserts the new one) --
// never a direct table write. Not yet wired into any late-detection
// logic (AttendanceScreen still compares against the legacy flat
// Config.attendanceCutoffTime/Config.workDays) -- see
// project-attendance-v3-chapter01-gap memory.
// Real V3 chapter-01 entity (attendance_exceptions table, new
// 2026-09-10) -- a pre-authorized off-site request for a planned errand/
// site-visit/field-assignment, decided by Management ahead of time,
// instead of the only-ever-reactive off-site reason box on the sign-in
// form itself. Not yet wired into computeOffSite()/the sign-in flow --
// see project-attendance-v3-chapter01-gap memory.
export type AttendanceExceptionType = 'errand' | 'site_visit' | 'field_assignment' | 'other';
export type AttendanceExceptionStatus = 'pending' | 'approved' | 'declined';

export interface AttendanceException {
  id: string;
  staffKey: string;
  staffName: string;
  exceptionDate: string;
  exceptionType: AttendanceExceptionType;
  reason: string;
  status: AttendanceExceptionStatus;
  requestedBy: string;
  requestedByName: string;
  decidedBy: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface NewAttendanceException {
  exceptionDate: string;
  exceptionType: AttendanceExceptionType;
  reason: string;
}

export interface AttendancePolicy {
  id: string;
  workStartTime: string;
  workEndTime: string;
  graceMinutes: number;
  workDays: number[];
  isActive: boolean;
  effectiveFrom: string;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
}

// One payment's contribution to an agent's personal commission, and what it
// was earned against -- the breakdown a "My commission" screen shows so an
// agent can see exactly which plots/payments produced the total, not just
// a number to trust blindly.
export interface CommissionBreakdownRow {
  leadId: string;
  clientName: string;
  plotType: string;
  paymentDate: string;
  paymentAmount: number;
  contribution: number;
}

// One agent's row in the company-wide monthly commission report (manager
// view) -- personal (their own capped-per-payment earnings this month) +
// poolShare (an equal split of a company-wide new-plots pool, only for
// agents who sold at least one new plot in the last 3 months).
export interface CommissionAgentRow {
  key: string;
  name: string;
  personal: number;
  newPlotsThisMonth: number;
  eligible: boolean;
  poolShare: number;
  total: number;
}

export interface CompanyCommissionReport {
  monthKey: string;
  rows: CommissionAgentRow[];
  poolTotal: number;
  poolShare: number;
  eligibleCount: number;
  totalNewPlotsThisMonth: number;
}

// One row of the real `leaderboard_rows(p_from, p_to)` RPC (confirmed live,
// SECURITY DEFINER, EXECUTE granted to `authenticated` only -- any signed-in
// staff member can rank themselves without the broader leads/payments RLS a
// manager has). `points` is NOT part of the RPC -- it's agentPoints() run
// client-side against the row + the real leaderboard_weights config, exactly
// mirroring index.html so the two can never disagree.
export interface LeaderboardRow {
  staffKey: string;
  staffName: string;
  totalCollected: number;
  dealsClosedYear: number;
  siteVisits: number;
  tasksCompleted: number;
  avgTaskDays: number | null;
  todosCompleted: number;
  daysAttended: number;
  onTimeDays: number;
  points: number;
}

// One row from `leaderboard_score_history` -- a real audit-trail entry,
// written by a DB trigger only when a persisted leaderboard_scores row's
// points actually changed (see recompute_leaderboard_scores() SQL fn).
// Backs the Leaderboard admin workspace's "Recent score changes" panel --
// the part of V3's "score audits" requirement this phase actually built.
export interface LeaderboardScoreHistoryEntry {
  id: string;
  staffKey: string;
  staffName: string;
  periodFrom: string;
  periodTo: string;
  oldPoints: number;
  newPoints: number;
  changedAt: string;
}

// Corrected against the real live vocabulary (index.html's own PLOT_STATUSES
// + the Subdivided status split_plot_for_half_sale sets) -- confirmed via a
// live `select distinct status from plots` on staging, which returned
// 'Available'/'Allocated'/'Running Search' (a prior version of this type had
// invented 'Reserved'/'Sold', which never actually occur in real data and
// silently broke status counts/badges for every real Allocated/Running
// Search plot).
// Master Spec 7.2's own status vocabulary (Reserved/Held for Approval/
// Available/Allocated/Blocked/Disputed/Archived) plus the two real values
// this app's own workflow already depends on (Running Search, Subdivided)
// that aren't in the spec's list at all -- the spec's 7 are a minimum, not
// a replacement for real in-use states. Real schema migration applied
// 2026-09-04 (expand_plot_status_type_and_add_workbook_fields) -- also
// fixed a live bug the old 3-value CHECK constraint had: split_plot_for_
// half_sale() has always set status='Subdivided' on the parent, but that
// value was never in the allowed list, so every real split silently failed
// its own final UPDATE.
export type PlotStatus = 'Available' | 'Running Search' | 'Allocated' | 'Subdivided' | 'Reserved' | 'Held for Approval' | 'Blocked' | 'Disputed' | 'Archived';
export type PlotUnitKind = 'whole' | 'half';

// Deliberately its own type, not a reuse of PlotType above -- that one
// is the SALES unit a client buys (Full/Half, drives pricing/quotation/
// contract logic everywhere it's used). This is the PHYSICAL INVENTORY
// classification (Plot.plotType only), where a real land parcel can be an
// irregular "Partial" piece (per the real supplied workbook -- factors
// like 0.3/0.55/0.7, not just 0.5) that still gets sold, priced
// proportionally to the parcel's real area, without ever needing
// pricingFor()/contract logic to learn a third sales unit they don't
// actually have a defined price/contract clause for.
export type PlotClassification = 'Full Plot' | 'Half Plot' | 'Partial Plot';

// Real RLS on this table (confirmed live) restricts read/write to manager
// or specifically the 'elias'/'emmanuel' staff keys -- not every agent.
// This screen should only ever be reachable by those roles/keys, matching
// how Sales Desk gates it.
// width_ft/length_ft/areaSqft/section: real columns (added 2026-09-04,
// Master Spec 7.1/7.2 -- "the system must model actual dimensions and
// area, not only a binary Full/Half label"). areaSqft is a real generated
// column (width_ft * length_ft), never written directly.
// factor/customerCode: also added 2026-09-04, from the real supplied
// workbook (ALLOCATION SHEET - ROYAL PALM.xlsx) -- factor is the
// workbook's own fractional unit multiplier (1=full, 0.5=half, irregular
// values like 0.3/0.55/0.7 for Partial Plot); customerCode is the
// workbook's legacy customer identifier (C0xx scheme), adopted as the
// plot/client-facing ID for allocations going forward too, per explicit
// user decision -- not retrofitted onto live Pipeline leads, which stay
// identified by their own real Lead ID (fuzzy name-matching 330+ historical
// customers against live leads was ruled out as unreliable for this pass).
// All 414 real plots from the workbook were imported 2026-09-04, replacing
// the smaller placeholder/partial dataset that existed before.
export interface Plot {
  id: string;
  site: string;
  section: string | null;
  plotNumber: string;
  plotType: PlotClassification;
  status: PlotStatus;
  price: number | null;
  clientName: string | null;
  clientContact: string | null;
  agentKey: string | null;
  notes: string | null;
  unitKind: PlotUnitKind;
  parentPlotId: string | null;
  widthFt: number | null;
  lengthFt: number | null;
  areaSqft: number | null;
  factor: number | null;
  customerCode: string | null;
}

export interface NewPlot {
  site: string;
  section?: string | null;
  plotNumber: string;
  plotType: PlotClassification;
  status: PlotStatus;
  price?: number | null;
  clientName?: string | null;
  clientContact?: string | null;
  agentKey?: string | null;
  notes?: string | null;
  widthFt?: number | null;
  lengthFt?: number | null;
  factor?: number | null;
  customerCode?: string | null;
}

export interface PlotUpdate {
  status?: PlotStatus;
  plotType?: PlotClassification;
  price?: number | null;
  clientName?: string | null;
  clientContact?: string | null;
  agentKey?: string | null;
  section?: string | null;
  widthFt?: number | null;
  lengthFt?: number | null;
  notes?: string | null;
  factor?: number | null;
  customerCode?: string | null;
}

// Not a real table -- there is no clients master table in production (confirmed
// live: client_portal_access only covers clients with a portal PIN, ~9 of 105
// real leads, and is a login record, not a client roster). A Client is a
// client-side aggregation over `leads`, grouped the same way production's own
// RLS matches a client to their records: normalized lower/trim(name) + last-9-
// digits(contact). See features/clients/lib/groupClients.ts.
export interface Client {
  name: string;
  contact: string;
  leadIds: string[];
  leadCount: number;
  totalValue: number;
  totalPaid: number;
  latestDate: string;
}

// Real table (confirmed live, 25 columns, 43 real rows). RLS: agent sees/
// edits only their own (agent_key = my_key()), plus manager and a small
// staff allowlist ('elias','emmanuel','elizabeth') see/edit all -- same
// shape as site_visits_ins/_sel/_upd/_del policies. `status` exists in the
// schema but every real row today is 'Pending' -- it's effectively unused
// in practice, not a working outcome tracker yet, so it's modelled as a
// plain string rather than a closed enum.
// feedbackAfter/keyNextSteps are real columns but populated *after* a visit
// happens (a follow-up log, not part of creation) -- deliberately excluded
// from NewSiteVisit below; editing them is a distinct later piece of work,
// same discipline as leaving live payment recording unwired.
export interface SiteVisit {
  id: string;
  agentKey: string;
  agentName: string;
  name: string;
  contact: string;
  site: string;
  plot: string | null;
  visitDate: string;
  visitTime: string | null;
  people: number | null;
  transport: string | null;
  pickup: string | null;
  placeOfWork: string | null;
  position: string | null;
  nationality: string | null;
  purpose: string | null;
  discussionSoFar: string | null;
  keyUnderstanding: string | null;
  feedbackAfter: string | null;
  keyNextSteps: string | null;
  source: string | null;
  accompanied: string | null;
  notes: string | null;
  status: string;
  createdAt: string;
  // Real column added this session (site_visits.lead_id) -- closes Master
  // Spec Section 4's named gap: "no FK from site_visits to a lead at all
  // today." Nullable: a site visit can genuinely happen for a walk-in
  // prospect with no pipeline record yet, so linking stays optional, not
  // mandatory. Historical rows were backfilled by an exact name+contact
  // match against `leads`; new ones are set explicitly by the picker on
  // AddSiteVisitScreen instead of relying on fuzzy matching going forward.
  leadId: string | null;
  // Real columns added 2026-09-05 (Master Spec 9.4: "Delete icon must
  // work. Deletion requires confirmation and reason; it archives/cancels
  // the visit and preserves audit history.") -- a soft cancel via UPDATE,
  // never a hard DELETE, so the row (and its costs/history) survives.
  deletedAt: string | null;
  deletedBy: string | null;
  deletedByName: string | null;
  cancellationReason: string | null;
  // Real columns added 2026-09-05 -- de-dupe tracking for the two
  // scheduled client reminder SMS (send_site_visit_reminders(), run by
  // pg_cron daily at 18:00 the evening before, and 07:00 the morning of),
  // so a visit is never reminded twice. Read-only here -- only the
  // server-side function ever sets these.
  advanceReminderSentAt: string | null;
  finalReminderSentAt: string | null;
}

export interface NewSiteVisit {
  name: string;
  contact: string;
  site: string;
  plot?: string;
  visitDate: string;
  visitTime?: string;
  people?: number;
  transport?: string;
  pickup?: string;
  placeOfWork?: string;
  position?: string;
  nationality?: string;
  purpose?: string;
  discussionSoFar?: string;
  keyUnderstanding?: string;
  // Real v1 fields (formSiteVisit(), index.html:16234-16235): v1's own
  // "Notes (optional -- can fill now or after the visit)" section lets
  // these be captured at REQUEST time too, not only after the visit --
  // previously only settable via a later update, never at creation.
  feedbackAfter?: string;
  keyNextSteps?: string;
  source?: string;
  accompanied?: string;
  notes?: string;
  leadId?: string;
}

// Real table `activity_log` (this is the CRM contact-log, distinct from
// `audit_events` -- see PHASE0_INVENTORY.md #3). `leadId` is a real
// column added this session, backfilled by exact-name match against
// `leads` for historical rows; every new write from the four payment
// RPCs (approve/decline/flag-correction/resubmit) sets it explicitly.
// Feeds Pipeline Detail's new Activity section (Master Spec Section 4's
// "combined activity timeline").
export interface ActivityLogEntry {
  id: string;
  agentKey: string;
  agentName: string | null;
  client: string;
  action: string;
  detail: string | null;
  note: string | null;
  method: string | null;
  follow: string | null;
  createdAt: string;
  leadId: string | null;
}

// Real table (confirmed live, 15 columns, 1 real row). CONFIRMED LIVE BUG
// (2026-08-29, see project-referral-integrity-bug memory): the real UPDATE
// RLS policy (referrals_upd_staff) has no WITH CHECK clause tying a status
// change to a real referred lead / 30% deposit -- only the safe
// clear_referral() RPC enforces that, and RLS doesn't force callers through
// it. The one real production row was cleared bypassing that RPC (its
// referred_lead_id is null, which the RPC would have rejected).
// Deliberate scope boundary because of this: this app never calls a direct
// UPDATE on referrals' status. There is no "mark cleared" UI here at all --
// read-only list + create only, same discipline as leaving live payment
// recording unwired. A future clear/payout screen must call clear_referral()
// exclusively, never .update().
//
// RLS also means an agent only ever sees referrals whose referrer_lead_id
// points at one of their OWN leads (or is staff/manager) -- there is no
// agent_key column on this table at all. So the create flow requires
// picking one of the agent's own existing leads as the referrer, both to
// satisfy that real constraint and so the agent can see their own referral
// again afterward.
export interface Referral {
  id: string;
  referrerLeadId: string | null;
  referrerName: string;
  referrerContact: string | null;
  referredName: string;
  referredContact: string;
  referredLocation: string | null;
  referredNoPlots: number;
  referredLeadId: string | null;
  status: string;
  pointsAwarded: number;
  source: string;
  createdByKey: string | null;
  createdAt: string;
  clearedAt: string | null;
  archived: boolean;
}

export interface NewReferral {
  referrerLeadId: string;
  referredName: string;
  referredContact: string;
  referredLocation?: string;
  referredNoPlots?: number;
}

// Real table (confirmed live, 13 columns, 2 real rows), agent-scoped via
// agent_key exactly like site_visits/leads. No status/owner/resolution
// fields exist here (unlike the structurally similar but purpose-different
// `complaints` table, which has a real ticket workflow) -- this is a
// contact-log shape: `follow`/`followDate` is the only follow-up
// mechanism, both free text/nullable, not a worked queue. `types` is a
// real comma-joined free-text column in production (not an array or
// enum), e.g. "Plot Availability,Site Visit,Price" -- modelled as a plain
// string here and split/joined at the UI layer to match the real shape
// exactly rather than inventing a differently-typed column.
export interface Enquiry {
  id: string;
  agentKey: string;
  agentName: string | null;
  name: string | null;
  contact: string | null;
  location: string | null;
  types: string | null;
  plot: string | null;
  source: string | null;
  details: string | null;
  follow: string | null;
  followDate: string | null;
  createdAt: string;
  // Real columns added 2026-09-05 (user ask: "what stage is it at
  // closed/escalated to another staff or etc") -- enquiries previously had
  // no status or assignment concept at all, unlike complaints which
  // already had both (just not wired to reach the assignee -- fixed the
  // same day).
  status: string;
  owner: string | null;
}

export interface NewEnquiry {
  name: string;
  contact: string;
  location?: string;
  types?: string[];
  plot?: string;
  source?: string;
  details?: string;
  follow?: string;
  followDate?: string;
}

export interface EnquiryUpdate {
  status?: string;
  owner?: string;
  follow?: string;
  followDate?: string;
}

// Real table `attendance_log` (confirmed live, 17 columns) -- currently 0
// rows in production, a genuinely unused-so-far feature, not a guess.
// Exactly ONE row per (staff_key, work_date), enforced by a real unique
// index -- sign-in creates the row, sign-out is an UPDATE to the same row,
// never a second row. RLS: staff insert/select/update their own
// (staff_key = my_key()), manager sees/edits all, only manager deletes --
// same shape as site_visits. No RPC exists (no clock_in()/clock_out()) --
// the app itself must check "does today's row already exist" before
// inserting, and "is sign_out_at already set" before updating, since the
// unique index would otherwise surface as a raw constraint-violation error.
// Corrected 2026-09-04: office_lat/office_lng/office_radius_meters/
// attendance_cutoff_time DO exist on app_config (confirmed live) -- an
// earlier pass here wrongly assumed they didn't and left late/off-site
// pure self-report. AttendanceScreen now computes both for real (Config's
// geofence + cutoff-time, via shared/lib/geolocation.ts's haversineMeters)
// and forces a reason when either is genuinely true, matching
// index.html's own checkOffSite()/late-cutoff logic; these columns still
// just store whatever was determined, self-reported or computed.
export interface AttendanceRecord {
  id: string;
  staffKey: string;
  staffName: string | null;
  workDate: string;
  signInAt: string | null;
  signInLat: number | null;
  signInLng: number | null;
  signOutAt: string | null;
  signOutLat: number | null;
  signOutLng: number | null;
  notes: string | null;
  createdAt: string;
  lateReason: string | null;
  signInReason: string | null;
  signOutReason: string | null;
  isOffSiteIn: boolean | null;
  isOffSiteOut: boolean | null;
  signInPhoto: string | null;
  // Real columns added 2026-09-05 (Master Spec 11.1: "Store photo,
  // timestamp, coordinates, accuracy, late/off-site reason and
  // device/session metadata") -- accuracy was already read from the
  // browser's geolocation API (shared/lib/geolocation.ts) but discarded
  // before reaching here; device metadata was never captured at all.
  signInAccuracyMeters: number | null;
  signOutAccuracyMeters: number | null;
  deviceInfo: string | null;
}

export interface SignInInput {
  lat?: number;
  lng?: number;
  accuracy?: number;
  deviceInfo?: string;
  offSite?: boolean;
  reason?: string;
  late?: boolean;
  lateReason?: string;
  // Real column sign_in_photo (confirmed live) -- a resized JPEG data URI,
  // matching index.html's captureSelfie()/resizeImageToB64 pattern. Never
  // populated before this -- the column existed, nothing wrote to it.
  photo?: string;
}

export interface SignOutInput {
  lat?: number;
  lng?: number;
  accuracy?: number;
  offSite?: boolean;
  reason?: string;
}

// Real table `attendance_notes` (new, Master Spec 11.3: "Praise / Warning
// action with reason and audit trail" -- zero precedent in index.html,
// confirmed via exhaustive grep, so this schema is new rather than ported).
// staff_key/work_date are plain columns, not a foreign key onto
// attendance_log -- a warning must be issuable against an Absent day too,
// which has no attendance_log row at all. Append-only by design (no
// update/delete RLS policy): an audit trail that could be edited or
// deleted after the fact isn't an audit trail (same lesson already
// learned the hard way on payment corrections -- see
// pipeline-payment-integrity in project memory).
export interface AttendanceNote {
  id: string;
  staffKey: string;
  staffName: string;
  kind: 'praise' | 'warning';
  reason: string;
  workDate: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

// ATTENDANCE_BLUEPRINT.md §13 -- distinct from AttendanceException (ask
// permission ahead of time): this is Management labeling an off-site
// sign-in/out AFTER it already happened, real Master Spec 11.2 requirement.
// `classification` is a real enum column (added 2026-09-11), not encoded
// into `note` -- the whole point of this session's schema work has been
// avoiding exactly that kind of string-prefix hack.
export interface AttendanceReview {
  id: string;
  attendanceLogId: string;
  staffKey: string;
  staffName: string;
  reviewType: 'exception';
  status: 'pending' | 'reviewed';
  classification: 'authorized' | 'exception' | null;
  note: string | null;
  reviewedBy: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

// Real tables `memos` + `memo_recipients` (confirmed live, 6 real memo
// rows) -- NOT a filtered view of the separate `messages` table used for
// other things (plot requests, critical alerts). A memo has one primary
// addressee (to_key/to_name) plus an optional CC list via memo_recipients
// rows (sender-insert-only). "Draft" is a real `status='draft'` value the
// recipient literally cannot SELECT yet (RLS blocks it) -- sending is a
// plain UPDATE flipping status to 'sent', not a separate action/RPC.
// body_html is real column name/intent (rich text), but this app
// deliberately treats it as PLAIN TEXT end to end -- never rendered via
// dangerouslySetInnerHTML -- to avoid taking on stored-XSS risk for a
// first-cut screen. Newlines are preserved via CSS white-space, not markup.
export interface Memo {
  id: string;
  fromKey: string;
  fromName: string;
  toKey: string;
  toName: string;
  subject: string;
  bodyHtml: string;
  parentId: string | null;
  kind: string;
  createdAt: string;
  read: boolean;
  status: string;
}

export interface MemoRecipient {
  id: string;
  memoId: string;
  staffKey: string;
  staffName: string;
  read: boolean;
  createdAt: string;
}

export interface NewMemo {
  toKey: string;
  toName: string;
  subject: string;
  bodyHtml: string;
  status: 'draft' | 'sent';
  cc?: { key: string; name: string }[];
}

// Company-wide aggregation for Manager Home -- confirmed live (2026-08-29)
// that `leads`/`payments`/`complaints` RLS all let a real manager-role
// session SELECT every row (leads_sel/payments_sel/complaints_sel), so
// this is a real unfiltered query, not a client-side illusion. Computed
// from `leads` alone (amtPaid/grandTotal per row) rather than also
// summing `payments` separately -- same computation "My pipeline"
// already uses, just company-wide instead of one agent's rows.
export interface ManagerOverview {
  totalLeads: number;
  pipelineValue: number;
  collected: number;
  outstanding: number;
  fullyPaidCount: number;
  openComplaints: number;
  siteVisitsCount: number;
  stageFunnel: { stage: Stage; count: number }[];
  byAgent: { key: string; name: string; leadCount: number; value: number }[];
  // Real amount collected per month, oldest to newest, for the trailing 6
  // months including the current one -- feeds the KPI strip's sparkline.
  // Always length 6 (zero-filled for months with no payments), never
  // synthetic/interpolated data.
  collectedTrend: number[];
}

// Public, unauthenticated Site Visit Experience feedback form -- a
// genuinely different access pattern from everything else in this app.
// Confirmed live (2026-08-29) that RLS on the underlying tables is
// closed to `anon` entirely (no token-based bypass existed), so this
// goes through two new SECURITY DEFINER RPCs
// (get_site_visit_invite/submit_site_visit_experience) added to BOTH
// production and staging this session -- deliberately narrow (a token
// lookup and one validated insert) rather than opening the tables
// themselves to anon, which would make invite tokens enumerable via a
// broad SELECT policy. See data/sveClient.ts, not data/source.ts --
// this never goes through the demo/live DataSource seam because a
// public visitor has no session/profile for demoMode to key off of.
export interface SiteVisitInvite {
  inviteId: string;
  clientName: string | null;
  site: string | null;
  plot: string | null;
  visitDate: string | null;
  alreadySubmitted: boolean;
}

export type SveSubmitResult = 'ok' | 'already_submitted' | 'not_found';

export interface SveSubmissionInput {
  fullName: string;
  phone: string;
  siteVisited?: string;
  visitDate?: string;
  journeyRating?: string;
  siteManagerName?: string;
  relationshipRating?: number;
  handlingFeedback?: string;
  siteDescriptionRating?: string;
  belowExpectationReason?: string;
  overallRating?: number;
  npsScore?: number;
  improvementSuggestions?: string;
  purchaseIntent?: string;
  additionalComments?: string;
}

// Staff-side records for the SAME site_visit_experience_invites/
// _submissions tables the public form (SveFeedbackScreen) writes to via
// RPC. These, by contrast, ARE staff-authenticated reads/writes -- real
// RLS confirmed live restricts them to manager + the 'elias'/'emmanuel'/
// 'elizabeth' allowlist, same shape as site_visits itself, so a screen
// built on these is gated the same way Plot Inventory is gated. `token`
// is deliberately left server-generated (the column's real default is
// encode(gen_random_bytes(24),'hex')) rather than client-generated, to
// keep using Postgres's crypto-strength randomness rather than
// reinventing it in JS.
export interface SveInviteRecord {
  id: string;
  siteVisitId: string | null;
  token: string;
  clientName: string | null;
  clientContact: string | null;
  sentAt: string | null;
  sentVia: string | null;
  sentBy: string | null;
  submittedAt: string | null;
  createdAt: string;
}

export interface SveSubmissionRecord {
  id: string;
  inviteId: string | null;
  fullName: string;
  phone: string;
  siteVisited: string | null;
  visitDate: string | null;
  journeyRating: string | null;
  siteManagerName: string | null;
  relationshipRating: number | null;
  handlingFeedback: string | null;
  siteDescriptionRating: string | null;
  belowExpectationReason: string | null;
  overallRating: number | null;
  npsScore: number | null;
  improvementSuggestions: string | null;
  purchaseIntent: string | null;
  additionalComments: string | null;
  createdAt: string;
  // Real columns added 2026-09-05 -- the AI-assisted report a staff
  // member built from this submission and sent to Management (a
  // sve_report_links row, tokenized the same way receipt_share_links
  // is), if any yet.
  reportPdfPath: string | null;
  reportSentAt: string | null;
}

// A site visit joined with its invite/submission status, if any --
// computed client-side (no RPC needed here, this is a normal
// authenticated staff read across 3 tables RLS already scopes correctly).
export interface SveVisitStatus {
  siteVisit: SiteVisit;
  invite: SveInviteRecord | null;
  submission: SveSubmissionRecord | null;
}

// v1's real, already-proven per-client debrief schema (index.html:15226-
// 15237, SVE_REVIEW_QUESTIONS) -- confirmed live in v1's own production
// Site Visit Experience "Reports" tab, and the user explicitly asked to
// reuse it ("i hope u used the experience form from v1 because it was
// good. so use that one") rather than the plain single free-text note
// this session first built. Real professional CRM site-visit-debrief
// conventions (objections, how handled, interest level, confidence to
// close) instead of one vague comment box -- also what actually gives
// the AI-polish pass something concrete to compose from, per the user's
// "make sure the ai doesn't write basic English that doesn't make any
// technical sense."
export const SVE_REVIEW_QUESTIONS = [
  { key: 'communication', label: 'How would you rate your communication with this client during the visit?', type: 'rating' },
  { key: 'clientFeedback', label: "What was the client's overall feedback about the site?", type: 'textarea' },
  { key: 'objections', label: 'Did the client raise any concerns or objections? If so, what were they?', type: 'textarea' },
  { key: 'howHandled', label: 'How did you personally address those concerns?', type: 'textarea' },
  { key: 'questionsAsked', label: 'What specific questions did the client ask?', type: 'textarea' },
  { key: 'interestLevel', label: "What is the client's current level of interest?", type: 'select', options: ['Very interested', 'Somewhat interested', 'Undecided', 'Not interested'] },
  { key: 'followUp', label: 'What follow-up actions were agreed with the client?', type: 'textarea' },
  { key: 'riskFactors', label: 'Any red flags or risk factors for this client?', type: 'textarea' },
  { key: 'confidenceToClose', label: 'How confident are you this client will proceed to purchase?', type: 'rating' },
  { key: 'additionalNotes', label: 'Any additional notes for Management?', type: 'textarea' },
] as const satisfies readonly { key: string; label: string; type: 'rating' | 'textarea' | 'select'; options?: string[] }[];

export type SveReviewAnswers = Partial<Record<(typeof SVE_REVIEW_QUESTIONS)[number]['key'], string | number>>;

// Real table `sve_day_reports` (added 2026-09-05) -- one row per real
// site-visit day, covering every client who visited that day. Replaces
// the earlier one-report-per-submission flow: real user ask, "the report
// isn't supposed to be for a single client after client but a full
// report after every site visit." `entries` is a JSONB array (not a
// child table -- nothing outside this one report ever queries into it)
// with one item per client visited that day: the AI's own feedback
// summary of what they said (from their SveSubmissionRecord, if they
// submitted one), plus the site manager's own structured debrief for
// that client (SveReviewAnswers, v1's own real question set -- covers a
// client who never submitted a survey too, unlike v1's own model which
// can only attach a review to an existing submission row) and its
// AI-composed narrative. `siteSummary`/`siteSummaryAi` are the same
// raw/polished pair but for the site manager's overall day-level account
// of what happened on site, not tied to one client.
export interface SveDayReportEntry {
  siteVisitId: string;
  clientName: string;
  clientContact: string;
  submissionId: string | null;
  aiFeedbackSummary: string | null;
  managerReview: SveReviewAnswers | null;
  managerNotesAi: string | null;
}

export interface SveDayReport {
  id: string;
  visitDate: string;
  site: string;
  preparedBy: string | null;
  preparedByName: string | null;
  entries: SveDayReportEntry[];
  siteSummary: string | null;
  siteSummaryAi: string | null;
  status: 'draft' | 'sent';
  reportPdfPath: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SveDayReportPatch {
  entries?: SveDayReportEntry[];
  siteSummary?: string | null;
  siteSummaryAi?: string | null;
  preparedBy?: string;
  preparedByName?: string;
}

// Real table `messages` (confirmed live) -- strictly 1:1 staff-to-staff,
// no group/company-wide channel. This same table doubles as a generic
// staff-notification bus in production (schedule invites, allocation
// PDFs, critical alerts all insert here with `kind` set); web-next's
// Chat only ever reads/writes rows where kind IS NULL, leaving
// notification-kind rows alone entirely -- not because they're unsafe to
// touch, but because surfacing them as "chat" would misrepresent what
// they are. Already in the `supabase_realtime` publication on both
// staging and production (confirmed live) -- no migration needed for
// realtime delivery itself. A real gap WAS found and fixed with the
// user's approval: no UPDATE RLS policy existed at all (read-receipt
// marking was silently a no-op under RLS, in index.html too, not just
// here) -- messages_upd_recipient was added to both projects this
// session, scoped to `recipient_key = my_key()`.
export interface ChatMessage {
  id: string;
  senderKey: string;
  senderName: string;
  recipientKey: string | null;
  body: string;
  createdAt: string;
  read: boolean;
  attachmentData: string | null;
  attachmentType: string | null;
  attachmentName: string | null;
  kind: string | null;
  refType: string | null;
  refId: string | null;
  // Real column `reply_to_id` (self-referencing FK, `on delete set null`)
  // -- a genuinely new capability for this app, not a port (neither
  // production nor staging had it before this pass; the real UI pattern
  // itself is ported from real chat-app research, see
  // web-next-dribbble-figma-research memory). Resolved client-side by
  // looking the id up in the same already-loaded thread array -- no
  // extra query needed, the whole point of only ever offering "reply"
  // on a message already visible on screen.
  replyToId: string | null;
}

export interface ChatConversation {
  otherKey: string;
  otherName: string;
  lastMessage: ChatMessage | null;
  unreadCount: number;
}

// Real table (confirmed live, 15 columns, 2 real rows). No CHECK
// constraints or enum types anywhere -- category/priority/status/
// sentiment/source are all plain free text, enforced only by UI
// convention in production, not the database. Real values seen: category
// in {"Land / Plot Issue", "Service Quality"}, priority "High" (the only
// value present), status "Open" (the only value present, matches the
// column default -- no complaint has ever been marked Resolved in real
// data yet). source/sentiment are null in both real rows -- unused/
// aspirational columns, deliberately not exposed in the UI rather than
// inventing values for a dormant field.
// RLS (confirmed live): unlike payments' manager-only approve/decline,
// complaints_upd is agent-scoped exactly like complaints_sel/_del (own
// rows, or manager sees/edits all) -- any owning agent can already
// resolve their own complaint via a plain UPDATE, no RPC exists and none
// is needed; this is a real, deliberate difference from the payments
// workflow, not an oversight.
export interface Complaint {
  id: string;
  agentKey: string;
  agentName: string | null;
  name: string | null;
  contact: string | null;
  plot: string | null;
  category: string | null;
  details: string | null;
  owner: string | null;
  priority: string | null;
  resolution: string | null;
  status: string;
  createdAt: string;
  source: string | null;
  sentiment: string | null;
}

export interface NewComplaint {
  name: string;
  contact: string;
  plot?: string;
  category?: string;
  details?: string;
  priority?: string;
}

export interface ComplaintUpdate {
  status?: string;
  resolution?: string;
  priority?: string;
  owner?: string;
}

// Real table `contract_requests` (confirmed live) -- any signed-in staff
// member can request a contract be drafted for a lead; only Management or
// the 'elizabeth' key (RLS-confirmed, same special-key pattern as Plot
// Inventory's elias/emmanuel) can mark one fulfilled. Actually generating
// the contract-of-sale PDF itself (index.html's buildContractOfSalePDF(),
// a long legal document template) is a separate, much larger undertaking
// deliberately out of scope here -- this models the real request/fulfil
// workflow only. `source`/`clientAddress`/`clientKyc` exist on the real
// table for the client-portal self-service flow (a client requesting their
// own contract) -- dormant in this staff-only first cut, same treatment
// Complaints gave its unused source/sentiment columns.
export interface ContractRequest {
  id: string;
  leadId: string;
  clientName: string;
  requestedBy: string;
  requestedByName: string;
  note: string | null;
  status: 'pending' | 'fulfilled';
  createdAt: string;
  fulfilledAt: string | null;
}

export interface NewContractRequest {
  leadId: string;
  clientName: string;
  note?: string;
}

// Real table `contracts` (confirmed live) -- a generated Contract of Sale
// is recorded here as METADATA ONLY, no PDF blob stored (index.html's own
// comment on this: buildContractOfSalePDF() regenerates the exact same
// document fresh from the lead's own data plus the current contract
// text/images any time it's needed, so a stored copy would just go
// stale). contracts_ins RLS is manager/elizabeth only, matching
// canManageContracts() -- gate generation client-side the same way
// useCanFulfilContracts() already gates contract_requests fulfilment.
export interface Contract {
  id: string;
  leadId: string;
  clientName: string;
  agentKey: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

// CONTRACT_OF_SALE_BLUEPRINT.md §4 -- the real template-studio entities.
// Additive alongside ContractRequest/Contract above, which stay exactly
// as they are (the existing request/fulfil/metadata-only-generation flow
// keeps working; these new tables are what actually gives that flow a
// real versioned, token-driven document to generate from).
export interface ContractTemplate {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

export interface NewContractTemplate {
  name: string;
  description?: string;
}

export type ContractSectionKind = 'heading' | 'paragraph' | 'clause' | 'signature_block' | 'image' | 'footer';

export interface ContractSection {
  id: string;
  kind: ContractSectionKind;
  text?: string;
  clauseId?: string;
  imageRef?: string;
}

export type ContractTemplateVersionStatus = 'draft' | 'in_review' | 'published' | 'archived';

export interface ContractTemplateVersion {
  id: string;
  templateId: string;
  versionNumber: number;
  status: ContractTemplateVersionStatus;
  content: ContractSection[];
  publishedAt: string | null;
  publishedBy: string | null;
  publishedByName: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

// The clause library -- a reusable named text block, insertable into any
// template version (copies inline at insert time, see §6.2's own note on
// why: the version must stay self-contained even if the library clause
// is edited afterward).
export interface ContractClause {
  id: string;
  name: string;
  category: string | null;
  body: string;
  isActive: boolean;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

export interface NewContractClause {
  name: string;
  category?: string;
  body: string;
}

// The token catalog (§7) -- a field is just a validated camelCase name +
// scope, matching the real Syncfusion Document Template Studio pattern
// this was modeled on directly.
export type ContractFieldScope = 'common' | 'template';

export interface ContractField {
  id: string;
  key: string;
  scope: ContractFieldScope;
  templateId: string | null;
  createdBy: string;
  createdAt: string;
}

// The real generation-time snapshot (§8) -- content_snapshot/
// fieldValuesSnapshot are the fully resolved content actually used, so a
// later template edit never changes what re-opening this generation
// shows. templateVersionId is a lineage/audit pointer only, matching
// Documenso's own "templateId is lineage, not a live dependency"
// discipline -- never read live to redisplay a past generation.
export interface ContractGeneration {
  id: string;
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
  generatedAt: string;
}

export type ContractApprovalStatus = 'approved' | 'rejected';

export interface ContractApproval {
  id: string;
  templateVersionId: string;
  status: ContractApprovalStatus;
  reason: string | null;
  decidedBy: string;
  decidedByName: string;
  decidedAt: string;
}

// Real table `leave_requests` (confirmed live). Unusually open SELECT RLS
// (`auth.uid() IS NOT NULL`, not agent/manager-scoped) -- any signed-in
// staff member sees every request company-wide, matching index.html's own
// cross-staff "who's on leave" checks elsewhere in the app. UPDATE is own
// row OR manager. Deliberately the request/decide subset of a much larger
// real feature: the annual-calendar "planned" (private, not yet sent)
// stage, emergency-leave, deduct-quota toggle, reschedule flow, and
// quota-remaining tracking (a whole separate calc engine) are all out of
// scope. `decidedSignature` (real column `decided_signature`) is the
// approving manager's own saved signature, stamped via
// getStaffSignature(PROFILE.key) at decide-time -- null if they haven't
// uploaded one in Settings yet, same as the real app.
export interface LeaveRequest {
  id: string;
  agentKey: string;
  agentName: string;
  year: number;
  dates: string[];
  daysCount: number;
  letterText: string | null;
  // 'planned' is v1's real private-draft stage (index.html's leave engine,
  // status 'planned' -> 'pending' -> approved/declined/rescheduled) --
  // Master Spec 12.1's "save a plan as Draft and later submit it" maps
  // directly onto it, ported here under the same name v1 uses.
  status: 'planned' | 'pending' | 'approved' | 'declined' | 'rescheduled';
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  decidedByName: string | null;
  decidedSignature: string | null;
  // Real columns is_emergency/deduct_quota/reschedule_note (confirmed
  // live) -- Master Spec 12.4: existed on the table already but were
  // never mapped, exposed, or wired into decide() until 2026-09-05.
  // deductQuota is normally true; Management can set it false when
  // approving/rescheduling an emergency request as an exceptional case
  // (their call at decision time, not the requester's own choice).
  // rescheduleNote holds whichever note Management attaches to a
  // decline or reschedule decision.
  isEmergency: boolean;
  deductQuota: boolean;
  rescheduleNote: string | null;
  // Real column `used_confirmed_at` (new 2026-09-05, migration
  // leave_requests_add_used_confirmed_at). User correction: leave must NOT
  // count as "used" the moment it's approved -- only once the dates have
  // actually passed AND the staff member confirms they took it. This is
  // separate from the entitlement-protecting "reserved" count
  // (leaveDaysUsed/leaveDaysRemaining in leaveLogic.ts, unchanged --
  // pending/approved-but-not-yet-taken leave must still count against the
  // annual cap, or nothing stops someone stacking more requests than their
  // entitlement before any of them are confirmed used). See
  // leaveIsConfirmedUsed/leaveDaysConfirmedUsed in leaveLogic.ts.
  usedConfirmedAt: string | null;
}

export interface NewLeaveRequest {
  dates: string[];
  letterText?: string;
  isEmergency?: boolean;
  // v1's real "save as Draft" -- creates the row as 'planned' instead of
  // going straight to 'pending'/Management's queue.
  asDraft?: boolean;
}

// Real table `allocation_requests` (confirmed live), same manager/elias/
// emmanuel gate as Plot Inventory (alloc_sel/alloc_upd -- an agent can
// also see and (per RLS) update their own row, used in the real app for
// agent_seen marking, not built here). The real trigger for one of these
// existing is server-side (the approve_payment RPC conditionally creates
// one once a lead crosses ~30% paid -- deliberately not replicated
// client-side, see Payment's comment in source.ts), so this models a
// manual "request allocation for one of my leads" flow instead -- an
// honest simplification, not a guess at the real automatic trigger.
// suggested_plots (staff pre-narrowing candidates before allocating),
// flagging (a dispute/hold state), and the "Awaiting Authorization"
// intermediate status are all out of scope -- just Pending -> Allocated.
export interface AllocationHistoryEvent {
  type: string;
  at: string;
  by: string;
  [key: string]: unknown;
}

// Real 3-stage workflow confirmed via the actual confirm_allocation/
// edit_allocated_plot/revert_allocation/delete_allocation RPCs on production
// (staging never had them until this pass -- ported verbatim): Pending ->
// (staff suggest 1-3 candidate plots, real inventory validated) Awaiting
// Authorization -> (Management signs off physically, staff confirm) ->
// Allocated, which is the point the RPC finally syncs the real `plots` row
// (status/client/agent). A bare status update alone was a real gap -- it
// never touched plots at all before this pass.
export interface AllocationRequest {
  id: string;
  leadId: string;
  clientName: string;
  agentKey: string;
  agentName: string | null;
  percentPaid: number | null;
  grandTotal: number | null;
  amtPaid: number | null;
  status: 'Pending' | 'Awaiting Authorization' | 'Allocated';
  plotNumber: string | null;
  suggestedPlots: string | null;
  note: string | null;
  allocatedBy: string | null;
  flagReason: string | null;
  flaggedBy: string | null;
  flaggedAt: string | null;
  history: AllocationHistoryEvent[];
  createdAt: string;
  resolvedAt: string | null;
  // Master Spec 7.5's physical sign-off gate: Management signs a printed
  // authorization form, staff photograph it and attach it here before
  // confirming. Soft gate (explicit user decision) -- a photo is required
  // to confirm, but authDocAiStatus never blocks the confirm button itself,
  // it just informs whoever is about to click it.
  authDocPhotoPath: string | null;
  authDocUploadedBy: string | null;
  authDocUploadedAt: string | null;
  authDocAiStatus: 'pending' | 'pass' | 'mismatch' | 'unavailable' | null;
  authDocAiNote: string | null;
}

export interface NewAllocationRequest {
  leadId: string;
}

// Real table `notes` (confirmed live): a private per-staff scratchpad.
// notes_sel lets a manager also SELECT anyone's notes (a real, if unusual,
// oversight allowance -- not built into the UI here, this screen only
// ever queries/mutates the caller's own), but INSERT/UPDATE/DELETE are
// strictly owner-only. Full CRUD, no scoped-down subset needed -- this is
// genuinely as simple as the real feature itself.
export interface Note {
  id: string;
  ownerKey: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface NewNote {
  title: string;
  body: string;
}

// Real table `banners` (confirmed live) -- physical advertising banner/
// scouted-location tracking. `status` is one of index.html's real
// BANNER_STATUS keys, not a free string. Real RLS (banners_sel/ins/upd,
// confirmed live) is open to any authenticated staff member, unlike Plot
// Inventory -- banners_del is owner-or-manager only. lat/lng/image are
// real columns but only meaningful for the Map & Routes tab, which is
// deliberately out of scope for this pass (Leaflet-based, a separate,
// much larger geo feature) -- kept nullable/unused here rather than
// invented.
export type BannerStatus = 'placed' | 'needs_maintenance' | 'location_only' | 'being_replaced';

export interface Banner {
  id: string;
  name: string;
  area: string;
  status: BannerStatus;
  lat: number | null;
  lng: number | null;
  image: string | null;
  notes: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

// Real table `pricing_history` (confirmed live, port of v1's own
// apiLogPricingChange/apiLoadPricingHistory) -- every change to a real
// pricing/interest/tech-dimension config field is logged here, one row
// per field per save, so Management can see exactly who changed what and
// when. field is the raw Config key (e.g. 'fullPrice'); fieldLabel is the
// human caption shown in the UI (e.g. 'Full Plot price').
export interface PricingHistoryEntry {
  id: string;
  changedBy: string;
  changedByName: string;
  field: string;
  fieldLabel: string;
  oldValue: number;
  newValue: number;
  changedAt: string;
}

// A promo window Management sets up in Settings -- applies a discount/
// price increase ONLY to leads created within [dateFrom, dateTo], never
// to any lead already in the system (real user requirement, replacing an
// earlier "bulk-adjust every existing lead now" feature that did the
// opposite). AddLeadScreen looks these up by the lead's own date + plot
// type and auto-fills discount/unit price when one matches.
export interface PricingPromotion {
  id: string;
  plotType: 'Both' | PlotType;
  mode: 'discount' | 'increase';
  amountPerPlot: number;
  dateFrom: string;
  dateTo: string;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface NewBanner {
  name: string;
  area: string;
  status: BannerStatus;
  notes?: string;
  lat?: number | null;
  lng?: number | null;
  image?: string | null;
}

// Real table `banner_status_log` (confirmed live) -- v1's own real
// per-status-change audit trail (apiLogBannerStatusUpdate/
// apiLoadBannerStatusLog), one row per logged update, each carrying its
// own photos (jsonb array of data URIs) and free-text note. `imgScratch`
// (real column `img_scratch`) is a legacy scratch field from v1's own
// schema with no current write path -- read-mapped for completeness,
// never written by this app.
export interface BannerStatusLogEntry {
  id: string;
  bannerId: string;
  status: BannerStatus;
  note: string | null;
  images: string[];
  changedBy: string;
  changedByName: string;
  createdAt: string;
  imgScratch: string | null;
}

// Real table `fund_requests` -- the request/approval half of Office Desk's
// Expenses feature (confirmed live). Deliberately the ONLY half built this
// pass: index.html's own comment on apiInsertExpense/apiLoadDailyBalances
// explains why -- "Expense logging, daily cash balances and receipts move
// real money, so that side of this app stays live-only... Fund Requests is
// just a request/approval workflow (no cash actually changes hands until
// someone logs real spend against it later), so it's safe to demo" -- and
// web-next has no live-mode sign-in wired yet (a real, separate, already-
// documented gap), so a live-only feature couldn't be verified through the
// app's own UI at all right now. Log Expense/Daily Balance/Categories/
// Recurring/Dashboard tabs, and "Log actual spend" against an approved
// request, are all out of scope here for that reason, not an oversight.
export type FundRequestType = 'budget' | 'specific';
export type FundRequestStatus = 'pending' | 'approved' | 'rejected';

export interface FundRequest {
  id: string;
  type: FundRequestType;
  amount: number;
  purpose: string;
  requestedBy: string;
  requestedByName: string;
  status: FundRequestStatus;
  decidedBy: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  receiptData: string | null;
  receiptName: string | null;
  createdAt: string;
}

export interface NewFundRequest {
  type: FundRequestType;
  amount: number;
  purpose: string;
  receiptData?: string | null;
  receiptName?: string | null;
}

// Real table `weekly_visit_forms` -- one row per (week_start, visit_date),
// created on demand the moment anyone opens a day that doesn't have one yet
// (confirmed live: a real unique index on (week_start, visit_date)). This
// is Site Visit Authorization's Logistics half -- estimate vs. actual cost
// reconciliation for a day's site visits, then Management finalizes/
// approves. PDF generation and "remove a visit from this form" (which
// deletes the underlying site_visits row entirely, a more destructive
// action than fits this pass) are deliberately deferred, same scoping
// discipline as this session's other gap fixes.
export type WeeklyVisitFormStatus = 'Open' | 'Finalized';

export interface WeeklyVisitForm {
  id: string;
  weekStart: string;
  visitDate: string;
  vehicleRentalEst: number;
  driversTipEst: number;
  fuelEst: number;
  refreshmentEst: number;
  tntEst: number;
  vehicleRentalAct: number;
  driversTipAct: number;
  fuelAct: number;
  refreshmentAct: number;
  tntAct: number;
  siteManagerName: string | null;
  status: WeeklyVisitFormStatus;
  approvedBy: string | null;
  approvedByName: string | null;
  approvedSignature: string | null;
  finalizedAt: string | null;
}

export interface WeeklyVisitFormCostPatch {
  vehicleRentalEst?: number;
  driversTipEst?: number;
  fuelEst?: number;
  refreshmentEst?: number;
  tntEst?: number;
  vehicleRentalAct?: number;
  driversTipAct?: number;
  fuelAct?: number;
  refreshmentAct?: number;
  tntAct?: number;
  siteManagerName?: string | null;
}

// Real table `downloads` (confirmed live, both projects) -- every PDF/
// Excel a staff member generates gets logged here with its full file
// data (a base64 data URI), so it can be re-downloaded later without
// regenerating it. Real RLS (confirmed live): a manager sees every
// staff member's downloads, everyone else only their own.
export interface DownloadRecord {
  id: string;
  userKey: string;
  userName: string;
  filename: string;
  kind: string;
  fileData: string | null;
  createdAt: string;
}

// Real table `import_batches` (ported to staging 2026-09-03, already live
// on production -- see PHASE0_INVENTORY.md) -- the audit trail for every
// pipeline Excel import, archived by importPipelineExcel() (index.html:
// 20437-20448) so a human can review exactly what a bulk import did,
// row-level conflicts and errors included, rather than that detail only
// ever reaching a console.warn nobody but a developer would see.
export interface ImportBatch {
  id: string;
  importedBy: string;
  importedByName: string | null;
  sourceLabel: string;
  addedCount: number;
  updatedCount: number;
  unchangedCount: number;
  skippedCount: number;
  conflictCount: number;
  errorCount: number;
  paymentChangesIgnoredCount: number;
  details?: unknown;
  createdAt: string;
}

export interface NewImportBatch {
  sourceLabel: string;
  addedCount: number;
  updatedCount: number;
  unchangedCount: number;
  skippedCount: number;
  conflictCount: number;
  errorCount: number;
  paymentChangesIgnoredCount: number;
  details: unknown;
}

// Real tables `achievement_definitions` + `staff_achievements` (confirmed
// live, both projects, already fully seeded with the same 8 real
// definitions on staging as production -- no migration needed). RLS
// (confirmed live): any authenticated staff member can read both tables;
// only a manager can create/edit/delete a definition; a staff member can
// only self-award their own earned row (or a manager can award on their
// behalf), enforced by a real unique(staff_key, achievement_id)
// constraint that makes re-awarding an already-earned one a silent
// no-op.
export type AchievementCriteriaType = 'tasksCompleted' | 'siteVisits' | 'dealsClosedYear' | 'onTimeDays' | 'daysAttended' | 'referralConversions' | 'todosCompleted' | 'totalCollected';

export interface AchievementDef {
  id: string;
  key: string;
  label: string;
  description: string | null;
  icon: string | null;
  criteriaType: AchievementCriteriaType;
  criteriaConfig: { threshold?: number };
  points: number;
  active: boolean;
  createdAt: string;
}

export interface StaffAchievement {
  id: string;
  staffKey: string;
  staffName: string;
  achievementId: string;
  earnedAt: string;
  progress: { value?: number; threshold?: number } | null;
}

// Real table `audit_events` + RPC `record_audit_event` (ported to staging
// 2026-09-03 -- see web-next/docs/PHASE0_INVENTORY.md; already live on
// production since 2026-08-22). RLS: manager-only SELECT, zero INSERT
// policies -- the RPC (SECURITY DEFINER) is the sole write path, so there's
// no client-writable `id`/`actorKey`/`createdAt` to worry about matching.
export type AuditCategory = 'audit' | 'integrity' | 'error' | 'cron';
export type AuditSeverity = 'info' | 'warning' | 'critical';

export interface AuditEvent {
  id: number;
  createdAt: string;
  category: AuditCategory;
  eventType: string;
  severity: AuditSeverity;
  actorKey: string | null;
  actorName: string | null;
  entityType: string | null;
  entityId: string | null;
  summary: string;
  detail: Record<string, unknown> | null;
  source: string;
}

// Real table `report_archive` (ported to staging 2026-09-03 -- already live
// on production, written by daily-management-report on every run, success
// or failure). Master Rebuild Spec Section 3.5's System Health checklist
// names "last successful report" explicitly; `retry_count` exists on the
// real table for a future manual-retry feature but isn't incremented by
// anything yet (no screen calls it) -- present here so the type matches the
// real column, not because a retry action exists to wire it to.
export interface ReportArchiveEntry {
  id: string;
  reportDate: string;
  generatedAt: string;
  recipients: string | null;
  generationStatus: 'success' | 'failed';
  emailStatus: 'sent' | 'skipped' | 'failed' | null;
  checksum: string | null;
  errorDetail: string | null;
  retryCount: number;
}

// Real table `backups` + RPCs `create_backup`/`restore_backup` (confirmed
// live on both projects -- production runs these on a 6am/2pm/10pm cron,
// staging already carries 30 real rows from the same schedule). Deliberately
// excludes `snapshot` (the actual JSONB table dump) -- that's only ever
// read server-side by restore_backup() via its own `p_backup_id`, never
// meant to round-trip through the client.
export interface BackupRecord {
  id: string;
  createdAt: string;
  triggerType: string;
  triggeredBy: string | null;
  triggeredByName: string | null;
  tableCounts: Record<string, number>;
  sizeBytes: number;
  checksum: string;
}

// Real tables `permissions`/`role_permissions`/`staff_permission_overrides`
// + RPC `has_permission` (staging only, ported 2026-09-03 -- see
// PHASE0_INVENTORY.md §4). Replaces the hardcoded staff-key arrays this
// session found baked into payments/contracts/allocations/site_visits RLS
// (all four already cut over on staging). The UI only ever exposes a
// binary "does this staff member have this permission" toggle per cell --
// the schema also supports an explicit `granted:false` override (distinct
// from "no override, falls back to role default"), but that's a real edge
// case with no UI need yet, so grant()/clear() below are the only two
// actions surfaced (matching set_permission_override/clear_permission_override).
export interface PermissionDef {
  key: string;
  label: string;
  description: string | null;
}

export interface PermissionOverride {
  staffKey: string;
  permissionKey: string;
  granted: boolean;
  grantedBy: string | null;
  grantedAt: string;
}
