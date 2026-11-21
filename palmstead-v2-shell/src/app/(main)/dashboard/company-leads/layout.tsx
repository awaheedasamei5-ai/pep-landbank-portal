import { AppViewGate } from "@/lib/permissions/app-view-gate";

export default function CompanyLeadsLayout({ children }: { children: React.ReactNode }) {
  return <AppViewGate permission="company_leads.view" label="Company Leads">{children}</AppViewGate>;
}

