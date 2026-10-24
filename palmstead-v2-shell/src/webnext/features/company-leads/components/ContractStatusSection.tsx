"use client";

import { useState } from "react";
import { CheckCircle2, CircleDashed, FileText, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useContracts } from "../../contracts/hooks/useContracts";
import { useCanFulfilContracts, useCreateContractRequest, useContractRequests } from "../../contracts/hooks/useContractRequests";
import { useKycCompletenessSummary } from "../../contracts/hooks/useContractAi";
import { useSendContractToClient } from "../../contracts/hooks/useSendContractToClient";
import { LeadKycDialog } from "../../contracts/components/LeadKycDialog";
import { friendlyError } from "../../../shared/lib/friendlyError";
import { fmtLongDate } from "../../../shared/lib/format";
import type { Lead } from "../../../types/domain";

// docs/plans/29-company-leads-full-system-blueprint.md Section 7.6 -- the
// Contract of Sale tab's current, real reachable state: KYC intake
// (reused verbatim from LeadKycDialog) and a contract request
// (useCreateContractRequest, already real). The full generate-PDF ->
// share-link -> SMS pipeline is Phase F, not yet built -- this tab
// honestly shows "request submitted, awaiting Management" rather than
// claiming a capability that doesn't exist yet.
export function ContractStatusSection({ lead }: { lead: Lead }) {
  const [kycOpen, setKycOpen] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sentInfo, setSentInfo] = useState<string | null>(null);
  const { data: contracts } = useContracts();
  const { data: requests } = useContractRequests();
  const createRequest = useCreateContractRequest();
  const canFulfil = useCanFulfilContracts();
  const sendContract = useSendContractToClient();
  const { data: completenessNote } = useKycCompletenessSummary(lead);

  const existingContract = (contracts ?? []).find((c) => c.leadId === lead.id);
  const existingRequest = (requests ?? []).find((r) => r.leadId === lead.id);
  const kycComplete = !!(lead.kyc?.idType && lead.kyc?.idNumber && lead.kyc?.contactName);

  async function generateAndSend() {
    setSendError(null);
    setSentInfo(null);
    try {
      const result = await sendContract.mutateAsync({ lead, contractRequestId: existingRequest?.id ?? null });
      setSentInfo(result.smsOk ? "Contract sent — the client was texted a download link." : "Contract generated, but the SMS could not be sent. Share the link directly.");
    } catch (e) {
      setSendError(friendlyError(e, "Could not generate and send the contract"));
    }
  }

  if (existingContract) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-normal">
            <FileText className="size-4" aria-hidden="true" />
            Contract of Sale
          </CardTitle>
          <CardDescription>Generated {fmtLongDate(existingContract.createdAt.slice(0, 10))} by {existingContract.createdByName}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Badge variant="outline" className="gap-1">
            <CheckCircle2 className="size-3.5" aria-hidden="true" />
            On file
          </Badge>
          <p className="text-sm text-muted-foreground">
            Open the Contracts app to download this client&apos;s contract, or resend the download link below.
          </p>
          {canFulfil && (
            <Button type="button" variant="outline" disabled={sendContract.isPending} onClick={generateAndSend}>
              <Send className="size-4" aria-hidden="true" />
              {sendContract.isPending ? "Sending…" : "Resend to client (new link)"}
            </Button>
          )}
          {sentInfo && <p className="text-sm text-muted-foreground">{sentInfo}</p>}
          {sendError && <p className="text-sm text-destructive">{sendError}</p>}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-normal">
          <FileText className="size-4" aria-hidden="true" />
          Contract of Sale
        </CardTitle>
        <CardDescription>No contract generated yet for this client.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between rounded-md border p-3 text-sm">
          <span className="flex items-center gap-2">
            {kycComplete ? <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" /> : <CircleDashed className="size-4 text-muted-foreground" aria-hidden="true" />}
            KYC details {kycComplete ? "complete" : "incomplete"}
          </span>
          <Button type="button" variant="outline" size="sm" onClick={() => setKycOpen(true)}>
            {kycComplete ? "Edit KYC" : "Fill KYC"}
          </Button>
        </div>

        {completenessNote && <p className="rounded-md border border-dashed bg-muted/40 p-3 text-sm text-muted-foreground">{completenessNote}</p>}

        {existingRequest && (
          <Badge variant={existingRequest.status === "fulfilled" ? "default" : "outline"}>
            {existingRequest.status === "fulfilled" ? "Fulfilled — contract in progress" : "Request pending with Management"}
          </Badge>
        )}

        <div className="flex flex-wrap gap-2">
          {!existingRequest && (
            <Button
              type="button"
              variant="outline"
              disabled={!kycComplete || createRequest.isPending}
              title={kycComplete ? undefined : "Fill in the client's KYC details first"}
              onClick={() => createRequest.mutate({ leadId: lead.id, clientName: lead.name })}
            >
              {createRequest.isPending ? "Requesting…" : "Request contract"}
            </Button>
          )}

          {canFulfil && (
            <Button
              type="button"
              disabled={!kycComplete || sendContract.isPending}
              title={kycComplete ? undefined : "Fill in the client's KYC details first"}
              onClick={generateAndSend}
            >
              <Send className="size-4" aria-hidden="true" />
              {sendContract.isPending ? "Generating…" : "Generate & send to client"}
            </Button>
          )}
        </div>

        {sentInfo && <p className="text-sm text-muted-foreground">{sentInfo}</p>}
        {sendError && <p className="text-sm text-destructive">{sendError}</p>}
      </CardContent>

      <LeadKycDialog lead={lead} open={kycOpen} onOpenChange={setKycOpen} />
    </Card>
  );
}
