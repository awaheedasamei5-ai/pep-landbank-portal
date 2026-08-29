import { useQuery } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';

export function useAllLeadsReport() {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({ queryKey: ['reportsLeads'], queryFn: () => getDataSource(demoMode).leads.listAll() });
}

export function useAllEnquiriesReport() {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({ queryKey: ['reportsEnquiries'], queryFn: () => getDataSource(demoMode).enquiries.listAll() });
}

export function useAllComplaintsReport() {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({ queryKey: ['reportsComplaints'], queryFn: () => getDataSource(demoMode).complaints.listAll() });
}

export function useAllSiteVisitsReport() {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({ queryKey: ['reportsSiteVisits'], queryFn: () => getDataSource(demoMode).siteVisits.listAll() });
}
