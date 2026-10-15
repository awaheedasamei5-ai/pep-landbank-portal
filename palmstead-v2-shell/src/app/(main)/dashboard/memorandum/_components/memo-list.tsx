// Cloned from src/app/(main)/mail/_components/mail-list.tsx (this repo's own
// real shadcn Mail example) and edited for Memorandum: Mail -> Memo,
// mail.from.name -> peer name (sender for Inbox, recipient for Sent/Drafts),
// isRead -> this app's own real unread rule (primary-recipient vs Cc read
// flags), receivedAt -> createdAt, single "Memos" group instead of
// Pinned/Inbox. Layout, classes, and interaction pattern otherwise kept
// verbatim per the standing "clone, don't hand-roll" rule.
import { cn } from "cn";
import { differenceInDays } from "date-fns/differenceInDays";
import { format } from "date-fns/format";
import { formatDistanceToNow } from "date-fns/formatDistanceToNow";
import { Paperclip } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";

import type { Memo, MemoFolder } from "./use-memoranda";

interface MemoListProps {
  folder: MemoFolder;
  memos: Memo[];
  myKey: string;
  selectedId: string | null;
  onSelectMemo: (memo: Memo) => void;
}

function peerName(folder: MemoFolder, memo: Memo): string {
  return folder === "sent" || folder === "drafts" ? memo.toName : memo.fromName;
}

function isUnread(folder: MemoFolder, memo: Memo, myKey: string): boolean {
  if (folder !== "inbox") return false;
  if (memo.toKey === myKey) return !memo.read;
  return !memo.cc.find((c) => c.staffKey === myKey)?.read;
}

export function MemoList({ folder, memos, myKey, selectedId, onSelectMemo }: MemoListProps) {
  const groupTitle = folder === "inbox" ? "Inbox" : folder === "sent" ? "Sent" : "Drafts";

  return (
    <ScrollArea className="**:data-[slot=scroll-area-viewport]:scroll-fade min-h-0 flex-1">
      <div className="flex flex-col gap-1.5 pt-0">
        <section className="flex flex-col gap-1.5">
          <div className="mx-3 text-muted-foreground text-xs">
            {groupTitle} ({memos.length})
          </div>

          <div className="flex flex-col">
            {memos.map((item) => {
              const unread = isUnread(folder, item, myKey);
              const name = peerName(folder, item);
              return (
                <button
                  type="button"
                  key={item.id}
                  className={cn(
                    "group relative w-full border-transparent border-y p-3 text-left transition-colors",
                    "hover:bg-muted/60",
                    selectedId === item.id &&
                      "border-border bg-muted/70 before:absolute before:-inset-y-px before:left-0 before:w-0.5 before:bg-primary",
                  )}
                  onClick={(event) => {
                    event.currentTarget.blur();
                    onSelectMemo(item);
                  }}
                >
                  <div className="flex items-start gap-3">
                    <Avatar className="size-9 after:rounded-sm">
                      <AvatarFallback className="rounded-sm bg-background">{name[0]}</AvatarFallback>
                    </Avatar>

                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className={cn("flex items-center gap-2 truncate font-normal text-sm", unread && "font-medium")}>
                            {name} {unread && <span className="size-2 rounded-full bg-blue-600" />}
                          </div>
                          <div className={cn("flex items-center gap-1 truncate font-medium text-foreground text-xs", !unread && "font-normal text-muted-foreground")}>
                            {item.subject || "(no subject)"}
                            {item.cc.length > 0 && <Paperclip className="size-3 shrink-0" />}
                          </div>
                        </div>

                        <div className={cn("shrink-0 text-muted-foreground text-xs", selectedId === item.id && "text-foreground")}>{formatMemoDate(item.createdAt)}</div>
                      </div>

                      <p className="mt-2 line-clamp-2 text-muted-foreground text-xs leading-5">{snippet(item.bodyHtml)}</p>
                    </div>
                  </div>
                </button>
              );
            })}
            {memos.length === 0 && (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                {folder === "inbox" ? "No memos yet." : folder === "sent" ? "Nothing sent yet." : "No drafts."}
              </div>
            )}
          </div>
        </section>
      </div>
    </ScrollArea>
  );
}

function formatMemoDate(date: string) {
  const memoDate = new Date(date);
  if (differenceInDays(new Date(), memoDate) <= 3) {
    return formatDistanceToNow(memoDate, { addSuffix: true });
  }
  return format(memoDate, "d MMM yyyy");
}

function snippet(html: string): string {
  if (typeof document === "undefined") return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent ?? "";
}
