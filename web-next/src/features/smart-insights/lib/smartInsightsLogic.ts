import type { Lead, Payment } from '../../../types/domain';
import { today, shiftMonth, monthKey, daysSince } from '../../../shared/lib/format';
import { linearForecastNextMonth } from '../../../shared/lib/forecast';
import { ghs } from '../../../shared/lib/format';
import type { IconName } from '../../../shared/ui/Icon';

// Port of index.html's getInsightLists()/computeSmartInsights() (index.
// html:9484-9954) -- proactive, auto-generated nudges from data already
// on hand, re-scanned every time the screen opens (no dismiss/snooze
// state, matching the original). One real check deliberately dropped:
// "overdue follow-ups" read `l.followDate` on a LEAD object -- verified
// live (information_schema.columns on both staging and production) that
// `leads` has no `follow_date` column at all; that field only exists on
// `enquiries`. The check was comparing a lead against a property no lead
// object has ever carried, so in real production data it always
// evaluates to an empty list -- a genuine latent dead-code bug in
// index.html, not ported forward here.

export type InsightKind = 'cold' | 'nearTrigger' | 'readyForAllocation' | 'stalledHigh';

export const INSIGHT_META: Record<InsightKind, { title: string; desc: string }> = {
  cold: { title: 'Going cold', desc: 'No next action set, added 10+ days ago' },
  readyForAllocation: { title: 'Ready for allocation', desc: '30% or more paid — eligible for a plot allocation request' },
  nearTrigger: { title: 'Near the 30% allocation mark', desc: 'Between 20% and 30% paid — one more payment away from triggering an allocation request' },
  stalledHigh: { title: 'High priority, no follow-up planned', desc: "Marked High priority but nothing scheduled next" },
};

export interface PctLead extends Lead {
  __pct?: number;
}

function isActive(l: Lead): boolean {
  return l.stage !== 'Lost' && l.amtPaid < l.grandTotal;
}

function pctPaid(l: Lead): number {
  if (!l.grandTotal) return 0;
  return Math.round((l.amtPaid / l.grandTotal) * 100);
}

export function getInsightLists(leads: Lead[]): Record<InsightKind, PctLead[]> {
  const active = leads.filter(isActive);
  const cold = active.filter((l) => !(l.nextAction ?? '').trim() && daysSince(l.date) >= 10);
  const nearTrigger = active
    .filter((l) => l.grandTotal > 0 && pctPaid(l) >= 20 && pctPaid(l) < 30)
    .map((l) => ({ ...l, __pct: pctPaid(l) }))
    .sort((a, b) => (b.__pct ?? 0) - (a.__pct ?? 0));
  const readyForAllocation = active
    .filter((l) => l.grandTotal > 0 && pctPaid(l) >= 30)
    .map((l) => ({ ...l, __pct: pctPaid(l) }))
    .sort((a, b) => (b.__pct ?? 0) - (a.__pct ?? 0));
  const stalledHigh = active.filter((l) => l.priority === 'High' && !(l.nextAction ?? '').trim());
  return { cold, nearTrigger, readyForAllocation, stalledHigh };
}

export interface SmartInsight {
  key: string;
  icon: IconName;
  tone: 'ok' | 'warn' | 'danger';
  text: string;
  detail?: string;
  kind?: InsightKind;
}

export function computeSmartInsights(leads: Lead[], payments: Payment[]): SmartInsight[] {
  const insights: SmartInsight[] = [];
  const { cold, nearTrigger, readyForAllocation, stalledHigh } = getInsightLists(leads);

  if (cold.length) {
    insights.push({
      key: 'cold',
      icon: 'warning',
      tone: 'warn',
      text: `${cold.length} lead${cold.length === 1 ? '' : 's'} ${cold.length === 1 ? 'has' : 'have'} no next action set and ${cold.length === 1 ? 'is' : 'are'} going cold`,
      detail: cold
        .slice(0, 3)
        .map((l) => l.name)
        .join(', ') + (cold.length > 3 ? ` +${cold.length - 3} more` : ''),
      kind: 'cold',
    });
  }

  if (readyForAllocation.length) {
    insights.push({
      key: 'readyForAllocation',
      icon: 'trophy',
      tone: 'ok',
      text: `${readyForAllocation.length} client${readyForAllocation.length === 1 ? ' has' : 's have'} crossed 30% — ready for plot allocation`,
      detail: readyForAllocation
        .slice(0, 3)
        .map((l) => `${l.name} (${l.__pct}%)`)
        .join(', '),
      kind: 'readyForAllocation',
    });
  }

  if (nearTrigger.length) {
    insights.push({
      key: 'nearTrigger',
      icon: 'chartLine',
      tone: 'ok',
      text: `${nearTrigger.length} client${nearTrigger.length === 1 ? ' is' : 's are'} within reach of the 30% allocation mark`,
      detail: nearTrigger
        .slice(0, 3)
        .map((l) => `${l.name} (${l.__pct}%)`)
        .join(', '),
      kind: 'nearTrigger',
    });
  }

  if (stalledHigh.length) {
    insights.push({
      key: 'stalledHigh',
      icon: 'warning',
      tone: 'danger',
      text: `${stalledHigh.length} high-priority client${stalledHigh.length === 1 ? '' : 's'} ${stalledHigh.length === 1 ? 'has' : 'have'} no follow-up planned`,
      detail: stalledHigh
        .slice(0, 3)
        .map((l) => l.name)
        .join(', '),
      kind: 'stalledHigh',
    });
  }

  // Momentum -- this month vs last month collected (approved-only,
  // matching the app-wide rule established across Analytics/Data Check/
  // Management Reports).
  const approved = payments.filter((p) => (p.status ?? 'approved') === 'approved');
  const thisM = today().slice(0, 7);
  const lastM = shiftMonth(thisM, -1);
  const thisVal = approved.filter((p) => monthKey(p.date) === thisM).reduce((s, p) => s + p.amount, 0);
  const lastVal = approved.filter((p) => monthKey(p.date) === lastM).reduce((s, p) => s + p.amount, 0);
  if (lastVal > 0) {
    const delta = Math.round(((thisVal - lastVal) / lastVal) * 100);
    if (delta <= -20) {
      insights.push({ key: 'momentumDown', icon: 'chartLine', tone: 'danger', text: `Collections are down ${Math.abs(delta)}% vs last month`, detail: `${ghs(thisVal)} so far vs ${ghs(lastVal)} last month` });
    } else if (delta >= 20) {
      insights.push({ key: 'momentumUp', icon: 'chartLine', tone: 'ok', text: `Collections are up ${delta}% vs last month`, detail: `${ghs(thisVal)} so far vs ${ghs(lastVal)} last month` });
    }
  }

  // Simple revenue forecast -- linear trend over the last 3 months of
  // real approved payments.
  const fvals = [2, 1, 0].map((i) => {
    const key = shiftMonth(thisM, -i);
    return approved.filter((p) => monthKey(p.date) === key).reduce((s, p) => s + p.amount, 0);
  }) as [number, number, number];
  const forecast = linearForecastNextMonth(fvals);
  if (forecast != null) {
    insights.push({ key: 'forecast', icon: 'barChart', tone: 'ok', text: `Projected to collect ~${ghs(forecast)} next month`, detail: 'Based on the trend across your last 3 months of real payments — a projection, not a promise.' });
  }

  if (!insights.length) {
    insights.push({ key: 'clean', icon: 'check', tone: 'ok', text: 'Nothing urgent right now — pipeline looks healthy', detail: 'Smart insights re-scan every time you open this.' });
  }

  return insights;
}
