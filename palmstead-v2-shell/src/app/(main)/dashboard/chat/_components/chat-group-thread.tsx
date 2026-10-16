// Real WhatsApp-style group chat thread (15-chat-whatsapp-full-replica.md).
// Shares the exact same messages table, attachment columns, reactions
// table and realtime wiring as 1:1 chat (chat-thread.tsx) -- this is a
// trimmed sibling view, not a parallel pipeline. Attachments/voice notes/
// location are real here too now, via a distinct Storage path prefix
// ("group/...") so the RLS policy sets for 1:1 vs group attachments stay
// mutually exclusive. Group voice/video calls remain a real, named gap --
// they need an SFU this project doesn't have infrastructure for.
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "cn";
import { ArrowLeft, Image as ImageIcon, MapPin, Mic, Paperclip, Search, Send, Smile, Square, Star, Users, X } from "lucide-react";
import { toast } from "sonner";
import EmojiPicker, { EmojiStyle, Theme as EmojiTheme } from "emoji-picker-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bubble, BubbleContent, BubbleGroup, BubbleReactions } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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

import { ChatAttachmentBubble } from "./chat-attachment-bubble";
import { ForwardDialog, ForwardedLabel, MessageActionsTrigger, QuotedSnippet, ReplyPreviewBar, type ForwardTarget } from "./chat-message-actions";
import { useMyHiddenMessageIds, useMyStarredMessageIds } from "./use-chat-message-actions";
import { QUICK_REACTIONS, useMessageReactions, useSetReaction } from "./use-chat-reactions";
import { useSendGroupMessage, type GroupThread } from "./use-chat-groups";
import { useVoiceRecorder } from "./chat-thread";
import type { ChatMessage } from "./use-chat";

