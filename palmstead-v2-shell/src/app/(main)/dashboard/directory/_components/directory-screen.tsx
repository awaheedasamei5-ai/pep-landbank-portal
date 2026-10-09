"use client";

import { useMemo, useState } from "react";
import { Mail, Phone, Plus, Search, Trash2, User } from "lucide-react";

import { Avatar, AvatarBadge, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { SubmitButton } from "@/components/submit-button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuthStore } from "@/stores/auth/auth-store";
import {
  useCreateContact,
  useDeleteContact,
  useDirectory,
  useMyContacts,
  type DirectoryStaff,
} from "./use-directory";

// Staff Directory (OSS build order item 2, B.1): two tabs, Staff (every
// active profile, read-only, real presence) and My Contacts (a private
// per-staff external rolodex -- own-row RLS, genuinely separate from the
// Client Database). See docs/plans/02-general-staff-portal-plan.md.
function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function StaffCard({ staff }: { staff: DirectoryStaff }) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 pt-6">
        <Avatar className="size-12">
          {staff.avatar && <AvatarImage src={staff.avatar} alt={staff.name} />}
          <AvatarFallback>{initials(staff.name)}</AvatarFallback>
          {staff.isOnline && <AvatarBadge className="bg-emerald-500" />}
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium text-sm">{staff.name}</p>
            {staff.role === "manager" && (
              <Badge variant="outline" className="shrink-0">
                Management
              </Badge>
            )}
          </div>
          <p className="truncate text-muted-foreground text-xs">{staff.position || "No title set"}</p>
          {staff.department && <p className="truncate text-muted-foreground text-xs">{staff.department}</p>}
          <div className="mt-2 flex flex-col gap-1">
            {staff.email && (
              <a href={`mailto:${staff.email}`} className="flex items-center gap-1.5 text-xs hover:underline">
                <Mail className="size-3" />
                <span className="truncate">{staff.email}</span>
              </a>
            )}
            {staff.phone && (
              <a href={`tel:${staff.phone}`} className="flex items-center gap-1.5 text-xs hover:underline">
                <Phone className="size-3" />
                {staff.phone}
              </a>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StaffTab() {
  const { data, isLoading } = useDirectory();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const all = data ?? [];
    if (!search.trim()) return all;
    const q = search.trim().toLowerCase();
    return all.filter((s) => `${s.name} ${s.position ?? ""} ${s.department ?? ""}`.toLowerCase().includes(q));
  }, [data, search]);

  return (
    <div className="grid gap-4">
      <div className="relative max-w-sm">
        <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
        <Input placeholder="Search by name, title, department..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {isLoading &&
          Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="flex items-center gap-3 pt-6">
                <Skeleton className="size-12 rounded-full" />
                <div className="grid flex-1 gap-1.5">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </CardContent>
            </Card>
          ))}
        {!isLoading && filtered.length === 0 && (
          <p className="text-muted-foreground text-sm sm:col-span-2 xl:col-span-3">No staff match that search.</p>
        )}
        {filtered.map((staff) => (
          <StaffCard key={staff.agentKey} staff={staff} />
        ))}
      </div>
    </div>
  );
}

function MyContactsTab() {
  const agentKey = useAuthStore((s) => s.profile?.key);
  const { data, isLoading } = useMyContacts(agentKey);
  const createContact = useCreateContact(agentKey);
  const deleteContact = useDeleteContact(agentKey);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", company: "", email: "", phone: "", jobTitle: "", notes: "" });

  async function submit() {
    if (!form.name.trim()) return;
    await createContact.mutateAsync({
      name: form.name.trim(),
      company: form.company || null,
      email: form.email || null,
      phone: form.phone || null,
      jobTitle: form.jobTitle || null,
      notes: form.notes || null,
    });
    setForm({ name: "", company: "", email: "", phone: "", jobTitle: "", notes: "" });
    setShowForm(false);
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          Your own private rolodex of suppliers, partners, or prospects -- not shared, not the Client Database.
        </p>
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          <Plus />
          Add contact
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="grid gap-3 pt-6 sm:grid-cols-2">
            <Input placeholder="Name *" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <Input placeholder="Company" value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} />
            <Input placeholder="Job title" value={form.jobTitle} onChange={(e) => setForm((f) => ({ ...f, jobTitle: e.target.value }))} />
            <Input placeholder="Phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            <Input
              placeholder="Email"
              className="sm:col-span-2"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
            <Textarea
              placeholder="Notes"
              className="sm:col-span-2"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
            <div className="sm:col-span-2">
              <SubmitButton type="button" loading={createContact.isPending} onClick={submit}>
                Save contact
              </SubmitButton>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {isLoading &&
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="mt-2 h-3 w-32" />
              </CardContent>
            </Card>
          ))}
        {!isLoading && (data?.length ?? 0) === 0 && (
          <p className="text-muted-foreground text-sm sm:col-span-2 xl:col-span-3">
            No contacts yet -- add a supplier, partner, or prospect you deal with outside Palmstead's own clients.
          </p>
        )}
        {data?.map((contact) => (
          <Card key={contact.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <User className="size-4 text-muted-foreground" />
                  <CardTitle className="text-sm">{contact.name}</CardTitle>
                </div>
                <ConfirmDialog
                  trigger={
                    <Button type="button" variant="ghost" size="icon-sm">
                      <Trash2 className="size-4" />
                    </Button>
                  }
                  title={`Delete "${contact.name}"?`}
                  description="This only removes your own private contact entry."
                  confirmLabel="Delete"
                  onConfirm={() => deleteContact.mutateAsync(contact.id)}
                />
              </div>
              {(contact.jobTitle || contact.company) && (
                <CardDescription>{[contact.jobTitle, contact.company].filter(Boolean).join(" @ ")}</CardDescription>
              )}
            </CardHeader>
            <CardContent className="grid gap-1 text-xs">
              {contact.email && <p>{contact.email}</p>}
              {contact.phone && <p>{contact.phone}</p>}
              {contact.notes && <p className="text-muted-foreground">{contact.notes}</p>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function DirectoryScreen() {
  const [tab, setTab] = useState<"staff" | "contacts">("staff");

  return (
    <div>
      <PageHeader
        title="Directory"
        description="Who's who at Palmstead, and your own private contacts."
        action={
          <Tabs value={tab} onValueChange={(v) => setTab(v as "staff" | "contacts")}>
            <TabsList>
              <TabsTrigger value="staff">Staff</TabsTrigger>
              <TabsTrigger value="contacts">My Contacts</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />
      {tab === "staff" ? <StaffTab /> : <MyContactsTab />}
    </div>
  );
}
