import type { AchievementDef, AllocationRequest, AttendanceRecord, AuditEvent, BackupRecord, Banner, ChatMessage, Complaint, Config, Contract, ContractRequest, DownloadRecord, Enquiry, FundRequest, Lead, LeaderboardRow, LeaderboardWeights, LeaveRequest, Memo, MemoRecipient, Note, Payment, PermissionDef, PermissionOverride, Plot, Profile, Referral, ReportArchiveEntry, ScheduleItem, ScheduleItemStatus, SiteVisit, StaffAchievement, SveInviteRecord, SveSubmissionRecord, StreakRow, WeeklyVisitForm } from '../types/domain';

// snake_case (real Postgres columns, confirmed live against the schema)
// <-> camelCase (this app's domain types) mapping, one function per
// resource -- mirrors index.html's mapLead()/mapTodo()/mapStreak() pattern
// exactly, including the one real vocabulary translation: the DB's
// schedule_items.status uses 'done' for a completed item; every screen in
// this app (and the old index.html) works in terms of 'closed' instead.
// Getting this translation wrong is exactly the kind of silent bug that
// only shows up once real data is involved -- so it lives in one place,
// tested once, instead of being repeated at every call site.

export function mapLeadRow(r: Record<string, unknown>): Lead {
  return {
    id: r.id as string,
    agent: r.agent_key as string,
    name: r.name as string,
    contact: (r.contact as string) ?? '',
    date: r.date_added as string,
    plotType: (r.plot_type as Lead['plotType']) ?? 'Full Plot',
    noPlots: Number(r.no_plots ?? 1),
    unitPrice: Number(r.unit_price ?? 0),
    paymentPlan: (r.payment_plan as Lead['paymentPlan']) ?? 'Full Payment',
    amtPaid: Number(r.amt_paid ?? 0),
    grandTotal: Number(r.grand_total ?? 0),
    stage: (r.stage as Lead['stage']) ?? '1',
    notes: (r.notes as string) ?? undefined,
    leadSource: (r.lead_source as string) ?? null,
    bannerId: (r.banner_id as string) ?? null,
    address: (r.address as string) ?? null,
    discount: r.discount != null ? Number(r.discount) : null,
    netTotal: r.net_total != null ? Number(r.net_total) : null,
    depositTarget: r.deposit_target != null ? Number(r.deposit_target) : null,
    kyc: (r.kyc as Lead['kyc']) ?? null,
    nextAction: (r.next_action as string) ?? null,
    priority: (r.priority as string) ?? null,
    tags: (r.tags as string) ?? null,
    siteVisit: (r.site_visit as string) ?? null,
    docStage: (r.doc_stage as string) ?? null,
    docStageUpdatedAt: (r.doc_stage_updated_at as string) ?? null,
    lastModifiedAt: (r.last_modified_at as string) ?? null,
    deletedAt: (r.deleted_at as string) ?? null,
  };
}

export function mapPaymentRow(r: Record<string, unknown>): Payment {
  return {
    id: r.id as string,
    leadId: r.lead_id as string,
    agentKey: r.agent_key as string,
    amount: Number(r.amount ?? 0),
    date: r.payment_date as string,
    clientName: (r.client_name as string) ?? undefined,
    paymentMethod: (r.payment_method as Payment['paymentMethod']) ?? null,
    note: (r.note as string) ?? null,
    status: (r.status as Payment['status']) ?? 'approved',
    decidedBy: (r.decided_by as string) ?? null,
    decidedByName: (r.decided_by_name as string) ?? null,
    decidedAt: (r.decided_at as string) ?? null,
    receiptNumber: (r.receipt_number as string) ?? null,
    receiptProofPath: (r.receipt_proof_path as string) ?? null,
  };
}

const DB_TO_DOMAIN_STATUS: Record<string, ScheduleItemStatus> = { open: 'open', in_progress: 'in_progress', done: 'closed', cancelled: 'cancelled', rescheduled: 'rescheduled' };
const DOMAIN_TO_DB_STATUS: Record<ScheduleItemStatus, string> = { open: 'open', in_progress: 'in_progress', closed: 'done', cancelled: 'cancelled', rescheduled: 'rescheduled' };

