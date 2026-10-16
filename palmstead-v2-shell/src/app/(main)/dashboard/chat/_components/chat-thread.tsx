// Cloned from src/app/(main)/chat/_components/chat-thread.tsx (this repo's
// own real chat example), using the same real Message/Bubble/MessageScroller
// primitives, and edited for real DM data instead of the demo Contact/
// Message shape. Dropped: Call/Tag/Snooze/Block/copy-email actions,
// reactions, and the Reply/Internal-note tab split -- all demo-only UI with
// no real backing state in this schema. Per the standing rule against fake
// interactive controls, they're left out rather than wired to nothing.
//
// Attachments (12-chat-attachments-plan.md): photo/video/document pickers,
// a real MediaRecorder-based voice note, and a real navigator.geolocation
// location share -- all upload for real to the chat-attachments Storage
// bucket (or send real coordinates) before the message row is inserted.
"use client";

import { useRef, useState } from "react";

import { cn } from "cn";
import { ArrowLeft, Image as ImageIcon, Mic, MapPin, Paperclip, Send, Square, X } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bubble, BubbleContent, BubbleGroup } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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

import { ChatAttachmentBubble } from "./chat-attachment-bubble";
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

function useVoiceRecorder() {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start();
      recorderRef.current = recorder;
      setSeconds(0);
      setRecording(true);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      toast.error("Microphone access was denied.");
    }
  }

  function stopTracks() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setRecording(false);
  }

  function cancel() {
    recorderRef.current?.stop();
    stopTracks();
    chunksRef.current = [];
  }

  function finish(): Promise<{ file: File; durationSeconds: number } | null> {
    return new Promise((resolve) => {
      const recorder = recorderRef.current;
      const durationSeconds = seconds;
      if (!recorder) {
        resolve(null);
        return;
      }
      recorder.onstop = () => {
        stopTracks();
        if (chunksRef.current.length === 0) {
          resolve(null);
          return;
        }
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        resolve({ file: new File([blob], `voice-note-${Date.now()}.webm`, { type: "audio/webm" }), durationSeconds });
      };
      recorder.stop();
    });
  }

  return { recording, seconds, start, cancel, finish };
}

export function ChatThreadView({ thread, myKey, myName, showBackButton, onBack, className }: ChatThreadProps) {
  const [draft, setDraft] = useState("");
  const [sendingAttachment, setSendingAttachment] = useState(false);
  const sendMessage = useSendMessage(myKey, myName);
  const voice = useVoiceRecorder();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  async function sendAttachment(file: File, durationSeconds?: number) {
    if (!thread) return;
    setSendingAttachment(true);
    try {
      await sendMessage.mutateAsync({ recipientKey: thread.partnerKey, body: "", attachmentFile: file, attachmentDurationSeconds: durationSeconds });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send the attachment");
    } finally {
      setSendingAttachment(false);
    }
  }

  async function shareLocation() {
    if (!thread) return;
    if (!navigator.geolocation) {
      toast.error("Location isn't available in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await sendMessage.mutateAsync({
            recipientKey: thread.partnerKey,
            body: "",
            location: { lat: pos.coords.latitude, lng: pos.coords.longitude, label: null },
          });
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
                            <BubbleContent className="flex flex-col gap-1.5">
                              <ChatAttachmentBubble message={m} />
                              {m.body ? <span>{m.body}</span> : null}
                            </BubbleContent>
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
                <InputGroupButton type="button" variant="ghost" size="icon-sm" disabled={sendingAttachment} aria-label="Record voice note" onClick={() => void voice.start()}>
                  <Mic />
                </InputGroupButton>
                <InputGroupButton type="submit" variant="default" size="icon-sm" className="ml-auto" disabled={!draft.trim() || sendMessage.isPending}>
                  <Send />
                  <span className="sr-only">Send</span>
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </form>
        )}
      </div>
    </div>
  );
}
