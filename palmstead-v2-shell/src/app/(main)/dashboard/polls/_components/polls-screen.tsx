"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Archive, Check, Plus, Vote, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { SubmitButton } from "@/components/submit-button";
import { useAuthStore } from "@/stores/auth/auth-store";
import { useArchivePoll, useCreatePoll, usePolls, useRemoveVote, useVotePoll, type Poll } from "./use-polls";

// Real Polls (OSS item 2, B.4): live results visible to everyone after
// voting, change-vote-before-deadline, past polls stay browsable. Open
// creation by default (polls.create permission, see use-polls.ts) --
// not Management-exclusive, matching the real source repo's own
// not-gatekept social-poll model.
function isPastDeadline(deadline: string | null): boolean {
  return Boolean(deadline && new Date(deadline).getTime() < Date.now());
}

function PollCard({ poll, myKey, isManager }: { poll: Poll; myKey: string | undefined; isManager: boolean }) {
  const vote = useVotePoll(myKey);
  const removeVote = useRemoveVote(myKey);
  const archivePoll = useArchivePoll();
  const locked = isPastDeadline(poll.deadline) || poll.isArchived;
  const canManage = poll.createdBy === myKey || isManager;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{poll.question}</CardTitle>
            <CardDescription>
              {poll.totalVotes} vote{poll.totalVotes === 1 ? "" : "s"}
              {poll.deadline && ` · ${locked ? "closed" : "closes"} ${formatDistanceToNow(new Date(poll.deadline), { addSuffix: true })}`}
              {poll.isArchived && " · archived"}
            </CardDescription>
          </div>
          {canManage && !poll.isArchived && (
            <Button variant="ghost" size="icon-sm" onClick={() => archivePoll.mutate(poll.id)} title="Archive">
              <Archive className="size-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="grid gap-2">
        {poll.options.map((option, i) => {
          const count = poll.voteCounts[i] ?? 0;
          const pct = poll.totalVotes > 0 ? Math.round((count / poll.totalVotes) * 100) : 0;
          const isMine = poll.myVoteIndex === i;
          return (
            <button
              key={i}
              type="button"
              disabled={locked}
              onClick={() => (isMine ? removeVote.mutate(poll.id) : vote.mutate({ pollId: poll.id, optionIndex: i }))}
              className={`relative overflow-hidden rounded-md border px-3 py-2 text-left text-sm transition-colors ${isMine ? "border-primary" : ""} ${locked ? "cursor-default" : "hover:bg-muted/50"}`}
            >
              <div className="absolute inset-y-0 left-0 bg-primary/10" style={{ width: `${pct}%` }} />
              <div className="relative flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5">
                  {isMine && <Check className="size-3.5 text-primary" />}
                  {option}
                </span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {count} ({pct}%)
                </span>
              </div>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}

function ComposeForm({ createdBy, onDone }: { createdBy: string | undefined; onDone: () => void }) {
  const createPoll = useCreatePoll(createdBy);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [deadline, setDeadline] = useState("");

  function updateOption(i: number, value: string) {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? value : o)));
  }

  async function submit() {
    const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim() || cleanOptions.length < 2) return;
    await createPoll.mutateAsync({ question: question.trim(), options: cleanOptions, deadline: deadline || null });
    setQuestion("");
    setOptions(["", ""]);
    setDeadline("");
    onDone();
  }

  return (
    <Card className="mb-4">
      <CardContent className="grid gap-3 pt-6">
        <Input placeholder="Ask a question..." value={question} onChange={(e) => setQuestion(e.target.value)} />
        {options.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input placeholder={`Option ${i + 1}`} value={o} onChange={(e) => updateOption(i, e.target.value)} />
            {options.length > 2 && (
              <Button variant="ghost" size="icon-sm" onClick={() => setOptions((prev) => prev.filter((_, idx) => idx !== i))}>
                <X className="size-4" />
              </Button>
            )}
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setOptions((prev) => [...prev, ""])}>
            <Plus />
            Add option
          </Button>
          <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="w-40" title="Optional deadline" />
          <SubmitButton type="button" loading={createPoll.isPending} onClick={submit} className="ml-auto">
            Publish poll
          </SubmitButton>
        </div>
      </CardContent>
    </Card>
  );
}

export function PollsScreen() {
  const profile = useAuthStore((s) => s.profile);
  const isManager = profile?.role === "manager";
  const { data, isLoading } = usePolls(profile?.key);
  const [showForm, setShowForm] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const active = (data ?? []).filter((p) => !p.isArchived && !isPastDeadline(p.deadline));
  const closed = (data ?? []).filter((p) => p.isArchived || isPastDeadline(p.deadline));

  return (
    <div>
      <PageHeader
        title="Polls"
        description="Vote, see live results, change your mind before the deadline."
        action={
          <Button onClick={() => setShowForm((v) => !v)}>
            <Plus />
            New poll
          </Button>
        }
      />

      {showForm && <ComposeForm createdBy={profile?.key} onDone={() => setShowForm(false)} />}

      {isLoading && (
        <div className="grid gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      )}

      {!isLoading && (data?.length ?? 0) === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
            <Vote className="size-8" />
            <p>No polls yet.</p>
          </CardContent>
        </Card>
      )}

      {active.length > 0 && (
        <div className="mb-6 grid gap-3">
          {active.map((p) => (
            <PollCard key={p.id} poll={p} myKey={profile?.key} isManager={isManager} />
          ))}
        </div>
      )}

      {closed.length > 0 && (
        <div className="grid gap-2">
          <button type="button" className="flex items-center gap-1 text-muted-foreground text-sm hover:underline" onClick={() => setShowArchived((v) => !v)}>
            <Badge variant="outline">{closed.length}</Badge>
            {showArchived ? "Hide" : "Show"} closed polls
          </button>
          {showArchived && (
            <div className="grid gap-3">
              {closed.map((p) => (
                <PollCard key={p.id} poll={p} myKey={profile?.key} isManager={isManager} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
