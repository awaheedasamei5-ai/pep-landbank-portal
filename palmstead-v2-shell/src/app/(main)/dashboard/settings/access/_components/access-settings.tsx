"use client";

import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { requireSupabase } from "@/lib/supabase.client";

type Staff = { agent_key: string; name: string; role: string; department: string | null; active: boolean };
type Permission = { key: string; label: string; description: string | null };
type Override = { staff_key: string; permission_key: string; granted: boolean; granted_at: string | null };
type RoleDefault = { role: string; permission_key: string };
type Setting = "allow" | "deny" | "default";
const SUPPORTED_KEYS = [
  "operations.todos.view",
  "operations.todos.manage",
  "operations.projects.view",
  "operations.projects.manage",
];

export function AccessSettings() {
  const [authorized, setAuthorized] = useState(false);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [roleDefaults, setRoleDefaults] = useState<RoleDefault[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const client = requireSupabase();
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user) throw new Error("Sign in to review access settings.");
    const { data: manager, error: managerError } = await client
      .from("profiles")
      .select("role,active")
      .eq("id", auth.user.id)
      .single();
    if (managerError || manager?.role !== "manager" || manager?.active !== true) {
      throw new Error("Only active Management can review staff access.");
    }
    const [people, defs, values, defaults] = await Promise.all([
      client.from("profiles").select("agent_key,name,role,department,active").order("name"),
      client.from("permissions").select("key,label,description").in("key", SUPPORTED_KEYS).order("key"),
      client.from("staff_permission_overrides").select("staff_key,permission_key,granted,granted_at"),
      client.from("role_permissions").select("role,permission_key"),
    ]);
    if (people.error || defs.error || values.error || defaults.error) {
      throw new Error("Access settings could not be loaded. Please retry.");
    }
    setStaff((people.data ?? []) as Staff[]);
    if (defs.data?.length !== SUPPORTED_KEYS.length) {
      throw new Error("Operations access controls are not ready. Please retry later.");
    }
    setAuthorized(true);
    setPermissions((defs.data ?? []) as Permission[]);
    setOverrides((values.data ?? []) as Override[]);
    setRoleDefaults((defaults.data ?? []) as RoleDefault[]);
    setSelected((current) => current || people.data?.find((person) => person.role !== "manager")?.agent_key || "");
  }, []);

  useEffect(() => {
    let cancelled = false;
    void load()
      .catch((error) => {
        if (!cancelled) setNotice(error instanceof Error ? error.message : "Access settings could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const person = staff.find((entry) => entry.agent_key === selected);

  async function change(key: string, setting: Setting) {
    if (!person || person.role === "manager" || busy) return;
    setBusy(key);
    setNotice("");
    const client = requireSupabase();
    const { error } =
      setting === "default"
        ? await client.rpc("clear_permission_override", { p_staff_key: person.agent_key, p_permission_key: key })
        : await client.rpc("set_permission_override", {
            p_staff_key: person.agent_key,
            p_permission_key: key,
            p_granted: setting === "allow",
          });
    if (error) setNotice("This access change was not saved. Please retry.");
    else {
      try {
        await load();
        setNotice("Access change saved and recorded in the audit log.");
      } catch {
        setNotice("The change was saved, but the access list could not refresh. Reload this page.");
      }
    }
    setBusy("");
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl tracking-tight">Staff access</h1>
        <p className="text-muted-foreground text-sm">
          Choose a staff member, then allow or restrict their Operations to-dos and shared projects. Changes to
          projects also affect work items, comments, and project reports.
        </p>
      </div>
      {loading && (
        <p role="status" className="text-muted-foreground text-sm">
          Loading access settings…
        </p>
      )}
      {notice && (
        <p role={authorized ? "status" : "alert"} className="text-sm">
          {notice}
        </p>
      )}
      {authorized && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Staff member</CardTitle>
              <CardDescription>
                These changes take effect in the database. Restricting view access also prevents changes in that area.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="access-staff">Choose staff</FieldLabel>
                  <Select value={selected} onValueChange={setSelected}>
                    <SelectTrigger id="access-staff" className="w-full sm:max-w-sm">
                      <SelectValue placeholder="Select staff" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {staff
                          .filter((entry) => entry.role !== "manager")
                          .map((entry) => (
                            <SelectItem key={entry.agent_key} value={entry.agent_key}>
                              {entry.name}
                              {entry.department ? ` · ${entry.department}` : ""}
                              {entry.active ? "" : " · Inactive"}
                            </SelectItem>
                          ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>
          {person && (
            <div className="grid min-w-0 gap-3">
              {permissions.map((permission) => {
                const override = overrides.find(
                  (entry) => entry.staff_key === person.agent_key && entry.permission_key === permission.key,
                );
                const roleAllows = roleDefaults.some(
                  (entry) => entry.role === person.role && entry.permission_key === permission.key,
                );
                let setting: Setting = "default";
                if (override) setting = override.granted ? "allow" : "deny";
                const viewKey = permission.key.replace(/\.manage$/, ".view");
                const viewOverride = overrides.find(
                  (entry) => entry.staff_key === person.agent_key && entry.permission_key === viewKey,
                );
                const viewRoleAllows = roleDefaults.some(
                  (entry) => entry.role === person.role && entry.permission_key === viewKey,
                );
                const viewAllowed = viewOverride ? viewOverride.granted : viewRoleAllows;
                const effective =
                  (override ? override.granted : roleAllows) &&
                  (!permission.key.endsWith(".manage") || viewAllowed);
                return (
                  <Card key={permission.key} className="min-w-0">
                    <CardHeader className="gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <CardTitle className="text-base">{permission.label}</CardTitle>
                        <Badge variant={effective ? "secondary" : "outline"}>
                          {effective ? "Allowed" : "Restricted"}
                        </Badge>
                      </div>
                      <CardDescription>{permission.description ?? permission.key}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant={setting === "allow" ? "default" : "outline"}
                        disabled={!!busy}
                        onClick={() => void change(permission.key, "allow")}
                      >
                        Allow
                      </Button>
                      <Button
                        size="sm"
                        variant={setting === "deny" ? "default" : "outline"}
                        disabled={!!busy}
                        onClick={() => void change(permission.key, "deny")}
                      >
                        Restrict
                      </Button>
                      <Button
                        size="sm"
                        variant={setting === "default" ? "secondary" : "outline"}
                        disabled={!!busy}
                        onClick={() => void change(permission.key, "default")}
                      >
                        Use role default
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

