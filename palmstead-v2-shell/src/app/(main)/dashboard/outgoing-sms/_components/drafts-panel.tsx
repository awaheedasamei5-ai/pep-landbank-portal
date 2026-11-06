"use client";

import { useState } from "react";

import { Check, X } from "lucide-react";

import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

import {
  type OutboundDraft,
  friendlyError,
  useApproveAndSendDraft,
  useDismissDraft,
  useReviewableOutboundDrafts,
  useShadowReviews,
} from "./use-outgoing-sms";

const ANGLE_LABELS: Record<string, string> = {
  reassurance: "Reassurance",
  addressing_objections: "Addressing objections",
  flexible_plans: "Flexible plans",
  personal_checkin: "Personal check-in",
  gentle_urgency: "Gentle urgency",
  social_proof: "Social proof",
  plot_benefits: "Plot benefits",
};

function dateLabel(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// Phase D (docs/plans/48): shadow-mode AI review, read-only. Does not block
// sending -- Management still reviews and confirms every closing SMS by
// hand regardless of what this badge says, this is purely informational
// while rejection rates are being measured.
function ShadowReviewBadge({
  outboxRowId,
  reviews,
}: {
  outboxRowId: string;
  reviews: Record<string, { ai_decision: string | null; validator_verdict: string }> | undefined;
}) {
  const review = reviews?.[outboxRowId];
  if (!review) return <Badge variant="outline">AI review: not yet run</Badge>;
  const flagged = review.ai_decision === "DO_NOT_SEND" || review.validator_verdict === "FAIL";
  return (
    <Badge variant={flagged ? "destructive" : "outline"}>
      AI review: {review.ai_decision ?? "pending"}
      {review.validator_verdict === "FAIL" && " · validator flagged"}
    </Badge>
  );
}

export function DraftsPanel() {
  const drafts = useReviewableOutboundDrafts();
  const approve = useApproveAndSendDraft();
  const dismiss = useDismissDraft();
  const [open, setOpen] = useState<OutboundDraft | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const rows = drafts.data ?? [];
  const shadow = useShadowReviews(rows.map((r) => r.id));

  if (drafts.isLoading) return <Skeleton className="h-40 w-full" />;
  if (drafts.error) return <p className="text-destructive text-sm">{friendlyError(drafts.error)}</p>;

  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No closing/nurture SMS awaiting review right now. New ones are drafted automatically on the 1st of each month
        for leads who have made no commitment yet.
      </p>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        {rows.map((row) => (
          <div
            key={row.id}
            className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <div className="font-medium">{row.recipient_name}</div>
              <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
                <span>{row.recipient_phone ?? "No phone on file"}</span>
                {row.angle && <Badge variant="secondary">{ANGLE_LABELS[row.angle] ?? row.angle}</Badge>}
                <span>{dateLabel(row.created_at)}</span>
                {row.status === "needs_review" && (
                  <Badge variant="destructive">Held: failed an automatic accuracy check</Badge>
                )}
                <ShadowReviewBadge outboxRowId={row.id} reviews={shadow.data} />
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" variant="outline" disabled={dismiss.isPending} onClick={() => dismiss.mutate(row.id)}>
                <X data-icon="inline-start" /> Dismiss
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setOpen(row);
                  setText(row.body);
                  setError(null);
                }}
              >
                Review & send
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog
        open={Boolean(open)}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setOpen(null);
            setText("");
            setError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Confirm the closing SMS</DialogTitle>
          </DialogHeader>
          {open && (
            <div className="flex flex-col gap-3 text-sm">
              <div className="rounded-md bg-muted p-3">
                <div className="font-medium">{open.recipient_name}</div>
                <div className="mt-1 text-muted-foreground">{open.recipient_phone ?? "No phone on file"}</div>
              </div>
              <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} />
              {error && (
                <p role="alert" className="text-destructive text-sm">
                  {error}
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <SubmitButton
              loading={approve.isPending}
              disabled={!open || !text.trim()}
              onClick={async () => {
                if (!open) return;
                try {
                  await approve.mutateAsync({ id: open.id, body: text });
                  setOpen(null);
                  setText("");
                  setError(null);
                } catch (e) {
                  setError(friendlyError(e));
                }
              }}
            >
              <Check data-icon="inline-start" /> Confirm & send
            </SubmitButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
