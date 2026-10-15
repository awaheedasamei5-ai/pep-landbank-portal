"use client";

import { useState } from "react";

import { Inbox, Send, FileEdit, PenSquare, Reply, Download, Trash2, Paperclip } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { getInitials } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth/auth-store";

import { ComposeMemoDialog, type ComposeSeed } from "./compose-memo-dialog";
import { buildMemoPdf } from "./memo-pdf";
import { useDeleteMemo, useMarkMemoRead, useMemoRealtime, useMemos, useUnreadMemoCount, type Memo, type MemoFolder } from "./use-memoranda";

const FOLDERS: { id: MemoFolder; label: string; icon: typeof Inbox }[] = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "sent", label: "Sent", icon: Send },
  { id: "drafts", label: "Drafts", icon: FileEdit },
];

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function snippet(html: string): string {
  const div = typeof document !== "undefined" ? document.createElement("div") : null;
  if (!div) return "";
  div.innerHTML = html;
  const text = div.textContent ?? "";
  return text.length > 90 ? `${text.slice(0, 90)}…` : text;
}

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

  function openMemo(m: Memo) {
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
          <ResizablePanel defaultSize={18} minSize={14} maxSize={28} className="min-h-0">
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

          <ResizablePanel defaultSize={32} minSize={24} maxSize={45} className="min-h-0">
            <ScrollArea className="h-full">
              <div className="flex flex-col divide-y divide-border">
                {isLoading && (
                  <div className="space-y-3 p-3">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-14 w-full" />
                    ))}
                  </div>
                )}
                {!isLoading && (memos?.length ?? 0) === 0 && (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    {folder === "inbox" ? "No memos yet." : folder === "sent" ? "Nothing sent yet." : "No drafts."}
                  </div>
                )}
                {memos?.map((m) => {
                  const unreadMemo = folder === "inbox" && (m.toKey === myKey ? !m.read : !m.cc.find((c) => c.staffKey === myKey)?.read);
                  const peerName = folder === "sent" || folder === "drafts" ? m.toName : m.fromName;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => openMemo(m)}
                      className={`flex w-full items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-accent/50 ${
                        selectedId === m.id ? "bg-accent/70" : ""
                      }`}
                    >
                      <Avatar className="mt-0.5 size-8 shrink-0">
                        <AvatarFallback className="text-xs">{getInitials(peerName)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`truncate text-sm ${unreadMemo ? "font-semibold" : "font-medium"}`}>{peerName}</span>
                          <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(m.createdAt)}</span>
                        </div>
                        <div className={`truncate text-sm ${unreadMemo ? "font-medium text-foreground" : "text-muted-foreground"}`}>{m.subject || "(no subject)"}</div>
                        <div className="truncate text-xs text-muted-foreground">{snippet(m.bodyHtml)}</div>
                        {m.cc.length > 0 && (
                          <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Paperclip className="size-3" />
                            Cc {m.cc.length}
                          </span>
                        )}
                      </div>
                      {unreadMemo && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </ResizablePanel>
          <ResizableHandle />

          <ResizablePanel defaultSize={50} minSize={30} className="min-h-0">
            {selected ? (
              <div className="flex h-full flex-col">
                <div className="flex items-start justify-between gap-4 border-b border-border p-4">
                  <div>
                    <h2 className="text-lg font-semibold">{selected.subject || "(no subject)"}</h2>
                    <p className="text-sm text-muted-foreground">
                      From <span className="font-medium text-foreground">{selected.fromName}</span> to{" "}
                      <span className="font-medium text-foreground">{selected.toName}</span>
                      {selected.cc.length > 0 && <> · Cc {selected.cc.map((c) => c.staffName).join(", ")}</>}
                    </p>
                    <p className="text-xs text-muted-foreground">{new Date(selected.createdAt).toLocaleString("en-GB")}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {folder === "drafts" && selected.fromKey === myKey ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => startCompose({ editingMemo: selected })}
                      >
                        Edit
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => startCompose({ replyTo: { toKey: selected.fromKey, toName: selected.fromName, subject: selected.subject }, parentId: selected.id })}
                      >
                        <Reply className="size-4" />
                        Reply
                      </Button>
                    )}
                    <Button size="icon-sm" variant="ghost" onClick={() => downloadPdf(selected)} aria-label="Download PDF">
                      <Download className="size-4" />
                    </Button>
                    {(selected.fromKey === myKey || profile?.role === "manager") && (
                      <Button size="icon-sm" variant="ghost" onClick={() => handleDelete(selected)} aria-label="Delete">
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                </div>
                <Separator />
                <ScrollArea className="flex-1">
                  <div
                    className="prose prose-sm dark:prose-invert max-w-none p-6"
                    // eslint-disable-next-line react/no-danger -- real memo body from our own compose dialog, same trust boundary as the rest of this app's HTML content fields
                    dangerouslySetInnerHTML={{ __html: selected.bodyHtml }}
                  />
                </ScrollArea>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Select a memo to read it.</div>
            )}
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      <ComposeMemoDialog open={composeOpen} onOpenChange={setComposeOpen} myKey={myKey} myName={myName} seed={composeSeed} />
    </div>
  );
}
