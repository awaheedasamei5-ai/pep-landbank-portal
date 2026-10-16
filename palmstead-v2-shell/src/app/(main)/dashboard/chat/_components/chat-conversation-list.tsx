// Cloned from src/app/(main)/chat/_components/chat-conversation-list.tsx (this
// repo's own real chat example) and edited for Chat: Conversation -> real
// ChatThread (derived from the live messages table). isOnline now wired to
// the real presence heartbeat (use-presence-heartbeat.ts writes
// profiles.last_seen_at, Directory's useDirectory() already derives
// isOnline from it) -- the same real infrastructure, not a new fake one.
// Open/Snoozed/Closed tabs, Pin, and Filter were demo-only UI with no real
// backing state in this schema -- per the standing rule against fake
// interactive controls, they're left out rather than wired to nothing.
//
// Real WhatsApp interleaves 1:1 DMs and groups in one list, sorted by last
// activity -- not two separate lists -- so this now takes a merged, already
// -sorted `entries` array (15-chat-whatsapp-full-replica.md) instead of a
// DM-only `threads` array.
"use client";

import { useState } from "react";

import { cn } from "cn";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { getInitials } from "@/lib/utils";
import { Archive, ArchiveRestore, BellOff, ChevronDown, MessageSquarePlus, MoreVertical, Pin, PinOff, Users } from "lucide-react";

import type { DirectoryStaff } from "@/app/(main)/dashboard/directory/_components/use-directory";

import type { ConversationSettings } from "./use-chat-message-actions";
import { previewText, type ChatThread } from "./use-chat";
import { groupPreviewText, type GroupThread } from "./use-chat-groups";

export type ConversationEntry =
  | { kind: "dm"; key: string; name: string; lastCreatedAt: string | null; thread: ChatThread }
  | { kind: "group"; key: string; name: string; lastCreatedAt: string | null; groupThread: GroupThread };

interface ChatConversationListProps {
  entries: ConversationEntry[];
  myKey: string;
  activeKey: string | null;
  staffByKey: Map<string, DirectoryStaff>;
  settingsMap: Map<string, ConversationSettings>;
  onSetSetting: (conversationKey: string, patch: Partial<ConversationSettings>) => void;
  onSelectEntry: (entry: ConversationEntry) => void;
  onNewChat: () => void;
  onNewGroup: () => void;
  className?: string;
}

function threadTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function ConversationRow({
  entry,
  myKey,
  isSelected,
  isOnline,
  settings,
  onSelectEntry,
  onSetSetting,
}: {
  entry: ConversationEntry;
  myKey: string;
  isSelected: boolean;
  isOnline: boolean;
  settings: ConversationSettings | undefined;
  onSelectEntry: (entry: ConversationEntry) => void;
  onSetSetting: (patch: Partial<ConversationSettings>) => void;
}) {
  const lastMessage = entry.kind === "dm" ? entry.thread.lastMessage : entry.groupThread.lastMessage;
  const unreadCount = entry.kind === "dm" ? entry.thread.unreadCount : 0;
  const pinned = settings?.pinned ?? false;
  const muted = settings?.muted ?? false;
  const archived = settings?.archived ?? false;

  return (
    <div className="group/row relative">
      <button
        type="button"
        className={cn(
          "w-full overflow-hidden rounded-lg px-2.5 py-2.5 text-left ring-inset transition-colors",
          isSelected ? "bg-muted ring-1 ring-border" : "hover:bg-muted/75",
        )}
        onClick={(event) => {
          event.currentTarget.blur();
          onSelectEntry(entry);
        }}
      >
        <div className="flex min-w-0 items-start gap-2.5">
          <div className="relative shrink-0">
            <Avatar>
              <AvatarFallback className={cn("text-foreground text-xs", isSelected && "bg-background/50")}>
                {entry.kind === "group" ? <Users className="size-4" /> : getInitials(entry.name)}
              </AvatarFallback>
            </Avatar>
            {isOnline && <span className="absolute right-0 bottom-0 size-2.5 rounded-full bg-[#25D366] ring-2 ring-sidebar dark:bg-[#00A884]" />}
          </div>
          <div className="w-0 flex-1 overflow-hidden">
            <div className="flex w-full items-center justify-between gap-2 pr-6">
              <div className="flex min-w-0 items-center gap-1">
                {pinned && <Pin className="size-3 shrink-0 text-muted-foreground" />}
                <div className="truncate font-medium text-sm leading-5">{entry.name}</div>
              </div>
              {lastMessage && <span className="text-nowrap text-muted-foreground text-xs leading-5">{threadTime(lastMessage.createdAt)}</span>}
            </div>
            <div className="flex min-w-0 items-end gap-2">
              <div className="w-0 flex-1 overflow-hidden">
                <div className="truncate text-muted-foreground text-xs leading-4">
                  {entry.kind === "dm" ? (
                    lastMessage ? (
                      <>
                        {lastMessage.senderKey === myKey ? "You: " : ""}
                        {previewText(lastMessage)}
                      </>
                    ) : (
                      ""
                    )
                  ) : lastMessage ? (
                    <>
                      {lastMessage.senderKey === myKey ? "You: " : `${lastMessage.senderName.split(" ")[0]}: `}
                      {groupPreviewText(lastMessage)}
                    </>
                  ) : (
                    `${entry.groupThread.group.members.length} members`
                  )}
                </div>
              </div>
              {muted && <BellOff className="size-3 shrink-0 text-muted-foreground" />}
              {unreadCount > 0 && (
                <div className="grid size-5 shrink-0 place-items-center rounded-full bg-[#25D366] text-white text-xs dark:bg-[#00A884]">{unreadCount}</div>
              )}
            </div>
          </div>
        </div>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Conversation options"
            className="absolute top-2.5 right-2 rounded-full p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover/row:opacity-100 data-[state=open]:opacity-100"
          >
            <MoreVertical className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onSetSetting({ pinned: !pinned })}>
            {pinned ? <PinOff /> : <Pin />} {pinned ? "Unpin" : "Pin"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onSetSetting({ muted: !muted })}>
            <BellOff /> {muted ? "Unmute" : "Mute"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onSetSetting({ archived: !archived })}>
            {archived ? <ArchiveRestore /> : <Archive />} {archived ? "Unarchive" : "Archive"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function ChatConversationList({
  entries,
  myKey,
  activeKey,
  staffByKey,
  settingsMap,
  onSetSetting,
  onSelectEntry,
  onNewChat,
  onNewGroup,
  className,
}: ChatConversationListProps) {
  const [showArchived, setShowArchived] = useState(false);

  const active = entries.filter((e) => !settingsMap.get(e.key)?.archived);
  const archived = entries.filter((e) => settingsMap.get(e.key)?.archived);
  const sorted = [...active].sort((a, b) => {
    const aPinned = settingsMap.get(a.key)?.pinned ?? false;
    const bPinned = settingsMap.get(b.key)?.pinned ?? false;
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    return 0;
  });

  function row(entry: ConversationEntry) {
    const isSelected = activeKey === entry.key;
    const isOnline = entry.kind === "dm" ? (staffByKey.get(entry.key)?.isOnline ?? false) : false;
    return (
      <ConversationRow
        key={entry.key}
        entry={entry}
        myKey={myKey}
        isSelected={isSelected}
        isOnline={isOnline}
        settings={settingsMap.get(entry.key)}
        onSelectEntry={onSelectEntry}
        onSetSetting={(patch) => onSetSetting(entry.key, patch)}
      />
    );
  }

  return (
    <div className={cn("flex h-full flex-col gap-3 pt-3", className)}>
      <div className="flex items-center justify-between gap-4 px-3 py-0.5">
        <h1 className="font-medium text-xl leading-none">Chat</h1>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon-sm" onClick={onNewGroup} aria-label="New group">
            <Users />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onNewChat} aria-label="New chat">
            <MessageSquarePlus />
          </Button>
        </div>
      </div>

      <Separator />

      <div className="flex min-h-0 flex-1 flex-col">
        <ScrollArea className="**:data-[slot=scroll-area-viewport]:scroll-fade h-full min-h-0 flex-1 overflow-hidden">
          {entries.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">No conversations yet. Start a new chat.</div>
          ) : (
            <div className="flex flex-col gap-1 px-2">
              {archived.length > 0 && (
                <>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-muted-foreground text-sm hover:bg-muted/75"
                    onClick={() => setShowArchived((v) => !v)}
                  >
                    <Archive className="size-4" />
                    Archived ({archived.length})
                    <ChevronDown className={cn("ml-auto size-4 transition-transform", showArchived && "rotate-180")} />
                  </button>
                  {showArchived && archived.map(row)}
                  <Separator className="my-1" />
                </>
              )}
              {sorted.map(row)}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
