"use client";

import { useState } from "react";

import { Inbox, Send, FileEdit, PenSquare } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { useAuthStore } from "@/stores/auth/auth-store";

import { ComposeMemoDialog, type ComposeSeed } from "./compose-memo-dialog";
import { MemoList } from "./memo-list";
import { buildMemoPdf } from "./memo-pdf";
import { MemoView } from "./memo-view";
import { useDeleteMemo, useMarkMemoRead, useMemoRealtime, useMemos, useUnreadMemoCount, type Memo, type MemoFolder } from "./use-memoranda";

// Three-pane layout cloned from src/app/(main)/mail/_components/mail.tsx
// (this repo's own real shadcn Mail example): same ResizablePanelGroup
// pattern, same h-[calc(100dvh-var(--dashboard-header-height))] fix for
// sitting full-height inside the dashboard shell. The folder rail replaces
// mail's full multi-account Sidebar (irrelevant here -- Memorandum has no
// multiple accounts or Social/Promotions-style folders, just Inbox/Sent/
// Drafts), kept as a plain nav list; MemoList/MemoView are literal clones
// of mail-list.tsx/mail-view.tsx edited for this app's real data shape.
const FOLDERS: { id: MemoFolder; label: string; icon: typeof Inbox }[] = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "sent", label: "Sent", icon: Send },
  { id: "drafts", label: "Drafts", icon: FileEdit },
];

export function MemorandumScreen() {
  const profile = useAuthStore((s) => s.profile);
  const myKey = profile?.key;
  const myName = profile?.name ?? "";

  const [folder, setFolder] = useState<MemoFolder>("inbox");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeSeed, setComposeSeed] = useState<ComposeSeed | null>(null);

  useMemoRealtime(myKey);
  const { data: memos, isLoading } = useMemos(folder, myKey);
  const { data: unread } = useUnreadMemoCount(myKey);
  const markRead = useMarkMemoRead();
  const deleteMemo = useDeleteMemo();

  const selected = memos?.find((m) => m.id === selectedId) ?? null;

  function selectMemo(m: Memo) {
    setSelectedId(m.id);
    if (folder === "inbox" && myKey) {
      const isPrimary = m.toKey === myKey && !m.read;
      const ccRow = m.cc.find((c) => c.staffKey === myKey);
      if (isPrimary || (ccRow && !ccRow.read)) {
        markRead.mutate({ memoId: m.id, myKey, isPrimaryRecipient: m.toKey === myKey });
      }
    }
  }

  function startCompose(seed?: ComposeSeed) {
    setComposeSeed(seed ?? null);
    setComposeOpen(true);
  }

  async function downloadPdf(m: Memo) {
    try {
      const doc = await buildMemoPdf(m);
      doc.save(`Memo_${m.subject.replace(/[^a-z0-9]+/gi, "_").slice(0, 40)}.pdf`);
    } catch {
      toast.error("Could not generate the PDF");
    }
  }

  async function handleDelete(m: Memo) {
    try {
      await deleteMemo.mutateAsync(m.id);
      toast.success(folder === "drafts" ? "Draft deleted" : "Memo deleted");
      if (selectedId === m.id) setSelectedId(null);
    } catch {
      toast.error("Could not delete this memo");
    }
  }

  if (!myKey) return null;

  return (
    <div className="flex h-[calc(100dvh-var(--dashboard-header-height))] min-h-0 min-w-0 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border px-4 py-3 lg:px-6">
        <PageHeader title="Memorandum" description="Internal letters and formal notices between staff." />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <ResizablePanelGroup orientation="horizontal" className="h-full">
          <ResizablePanel defaultSize="18%" minSize="14%" maxSize="28%" className="min-h-0">
            <div className="flex h-full flex-col border-r border-border p-3">
              <Button onClick={() => startCompose()} className="mb-3 justify-start gap-2">
                <PenSquare className="size-4" />
                Compose
              </Button>
              <nav className="flex flex-col gap-1">
                {FOLDERS.map((f) => {
                  const Icon = f.icon;
                  const active = folder === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => {
                        setFolder(f.id);
                        setSelectedId(null);
                      }}
                      className={`flex items-center justify-between rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                        active ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:bg-accent/50"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <Icon className="size-4" />
                        {f.label}
                      </span>
                      {f.id === "inbox" && !!unread && <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">{unread}</span>}
                    </button>
                  );
                })}
              </nav>
            </div>
          </ResizablePanel>
          <ResizableHandle />

          <ResizablePanel defaultSize="32%" minSize="24%" maxSize="45%" className="min-h-0">
            {isLoading ? (
              <div className="space-y-3 p-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : (
              <MemoList folder={folder} memos={memos ?? []} myKey={myKey} selectedId={selectedId} onSelectMemo={selectMemo} />
            )}
          </ResizablePanel>
          <ResizableHandle />

          <ResizablePanel defaultSize="50%" minSize="30%" className="min-h-0">
            <MemoView
              memo={selected}
              canDelete={!!selected && (selected.fromKey === myKey || profile?.role === "manager")}
              isOwnDraft={folder === "drafts" && selected?.fromKey === myKey}
              onClose={() => setSelectedId(null)}
              onReply={() => selected && startCompose({ replyTo: { toKey: selected.fromKey, toName: selected.fromName, subject: selected.subject }, parentId: selected.id })}
              onEditDraft={() => selected && startCompose({ editingMemo: selected })}
              onDownloadPdf={() => selected && downloadPdf(selected)}
              onDelete={() => selected && handleDelete(selected)}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      <ComposeMemoDialog open={composeOpen} onOpenChange={setComposeOpen} myKey={myKey} myName={myName} seed={composeSeed} />
    </div>
  );
}
