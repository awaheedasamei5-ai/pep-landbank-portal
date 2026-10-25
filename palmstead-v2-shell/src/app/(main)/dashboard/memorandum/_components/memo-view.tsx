// Cloned from src/app/(main)/mail/_components/mail-view.tsx (this repo's own
// real shadcn Mail example) and edited for Memorandum: generic
// mail chrome (Pin/Archive/label/emoji/paperclip reply bar) that doesn't
// apply to a formal internal-letter system is replaced with this app's real
// actions (Reply, Edit-draft, Download PDF, Delete), the header block shows
// From/To/Cc exactly like a real letter, and the inline reply composer is
// removed in favor of this app's own full Compose dialog (matching V1's
// real seeded-compose pattern, not a quick-reply text box). Layout,
// separators, and tooltip pattern otherwise kept verbatim.
"use client";

import { format } from "date-fns/format";
import { ChevronLeft, ChevronRight, Download, FileEdit, Reply, Trash2, X } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { safeOperationCommentHtml } from "@/lib/palmstead/operations-comment-html";

import type { Memo } from "./use-memoranda";

interface MemoViewProps {
  memo: Memo | null;
  canDelete: boolean;
  isOwnDraft: boolean;
  onClose?: () => void;
  onReply: () => void;
  onEditDraft: () => void;
  onDownloadPdf: () => void;
  onDelete: () => void;
}

export function MemoView({ memo, canDelete, isOwnDraft, onClose, onReply, onEditDraft, onDownloadPdf, onDelete }: MemoViewProps) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 px-2 py-3">
      <div className="flex items-center">
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Close message" onClick={onClose}>
                <X />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Close message</TooltipContent>
          </Tooltip>
          <Separator className="h-4 data-vertical:self-center" orientation="vertical" />
          <div className="flex items-center gap-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Previous message" disabled>
                  <ChevronLeft />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Previous message</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Next message" disabled>
                  <ChevronRight />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Next message</TooltipContent>
            </Tooltip>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {isOwnDraft ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Edit draft" onClick={onEditDraft}>
                  <FileEdit />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Edit draft</TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Reply" onClick={onReply}>
                  <Reply />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reply</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Download PDF" onClick={onDownloadPdf}>
                <Download />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Download PDF</TooltipContent>
          </Tooltip>
          {canDelete && (
            <>
              <Separator className="h-4 data-vertical:self-center" orientation="vertical" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="Delete" onClick={onDelete}>
                    <Trash2 className="text-destructive" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Delete</TooltipContent>
              </Tooltip>
            </>
          )}
        </div>
      </div>

      <Separator />

      <div className="flex min-h-0 flex-1 flex-col">
        {memo ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="space-y-1.5">
              <div className="font-medium leading-none">{memo.subject || "(no subject)"}</div>
              <div className="text-muted-foreground text-xs leading-none">{format(new Date(memo.createdAt), "EEE, d MMM yyyy, h:mm a")}</div>
            </div>

            <Separator />

            <div className="flex gap-2">
              <Avatar className="size-9 after:rounded-sm">
                <AvatarFallback className="rounded-sm bg-background">{memo.fromName[0]}</AvatarFallback>
              </Avatar>

              <div className="flex h-full flex-col gap-1">
                <div className="flex items-center gap-2">
                  <div className="text-xs">{memo.fromName}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-muted-foreground text-xs">
                    To: <span className="text-foreground">{memo.toName}</span>
                  </div>
                  {memo.cc.length > 0 && (
                    <div className="text-muted-foreground text-xs">
                      Cc: <span className="text-foreground">{memo.cc.map((c) => c.staffName).join(", ")}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <Separator />

            <div
              className="scrollbar-none prose prose-sm dark:prose-invert min-h-0 max-w-none flex-1 overflow-y-auto text-sm"
              // eslint-disable-next-line react/no-danger -- sanitized at this render boundary (safeOperationCommentHtml's own allowlist), same real fix already applied to Operations comments. A memo body is user-composed rich text, not trusted markup -- it must never be rendered raw.
              dangerouslySetInnerHTML={{ __html: safeOperationCommentHtml(memo.bodyHtml) }}
            />
          </div>
        ) : (
          <div className="grid h-full place-items-center text-muted-foreground text-sm">Select a memo to read it.</div>
        )}
      </div>
    </div>
  );
}