export function mapScheduleItemRow(r: Record<string, unknown>): ScheduleItem {
  return {
    id: r.id as string,
    kind: r.kind as ScheduleItem['kind'],
    ownerKey: r.owner_key as string,
    ownerName: (r.owner_name as string) ?? undefined,
    assignedTo: (r.assigned_to as string) ?? (r.owner_key as string),
    assignedToName: (r.assigned_to_name as string) ?? undefined,
    date: (r.item_date as string) ?? (r.due_date as string),
    status: DB_TO_DOMAIN_STATUS[r.status as string] ?? 'open',
    title: r.title as string,
    description: (r.description as string) ?? null,
    category: (r.category as string) ?? null,
    priority: (r.priority as string) ?? null,
  };
}

export function domainStatusToDb(status: ScheduleItemStatus): string {
  return DOMAIN_TO_DB_STATUS[status];
}

export function mapStreakRow(r: Record<string, unknown>): StreakRow {
  return {
    staffKey: r.staff_key as string,
    date: r.streak_date as string,
    dayMet: !!r.streak_day_met,
  };
}

export function mapWeeklyVisitFormRow(r: Record<string, unknown>): WeeklyVisitForm {
  return {
    id: r.id as string,
    weekStart: r.week_start as string,
    visitDate: r.visit_date as string,
    vehicleRentalEst: Number(r.vehicle_rental_est ?? 0),
    driversTipEst: Number(r.drivers_tip_est ?? 0),
    fuelEst: Number(r.fuel_est ?? 0),
    refreshmentEst: Number(r.refreshment_est ?? 0),
    tntEst: Number(r.tnt_est ?? 0),
    vehicleRentalAct: Number(r.vehicle_rental_act ?? 0),
    driversTipAct: Number(r.drivers_tip_act ?? 0),
    fuelAct: Number(r.fuel_act ?? 0),
    refreshmentAct: Number(r.refreshment_act ?? 0),
    tntAct: Number(r.tnt_act ?? 0),
    siteManagerName: (r.site_manager_name as string) ?? null,
    status: (r.status as WeeklyVisitForm['status']) ?? 'Open',
    approvedBy: (r.approved_by as string) ?? null,
    approvedByName: (r.approved_by_name as string) ?? null,
    approvedSignature: (r.approved_signature as string) ?? null,
    finalizedAt: (r.finalized_at as string) ?? null,
  };
}

export function mapFundRequestRow(r: Record<string, unknown>): FundRequest {
  return {
    id: r.id as string,
    type: (r.req_type as FundRequest['type']) ?? 'budget',
    amount: Number(r.amount ?? 0),
    purpose: (r.purpose as string) ?? '',
    requestedBy: r.requested_by as string,
    requestedByName: (r.requested_by_name as string) ?? '',
    status: (r.status as FundRequest['status']) ?? 'pending',
    decidedBy: (r.decided_by as string) ?? null,
    decidedByName: (r.decided_by_name as string) ?? null,
    decidedAt: (r.decided_at as string) ?? null,
    decisionNote: (r.decision_note as string) ?? null,
    receiptData: (r.receipt_data as string) ?? null,
    receiptName: (r.receipt_name as string) ?? null,
    createdAt: r.created_at as string,
  };
}

export function mapBannerRow(r: Record<string, unknown>): Banner {
  return {
    id: r.id as string,
    name: r.name as string,
    area: (r.area as string) ?? '',
    status: (r.status as Banner['status']) ?? 'placed',
    lat: r.lat != null ? Number(r.lat) : null,
    lng: r.lng != null ? Number(r.lng) : null,
    image: (r.image as string) ?? null,
    notes: (r.notes as string) ?? null,
    createdBy: r.created_by as string,
    createdByName: (r.created_by_name as string) ?? '',
    createdAt: r.created_at as string,
    updatedAt: (r.updated_at as string) ?? (r.created_at as string),
  };
}

