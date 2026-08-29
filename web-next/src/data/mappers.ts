import type { Lead, Payment, Plot, Referral, ScheduleItem, ScheduleItemStatus, SiteVisit, StreakRow, Config } from '../types/domain';

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
  };
}

export function mapPaymentRow(r: Record<string, unknown>): Payment {
  return {
    id: r.id as string,
    leadId: r.lead_id as string,
    agentKey: r.agent_key as string,
    amount: Number(r.amount ?? 0),
    date: r.payment_date as string,
  };
}

const DB_TO_DOMAIN_STATUS: Record<string, ScheduleItemStatus> = { open: 'open', done: 'closed', cancelled: 'cancelled', rescheduled: 'rescheduled' };
const DOMAIN_TO_DB_STATUS: Record<ScheduleItemStatus, string> = { open: 'open', closed: 'done', cancelled: 'cancelled', rescheduled: 'rescheduled' };

export function mapScheduleItemRow(r: Record<string, unknown>): ScheduleItem {
  return {
    id: r.id as string,
    kind: r.kind as ScheduleItem['kind'],
    ownerKey: r.owner_key as string,
    assignedTo: (r.assigned_to as string) ?? (r.owner_key as string),
    date: (r.item_date as string) ?? (r.due_date as string),
    status: DB_TO_DOMAIN_STATUS[r.status as string] ?? 'open',
    title: r.title as string,
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

export function mapConfigRow(r: Record<string, unknown>): Config {
  return {
    workEndTime: (r.work_end_time as string) ?? '17:00',
    targetPlotsPerMonth: Number(r.target_plots_per_month ?? 2),
    targets: (r.targets as Record<string, number>) ?? {},
  };
}
