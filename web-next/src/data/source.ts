import type { AttendanceRecord, ChatConversation, ChatMessage, Complaint, ComplaintUpdate, Config, ContractRequest, Enquiry, Lead, LeaderboardRow, LeaveRequest, ManagerOverview, Memo, NewComplaint, NewContractRequest, NewEnquiry, NewLead, NewLeaveRequest, NewMemo, NewPaymentEntry, NewReferral, NewSiteVisit, Payment, PaymentDecisionResult, PaymentStatus, Plot, Profile, Referral, ScheduleItem, ScheduleItemStatus, SignInInput, SignOutInput, SiteVisit, SveInviteRecord, SveVisitStatus, StreakRow } from '../types/domain';
import { demoLoad, demoSave } from './demo/store';
import { deriveStageFromPayment, computeGrandTotal, STAGES } from '../features/pipeline/lib/pipelineLogic';
import { getSupabaseClient } from './client';
import {
  mapAttendanceRow,
  mapChatMessageRow,
  mapComplaintRow,
  mapContractRequestRow,
  mapEnquiryRow,
  mapLeaderboardRawRow,
  mapLeadRow,
  mapLeaveRequestRow,
  mapMemoRow,
  mapPaymentRow,
  mapPlotRow,
  mapProfileRow,
  mapReferralRow,
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
    listPending(): Promise<Payment[]>;
    create(input: NewPaymentEntry, leadName: string, leadAgentKey: string, requestedStatus: PaymentStatus): Promise<Payment>;
    approve(paymentId: string, decidedBy: string, decidedByName: string): Promise<PaymentDecisionResult>;
    decline(paymentId: string, decidedBy: string, decidedByName: string, reason?: string): Promise<void>;
  };
  scheduleItems: {
    listForAgentOnDate(agentKey: string, date: string): Promise<ScheduleItem[]>;
    create(agentKey: string, date: string, title: string): Promise<ScheduleItem>;
    updateStatus(id: string, status: ScheduleItemStatus): Promise<ScheduleItem>;
  };
  streaks: {
    history(staffKey: string, days: number): Promise<StreakRow[]>;
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
  plots: {
    list(): Promise<Plot[]>;
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
    listForAgent(agentKey: string): Promise<Referral[]>;
    create(agentKey: string, input: NewReferral): Promise<Referral>;
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
    decide(id: string, approve: boolean, decidedBy: string, decidedByName: string): Promise<LeaveRequest>;
  };
  // Real table `attendance_log` (confirmed live, currently 0 production
  // rows), one row per (staff_key, work_date) enforced by a real unique
  // index. No RPC exists -- signIn/signOut here do the "does today's row
  // exist" / "is sign_out_at already set" checks the app itself must make
  // instead of relying on a server-side function. See AttendanceRecord's
  // comment in types/domain.ts for why late/off-site are self-reported
  // rather than computed.
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
    send(myKey: string, myName: string, otherKey: string, body: string): Promise<ChatMessage>;
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
        return demoLoad().leads.filter((l) => l.agent === agentKey);
      },
      async listAll() {
        return demoLoad().leads;
      },
      async create(agentKey, input) {
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
          amtPaid: input.amtPaid,
          grandTotal,
          stage: deriveStageFromPayment(input.amtPaid, grandTotal),
          notes: input.notes,
        };
        const db = demoLoad();
        db.leads.push(lead);
        demoSave();
        return lead;
      },
      async get(agentKey, id) {
        return demoLoad().leads.find((l) => l.agent === agentKey && l.id === id);
      },
      async listCompany() {
        return demoLoad().leads.filter((l) => l.agent === 'company');
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
    },
    payments: {
      async listForAgent(agentKey) {
        return demoLoad().payments.filter((p) => p.agentKey === agentKey);
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
    },
    scheduleItems: {
      async listForAgentOnDate(agentKey, date) {
        return demoLoad().scheduleItems.filter((s) => s.assignedTo === agentKey && s.date === date);
      },
      async create(agentKey, date, title) {
        const item: ScheduleItem = {
          id: Math.random().toString(36).slice(2, 10),
          kind: 'todo',
          ownerKey: agentKey,
          assignedTo: agentKey,
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
    },
    streaks: {
      async history(staffKey, days) {
        const from = new Date();
        from.setDate(from.getDate() - days);
        const fromIso = from.toISOString().slice(0, 10);
        return demoLoad().streaks.filter((s) => s.staffKey === staffKey && s.date >= fromIso);
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
      async listForAgent(agentKey) {
        const db = demoLoad();
        return db.referrals.filter((r) => r.referrerLeadId && db.leads.some((l) => l.id === r.referrerLeadId && l.agent === agentKey));
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
        };
        const db = demoLoad();
        db.leaveRequests.push(request);
        demoSave();
        return request;
      },
      async decide(id, approve, decidedBy, decidedByName) {
        const db = demoLoad();
        const index = db.leaveRequests.findIndex((r) => r.id === id);
        if (index === -1) throw new Error('Leave request not found');
        const updated: LeaveRequest = { ...db.leaveRequests[index], status: approve ? 'approved' : 'declined', decidedAt: new Date().toISOString(), decidedBy, decidedByName };
        db.leaveRequests = [...db.leaveRequests.slice(0, index), updated, ...db.leaveRequests.slice(index + 1)];
        demoSave();
        return updated;
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
          signInPhoto: null,
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
        const overrides = demoLoad().staffActiveOverrides;
        return DEMO_STAFF.map((s) => (s.key in overrides ? { ...s, active: overrides[s.key] } : s)).filter((s) => s.active);
      },
      async listAll() {
        const overrides = demoLoad().staffActiveOverrides;
        return DEMO_STAFF.map((s) => (s.key in overrides ? { ...s, active: overrides[s.key] } : s));
      },
      async setActive(key, active) {
        const db = demoLoad();
        db.staffActiveOverrides = { ...db.staffActiveOverrides, [key]: active };
        demoSave();
        const staff = DEMO_STAFF.find((s) => s.key === key);
        if (!staff) throw new Error('Staff not found');
        return { ...staff, active };
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
      async send(myKey, myName, otherKey, body) {
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
        const grandTotal = computeGrandTotal(input.unitPrice, input.noPlots);
        const stage = deriveStageFromPayment(input.amtPaid, grandTotal);
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
            amt_paid: input.amtPaid,
            grand_total: grandTotal,
            balance: Math.max(grandTotal - input.amtPaid, 0),
            stage,
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
    },
    payments: {
      async listForAgent(agentKey) {
        const { data, error } = await requireClient().from('payments').select('*').eq('agent_key', agentKey);
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
    },
    scheduleItems: {
      async listForAgentOnDate(agentKey, date) {
        const { data, error } = await requireClient().from('schedule_items').select('*').eq('kind', 'todo').eq('assigned_to', agentKey).eq('item_date', date);
        if (error) throw error;
        return (data ?? []).map(mapScheduleItemRow);
      },
      async create(agentKey, date, title) {
        const { data, error } = await requireClient()
          .from('schedule_items')
          .insert({ kind: 'todo', owner_key: agentKey, assigned_to: agentKey, item_date: date, title, status: 'open' })
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
      async decide(id, approve, decidedBy, decidedByName) {
        const { data, error } = await requireClient()
          .from('leave_requests')
          .update({ status: approve ? 'approved' : 'declined', decided_at: new Date().toISOString(), decided_by: decidedBy, decided_by_name: decidedByName })
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        return mapLeaveRequestRow(data);
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
        const { data, error } = await requireClient().from('profiles').select('agent_key,name,role,email,active').eq('active', true);
        if (error) throw error;
        return (data ?? []).map(mapProfileRow);
      },
      async listAll() {
        const { data, error } = await requireClient().from('profiles').select('agent_key,name,role,email,active');
        if (error) throw error;
        return (data ?? []).map(mapProfileRow);
      },
      async setActive(key, active) {
        const { data, error } = await requireClient().from('profiles').update({ active }).eq('agent_key', key).select().single();
        if (error) throw error;
        return mapProfileRow(data);
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
        const [leadsRes, complaintsRes, visitsRes, staffRes] = await Promise.all([
          client.from('leads').select('*'),
          client.from('complaints').select('status'),
          client.from('site_visits').select('id'),
          client.from('profiles').select('agent_key,name,role,email').eq('active', true),
        ]);
        if (leadsRes.error) throw leadsRes.error;
        if (complaintsRes.error) throw complaintsRes.error;
        if (visitsRes.error) throw visitsRes.error;
        if (staffRes.error) throw staffRes.error;

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
      async send(myKey, myName, otherKey, body) {
        const { data, error } = await requireClient()
          .from('messages')
          .insert({ sender_key: myKey, sender_name: myName, recipient_key: otherKey, body })
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