export function mapPlotRow(r: Record<string, unknown>): Plot {
  return {
    id: r.id as string,
    site: r.site as string,
    plotNumber: r.plot_number as string,
    plotType: (r.plot_type as Plot['plotType']) ?? 'Full Plot',
    status: (r.status as Plot['status']) ?? 'Available',
    price: r.price == null ? null : Number(r.price),
    clientName: (r.client_name as string) ?? null,
    clientContact: (r.client_contact as string) ?? null,
    agentKey: (r.agent_key as string) ?? null,
    notes: (r.notes as string) ?? null,
    unitKind: (r.unit_kind as Plot['unitKind']) ?? 'whole',
    parentPlotId: (r.parent_plot_id as string) ?? null,
  };
}

export function mapSiteVisitRow(r: Record<string, unknown>): SiteVisit {
  return {
    id: r.id as string,
    agentKey: r.agent_key as string,
    agentName: (r.agent_name as string) ?? '',
    name: r.name as string,
    contact: (r.contact as string) ?? '',
    site: (r.site as string) ?? '',
    plot: (r.plot as string) ?? null,
    visitDate: r.visit_date as string,
    visitTime: (r.visit_time as string) ?? null,
    people: r.people == null ? null : Number(r.people),
    transport: (r.transport as string) ?? null,
    pickup: (r.pickup as string) ?? null,
    placeOfWork: (r.place_of_work as string) ?? null,
    position: (r.position as string) ?? null,
    nationality: (r.nationality as string) ?? null,
    purpose: (r.purpose as string) ?? null,
    discussionSoFar: (r.discussion_so_far as string) ?? null,
    keyUnderstanding: (r.key_understanding as string) ?? null,
    feedbackAfter: (r.feedback_after as string) ?? null,
    keyNextSteps: (r.key_next_steps as string) ?? null,
    source: (r.source as string) ?? null,
    accompanied: (r.accompanied as string) ?? null,
    notes: (r.notes as string) ?? null,
    status: (r.status as string) ?? 'Pending',
    createdAt: r.created_at as string,
  };
}

export function mapReferralRow(r: Record<string, unknown>): Referral {
  return {
    id: r.id as string,
    referrerLeadId: (r.referrer_lead_id as string) ?? null,
    referrerName: r.referrer_name as string,
    referrerContact: (r.referrer_contact as string) ?? null,
    referredName: r.referred_name as string,
    referredContact: (r.referred_contact as string) ?? '',
    referredLocation: (r.referred_location as string) ?? null,
    referredNoPlots: Number(r.referred_no_plots ?? 1),
    referredLeadId: (r.referred_lead_id as string) ?? null,
    status: (r.status as string) ?? 'Pending',
    pointsAwarded: Number(r.points_awarded ?? 0),
    source: (r.source as string) ?? 'staff',
    createdByKey: (r.created_by_key as string) ?? null,
    createdAt: r.created_at as string,
    clearedAt: (r.cleared_at as string) ?? null,
    archived: !!r.archived,
  };
}

export function mapEnquiryRow(r: Record<string, unknown>): Enquiry {
  return {
    id: r.id as string,
    agentKey: r.agent_key as string,
    agentName: (r.agent_name as string) ?? null,
    name: (r.name as string) ?? null,
    contact: (r.contact as string) ?? null,
    location: (r.location as string) ?? null,
    types: (r.types as string) ?? null,
    plot: (r.plot as string) ?? null,
    source: (r.source as string) ?? null,
    details: (r.details as string) ?? null,
    follow: (r.follow as string) ?? null,
    followDate: (r.follow_date as string) ?? null,
    createdAt: r.created_at as string,
  };
}

export function mapAttendanceRow(r: Record<string, unknown>): AttendanceRecord {
  return {
    id: r.id as string,
    staffKey: r.staff_key as string,
    staffName: (r.staff_name as string) ?? null,
    workDate: r.work_date as string,
    signInAt: (r.sign_in_at as string) ?? null,
    signInLat: r.sign_in_lat == null ? null : Number(r.sign_in_lat),
    signInLng: r.sign_in_lng == null ? null : Number(r.sign_in_lng),
    signOutAt: (r.sign_out_at as string) ?? null,
    signOutLat: r.sign_out_lat == null ? null : Number(r.sign_out_lat),
    signOutLng: r.sign_out_lng == null ? null : Number(r.sign_out_lng),
    notes: (r.notes as string) ?? null,
    createdAt: r.created_at as string,
    lateReason: (r.late_reason as string) ?? null,
    signInReason: (r.sign_in_reason as string) ?? null,
    signOutReason: (r.sign_out_reason as string) ?? null,
    isOffSiteIn: r.is_off_site_in == null ? null : !!r.is_off_site_in,
    isOffSiteOut: r.is_off_site_out == null ? null : !!r.is_off_site_out,
    signInPhoto: (r.sign_in_photo as string) ?? null,
  };
}

