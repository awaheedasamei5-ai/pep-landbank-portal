"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { requireSupabase } from "@/lib/supabase.client";
import { ONLINE_WINDOW_MS } from "@/lib/palmstead/use-presence-heartbeat";

// Real Staff Directory (OSS item 2, B.1) -- every active profile,
// company-wide. "Online now" is derived from the real presence heartbeat
// (use-presence-heartbeat.ts) writing profiles.last_seen_at, not a fake
// status.
export interface DirectoryStaff {
  agentKey: string;
  name: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  position: string | null;
  department: string | null;
  deskExtension: string | null;
  avatar: string | null;
  role: string;
  isOnline: boolean;
}

async function fetchDirectory(): Promise<DirectoryStaff[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("profiles")
    .select("agent_key,name,email,phone,whatsapp,position,department,desk_extension,avatar,role,active,last_seen_at")
    .eq("active", true)
    .order("name");
  if (error) throw error;

  const cutoff = Date.now() - ONLINE_WINDOW_MS;
  return (data ?? []).map((p) => ({
    agentKey: p.agent_key,
    name: p.name,
    email: p.email,
    phone: p.phone,
    whatsapp: p.whatsapp,
    position: p.position,
    department: p.department,
    deskExtension: p.desk_extension,
    avatar: p.avatar,
    role: p.role,
    isOnline: Boolean(p.last_seen_at && new Date(p.last_seen_at).getTime() > cutoff),
  }));
}

export function useDirectory() {
  return useQuery({ queryKey: ["staffDirectory"], queryFn: fetchDirectory, refetchInterval: 30_000 });
}

export interface ExternalContact {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  notes: string | null;
}

async function fetchMyContacts(ownerKey: string | undefined): Promise<ExternalContact[]> {
  if (!ownerKey) return [];
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("external_contacts")
    .select("id,name,company,email,phone,job_title,notes")
    .eq("owner_key", ownerKey)
    .order("name");
  if (error) throw error;
  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    company: c.company,
    email: c.email,
    phone: c.phone,
    jobTitle: c.job_title,
    notes: c.notes,
  }));
}

export function useMyContacts(ownerKey: string | undefined) {
  return useQuery({ queryKey: ["externalContacts", ownerKey], queryFn: () => fetchMyContacts(ownerKey), enabled: Boolean(ownerKey) });
}

export function useCreateContact(ownerKey: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Omit<ExternalContact, "id">) => {
      const sb = requireSupabase();
      const { error } = await sb.from("external_contacts").insert({
        owner_key: ownerKey,
        name: data.name,
        company: data.company,
        email: data.email,
        phone: data.phone,
        job_title: data.jobTitle,
        notes: data.notes,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["externalContacts", ownerKey] }),
  });
}

export function useDeleteContact(ownerKey: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const sb = requireSupabase();
      const { error } = await sb.from("external_contacts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["externalContacts", ownerKey] }),
  });
}
