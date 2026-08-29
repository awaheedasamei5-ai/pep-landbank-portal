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
}

export interface NewLead {
  name: string;
  contact: string;
  plotType: PlotType;
  noPlots: number;
  unitPrice: number;
  paymentPlan: PaymentPlan;
  amtPaid: number;
  notes?: string;
}

// Real distinct values seen on production's payment_method column
// (index.html's PAYMENT_METHODS constant, confirmed still the live set).
export type PaymentMethod = 'Ecobank' | 'Stanbic Bank' | 'MTN MoMo' | 'Vodafone Cash' | 'Hubtel' | 'Cash' | 'Other';
export type PaymentStatus = 'pending' | 'approved' | 'declined';

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
}

export interface NewPaymentEntry {
  leadId: string;
  amount: number;
  paymentDate?: string;
  paymentMethod?: PaymentMethod;
  note?: string;
}

export interface PaymentDecisionResult {
  decidedBy: string;
  decidedByName: string;
  newAmtPaid: number;
  newBalance: number;
}

export type ScheduleItemStatus = 'open' | 'closed' | 'cancelled' | 'rescheduled';

export interface ScheduleItem {
  id: string;
  kind: 'todo' | 'task';
  ownerKey: string;
  assignedTo: string;
  date: string;
  status: ScheduleItemStatus;
  title: string;
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

export type PlotStatus = 'Available' | 'Reserved' | 'Sold';
export type PlotUnitKind = 'whole' | 'half';

// Real RLS on this table (confirmed live) restricts read/write to manager
// or specifically the 'elias'/'emmanuel' staff keys -- not every agent.
// This screen should only ever be reachable by those roles/keys, matching
// how Sales Desk gates it.
export interface Plot {
  id: string;
  site: string;
  plotNumber: string;
  plotType: PlotType;
  status: PlotStatus;
  price: number | null;
  clientName: string | null;
  clientContact: string | null;
  agentKey: string | null;
  notes: string | null;
  unitKind: PlotUnitKind;
  parentPlotId: string | null;
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
  source?: string;
  accompanied?: string;
  notes?: string;
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
// There's also no shift-start-time or office-geofence-radius config
// anywhere in the schema -- late/off-site are real columns but nothing
// computes them automatically, so they're self-reported (a checkbox +
// reason), not derived from geolocation math that isn't backed by any
// real reference point.
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
}

export interface SignInInput {
  lat?: number;
  lng?: number;
  offSite?: boolean;
  reason?: string;
  late?: boolean;
  lateReason?: string;
}

export interface SignOutInput {
  lat?: number;
  lng?: number;
  offSite?: boolean;
  reason?: string;
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
}

// A site visit joined with its invite/submission status, if any --
// computed client-side (no RPC needed here, this is a normal
// authenticated staff read across 3 tables RLS already scopes correctly).
export interface SveVisitStatus {
  siteVisit: SiteVisit;
  invite: SveInviteRecord | null;
  submission: SveSubmissionRecord | null;
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

// Real table `leave_requests` (confirmed live). Unusually open SELECT RLS
// (`auth.uid() IS NOT NULL`, not agent/manager-scoped) -- any signed-in
// staff member sees every request company-wide, matching index.html's own
// cross-staff "who's on leave" checks elsewhere in the app. UPDATE is own
// row OR manager. Deliberately the request/decide subset of a much larger
// real feature: the annual-calendar "planned" (private, not yet sent)
// stage, emergency-leave, deduct-quota toggle, reschedule flow, and the
// signature-on-approval requirement (index.html calls getStaffSignature(),
// a per-staff digital signature file this app has no capture UI for yet)
// are all out of scope -- every request here goes straight to 'pending',
// and an approval leaves `decidedSignature` null rather than faking one.
export interface LeaveRequest {
  id: string;
  agentKey: string;
  agentName: string;
  year: number;
  dates: string[];
  daysCount: number;
  letterText: string | null;
  status: 'pending' | 'approved' | 'declined';
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  decidedByName: string | null;
}

export interface NewLeaveRequest {
  dates: string[];
  letterText?: string;
}
