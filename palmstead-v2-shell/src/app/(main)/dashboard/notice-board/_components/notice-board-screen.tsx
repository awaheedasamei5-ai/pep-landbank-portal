"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, Flag, Link as LinkIcon, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { SubmitButton } from "@/components/submit-button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuthStore } from "@/stores/auth/auth-store";
import {
  NOTICE_COLOURS,
  type NoticeColour,
  type NoticePost,
  useCreateNoticePost,
  useDeleteNoticePost,
  useNoticeBoard,
  useReportNoticePost,
} from "./use-notice-board";

// Real sticky-note corkboard (OSS item 2, B.3). Lighter weight than
// Announcements on purpose -- no author gravitas, no read-tracking, just
// a shared board.
const COLOUR_CLASSES: Record<string, string> = {
  amber: "bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:border-amber-900",
  emerald: "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-900",
  sky: "bg-sky-50 border-sky-200 dark:bg-sky-950/40 dark:border-sky-900",
  rose: "bg-rose-50 border-rose-200 dark:bg-rose-950/40 dark:border-rose-900",
  violet: "bg-violet-50 border-violet-200 dark:bg-violet-950/40 dark:border-violet-900",
  slate: "bg-slate-50 border-slate-200 dark:bg-slate-900/60 dark:border-slate-800",
};

function ReportDialog({ post, reportedBy }: { post: NoticePost; reportedBy: string | undefined }) {
  const report = useReportNoticePost(reportedBy);
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);

  async function submit() {
    await report.mutateAsync({ postId: post.id, reason });
    setReason("");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" title="Report this post">
          <Flag className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report this post?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          This notifies Management instead of removing the post directly. Only Management or the original poster can actually delete it.
        </p>
        <Textarea placeholder="Why (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <DialogFooter>
          <SubmitButton type="button" loading={report.isPending} onClick={submit}>
            Send report
          </SubmitButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NoticeCard({ post, myKey, isManager }: { post: NoticePost; myKey: string | undefined; isManager: boolean }) {
  const deletePost = useDeleteNoticePost();
  const isMine = post.createdBy === myKey;

  return (
    <Card className={`${COLOUR_CLASSES[post.colour] ?? COLOUR_CLASSES.amber} relative`}>
      <CardContent className="grid gap-2 pt-6">
        {post.reportCount > 0 && isManager && (
          <Badge variant="destructive" className="w-fit">
            <AlertTriangle className="size-3" />
            {post.reportCount} report{post.reportCount === 1 ? "" : "s"}
          </Badge>
        )}
        <p className="whitespace-pre-wrap text-sm">{post.content}</p>
        {post.linkUrl && (
          <a href={post.linkUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs hover:underline">
            <LinkIcon className="size-3" />
            {post.linkLabel || post.linkUrl}
          </a>
        )}
        <div className="flex items-center justify-between pt-1 text-muted-foreground text-xs">
          <span>{formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}</span>
          <div className="flex items-center gap-1">
            {isMine || isManager ? (
              <ConfirmDialog
                trigger={
                  <Button variant="ghost" size="icon-sm">
                    <Trash2 className="size-3.5" />
                  </Button>
                }
                title="Delete this post?"
                description={isMine ? "This removes your own post." : "Management override -- removes this post for everyone."}
                confirmLabel="Delete"
                onConfirm={() => deletePost.mutateAsync(post.id)}
              />
            ) : (
              <ReportDialog post={post} reportedBy={myKey} />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ComposeForm({ createdBy, onDone }: { createdBy: string | undefined; onDone: () => void }) {
  const createPost = useCreateNoticePost(createdBy);
  const [content, setContent] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [colour, setColour] = useState<NoticeColour>("amber");

  async function submit() {
    if (!content.trim()) return;
    await createPost.mutateAsync({ content: content.trim(), linkUrl: linkUrl || null, linkLabel: linkLabel || null, colour });
    setContent("");
    setLinkUrl("");
    setLinkLabel("");
    setColour("amber");
    onDone();
  }

  return (
    <Card className="mb-4">
      <CardContent className="grid gap-3 pt-6">
        <Textarea placeholder="Selling a desk chair, team lunch Friday, anyone want to carpool..." value={content} onChange={(e) => setContent(e.target.value)} rows={3} />
        <div className="flex flex-wrap items-center gap-2">
          <Input placeholder="Link (optional)" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} className="max-w-56" />
          <Input placeholder="Link label" value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} className="max-w-40" />
          <div className="flex gap-1.5">
            {NOTICE_COLOURS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColour(c)}
                className={`size-6 rounded-full border-2 ${COLOUR_CLASSES[c]} ${colour === c ? "ring-2 ring-primary ring-offset-1" : ""}`}
                aria-label={c}
              />
            ))}
          </div>
          <SubmitButton type="button" loading={createPost.isPending} onClick={submit} className="ml-auto">
            Post
          </SubmitButton>
        </div>
      </CardContent>
    </Card>
  );
}

export function NoticeBoardScreen() {
  const profile = useAuthStore((s) => s.profile);
  const isManager = profile?.role === "manager";
  const { data, isLoading } = useNoticeBoard();
  const [showForm, setShowForm] = useState(false);
  const [tab, setTab] = useState<"board" | "reported">("board");

  const reported = (data ?? []).filter((p) => p.reportCount > 0);
  const visible = tab === "reported" ? reported : (data ?? []);

  return (
    <div>
      <PageHeader
        title="Notice Board"
        description="A shared corkboard -- lighter weight than Announcements."
        action={
          <div className="flex items-center gap-2">
            {isManager && (
              <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
                <TabsList>
                  <TabsTrigger value="board">Board</TabsTrigger>
                  <TabsTrigger value="reported">
                    Reported {reported.length > 0 && `(${reported.length})`}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            )}
            <Button onClick={() => setShowForm((v) => !v)}>
              <Plus />
              Post
            </Button>
          </div>
        }
      />

      {showForm && <ComposeForm createdBy={profile?.key} onDone={() => setShowForm(false)} />}

      {isLoading && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      )}

      {!isLoading && visible.length === 0 && (
        <p className="text-muted-foreground text-sm">{tab === "reported" ? "Nothing reported right now." : "The board is empty -- post the first note."}</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((post) => (
          <NoticeCard key={post.id} post={post} myKey={profile?.key} isManager={isManager} />
        ))}
      </div>
    </div>
  );
}
