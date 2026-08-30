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
    // Has address+kyc filled in (real jsonb shape, confirmed live) so the
    // Contract of Sale PDF has one lead in demo mode that renders every
    // KYC field non-blank, not just the underlying-data-optional path.
    {
      id: uid(),
      agent: AGENT_KEY,
      name: 'Mercy Owusu',
      contact: '0240758072',
      date: isoPlusDays(t, -18),
      plotType: 'Half Plot',
      noPlots: 1,
      unitPrice: 48000,
      paymentPlan: '6 Months',
      amtPaid: 24000,
      grandTotal: 48000,
      stage: '2B',
      address: 'House No. 12, Spintex Road, Accra',
      kyc: {
        nationality: 'Ghanaian',
        occupation: 'Teacher',
        dob: '1990-04-12',
        idType: 'Ghana Card',
        idNumber: 'GHA-123456789-0',
        email: 'mercy.owusu@example.com',
        location: 'Spintex, Accra',
        contactName: 'Kojo Owusu',
        contactPhone: '0244112233',
        contactEmail: 'kojo.owusu@example.com',
        contactAddress: 'House No. 12, Spintex Road, Accra',
        contactRelation: 'Brother',
        landUsage: 'Residential',
        landUsageDetail: '',
      },
    },
    { id: uid(), agent: AGENT_KEY, name: 'Kwame Asante', contact: '0201234567', date: isoPlusDays(t, -40), plotType: 'Full Plot', noPlots: 1, unitPrice: 60000, paymentPlan: 'Full Payment', amtPaid: 60000, grandTotal: 60000, stage: '4' },
    // priority:'High' with no nextAction -- gives Smart Insights' "high
    // priority, no follow-up planned" nudge a real row to surface,
    // purely additive (priority feeds nothing else app-wide).
    { id: uid(), agent: AGENT_KEY, name: 'Abena Boateng', contact: '0559876543', date: isoPlusDays(t, -5), plotType: 'Full Plot', noPlots: 1, unitPrice: 36000, paymentPlan: '12 Months', amtPaid: 0, grandTotal: 36000, stage: '1', priority: 'High' },
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
    // Backing approved payments for the other agents' leads' amtPaid --
    // without these, Data Check's Ledger mismatch scan (amtPaid vs sum of
    // approved payments) would flag all three as false positives just
    // because this hand-crafted seed set amtPaid directly on the lead
    // instead of building it up through payment rows.
    { id: uid(), leadId: leads[3].id, agentKey: 'emmanuel', amount: 45000, date: isoPlusDays(t, -20), clientName: leads[3].name, paymentMethod: 'Ecobank', status: 'approved', decidedBy: null, decidedByName: null, decidedAt: null, receiptNumber: null, note: null },
    { id: uid(), leadId: leads[4].id, agentKey: 'emmanuel', amount: 120000, date: isoPlusDays(t, -55), clientName: leads[4].name, paymentMethod: 'Stanbic Bank', status: 'approved', decidedBy: null, decidedByName: null, decidedAt: null, receiptNumber: null, note: null },
    { id: uid(), leadId: leads[5].id, agentKey: 'elizabeth', amount: 16000, date: isoPlusDays(t, -7), clientName: leads[5].name, paymentMethod: 'MTN MoMo', status: 'approved', decidedBy: null, decidedByName: null, decidedAt: null, receiptNumber: null, note: null },
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
    // Matches what most seeded leads were actually priced at (60000/48000)
    // -- keeps Data Check's Price mismatch check meaningful (Abena Boateng
    // at 36000 stays a genuine, isolated old-promo flag) instead of every
    // populated lead flagging against a stale reference price.
    fullPrice: 60000,
    halfPrice: 48000,
    fullDiscount: 0,
    halfDiscount: 0,
    int3: 750,
    int6: 1500,
    int9: 2250,
    int12: 3000,
    // Real production values (confirmed live) -- phone/email/tin are
    // genuinely empty in production today, not a demo-only gap.
    quoteCompanyName: 'Trulander JSF Limited',
    quoteSiteName: 'P.O Box CO3644, Tema, Accra-Ghana',
    companyPhone: '',
    companyEmail: '',
    companyTin: '',
    quoteFooterAddress: 'First Floor Alex Nerda Building. Nungua Nautical Beach Road Drive',
    receiptThanksText: 'Thank you for your payment. This receipt confirms the amount above was received by us and applied to your account.',
    receiptLogoImage: null,
    quoteDocTypeText: 'Quotation with Payment Plan Schedule',
    quoteNotesText:
      'Kindly make all payments by cheque or transfer to Trulander JSF Ltd.\nQuotation and offer is valid for 10 days only.\nKindly ensure all payments are receipted with Trulander receipts.\nBank Details: Ecobank Account No. 1441002259946, Spintex Branch.\nKindly note all payments shall be latest by the 27th of each month.\nWe accept either post-dated cheques or standing orders for credit payment.',
    quoteLandNoteText: 'We offer to deliver all Land Indentures and Certified Site plan within 3 weeks after Full payment',
    // Real production values (confirmed live) -- both images are null in
    // production too, so the PDF's own defaults (public/contract-cover.jpg,
    // public/trulander-wordmark.png) are what actually render there.
    contractCeoName: 'FRANK ADU PEPRAH',
    contractPreamble:
      'i. WHEREAS the Vendor is the beneficial owner of ALL THAT piece or parcel of land, containing an approximate area of {ACRES} acre more or less, situate at Royal Palm Enclave Tsopoli, Accra in the Greater Accra Region of the Republic of Ghana.\n\nii. The Land was leased by the Dorsi Animle Family represented by the its Head and Lawful representative Numo Napoleon Tawiah Animle of the Shai Osudoku District of the Greater Accra with consent and concurrence of principal members of the family (here-in the Head Lessors) to TRULANDER JSF LIMITED represented by its CEO, Mr. FRANK ADU PEPRAH for a total land area measuring approximately 72.30 Acres (29.27 Hect) by a lease an Indenture dated 1st February, 2025 for a term of 80 years with an option to renew for a further term of 45 years with effect from 1st February, 2025.\n\niii. WHEREAS the Head Lessor interest has been duly registered at the Land Title Registry of the Lands Commission with Land Title Certificate No. TD.23221.\n\niv. WHERAS the Deed dated 1st February, 2025 between the Trulander JSF Limited and the Head Lessor has been registered at the Lands Commission as LVDGAST97782872025A and Survey Plotted Plan No. X4114.\n\nv. The Vendor has obtained the consent of the Head lessors to assign his unexpired interest in the lease to the purchaser herein and the Purchaser has requested to purchase the land, subject to the terms and conditions hereinafter stated.',
    contractDefinitions:
      '1. DEFINITIONS AND INTERPRETATION\n\n1.1 Definitions\n\nUnless the context otherwise requires, the following words used in this Agreement shall have the meanings ascribed to them in this Clause 1.1.\n\n1.1.1 "Agreement" means this Contract of Sale.\n\n1.1.2 "Encumbrance" means any mortgage, charge, pledge, lien, option, restriction, right of first refusal, third party right or interest, or other encumbrance or security interest of any kind, or another type of arrangement having similar effect, or which diminishes the value of the Property;\n\n1.1.3 "Parties" means the Vendor and the Purchaser, and "Party" means the Vendor or the Purchaser;\n\n1.1.4 "Land" means ALL THAT LAND in consideration of this transaction between the Vendor and the Purchaser.\n\n1.1.5 "Purchaser" and "Vendor" shall have the meaning afore stated\n\n1.2 Interpretation\n\nIn this Agreement, unless the context otherwise requires:\n\n1.2.1 Sections, Clauses, Paragraphs and Headings are for ease of reference only and are not meant to be used in interpreting the provisions of this Agreement.\n\n1.2.2 Reference to "days" means calendar days.\n\n1.2.3 All Schedules form part of this Agreement.',
    contractTerms:
      '2. REPRESENTATIONS AND WARRANTIES\n\n2.1 The Vendor makes the following representations and warranties to the Purchaser:\n\n2.1.1 It has the requisite capacity to enter into this Agreement as the beneficial owner of the Property.\n\n2.1.2 The Property is not subject to any encumbrance which has not been disclosed to the Purchaser.\n\n2.1.3 There is no restrictive covenant with regard to the Property as at the date of executing this Agreement which has not been disclosed to the Purchaser.\n\n2.1.4 That it shall give full vacant possession to the Purchasers upon receipt of full payment.\n\n2.1.5 That the Vendor shall execute a Sublease Deed in favor of the Purchaser upon full payment of the Consideration or Purchase Price within 3 weeks.\n\n2.1.6 That the Vendor shall execute a Certified Site-plan in favor of the Vendor. Barcoded site-plan shall be at the expense of the Purchaser.\n\n2.1.7 During the validity period of the Lease, the Vendor guarantees that the Property acquired herein will not be leased, sold or mortgaged to a third party.\n\n2.1.8 The Purchaser shall peaceably enjoy the Property without any unlawful interference by the Vendor or anyone claiming under or through the Vendor upon full payment of consideration and execution of this Agreement.\n\n2.1.9 Vendor shall keep plots allocated in clause (E) for Purchaser except in case of default of payment or breach of this Contract.\n\n2.2 The Purchaser makes the following representations and warranties to the Vendor:\n\n2.2.1 That the Purchaser has inspected the land and have dutifully done his independent due diligence to satisfy himself under the guidance of his Counsel or Solicitor.\n\n2.2.2 That the Purchaser enters into this agreement as a result of his own satisfaction of any representation or warranty either written, oral or implied, made by or on behalf of the Vendor of anything whatsoever subject to the agreement and that this agreement contains the entire agreement between the parties.\n\n2.2.3 That the Purchaser has the funds to pay for the Purchase Price and warrants to make such payments per the payment plan as agreed.\n\n2.2.4 That the Purchaser shall be responsible for the cost of registering his interest in the Land at the Land Commission.\n\n2.2.5 That the Purchaser shall be responsible to undertake all activities necessary to take possession of the land once allocation is done including but not limited to the construction of a 4feet protective or non-trespass wall.\n\n2.2.6 The Purchaser shall develop the Property within 30 months. Development shall be defined at the least as the construction of a protective fence of about 4feets tall within the first 12months. Development is to protect buyers\' interest from any possible encroachment or trespass from neighboring Landowners.\n\n2.2.7 The Purchaser shall retain the option to join the Palm Enclave Property-Owners Association (PEPA) to further develop the key infrastructure within the enclave for their mutual benefit.\n\n2.2.8 The Purchaser shall be responsible for the management of the land to the satisfaction of his right to enjoyment of the land which includes his rights to own, protect, right of usage and occupation. That the right to enjoyment of his Land shall not be to the disadvantage of others.\n\n2.2.9 The Purchaser shall peaceably enjoy the Property without any interference caused by the Vendor or anyone claiming under or through the Vendor.\n\n2.2.10 The Purchaser shall observe and perform the covenants and conditions here-in stated and shall indemnify and keep the Vendor and his successors in title fully indemnified against all actions, proceedings, damages, costs, claims and expenses which may be suffered or incurred by the Purchaser or his successors in title in respect of any future breach or non-observance or non-performance of these covenants and conditions.\n\n2.2.11 The Land location is designated as a Residential Land. Purchaser shall develop Standard residential property of 1-3 floors for the location above. Vendor and Purchaser shall access suitability of above location for any planned mid-to-high rise buildings.\n\n2.2.12 The Purchaser shall pay GHS100 per plot as annual ground rent. This amount shall be due by the 31st December of every calendar year and due for renewal every 10years at not less than 10% of previous rent.\n\n3. PARTIES HEREBY FURTHER AGREE AS FOLLOWS: PAYMENTS, DEFAULTS AND REFUND\n\n3.1 Payments and Defaults\n\na. All payments shall be made to the Companies Bank Accounts and Designated Platforms\n\nb. All Payments shall be receipted in the name and in favor of the Purchaser\n\nc. Payment plans as agreed shall be strictly adhered to.\n\nd. Purchaser undertakes to pay a 5% monthly penal charge on each month of default on the outstanding due payable except otherwise agreed.\n\ne. Monthly penal charges on defaults shall be calculated on compound interest basis.\n\nf. Monthly Penal charges shall automatically apply 5 days after the default date except explicitly expressed and agreed in writing.\n\n3.2 A Refund shall be paid under the following conditions:\n\na. Monthly Penal charges shall automatically apply 5 days after the default date except explicitly expressed and agreed in writing.\n\nb. Where Vendor cancels sales transaction or this contract due to failure of Purchaser to meet payment obligation. Vendor shall issue a Notice of Refund Letter.\n\nc. Formal cancellation notice shall be issued where Purchaser fails to make payments due on two (2) consecutive deadlines. Refund Notice shall be issued Seven (7) days after Notice of Cancellation.\n\nd. Where Purchaser cancels the transaction and this contract and request for a refund of consideration paid due to Personal challenges other-than breach of agreement by Vendor. Purchaser shall issue a Request for Refund Letter 7 days after issue of cancellation notice.\n\ne. Where Purchaser cancels the transaction and this contract due to Vendors breach of this Contract. Refer 3.3 below\n\n3.3 All Refunds shall follow the following process:\n\na. A request or notification of refund shall be made by a formal document written as above\n\nb. Refunds for Installment payments shall be paid in full after 90days subject to clause 3.3(d).\n\nc. Refund for an outright payment shall be made after 60 days.\n\nd. Ten percent (10%) of the land value shall be deducted as administrative charge plus any commission or agency fees.\n\ne. Where refund arises due to breach by Vendor clause 3.3(d) shall not be applicable.\n\n4. GOVERNING LAW\n\nThis Agreement shall be governed by and construed in accordance with the laws of the Republic of Ghana. Any dispute that shall arise in respect of this agreement shall be resolved amicably between the parties within 21 working days from the date of the dispute. Failure by the parties to resolve the dispute, a Party shall reserve the right to seek redress of all matters by Arbitration under the Alternative Dispute Resolutions Act, 2010 (Act 798) of the Republic of Ghana.\n\n5. ENTIRE UNDERSTANDING\n\nThis Contract constitutes the entire agreement and understanding between the parties hereto and supersedes any prior written or oral agreements, representation and warranties between them respecting the subject matter hereof.\n\n6. NOTICES\n\nAny notice to be given by any Party shall be in writing and shall be deemed duly served if delivered personally to the addressee at the registered address of that party set opposite its name below or at such other address as the party to be served may have notified in accordance with the provision of this clause for the purposes of this agreement.',
    contractCoverImage: null,
    contractWordmarkImage: null,
    techFullPlotLengthFt: 70,
    techFullPlotWidthFt: 100,
    techHalfPlotLengthFt: 50,
    techHalfPlotWidthFt: 70,
    leaveTotalDays: 20,
    workDays: [1, 2, 3, 4, 5],
    eidObservingStaff: ['adams'],
    referralPointsPerReferral: 50,
  };

  // Real access to this resource is manager + elias/emmanuel-only (RLS
  // confirmed live) -- AGENT_KEY here already being 'elias' matches that.
  // Includes one half-plot subdivision (parentPlotId), the real pattern
  // production's split_plot_for_half_sale() function creates.
  const wholePlotId = uid();
  const plots: DemoDb['plots'] = [
    { id: uid(), site: 'Royal Palm Enclave', plotNumber: 'A-01', plotType: 'Full Plot', status: 'Allocated', price: 60000, clientName: 'Kwame Asante', clientContact: '0201234567', agentKey: AGENT_KEY, notes: null, unitKind: 'whole', parentPlotId: null },
    { id: uid(), site: 'Royal Palm Enclave', plotNumber: 'A-02', plotType: 'Full Plot', status: 'Running Search', price: 36000, clientName: 'Abena Boateng', clientContact: '0559876543', agentKey: AGENT_KEY, notes: null, unitKind: 'whole', parentPlotId: null },
    { id: uid(), site: 'Royal Palm Enclave', plotNumber: 'A-03', plotType: 'Full Plot', status: 'Available', price: 60000, clientName: null, clientContact: null, agentKey: null, notes: null, unitKind: 'whole', parentPlotId: null },
    { id: wholePlotId, site: 'Royal Palm Enclave', plotNumber: 'B-01', plotType: 'Full Plot', status: 'Available', price: 96000, clientName: null, clientContact: null, agentKey: null, notes: 'Split into two half plots', unitKind: 'whole', parentPlotId: null },
    { id: uid(), site: 'Royal Palm Enclave', plotNumber: 'B-01-H1', plotType: 'Half Plot', status: 'Allocated', price: 48000, clientName: 'Mercy Owusu', clientContact: '0240758072', agentKey: AGENT_KEY, notes: null, unitKind: 'half', parentPlotId: wholePlotId },
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
      decidedSignature: null,
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
      decidedSignature: null,
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
      suggestedPlots: null,
      note: null,
      allocatedBy: null,
      flagReason: null,
      flaggedBy: null,
      flaggedAt: null,
      history: [{ type: 'requested', at: isoPlusDays(t, -2), by: 'Elias Torgbuivi' }],
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
      suggestedPlots: 'A-14',
      note: 'Corner plot, confirmed with client on-site.',
      allocatedBy: 'Management',
      flagReason: null,
      flaggedBy: null,
      flaggedAt: null,
      history: [
        { type: 'requested', at: isoPlusDays(t, -6), by: 'Elias Torgbuivi' },
        { type: 'allocated', plotNumber: 'A-14', note: 'Corner plot, confirmed with client on-site.', by: 'Management', at: isoPlusDays(t, -4) },
      ],
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
      replyToId: null,
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
      replyToId: null,
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
      replyToId: null,
    },
  ];

  const contracts: DemoDb['contracts'] = [];

  const banners: DemoDb['banners'] = [
    { id: uid(), name: 'Spintex Road – near GOIL', area: 'Spintex', status: 'placed', lat: null, lng: null, image: null, notes: null, createdBy: AGENT_KEY, createdByName: 'Elias Torgbuivi', createdAt: isoPlusDays(t, -30), updatedAt: isoPlusDays(t, -30) },
    { id: uid(), name: 'Tema Roundabout billboard', area: 'Tema', status: 'needs_maintenance', lat: null, lng: null, image: null, notes: 'Corner peeling, needs reprint', createdBy: 'emmanuel', createdByName: 'Emmanuel', createdAt: isoPlusDays(t, -60), updatedAt: isoPlusDays(t, -3) },
    { id: uid(), name: 'Weija Junction', area: 'Weija', status: 'location_only', lat: null, lng: null, image: null, notes: 'Scouted, banner not printed yet', createdBy: 'elizabeth', createdByName: 'Elizabeth', createdAt: isoPlusDays(t, -5), updatedAt: isoPlusDays(t, -5) },
  ];

  const fundRequests: DemoDb['fundRequests'] = [
    {
      id: uid(),
      type: 'specific',
      amount: 850,
      purpose: 'Fuel + transport for the Royal Palm Enclave site visits this week',
      requestedBy: AGENT_KEY,
      requestedByName: 'Elias Torgbuivi',
      status: 'pending',
      decidedBy: null,
      decidedByName: null,
      decidedAt: null,
      decisionNote: null,
      receiptData: null,
      receiptName: null,
      createdAt: isoPlusDays(t, -1),
    },
    {
      id: uid(),
      type: 'budget',
      amount: 2000,
      purpose: 'Monthly office supplies + printing budget',
      requestedBy: 'emmanuel',
      requestedByName: 'Emmanuel',
      status: 'approved',
      decidedBy: 'management',
      decidedByName: 'Management',
      decidedAt: isoPlusDays(t, -4),
      decisionNote: null,
      receiptData: null,
      receiptName: null,
      createdAt: isoPlusDays(t, -6),
    },
  ];

  return {
    version: 39,
    leads,
    payments,
    scheduleItems,
    streaks,
    config,
    plots,
    siteVisits,
    referrals,
    enquiries,
    attendance,
    memos,
    memoRecipients,
    complaints,
    contractRequests,
    leaveRequests,
    allocationRequests,
    notes,
    staffActiveOverrides: {},
    staffSignatures: {},
    sveInvites,
    sveSubmissions,
    chatMessages,
    contracts,
    receiptShareLinks: [],
    banners,
    fundRequests,
    weeklyVisitForms: [],
  };
}

export { AGENT_KEY as DEMO_AGENT_KEY };
