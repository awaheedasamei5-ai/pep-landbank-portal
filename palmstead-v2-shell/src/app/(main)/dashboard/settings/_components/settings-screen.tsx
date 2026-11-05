"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireSupabase } from "@/lib/supabase.client";

import { MyAccess } from "./my-access";
import { PhoneSettings } from "./phone-settings";

type StaffSettingsProfile = {
  id: string;
  name: string;
  email: string | null;
  role: string;
  department: string | null;
  position: string | null;
  phone: string | null;
  whatsapp: string | null;
  desk_extension: string | null;
  birthday: string | null;
  address: string | null;
  active: boolean;
};

type WorkProfile = {
  professional_title: string | null;
  sales_role: string | null;
  department_name: string | null;
  head_of_department_requested: boolean;
  status: string;
  review_note: string | null;
};

export function SettingsScreen() {
  const [profile, setProfile] = useState<StaffSettingsProfile | null>(null);
  const [work, setWork] = useState<WorkProfile | null>(null);
  const [professionalTitle, setProfessionalTitle] = useState("");
  const [salesRole, setSalesRole] = useState("");
  const [departmentName, setDepartmentName] = useState("");
  const [headRequested, setHeadRequested] = useState(false);
  const [workBusy, setWorkBusy] = useState(false);
  const [workMessage, setWorkMessage] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [deskExtension, setDeskExtension] = useState("");
  const [birthday, setBirthday] = useState("");
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
          .select("id,name,email,role,department,position,phone,whatsapp,desk_extension,birthday,address,active")
          .eq("id", auth.user.id)
          .single();
        if (error || !data) throw new Error("Your staff profile could not be loaded.");
        const { data: workData, error: workError } = await client
          .from("staff_work_profiles")
          .select("professional_title,sales_role,department_name,head_of_department_requested,status,review_note")
          .eq("profile_id", auth.user.id)
          .maybeSingle();
        if (workError) throw new Error("Your work roles could not be loaded.");
        if (!cancelled) {
          setProfile(data as StaffSettingsProfile);
          setWork((workData ?? null) as WorkProfile | null);
          setProfessionalTitle(workData?.professional_title ?? "");
          setSalesRole(workData?.sales_role ?? "");
          setDepartmentName(workData?.department_name ?? "");
          setHeadRequested(workData?.head_of_department_requested ?? false);
          setAddress(data.address ?? "");
          setPhone(data.phone ?? "");
          setWhatsapp(data.whatsapp ?? "");
          setDeskExtension(data.desk_extension ?? "");
          setBirthday(data.birthday ?? "");
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
    const normalize = (value: string) => {
      const compact = value.replace(/[\s()-]/g, "");
      return /^0\d{9}$/.test(compact) ? `+233${compact.slice(1)}` : compact;
    };
    const contact = normalize(phone);
    const whatsappContact = normalize(whatsapp);
    if ((contact && !/^\+233\d{9}$/.test(contact)) || (whatsappContact && !/^\+233\d{9}$/.test(whatsappContact))) {
      setMessage("Enter Ghana contact numbers starting with 0 or +233.");
      return;
    }
    setSaving(true);
    setMessage("");
    const updates = {
      address: address.trim().slice(0, 300) || null,
      phone: contact || null,
      whatsapp: whatsappContact || null,
      desk_extension: deskExtension.trim().slice(0, 12) || null,
      birthday: birthday || null,
    };
    const { error } = await requireSupabase().from("profiles").update(updates).eq("id", profile.id);
    if (error) setMessage("Your details could not be saved. Please try again.");
    else {
      setProfile({ ...profile, ...updates });
      setAddress(updates.address ?? "");
      setPhone(contact);
      setWhatsapp(whatsappContact);
      setMessage("Your personal and contact details were saved.");
    }
    setSaving(false);
  }

  async function submitWork(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || workBusy) return;
    setWorkBusy(true);
    setWorkMessage("");
    const { error } = await requireSupabase().rpc("submit_staff_work_profile", {
      p_professional_title: professionalTitle.trim(),
      p_sales_role: salesRole.trim(),
      p_department_name: departmentName.trim(),
      p_head_of_department_requested: headRequested,
    });
    if (error) setWorkMessage("Your work roles could not be submitted. Check the fields and try again.");
    else {
      setWork({
        professional_title: professionalTitle.trim() || null,
        sales_role: salesRole.trim() || null,
        department_name: departmentName.trim() || null,
        head_of_department_requested: headRequested,
        status: "pending",
        review_note: null,
      });
      setWorkMessage("Work roles submitted for Management review.");
    }
    setWorkBusy(false);
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
        <p className="text-muted-foreground text-sm">Manage your details, work role, access and sign-in security.</p>
      </div>
      {loading ? (
        <p role="status" className="text-muted-foreground text-sm">
          Loading your profile…
        </p>
      ) : null}
      {profile && (
        <Tabs defaultValue="profile" className="min-w-0 gap-5">
          <TabsList
            className="h-auto w-full flex-wrap justify-start gap-1 bg-muted/60 p-1 sm:w-fit"
            aria-label="Settings sections"
          >
            <TabsTrigger value="profile" className="min-h-9 flex-none px-3">
              Profile
            </TabsTrigger>
            <TabsTrigger value="work" className="min-h-9 flex-none px-3">
              Work
            </TabsTrigger>
            <TabsTrigger value="security" className="min-h-9 flex-none px-3">
              Security
            </TabsTrigger>
            <TabsTrigger value="access" className="min-h-9 flex-none px-3">
              Access
            </TabsTrigger>
            {profile.role === "manager" && (
              <TabsTrigger value="team" className="min-h-9 flex-none px-3">
                Team
              </TabsTrigger>
            )}
          </TabsList>
          <TabsContent value="profile" className="min-w-0">
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle>Staff profile</CardTitle>
                <CardDescription>
                  Maintain your own contact and personal details. Your work assignment appears below.
                </CardDescription>
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
                </dl>
                <p className="text-muted-foreground text-xs">
                  Your contact number is used for work reminders. It is not automatically a verified sign-in number.
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
                    <Field>
                      <FieldLabel htmlFor="staff-contact-phone">Mobile for work reminders</FieldLabel>
                      <Input
                        id="staff-contact-phone"
                        type="tel"
                        autoComplete="tel"
                        placeholder="0XXXXXXXXX or +233XXXXXXXXX"
                        value={phone}
                        onChange={(event) => setPhone(event.target.value)}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="staff-whatsapp">WhatsApp</FieldLabel>
                      <Input
                        id="staff-whatsapp"
                        type="tel"
                        autoComplete="tel"
                        placeholder="0XXXXXXXXX or +233XXXXXXXXX"
                        value={whatsapp}
                        onChange={(event) => setWhatsapp(event.target.value)}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="staff-extension">Desk extension</FieldLabel>
                      <Input
                        id="staff-extension"
                        maxLength={12}
                        value={deskExtension}
                        onChange={(event) => setDeskExtension(event.target.value)}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="staff-birthday">Birthday</FieldLabel>
                      <Input
                        id="staff-birthday"
                        type="date"
                        value={birthday}
                        onChange={(event) => setBirthday(event.target.value)}
                      />
                    </Field>
                  </FieldGroup>
                  <Button type="submit" disabled={saving}>
                    {saving ? "Saving…" : "Save my details"}
                  </Button>
                  {message && (
                    <p role="status" className="text-sm">
                      {message}
                    </p>
                  )}
                </form>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="work" className="min-w-0">
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle>My work roles</CardTitle>
                <CardDescription>
                  Record both your professional job and any sales responsibility. Management confirms assignments before
                  they affect company records. A department-head request does not grant approval rights.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={submitWork} className="flex flex-col gap-4">
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="professional-title">Professional role</FieldLabel>
                      <Input
                        id="professional-title"
                        maxLength={100}
                        placeholder="e.g. Digital Operations Officer"
                        value={professionalTitle}
                        onChange={(event) => setProfessionalTitle(event.target.value)}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="sales-role">Sales role, if applicable</FieldLabel>
                      <Input
                        id="sales-role"
                        maxLength={100}
                        placeholder="e.g. Sales representative"
                        value={salesRole}
                        onChange={(event) => setSalesRole(event.target.value)}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="work-department">Department</FieldLabel>
                      <Input
                        id="work-department"
                        maxLength={100}
                        placeholder="e.g. Sales"
                        value={departmentName}
                        onChange={(event) => setDepartmentName(event.target.value)}
                      />
                    </Field>
                    <label className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={headRequested}
                        onChange={(event) => setHeadRequested(event.target.checked)}
                      />
                      <span>I am a head of this department</span>
                    </label>
                  </FieldGroup>
                  {work && (
                    <p className="text-muted-foreground text-sm">
                      Review: {work.status}
                      {work.review_note ? ` · ${work.review_note}` : ""}
                    </p>
                  )}
                  <Button type="submit" disabled={workBusy}>
                    {workBusy ? "Submitting…" : "Submit work roles"}
                  </Button>
                  {workMessage && (
                    <p role="status" className="text-sm">
                      {workMessage}
                    </p>
                  )}
                </form>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="security" className="flex min-w-0 flex-col gap-4">
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
                <p className="text-muted-foreground text-sm">
                  Forgot your password?{" "}
                  <Link className="text-primary underline-offset-4 hover:underline" href="/auth/v1/forgot-password">
                    Request a reset link
                  </Link>
                  .
                </p>
              </CardContent>
            </Card>
            {process.env.NEXT_PUBLIC_PHONE_OTP_ENABLED === "true" && <PhoneSettings />}
          </TabsContent>
          <TabsContent value="access" className="flex min-w-0 flex-col gap-4">
            <MyAccess />
            {profile.role === "manager" && (
              <Card>
                <CardHeader>
                  <CardTitle>Manage app access</CardTitle>
                  <CardDescription>
                    Review staff access to Operations and Notes. Other apps will appear as their data rules are
                    enforced.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild variant="outline">
                    <Link href="/dashboard/settings/access">Open access settings</Link>
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>
          {profile.role === "manager" && (
            <TabsContent value="team" className="min-w-0">
              <Card>
                <CardHeader>
                  <CardTitle>Team roster</CardTitle>
                  <CardDescription>Invite staff, review work roles and maintain company records.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild variant="outline">
                    <Link href="/dashboard/settings/team">Manage team</Link>
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      )}
      {!loading && !profile && (
        <p role="alert" className="text-destructive text-sm">
          {message || "No staff profile found."}
        </p>
      )}
    </div>
  );
}

