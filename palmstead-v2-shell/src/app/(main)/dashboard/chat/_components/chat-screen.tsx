// Composition cloned from src/app/(main)/chat/_components/chat.tsx (this
// repo's own real chat example) -- same real responsive grid/slide-transition
// pattern for collapsing to a single pane on mobile. The contact-profile
// side panel from that example is dropped (no real contact-detail data for
// an internal staff DM, unlike that example's external-contact use case).
"use client";

import { useMemo, useState } from "react";

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

import { ChatConversationList, type ConversationEntry } from "./chat-conversation-list";
import { GroupInfoDialog, NewGroupDialog } from "./chat-group-dialogs";
import type { ForwardTarget } from "./chat-message-actions";
import { GroupThreadView } from "./chat-group-thread";
import { ChatStatusPanel } from "./chat-status-panel";
import { ChatThreadView } from "./chat-thread";
import { useChatRealtime, useChatThreads, useMarkThreadRead, type ChatThread } from "./use-chat";
import { useGroupThreads } from "./use-chat-groups";
import { useConversationSettingsMap, useSetConversationSetting } from "./use-chat-message-actions";
import { useStatusGroups } from "./use-status";

const isSameStaff = (a: DirectoryStaff, b: DirectoryStaff) => a.agentKey === b.agentKey;

type Selection = { kind: "dm"; key: string } | { kind: "group"; key: string } | null;

