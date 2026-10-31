"use client";

import { useState } from "react";

import { Download, FileEdit, FileText, Plus, Send, StickyNote, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { useAuthStore } from "@/stores/auth/auth-store";
import { useNotesAccess } from "@/lib/permissions/use-notes-access";
import { ComposeMemoDialog, type ComposeSeed } from "@/app/(main)/dashboard/memorandum/_components/compose-memo-dialog";
import { useSaveMemo } from "@/app/(main)/dashboard/memorandum/_components/use-memoranda";

import { NoteDialog } from "./note-dialog";
import { useDeleteNote, useNotes, type Note } from "./use-notes";

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function snippet(html: string): string {
  if (typeof document === "undefined") return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  const text = (div.textContent ?? "").trim();
  return text.length > 140 ? `${text.slice(0, 140)}…` : text;
}

function plainText(html: string): string {
  if (typeof document === "undefined") return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent ?? "";
}

function downloadNote(note: Note) {
  const text = `${note.title ? `${note.title}\n\n` : ""}${plainText(note.body)}`;
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(note.title || "note").replace(/[^a-z0-9]+/gi, "_").slice(0, 40)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

export function NotesScreen() {
  const profile = useAuthStore((s) => s.profile);
  const myKey = profile?.key;

  const access = useNotesAccess(myKey);
  const canView = !access.isError && access.data?.view === true;
  const canManage = canView && access.data?.manage === true;
  const { data: notes, isLoading, isError: notesError } = useNotes(canView ? myKey : undefined);
  const deleteNote = useDeleteNote(myKey);
  const saveMemo = useSaveMemo();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeSeed, setComposeSeed] = useState<ComposeSeed | null>(null);

  function openNote(note: Note | null) {
    if (!note && !canManage) return;
    setEditingNote(note);
    setDialogOpen(true);
  }

  function sendAsMemo(note: Note) {
    setComposeSeed({ fromNote: { title: note.title || "Untitled note", bodyHtml: note.body } });
    setComposeOpen(true);
  }

  async function saveAsDraft(note: Note) {
    if (!myKey || !canManage) return;
    try {
      await saveMemo.mutateAsync({
        fromKey: myKey,
        fromName: profile?.name ?? "",
        toKey: "",
        toName: "",
        subject: note.title || "Untitled note",
        bodyHtml: note.body,
        ccKeys: [],
        status: "draft",
      });
      toast.success("Saved to Memorandum drafts");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save as draft");
    }
  }

  async function handleDelete(note: Note) {
    if (!canManage) return;
    try {
      await deleteNote.mutateAsync(note.id);
      toast.success("Note deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete this note");
    }
  }

  if (!myKey) return null;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Notes"
        description="Your private notes, available here whenever you need them."
        action={
          canManage ? <Button onClick={() => openNote(null)} className="gap-2">
            <Plus className="size-4" />
            New note
          </Button> : undefined
        }
      />

      {access.isError && <Alert variant="destructive"><AlertTitle>Notes access could not be checked</AlertTitle><AlertDescription>Refresh this page before opening notes.</AlertDescription></Alert>}
      {access.data && !canView && <Alert><AlertTitle>Notes access restricted</AlertTitle><AlertDescription>Management controls access to personal Notes.</AlertDescription></Alert>}
      {canView && !canManage && <Alert><AlertTitle>Notes are read-only</AlertTitle><AlertDescription>You can read and download your notes. Editing and sharing are unavailable.</AlertDescription></Alert>}
      {canView && notesError && <Alert variant="destructive"><AlertTitle>Notes could not be loaded</AlertTitle><AlertDescription>Refresh this page and try again.</AlertDescription></Alert>}
      {!access.data && !access.isError ? (
        <Skeleton className="h-44 w-full" />
      ) : !canView || notesError ? null : isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-44 w-full" />
          ))}
        </div>
      ) : (notes?.length ?? 0) === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <StickyNote className="size-8 text-muted-foreground" />
            <div>
              <p className="font-medium">No notes yet</p>
              <p className="text-sm text-muted-foreground">{canManage ? 'Tap "New note" to jot something down.' : "There are no notes to read."}</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {notes?.map((note) => (
            <Card key={note.id} className="group flex flex-col">
              <CardHeader className="cursor-pointer" onClick={() => openNote(note)}>
                <CardTitle className="truncate text-base">{note.title || "Untitled note"}</CardTitle>
                <p className="text-xs text-muted-foreground">{timeAgo(note.updatedAt)}</p>
              </CardHeader>
              <CardContent className="flex-1 cursor-pointer" onClick={() => openNote(note)}>
                <p className="line-clamp-4 text-sm text-muted-foreground">{snippet(note.body) || "No content yet."}</p>
              </CardContent>
              <CardFooter className="flex flex-wrap gap-1 border-t border-border pt-3">
                <Button size="sm" variant="ghost" onClick={() => openNote(note)}>
                  <FileEdit className="size-3.5" />
                  {canManage ? "Open" : "Read"}
                </Button>
                {canManage && <Button size="sm" variant="ghost" onClick={() => saveAsDraft(note)}>
                  <FileText className="size-3.5" />
                  Save as Draft
                </Button>}
                {canManage && <Button size="sm" variant="ghost" onClick={() => sendAsMemo(note)}>
                  <Send className="size-3.5" />
                  Send as Memo
                </Button>}
                <Button size="sm" variant="ghost" onClick={() => downloadNote(note)}>
                  <Download className="size-3.5" />
                  Download
                </Button>
                {canManage && <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDelete(note)}>
                  <Trash2 className="size-3.5" />
                  Delete
                </Button>}
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {canView && <NoteDialog open={dialogOpen} onOpenChange={setDialogOpen} note={editingNote} myKey={myKey} canManage={canManage} />}
      {canManage && <ComposeMemoDialog open={composeOpen} onOpenChange={setComposeOpen} myKey={myKey} myName={profile?.name ?? ""} seed={composeSeed} />}
    </div>
  );
}

