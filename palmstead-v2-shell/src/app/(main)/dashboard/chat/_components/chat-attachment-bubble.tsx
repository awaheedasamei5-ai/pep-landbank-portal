// Renders a message's media content by kind. New sends carry attachmentUrl
// (a chat-attachments Storage path, resolved to a real signed URL here);
// legacy rows (V1's own real production messages, pre-dating this rebuild)
// carry attachmentData as a base64 data URI instead and render directly from
// it -- same bubble shapes, no migration, no visual regression for those 100
// real historical rows.
"use client";

import { useState } from "react";

import { cn } from "cn";
import { Download, FileText, MapPin } from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

import { useAttachmentSignedUrl, type ChatMessage } from "./use-chat";

function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function useResolvedUrl(message: ChatMessage): string | null {
  const signed = useAttachmentSignedUrl(message.attachmentUrl);
  if (message.attachmentUrl) return signed.data ?? null;
  return message.attachmentData;
}

function ImageBubble({ message }: { message: ChatMessage }) {
  const url = useResolvedUrl(message);
  const [open, setOpen] = useState(false);
  if (!url) return <Skeleton className="h-40 w-56 rounded-md" />;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="block overflow-hidden rounded-md" aria-label={`Open ${message.attachmentName ?? "photo"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Storage/data-URI image, not a static asset Next can optimize */}
        <img src={url} alt={message.attachmentName ?? "Photo"} className="max-h-72 max-w-72 rounded-md object-cover" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl border-none bg-transparent p-0 shadow-none">
          <DialogTitle className="sr-only">{message.attachmentName ?? "Photo"}</DialogTitle>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={message.attachmentName ?? "Photo"} className="max-h-[85vh] w-full rounded-md object-contain" />
        </DialogContent>
      </Dialog>
    </>
  );
}

function VideoBubble({ message }: { message: ChatMessage }) {
  const url = useResolvedUrl(message);
  if (!url) return <Skeleton className="h-40 w-64 rounded-md" />;
  return <video src={url} controls className="max-h-72 max-w-72 rounded-md" />;
}

function AudioBubble({ message }: { message: ChatMessage }) {
  const url = useResolvedUrl(message);
  if (!url) return <Skeleton className="h-10 w-56 rounded-full" />;
  return (
    <div className="flex items-center gap-2">
      <audio src={url} controls className="h-10 w-64" />
      {message.attachmentDurationSeconds ? <span className="text-xs opacity-70">{formatDuration(message.attachmentDurationSeconds)}</span> : null}
    </div>
  );
}

function FileBubble({ message }: { message: ChatMessage }) {
  const url = useResolvedUrl(message);
  return (
    <a
      href={url ?? undefined}
      download={message.attachmentName ?? undefined}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "flex w-56 items-center gap-2.5 rounded-md border border-current/10 bg-background/40 px-3 py-2.5 text-current no-underline",
        !url && "pointer-events-none opacity-60",
      )}
    >
      <FileText className="size-8 shrink-0 opacity-80" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm leading-5">{message.attachmentName ?? "File"}</div>
        <div className="text-xs opacity-70">{formatBytes(message.attachmentSizeBytes) || "Tap to open"}</div>
      </div>
      <Download className="size-4 shrink-0 opacity-60" />
    </a>
  );
}

function LocationBubble({ message }: { message: ChatMessage }) {
  if (message.locationLat == null || message.locationLng == null) return null;
  const { locationLat: lat, locationLng: lng, locationLabel: label } = message;
  const mapUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
  const tileUrl = `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=15&size=280x160&markers=${lat},${lng},red-pushpin`;
  return (
    <a href={mapUrl} target="_blank" rel="noreferrer" className="block w-64 overflow-hidden rounded-md">
      {/* eslint-disable-next-line @next/next/no-img-element -- third-party static map tile, not a local/remote Next asset */}
      <img src={tileUrl} alt={label ?? "Shared location"} className="h-40 w-full bg-muted object-cover" />
      <div className="flex items-center gap-1.5 bg-background/40 px-2.5 py-1.5 text-xs">
        <MapPin className="size-3.5 shrink-0" />
        <span className="truncate">{label ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`}</span>
      </div>
    </a>
  );
}

export function ChatAttachmentBubble({ message }: { message: ChatMessage }) {
  const hasAttachment = message.kind === "location" || Boolean(message.attachmentUrl || message.attachmentData);
  if (!hasAttachment) return null;

  if (message.kind === "location") return <LocationBubble message={message} />;

  const effectiveKind = message.kind ?? (message.attachmentType?.startsWith("image/") ? "image" : "file");
  switch (effectiveKind) {
    case "image":
      return <ImageBubble message={message} />;
    case "video":
      return <VideoBubble message={message} />;
    case "audio":
      return <AudioBubble message={message} />;
    default:
      return <FileBubble message={message} />;
  }
}
