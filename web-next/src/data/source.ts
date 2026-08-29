import type { AttendanceRecord, Config, Enquiry, Lead, ManagerOverview, Memo, NewEnquiry, NewLead, NewMemo, NewReferral, NewSiteVisit, Payment, Plot, Profile, Referral, ScheduleItem, ScheduleItemStatus, SignInInput, SignOutInput, SiteVisit, SveInviteRecord, SveVisitStatus, StreakRow } from '../types/domain';
import { demoLoad, demoSave } from './demo/store';
import { deriveStageFromPayment, computeGrandTotal, STAGES } from '../features/pipeline/lib/pipelineLogic';
import { getSupabaseClient } from './client';
import {
  mapAttendanceRow,
  mapEnquiryRow,
  mapLeadRow,
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
  { key: 'management', name: 'Management', role: 'manager' },
  { key: 'elias', name: 'Elias Torgbuivi', role: 'agent' },
  { key: 'emmanuel', name: 'Emmanuel Owusu', role: 'agent' },
  { key: 'elizabeth', name: 'Elizabeth Misiame', role: 'agent' },
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
    create(agentKey: string, input: NewLead): Promise<Lead>;
    get(agentKey: string, id: string): Promise<Lead | undefined>;
    recordPayment(agentKey: string, id: string, amount: number, date: string): Promise<Lead>;
  };
  payments: {
    listForAgent(agentKey: string): Promise<Payment[]>;
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
    create(agentKey: string, agentName: string, input: NewEnquiry): Promise<Enquiry>;
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
      // Mirrors index.html's saveNewLead-style "log a payment, recompute
      // stage from the new total" pattern -- the lead's amtPaid and derived
      // stage move together, atomically, so a UI can never show a payment
      // logged against a lead whose stage badge hasn't caught up.
      async recordPayment(agentKey, id, amount, date) {
        const db = demoLoad();
        const lead = db.leads.find((l) => l.agent === agentKey && l.id === id);
        if (!lead) throw new Error('Lead not found');
        lead.amtPaid += amount;
        lead.stage = deriveStageFromPayment(lead.amtPaid, lead.grandTotal);
        db.payments.push({ id: Math.random().toString(36).slice(2, 10), leadId: id, agentKey, amount, date });
        demoSave();
        return lead;
      },
    },
    payments: {
      async listForAgent(agentKey) {
        return demoLoad().payments.filter((p) => p.agentKey === agentKey);
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
        return DEMO_STAFF;
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
  };
}

// Real Supabase queries, verified against the actual production schema
// (columns, types, and RLS policies all confirmed live via the Supabase
// MCP tools -- not guessed). Points at whichever project client.ts is
// configured for, which during this build phase is deliberately the
// STAGING project, never production.
//
// leads.recordPayment is a deliberate exception: production's real payment
// flow is NOT a simple insert. schedule_items status is 'pending' by
// default there and only a manager can call the approve_payment/
// decline_payment RPC functions (SECURITY DEFINER, confirmed via
// pg_get_functiondef) -- approving atomically updates the lead's
// amt_paid/balance AND can auto-create an allocation_requests row once
// 30% is paid. A naive direct insert here would silently bypass that
// approval workflow and the audit trail (activity_log/audit_events) it
// writes -- exactly the class of integrity bug flagged in this project's
// own history. Wiring this correctly is a distinct, focused piece of work,
// not a corner to cut inside this pass.
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
      async recordPayment() {
        throw new Error(
          'Live payment recording is intentionally not wired yet -- production payments go through a manager approval workflow ' +
            '(approve_payment/decline_payment RPCs), not a direct insert. See the comment above createLiveDataSource() for the full reasoning.',
        );
      },
    },
    payments: {
      async listForAgent(agentKey) {
        const { data, error } = await requireClient().from('payments').select('*').eq('agent_key', agentKey);
        if (error) throw error;
        return (data ?? []).map(mapPaymentRow);
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
        const { data, error } = await requireClient().from('profiles').select('agent_key,name,role,email').eq('active', true);
        if (error) throw error;
        return (data ?? []).map(mapProfileRow);
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
  };
}
