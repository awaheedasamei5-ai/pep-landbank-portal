// Real WhatsApp-style Status tab (13-chat-whatsapp-grade-rebuild.md): post
// a text or photo update, visible company-wide for 24h, with a real
// full-screen viewer and real per-viewer view tracking -- not a decorative
// "Status" label with nothing behind it.
"use client";

import { useRef, useState } from "react";

import { cn } from "cn";
import { Camera, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { getInitials } from "@/lib/utils";

import {
  useDeleteStatus,
  useMarkStatusViewed,
  useMyStatusViews,
  usePostStatus,
  useStatusGroups,
  useStatusImageUrl,
  useStatusViewers,
  type StatusGroup,
  type StatusUpdate,
} from "./use-status";

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

function StatusSlideImage({ path }: { path: string }) {
  const { data: url } = useStatusImageUrl(path);
  if (!url) return <div className="flex h-full items-center justify-center text-white/60 text-sm">Loading…</div>;
  // eslint-disable-next-line @next/next/no-img-element -- Storage signed URL, not a static asset
  return <img src={url} alt="" className="h-full w-full object-contain" />;
}

function StatusViewer({ group, myKey, onClose }: { group: StatusGroup; myKey: string; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const update = group.updates[index];
  const markViewed = useMarkStatusViewed(myKey, undefined);
  const { data: viewers } = useStatusViewers(group.authorKey === myKey ? update.id : null);
  const viewedRef = useRef<string | null>(null);

  if (update.id !== viewedRef.current) {
    viewedRef.current = update.id;
    markViewed.mutate(update.id);
  }

  function next() {
    if (index < group.updates.length - 1) setIndex(index + 1);
    else onClose();
  }
  function prev() {
    if (index > 0) setIndex(index - 1);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex shrink-0 items-center gap-1 px-3 pt-3">
        {group.updates.map((u, i) => (
          <div key={u.id} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/30">
            <div className={cn("h-full bg-white", i < index ? "w-full" : i === index ? "w-full" : "w-0")} />
          </div>
        ))}
      </div>
      <div className="flex shrink-0 items-center gap-2.5 px-3 py-3 text-white">
        <Avatar className="size-8">
          <AvatarFallback className="bg-white/10 text-white">{getInitials(group.authorName)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{group.authorName}</div>
          <div className="text-white/60 text-xs">{timeAgo(update.createdAt)}</div>
        </div>
        <Button type="button" variant="ghost" size="icon-sm" className="text-white hover:bg-white/10 hover:text-white" aria-label="Close" onClick={onClose}>
          <X />
        </Button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center" style={{ background: update.kind === "text" ? (update.background ?? "#128C7E") : undefined }}>
        <button type="button" className="absolute inset-y-0 left-0 w-1/3" aria-label="Previous" onClick={prev} />
        <button type="button" className="absolute inset-y-0 right-0 w-1/3" aria-label="Next" onClick={next} />
        {update.kind === "image" && update.imageUrl ? (
          <StatusSlideImage path={update.imageUrl} />
        ) : (
          <p className="max-w-md px-8 text-center font-medium text-2xl text-white wrap-break-word">{update.body}</p>
        )}
      </div>

      {group.authorKey === myKey && (
        <div className="shrink-0 px-4 py-3 text-white/80 text-xs">{viewers?.length ?? 0} view{(viewers?.length ?? 0) === 1 ? "" : "s"}</div>
      )}
    </div>
  );
}

function ComposeStatusDialog({ myKey, myName, open, onOpenChange }: { myKey: string; myName: string | undefined; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [body, setBody] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const post = usePostStatus(myKey, myName);

  async function submit() {
    if (!body.trim() && !imageFile) return;
    try {
      await post.mutateAsync({ body: body.trim(), imageFile: imageFile ?? undefined });
      setBody("");
      setImageFile(null);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not post your status");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogTitle>Add status update</DialogTitle>
        <Textarea placeholder="What's on your mind?" value={body} onChange={(e) => setBody(e.target.value)} className="min-h-24" />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
        />
        <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
          <Camera /> {imageFile ? imageFile.name : "Attach a photo"}
        </Button>
        <Button type="button" onClick={() => void submit()} disabled={post.isPending || (!body.trim() && !imageFile)} className="w-full">
          Post status — visible for 24 hours
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export function ChatStatusPanel({ myKey, myName, className }: { myKey: string; myName: string | undefined; className?: string }) {
  const { groups, isLoading } = useStatusGroups(myKey);
  const { data: myViews } = useMyStatusViews(myKey);
  const deleteStatus = useDeleteStatus(myKey);
  const [composeOpen, setComposeOpen] = useState(false);
  const [viewingGroup, setViewingGroup] = useState<StatusGroup | null>(null);

  const myGroup = groups.find((g) => g.authorKey === myKey);
  const others = groups.filter((g) => g.authorKey !== myKey);

  function isGroupUnviewed(group: StatusGroup): boolean {
    return group.updates.some((u) => !myViews?.has(u.id));
  }

  return (
    <div className={cn("flex h-full flex-col gap-3 pt-3", className)}>
      <div className="flex items-center justify-between gap-4 px-3 py-0.5">
        <h1 className="font-medium text-xl leading-none">Status</h1>
      </div>
      <Separator />

      <ScrollArea className="h-full min-h-0 flex-1">
        <div className="flex flex-col gap-1 px-2">
          <div
            role="button"
            tabIndex={0}
            className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left hover:bg-muted/75"
            onClick={() => (myGroup ? setViewingGroup(myGroup) : setComposeOpen(true))}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                myGroup ? setViewingGroup(myGroup) : setComposeOpen(true);
              }
            }}
          >
            <div className="relative shrink-0">
              <Avatar className={cn("size-12", myGroup && "ring-2 ring-[#25D366] dark:ring-[#00A884] ring-offset-2 ring-offset-sidebar")}>
                <AvatarFallback className="bg-muted text-foreground">{getInitials(myName ?? "Me")}</AvatarFallback>
              </Avatar>
              <span className="absolute right-0 bottom-0 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
                <Plus className="size-3.5" />
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium text-sm">My status</div>
              <div className="truncate text-muted-foreground text-xs">{myGroup ? `Updated ${timeAgo(myGroup.latest.createdAt)}` : "Tap to add a status update"}</div>
            </div>
            {myGroup && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Delete my status"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteStatus.mutate({ id: myGroup.latest.id, imageUrl: myGroup.latest.imageUrl });
                }}
              >
                <X className="size-4" />
              </Button>
            )}
          </div>

          {others.length > 0 && (
            <>
              <div className="px-2.5 pt-3 pb-1 text-muted-foreground text-xs">Recent updates</div>
              {others.map((group) => {
                const unviewed = isGroupUnviewed(group);
                return (
                  <button
                    key={group.authorKey}
                    type="button"
                    className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left hover:bg-muted/75"
                    onClick={() => setViewingGroup(group)}
                  >
                    <Avatar className={cn("size-12", unviewed ? "ring-2 ring-[#25D366] dark:ring-[#00A884] ring-offset-2 ring-offset-sidebar" : "opacity-70")}>
                      <AvatarFallback className="bg-muted text-foreground">{getInitials(group.authorName)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-sm">{group.authorName}</div>
                      <div className="truncate text-muted-foreground text-xs">{timeAgo(group.latest.createdAt)}</div>
                    </div>
                  </button>
                );
              })}
            </>
          )}

          {!isLoading && others.length === 0 && !myGroup && (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">No status updates in the last 24 hours.</div>
          )}
        </div>
      </ScrollArea>

      <ComposeStatusDialog myKey={myKey} myName={myName} open={composeOpen} onOpenChange={setComposeOpen} />
      {viewingGroup && <StatusViewer group={viewingGroup} myKey={myKey} onClose={() => setViewingGroup(null)} />}
    </div>
  );
}
