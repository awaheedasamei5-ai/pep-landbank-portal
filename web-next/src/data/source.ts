import type { Config, Lead, NewLead, Payment, Plot, ScheduleItem, ScheduleItemStatus, StreakRow } from '../types/domain';
import { demoLoad, demoSave } from './demo/store';
import { deriveStageFromPayment, computeGrandTotal } from '../features/pipeline/lib/pipelineLogic';
import { getSupabaseClient } from './client';
import { mapLeadRow, mapPaymentRow, mapPlotRow, mapScheduleItemRow, mapStreakRow, mapConfigRow, domainStatusToDb } from './mappers';

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
  };
}
