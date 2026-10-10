"use client";

import { useState } from "react";
import { Check, Copy, Download, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuthStore } from "@/stores/auth/auth-store";

import type { Payment } from "./use-finance-payments";
import { useDownloadReceipt, useIssueReceiptLink, useReceiptConfig, useReceiptLeadInfo } from "./use-finance-receipts";

// Real post-approval receipt flow (matches V1's real offerSendReceipt(),
// index.html:18800) -- shown right after a payment is approved (either
// directly by Management, or via the approval queue). Download builds the
// same branded PDF V1 always built; the share link reuses the real
// receipt_share_links/get-receipt infrastructure already live from the
// web-next phase, so a client (or a staff member on the client's behalf)
// can open it from any device without needing to sign in.
function waNumberFromPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("233")) return digits;
  if (digits.startsWith("0") && digits.length === 10) return `233${digits.slice(1)}`;
  return digits;
}

function money(n: number): string {
  return `GHS ${n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function ReceiptModal({ payment, open, onOpenChange }: { payment: Payment | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const profile = useAuthStore((s) => s.profile);
  const { data: config } = useReceiptConfig();
  const { data: lead } = useReceiptLeadInfo(payment?.leadId ?? null);
  const download = useDownloadReceipt(config, profile?.signatureData, profile?.name);
  const issueLink = useIssueReceiptLink(config, profile?.signatureData, profile?.name, profile?.key);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!payment) return null;

  const waMessage = `Hi ${payment.leadName}, thank you for your payment of ${money(payment.amount)} towards your plot at Royal Palm Enclave.${shareUrl ? ` Your receipt: ${shareUrl}` : " It's saved to your Palmstead payment history."}`;
  const waHref = lead?.contact ? `https://wa.me/${waNumberFromPhone(lead.contact)}?text=${encodeURIComponent(waMessage)}` : null;

  async function handleGetLink() {
    const url = await issueLink.mutateAsync({ payment: payment as Payment, lead: lead ?? null });
    setShareUrl(url);
  }

  async function handleCopy() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Payment logged!</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {payment.leadName} · {money(payment.amount)}
          <br />
          Already saved to their payment history. Download or share the receipt below.
        </p>
        <div className="flex flex-col gap-2">
          <Button
            onClick={() => download.mutate({ payment: payment as Payment, lead: lead ?? null })}
            disabled={download.isPending || !config}
          >
            {download.isPending ? <Loader2 className="animate-spin" /> : <Download data-icon="inline-start" />}
            Download receipt PDF
          </Button>

          {!shareUrl ? (
            <Button variant="outline" onClick={handleGetLink} disabled={issueLink.isPending || !config}>
              {issueLink.isPending ? <Loader2 className="animate-spin" /> : null}
              Get a shareable link
            </Button>
          ) : (
            <div className="flex items-center gap-2 rounded-md border border-input px-3 py-2 text-xs">
              <span className="flex-1 truncate text-muted-foreground">{shareUrl}</span>
              <Button variant="ghost" size="icon-xs" onClick={handleCopy}>
                {copied ? <Check className="text-emerald-600" /> : <Copy />}
              </Button>
            </div>
          )}

          {waHref && (
            <Button variant="outline" asChild>
              <a href={waHref} target="_blank" rel="noreferrer">
                Send via WhatsApp
              </a>
            </Button>
          )}
        </div>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Not now
        </Button>
      </DialogContent>
    </Dialog>
  );
}
