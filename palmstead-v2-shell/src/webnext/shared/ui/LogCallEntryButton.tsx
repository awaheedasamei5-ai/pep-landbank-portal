"use client";

import { useState } from "react";
import { Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { LogCallDialog } from "../../features/company-leads/components/LogCallDialog";
import type { Lead } from "../../types/domain";

// docs/plans/28-company-leads-engagement-upgrade-plan.md Phase 1 /
// docs/plans/29-company-leads-full-system-blueprint.md, generalized for
// Pipeline and Client Database -- the Call Log page's primary action: a
// CommandDialog picker over whichever leads the caller passes in (own
// pipeline, company-wide, or Company Leads), then the real LogCallDialog
// for the chosen lead.
export function LogCallEntryButton({ leads }: { leads: Lead[] }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] = useState<Lead | null>(null);

  return (
    <>
      <Button type="button" onClick={() => setPickerOpen(true)}>
        <Phone />
        Log a call
      </Button>

      <CommandDialog open={pickerOpen} onOpenChange={setPickerOpen} title="Choose a client" description="Search a lead by name or contact">
        <Command>
          <CommandInput placeholder="Search by name or phone…" />
          <CommandList>
            <CommandEmpty>No client found.</CommandEmpty>
            <CommandGroup>
              {leads.map((l) => (
                <CommandItem
                  key={l.id}
                  value={`${l.name} ${l.contact}`}
                  onSelect={() => {
                    setPickerOpen(false);
                    setSelected(l);
                  }}
                >
                  <div className="flex w-full items-center justify-between gap-3">
                    <span className="font-medium">{l.name}</span>
                    <span className="text-xs text-muted-foreground">{l.contact}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>

      {selected && <LogCallDialog lead={selected} open={!!selected} onOpenChange={(open) => !open && setSelected(null)} />}
    </>
  );
}
