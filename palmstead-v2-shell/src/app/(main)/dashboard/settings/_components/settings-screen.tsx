"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { requireSupabase } from "@/lib/supabase.client";

import { PhoneSettings } from "./phone-settings";

type StaffSettingsProfile = {
  id: string;
  name: string;
  email: string | null;
  role: string;
  department: string | null;
  position: string | null;
  phone: string | null;
  address: string | null;
  active: boolean;
};

export function SettingsScreen() {
  const [profile, setProfile] = useState<StaffSettingsProfile | null>(null);
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const client = requireSupabase();
        const { data: auth, error: authError } = await client.auth.getUser();
        if (authError || !auth.user) throw new Error("Sign in again to load your settings.");
        const { data, error } = await client
          .from("profiles")
          .select("id,name,email,role,department,position,phone,address,active")
          .eq("id", auth.user.id)
          .single();
        if (error || !data) throw new Error("Your staff profile could not be loaded.");
        if (!cancelled) {
          setProfile(data as StaffSettingsProfile);
          setAddress(data.address ?? "");
        }
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Settings could not be loaded.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || saving) return;
    setSaving(true);
    setMessage("");
    const value = address.trim().slice(0, 300);
    const { error } = await requireSupabase()
      .from("profiles")
      .update({ address: value || null })
      .eq("id", profile.id);
    if (error) setMessage("Could not save your address. Please try again.");
    else {
      setProfile({ ...profile, address: value || null });
      setAddress(value);
      setMessage("Your address was saved.");
    }
    setSaving(false);
  }

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (passwordBusy) return;
    if (newPassword.length < 12 || newPassword === currentPassword) {
      setPasswordMessage("Choose a different password with at least 12 characters.");
      return;
    }
    setPasswordBusy(true);
    setPasswordMessage("");
    const { error } = await requireSupabase().auth.updateUser({
      password: newPassword,
      current_password: currentPassword,
    });
    setPasswordMessage(
      error ? "Password could not be changed. Check your current password and try again." : "Password updated.",
    );
    setCurrentPassword("");
    setNewPassword("");
    setPasswordBusy(false);
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl tracking-tight">My settings</h1>
        <p className="text-muted-foreground text-sm">Your staff identity, contact details and account security.</p>
      </div>
      {profile?.role === "manager" && process.env.NEXT_PUBLIC_ACCESS_SETTINGS_ENABLED === "true" && (
        <Card>
          <CardHeader>
            <CardTitle>Management access</CardTitle>
            <CardDescription>Review and change staff feature permissions with an audit trail.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/dashboard/settings/access">Open access settings</Link>
            </Button>
          </CardContent>
        </Card>
      )}
      {profile?.role === "manager" && (
        <Card>
          <CardHeader>
            <CardTitle>Team roster</CardTitle>
            <CardDescription>Invite staff and keep their company records current.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/dashboard/settings/team">Manage team</Link>
            </Button>
          </CardContent>
        </Card>
      )}
      {loading ? (
        <p role="status" className="text-muted-foreground text-sm">
          Loading your profile…
        </p>
      ) : null}
      {profile && (
        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Staff profile</CardTitle>
              <CardDescription>Employment details are maintained by Management.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="min-w-0 break-words font-medium">{profile.name}</span>
                <Badge variant="secondary">{profile.active ? "Active" : "Inactive"}</Badge>
              </div>
              <dl className="grid min-w-0 gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Email</dt>
                  <dd className="break-all">{profile.email ?? "Not set"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Role</dt>
                  <dd className="capitalize">{profile.role}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Department</dt>
                  <dd>{profile.department ?? "Not assigned"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Position</dt>
                  <dd>{profile.position ?? "Not assigned"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Contact phone</dt>
                  <dd>{profile.phone ?? "Not set"}</dd>
                </div>
              </dl>
              <p className="text-muted-foreground text-xs">
                A contact number is not automatically a verified sign-in number. Management can correct staff contact
                records.
              </p>
              <form onSubmit={saveProfile} className="flex flex-col gap-3">
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="staff-address">Address</FieldLabel>
                    <Input
                      id="staff-address"
                      value={address}
                      maxLength={300}
                      autoComplete="street-address"
                      onChange={(event) => setAddress(event.target.value)}
                    />
                  </Field>
                </FieldGroup>
                <Button type="submit" disabled={saving || address.trim() === (profile.address ?? "")}>
                  {saving ? "Saving…" : "Save address"}
                </Button>
                {message && (
                  <p role="status" className="text-sm">
                    {message}
                  </p>
                )}
              </form>
            </CardContent>
          </Card>
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Account security</CardTitle>
              <CardDescription>Change your password while signed in. Use a unique password.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={changePassword} className="flex flex-col gap-4">
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="current-password">Current password</FieldLabel>
                    <Input
                      id="current-password"
                      type="password"
                      autoComplete="current-password"
                      required
                      value={currentPassword}
                      onChange={(event) => setCurrentPassword(event.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="settings-new-password">New password</FieldLabel>
                    <Input
                      id="settings-new-password"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={12}
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                    />
                  </Field>
                </FieldGroup>
                <Button type="submit" disabled={passwordBusy}>
                  {passwordBusy ? "Updating…" : "Change password"}
                </Button>
                {passwordMessage && (
                  <p role="status" className="text-sm">
                    {passwordMessage}
                  </p>
                )}
              </form>
            </CardContent>
          </Card>
          {process.env.NEXT_PUBLIC_PHONE_OTP_ENABLED === "true" && <PhoneSettings />}
        </div>
      )}
      {!loading && !profile && (
        <p role="alert" className="text-destructive text-sm">
          {message || "No staff profile found."}
        </p>
      )}
    </div>
  );
}
