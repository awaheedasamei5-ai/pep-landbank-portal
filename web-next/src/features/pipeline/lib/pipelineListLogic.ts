import type { Lead, Stage } from '../../../types/domain';
import { today } from '../../../shared/lib/format';
import { getInsightLists } from '../../smart-insights/lib/smartInsightsLogic';

// Master Spec Section 4.1: "Stage funnel/tabs: New/Prospecting, Discovery,
// Qualified, Negotiation, Closed-Won/Lost, using the actual stage
// vocabulary already present in the data." The real internal codes
// (deriveStageFromPayment: '1' no payment yet, '2A' some paid, '2B' 30%+,
// '3' 70%+, '4' 100%) map cleanly onto that progression -- this is a new,
// separate label set for the list/filter UI specifically, deliberately
// NOT changing StageBadge's existing short-code display used everywhere
// else in the app already.
export const STAGE_FUNNEL_LABELS: Record<Stage, string> = {
  '1': 'New',
  '2A': 'Discovery',
  '2B': 'Qualified',
  '3': 'Negotiation',
  '4': 'Closed-Won',
  Lost: 'Lost',
};
export const STAGE_FUNNEL_ORDER: Stage[] = ['1', '2A', '2B', '3', '4', 'Lost'];

export type PaymentStateFilter = 'not_started' | 'partial' | 'fully_paid';
export type SiteVisitStateFilter = 'visited' | 'not_yet';
export type AllocationReadyFilter = 'ready' | 'not_ready';

export interface PipelineFilters {
  stage: Stage | '';
  priority: string | '';
  paymentState: PaymentStateFilter | '';
  siteVisitState: SiteVisitStateFilter | '';
  allocationReady: AllocationReadyFilter | '';
  source: string | '';
  dateFrom: string | '';
  dateTo: string | '';
  overdueOnly: boolean;
}

export const EMPTY_FILTERS: PipelineFilters = {
  stage: '',
  priority: '',
  paymentState: '',
  siteVisitState: '',
  allocationReady: '',
  source: '',
  dateFrom: '',
  dateTo: '',
  overdueOnly: false,
};

export function isLeadOverdue(lead: Lead): boolean {
  return !!lead.nextActionDate && lead.nextActionDate < today() && lead.stage !== '4' && lead.stage !== 'Lost';
}

function pctPaid(l: Lead): number {
  if (!l.grandTotal) return 0;
  return (l.amtPaid / l.grandTotal) * 100;
}

function paymentStateOf(l: Lead): PaymentStateFilter {
  const pct = pctPaid(l);
  if (pct >= 100) return 'fully_paid';
  if (pct > 0) return 'partial';
  return 'not_started';
}

// Master Spec Section 4.1's 8 filter dimensions: stage, priority, payment
// state, site-visit state, allocation readiness, source, date range,
// overdue next action.
export function filterLeads(leads: Lead[], f: PipelineFilters): Lead[] {
  const readyIds = new Set(getInsightLists(leads).readyForAllocation.map((l) => l.id));
  return leads.filter((l) => {
    if (f.stage && l.stage !== f.stage) return false;
    if (f.priority && (l.priority || 'Low') !== f.priority) return false;
    if (f.paymentState && paymentStateOf(l) !== f.paymentState) return false;
    if (f.siteVisitState) {
      const visited = l.siteVisit === 'Yes';
      if (f.siteVisitState === 'visited' && !visited) return false;
      if (f.siteVisitState === 'not_yet' && visited) return false;
    }
    if (f.allocationReady) {
      const ready = readyIds.has(l.id);
      if (f.allocationReady === 'ready' && !ready) return false;
      if (f.allocationReady === 'not_ready' && ready) return false;
    }
    if (f.source && (l.leadSource || '') !== f.source) return false;
    if (f.dateFrom && l.date < f.dateFrom) return false;
    if (f.dateTo && l.date > f.dateTo) return false;
    if (f.overdueOnly && !isLeadOverdue(l)) return false;
    return true;
  });
}

export interface PipelineKpis {
  pipelineValue: number;
  collected: number;
  outstanding: number;
  fullyPaid: number;
  siteVisits: number;
  highPriority: number;
  allocationReady: number;
}

// Master Spec Section 4.1's 7 KPI-strip metrics. siteVisitsCount is passed
// in separately (from useSiteVisits(), a different table with its own
// query) rather than derived from `leads` here.
export function computePipelineKpis(leads: Lead[], siteVisitsCount: number): PipelineKpis {
  const pipelineValue = leads.reduce((s, l) => s + l.grandTotal, 0);
  const collected = leads.reduce((s, l) => s + l.amtPaid, 0);
  return {
    pipelineValue,
    collected,
    outstanding: Math.max(pipelineValue - collected, 0),
    fullyPaid: leads.filter((l) => l.stage === '4').length,
    siteVisits: siteVisitsCount,
    highPriority: leads.filter((l) => (l.priority || 'Low') === 'High').length,
    allocationReady: getInsightLists(leads).readyForAllocation.length,
  };
}
