import { today } from "@/lib/palmstead/format";
import type { PipelineLead, Stage } from "@/lib/palmstead/use-pipeline-leads";

// Direct port of the relevant subset of web-next's
// src/features/pipeline/lib/pipelineListLogic.ts -- same stage
// vocabulary/order and same real KPI definitions, so these numbers
// always agree with what Master Pipeline shows there. Filter dimensions
// beyond stage/search (payment state, site-visit state, allocation
// readiness, source, date range) are a later phase -- honestly not
// ported yet, this is a real first cut, not the full screen.
export const STAGE_LABELS: Record<Stage, string> = {
  "1": "New",
  "2A": "Discovery",
  "2B": "Qualified",
  "3": "Negotiation",
  "4": "Closed-Won",
  Lost: "Lost",
};
export const STAGE_ORDER: Stage[] = ["1", "2A", "2B", "3", "4", "Lost"];

export function isLeadOverdue(lead: PipelineLead): boolean {
  return !!lead.nextActionDate && lead.nextActionDate < today() && lead.stage !== "4" && lead.stage !== "Lost";
}

export interface PipelineKpis {
  pipelineValue: number;
  collected: number;
  outstanding: number;
  fullyPaid: number;
  highPriority: number;
}

export function computePipelineKpis(leads: PipelineLead[]): PipelineKpis {
  const pipelineValue = leads.reduce((s, l) => s + l.grandTotal, 0);
  const collected = leads.reduce((s, l) => s + l.amtPaid, 0);
  return {
    pipelineValue,
    collected,
    outstanding: Math.max(pipelineValue - collected, 0),
    fullyPaid: leads.filter((l) => l.stage === "4").length,
    highPriority: leads.filter((l) => (l.priority || "Low") === "High").length,
  };
}
