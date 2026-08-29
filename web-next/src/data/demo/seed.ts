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
    { id: uid(), agent: AGENT_KEY, name: 'Mercy Owusu', contact: '0240758072', date: isoPlusDays(t, -18), plotType: 'Half Plot', noPlots: 1, unitPrice: 48000, paymentPlan: '6 Months', amtPaid: 24000, grandTotal: 48000, stage: '2B' },
    { id: uid(), agent: AGENT_KEY, name: 'Kwame Asante', contact: '0201234567', date: isoPlusDays(t, -40), plotType: 'Full Plot', noPlots: 1, unitPrice: 60000, paymentPlan: 'Full Payment', amtPaid: 60000, grandTotal: 60000, stage: '4' },
    { id: uid(), agent: AGENT_KEY, name: 'Abena Boateng', contact: '0559876543', date: isoPlusDays(t, -5), plotType: 'Full Plot', noPlots: 1, unitPrice: 36000, paymentPlan: '12 Months', amtPaid: 0, grandTotal: 36000, stage: '1' },
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

  // Real access to this resource is manager + elias/emmanuel-only (RLS
  // confirmed live) -- AGENT_KEY here already being 'elias' matches that.
  // Includes one half-plot subdivision (parentPlotId), the real pattern
  // production's split_plot_for_half_sale() function creates.
  const wholePlotId = uid();
  const plots: DemoDb['plots'] = [
    { id: uid(), site: 'Royal Palm Enclave', plotNumber: 'A-01', plotType: 'Full Plot', status: 'Sold', price: 60000, clientName: 'Kwame Asante', clientContact: '0201234567', agentKey: AGENT_KEY, notes: null, unitKind: 'whole', parentPlotId: null },
    { id: uid(), site: 'Royal Palm Enclave', plotNumber: 'A-02', plotType: 'Full Plot', status: 'Reserved', price: 36000, clientName: 'Abena Boateng', clientContact: '0559876543', agentKey: AGENT_KEY, notes: null, unitKind: 'whole', parentPlotId: null },
    { id: uid(), site: 'Royal Palm Enclave', plotNumber: 'A-03', plotType: 'Full Plot', status: 'Available', price: 60000, clientName: null, clientContact: null, agentKey: null, notes: null, unitKind: 'whole', parentPlotId: null },
    { id: wholePlotId, site: 'Royal Palm Enclave', plotNumber: 'B-01', plotType: 'Full Plot', status: 'Available', price: 96000, clientName: null, clientContact: null, agentKey: null, notes: 'Split into two half plots', unitKind: 'whole', parentPlotId: null },
    { id: uid(), site: 'Royal Palm Enclave', plotNumber: 'B-01-H1', plotType: 'Half Plot', status: 'Reserved', price: 48000, clientName: 'Mercy Owusu', clientContact: '0240758072', agentKey: AGENT_KEY, notes: null, unitKind: 'half', parentPlotId: wholePlotId },
    { id: uid(), site: 'Royal Palm Enclave', plotNumber: 'B-01-H2', plotType: 'Half Plot', status: 'Available', price: 48000, clientName: null, clientContact: null, agentKey: null, notes: null, unitKind: 'half', parentPlotId: wholePlotId },
  ];

  // Matches the real shape/style of production's actual site_visits rows
  // (Royal Palm Enclave, Tsopoli site, free-text visit_time slots,
  // status always 'Pending' -- confirmed against real sampled data).
  const siteVisits: DemoDb['siteVisits'] = [
    {
      id: uid(),
      agentKey: AGENT_KEY,
      agentName: 'Elias Torgbuivi',
      name: 'Mercy Owusu',
      contact: '0240758072',
      site: 'Royal Palm Enclave',
      plot: 'B-01-H1',
      visitDate: isoPlusDays(t, -12),
      visitTime: 'Saturday 11:00am',
      people: 2,
      transport: 'Company bus',
      pickup: 'Tsopoli junction',
      placeOfWork: 'Ministry of Health',
      position: 'Nurse',
      nationality: 'Ghanaian',
      purpose: 'First site inspection before committing to half-plot deposit',
      discussionSoFar: 'Walked the half-plot subdivision, explained payment plan options',
      keyUnderstanding: 'Understands 6-month plan, wants to confirm with spouse',
      feedbackAfter: null,
      keyNextSteps: null,
      source: 'Referral',
      accompanied: 'Spouse',
      notes: null,
      status: 'Pending',
      createdAt: isoPlusDays(t, -12),
    },
    {
      id: uid(),
      agentKey: AGENT_KEY,
      agentName: 'Elias Torgbuivi',
      name: 'Abena Boateng',
      contact: '0559876543',
      site: 'Royal Palm Enclave',
      plot: 'A-02',
      visitDate: isoPlusDays(t, -3),
      visitTime: 'Sunday 2:00pm',
      people: 1,
      transport: 'Self-drive',
      pickup: null,
      placeOfWork: null,
      position: null,
      nationality: 'Ghanaian',
      purpose: 'Second visit, ready to reserve',
      discussionSoFar: 'Confirmed plot boundaries and 12-month payment plan',
      keyUnderstanding: 'Ready to pay deposit this week',
      feedbackAfter: null,
      keyNextSteps: null,
      source: 'Walk-in',
      accompanied: null,
      notes: null,
      status: 'Pending',
      createdAt: isoPlusDays(t, -3),
    },
  ];

  // referrerLeadId deliberately points at one of the leads above -- matches
  // the real RLS shape (an agent only ever sees a referral whose
  // referrer_lead_id belongs to one of their own leads), so the demo
  // listForAgent() filter behaves identically to production.
  const referrals: DemoDb['referrals'] = [
    {
      id: uid(),
      referrerLeadId: leads[0].id,
      referrerName: leads[0].name,
      referrerContact: leads[0].contact,
      referredName: 'Yaw Danso',
      referredContact: '0247001122',
      referredLocation: 'Tema',
      referredNoPlots: 1,
      referredLeadId: null,
      status: 'Pending',
      pointsAwarded: 0,
      source: 'staff',
      createdByKey: AGENT_KEY,
      createdAt: isoPlusDays(t, -6),
      clearedAt: null,
      archived: false,
    },
  ];

  // Matches real production's actual shape (confirmed live): `types` is a
  // real comma-joined free-text column, not an array/enum; `follow` is a
  // free-text "Yes"/"No", not a boolean.
  const enquiries: DemoDb['enquiries'] = [
    {
      id: uid(),
      agentKey: AGENT_KEY,
      agentName: 'Elias Torgbuivi',
      name: 'Justice Amankwah',
      contact: '0533284707',
      location: null,
      types: 'Plot Availability,Site Visit,Price',
      plot: 'Half Plot',
      source: 'Phone Call',
      details: 'Wants to know availability, price, and site visit days',
      follow: 'Yes',
      followDate: isoPlusDays(t, 2),
      createdAt: isoPlusDays(t, -1),
    },
  ];

  return { version: 5, leads, payments, scheduleItems, streaks, config, plots, siteVisits, referrals, enquiries };
}

export { AGENT_KEY as DEMO_AGENT_KEY };
