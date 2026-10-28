"use client";

import { useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireSupabase } from "@/lib/supabase.client";

type Department = { id: string; name: string; active: boolean };
type Staff = { id: string; name: string; active: boolean };
type Membership = { id: string; profile_id: string; department_id: string; ended_at: string | null };
type Assignment = {
  id: string;
  profile_id: string;
  department_id: string | null;
  finance_role: string;
  assigned_at: string;
  revoked_at: string | null;
};
type DirectRoute = { profile_id: string; reason: string; assigned_at: string };
type RouteEvent = {
  id: number;
  profile_id: string;
  actor_id: string;
  action: string;
  reason: string;
  occurred_at: string;
};

const roles = [
  ["finance_head", "Head of Finance"],
  ["finance_operator", "Finance operator"],
  ["department_head", "Head of Department"],
  ["budget_owner", "Budget owner"],
  ["payroll_admin", "Payroll administrator"],
  ["auditor", "Auditor"],
] as const;

function useFinanceStructure() {
  return useQuery({
    queryKey: ["finance-structure"],
    queryFn: async () => {
      const sb = requireSupabase();
      const [departments, staff, memberships, assignments, directRoutes, routeEvents] = await Promise.all([
        sb.from("finance_departments").select("id,name,active").order("name"),
        sb.from("profiles").select("id,name,active").eq("active", true).order("name"),
        sb.from("finance_staff_departments").select("id,profile_id,department_id,ended_at").is("ended_at", null),
        sb
          .from("finance_role_assignments")
          .select("id,profile_id,department_id,finance_role,assigned_at,revoked_at")
          .is("revoked_at", null)
          .order("assigned_at"),
        sb.from("finance_direct_routes").select("profile_id,reason,assigned_at").order("assigned_at"),
        sb
          .from("finance_direct_route_events")
          .select("id,profile_id,actor_id,action,reason,occurred_at")
          .order("occurred_at", { ascending: false })
          .limit(20),
      ]);
      for (const result of [departments, staff, memberships, assignments, directRoutes, routeEvents])
        if (result.error) throw result.error;
      return {
        departments: (departments.data ?? []) as Department[],
        staff: (staff.data ?? []) as Staff[],
        memberships: (memberships.data ?? []) as Membership[],
        assignments: (assignments.data ?? []) as Assignment[],
        directRoutes: (directRoutes.data ?? []) as DirectRoute[],
        routeEvents: (routeEvents.data ?? []) as RouteEvent[],
      };
    },
  });
}

function Selector({
  id,
  value,
  onChange,
  children,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 min-w-0 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
    >
      {children}
    </select>
  );
}

