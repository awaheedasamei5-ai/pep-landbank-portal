// Composition cloned from src/app/(main)/chat/_components/chat.tsx (this
// repo's own real chat example) -- same real responsive grid/slide-transition
// pattern for collapsing to a single pane on mobile. The contact-profile
// side panel from that example is dropped (no real contact-detail data for
// an internal staff DM, unlike that example's external-contact use case).
"use client";

import { type CSSProperties, useMemo, useState } from "react";

import { cn } from "cn";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuthStore } from "@/stores/auth/auth-store";
import { useDirectory, type DirectoryStaff } from "@/app/(main)/dashboard/directory/_components/use-directory";

import { ChatConversationList } from "./chat-conversation-list";
import { ChatThreadView } from "./chat-thread";
import { useChatRealtime, useChatThreads, useMarkThreadRead, type ChatThread } from "./use-chat";

const isSameStaff = (a: DirectoryStaff, b: DirectoryStaff) => a.agentKey === b.agentKey;

export function ChatScreen() {
  const profile = useAuthStore((s) => s.profile);
  const myKey = profile?.key;
  const myName = profile?.name;

  const { data: staff } = useDirectory();
  const directoryByKey = useMemo(() => new Map((staff ?? []).map((s) => [s.agentKey, s.name])), [staff]);

  useChatRealtime(myKey);
  const { threads, isLoading } = useChatThreads(myKey, directoryByKey);
  const markRead = useMarkThreadRead(myKey);

  const [activePartner, setActivePartner] = useState<string | null>(null);
  const [showThread, setShowThread] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newChatStaff, setNewChatStaff] = useState<DirectoryStaff | null>(null);
  const isMobile = useIsMobile();

  const activeThread: ChatThread | undefined = threads.find((t) => t.partnerKey === activePartner);
  const others = useMemo(() => (staff ?? []).filter((s) => s.agentKey !== myKey), [staff, myKey]);

  function selectThread(thread: ChatThread) {
    setActivePartner(thread.partnerKey);
    setShowThread(true);
    if (thread.unreadCount > 0 && myKey) markRead.mutate(thread.partnerKey);
  }

  function startNewChat() {
    if (!newChatStaff) return;
    setActivePartner(newChatStaff.agentKey);
    setShowThread(true);
    setNewChatOpen(false);
    setNewChatStaff(null);
  }

  if (!myKey) return null;

  return (
    <div className="flex h-[calc(100dvh-var(--dashboard-header-height))] min-h-0 min-w-0 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border px-4 py-3 lg:px-6">
        <PageHeader title="Chat" description="Direct messages between staff." />
      </div>

      <div
        className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden transition-[grid-template-columns] duration-300 ease-out *:min-h-0 *:min-w-0 md:grid-cols-[22.5rem_minmax(0,1fr)] md:*:first:border-r"
      >
        {isLoading ? (
          <div className="space-y-3 p-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : (
          <ChatConversationList
            threads={threads}
            myKey={myKey}
            activePartnerKey={activePartner}
            onSelectThread={selectThread}
            onNewChat={() => setNewChatOpen(true)}
            className={cn(
              "transition-transform duration-300 ease-out will-change-transform max-md:col-start-1 max-md:row-start-1",
              showThread && "max-md:pointer-events-none max-md:-translate-x-full",
            )}
          />
        )}
        <ChatThreadView
          thread={activeThread ?? null}
          myKey={myKey}
          myName={myName}
          showBackButton={isMobile}
          onBack={() => setShowThread(false)}
          className={cn(
            "transition-transform duration-300 ease-out will-change-transform max-md:col-start-1 max-md:row-start-1",
            showThread ? "max-md:translate-x-0" : "max-md:pointer-events-none max-md:translate-x-full",
          )}
        />
      </div>

      <Dialog open={newChatOpen} onOpenChange={setNewChatOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New chat</DialogTitle>
          </DialogHeader>
          <Combobox
            items={others}
            itemToStringLabel={(s: DirectoryStaff) => s.name}
            isItemEqualToValue={isSameStaff}
            value={newChatStaff}
            onValueChange={(v) => setNewChatStaff(v as DirectoryStaff | null)}
          >
            <ComboboxInput placeholder="Search staff…" showTrigger={false} />
            <ComboboxContent className="pointer-events-auto">
              <ComboboxEmpty>No staff found</ComboboxEmpty>
              <ComboboxList>
                {(item: DirectoryStaff) => (
                  <ComboboxItem
                    key={item.agentKey}
                    value={item}
                    onClick={() => {
                      setNewChatStaff(item);
                    }}
                  >
                    {item.name}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
          <Button onClick={startNewChat} disabled={!newChatStaff} className="w-full">
            Start chat
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
