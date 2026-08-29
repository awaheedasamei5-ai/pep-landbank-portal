import type { DemoDb } from './store';
import { isoPlusDays, today } from '../../shared/lib/format';
import { DEFAULT_LEADERBOARD_WEIGHTS } from '../mappers';

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
    // Other agents' leads -- not visible to the logged-in demo agent's own
    // screens (listForAgent still filters correctly), only exist so
    // Manager Home's company-wide overview has real multi-agent shape to
    // aggregate instead of a single flat bar.
    { id: uid(), agent: 'emmanuel', name: 'Yaw Sarpong', contact: '0271122334', date: isoPlusDays(t, -25), plotType: 'Full Plot', noPlots: 1, unitPrice: 60000, paymentPlan: '9 Months', amtPaid: 45000, grandTotal: 60000, stage: '3' },
    { id: uid(), agent: 'emmanuel', name: 'Efua Ansah', contact: '0248877665', date: isoPlusDays(t, -60), plotType: 'Full Plot', noPlots: 2, unitPrice: 60000, paymentPlan: 'Full Payment', amtPaid: 120000, grandTotal: 120000, stage: '4' },
    { id: uid(), agent: 'elizabeth', name: 'Kofi Mensah', contact: '0559001122', date: isoPlusDays(t, -9), plotType: 'Half Plot', noPlots: 1, unitPrice: 48000, paymentPlan: '3 Months', amtPaid: 16000, grandTotal: 48000, stage: '2A' },
    { id: uid(), agent: 'elizabeth', name: 'Ama Serwaa', contact: '0201998877', date: isoPlusDays(t, -33), plotType: 'Full Plot', noPlots: 1, unitPrice: 60000, paymentPlan: '6 Months', amtPaid: 0, grandTotal: 60000, stage: 'Lost' },
    // 'company' -- clients who came to the company directly, not through a
    // specific agent (real agent_key='company' pattern, confirmed live).
    // Appended at the end so existing leads[N] index references elsewhere
    // in this file (Commission's seed) stay correct.
    { id: uid(), agent: 'company', name: 'Nana Yeboah', contact: '0244009988', date: isoPlusDays(t, -3), plotType: 'Full Plot', noPlots: 1, unitPrice: 60000, paymentPlan: 'Full Payment', amtPaid: 0, grandTotal: 60000, stage: '1', leadSource: 'Facebook' },
    { id: uid(), agent: 'company', name: 'Adjoa Frimpong', contact: '0559112233', date: isoPlusDays(t, -8), plotType: 'Half Plot', noPlots: 1, unitPrice: 48000, paymentPlan: '6 Months', amtPaid: 0, grandTotal: 48000, stage: '1' },
  ];

  const payments: DemoDb['payments'] = [
    { id: uid(), leadId: leads[0].id, agentKey: AGENT_KEY, amount: 24000, date: isoPlusDays(t, -18), clientName: leads[0].name, paymentMethod: 'MTN MoMo', status: 'approved', decidedBy: null, decidedByName: null, decidedAt: null, receiptNumber: null, note: null },
    { id: uid(), leadId: leads[1].id, agentKey: AGENT_KEY, amount: 60000, date: isoPlusDays(t, -3), clientName: leads[1].name, paymentMethod: 'Ecobank', status: 'approved', decidedBy: null, decidedByName: null, decidedAt: null, receiptNumber: null, note: null },
    // A pending payment 'elias' logged on emmanuel's lead -- exercises the
    // full real workflow in demo mode: shows in Pending Approvals for the
    // manager persona, and does NOT show up in leads[3]'s amtPaid above
    // (45000) until approved, matching the real rule that a pending entry
    // touches nothing on the lead yet.
    { id: uid(), leadId: leads[3].id, agentKey: 'emmanuel', amount: 15000, date: isoPlusDays(t, -1), clientName: leads[3].name, paymentMethod: 'Cash', status: 'pending', decidedBy: null, decidedByName: null, decidedAt: null, receiptNumber: null, note: 'Logged on emmanuel\'s behalf while he was on a site visit' },
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
    leaderboardWeights: DEFAULT_LEADERBOARD_WEIGHTS,
    commissionFullCap: 1000,
    commissionHalfCap: 500,
    commissionPoolPerPlot: 500,
    fullPrice: 48000,
    halfPrice: 24000,
    fullDiscount: 0,
    halfDiscount: 0,
    int3: 750,
    int6: 1500,
    int9: 2250,
    int12: 3000,
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

  // Mercy's visit has a closed-loop invite+submission (demonstrates the
  // full cycle); Abena's visit deliberately has no invite yet, so the
  // demo's "Send invite" action always has something real to exercise.
  const sveInviteId = uid();
  const sveInvites: DemoDb['sveInvites'] = [
    {
      id: sveInviteId,
      siteVisitId: siteVisits[0].id,
      token: 'demo-token-' + sveInviteId,
      clientName: 'Mercy Owusu',
      clientContact: '0240758072',
      sentAt: isoPlusDays(t, -11),
      sentVia: 'link',
      sentBy: AGENT_KEY,
      submittedAt: isoPlusDays(t, -10),
      createdAt: isoPlusDays(t, -11),
    },
  ];

  const sveSubmissions: DemoDb['sveSubmissions'] = [
    {
      id: uid(),
      inviteId: sveInviteId,
      fullName: 'Mercy Owusu',
      phone: '0240758072',
      siteVisited: 'Royal Palm Enclave',
      visitDate: siteVisits[0].visitDate,
      journeyRating: 'Excellent',
      siteManagerName: 'Elias Torgbuivi',
      relationshipRating: 5,
      handlingFeedback: 'Elias was very patient and answered every question clearly.',
      siteDescriptionRating: 'Met expectations',
      belowExpectationReason: null,
      overallRating: 5,
      npsScore: 9,
      improvementSuggestions: 'Maybe provide a printed site map to take home.',
      purchaseIntent: 'need more time',
      additionalComments: 'Really enjoyed the visit, discussing with my spouse before committing.',
      createdAt: isoPlusDays(t, -10),
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

  // Production's real attendance_log table has 0 rows today (confirmed
  // live -- a genuinely unused-so-far feature) so there's no real shape to
  // match beyond the schema itself. Seeding a small past history only --
  // deliberately nothing for *today*, so the demo's Sign In flow always
  // starts fresh on a new session, matching how a real staff member's day
  // actually begins.
  const attendance: DemoDb['attendance'] = [];
  for (let i = 1; i <= 3; i++) {
    const day = isoPlusDays(t, -i);
    attendance.push({
      id: uid(),
      staffKey: AGENT_KEY,
      staffName: 'Elias Torgbuivi',
      workDate: day,
      signInAt: `${day}T08:05:00.000Z`,
      signInLat: 5.6037,
      signInLng: -0.187,
      signOutAt: `${day}T17:12:00.000Z`,
      signOutLat: 5.6037,
      signOutLng: -0.187,
      notes: null,
      createdAt: `${day}T08:05:00.000Z`,
      lateReason: null,
      signInReason: null,
      signOutReason: null,
      isOffSiteIn: false,
      isOffSiteOut: false,
      signInPhoto: null,
    });
  }

  // Fictional demo content -- shaped like real production's actual memo
  // categories (leave requests, management notices, cc'd staffing memos)
  // without reproducing any real correspondence.
  const receivedMemoId = uid();
  const sentMemoId = uid();
  const draftMemoId = uid();
  const memos: DemoDb['memos'] = [
    {
      id: receivedMemoId,
      fromKey: 'management',
      fromName: 'Management',
      toKey: AGENT_KEY,
      toName: 'Elias Torgbuivi',
      subject: 'Site visit schedule for next week',
      bodyHtml: "Please confirm your availability for the Royal Palm Enclave site visits scheduled next week. Let the office know if any of your slots need to move.",
      parentId: null,
      kind: 'memo',
      createdAt: isoPlusDays(t, -2),
      read: false,
      status: 'sent',
    },
    {
      id: sentMemoId,
      fromKey: AGENT_KEY,
      fromName: 'Elias Torgbuivi',
      toKey: 'management',
      toName: 'Management',
      subject: 'Leave Request Letter',
      bodyHtml: 'Requesting 2 days leave next month for a family event. Happy to hand off my open follow-ups to a colleague in the meantime.',
      parentId: null,
      kind: 'memo',
      createdAt: isoPlusDays(t, -7),
      read: true,
      status: 'sent',
    },
    {
      id: draftMemoId,
      fromKey: AGENT_KEY,
      fromName: 'Elias Torgbuivi',
      toKey: 'management',
      toName: 'Management',
      subject: 'Request for petty cash',
      bodyHtml: 'Draft -- still filling in the amount and purpose before sending.',
      parentId: null,
      kind: 'memo',
      createdAt: isoPlusDays(t, -1),
      read: false,
      status: 'draft',
    },
  ];

  const memoRecipients: DemoDb['memoRecipients'] = [
    { id: uid(), memoId: sentMemoId, staffKey: 'emmanuel', staffName: 'Emmanuel Owusu', read: false, createdAt: isoPlusDays(t, -7) },
  ];

  // Matches real production's actual shape (confirmed live): category/
  // priority are free text, "Land / Plot Issue" and "High" are real
  // values seen. Production has zero Resolved complaints today -- the
  // second row here demonstrates the resolve flow works, not a claim
  // that real data looks like this yet.
  const complaints: DemoDb['complaints'] = [
    {
      id: uid(),
      agentKey: AGENT_KEY,
      agentName: 'Elias Torgbuivi',
      name: 'Kwabena Owusu',
      contact: '0244556677',
      plot: '',
      category: 'Land / Plot Issue',
      details: "I haven't been allocated a plot yet even though I've paid 60%.",
      owner: null,
      priority: 'High',
      resolution: '',
      status: 'Open',
      createdAt: isoPlusDays(t, -2),
      source: null,
      sentiment: null,
    },
    {
      id: uid(),
      agentKey: AGENT_KEY,
      agentName: 'Elias Torgbuivi',
      name: 'Yaa Asantewaa',
      contact: '0209887766',
      plot: 'A-02',
      category: 'Service Quality',
      details: 'Documentation is taking longer than promised.',
      owner: 'Elias Torgbuivi',
      priority: 'Medium',
      resolution: 'Followed up with the surveyor, document ready for collection.',
      status: 'Resolved',
      createdAt: isoPlusDays(t, -10),
      source: null,
      sentiment: null,
    },
  ];

  // Real workflow: any staff can request, only Management/elizabeth fulfil.
  // One still-pending (elias's fully-paid client, the realistic trigger for
  // a contract request) and one already fulfilled on another agent's lead,
  // so Management's view has real multi-agent shape to show, not a single
  // flat row.
  const contractRequests: DemoDb['contractRequests'] = [
    {
      id: uid(),
      leadId: leads[1].id,
      clientName: leads[1].name,
      requestedBy: AGENT_KEY,
      requestedByName: 'Elias Torgbuivi',
      note: 'Fully paid as of today, client wants to sign this week if possible.',
      status: 'pending',
      createdAt: isoPlusDays(t, -1),
      fulfilledAt: null,
    },
    {
      id: uid(),
      leadId: leads[4].id,
      clientName: leads[4].name,
      requestedBy: 'emmanuel',
      requestedByName: 'Emmanuel Owusu',
      note: null,
      status: 'fulfilled',
      createdAt: isoPlusDays(t, -14),
      fulfilledAt: isoPlusDays(t, -12),
    },
  ];

  // Real workflow: any staff can request, decide is manager-gated
  // client-side. One still-pending (a real upcoming date range) and one
  // already approved, so Management's view has both states to show.
  const leaveRequests: DemoDb['leaveRequests'] = [
    {
      id: uid(),
      agentKey: AGENT_KEY,
      agentName: 'Elias Torgbuivi',
      year: new Date(isoPlusDays(t, 10)).getFullYear(),
      dates: [isoPlusDays(t, 10), isoPlusDays(t, 11), isoPlusDays(t, 12)],
      daysCount: 3,
      letterText: "Taking a few days for a family event, back to work right after.",
      status: 'pending',
      createdAt: isoPlusDays(t, -1),
      decidedAt: null,
      decidedBy: null,
      decidedByName: null,
    },
    {
      id: uid(),
      agentKey: 'emmanuel',
      agentName: 'Emmanuel Owusu',
      year: new Date(isoPlusDays(t, -20)).getFullYear(),
      dates: [isoPlusDays(t, -20), isoPlusDays(t, -19)],
      daysCount: 2,
      letterText: null,
      status: 'approved',
      createdAt: isoPlusDays(t, -25),
      decidedAt: isoPlusDays(t, -23),
      decidedBy: 'management',
      decidedByName: 'Management',
    },
  ];

  // Real workflow: an agent manually requests allocation for one of their
  // own leads (this app's honest simplification of the real automatic
  // server-side trigger -- see the type's comment in domain.ts). One
  // still-pending and one already allocated, so Management's view has
  // both states to show.
  const allocationRequests: DemoDb['allocationRequests'] = [
    {
      id: uid(),
      leadId: leads[0].id,
      clientName: leads[0].name,
      agentKey: AGENT_KEY,
      agentName: 'Elias Torgbuivi',
      percentPaid: 50,
      grandTotal: leads[0].grandTotal,
      amtPaid: leads[0].amtPaid,
      status: 'Pending',
      plotNumber: null,
      note: null,
      allocatedBy: null,
      createdAt: isoPlusDays(t, -2),
      resolvedAt: null,
    },
    {
      id: uid(),
      leadId: leads[1].id,
      clientName: leads[1].name,
      agentKey: AGENT_KEY,
      agentName: 'Elias Torgbuivi',
      percentPaid: 100,
      grandTotal: leads[1].grandTotal,
      amtPaid: leads[1].amtPaid,
      status: 'Allocated',
      plotNumber: 'A-14',
      note: 'Corner plot, confirmed with client on-site.',
      allocatedBy: 'Management',
      createdAt: isoPlusDays(t, -6),
      resolvedAt: isoPlusDays(t, -4),
    },
  ];

  // Private per-staff scratchpad -- one real note, not fictional filler.
  const notesTimestamp = `${t}T09:15:00.000Z`;
  const notes: DemoDb['notes'] = [
    {
      id: uid(),
      ownerKey: AGENT_KEY,
      title: 'Follow-up call script',
      body: 'Lead with the current promo, confirm site visit availability before quoting a price.',
      createdAt: isoPlusDays(t, -4) + 'T09:15:00.000Z',
      updatedAt: notesTimestamp,
    },
  ];

  // A short, realistic 1:1 thread with 'management' -- deliberately not
  // fully read (last inbound message unread) so the conversation list's
  // unread badge has something real to show immediately.
  const chatMessages: DemoDb['chatMessages'] = [
    {
      id: uid(),
      senderKey: 'management',
      senderName: 'Management',
      recipientKey: AGENT_KEY,
      body: 'Morning! Can you confirm the Royal Palm Enclave site visits for this week?',
      createdAt: isoPlusDays(t, -1) + 'T09:02:00.000Z',
      read: true,
      attachmentData: null,
      attachmentType: null,
      attachmentName: null,
      kind: null,
      refType: null,
      refId: null,
    },
    {
      id: uid(),
      senderKey: AGENT_KEY,
      senderName: 'Elias Torgbuivi',
      recipientKey: 'management',
      body: 'Yes, Mercy and Abena are both confirmed. Sending the schedule now.',
      createdAt: isoPlusDays(t, -1) + 'T09:05:00.000Z',
      read: true,
      attachmentData: null,
      attachmentType: null,
      attachmentName: null,
      kind: null,
      refType: null,
      refId: null,
    },
    {
      id: uid(),
      senderKey: 'management',
      senderName: 'Management',
      recipientKey: AGENT_KEY,
      body: "Great, thanks. Let me know how it goes -- don't forget to log the site visit afterward.",
      createdAt: isoPlusDays(t, 0) + 'T08:30:00.000Z',
      read: false,
      attachmentData: null,
      attachmentType: null,
      attachmentName: null,
      kind: null,
      refType: null,
      refId: null,
    },
  ];

  return { version: 21, leads, payments, scheduleItems, streaks, config, plots, siteVisits, referrals, enquiries, attendance, memos, memoRecipients, complaints, contractRequests, leaveRequests, allocationRequests, notes, staffActiveOverrides: {}, sveInvites, sveSubmissions, chatMessages };
}

export { AGENT_KEY as DEMO_AGENT_KEY };