interface GroupThreadViewProps {
  groupThread: GroupThread | null;
  myKey: string;
  myName: string | undefined;
  showBackButton?: boolean;
  onBack?: () => void;
  onOpenInfo?: () => void;
  forwardTargets: ForwardTarget[];
  className?: string;
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function GroupThreadView({ groupThread, myKey, myName, showBackButton, onBack, onOpenInfo, forwardTargets, className }: GroupThreadViewProps) {
  const [draft, setDraft] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<ChatMessage | null>(null);
  const [sendingAttachment, setSendingAttachment] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sendMessage = useSendGroupMessage(myKey, myName);
  const voice = useVoiceRecorder();

  const messageIds = useMemo(() => groupThread?.messages.map((m) => m.id) ?? [], [groupThread?.messages]);
  const reactionsByMessage = useMessageReactions(myKey, messageIds);
  const setReaction = useSetReaction(myKey, myName);
  const { data: starredIds } = useMyStarredMessageIds(myKey);
  const { data: hiddenIds } = useMyHiddenMessageIds(myKey);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const messageById = useMemo(() => new Map((groupThread?.messages ?? []).map((m) => [m.id, m])), [groupThread?.messages]);
  const visibleMessages = useMemo(() => {
    const notHidden = (groupThread?.messages ?? []).filter((m) => !hiddenIds?.has(m.id));
    const q = searchQuery.trim().toLowerCase();
    return q ? notHidden.filter((m) => m.body.toLowerCase().includes(q)) : notHidden;
  }, [groupThread?.messages, hiddenIds, searchQuery]);

  useEffect(() => {
    setDraft("");
    setReplyingTo(null);
    setSearchOpen(false);
    setSearchQuery("");
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
    const replyToId = replyingTo?.id ?? null;
    setReplyingTo(null);
    try {
      await sendMessage.mutateAsync({ groupId: group.id, body, replyToId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send the message");
    }
  }

  async function sendAttachment(file: File, durationSeconds?: number) {
    setSendingAttachment(true);
    try {
      await sendMessage.mutateAsync({ groupId: group.id, body: "", attachmentFile: file, attachmentDurationSeconds: durationSeconds });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send the attachment");
    } finally {
      setSendingAttachment(false);
    }
  }

  async function shareLocation() {
    if (!navigator.geolocation) {
      toast.error("Location isn't available in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await sendMessage.mutateAsync({ groupId: group.id, body: "", location: { lat: pos.coords.latitude, lng: pos.coords.longitude, label: null } });
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Could not share your location");
        }
      },
      () => toast.error("Location permission was denied."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function stopAndSendVoiceNote() {
    const result = await voice.finish();
    if (result) void sendAttachment(result.file, result.durationSeconds);
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
          <button type="button" onClick={onOpenInfo} className="flex min-w-0 flex-1 items-center gap-3 text-left">
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
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Search this chat" onClick={() => setSearchOpen((v) => !v)}>
            <Search />
          </Button>
        </div>
        {searchOpen && (
          <div className="px-2">
            <InputGroup className="rounded-md border">
              <InputGroupTextarea
                placeholder="Search in this chat…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                rows={1}
                className="min-h-9 resize-none px-3 py-2 text-sm ring-0 focus-visible:ring-0"
              />
            </InputGroup>
          </div>
        )}
        <Separator />
      </div>

      <MessageScrollerProvider autoScroll>
        <MessageScroller className="min-h-0 flex-1 bg-[#ECE5DD] dark:bg-[#0B141A]">
          <MessageScrollerViewport>
            <MessageScrollerContent className="gap-4 px-2 py-6">
              {visibleMessages.map((m) => {
                const isOutbound = m.senderKey === myKey;
                const align = isOutbound ? "end" : "start";
                const reactions = reactionsByMessage.get(m.id) ?? [];
                const isStarred = starredIds?.has(m.id) ?? false;
                const quoted = m.replyToId ? messageById.get(m.replyToId) : undefined;
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
                                {m.forwarded && <ForwardedLabel />}
                                <QuotedSnippet quoted={quoted} />
                                <ChatAttachmentBubble message={m} />
                                <div className="flex flex-wrap items-end justify-end gap-x-2 gap-y-0.5">
                                  {m.body ? <span className="min-w-0 whitespace-pre-wrap wrap-break-word">{m.body}</span> : null}
                                  <span className="ml-auto flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground leading-none">
                                    {isStarred && <Star className="size-3 fill-current text-amber-500" />}
                                    {timeLabel(m.createdAt)}
                                  </span>
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
                            <MessageActionsTrigger
                              message={m}
                              myKey={myKey}
                              myName={myName}
                              starred={isStarred}
                              onReply={() => setReplyingTo(m)}
                              onForward={() => setForwardingMessage(m)}
                            />
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
        {replyingTo && <ReplyPreviewBar message={replyingTo} onCancel={() => setReplyingTo(null)} />}
        {canSend ? (
          <>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void sendAttachment(file);
              }}
            />
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void sendAttachment(file);
              }}
            />
            {voice.recording ? (
              <div className="flex h-14 items-center gap-3 rounded-md border bg-background px-3">
                <span className="size-2.5 shrink-0 animate-pulse rounded-full bg-destructive" />
                <span className="flex-1 text-sm tabular-nums">
                  {Math.floor(voice.seconds / 60)}:{(voice.seconds % 60).toString().padStart(2, "0")}
                </span>
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Cancel recording" onClick={voice.cancel}>
                  <X />
                </Button>
                <Button type="button" variant="default" size="icon-sm" aria-label="Send voice note" onClick={stopAndSendVoiceNote}>
                  <Square className="size-3.5" />
                </Button>
              </div>
            ) : (
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
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <InputGroupButton type="button" variant="ghost" size="icon-sm" disabled={sendingAttachment} aria-label="Attach">
                          <Paperclip />
                        </InputGroupButton>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuItem onClick={() => photoInputRef.current?.click()}>
                          <ImageIcon /> Photo or video
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                          <Paperclip /> Document
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => void shareLocation()}>
                          <MapPin /> Location
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
                    <InputGroupButton type="button" variant="ghost" size="icon-sm" disabled={sendingAttachment} aria-label="Record voice note" onClick={() => void voice.start()}>
                      <Mic />
                    </InputGroupButton>
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
            )}
          </>
        ) : (
          <div className="rounded-md border bg-muted px-3 py-2.5 text-center text-muted-foreground text-sm">Only admins can send messages in this group</div>
        )}
      </div>

      <ForwardDialog
        open={Boolean(forwardingMessage)}
        onOpenChange={(v) => !v && setForwardingMessage(null)}
        message={forwardingMessage}
        myKey={myKey}
        myName={myName}
        targets={forwardTargets}
      />
    </div>
  );
}
