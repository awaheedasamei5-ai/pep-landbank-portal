"use client";

import { useState } from "react";

import { formatDistanceToNow } from "date-fns";
import { Megaphone, MessageCircle, Plus, Users, X } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAuthStore } from "@/stores/auth/auth-store";

import { useAnnouncementAccess } from "./use-announcement-access";
import {
  ANNOUNCEMENT_CATEGORIES,
  type Announcement,
  type AnnouncementCategory,
  useAnnouncementComments,
  useAnnouncements,
  useCreateAnnouncement,
  useMarkAnnouncementRead,
  usePostComment,
  useRetractAnnouncement,
} from "./use-announcements";

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  ANNOUNCEMENT_CATEGORIES.map((c) => [c.value, c.label]),
);

function CommentThread({ announcementId, canComment }: { announcementId: string; canComment: boolean }) {
  const profile = useAuthStore((s) => s.profile);
  const { data: comments, isLoading } = useAnnouncementComments(announcementId);
  const postComment = usePostComment(announcementId);
  const [body, setBody] = useState("");

  async function submit() {
    if (!canComment || !body.trim() || !profile) return;
    await postComment.mutateAsync({ body: body.trim(), authorKey: profile.key, authorName: profile.name });
    setBody("");
  }

  return (
    <div className="mt-3 grid gap-2 border-t pt-3">
      {isLoading && <Skeleton className="h-8 w-full" />}
      {comments?.map((c) => (
        <div key={c.id} className="text-sm">
          <span className="font-medium">{c.authorName}</span>{" "}
          <span className="text-muted-foreground text-xs">
            {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
          </span>
          <p className="text-muted-foreground">{c.body}</p>
        </div>
      ))}
      {canComment ? (
        <div className="flex gap-2">
          <Input
            placeholder="Add a comment..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            className="h-8"
          />
          <Button size="sm" variant="outline" disabled={postComment.isPending} onClick={submit}>
            Post
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">Comments are read-only for your account.</p>
      )}
    </div>
  );
}

function AnnouncementCard({
  announcement,
  isManager,
  canComment,
}: {
  announcement: Announcement;
  isManager: boolean;
  canComment: boolean;
}) {
  const markRead = useMarkAnnouncementRead(useAuthStore((s) => s.profile?.key));
  const retract = useRetractAnnouncement();
  const [showComments, setShowComments] = useState(false);

  return (
    <Card className={!announcement.isRead ? "border-primary/40" : undefined}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              {!announcement.isRead && <span className="size-2 rounded-full bg-primary" />}
              <CardTitle className="text-base">{announcement.title}</CardTitle>
              <Badge variant="outline">{CATEGORY_LABEL[announcement.category] ?? announcement.category}</Badge>
            </div>
            <CardDescription>
              {formatDistanceToNow(new Date(announcement.createdAt), { addSuffix: true })}
            </CardDescription>
          </div>
          {isManager && (
            <Button variant="ghost" size="icon-sm" onClick={() => retract.mutate(announcement.id)} title="Retract">
              <X className="size-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <p className="whitespace-pre-wrap text-sm">{announcement.body}</p>
        <div className="mt-3 flex items-center gap-4 text-muted-foreground text-xs">
          {isManager && (
            <span className="flex items-center gap-1">
              <Users className="size-3" />
              {announcement.readCount} seen
            </span>
          )}
          <button
            type="button"
            className="flex items-center gap-1 hover:underline"
            onClick={() => setShowComments((v) => !v)}
          >
            <MessageCircle className="size-3" />
            {announcement.commentCount} comment{announcement.commentCount === 1 ? "" : "s"}
          </button>
          {!announcement.isRead && (
            <Button
              size="sm"
              variant="outline"
              className="ml-auto h-6 text-xs"
              onClick={() => markRead.mutate(announcement.id)}
            >
              Mark as read
            </Button>
          )}
        </div>
        {showComments && <CommentThread announcementId={announcement.id} canComment={canComment} />}
      </CardContent>
    </Card>
  );
}

function ComposeForm({ onDone }: { onDone: () => void }) {
  const profile = useAuthStore((s) => s.profile);
  const createAnnouncement = useCreateAnnouncement(profile?.key);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<AnnouncementCategory>("general");
  const [expiresAt, setExpiresAt] = useState("");

  async function submit() {
    if (!title.trim() || !body.trim()) return;
    await createAnnouncement.mutateAsync({
      title: title.trim(),
      body: body.trim(),
      category,
      expiresAt: expiresAt || null,
    });
    setTitle("");
    setBody("");
    setCategory("general");
    setExpiresAt("");
    onDone();
  }

  return (
    <Card className="mb-4">
      <CardContent className="grid gap-3 pt-6">
        <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Textarea
          placeholder="What's the announcement?"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Select value={category} onValueChange={(v) => setCategory(v as AnnouncementCategory)}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ANNOUNCEMENT_CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="w-40"
            title="Optional expiry"
          />
          <SubmitButton type="button" loading={createAnnouncement.isPending} onClick={submit} className="ml-auto">
            Publish
          </SubmitButton>
        </div>
      </CardContent>
    </Card>
  );
}

export function AnnouncementsScreen() {
  const profile = useAuthStore((s) => s.profile);
  const isManager = profile?.role === "manager";
  const access = useAnnouncementAccess(profile?.key);
  const canView = !access.isError && access.data?.view === true;
  const canComment = canView && access.data?.comment === true;
  const { data, isLoading, isError } = useAnnouncements(canView ? profile?.key : undefined);
  const [showCompose, setShowCompose] = useState(false);

  const unread = (data ?? []).filter((a) => !a.isRead);
  const read = (data ?? []).filter((a) => a.isRead);

  if (!profile?.key) return null;
  if (access.isError)
    return (
      <Alert variant="destructive">
        <AlertTitle>Announcement access could not be checked</AlertTitle>
        <AlertDescription>Refresh this page to try again.</AlertDescription>
      </Alert>
    );
  if (!access.data) return <Skeleton className="h-44 w-full" />;
  if (!canView)
    return (
      <Alert>
        <AlertTitle>Announcements access restricted</AlertTitle>
        <AlertDescription>Management controls access to company notices.</AlertDescription>
      </Alert>
    );

  return (
    <div>
      <PageHeader
        title="Announcements"
        description="Company news and announcements."
        action={
          isManager && (
            <Button onClick={() => setShowCompose((v) => !v)}>
              <Plus />
              New announcement
            </Button>
          )
        }
      />
      {!canComment && (
        <p className="mb-4 text-muted-foreground text-sm">
          You can read notices and mark them as seen. Comments are read-only.
        </p>
      )}
      {isError && (
        <Alert variant="destructive">
          <AlertTitle>Announcements could not be loaded</AlertTitle>
          <AlertDescription>Refresh this page to try again.</AlertDescription>
        </Alert>
      )}

      {showCompose && <ComposeForm onDone={() => setShowCompose(false)} />}

      {isLoading && (
        <div className="grid gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      )}

      {!isLoading && !isError && (data?.length ?? 0) === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
            <Megaphone className="size-8" />
            <p>No announcements yet.</p>
          </CardContent>
        </Card>
      )}

      {unread.length > 0 && (
        <div className="mb-6 grid gap-3">
          <h2 className="font-semibold text-sm text-muted-foreground">Unread</h2>
          {unread.map((a) => (
            <AnnouncementCard key={a.id} announcement={a} isManager={isManager} canComment={canComment} />
          ))}
        </div>
      )}

      {read.length > 0 && (
        <div className="grid gap-3">
          <h2 className="font-semibold text-sm text-muted-foreground">Archive</h2>
          {read.map((a) => (
            <AnnouncementCard key={a.id} announcement={a} isManager={isManager} canComment={canComment} />
          ))}
        </div>
      )}
    </div>
  );
}
