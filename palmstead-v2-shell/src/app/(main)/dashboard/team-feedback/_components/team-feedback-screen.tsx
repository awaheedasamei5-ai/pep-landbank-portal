"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { MessageCircle, MessagesSquare, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/page-header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { SubmitButton } from "@/components/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { useAuthStore } from "@/stores/auth/auth-store";
import {
  FEEDBACK_CATEGORIES,
  type FeedbackCategory,
  type FeedbackItem,
  useCreateFeedback,
  useFeedbackComments,
  usePostFeedbackComment,
  useTeamFeedback,
} from "./use-team-feedback";

// Real Team Feedback (OSS item 2, B.6) -- staff-to-management feedback,
// distinct from both client feedback and the new HR Complaints (B.5).
// Real V1 port: FEEDBACK_CATEGORIES, the comment-thread pattern.
const CATEGORY_VARIANT: Record<string, "outline" | "default" | "destructive"> = {
  Bug: "destructive",
  Suggestion: "default",
  "Feature Request": "default",
  Other: "outline",
};

function CommentThread({ feedbackId }: { feedbackId: string }) {
  const profile = useAuthStore((s) => s.profile);
  const { data: comments, isLoading } = useFeedbackComments(feedbackId);
  const postComment = usePostFeedbackComment(feedbackId);
  const [body, setBody] = useState("");

  async function submit() {
    if (!body.trim() || !profile) return;
    await postComment.mutateAsync({ body: body.trim(), authorKey: profile.key, authorName: profile.name });
    setBody("");
  }

  return (
    <div className="mt-3 grid gap-2 border-t pt-3">
      {isLoading && <Skeleton className="h-8 w-full" />}
      {comments?.map((c) => (
        <div key={c.id} className="text-sm">
          <span className="font-medium">{c.authorName}</span>{" "}
          <span className="text-muted-foreground text-xs">{formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}</span>
          <p className="text-muted-foreground">{c.body}</p>
        </div>
      ))}
      <div className="flex gap-2">
        <Input placeholder="Reply..." value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} className="h-8" />
        <Button size="sm" variant="outline" disabled={postComment.isPending} onClick={submit}>
          Reply
        </Button>
      </div>
    </div>
  );
}

function FeedbackCard({ item }: { item: FeedbackItem }) {
  const [showComments, setShowComments] = useState(false);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Badge variant={CATEGORY_VARIANT[item.category] ?? "outline"}>{item.category}</Badge>
          <CardDescription>
            {item.authorName} · {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <p className="whitespace-pre-wrap text-sm">{item.body}</p>
        <button type="button" className="mt-3 flex items-center gap-1 text-muted-foreground text-xs hover:underline" onClick={() => setShowComments((v) => !v)}>
          <MessageCircle className="size-3" />
          {item.commentCount} repl{item.commentCount === 1 ? "y" : "ies"}
        </button>
        {showComments && <CommentThread feedbackId={item.id} />}
      </CardContent>
    </Card>
  );
}

function ComposeForm({ onDone }: { onDone: () => void }) {
  const profile = useAuthStore((s) => s.profile);
  const createFeedback = useCreateFeedback(profile?.key, profile?.name);
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<FeedbackCategory>("Suggestion");

  async function submit() {
    if (!body.trim()) return;
    await createFeedback.mutateAsync({ body: body.trim(), category });
    setBody("");
    setCategory("Suggestion");
    onDone();
  }

  return (
    <Card className="mb-4">
      <CardContent className="grid gap-3 pt-6">
        <Textarea placeholder="Share feedback with Management..." value={body} onChange={(e) => setBody(e.target.value)} rows={4} />
        <div className="flex items-center gap-2">
          <Select value={category} onValueChange={(v) => setCategory(v as FeedbackCategory)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FEEDBACK_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <SubmitButton type="button" loading={createFeedback.isPending} onClick={submit} className="ml-auto">
            Post
          </SubmitButton>
        </div>
      </CardContent>
    </Card>
  );
}

export function TeamFeedbackScreen() {
  const { data, isLoading } = useTeamFeedback();
  const [showForm, setShowForm] = useState(false);

  return (
    <div>
      <PageHeader
        title="Team Feedback"
        description="Feedback shared between staff and management."
        action={
          <Button onClick={() => setShowForm((v) => !v)}>
            <Plus />
            Share feedback
          </Button>
        }
      />

      {showForm && <ComposeForm onDone={() => setShowForm(false)} />}

      {isLoading && (
        <div className="grid gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      )}

      {!isLoading && (data?.length ?? 0) === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
            <MessagesSquare className="size-8" />
            <p>No feedback yet.</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {data?.map((item) => (
          <FeedbackCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
