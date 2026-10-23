import { useLead } from "../../pipeline/hooks/useLead";
import { useContractGenerations, useContractApprovals } from "../hooks/useContractTemplates";
import { cn } from "cn";
import type { ContractRequest } from "../../../types/domain";

// CONTRACT_OF_SALE_BLUEPRINT.md §5 -- V3's own named stage language, wired
// to real deterministic signals (no separate tracked-state machine exists
// in the data model). Honestly not perfectly monotonic: a manager can
// generate+download a document before clicking "Mark fulfilled" (the two
// actions are independent today), so "Downloaded" can show complete while
// "Approved" doesn't -- shown as-is rather than faking an enforced order.
const STAGES: { key: "request" | "dataCheck" | "draft" | "review" | "approved" | "downloaded"; label: string }[] = [
  { key: "request", label: "Request" },
  { key: "dataCheck", label: "Data check" },
  { key: "draft", label: "Draft" },
  { key: "review", label: "Review" },
  { key: "approved", label: "Approved" },
  { key: "downloaded", label: "Downloaded" },
];

export function ContractProgressRail({ request }: { request: ContractRequest }) {
  const { data: lead } = useLead(request.leadId);
  const { data: generations } = useContractGenerations();
  const leadGenerations = (generations ?? []).filter((g) => g.leadId === request.leadId);
  const latestGen = leadGenerations[0] ?? null;
  const { data: approvals } = useContractApprovals(latestGen?.templateVersionId ?? "");

  const hasKyc = !!lead?.kyc && Object.values(lead.kyc).some((v) => v);
  const hasDraft = leadGenerations.length > 0;
  const templateApproved = !!latestGen?.templateVersionId && (approvals ?? []).some((a) => a.status === "approved");
  const reviewed = templateApproved || request.status === "fulfilled";
  const approved = request.status === "fulfilled";
  const downloaded = hasDraft;

  const completed: Record<(typeof STAGES)[number]["key"], boolean> = {
    request: true,
    dataCheck: hasKyc,
    draft: hasDraft,
    review: reviewed,
    approved,
    downloaded,
  };
  const currentIndex = STAGES.findIndex((s) => !completed[s.key]);

  return (
    <div className="flex flex-wrap items-start gap-x-1 py-2">
      {STAGES.map((s, i) => {
        const done = completed[s.key];
        const isCurrent = !done && i === currentIndex;
        const prevDone = i > 0 && completed[STAGES[i - 1].key];
        return (
          <div key={s.key} className="flex items-center">
            {i > 0 && <span className={cn("mx-1 h-px w-6", prevDone ? "bg-primary" : "bg-border")} />}
            <div className="flex flex-col items-center gap-1">
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full border text-[11px] font-semibold",
                  done ? "border-primary bg-primary text-primary-foreground" : isCurrent ? "border-primary text-primary" : "border-border text-muted-foreground",
                )}
              >
                {done ? "✓" : i + 1}
              </span>
              <span className={cn("text-[11px] whitespace-nowrap", isCurrent ? "font-medium text-foreground" : "text-muted-foreground")}>{s.label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