export function FinanceStructurePanel() {
  const query = useFinanceStructure();
  const qc = useQueryClient();
  const [departmentName, setDepartmentName] = useState("");
  const [staffId, setStaffId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [roleStaffId, setRoleStaffId] = useState("");
  const [role, setRole] = useState<(typeof roles)[number][0]>("finance_head");
  const [roleDepartmentId, setRoleDepartmentId] = useState("");
  const [reason, setReason] = useState("");
  const [revokeId, setRevokeId] = useState("");
  const [revokeReason, setRevokeReason] = useState("");
  const [directStaffId, setDirectStaffId] = useState("");
  const [directReason, setDirectReason] = useState("");
  const [message, setMessage] = useState("");
  const mutation = useMutation({
    mutationFn: async (action: {
      kind: "department" | "membership" | "role" | "revoke" | "direct" | "direct_revoke";
      profileId?: string;
    }) => {
      const sb = requireSupabase();
      if (action.kind === "direct" || action.kind === "direct_revoke") {
        const { error } = await sb.rpc("finance_set_direct_route", {
          p_profile_id: action.profileId ?? directStaffId,
          p_enabled: action.kind === "direct",
          p_reason: directReason.trim() || "Management revoked direct route",
        });
        if (error) throw error;
        return action.kind;
      }
      const args =
        action.kind === "department"
          ? { functionName: "finance_create_department", parameters: { p_name: departmentName.trim() } }
          : action.kind === "membership"
            ? {
                functionName: "finance_assign_staff_department",
                parameters: { p_profile_id: staffId, p_department_id: departmentId, p_reason: reason.trim() },
              }
            : action.kind === "role"
              ? {
                  functionName: "finance_assign_role",
                  parameters: {
                    p_profile_id: roleStaffId,
                    p_role: role,
                    p_department_id: role === "department_head" || role === "budget_owner" ? roleDepartmentId : null,
                    p_reason: reason.trim(),
                  },
                }
              : {
                  functionName: "finance_revoke_role",
                  parameters: { p_assignment_id: revokeId, p_reason: revokeReason.trim() },
                };
      const { error } = await sb.rpc(args.functionName, args.parameters);
      if (error) throw error;
      return action.kind;
    },
    onSuccess: async (kind) => {
      await qc.invalidateQueries({ queryKey: ["finance-structure"] });
      setMessage(
        kind === "department"
          ? "Department created."
          : kind === "revoke"
            ? "Role revoked."
            : kind === "direct"
              ? "Direct Finance route assigned."
              : kind === "direct_revoke"
                ? "Direct route removed."
                : "Assignment saved.",
      );
      if (kind === "direct" || kind === "direct_revoke") {
        setDirectReason("");
        return;
      }
      if (kind === "department") setDepartmentName("");
      if (kind === "revoke") {
        setRevokeId("");
        setRevokeReason("");
      } else setReason("");
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "The change could not be saved."),
  });

  const data = query.data;
  const activeDepartments = data?.departments.filter((department) => department.active) ?? [];
  const staffName = (id: string) => data?.staff.find((person) => person.id === id)?.name ?? "Former staff member";
  const departmentLabel = (id: string | null) =>
    id ? (data?.departments.find((department) => department.id === id)?.name ?? "Unknown department") : "Company-wide";
  const scoped = role === "department_head" || role === "budget_owner";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Departments and finance roles</CardTitle>
        <CardDescription>
          Set the people and scopes that future budget and payment approvals will use. Adding a role here does not
          release funds or authorize a payment.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {query.isLoading && <p className="text-sm text-muted-foreground">Loading finance structure…</p>}
        {query.isError && (
          <p role="alert" className="text-sm text-destructive">
            Could not load finance structure. {query.error.message}
          </p>
        )}
        {message && (
          <p role="status" className="text-sm">
            {message}
          </p>
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3 rounded-lg border p-4">
            <h3 className="font-medium">Departments</h3>
            <p className="text-xs text-muted-foreground">
              Create actual company departments before assigning staff. Profile text is not treated as an approval
              route.
            </p>
            <Label htmlFor="finance-department-name">Department name</Label>
            <div className="flex flex-wrap gap-2">
              <Input
                id="finance-department-name"
                value={departmentName}
                onChange={(event) => setDepartmentName(event.target.value)}
                className="min-w-40 flex-1"
                maxLength={100}
                placeholder="e.g. Sales"
              />
              <Button
                disabled={mutation.isPending || departmentName.trim().length < 2}
                onClick={() => mutation.mutate({ kind: "department" })}
              >
                Add department
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              {activeDepartments.length
                ? activeDepartments.map((department) => department.name).join(" · ")
                : "No departments configured yet."}
            </p>
          </div>
          <div className="space-y-3 rounded-lg border p-4">
            <h3 className="font-medium">Staff department</h3>
            <Label htmlFor="finance-member-staff">Staff member</Label>
            <Selector id="finance-member-staff" value={staffId} onChange={setStaffId}>
              <option value="">Choose staff</option>
              {data?.staff.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </Selector>
            <Label htmlFor="finance-member-department">Department</Label>
            <Selector id="finance-member-department" value={departmentId} onChange={setDepartmentId}>
              <option value="">Choose department</option>
              {activeDepartments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </Selector>
            <Label htmlFor="finance-assignment-reason">Reason for assignment</Label>
            <Input
              id="finance-assignment-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
              placeholder="e.g. Initial department setup"
            />
            <Button
              disabled={mutation.isPending || !staffId || !departmentId || reason.trim().length < 3}
              onClick={() => mutation.mutate({ kind: "membership" })}
            >
              Assign department
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-3 rounded-lg border p-4">
          <h3 className="font-medium">Direct Finance route exceptions</h3>
          <p className="text-xs text-muted-foreground">
            Only Management can authorize a named staff member to bypass department screening. Staff cannot choose this
            route on a request.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="direct-route-staff">Staff member</Label>
              <Selector id="direct-route-staff" value={directStaffId} onChange={setDirectStaffId}>
                <option value="">Choose staff</option>
                {data?.staff.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </Selector>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="direct-route-reason">Reason</Label>
              <Input
                id="direct-route-reason"
                value={directReason}
                onChange={(event) => setDirectReason(event.target.value)}
                maxLength={500}
                placeholder="Why is the direct route required?"
              />
            </div>
          </div>
          <Button
            className="self-start"
            disabled={mutation.isPending || !directStaffId || directReason.trim().length < 3}
            onClick={() => mutation.mutate({ kind: "direct" })}
          >
            Allow direct route
          </Button>
          <ul className="flex flex-col gap-2 text-sm">
            {data?.directRoutes.map((route) => (
              <li key={route.profile_id} className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
                <span>
                  {staffName(route.profile_id)} · <span className="text-muted-foreground">{route.reason}</span>
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate({ kind: "direct_revoke", profileId: route.profile_id })}
                >
                  Remove route
                </Button>
              </li>
            ))}
            {!data?.directRoutes.length && <li className="text-muted-foreground">No direct-route exceptions.</li>}
          </ul>
          <details className="text-sm">
            <summary className="cursor-pointer font-medium">Recent route changes</summary>
            <ol className="mt-2 flex flex-col gap-2">
              {data?.routeEvents.map((event) => (
                <li key={event.id} className="border-t pt-2">
                  {staffName(event.profile_id)} · {event.action} by {staffName(event.actor_id)} ·{" "}
                  {new Date(event.occurred_at).toLocaleString()}
                  <span className="block text-muted-foreground">{event.reason}</span>
                </li>
              ))}
              {!data?.routeEvents.length && <li className="text-muted-foreground">No route changes recorded.</li>}
            </ol>
          </details>
        </div>
        <div className="space-y-3 rounded-lg border p-4">
          <h3 className="font-medium">Approval and finance roles</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="finance-role-staff">Staff member</Label>
              <Selector id="finance-role-staff" value={roleStaffId} onChange={setRoleStaffId}>
                <option value="">Choose staff</option>
                {data?.staff.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </Selector>
            </div>
            <div className="space-y-1">
              <Label htmlFor="finance-role">Finance role</Label>
              <Selector id="finance-role" value={role} onChange={(value) => setRole(value as typeof role)}>
                {roles.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Selector>
            </div>
            {scoped && (
              <div className="space-y-1">
                <Label htmlFor="finance-role-department">Department scope</Label>
                <Selector id="finance-role-department" value={roleDepartmentId} onChange={setRoleDepartmentId}>
                  <option value="">Choose department</option>
                  {activeDepartments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </Selector>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Department head and budget owner need a department. Other roles have company scope.
          </p>
          <Button
            disabled={mutation.isPending || !roleStaffId || reason.trim().length < 3 || (scoped && !roleDepartmentId)}
            onClick={() => mutation.mutate({ kind: "role" })}
          >
            Assign role
          </Button>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border p-4">
            <h3 className="font-medium">Current department roster</h3>
            <ul className="mt-3 space-y-2 text-sm">
              {data?.memberships.map((item) => (
                <li key={item.id} className="flex flex-wrap justify-between gap-1 border-b pb-2">
                  <span>{staffName(item.profile_id)}</span>
                  <span className="text-muted-foreground">{departmentLabel(item.department_id)}</span>
                </li>
              ))}
              {!data?.memberships.length && <li className="text-muted-foreground">No staff assigned yet.</li>}
            </ul>
          </div>
          <div className="rounded-lg border p-4">
            <h3 className="font-medium">Active finance roles</h3>
            <ul className="mt-3 space-y-2 text-sm">
              {data?.assignments.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                  <span>
                    {staffName(item.profile_id)} ·{" "}
                    {roles.find(([key]) => key === item.finance_role)?.[1] ?? item.finance_role}
                    <span className="block text-muted-foreground">{departmentLabel(item.department_id)}</span>
                  </span>
                  <Button variant="outline" size="sm" onClick={() => setRevokeId(item.id)}>
                    Revoke
                  </Button>
                </li>
              ))}
              {!data?.assignments.length && <li className="text-muted-foreground">No finance roles assigned yet.</li>}
            </ul>
            {revokeId && (
              <div className="mt-4 space-y-2">
                <Label htmlFor="finance-revoke-reason">Reason for revocation</Label>
                <Input
                  id="finance-revoke-reason"
                  value={revokeReason}
                  onChange={(event) => setRevokeReason(event.target.value)}
                  maxLength={500}
                />
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    disabled={mutation.isPending || revokeReason.trim().length < 3}
                    onClick={() => mutation.mutate({ kind: "revoke" })}
                  >
                    Confirm revocation
                  </Button>
                  <Button variant="ghost" onClick={() => setRevokeId("")}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
