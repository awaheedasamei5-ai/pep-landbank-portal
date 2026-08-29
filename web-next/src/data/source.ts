import type { Config, Lead, Payment, ScheduleItem, StreakRow } from '../types/domain';
import { demoLoad } from './demo/store';

// Swappable data-source seam -- every feature hook calls through this, never
// branching on demo-vs-live itself (mirrors index.html's api*() functions,
// which are the only place `if(DEMO_MODE)` ever appears; the UI layer never
// branches). Phase 1 only wires the demo implementation -- live Supabase
// wiring is explicitly deferred to a later phase, but the interface is real
// now so that seam never has to be retrofitted later.
export interface DataSource {
  leads: {
    listForAgent(agentKey: string): Promise<Lead[]>;
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
