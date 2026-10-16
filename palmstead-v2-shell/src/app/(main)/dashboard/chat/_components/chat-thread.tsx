// Cloned from src/app/(main)/chat/_components/chat-thread.tsx (this repo's
// own real chat example), using the same real Message/Bubble/MessageScroller
// primitives, and edited for real DM data instead of the demo Contact/
// Message shape. Dropped: Call/Tag/Snooze/Block/copy-email actions,
// reactions, and the Reply/Internal-note tab split -- all demo-only UI with
// no real backing state in this schema. Per the standing rule against fake
// interactive controls, they're left out rather than wired to nothing.
"use client";

import { useState } from "react";

import { cn } from "cn";
import { ArrowLeft, Send } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bubble, BubbleContent, BubbleGroup } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group";
import { Message, MessageAvatar, MessageContent, MessageFooter } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { Separator } from "@/components/ui/separator";
import { getInitials } from "@/lib/utils";

import { useSendMessage, type ChatThread as Thread } from "./use-chat";

interface ChatThreadProps {
  thread: Thread | null;
  myKey: string;
  myName: string | undefined;
  showBackButton?: boolean;
  onBack?: () => void;
  className?: string;
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function ChatThreadView({ thread, myKey, myName, showBackButton, onBack, className }: ChatThreadProps) {
  const [draft, setDraft] = useState("");
  const sendMessage = useSendMessage(myKey, myName);

  if (!thread) {
    return (
      <div className={cn("flex h-full items-center justify-center text-sm text-muted-foreground", className)}>
        Select a conversation or start a new chat.
      </div>
    );
  }

  async function send() {
    const body = draft.trim();
    if (!body || !thread) return;
    try {
      await sendMessage.mutateAsync({ recipientKey: thread.partnerKey, body });
      setDraft("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send the message");
    }
  }

  return (
    <div className={cn("flex h-full flex-col py-3", className)}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3 px-2">
          {showBackButton && (
            <Button variant="ghost" size="icon-sm" className="md:hidden" aria-label="Back to conversations" onClick={onBack}>
              <ArrowLeft />
            </Button>
          )}
          <Avatar className="size-8">
            <AvatarFallback className="bg-background text-foreground">{getInitials(thread.partnerName)}</AvatarFallback>
          </Avatar>
          <div className="font-medium text-sm">{thread.partnerName}</div>
        </div>
        <Separator />
      </div>

      <MessageScrollerProvider autoScroll>
        <MessageScroller className="min-h-0 flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent className="gap-4 px-2 py-6">
              {thread.messages.map((m) => {
                const isOutbound = m.senderKey === myKey;
                const align = isOutbound ? "end" : "start";
                return (
                  <MessageScrollerItem key={m.id} messageId={m.id} scrollAnchor={align === "end"}>
                    <Message align={align}>
                      <MessageAvatar>
                        <Avatar>
                          <AvatarFallback className={cn("bg-muted text-foreground text-xs", isOutbound && "bg-primary text-primary-foreground")}>
                            {getInitials(m.senderName)}
                          </AvatarFallback>
                        </Avatar>
                      </MessageAvatar>
                      <MessageContent>
                        <BubbleGroup>
                          <Bubble variant={isOutbound ? "default" : "muted"} align={align}>
                            <BubbleContent>{m.body}</BubbleContent>
                          </Bubble>
                        </BubbleGroup>
                        <MessageFooter>{timeLabel(m.createdAt)}</MessageFooter>
                      </MessageContent>
                    </Message>
                  </MessageScrollerItem>
                );
              })}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>

      <div className="px-2">
        <form
          className="w-full"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <InputGroup className="rounded-md border">
            <InputGroupTextarea
              placeholder={`Message ${thread.partnerName}…`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              className="min-h-14 px-3 py-2.5 text-sm ring-0 focus-visible:ring-0"
            />
            <InputGroupAddon align="block-end">
              <InputGroupButton type="submit" variant="default" size="icon-sm" className="ml-auto" disabled={!draft.trim() || sendMessage.isPending}>
                <Send />
                <span className="sr-only">Send</span>
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </form>
      </div>
    </div>
  );
}
