"use client";

import type { ReactNode } from "react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { usePortalTab } from "../../_components/portal-navigation";

const tabs = ["templates", "drafts", "sent"] as const;
const labels: Record<(typeof tabs)[number], string> = {
  templates: "Templates",
  drafts: "Drafts",
  sent: "Sent history",
};

export function OutgoingSmsTabs({ children }: { children: ReactNode }) {
  const [value, select] = usePortalTab("tab", tabs, "templates");
  return (
    <Tabs value={value} onValueChange={select} className="flex min-w-0 flex-col gap-4">
      <div className="max-w-full overflow-x-auto pb-2">
        <TabsList variant="line" aria-label="Outgoing SMS sections">
          {tabs.map((tab) => (
            <TabsTrigger key={tab} value={tab}>
              {labels[tab]}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {children}
    </Tabs>
  );
}
