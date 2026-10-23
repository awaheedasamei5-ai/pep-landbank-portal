"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUpdateLead } from "../../pipeline/hooks/useLead";
import { friendlyError } from "../../../shared/lib/friendlyError";
import { useKycCompletenessSummary } from "../hooks/useContractAi";
import type { Lead, LeadKyc } from "../../../types/domain";

const ID_TYPES = ["Voter's ID", "Passport", "Ghana Card", "Driver's License"];
const LAND_USAGE_OPTIONS = ["Residential", "Commercial"];

// Native shadcn rebuild of web-next's LeadKycModal (CONTRACT_OF_SALE_BLUEPRINT.md
// §6.4) -- same real fields (lead.kyc jsonb) and the same AI completeness
// summary (useKycCompletenessSummary), presented as a real Dialog instead of
// the CSS-module Modal, matching this shell's own dialog conventions.
export function LeadKycDialog({
  lead,
  open,
  onOpenChange,
  onSaved,
  allowSkip = true,
}: {
  lead: Lead;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (kyc: LeadKyc) => void;
  allowSkip?: boolean;
}) {
  const update = useUpdateLead();
  const [kyc, setKyc] = useState<LeadKyc>(lead.kyc ?? {});
  const [error, setError] = useState<string | null>(null);
  const { data: completenessNote } = useKycCompletenessSummary({ ...lead, kyc });

  function set<K extends keyof LeadKyc>(key: K, value: string) {
    setKyc((k) => ({ ...k, [key]: value }));
  }

  async function save() {
    setError(null);
    try {
      await update.mutateAsync({ id: lead.id, patch: { kyc } });
      onSaved?.(kyc);
      onOpenChange(false);
    } catch (e) {
      setError(friendlyError(e, "Could not save these details"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>KYC — {lead.name}</DialogTitle>
          <DialogDescription>Know-your-customer details, baked into the generated contract.</DialogDescription>
        </DialogHeader>

        {completenessNote && (
          <div className="flex items-start gap-2 rounded-md border border-dashed bg-muted/40 p-3 text-sm">
            <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-primary">AI</span>
            <span className="text-muted-foreground">{completenessNote}</span>
          </div>
        )}

        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Personal details</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Nationality</Label>
            <Input value={kyc.nationality ?? ""} onChange={(e) => set("nationality", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Occupation</Label>
            <Input value={kyc.occupation ?? ""} onChange={(e) => set("occupation", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Date of birth</Label>
            <Input type="date" value={kyc.dob ?? ""} onChange={(e) => set("dob", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>ID type</Label>
            <Select value={kyc.idType ?? ""} onValueChange={(v) => set("idType", v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {ID_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>ID number</Label>
            <Input value={kyc.idNumber ?? ""} onChange={(e) => set("idNumber", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={kyc.email ?? ""} onChange={(e) => set("email", e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Location / address</Label>
          <Input value={kyc.location ?? ""} onChange={(e) => set("location", e.target.value)} />
        </div>

        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contact person</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={kyc.contactName ?? ""} onChange={(e) => set("contactName", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input value={kyc.contactPhone ?? ""} onChange={(e) => set("contactPhone", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={kyc.contactEmail ?? ""} onChange={(e) => set("contactEmail", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Relation</Label>
            <Input value={kyc.contactRelation ?? ""} onChange={(e) => set("contactRelation", e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Contact person&apos;s address</Label>
          <Input value={kyc.contactAddress ?? ""} onChange={(e) => set("contactAddress", e.target.value)} />
        </div>

        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Land usage</p>
        <div className="space-y-1.5">
          <Label>Intended usage</Label>
          <Select value={kyc.landUsage ?? ""} onValueChange={(v) => set("landUsage", v)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              {LAND_USAGE_OPTIONS.map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {kyc.landUsage && (
          <div className="space-y-1.5">
            <Label>Detail</Label>
            <Input placeholder="e.g. Family home, retail shop" value={kyc.landUsageDetail ?? ""} onChange={(e) => set("landUsageDetail", e.target.value)} />
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          {allowSkip && (
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Skip for now
            </Button>
          )}
          <Button type="button" onClick={save} disabled={update.isPending}>
            {update.isPending ? "Saving…" : "Save KYC details"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