export function ChatScreen() {
  const profile = useAuthStore((s) => s.profile);
  const myKey = profile?.key;
  const myName = profile?.name;

  const { data: staff } = useDirectory();
  const directoryByKey = useMemo(() => new Map((staff ?? []).map((s) => [s.agentKey, s.name])), [staff]);
  const staffByKey = useMemo(() => new Map((staff ?? []).map((s) => [s.agentKey, s])), [staff]);

  useChatRealtime(myKey);
  const { threads, isLoading } = useChatThreads(myKey, directoryByKey);
  const { groupThreads, isLoading: groupsLoading } = useGroupThreads(myKey);
  const markRead = useMarkThreadRead(myKey);
  const call = useChatCall();
  const { data: conversationSettings } = useConversationSettingsMap(myKey);
  const setConversationSetting = useSetConversationSetting(myKey);

  const [selection, setSelection] = useState<Selection>(null);
  const [showThread, setShowThread] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newChatStaff, setNewChatStaff] = useState<DirectoryStaff | null>(null);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"chats" | "status">("chats");
  const isMobile = useIsMobile();
  const { groups: statusGroups } = useStatusGroups(myKey);
  const hasAnyStatus = statusGroups.length > 0;

  const others = useMemo(() => (staff ?? []).filter((s) => s.agentKey !== myKey), [staff, myKey]);

  // Real WhatsApp interleaves 1:1 DMs and groups in one list by recency.
  const entries = useMemo((): ConversationEntry[] => {
    const dmEntries: ConversationEntry[] = threads.map((t) => ({
      kind: "dm",
      key: t.partnerKey,
      name: t.partnerName,
      lastCreatedAt: t.lastMessage?.createdAt ?? null,
      thread: t,
    }));
    const groupEntries: ConversationEntry[] = groupThreads.map((g) => ({
      kind: "group",
      key: g.group.id,
      name: g.group.name,
      lastCreatedAt: g.lastMessage?.createdAt ?? null,
      groupThread: g,
    }));
    return [...dmEntries, ...groupEntries].sort((a, b) => (b.lastCreatedAt ?? "").localeCompare(a.lastCreatedAt ?? ""));
  }, [threads, groupThreads]);

  // Forwarding targets real WhatsApp lets you reach anyone, not just chats
  // you already have history with.
  const forwardTargets = useMemo((): ForwardTarget[] => {
    const dmTargets: ForwardTarget[] = others.map((s) => ({ key: s.agentKey, name: s.name, kind: "dm" as const }));
    const groupTargets: ForwardTarget[] = groupThreads.map((g) => ({ key: g.group.id, name: g.group.name, kind: "group" as const }));
    return [...dmTargets, ...groupTargets];
  }, [others, groupThreads]);

  // A brand-new conversation (picked via "New chat") has no messages yet, so
  // it has no real ChatThread to find -- threads are derived from messages,
  // not stored. Without this, starting a chat with someone you've never
  // messaged before would silently fall back to the empty-state pane instead
  // of opening a composer, which defeats the point of "New chat" existing.
  const activeThread: ChatThread | undefined =
    selection?.kind === "dm"
      ? (threads.find((t) => t.partnerKey === selection.key) ?? {
          partnerKey: selection.key,
          partnerName: directoryByKey.get(selection.key) ?? selection.key,
          messages: [],
          lastMessage: undefined,
          unreadCount: 0,
        })
      : undefined;

  const activeGroupThread = selection?.kind === "group" ? (groupThreads.find((g) => g.group.id === selection.key) ?? null) : null;

  function selectEntry(entry: ConversationEntry) {
    setSelection({ kind: entry.kind, key: entry.key });
    setShowThread(true);
    if (entry.kind === "dm" && entry.thread.unreadCount > 0 && myKey) markRead.mutate(entry.thread.partnerKey);
  }

  function startNewChat() {
    if (!newChatStaff) return;
    setSelection({ kind: "dm", key: newChatStaff.agentKey });
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
        <div
          className={cn(
            "flex min-h-0 min-w-0 flex-col transition-transform duration-300 ease-out will-change-transform max-md:col-start-1 max-md:row-start-1",
            showThread && "max-md:pointer-events-none max-md:-translate-x-full",
          )}
        >
          <div className="flex shrink-0 gap-1 border-b px-3 pt-1">
            <button
              type="button"
              onClick={() => setActiveTab("chats")}
              className={cn(
                "border-b-2 px-2 py-2 font-medium text-sm transition-colors",
                activeTab === "chats" ? "border-[#25D366] text-foreground dark:border-[#00A884]" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              Chats
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("status")}
              className={cn(
                "flex items-center gap-1.5 border-b-2 px-2 py-2 font-medium text-sm transition-colors",
                activeTab === "status" ? "border-[#25D366] text-foreground dark:border-[#00A884]" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              Status
              {hasAnyStatus && <span className="size-1.5 rounded-full bg-[#25D366] dark:bg-[#00A884]" />}
            </button>
          </div>

          {activeTab === "status" ? (
            <ChatStatusPanel myKey={myKey} myName={myName} className="min-h-0 flex-1" />
          ) : isLoading || groupsLoading ? (
            <div className="space-y-3 p-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : (
            <ChatConversationList
              entries={entries}
              myKey={myKey}
              activeKey={selection?.key ?? null}
              staffByKey={staffByKey}
              settingsMap={conversationSettings ?? new Map()}
              onSetSetting={(conversationKey, patch) => setConversationSetting.mutate({ conversationKey, patch })}
              onSelectEntry={selectEntry}
              onNewChat={() => setNewChatOpen(true)}
              onNewGroup={() => setNewGroupOpen(true)}
              className="min-h-0 flex-1"
            />
          )}
        </div>

        {selection?.kind === "group" ? (
          <GroupThreadView
            groupThread={activeGroupThread}
            myKey={myKey}
            myName={myName}
            showBackButton={isMobile}
            onBack={() => setShowThread(false)}
            onOpenInfo={() => setGroupInfoOpen(true)}
            forwardTargets={forwardTargets}
            className={cn(
              "transition-transform duration-300 ease-out will-change-transform max-md:col-start-1 max-md:row-start-1",
              showThread ? "max-md:translate-x-0" : "max-md:pointer-events-none max-md:translate-x-full",
            )}
          />
        ) : (
          <ChatThreadView
            thread={activeThread ?? null}
            myKey={myKey}
            myName={myName}
            partnerStaff={selection?.kind === "dm" ? staffByKey.get(selection.key) : undefined}
            showBackButton={isMobile}
            onBack={() => setShowThread(false)}
            onStartCall={(kind) => {
              if (selection?.kind === "dm") void call.startCall(selection.key, directoryByKey.get(selection.key) ?? selection.key, kind);
            }}
            forwardTargets={forwardTargets}
            className={cn(
              "transition-transform duration-300 ease-out will-change-transform max-md:col-start-1 max-md:row-start-1",
              showThread ? "max-md:translate-x-0" : "max-md:pointer-events-none max-md:translate-x-full",
            )}
          />
        )}
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

      <NewGroupDialog
        open={newGroupOpen}
        onOpenChange={setNewGroupOpen}
        myKey={myKey}
        myName={myName}
        staff={staff ?? []}
        onCreated={(groupId) => {
          setSelection({ kind: "group", key: groupId });
          setShowThread(true);
        }}
      />

      <GroupInfoDialog
        open={groupInfoOpen}
        onOpenChange={setGroupInfoOpen}
        group={activeGroupThread?.group ?? null}
        myKey={myKey}
        staff={staff ?? []}
        onLeft={() => {
          setSelection(null);
          setShowThread(false);
        }}
      />
    </div>
  );
}
