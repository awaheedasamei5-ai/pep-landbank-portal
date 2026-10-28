"use client";

import { useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireSupabase } from "@/lib/supabase.client";

type Request = {
  id: string;
  requester_id: string;
  department_id: string | null;
  route: string;
  category: string;
  purpose: string;
  amount: number;
  needed_by: string;
  status: string;
  revision: number;
  created_at: string;
  approved_budget_revision: number | null;
  approved_at: string | null;
};
type Event = {
  id: number;
  request_id: string;
  actor_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string;
  note: string;
  occurred_at: string;
};
type Person = { id: string; name: string };
type Department = { id: string; name: string };
const money = (amount: number) => new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" }).format(amount);
const validAmount = (value: string) => /^\d{1,12}(?:\.\d{1,2})?$/.test(value) && Number(value) > 0;

export function RequestsPanel() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [purpose, setPurpose] = useState("");
  const [amount, setAmount] = useState("");
  const [neededBy, setNeededBy] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingRevision, setEditingRevision] = useState<number | null>(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [message, setMessage] = useState("");
  const query = useQuery({
    queryKey: ["finance-requests"],
    queryFn: async () => {
      const sb = requireSupabase();
      const auth = await sb.auth.getUser();
      if (auth.error || !auth.data.user) throw new Error("Your session has expired. Please sign in again.");
      const [requests, people, departments, roles, memberships, direct] = await Promise.all([
        sb
          .from("finance_requests")
          .select(
            "id,requester_id,department_id,route,category,purpose,amount,needed_by,status,revision,created_at,approved_budget_revision,approved_at",
          )
          .order("created_at", { ascending: false })
          .limit(200),
        sb.from("profiles").select("id,name").eq("active", true).order("name"),
        sb.from("finance_departments").select("id,name").eq("active", true),
        sb
          .from("finance_role_assignments")
          .select("finance_role,department_id")
          .eq("profile_id", auth.data.user.id)
          .is("revoked_at", null),
        sb
          .from("finance_staff_departments")
          .select("department_id")
          .eq("profile_id", auth.data.user.id)
          .is("ended_at", null),
        sb.from("finance_direct_routes").select("profile_id").eq("profile_id", auth.data.user.id),
      ]);
      for (const result of [requests, people, departments, roles, memberships, direct])
        if (result.error) throw result.error;
      return {
        requests: (requests.data ?? []) as Request[],
        people: (people.data ?? []) as Person[],
        departments: (departments.data ?? []) as Department[],
        roles: roles.data ?? [],
        memberDepartment: memberships.data?.[0]?.department_id ?? null,
        direct: Boolean(direct.data?.length),
        userId: auth.data.user.id,
      };
    },
  });
  const history = useQuery({
    queryKey: ["finance-request-history", selectedId],
    enabled: Boolean(selectedId),
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from("finance_request_events")
        .select("id,request_id,actor_id,event_type,from_status,to_status,note,occurred_at")
        .eq("request_id", selectedId)
        .order("occurred_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Event[];
    },
  });
  const mutation = useMutation({
    mutationFn: async (
      action: { kind: "save" } | { kind: "transition"; id: string; revision: number; action: string },
    ) => {
      const sb = requireSupabase();
      const result =
        action.kind === "save"
          ? await sb.rpc("finance_save_request", {
              p_request_id: editingId,
              p_category: category.trim(),
              p_purpose: purpose.trim(),
              p_amount: Number(amount),
              p_needed_by: neededBy,
              p_expected_revision: editingRevision,
            })
          : await sb.rpc("finance_transition_request", {
              p_request_id: action.id,
              p_action: action.action,
              p_expected_revision: action.revision,
              p_note: decisionNote.trim(),
            });
      if (result.error) throw result.error;
      return action.kind === "save"
        ? { kind: "save", id: result.data as string }
        : { kind: "transition", id: action.id };
    },
    onSuccess: async (result) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["finance-requests"] }),
        qc.invalidateQueries({ queryKey: ["finance-budgets"] }),
        qc.invalidateQueries({ queryKey: ["finance-request-history"] }),
      ]);
      setSelectedId(result.id);
      setMessage(
        result.kind === "save"
          ? "Draft saved. Review it, then submit when ready."
          : "Decision recorded in the request history.",
      );
      if (result.kind === "save") {
        setEditingId(null);
        setEditingRevision(null);
        setCategory("");
        setPurpose("");
        setAmount("");
        setNeededBy("");
      }
      setDecisionNote("");
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Could not save the request."),
  });
  const data = query.data;
  const selected = data?.requests.find((r) => r.id === selectedId) ?? null;
  const person = (id: string) => data?.people.find((p) => p.id === id)?.name ?? "Former staff member";
  const department = (id: string | null) =>
    id ? (data?.departments.find((d) => d.id === id)?.name ?? "Department") : "Direct to Finance";
  const owned = selected?.requester_id === data?.userId;
  const hod = data?.roles.some(
    (r) => r.finance_role === "department_head" && r.department_id === selected?.department_id,
  );
  const financeHead = data?.roles.some((r) => r.finance_role === "finance_head");
  const startEdit = (request: Request) => {
    setSelectedId(request.id);
    setEditingId(request.id);
    setEditingRevision(request.revision);
    setCategory(request.category);
    setPurpose(request.purpose);
    setAmount(String(request.amount));
    setNeededBy(request.needed_by);
  };
  const act = (action: string) =>
    selected && mutation.mutate({ kind: "transition", id: selected.id, revision: selected.revision, action });
  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(300px,0.95fr)_minmax(0,1.5fr)]">
      <div className="flex min-w-0 flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>New staff request</CardTitle>
            <CardDescription>
              {data?.direct
                ? "Your approved route goes directly to Finance."
                : data?.memberDepartment
                  ? `Your route goes through ${department(data.memberDepartment)}.`
                  : "Management must assign your department or direct Finance route before you can submit."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                mutation.mutate({ kind: "save" });
              }}
            >
              <div className="flex flex-col gap-1">
                <Label htmlFor="request-category">Budget category</Label>
                <Input
                  id="request-category"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  minLength={2}
                  maxLength={80}
                  required
                  placeholder="Use the approved budget category"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="request-purpose">Purpose and deliverable</Label>
                <textarea
                  id="request-purpose"
                  value={purpose}
                  onChange={(event) => setPurpose(event.target.value)}
                  minLength={8}
                  maxLength={2000}
                  required
                  rows={3}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="request-amount">Amount (GHS)</Label>
                  <Input
                    id="request-amount"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    inputMode="decimal"
                    required
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="request-needed">Needed by</Label>
                  <Input
                    id="request-needed"
                    type="date"
                    value={neededBy}
                    onChange={(event) => setNeededBy(event.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="submit"
                  disabled={
                    mutation.isPending ||
                    (!data?.direct && !data?.memberDepartment) ||
                    !validAmount(amount) ||
                    purpose.trim().length < 8
                  }
                >
                  {editingId ? "Save changes" : "Save draft"}
                </Button>
                {editingId && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setEditingId(null);
                      setEditingRevision(null);
                      setCategory("");
                      setPurpose("");
                      setAmount("");
                      setNeededBy("");
                    }}
                  >
                    Clear form
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Request register</CardTitle>
            <CardDescription>Only requests you are authorized to see are listed.</CardDescription>
          </CardHeader>
          <CardContent className="flex max-h-[35rem] flex-col gap-1 overflow-y-auto">
            {query.isLoading && <p className="text-sm text-muted-foreground">Loading requests…</p>}
            {query.isError && (
              <p role="alert" className="text-sm text-destructive">
                {query.error.message}
              </p>
            )}
            {!data?.requests.length && !query.isLoading && (
              <p className="text-sm text-muted-foreground">No requests yet. Save a draft to begin.</p>
            )}
            {data?.requests.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedId(r.id)}
                aria-current={selectedId === r.id ? "page" : undefined}
                className="flex min-w-0 flex-col gap-1 rounded-md border p-3 text-left hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring"
              >
                <span className="flex flex-wrap justify-between gap-2 font-medium">
                  <span className="min-w-0 break-words">{r.purpose}</span>
                  <span className="tabular-nums">{money(Number(r.amount))}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {person(r.requester_id)} · {department(r.department_id)} · {r.status.replaceAll("_", " ")}
                </span>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Request detail</CardTitle>
          <CardDescription>Draft, screening, Finance decision and the full event trail.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {message && (
            <p role="status" className="text-sm">
              {message}
            </p>
          )}
          {!selected && (
            <p className="text-sm text-muted-foreground">
              Select a request to review its details and permitted actions.
            </p>
          )}
          {selected && (
            <>
              <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Requester</p>
                  <p className="font-medium">{person(selected.requester_id)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Route and status</p>
                  <p className="font-medium">
                    {department(selected.department_id)} · {selected.status.replaceAll("_", " ")}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Budget category</p>
                  <p>{selected.category}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Needed by</p>
                  <p>{selected.needed_by}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Requested</p>
                  <p className="font-semibold tabular-nums">{money(Number(selected.amount))}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Version</p>
                  <p>{selected.revision}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs text-muted-foreground">Purpose</p>
                  <p className="whitespace-pre-wrap break-words">{selected.purpose}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {owned && ["draft", "returned"].includes(selected.status) && (
                  <>
                    <Button variant="outline" onClick={() => startEdit(selected)}>
                      Edit draft
                    </Button>
                    <Button disabled={mutation.isPending} onClick={() => act("submit")}>
                      Submit request
                    </Button>
                  </>
                )}
                {owned && ["draft", "returned", "hod_review", "finance_review"].includes(selected.status) && (
                  <Button variant="outline" disabled={mutation.isPending} onClick={() => act("cancel")}>
                    Cancel request
                  </Button>
                )}
                {!owned && hod && selected.status === "hod_review" && (
                  <Button disabled={mutation.isPending} onClick={() => act("forward")}>
                    Forward to Finance
                  </Button>
                )}
                {!owned && financeHead && selected.status === "finance_review" && (
                  <Button disabled={mutation.isPending} onClick={() => act("approve")}>
                    Approve commitment
                  </Button>
                )}
              </div>
              {!owned &&
                ((hod && selected.status === "hod_review") ||
                  (financeHead && selected.status === "finance_review")) && (
                  <div className="flex flex-col gap-2 rounded-lg border p-4">
                    <Label htmlFor="request-decision-note">Decision note</Label>
                    <Input
                      id="request-decision-note"
                      value={decisionNote}
                      onChange={(event) => setDecisionNote(event.target.value)}
                      maxLength={500}
                      placeholder="Required when returning or rejecting"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        disabled={mutation.isPending || decisionNote.trim().length < 3}
                        onClick={() => act("return")}
                      >
                        Return for changes
                      </Button>
                      <Button
                        variant="destructive"
                        disabled={mutation.isPending || decisionNote.trim().length < 3}
                        onClick={() => act("reject")}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                )}
              <div>
                <h3 className="mb-2 font-medium">History</h3>
                <ol className="flex flex-col gap-2">
                  {history.data?.map((event) => (
                    <li key={event.id} className="rounded-md border p-3 text-sm">
                      <span className="font-medium">{event.event_type.replaceAll("_", " ")}</span>
                      <span className="ml-2 text-muted-foreground">
                        by {person(event.actor_id)} · {new Date(event.occurred_at).toLocaleString()}
                      </span>
                      {event.note && <p className="mt-1 whitespace-pre-wrap break-words">{event.note}</p>}
                    </li>
                  ))}
                </ol>
              </div>
              {selected.status === "approved" && (
                <p className="text-xs text-muted-foreground">
                  Approved {selected.approved_at ? new Date(selected.approved_at).toLocaleString() : ""}
                  {selected.approved_budget_revision
                    ? ` against budget revision ${selected.approved_budget_revision}`
                    : ""}
                  . This is a commitment; no bank or cash payment has been recorded.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
