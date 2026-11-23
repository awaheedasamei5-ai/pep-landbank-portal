export function leadDestination(leadId: string, ownerKey: string | null | undefined): string | null {
  if (!ownerKey) return null;
  return ownerKey === 'company'
    ? `/dashboard/company-leads/${leadId}`
    : `/dashboard/pipeline/${leadId}`;
}
