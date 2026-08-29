import type { Client, Lead } from '../../../types/domain';

// Same identity match production's own client-portal RLS policies use
// (leads_client_sel etc: lower(trim(name)) + right(digits(contact), 9)) --
// reusing it here means a client who appears under slightly different
// contact formatting still groups into one row, exactly like production
// already treats them as the same person.
export function clientKey(name: string, contact: string): string {
  const digits = contact.replace(/\D/g, '').slice(-9);
  return `${name.trim().toLowerCase()}|${digits}`;
}

export function groupLeadsByClient(leads: Lead[]): Client[] {
  const map = new Map<string, Client>();

  for (const l of leads) {
    const key = clientKey(l.name, l.contact);
    const existing = map.get(key);
    if (existing) {
      existing.leadIds.push(l.id);
      existing.leadCount += 1;
      existing.totalValue += l.grandTotal;
      existing.totalPaid += l.amtPaid;
      if (l.date > existing.latestDate) existing.latestDate = l.date;
    } else {
      map.set(key, {
        name: l.name,
        contact: l.contact,
        leadIds: [l.id],
        leadCount: 1,
        totalValue: l.grandTotal,
        totalPaid: l.amtPaid,
        latestDate: l.date,
      });
    }
  }

  return [...map.values()].sort((a, b) => (a.latestDate < b.latestDate ? 1 : -1));
}
