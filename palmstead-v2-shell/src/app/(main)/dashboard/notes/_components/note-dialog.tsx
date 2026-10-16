"use client";

import { useEffect, useRef, useState } from "react";

import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import { NoteEditorSurface, NoteEditorToolbar, useNoteEditor } from "./note-editor";
import { useSaveNote, type Note } from "./use-notes";

// Real note editor dialog (10-notes-plan.md). Matches V1's real low-friction
// intent ("jot something down") -- autosaves on close/blur rather than a
// manual Save button, same as V1's own quick-note behaviour, just upgraded
// from a plain textarea to the real TipTap editor.
interface NoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  note: Note | null;
  myKey: string | undefined;
}

export function NoteDialog({ open, onOpenChange, note, myKey }: NoteDialogProps) {
  const [title, setTitle] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const saveNote = useSaveNote(myKey);
  const editor = useNoteEditor({ content: bodyHtml, onChange: setBodyHtml });
  const dirty = useRef(false);

  useEffect(() => {
    if (!open) return;
    setTitle(note?.title ?? "");
    setBodyHtml(note?.body ?? "");
    dirty.current = false;
  }, [open, note]);

  async function persist() {
    if (!dirty.current) return;
    const plain = editor?.getText().trim() ?? "";
    if (!title.trim() && !plain) return;
    try {
      await saveNote.mutateAsync({ id: note?.id, title: title.trim(), body: bodyHtml });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the note");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) void persist();
        onOpenChange(next);
      }}
    >
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="sr-only">{note ? "Edit note" : "New note"}</DialogTitle>
          <Input
            value={title}
            onChange={(e) => {
              dirty.current = true;
              setTitle(e.target.value);
            }}
            placeholder="Untitled note"
            className="border-none px-0 text-lg font-semibold shadow-none focus-visible:ring-0"
          />
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div
            className="rounded-lg border border-border"
            onInput={() => {
              dirty.current = true;
            }}
          >
            <NoteEditorToolbar editor={editor} />
            <NoteEditorSurface editor={editor} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
