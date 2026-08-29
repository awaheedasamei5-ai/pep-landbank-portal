import type { Config, Lead, NewLead, Payment, ScheduleItem, StreakRow } from '../types/domain';
import { demoLoad, demoSave } from './demo/store';
import { deriveStageFromPayment, computeGrandTotal } from '../features/pipeline/lib/pipelineLogic';

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
  };
  streaks: {
    history(staffKey: string, days: number): Promise<StreakRow[]>;
  };
  config: {
    get(): Promise<Config>;
  };
}

let cached: DataSource | null = null;

export function getDataSource(demoMode: boolean): DataSource {
  if (!demoMode) {
    throw new Error('Live Supabase data source is not wired yet (deferred past Phase 1) -- stay in demo mode.');
  }
  if (!cached) {
    // Lazy import keeps the demo module out of any future live-only bundle
    // path once live wiring exists.
    cached = createDemoDataSource();
  }
  return cached;
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
  };
}