export function mapProfileRow(r: Record<string, unknown>): Profile {
  return {
    key: r.agent_key as string,
    name: r.name as string,
    role: (r.role as Profile['role']) ?? 'agent',
    email: (r.email as string) ?? undefined,
    active: (r.active as boolean) ?? true,
    signatureData: (r.signature_data as string) ?? null,
    phone: (r.phone as string) ?? undefined,
  };
}

export function mapMemoRow(r: Record<string, unknown>): Memo {
  return {
    id: r.id as string,
    fromKey: r.from_key as string,
    fromName: r.from_name as string,
    toKey: r.to_key as string,
    toName: r.to_name as string,
    subject: r.subject as string,
    bodyHtml: r.body_html as string,
    parentId: (r.parent_id as string) ?? null,
    kind: (r.kind as string) ?? 'memo',
    createdAt: r.created_at as string,
    read: !!r.read,
    status: (r.status as string) ?? 'sent',
  };
}

export function mapMemoRecipientRow(r: Record<string, unknown>): MemoRecipient {
  return {
    id: r.id as string,
    memoId: r.memo_id as string,
    staffKey: r.staff_key as string,
    staffName: r.staff_name as string,
    read: !!r.read,
    createdAt: r.created_at as string,
  };
}

export function mapSveInviteRow(r: Record<string, unknown>): SveInviteRecord {
  return {
    id: r.id as string,
    siteVisitId: (r.site_visit_id as string) ?? null,
    token: r.token as string,
    clientName: (r.client_name as string) ?? null,
    clientContact: (r.client_contact as string) ?? null,
    sentAt: (r.sent_at as string) ?? null,
    sentVia: (r.sent_via as string) ?? null,
    sentBy: (r.sent_by as string) ?? null,
    submittedAt: (r.submitted_at as string) ?? null,
    createdAt: r.created_at as string,
  };
}

export function mapSveSubmissionRow(r: Record<string, unknown>): SveSubmissionRecord {
  return {
    id: r.id as string,
    inviteId: (r.invite_id as string) ?? null,
    fullName: r.full_name as string,
    phone: r.phone as string,
    siteVisited: (r.site_visited as string) ?? null,
    visitDate: (r.visit_date as string) ?? null,
    journeyRating: (r.journey_rating as string) ?? null,
    siteManagerName: (r.site_manager_name as string) ?? null,
    relationshipRating: r.relationship_rating == null ? null : Number(r.relationship_rating),
    handlingFeedback: (r.handling_feedback as string) ?? null,
    siteDescriptionRating: (r.site_description_rating as string) ?? null,
    belowExpectationReason: (r.below_expectation_reason as string) ?? null,
    overallRating: r.overall_rating == null ? null : Number(r.overall_rating),
    npsScore: r.nps_score == null ? null : Number(r.nps_score),
    improvementSuggestions: (r.improvement_suggestions as string) ?? null,
    purchaseIntent: (r.purchase_intent as string) ?? null,
    additionalComments: (r.additional_comments as string) ?? null,
    createdAt: r.created_at as string,
  };
}

export function mapChatMessageRow(r: Record<string, unknown>): ChatMessage {
  return {
    id: r.id as string,
    senderKey: r.sender_key as string,
    senderName: r.sender_name as string,
    recipientKey: (r.recipient_key as string) ?? null,
    body: r.body as string,
    createdAt: r.created_at as string,
    read: !!r.read,
    attachmentData: (r.attachment_data as string) ?? null,
    attachmentType: (r.attachment_type as string) ?? null,
    attachmentName: (r.attachment_name as string) ?? null,
    kind: (r.kind as string) ?? null,
    refType: (r.ref_type as string) ?? null,
    refId: (r.ref_id as string) ?? null,
    replyToId: (r.reply_to_id as string) ?? null,
  };
}

