import type { DemoDb } from './store';
import { isoPlusDays, today } from '../../shared/lib/format';

// Small, hand-crafted (not a full port of index.html's much larger
// DEMO_PIPELINES fixture set) but realistic seed -- enough real leads/
// payments/todos/streak-history for the Home/StreakCard slice to compute
// genuinely varied mood states, not just an empty-state stub. Widen this as
// later phases port more screens.

const AGENT_KEY = 'elias';

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function seedDemo(): DemoDb {
  const t = today();

  const leads: DemoDb['leads'] = [
    { id: uid(), agent: AGENT_KEY, name: 'Mercy Owusu', date: isoPlusDays(t, -18), amtPaid: 24000, grandTotal: 48000, stage: '2A' },
    { id: uid(), agent: AGENT_KEY, name: 'Kwame Asante', date: isoPlusDays(t, -40), amtPaid: 60000, grandTotal: 60000, stage: 'paid' },
    { id: uid(), agent: AGENT_KEY, name: 'Abena Boateng', date: isoPlusDays(t, -5), amtPaid: 0, grandTotal: 36000, stage: '1' },
  ];

  const payments: DemoDb['payments'] = [
    { id: uid(), leadId: leads[0].id, agentKey: AGENT_KEY, amount: 24000, date: isoPlusDays(t, -18) },
    { id: uid(), leadId: leads[1].id, agentKey: AGENT_KEY, amount: 60000, date: isoPlusDays(t, -3) },
  ];

  // Today's to-do list: one done, one still open -- lands on the 'halfway'
  // mood state, a good first proof since it's a genuinely computed value,
  // not a static placeholder.
  const scheduleItems: DemoDb['scheduleItems'] = [
    { id: uid(), kind: 'todo', ownerKey: AGENT_KEY, assignedTo: AGENT_KEY, date: t, status: 'closed', title: 'Follow up with Mercy on balance' },
    { id: uid(), kind: 'todo', ownerKey: AGENT_KEY, assignedTo: AGENT_KEY, date: t, status: 'open', title: 'Call Abena about site visit' },
  ];

  // Last 6 days met (today intentionally left out of history -- the app
  // computes today's own row from live todo/lead/visit activity, matching
  // how index.html's evaluateMyStreak() works), giving a real 6-day streak.
  const streaks: DemoDb['streaks'] = [];
  for (let i = 1; i <= 6; i++) {
    streaks.push({ staffKey: AGENT_KEY, date: isoPlusDays(t, -i), dayMet: true });
  }

  const config: DemoDb['config'] = {
    workEndTime: '17:00',
    targetPlotsPerMonth: 2,
    targets: { [AGENT_KEY]: 600000 },
  };

  return { version: 1, leads, payments, scheduleItems, streaks, config };
}

export { AGENT_KEY as DEMO_AGENT_KEY };
