"use client";

import { useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Sparkles, X } from "lucide-react";

import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { requireSupabase } from "@/lib/supabase.client";

// Phase I (client-ID integration plan, docs/plans/43 §5.2/§5.3): an
// overpayment already rolled forward into the real schedule the instant
// Management approved the payment (apply_finance_monthly_payment, unchanged).
// This panel only gates the CLIENT-FACING SMS announcing that change --
// Management reviews the real before/after numbers and the AI-drafted
// text, then taps once to send it, or dismisses it with nothing sent.

type Installment = { installmentNo: number; dueDate: string; dueAmount: number; paidAmount: number; status: string };
type ProposalRaw = {
  id: string;
  lead_id: string;
  payment_id: string;
  overpayment_amount: number;
  old_installments: Installment[];
  new_installments: Installment[];
  sms_draft: string | null;
  status: "pending" | "confirmed" | "dismissed";
  created_at: string;
  leads: { name: string; contact: string | null; plot_type: string | null } | { name: string; contact: string | null; plot_type: string | null }[] | null;
};

function ghs(value: number): string {
  return `GHS ${Number(value).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dateLabel(value: string): string {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function friendlyError(error: unknown): string {
  return error instanceof Error ? error.message : "That could not be completed. Try again.";
}

function nextDueLine(installments: Installment[]): string {
  const next = installments
    .filter((item) => item.status === "scheduled" || item.status === "part_paid")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  if (!next) return "The plan is now fully paid off.";
  return `${ghs(Number(next.dueAmount) - Number(next.paidAmount))} due ${dateLabel(next.dueDate)}`;
}

function normalizeGhanaPhone(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  if (/^0\d{9}$/.test(digits)) return `233${digits.slice(1)}`;
  if (/^233\d{9}$/.test(digits)) return digits;
  return null;
}

function useRecalcProposals() {
  return useQuery({
    queryKey: ["finance-schedule-recalc-proposals"],
    queryFn: async (): Promise<ProposalRaw[]> => {
      const { data, error } = await requireSupabase()
        .from("finance_schedule_recalc_proposals")
        .select(
          "id,lead_id,payment_id,overpayment_amount,old_installments,new_installments,sms_draft,status,created_at,leads(name,contact,plot_type)",
        )
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ProposalRaw[];
    },
  });
}

export function RecalcProposalsPanel() {
  const queryClient = useQueryClient();
  const proposals = useRecalcProposals();
  const [draftOpen, setDraftOpen] = useState<ProposalRaw | null>(null);
  const [draftText, setDraftText] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["finance-schedule-recalc-proposals"] });

  const generateDraft = useMutation({
    mutationFn: async (row: ProposalRaw) => {
      const settledCount = row.new_installments.filter(
        (item, i) => item.status === "paid" && row.old_installments[i]?.status !== "paid",
      ).length;
      const fullyPaid = row.new_installments.every((item) => item.status === "paid");
      const { data, error } = await requireSupabase().functions.invoke("ai-insights", {
        body: {
          kind: "payment_schedule_change_sms",
          context: { overpaymentAmount: row.overpayment_amount, settledCount: Math.max(settledCount, 1), fullyPaid },
        },
      });
      if (error) throw error;
      const sentence = String((data as { message?: string } | null)?.message ?? "").trim();
      if (!sentence) throw new Error("The AI did not return a draft. Try again.");
      return sentence;
    },
    onSuccess: (sentence, row) => {
      const lead = Array.isArray(row.leads) ? row.leads[0] : row.leads;
      const name = (lead?.name ?? "Client").split(" ")[0] || "Client";
      const plotType = (lead?.plot_type || "plot").toLowerCase();
      const full = `Hello ${name}, about your ${plotType} at the Royal Palm Enclave: ${sentence} Your next payment is now ${nextDueLine(row.new_installments)}. - Trulander JSF`;
      setDraftText(full);
      setDraftError(null);
    },
    onError: (error) => setDraftError(friendlyError(error)),
  });

  const saveDraft = useMutation({
    mutationFn: async ({ id, text }: { id: string; text: string }) => {
      const { error } = await requireSupabase().rpc("save_finance_schedule_recalc_sms_draft", {
        p_id: id,
        p_sms_draft: text,
      });
      if (error) throw error;
    },
    onError: (error) => setDraftError(friendlyError(error)),
  });

  const confirmAndSend = useMutation({
    mutationFn: async (row: ProposalRaw) => {
      await saveDraft.mutateAsync({ id: row.id, text: draftText });
      const { data, error } = await requireSupabase().rpc("confirm_finance_schedule_recalc_proposal", {
        p_id: row.id,
      });
      if (error) throw error;
      const result = data as { client_contact?: string | null; sms_draft?: string } | null;
      const phone = normalizeGhanaPhone(result?.client_contact ?? null);
      if (phone && result?.sms_draft) {
        // Fire-and-forget, matching the existing ds.sms.send discipline
        // elsewhere in this app: the schedule change itself is already
        // confirmed and recorded regardless of SMS delivery outcome.
        requireSupabase()
          .functions.invoke("send-sms", { body: { to: phone, message: result.sms_draft, sender: "Palmstead" } })
          .catch(() => {});
      }
    },
    onSuccess: () => {
      setDraftOpen(null);
      setDraftText("");
      setDraftError(null);
      invalidate();
    },
    onError: (error) => setDraftError(friendlyError(error)),
  });

  const dismiss = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await requireSupabase().rpc("dismiss_finance_schedule_recalc_proposal", { p_id: id });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  if (proposals.isLoading) return <Skeleton className="h-32 w-full" />;
  if (proposals.error) return null;
  if ((proposals.data ?? []).length === 0) return null;

  return (
    <>
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" /> Payment schedule changes awaiting
            review
          </CardTitle>
          <CardDescription>
            A client paid more than their current instalment required. The new schedule is already in effect below --
            review the message before it is sent, or dismiss if no SMS is needed.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {(proposals.data ?? []).map((row) => {
            const lead = Array.isArray(row.leads) ? row.leads[0] : row.leads;
            return (
              <div
                key={row.id}
                className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="font-medium">{lead?.name ?? "Client"}</div>
                  <div className="text-muted-foreground text-sm">
                    Overpaid by {ghs(row.overpayment_amount)} · New next due: {nextDueLine(row.new_installments)}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={dismiss.isPending}
                    onClick={() => dismiss.mutate(row.id)}
                  >
                    <X data-icon="inline-start" /> Dismiss
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setDraftOpen(row);
                      setDraftText(row.sms_draft ?? "");
                      setDraftError(null);
                      if (!row.sms_draft) generateDraft.mutate(row);
                    }}
                  >
                    Review & send
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(draftOpen)}
        onOpenChange={(open) => {
          if (!open) {
            setDraftOpen(null);
            setDraftText("");
            setDraftError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Confirm the schedule-change SMS</DialogTitle>
          </DialogHeader>
          {draftOpen && (
            <div className="flex flex-col gap-3 text-sm">
              <div className="rounded-md bg-muted p-3">
                <div className="font-medium">
                  {(Array.isArray(draftOpen.leads) ? draftOpen.leads[0] : draftOpen.leads)?.name ?? "Client"}
                </div>
                <div className="mt-1 text-muted-foreground">
                  Overpaid by {ghs(draftOpen.overpayment_amount)} · New next due: {nextDueLine(draftOpen.new_installments)}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                  <Sparkles className="size-3.5" /> AI-drafted, edit before sending
                </div>
                {generateDraft.isPending ? (
                  <Skeleton className="h-24 w-full" />
                ) : (
                  <Textarea
                    value={draftText}
                    onChange={(e) => setDraftText(e.target.value)}
                    rows={5}
                    placeholder="Drafting..."
                  />
                )}
              </div>
              {draftError && (
                <p role="alert" className="text-destructive text-sm">
                  {draftError}
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <SubmitButton
              loading={confirmAndSend.isPending}
              disabled={!draftOpen || !draftText.trim() || generateDraft.isPending}
              onClick={() => draftOpen && confirmAndSend.mutate(draftOpen)}
            >
              <Check data-icon="inline-start" /> Confirm & send
            </SubmitButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
