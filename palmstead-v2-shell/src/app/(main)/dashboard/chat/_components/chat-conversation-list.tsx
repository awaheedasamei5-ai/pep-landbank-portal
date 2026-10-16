// Cloned from src/app/(main)/chat/_components/chat-conversation-list.tsx (this
// repo's own real chat example) and edited for Chat: Conversation -> real
// ChatThread (derived from the live messages table). isOnline now wired to
// the real presence heartbeat (use-presence-heartbeat.ts writes
// profiles.last_seen_at, Directory's useDirectory() already derives
// isOnline from it) -- the same real infrastructure, not a new fake one.
// Open/Snoozed/Closed tabs, Pin, and Filter were demo-only UI with no real
// backing state in this schema -- per the standing rule against fake
// interactive controls, they're left out rather than wired to nothing.
"use client";

import { cn } from "cn";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { getInitials } from "@/lib/utils";
import { MessageSquarePlus } from "lucide-react";

import type { DirectoryStaff } from "@/app/(main)/dashboard/directory/_components/use-directory";

import { previewText, type ChatThread } from "./use-chat";

interface ChatConversationListProps {
  threads: ChatThread[];
  myKey: string;
  activePartnerKey: string | null;
  staffByKey: Map<string, DirectoryStaff>;
  onSelectThread: (thread: ChatThread) => void;
  onNewChat: () => void;
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

export function ChatConversationList({ threads, myKey, activePartnerKey, staffByKey, onSelectThread, onNewChat, className }: ChatConversationListProps) {
  return (
    <div className={cn("flex h-full flex-col gap-3 pt-3", className)}>
      <div className="flex items-center justify-between gap-4 px-3 py-0.5">
        <h1 className="font-medium text-xl leading-none">Chat</h1>
        <Button variant="ghost" size="icon-sm" onClick={onNewChat} aria-label="New chat">
          <MessageSquarePlus />
        </Button>
      </div>

      <Separator />

      <div className="flex min-h-0 flex-1 flex-col">
        <ScrollArea className="**:data-[slot=scroll-area-viewport]:scroll-fade h-full min-h-0 flex-1 overflow-hidden">
          {threads.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">No conversations yet. Start a new chat.</div>
          ) : (
            <div className="flex flex-col gap-1 px-2">
              {threads.map((t) => {
                const isSelected = activePartnerKey === t.partnerKey;
                const isOnline = staffByKey.get(t.partnerKey)?.isOnline ?? false;
                return (
                  <button
                    key={t.partnerKey}
                    type="button"
                    className={cn(
                      "w-full overflow-hidden rounded-lg px-2.5 py-2.5 text-left ring-inset transition-colors",
                      isSelected ? "bg-muted ring-1 ring-border" : "hover:bg-muted/75",
                    )}
                    onClick={(event) => {
                      event.currentTarget.blur();
                      onSelectThread(t);
                    }}
                  >
                    <div className="flex min-w-0 items-start gap-2.5">
                      <div className="relative shrink-0">
                        <Avatar>
                          <AvatarFallback className={cn("text-foreground text-xs", isSelected && "bg-background/50")}>{getInitials(t.partnerName)}</AvatarFallback>
                        </Avatar>
                        {isOnline && <span className="absolute right-0 bottom-0 size-2.5 rounded-full bg-emerald-500 ring-2 ring-sidebar" />}
                      </div>
                      <div className="w-0 flex-1 overflow-hidden">
                        <div className="flex w-full items-center justify-between gap-2">
                          <div className="truncate font-medium text-sm leading-5">{t.partnerName}</div>
                          {t.lastMessage && <span className="text-nowrap text-muted-foreground text-xs leading-5">{threadTime(t.lastMessage.createdAt)}</span>}
                        </div>
                        <div className="flex min-w-0 items-end gap-2">
                          <div className="w-0 flex-1 overflow-hidden">
                            <div className="truncate text-muted-foreground text-xs leading-4">
                              {t.lastMessage && (t.lastMessage.senderKey === myKey ? "You: " : "")}
                              {t.lastMessage ? previewText(t.lastMessage) : ""}
                            </div>
                          </div>
                          {t.unreadCount > 0 && (
                            <div className="grid size-5 shrink-0 place-items-center rounded-full bg-primary/90 text-primary-foreground text-xs">{t.unreadCount}</div>
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