export function mapComplaintRow(r: Record<string, unknown>): Complaint {
  return {
    id: r.id as string,
    agentKey: r.agent_key as string,
    agentName: (r.agent_name as string) ?? null,
    name: (r.name as string) ?? null,
    contact: (r.contact as string) ?? null,
    plot: (r.plot as string) ?? null,
    category: (r.category as string) ?? null,
    details: (r.details as string) ?? null,
    owner: (r.owner as string) ?? null,
    priority: (r.priority as string) ?? null,
    resolution: (r.resolution as string) ?? null,
    status: (r.status as string) ?? 'Open',
    createdAt: r.created_at as string,
    source: (r.source as string) ?? null,
    sentiment: (r.sentiment as string) ?? null,
  };
}

export function mapContractRequestRow(r: Record<string, unknown>): ContractRequest {
  return {
    id: r.id as string,
    leadId: r.lead_id as string,
    clientName: r.client_name as string,
    requestedBy: r.requested_by as string,
    requestedByName: r.requested_by_name as string,
    note: (r.note as string) ?? null,
    status: (r.status as ContractRequest['status']) ?? 'pending',
    createdAt: r.created_at as string,
    fulfilledAt: (r.fulfilled_at as string) ?? null,
  };
}

export function mapLeaveRequestRow(r: Record<string, unknown>): LeaveRequest {
  return {
    id: r.id as string,
    agentKey: r.agent_key as string,
    agentName: r.agent_name as string,
    year: Number(r.year),
    dates: (r.dates as string[]) ?? [],
    daysCount: Number(r.days_count ?? 0),
    letterText: (r.letter_text as string) ?? null,
    status: (r.status as LeaveRequest['status']) ?? 'pending',
    createdAt: r.created_at as string,
    decidedAt: (r.decided_at as string) ?? null,
    decidedBy: (r.decided_by as string) ?? null,
    decidedByName: (r.decided_by_name as string) ?? null,
    decidedSignature: (r.decided_signature as string) ?? null,
  };
}

export function mapAllocationRequestRow(r: Record<string, unknown>): AllocationRequest {
  return {
    id: r.id as string,
    leadId: r.lead_id as string,
    clientName: r.client_name as string,
    agentKey: r.agent_key as string,
    agentName: (r.agent_name as string) ?? null,
    percentPaid: r.percent_paid != null ? Number(r.percent_paid) : null,
    grandTotal: r.grand_total != null ? Number(r.grand_total) : null,
    amtPaid: r.amt_paid != null ? Number(r.amt_paid) : null,
    status: (r.status as AllocationRequest['status']) ?? 'Pending',
    plotNumber: (r.plot_number as string) ?? null,
    suggestedPlots: (r.suggested_plots as string) ?? null,
    note: (r.note as string) ?? null,
    allocatedBy: (r.allocated_by as string) ?? null,
    flagReason: (r.flag_reason as string) ?? null,
    flaggedBy: (r.flagged_by as string) ?? null,
    flaggedAt: (r.flagged_at as string) ?? null,
    history: Array.isArray(r.history) ? (r.history as AllocationRequest['history']) : [],
    createdAt: r.created_at as string,
    resolvedAt: (r.resolved_at as string) ?? null,
  };
}

