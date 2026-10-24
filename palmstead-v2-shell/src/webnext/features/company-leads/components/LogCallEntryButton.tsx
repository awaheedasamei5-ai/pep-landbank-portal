"use client";

import { useState } from "react";
import { Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useCompanyLeads } from "../hooks/useCompanyLeads";
import { LogCallDialog } from "./LogCallDialog";
import type { Lead } from "../../../types/domain";

// docs/plans/28-company-leads-engagement-upgrade-plan.md Phase 1 -- the
// Call Log page's primary action. Real brief ask: "staff search and
// select an existing client's name; display phone and recent context
// to confirm the choice." A CommandDialog picker (same real component
// the app's own global search already uses) over useCompanyLeads()'s
// already-loaded list, then the real LogCallDialog for the chosen lead.
export function LogCallEntryButton() {
  const { data: leads } = useCompanyLeads();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] = useState<Lead | null>(null);

  return (
    <>
      <Button type="button" onClick={() => setPickerOpen(true)}>
        <Phone />
        Log a call
      </Button>

      <CommandDialog open={pickerOpen} onOpenChange={setPickerOpen} title="Choose a client" description="Search a company lead by name or contact">
        <Command>
          <CommandInput placeholder="Search by name or phone…" />
          <CommandList>
            <CommandEmpty>No client found.</CommandEmpty>
            <CommandGroup>
              {(leads ?? []).map((l) => (
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
