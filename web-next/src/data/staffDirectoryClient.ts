import { getSupabaseClient } from './client';

// Deliberately separate from data/source.ts's DataSource seam, same
// reasoning as receiptClient.ts/sveClient.ts -- this is queried BEFORE
// sign-in, so there's no session/profile/demoMode to key off of yet. The
// real `staff_directory` view (confirmed live on both projects, name/
// email/role/agent_key/active only -- no phone/signature/other sensitive
// profile columns) exists specifically so the login screen can show a
// searchable staff picker without exposing the full `profiles` table to
// an anonymous visitor. Matches index.html's refreshStaffList() live
// branch (index.html:6979-6989).
export interface StaffDirectoryEntry {
  name: string;
  email: string;
  role: 'agent' | 'manager';
  key: string;
}

export async function fetchStaffDirectory(): Promise<StaffDirectoryEntry[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const { data, error } = await client.from('staff_directory').select('name,email,role,agent_key,active').eq('active', true);
  if (error || !data) return [];
  return data
    .map((r) => ({ name: r.name as string, email: r.email as string, role: r.role as 'agent' | 'manager', key: r.agent_key as string }))
    .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'manager' ? 1 : -1));
}
