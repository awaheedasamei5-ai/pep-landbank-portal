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
  phone: string | null;
};
type Invite = { email: string; name: string | null; created_at: string | null; expires_at?: string | null };

export function TeamSettings() {
  const [managerKey, setManagerKey] = useState("");
  const [staff, setStaff] = useState<Staff[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [selected, setSelected] = useState("");
  const [department, setDepartment] = useState("");
  const [position, setPosition] = useState("");
  const [phone, setPhone] = useState("");
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
    const [people, pending] = await Promise.all([
      client.from("profiles").select("id,agent_key,name,email,role,active,department,position,phone").order("name"),
      client.from("allowed_emails").select("email,name,created_at").order("created_at", { ascending: false }),
    ]);
    if (people.error || pending.error) throw new Error("The team roster could not be loaded.");
    setManagerKey(manager.agent_key);
    setStaff((people.data ?? []) as Staff[]);
    setInvites((pending.data ?? []) as Invite[]);
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

  function selectPerson(person: Staff) {
    setSelected(person.id);
    setDepartment(person.department ?? "");
    setPosition(person.position ?? "");
    setPhone(person.phone ?? "");
    setMessage("");
  }

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

  async function savePerson(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || busy) return;
    const enteredPhone = phone.replace(/[\s()-]/g, "");
    const cleanPhone = /^0\d{9}$/.test(enteredPhone)
      ? `+233${enteredPhone.slice(1)}`
      : enteredPhone;
    if (cleanPhone && !/^\+233\d{9}$/.test(cleanPhone)) {
      setMessage("Enter a Ghana number starting with 0 or +233, or leave the phone empty.");
      return;
    }
    setBusy(true);
    const { error } = await requireSupabase()
      .from("profiles")
      .update({
        department: department.trim().slice(0, 100) || null,
        position: position.trim().slice(0, 100) || null,
        phone: cleanPhone || null,
      })
      .eq("id", selected);
    setMessage(
      error
        ? "Staff changes could not be saved."
        : "Staff details saved. A contact phone is separate from a verified sign-in phone.",
    );
    if (!error) await load();
    setBusy(false);
  }

  const current = staff.find((person) => person.id === selected);
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl tracking-tight">Team roster</h1>
        <p className="text-muted-foreground text-sm">
          Invite staff, review the team and maintain work contact details.
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
                  <button
                    key={person.id}
                    type="button"
                    onClick={() => selectPerson(person)}
                    className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
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
                  </button>
                ))}
              </CardContent>
            </Card>
            {current && (
              <Card>
                <CardHeader>
                  <CardTitle>{current.name}</CardTitle>
                  <CardDescription>Management-maintained employment and SMS contact fields.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={savePerson} className="flex flex-col gap-4">
                    <FieldGroup>
                      <Field>
                        <FieldLabel htmlFor="staff-department">Department</FieldLabel>
                        <Input
                          id="staff-department"
                          value={department}
                          maxLength={100}
                          onChange={(event) => setDepartment(event.target.value)}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="staff-position">Position</FieldLabel>
                        <Input
                          id="staff-position"
                          value={position}
                          maxLength={100}
                          onChange={(event) => setPosition(event.target.value)}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="staff-contact-phone">Contact phone</FieldLabel>
                        <Input
                          id="staff-contact-phone"
                          type="tel"
                          autoComplete="tel"
                          placeholder="0XXXXXXXXX or +233XXXXXXXXX"
                          value={phone}
                          onChange={(event) => setPhone(event.target.value)}
                        />
                      </Field>
                    </FieldGroup>
                    <Button type="submit" disabled={busy}>
                      {busy ? "Saving…" : "Save staff details"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-4">
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
