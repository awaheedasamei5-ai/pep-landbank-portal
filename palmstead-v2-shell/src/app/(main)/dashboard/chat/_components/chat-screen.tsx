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
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuthStore } from "@/stores/auth/auth-store";
import { useDirectory, type DirectoryStaff } from "@/app/(main)/dashboard/directory/_components/use-directory";

import { useChatCall } from "@/app/(main)/dashboard/_components/call-provider";

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
  const staffByKey = useMemo(() => new Map((staff ?? []).map((s) => [s.agentKey, s])), [staff]);

  useChatRealtime(myKey);
  const { threads, isLoading } = useChatThreads(myKey, directoryByKey);
  const markRead = useMarkThreadRead(myKey);
  const call = useChatCall();

  const [activePartner, setActivePartner] = useState<string | null>(null);
  const [showThread, setShowThread] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newChatStaff, setNewChatStaff] = useState<DirectoryStaff | null>(null);
  const isMobile = useIsMobile();

  const others = useMemo(() => (staff ?? []).filter((s) => s.agentKey !== myKey), [staff, myKey]);

  // A brand-new conversation (picked via "New chat") has no messages yet, so
  // it has no real ChatThread to find -- threads are derived from messages,
  // not stored. Without this, starting a chat with someone you've never
  // messaged before would silently fall back to the empty-state pane instead
  // of opening a composer, which defeats the point of "New chat" existing.
  const activeThread: ChatThread | undefined =
    threads.find((t) => t.partnerKey === activePartner) ??
    (activePartner
      ? {
          partnerKey: activePartner,
          partnerName: directoryByKey.get(activePartner) ?? activePartner,
          messages: [],
          lastMessage: undefined,
          unreadCount: 0,
        }
      : undefined);

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
            staffByKey={staffByKey}
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
          partnerStaff={activePartner ? staffByKey.get(activePartner) : undefined}
          showBackButton={isMobile}
          onBack={() => setShowThread(false)}
          onStartCall={(kind) => {
            if (activePartner) void call.startCall(activePartner, directoryByKey.get(activePartner) ?? activePartner, kind);
          }}
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
