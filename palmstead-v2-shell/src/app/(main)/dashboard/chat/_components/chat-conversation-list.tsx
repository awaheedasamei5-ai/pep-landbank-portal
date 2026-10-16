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

import { cn } from "cn";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { getInitials } from "@/lib/utils";
import { MessageSquarePlus, Users } from "lucide-react";

import type { DirectoryStaff } from "@/app/(main)/dashboard/directory/_components/use-directory";

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

export function ChatConversationList({ entries, myKey, activeKey, staffByKey, onSelectEntry, onNewChat, onNewGroup, className }: ChatConversationListProps) {
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
              {entries.map((entry) => {
                const isSelected = activeKey === entry.key;
                const isOnline = entry.kind === "dm" ? (staffByKey.get(entry.key)?.isOnline ?? false) : false;
                const lastMessage = entry.kind === "dm" ? entry.thread.lastMessage : entry.groupThread.lastMessage;
                const unreadCount = entry.kind === "dm" ? entry.thread.unreadCount : 0;
                return (
                  <button
                    key={entry.key}
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
                        <div className="flex w-full items-center justify-between gap-2">
                          <div className="truncate font-medium text-sm leading-5">{entry.name}</div>
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
                          {unreadCount > 0 && (
                            <div className="grid size-5 shrink-0 place-items-center rounded-full bg-[#25D366] text-white text-xs dark:bg-[#00A884]">{unreadCount}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