export function mapNoteRow(r: Record<string, unknown>): Note {
  return {
    id: r.id as string,
    ownerKey: r.owner_key as string,
    title: (r.title as string) ?? '',
    body: (r.body as string) ?? '',
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

// Matches index.html's defaultConfig().leaderboardWeights exactly --
// production's real app_config.leaderboard_weights row currently holds
// these same values, but a fresh/never-configured row would come back
// null, so this is the fallback, not a guess.
export const DEFAULT_LEADERBOARD_WEIGHTS: LeaderboardWeights = {
  collected: 1 / 500,
  dealsClosed: 20,
  siteVisits: 5,
  tasksCompleted: 8,
  todosCompleted: 3,
  taskSpeedBonus: 5,
  regularity: 2,
  punctuality: 3,
};

export function mapConfigRow(r: Record<string, unknown>): Config {
  return {
    workEndTime: (r.work_end_time as string) ?? '17:00',
    targetPlotsPerMonth: Number(r.target_plots_per_month ?? 2),
    targets: (r.targets as Record<string, number>) ?? {},
    leaderboardWeights: { ...DEFAULT_LEADERBOARD_WEIGHTS, ...((r.leaderboard_weights as Partial<LeaderboardWeights>) ?? {}) },
    // Real production values (confirmed live, same on staging): cap 1000/500,
    // pool 500/plot, full/half list price 48000/24000 -- used as the
    // fallback for a fresh/never-configured row, not a guess.
    commissionFullCap: Number(r.commission_full_cap ?? 1000),
    commissionHalfCap: Number(r.commission_half_cap ?? 500),
    commissionPoolPerPlot: Number(r.commission_pool_per_plot ?? 500),
    fullPrice: Number(r.full_price ?? 48000),
    halfPrice: Number(r.half_price ?? 24000),
    fullDiscount: Number(r.full_discount ?? 0),
    halfDiscount: Number(r.half_discount ?? 0),
    int3: Number(r.int_3 ?? 750),
    int6: Number(r.int_6 ?? 1500),
    int9: Number(r.int_9 ?? 2250),
    int12: Number(r.int_12 ?? 3000),
    quoteCompanyName: (r.quote_company_name as string) ?? 'Trulander JSF Limited',
    quoteSiteName: (r.quote_site_name as string) ?? '',
    companyPhone: (r.company_phone as string) ?? '',
    companyEmail: (r.company_email as string) ?? '',
    companyTin: (r.company_tin as string) ?? '',
    quoteFooterAddress: (r.quote_footer_address as string) ?? '',
    receiptThanksText: (r.receipt_thanks_text as string) ?? 'Thank you for your payment. This receipt confirms the amount above was received by us and applied to your account.',
    receiptLogoImage: (r.receipt_logo_image as string) ?? null,
    quoteDocTypeText: (r.quote_doc_type_text as string) ?? 'Quotation with Payment Plan Schedule',
    quoteNotesText: (r.quote_notes_text as string) ?? '',
    quoteLandNoteText: (r.quote_land_note_text as string) ?? '',
    contractCeoName: (r.contract_ceo_name as string) ?? 'FRANK ADU PEPRAH',
    contractPreamble: (r.contract_preamble as string) ?? '',
    contractDefinitions: (r.contract_definitions as string) ?? '',
    contractTerms: (r.contract_terms as string) ?? '',
    contractCoverImage: (r.contract_cover_image as string) ?? null,
    contractWordmarkImage: (r.contract_wordmark_image as string) ?? null,
    techFullPlotLengthFt: Number(r.tech_full_plot_length_ft ?? 70),
    techFullPlotWidthFt: Number(r.tech_full_plot_width_ft ?? 100),
    techHalfPlotLengthFt: Number(r.tech_half_plot_length_ft ?? 50),
    techHalfPlotWidthFt: Number(r.tech_half_plot_width_ft ?? 70),
    leaveTotalDays: Number(r.leave_total_days ?? 20),
    workDays: (r.work_days as number[]) ?? [1, 2, 3, 4, 5],
    eidObservingStaff: (r.eid_observing_staff as string[]) ?? [],
    referralPointsPerReferral: Number(r.referral_points_per_referral ?? 50),
    officeLat: r.office_lat != null ? Number(r.office_lat) : null,
    officeLng: r.office_lng != null ? Number(r.office_lng) : null,
    officeRadiusMeters: Number(r.office_radius_meters ?? 250),
    attendanceCutoffTime: (r.attendance_cutoff_time as string) ?? '09:00',
    workStartTime: (r.work_start_time as string) ?? '08:00',
  };
}

export function mapContractRow(r: Record<string, unknown>): Contract {
  return {
    id: r.id as string,
    leadId: r.lead_id as string,
    clientName: r.client_name as string,
    agentKey: (r.agent_key as string) ?? 'company',
    createdBy: r.created_by as string,
    createdByName: r.created_by_name as string,
    createdAt: r.created_at as string,
  };
}

// Raw leaderboard_rows() RPC row -> domain shape, minus `points` (computed
// separately by agentPoints() once the caller also has the weights config).
export function mapLeaderboardRawRow(r: Record<string, unknown>): Omit<LeaderboardRow, 'points'> {
  return {
    staffKey: r.staff_key as string,
    staffName: r.staff_name as string,
    totalCollected: Number(r.total_collected ?? 0),
    dealsClosedYear: Number(r.deals_closed_year ?? 0),
    siteVisits: Number(r.site_visits ?? 0),
    tasksCompleted: Number(r.tasks_completed ?? 0),
    avgTaskDays: r.avg_task_days != null ? Math.round(Number(r.avg_task_days) * 10) / 10 : null,
    todosCompleted: Number(r.todos_completed ?? 0),
    daysAttended: Number(r.days_attended ?? 0),
    onTimeDays: Number(r.on_time_days ?? 0),
  };
}

export function mapDownloadRow(r: Record<string, unknown>): DownloadRecord {
  return {
    id: r.id as string,
    userKey: r.user_key as string,
    userName: r.user_name as string,
    filename: r.filename as string,
    kind: r.kind as string,
    fileData: (r.file_data as string) ?? null,
    createdAt: r.created_at as string,
  };
}

export function mapAchievementDefRow(r: Record<string, unknown>): AchievementDef {
  return {
    id: r.id as string,
    key: r.key as string,
    label: r.label as string,
    description: (r.description as string) ?? null,
    icon: (r.icon as string) ?? null,
    criteriaType: r.criteria_type as AchievementDef['criteriaType'],
    criteriaConfig: (r.criteria_config as AchievementDef['criteriaConfig']) ?? {},
    points: Number(r.points ?? 0),
    active: (r.active as boolean) ?? true,
    createdAt: r.created_at as string,
  };
}

export function mapStaffAchievementRow(r: Record<string, unknown>): StaffAchievement {
  return {
    id: r.id as string,
    staffKey: r.staff_key as string,
    staffName: (r.staff_name as string) ?? '',
    achievementId: r.achievement_id as string,
    earnedAt: r.earned_at as string,
    progress: (r.progress as StaffAchievement['progress']) ?? null,
  };
}

export function mapAuditEventRow(r: Record<string, unknown>): AuditEvent {
  return {
    id: Number(r.id),
    createdAt: r.created_at as string,
    category: r.category as AuditEvent['category'],
    eventType: r.event_type as string,
    severity: r.severity as AuditEvent['severity'],
    actorKey: (r.actor_key as string) ?? null,
    actorName: (r.actor_name as string) ?? null,
    entityType: (r.entity_type as string) ?? null,
    entityId: (r.entity_id as string) ?? null,
    summary: r.summary as string,
    detail: (r.detail as Record<string, unknown>) ?? null,
    source: r.source as string,
  };
}

export function mapReportArchiveRow(r: Record<string, unknown>): ReportArchiveEntry {
  return {
    id: r.id as string,
    reportDate: r.report_date as string,
    generatedAt: r.generated_at as string,
    recipients: (r.recipients as string) ?? null,
    generationStatus: r.generation_status as ReportArchiveEntry['generationStatus'],
    emailStatus: (r.email_status as ReportArchiveEntry['emailStatus']) ?? null,
    checksum: (r.checksum as string) ?? null,
    errorDetail: (r.error_detail as string) ?? null,
    retryCount: Number(r.retry_count ?? 0),
  };
}

export function mapPermissionDefRow(r: Record<string, unknown>): PermissionDef {
  return {
    key: r.key as string,
    label: r.label as string,
    description: (r.description as string) ?? null,
  };
}

export function mapPermissionOverrideRow(r: Record<string, unknown>): PermissionOverride {
  return {
    staffKey: r.staff_key as string,
    permissionKey: r.permission_key as string,
    granted: r.granted as boolean,
    grantedBy: (r.granted_by as string) ?? null,
    grantedAt: r.granted_at as string,
  };
}

export function mapBackupRow(r: Record<string, unknown>): BackupRecord {
  return {
    id: r.id as string,
    createdAt: r.created_at as string,
    triggerType: r.trigger_type as string,
    triggeredBy: (r.triggered_by as string) ?? null,
    triggeredByName: (r.triggered_by_name as string) ?? null,
    tableCounts: (r.table_counts as Record<string, number>) ?? {},
    sizeBytes: Number(r.size_bytes ?? 0),
    checksum: r.checksum as string,
  };
}
