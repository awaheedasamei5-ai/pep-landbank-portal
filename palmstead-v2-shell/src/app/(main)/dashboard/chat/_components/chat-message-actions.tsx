// Shared message-action UI used by both the 1:1 and group thread views
// (15-chat-whatsapp-full-replica.md): the "..." menu (Reply/Forward/Star/
// Delete), the reply-preview bar above the composer, the quoted-snippet
// shown inside a reply bubble, and the forward-target picker dialog.
"use client";

import { useState } from "react";

import { cn } from "cn";
import { Forward, MoreVertical, Reply, Star, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

import { previewText, type ChatMessage } from "./use-chat";
import { canDeleteForEveryone, useDeleteForEveryone, useDeleteForMe, useForwardMessage, useToggleStar } from "./use-chat-message-actions";

export interface ForwardTarget {
  key: string;
  name: string;
  kind: "dm" | "group";
}

export function MessageActionsTrigger({
  message,
  myKey,
  myName,
  starred,
  onReply,
  onForward,
}: {
  message: ChatMessage;
  myKey: string;
  myName: string | undefined;
  starred: boolean;
  onReply: () => void;
  onForward: () => void;
}) {
  const toggleStar = useToggleStar(myKey);
  const deleteForMe = useDeleteForMe(myKey);
  const deleteForEveryone = useDeleteForEveryone(() => {});
  const eligible = canDeleteForEveryone(message, myKey);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Message actions"
          className="shrink-0 rounded-full p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover/bubble-wrap:opacity-100"
        >
          <MoreVertical className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={onReply}>
          <Reply /> Reply
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onForward}>
          <Forward /> Forward
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => toggleStar.mutate({ messageId: message.id, starred })}>
          <Star className={cn(starred && "fill-current text-amber-500")} /> {starred ? "Unstar" : "Star"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => deleteForMe.mutate(message.id)} className="text-destructive">
          <Trash2 /> Delete for me
        </DropdownMenuItem>
        {eligible && (
          <DropdownMenuItem
            onClick={() => deleteForEveryone.mutate({ id: message.id, attachmentUrl: message.attachmentUrl })}
            className="text-destructive"
          >
            <Trash2 /> Delete for everyone
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ReplyPreviewBar({ message, onCancel }: { message: ChatMessage; onCancel: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-t-md border border-b-0 bg-muted/60 px-3 py-2">
      <div className="min-w-0 flex-1 border-[#25D366] border-l-2 pl-2 dark:border-[#00A884]">
        <div className="font-medium text-[#1DA851] text-xs dark:text-[#00A884]">{message.senderName}</div>
        <div className="truncate text-muted-foreground text-xs">{previewText(message)}</div>
      </div>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Cancel reply" onClick={onCancel}>
        <X className="size-4" />
      </Button>
    </div>
  );
}

export function QuotedSnippet({ quoted }: { quoted: ChatMessage | undefined }) {
  if (!quoted) return null;
  return (
    <div className="mb-1 rounded-md border-[#25D366] border-l-2 bg-black/5 px-2 py-1 dark:border-[#00A884] dark:bg-white/5">
      <div className="font-medium text-[#1DA851] text-xs dark:text-[#00A884]">{quoted.senderName}</div>
      <div className="truncate text-muted-foreground text-xs">{previewText(quoted)}</div>
    </div>
  );
}

export function ForwardedLabel() {
  return <div className="text-[11px] text-muted-foreground italic">Forwarded</div>;
}

export function ForwardDialog({
  open,
  onOpenChange,
  message,
  myKey,
  myName,
  targets,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  message: ChatMessage | null;
  myKey: string;
  myName: string | undefined;
  targets: ForwardTarget[];
}) {
  const [picked, setPicked] = useState<ForwardTarget | null>(null);
  const forward = useForwardMessage(myKey, myName);

  async function submit() {
    if (!message || !picked) return;
    try {
      await forward.mutateAsync({
        message,
        toRecipientKey: picked.kind === "dm" ? picked.key : undefined,
        toGroupId: picked.kind === "group" ? picked.key : undefined,
      });
      toast.success(`Forwarded to ${picked.name}`);
      setPicked(null);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not forward the message");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Forward message</DialogTitle>
        </DialogHeader>
        {message && (
          <div className="rounded-md border bg-muted/50 px-3 py-2 text-muted-foreground text-xs">{previewText(message)}</div>
        )}
        <Combobox
          items={targets}
          itemToStringLabel={(t: ForwardTarget) => t.name}
          isItemEqualToValue={(a: ForwardTarget, b: ForwardTarget) => a.key === b.key && a.kind === b.kind}
          value={picked}
          onValueChange={(v) => setPicked(v as ForwardTarget | null)}
        >
          <ComboboxInput placeholder="Search chats and groups…" showTrigger={false} />
          <ComboboxContent className="pointer-events-auto">
            <ComboboxEmpty>No chats found</ComboboxEmpty>
            <ComboboxList>
              {(item: ForwardTarget) => (
                <ComboboxItem key={`${item.kind}-${item.key}`} value={item} onClick={() => setPicked(item)}>
                  {item.name}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
        <Button onClick={() => void submit()} disabled={!picked || forward.isPending} className="w-full">
          Send
        </Button>
      </DialogContent>
    </Dialog>
  );
}
