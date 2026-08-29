// App-level domain types -- deliberately only the fields Phase 1's Home/
// StreakCard slice actually touches. Widened as later phases port more of
// index.html's DB shape (leads/payments/schedule_items/etc.).

export type Role = 'agent' | 'manager';

export interface Profile {
  key: string;
  name: string;
  role: Role;
  email?: string;
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

export interface Payment {
  id: string;
  leadId: string;
  agentKey: string;
  amount: number;
  date: string;
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

export interface Config {
  workEndTime: string;
  targetPlotsPerMonth: number;
  targets: Record<string, number>;
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
