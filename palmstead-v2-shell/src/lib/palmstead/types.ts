// Palmstead's real staff identity shape -- ported directly from web-next's
// src/types/domain.ts Profile/Role (same `profiles` table, same real
// columns: agent_key/name/role/email/active/signature_data/phone).
// Kept minimal here; grows as each app gets ported and needs more of the
// real schema surfaced.
export type Role = "agent" | "manager";

export interface Profile {
  key: string;
  name: string;
  role: Role;
  email?: string;
  active: boolean;
  signatureData: string | null;
  phone?: string;
}
