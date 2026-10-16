// Real WhatsApp-style group chat thread (15-chat-whatsapp-full-replica.md).
// Shares the exact same messages table, attachment columns, reactions
// table and realtime wiring as 1:1 chat (chat-thread.tsx) -- this is a
// trimmed sibling view, not a parallel pipeline. Text + emoji + reactions
// are real here; attachments and voice/video calls in groups are a real,
// named next phase, not silently dropped (group calls specifically need
// an SFU this project doesn't have infrastructure for yet).
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "cn";
import { ArrowLeft, Send, Smile, Users } from "lucide-react";
import { toast } from "sonner";
import EmojiPicker, { EmojiStyle, Theme as EmojiTheme } from "emoji-picker-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bubble, BubbleContent, BubbleGroup, BubbleReactions } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group";
import { Message, MessageAvatar, MessageContent } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { getInitials } from "@/lib/utils";

import { QUICK_REACTIONS, useMessageReactions, useSetReaction } from "./use-chat-reactions";
import { useSendGroupMessage, type GroupThread } from "./use-chat-groups";

interface GroupThreadViewProps {
  groupThread: GroupThread | null;
  myKey: string;
  myName: string | undefined;
  showBackButton?: boolean;
  onBack?: () => void;
  onOpenInfo?: () => void;
  className?: string;
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function GroupThreadView({ groupThread, myKey, myName, showBackButton, onBack, onOpenInfo, className }: GroupThreadViewProps) {
  const [draft, setDraft] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sendMessage = useSendGroupMessage(myKey, myName);

  const messageIds = useMemo(() => groupThread?.messages.map((m) => m.id) ?? [], [groupThread?.messages]);
  const reactionsByMessage = useMessageReactions(myKey, messageIds);
  const setReaction = useSetReaction(myKey, myName);

  useEffect(() => {
    setDraft("");
  }, [groupThread?.group.id]);

  if (!groupThread) {
    return (
      <div className={cn("flex h-full items-center justify-center text-sm text-muted-foreground", className)}>
        Select a conversation or start a new chat.
      </div>
    );
  }

  const { group } = groupThread;
  const canSend = !group.onlyAdminsCanSend || group.members.find((m) => m.staffKey === myKey)?.role === "admin";

  async function send() {
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    try {
      await sendMessage.mutateAsync({ groupId: group.id, body });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send the message");
    }
  }

  return (
    <div className={cn("flex h-full flex-col py-3", className)}>
      <div className="flex flex-col gap-3">
        <button type="button" onClick={onOpenInfo} className="flex items-center gap-3 px-2 text-left">
          {showBackButton && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="md:hidden"
              aria-label="Back to conversations"
              onClick={(e) => {
                e.stopPropagation();
                onBack?.();
              }}
            >
              <ArrowLeft />
            </Button>
          )}
          <Avatar className="size-8">
            <AvatarFallback className="bg-background text-foreground">
              <Users className="size-4" />
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-sm">{group.name}</div>
            <div className="truncate text-muted-foreground text-xs">{group.members.map((m) => m.staffName.split(" ")[0]).join(", ")}</div>
          </div>
        </button>
        <Separator />
      </div>

      <MessageScrollerProvider autoScroll>
        <MessageScroller className="min-h-0 flex-1 bg-[#ECE5DD] dark:bg-[#0B141A]">
          <MessageScrollerViewport>
            <MessageScrollerContent className="gap-4 px-2 py-6">
              {groupThread.messages.map((m) => {
                const isOutbound = m.senderKey === myKey;
                const align = isOutbound ? "end" : "start";
                const reactions = reactionsByMessage.get(m.id) ?? [];
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
                          <div className="group/bubble-wrap relative flex items-center gap-1 data-[align=end]:flex-row-reverse" data-align={align}>
                            <Bubble
                              variant={isOutbound ? "tinted" : "muted"}
                              align={align}
                              className={cn(
                                isOutbound
                                  ? "text-foreground *:data-[slot=bubble-content]:bg-[#D9FDD3] dark:*:data-[slot=bubble-content]:bg-[#005C4B]"
                                  : "*:data-[slot=bubble-content]:text-foreground *:data-[slot=bubble-content]:bg-white dark:*:data-[slot=bubble-content]:bg-[#202C33]",
                              )}
                            >
                              <BubbleContent className="flex flex-col gap-1">
                                {!isOutbound && <span className="font-medium text-[#1DA851] text-xs dark:text-[#00A884]">{m.senderName}</span>}
                                <div className="flex flex-wrap items-end justify-end gap-x-2 gap-y-0.5">
                                  {m.body ? <span className="min-w-0 whitespace-pre-wrap wrap-break-word">{m.body}</span> : null}
                                  <span className="ml-auto flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground leading-none">{timeLabel(m.createdAt)}</span>
                                </div>
                              </BubbleContent>
                              {reactions.length > 0 && (
                                <BubbleReactions side="bottom" align={align === "end" ? "end" : "start"}>
                                  {reactions.map((r) => (
                                    <button
                                      key={r.emoji}
                                      type="button"
                                      title={r.staffNames.join(", ")}
                                      className={cn("rounded-full px-1", r.mine && "bg-primary/20")}
                                      onClick={() => setReaction.mutate({ messageId: m.id, emoji: r.emoji, alreadyMine: r.mine })}
                                    >
                                      {r.emoji}
                                      {r.count > 1 ? ` ${r.count}` : ""}
                                    </button>
                                  ))}
                                </BubbleReactions>
                              )}
                            </Bubble>
                            <Popover>
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  aria-label="React to message"
                                  className="shrink-0 rounded-full p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover/bubble-wrap:opacity-100"
                                >
                                  <Smile className="size-3.5" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent align={align === "end" ? "end" : "start"} className="flex w-auto gap-1 p-1.5">
                                {QUICK_REACTIONS.map((emoji) => {
                                  const mine = reactions.find((r) => r.emoji === emoji)?.mine;
                                  return (
                                    <button
                                      key={emoji}
                                      type="button"
                                      className={cn("rounded-full p-1 text-lg hover:bg-muted", mine && "bg-primary/20")}
                                      onClick={() => setReaction.mutate({ messageId: m.id, emoji, alreadyMine: Boolean(mine) })}
                                    >
                                      {emoji}
                                    </button>
                                  );
                                })}
                              </PopoverContent>
                            </Popover>
                          </div>
                        </BubbleGroup>
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
        {canSend ? (
          <form
            className="w-full"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <InputGroup className="rounded-md border">
              <InputGroupTextarea
                ref={textareaRef}
                placeholder={`Message ${group.name}…`}
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
              <InputGroupAddon align="block-end" className="gap-0.5">
                <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
                  <PopoverTrigger asChild>
                    <InputGroupButton type="button" variant="ghost" size="icon-sm" aria-label="Insert emoji">
                      <Smile />
                    </InputGroupButton>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-auto border-none p-0 pointer-events-auto">
                    <EmojiPicker
                      theme={EmojiTheme.AUTO}
                      emojiStyle={EmojiStyle.NATIVE}
                      skinTonesDisabled
                      onEmojiClick={(emoji) => {
                        setDraft((d) => d + emoji.emoji);
                        setEmojiOpen(false);
                        textareaRef.current?.focus();
                      }}
                    />
                  </PopoverContent>
                </Popover>
                <InputGroupButton
                  type="submit"
                  variant="default"
                  size="icon-sm"
                  className="ml-auto bg-[#25D366] text-white hover:bg-[#25D366]/90 dark:bg-[#00A884] dark:hover:bg-[#00A884]/90"
                  disabled={!draft.trim() || sendMessage.isPending}
                >
                  <Send />
                  <span className="sr-only">Send</span>
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </form>
        ) : (
          <div className="rounded-md border bg-muted px-3 py-2.5 text-center text-muted-foreground text-sm">Only admins can send messages in this group</div>
        )}
      </div>
    </div>
  );
}
