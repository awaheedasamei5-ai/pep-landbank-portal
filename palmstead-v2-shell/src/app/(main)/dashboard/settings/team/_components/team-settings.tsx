"use client";

import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { requireSupabase } from "@/lib/supabase.client";

type Staff = {
  id: string;
  agent_key: string;
  name: string;
  email: string | null;
  role: string;
  active: boolean;
  department: string | null;
  position: string | null;
};
type WorkReview = {
  profile_id: string;
  professional_title: string | null;
  sales_role: string | null;
  department_name: string | null;
  head_of_department_requested: boolean;
  status: string;
  submitted_at: string;
};
type Invite = { email: string; name: string | null; created_at: string | null; expires_at?: string | null };

export function TeamSettings() {
  const [managerKey, setManagerKey] = useState("");
  const [staff, setStaff] = useState<Staff[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [workReviews, setWorkReviews] = useState<WorkReview[]>([]);
  const [reviewReason, setReviewReason] = useState("");
  const [reviewBusy, setReviewBusy] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const client = requireSupabase();
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user) throw new Error("Sign in to review the team roster.");
    const { data: manager, error: managerError } = await client
      .from("profiles")
      .select("agent_key,role,active")
      .eq("id", auth.user.id)
      .single();
    if (managerError || manager?.role !== "manager" || manager.active !== true) {
      throw new Error("Only active Management can manage staff accounts.");
    }
    const [people, pending, workPending] = await Promise.all([
      client.from("profiles").select("id,agent_key,name,email,role,active,department,position").order("name"),
      client.from("allowed_emails").select("email,name,created_at").order("created_at", { ascending: false }),
      client.from("staff_work_profiles")
        .select("profile_id,professional_title,sales_role,department_name,head_of_department_requested,status,submitted_at")
        .eq("status", "pending")
        .order("submitted_at"),
    ]);
    if (people.error || pending.error || workPending.error) throw new Error("The team roster could not be loaded.");
    setManagerKey(manager.agent_key);
    setStaff((people.data ?? []) as Staff[]);
    setInvites((pending.data ?? []) as Invite[]);
    setWorkReviews((workPending.data ?? []) as WorkReview[]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void load()
      .catch((error) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "The team roster could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function invite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !managerKey) return;
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();
    if (!cleanEmail || !cleanName || staff.some((person) => person.email?.toLowerCase() === cleanEmail)) {
      setMessage("Enter a name and a new staff email that is not already in use.");
      return;
    }
    setBusy(true);
    const { error } = await requireSupabase().from("allowed_emails").insert({
      email: cleanEmail,
      name: cleanName,
      invited_by: managerKey,
    });
    if (error) setMessage("Invitation could not be saved. Check whether it is already pending.");
    else {
      setName("");
      setEmail("");
      setMessage("Staff invitation saved. The invited person can create an account using this email.");
      await load();
    }
    setBusy(false);
  }

  async function removeInvite(value: string) {
    if (busy) return;
    setBusy(true);
    const { error } = await requireSupabase().from("allowed_emails").delete().eq("email", value);
    setMessage(error ? "Invitation could not be removed." : "Invitation removed.");
    if (!error) await load();
    setBusy(false);
  }

  async function reviewWork(profileId: string, approve: boolean) {
    if (reviewBusy || reviewReason.trim().length < 3) {
      setMessage("Enter a review reason of at least three characters.");
      return;
    }
    setReviewBusy(profileId);
    const { error } = await requireSupabase().rpc("review_staff_work_profile", {
      p_profile_id: profileId,
      p_approve: approve,
      p_note: reviewReason.trim(),
    });
    if (error) setMessage("The work-role decision could not be saved.");
    else {
      setReviewReason("");
      setMessage(approve ? "Work roles confirmed." : "Work roles returned to staff.");
      await load();
    }
    setReviewBusy("");
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl tracking-tight">Team roster</h1>
        <p className="text-muted-foreground text-sm">
          Invite staff and review the roster. Each person maintains their biodata in My settings.
        </p>
      </div>
      {loading && (
        <p role="status" className="text-muted-foreground text-sm">
          Loading team…
        </p>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      {!!managerKey && (
        <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
          <div className="flex min-w-0 flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Staff</CardTitle>
                <CardDescription>{staff.length} accounts in the system</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {staff.map((person) => (
                  <div
                    key={person.id}
                    className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md border p-3"
                  >
                    <span className="min-w-0">
                      <strong className="block break-words text-sm">{person.name}</strong>
                      <span className="block break-all text-muted-foreground text-xs">
                        {person.email ?? "No email"}
                      </span>
                    </span>
                    <span className="flex flex-wrap gap-1">
                      <Badge variant="secondary">{person.role}</Badge>
                      <Badge variant={person.active ? "secondary" : "outline"}>
                        {person.active ? "Active" : "Inactive"}
                      </Badge>
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Work roles awaiting review</CardTitle>
                <CardDescription>
                  Confirm reported job and department details. Department-head Finance approval rights are assigned
                  separately in Accounting.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {workReviews.length ? workReviews.map((item) => (
                  <div key={item.profile_id} className="space-y-2 rounded-md border p-3 text-sm">
                    <strong className="block break-words">
                      {staff.find((person) => person.id === item.profile_id)?.name ?? "Staff member"}
                    </strong>
                    <p className="break-words text-muted-foreground">
                      {[item.professional_title, item.sales_role && `Sales: ${item.sales_role}`,
                        item.department_name, item.head_of_department_requested && "Head of department requested"]
                        .filter(Boolean).join(" · ") || "No roles entered"}
                    </p>
                    <FieldLabel htmlFor={`review-reason-${item.profile_id}`}>Decision reason</FieldLabel>
                    <Input id={`review-reason-${item.profile_id}`} value={reviewReason} maxLength={500}
                      onChange={(event) => setReviewReason(event.target.value)} />
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" disabled={!!reviewBusy} onClick={() => void reviewWork(item.profile_id, true)}>
                        Confirm
                      </Button>
                      <Button size="sm" variant="outline" disabled={!!reviewBusy}
                        onClick={() => void reviewWork(item.profile_id, false)}>Return</Button>
                    </div>
                  </div>
                )) : <p className="text-muted-foreground text-sm">No work roles awaiting review.</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Invite staff</CardTitle>
                <CardDescription>Only invited emails can create a Palmstead account.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={invite} className="flex flex-col gap-4">
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="invite-staff-name">Full name</FieldLabel>
                      <Input
                        id="invite-staff-name"
                        value={name}
                        maxLength={120}
                        onChange={(event) => setName(event.target.value)}
                        required
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="invite-staff-email">Work email</FieldLabel>
                      <Input
                        id="invite-staff-email"
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        required
                      />
                    </Field>
                  </FieldGroup>
                  <Button type="submit" disabled={busy}>
                    {busy ? "Saving…" : "Save invitation"}
                  </Button>
                </form>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Pending invitations</CardTitle>
                <CardDescription>Remove invitations that should no longer be used.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {invites.length ? (
                  invites.map((item) => (
                    <div
                      key={item.email}
                      className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b py-2"
                    >
                      <span className="min-w-0">
                        <strong className="block break-words text-sm">{item.name ?? "Staff invitation"}</strong>
                        <span className="block break-all text-muted-foreground text-xs">{item.email}</span>
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void removeInvite(item.email)}
                      >
                        Remove
                      </Button>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground text-sm">No pending invitations.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
