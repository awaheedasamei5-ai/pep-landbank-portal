"use client";

import { useEffect, useMemo, useState } from "react";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDirectory, type DirectoryStaff } from "@/app/(main)/dashboard/directory/_components/use-directory";

import { MemoEditorSurface, MemoEditorToolbar, useMemoEditor } from "./memo-editor";
import type { Memo, SendMemoInput } from "./use-memoranda";
import { useSaveMemo } from "./use-memoranda";

export interface ComposeSeed {
  editingMemo?: Memo | null;
  replyTo?: { toKey: string; toName: string; subject: string } | null;
  parentId?: string | null;
}

interface ComposeMemoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  myKey: string;
  myName: string;
  seed?: ComposeSeed | null;
}

const isSameStaff = (a: DirectoryStaff, b: DirectoryStaff) => a.agentKey === b.agentKey;

export function ComposeMemoDialog({ open, onOpenChange, myKey, myName, seed }: ComposeMemoDialogProps) {
  const { data: staff } = useDirectory();
  const others = useMemo(() => (staff ?? []).filter((s) => s.agentKey !== myKey), [staff, myKey]);

  const [toStaff, setToStaff] = useState<DirectoryStaff | null>(null);
  const [toInput, setToInput] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [cc, setCc] = useState<DirectoryStaff[]>([]);
  const [sending, setSending] = useState(false);

  const saveMemo = useSaveMemo();
  const editor = useMemoEditor({ content: bodyHtml, onChange: setBodyHtml });

  useEffect(() => {
    if (!open) return;
    if (seed?.editingMemo) {
      const m = seed.editingMemo;
      setToStaff(others.find((s) => s.agentKey === m.toKey) ?? { agentKey: m.toKey, name: m.toName } as DirectoryStaff);
      setToInput(m.toName);
      setSubject(m.subject);
      setBodyHtml(m.bodyHtml);
      setCc(m.cc.map((c) => others.find((s) => s.agentKey === c.staffKey) ?? ({ agentKey: c.staffKey, name: c.staffName } as DirectoryStaff)));
    } else if (seed?.replyTo) {
      const replyStaff = others.find((s) => s.agentKey === seed.replyTo?.toKey) ?? null;
      setToStaff(replyStaff);
      setToInput(replyStaff?.name ?? seed.replyTo.toName);
      setSubject(seed.replyTo.subject.startsWith("Re: ") ? seed.replyTo.subject : `Re: ${seed.replyTo.subject}`);
      setBodyHtml("");
      setCc([]);
    } else {
      setToStaff(null);
      setToInput("");
      setSubject("");
      setBodyHtml("");
      setCc([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, seed]);

  const ccAnchor = useComboboxAnchor();
  const ccCandidates = useMemo(() => others.filter((s) => s.agentKey !== toStaff?.agentKey), [others, toStaff]);

  async function submit(status: "draft" | "sent") {
    if (status === "sent") {
      if (!toStaff) {
        toast.error("Choose a recipient");
        return;
      }
      if (!subject.trim()) {
        toast.error("Add a subject");
        return;
      }
      const plain = editor?.getText().trim() ?? "";
      if (!plain) {
        toast.error("Write something first");
        return;
      }
    }
    setSending(true);
    try {
      const input: SendMemoInput = {
        id: seed?.editingMemo?.id,
        fromKey: myKey,
        fromName: myName,
        toKey: toStaff?.agentKey ?? "",
        toName: toStaff?.name ?? "",
        subject: subject.trim(),
        bodyHtml,
        parentId: seed?.parentId ?? seed?.editingMemo?.parentId ?? null,
        ccKeys: cc.map((c) => ({ key: c.agentKey, name: c.name })),
        status,
      };
      await saveMemo.mutateAsync(input);
      toast.success(status === "sent" ? "Memo sent" : "Draft saved");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the memo");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle>{seed?.editingMemo ? "Edit memo" : "New memo"}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>To</Label>
              <Combobox
                items={others}
                itemToStringLabel={(s: DirectoryStaff) => s.name}
                isItemEqualToValue={isSameStaff}
                inputValue={toInput}
                onInputValueChange={setToInput}
                value={toStaff}
                onValueChange={(v) => setToStaff(v as DirectoryStaff | null)}
              >
                <ComboboxInput placeholder="Choose a recipient…" showTrigger={false} />
                <ComboboxContent>
                  <ComboboxEmpty>No staff found</ComboboxEmpty>
                  <ComboboxList>
                    {(item: DirectoryStaff) => (
                      <ComboboxItem key={item.agentKey} value={item}>
                        {item.name}
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="memo-subject">Subject</Label>
              <Input id="memo-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Cc</Label>
            <div ref={ccAnchor}>
              <Combobox
                multiple
                items={ccCandidates}
                itemToStringLabel={(s: DirectoryStaff) => s.name}
                isItemEqualToValue={isSameStaff}
                value={cc}
                onValueChange={(v) => setCc(v as DirectoryStaff[])}
              >
                <ComboboxChips>
                  {cc.map((c) => (
                    <ComboboxChip key={c.agentKey}>{c.name}</ComboboxChip>
                  ))}
                  <ComboboxChipsInput placeholder={cc.length ? "" : "Type a name to add…"} />
                </ComboboxChips>
                <ComboboxContent anchor={ccAnchor}>
                  <ComboboxEmpty>No matches</ComboboxEmpty>
                  <ComboboxList>
                    {(item: DirectoryStaff) => (
                      <ComboboxItem key={item.agentKey} value={item}>
                        {item.name}
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Memo</Label>
            <div className="rounded-lg border border-border">
              <MemoEditorToolbar editor={editor} />
              <MemoEditorSurface editor={editor} />
            </div>
            <p className="text-xs text-muted-foreground">
              Letterhead, date, and the recipient&apos;s name are added automatically when this is downloaded as a PDF.
            </p>
          </div>
        </div>

        <DialogFooter className="border-t border-border px-6 py-4">
          <Button variant="outline" onClick={() => submit("draft")} disabled={sending} className="flex-1">
            Save draft
          </Button>
          <Button onClick={() => submit("sent")} disabled={sending} className="flex-1">
            Send memo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
