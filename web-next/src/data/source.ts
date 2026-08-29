import type { Config, Enquiry, Lead, NewEnquiry, NewLead, NewReferral, NewSiteVisit, Payment, Plot, Referral, ScheduleItem, ScheduleItemStatus, SiteVisit, StreakRow } from '../types/domain';
import { demoLoad, demoSave } from './demo/store';
import { deriveStageFromPayment, computeGrandTotal } from '../features/pipeline/lib/pipelineLogic';
import { getSupabaseClient } from './client';
import { mapEnquiryRow, mapLeadRow, mapPaymentRow, mapPlotRow, mapReferralRow, mapScheduleItemRow, mapSiteVisitRow, mapStreakRow, mapConfigRow, domainStatusToDb } from './mappers';

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
  };
}
