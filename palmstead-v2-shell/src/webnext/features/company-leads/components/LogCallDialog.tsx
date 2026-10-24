"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLogCall } from "../hooks/useCallLog";
import { friendlyError } from "../../../shared/lib/friendlyError";
import type { Lead } from "../../../types/domain";

const ACTIONS = ["Call", "WhatsApp message", "Email", "Visit follow-up", "Other contact"];
const METHODS = ["Phone", "WhatsApp", "Email", "In person", "SMS"];
const OUTCOMES = ["Reached — interested", "Reached — not interested", "No answer", "Voicemail left", "Requested callback", "Wrong number"];

// docs/plans/28-company-leads-engagement-upgrade-plan.md Phase 1 -- the
// real "Log a call" entry point, the one genuinely missing capability:
// activity_log already had method/note/follow columns, but nothing in
// this app ever wrote them or offered a manual form. Native shadcn
// Dialog, same conventions as LeadKycDialog.
export function LogCallDialog({ lead, open, onOpenChange, onLogged }: { lead: Lead; open: boolean; onOpenChange: (open: boolean) => void; onLogged?: () => void }) {
  const logCall = useLogCall();
  const [action, setAction] = useState(ACTIONS[0]);
  const [method, setMethod] = useState(METHODS[0]);
  const [outcome, setOutcome] = useState<string>("");
  const [note, setNote] = useState("");
  const [follow, setFollow] = useState("");
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setAction(ACTIONS[0]);
    setMethod(METHODS[0]);
    setOutcome("");
    setNote("");
    setFollow("");
    setError(null);
  }

  async function save() {
    setError(null);
    try {
      await logCall.mutateAsync({
        leadId: lead.id,
        client: lead.name,
        action,
        outcome: outcome || null,
        method,
        note: note.trim() || null,
        follow: follow || null,
      });
      reset();
      onLogged?.();
      onOpenChange(false);
    } catch (e) {
      setError(friendlyError(e, "Could not log this call"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log a call — {lead.name}</DialogTitle>
          <DialogDescription>Record what happened and when to follow up next. This adds to {lead.name}&apos;s real contact history, it doesn&apos;t replace it.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={action} onValueChange={setAction}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTIONS.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Outcome</Label>
            <Select value={outcome} onValueChange={setOutcome}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="What happened?" />
              </SelectTrigger>
              <SelectContent>
                {OUTCOMES.map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did they say? Anything to remember for next time." rows={3} />
          </div>

          <div className="space-y-1.5">
            <Label>Next follow-up due (optional)</Label>
            <Input type="date" value={follow} onChange={(e) => setFollow(e.target.value)} />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={logCall.isPending}>
            {logCall.isPending ? "Logging…" : "Log call"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
