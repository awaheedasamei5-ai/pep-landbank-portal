import type { PipelineLead } from "@/lib/palmstead/use-pipeline-leads";

// Direct port of web-next's src/features/clients/lib/groupClients.ts --
// Client Database has no separate `clients` table in the real schema
// (confirmed there and re-confirmed here); it's a client-side grouping
// of the same real `leads` rows Master Pipeline already queries, keyed
// the same way production's own client-portal RLS policies identify a
// client (lower/trim name + last 9 digits of contact), so two leads for
// the same person with slightly different contact formatting still
// group into one row.
export interface ClientGroup {
  key: string;
  name: string;
  contact: string;
  leadIds: string[];
  leadCount: number;
  totalValue: number;
  totalPaid: number;
  latestDate: string;
}

export function clientKey(name: string, contact: string): string {
  const digits = contact.replace(/\D/g, "").slice(-9);
  return `${name.trim().toLowerCase()}|${digits}`;
}

export function groupLeadsByClient(leads: PipelineLead[]): ClientGroup[] {
  const map = new Map<string, ClientGroup>();
  for (const l of leads) {
    const key = clientKey(l.name, l.contact);
    const existing = map.get(key);
    if (existing) {
      existing.leadIds.push(l.id);
      existing.leadCount += 1;
      existing.totalValue += l.grandTotal;
      existing.totalPaid += l.amtPaid;
      if (l.dateAdded > existing.latestDate) existing.latestDate = l.dateAdded;
    } else {
      map.set(key, {
        key,
        name: l.name,
        contact: l.contact,
        leadIds: [l.id],
        leadCount: 1,
        totalValue: l.grandTotal,
        totalPaid: l.amtPaid,
        latestDate: l.dateAdded,
      });
    }
  }
  return [...map.values()].sort((a, b) => (a.latestDate < b.latestDate ? 1 : -1));
}
