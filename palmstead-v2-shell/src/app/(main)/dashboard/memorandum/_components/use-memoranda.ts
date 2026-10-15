"use client";

import { useEffect } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { requireSupabase } from "@/lib/supabase.client";

// Real Memorandum (09-memorandum-plan.md). The memos/memo_recipients tables
// and their RLS already existed live in sbydzrlzqxcdbudjaube before this app
// was built -- this hook layer is UI-side only, no schema change. RLS already
// scopes everything correctly (sender sees own, recipient sees non-draft
// addressed to them, Cc sees via is_memo_cc_recipient, manager sees all) --
// the folder filters below narrow further for the UI, they are not the
// security boundary.
export type MemoFolder = "inbox" | "sent" | "drafts";

export interface MemoRecipientRow {
  id: string;
  staffKey: string;
  staffName: string;
  read: boolean;
}

export interface Memo {
  id: string;
  fromKey: string;
  fromName: string;
  toKey: string;
  toName: string;
  subject: string;
  bodyHtml: string;
  parentId: string | null;
  kind: string;
  status: "draft" | "sent";
  read: boolean;
  createdAt: string;
  cc: MemoRecipientRow[];
}

type RawMemo = {
  id: string;
  from_key: string;
  from_name: string;
  to_key: string;
  to_name: string;
  subject: string;
  body_html: string;
  parent_id: string | null;
  kind: string;
  status: string;
  read: boolean;
  created_at: string;
};

type RawRecipient = {
  id: string;
  memo_id: string;
  staff_key: string;
  staff_name: string;
  read: boolean;
};

function mapMemo(r: RawMemo, cc: MemoRecipientRow[]): Memo {
  return {
    id: r.id,
    fromKey: r.from_key,
    fromName: r.from_name,
    toKey: r.to_key,
    toName: r.to_name,
    subject: r.subject,
    bodyHtml: r.body_html,
    parentId: r.parent_id,
    kind: r.kind,
    status: r.status === "draft" ? "draft" : "sent",
    read: r.read,
    createdAt: r.created_at,
    cc,
  };
}

async function fetchMemos(folder: MemoFolder, myKey: string): Promise<Memo[]> {
  const sb = requireSupabase();
  let query = sb.from("memos").select("*").order("created_at", { ascending: false });

  if (folder === "sent") query = query.eq("from_key", myKey).neq("status", "draft");
  else if (folder === "drafts") query = query.eq("from_key", myKey).eq("status", "draft");
  // Inbox: RLS already restricts to {to_key = me AND sent} OR {cc row for me} OR manager-sees-all.
  // We still ask broadly and let RLS filter, then exclude anything that is really "sent by me" below
  // so the inbox does not also show the sender's own copy of their own memo.

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as RawMemo[];
  const memoIds = rows.map((r) => r.id);
  let recipientsByMemo = new Map<string, RawRecipient[]>();
  if (memoIds.length) {
    const { data: recipients, error: recError } = await sb.from("memo_recipients").select("*").in("memo_id", memoIds);
    if (recError) throw recError;
    recipientsByMemo = new Map();
    for (const r of (recipients ?? []) as RawRecipient[]) {
      const list = recipientsByMemo.get(r.memo_id) ?? [];
      list.push(r);
      recipientsByMemo.set(r.memo_id, list);
    }
  }

  const mapped = rows.map((r) =>
    mapMemo(
      r,
      (recipientsByMemo.get(r.id) ?? []).map((c) => ({ id: c.id, staffKey: c.staff_key, staffName: c.staff_name, read: c.read })),
    ),
  );

  if (folder === "inbox") {
    return mapped.filter((m) => m.fromKey !== myKey && m.status !== "draft");
  }
  return mapped;
}

export function useMemos(folder: MemoFolder, myKey: string | undefined) {
  return useQuery({
    queryKey: ["memoranda", folder, myKey],
    queryFn: () => fetchMemos(folder, myKey as string),
    enabled: Boolean(myKey),
  });
}

export function useUnreadMemoCount(myKey: string | undefined) {
  return useQuery({
    queryKey: ["memoranda-unread", myKey],
    enabled: Boolean(myKey),
    refetchInterval: 30_000,
    queryFn: async (): Promise<number> => {
      const sb = requireSupabase();
      const [{ count: toCount }, { count: ccCount }] = await Promise.all([
        sb.from("memos").select("id", { count: "exact", head: true }).eq("to_key", myKey as string).eq("read", false),
        sb.from("memo_recipients").select("id", { count: "exact", head: true }).eq("staff_key", myKey as string).eq("read", false),
      ]);
      return (toCount ?? 0) + (ccCount ?? 0);
    },
  });
}

export interface SendMemoInput {
  id?: string; // present when sending/updating an existing draft
  fromKey: string;
  fromName: string;
  toKey: string;
  toName: string;
  subject: string;
  bodyHtml: string;
  parentId?: string | null;
  ccKeys: { key: string; name: string }[];
  status: "draft" | "sent";
}

export function useSaveMemo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SendMemoInput) => {
      const sb = requireSupabase();
      let memoId = input.id;

      if (memoId) {
        const { error } = await sb
          .from("memos")
          .update({ to_key: input.toKey, to_name: input.toName, subject: input.subject, body_html: input.bodyHtml, status: input.status })
          .eq("id", memoId);
        if (error) throw error;
      } else {
        const { data, error } = await sb
          .from("memos")
          .insert({
            from_key: input.fromKey,
            from_name: input.fromName,
            to_key: input.toKey,
            to_name: input.toName,
            subject: input.subject,
            body_html: input.bodyHtml,
            parent_id: input.parentId ?? null,
            kind: "memo",
            status: input.status,
          })
          .select("id")
          .single();
        if (error) throw error;
        memoId = data.id as string;
      }

      // Replace Cc set: delete existing rows for this memo, re-insert the current selection.
      await sb.from("memo_recipients").delete().eq("memo_id", memoId);
      if (input.ccKeys.length) {
        const { error: ccError } = await sb
          .from("memo_recipients")
          .insert(input.ccKeys.map((c) => ({ memo_id: memoId, staff_key: c.key, staff_name: c.name })));
        if (ccError) throw ccError;
      }
      return memoId as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["memoranda"] }),
  });
}

export function useDeleteMemo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const sb = requireSupabase();
      const { error } = await sb.from("memos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["memoranda"] }),
  });
}

export function useMarkMemoRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { memoId: string; myKey: string; isPrimaryRecipient: boolean }) => {
      const sb = requireSupabase();
      if (input.isPrimaryRecipient) {
        await sb.from("memos").update({ read: true }).eq("id", input.memoId);
      }
      await sb.from("memo_recipients").update({ read: true }).eq("memo_id", input.memoId).eq("staff_key", input.myKey);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["memoranda"] });
      qc.invalidateQueries({ queryKey: ["memoranda-unread"] });
    },
  });
}

// Real Supabase Realtime subscription, same pattern as V1's ensureMemosLiveSubscribed --
// new mail and read-state changes refresh the open folder/unread badge without reload.
export function useMemoRealtime(myKey: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!myKey) return;
    const sb = requireSupabase();
    const channel = sb
      .channel(`memoranda-${myKey}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "memos" }, () => {
        qc.invalidateQueries({ queryKey: ["memoranda"] });
        qc.invalidateQueries({ queryKey: ["memoranda-unread"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "memo_recipients" }, () => {
        qc.invalidateQueries({ queryKey: ["memoranda"] });
        qc.invalidateQueries({ queryKey: ["memoranda-unread"] });
      })
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, [myKey, qc]);
}
