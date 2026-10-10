"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Download, Plus, Trash2, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { SubmitButton } from "@/components/submit-button";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSupabase } from "@/lib/supabase.client";
import { today } from "@/lib/palmstead/format";
import { useAuthStore } from "@/stores/auth/auth-store";

import { useCommissionReportConfig } from "./use-finance-commission";
import {
  type PayrollRun,
  type PayrollStaff,
  useAddSalaryComponent,
  useDeleteSalaryComponent,
  useGeneratePayrollRun,
  usePayrollRunLines,
  usePayrollRuns,
  usePayrollStaff,
  useSalaryComponents,
  useSetPayrollStaffActive,
  useSignOffPayrollRun,
  useUpsertPayrollStaff,
} from "./use-finance-payroll";
import { buildPayrollRunPdf, buildPayslipPdf } from "./payroll-pdf";

// Real Payroll (Part B.8). Manager-only end to end -- RLS on every
// payroll_* table locks it away from staff entirely, verified live
// before this UI was written. "Generate payroll" freezes live salary
// components into a run; a signed-off run can never be regenerated,
// matching the real payment-lockstep discipline this project treats as
// non-negotiable for anything touching real money.
function money(n: number): string {
  return `GHS ${n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function monthLabel(mk: string): string {
  return new Date(`${mk}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

const STATUS_VARIANT: Record<PayrollRun["status"], "outline" | "default" | "secondary"> = {
  draft: "outline",
  signed_off: "default",
  paid: "secondary",
};

function useRealStaffProfiles() {
  return useQuery({
    queryKey: ["real-staff-profiles-for-payroll"],
    queryFn: async () => {
      const sb = requireSupabase();
      const { data, error } = await sb.from("profiles").select("agent_key,name").eq("active", true).order("name");
      if (error) throw error;
      return (data ?? []) as { agent_key: string; name: string }[];
    },
  });
}

function AddPayeeDialog({ callerKey }: { callerKey: string | undefined }) {
  const [open, setOpen] = useState(false);
  const { data: profiles } = useRealStaffProfiles();
  const upsert = useUpsertPayrollStaff();
  const [mode, setMode] = useState<"staff" | "other">("staff");
  const [profileKey, setProfileKey] = useState("");
  const [name, setName] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");

  function reset() {
    setMode("staff");
    setProfileKey("");
    setName("");
    setRoleTitle("");
    setBankName("");
    setBankAccountName("");
    setBankAccountNumber("");
  }

  async function submit() {
    const resolvedName = mode === "staff" ? (profiles ?? []).find((p) => p.agent_key === profileKey)?.name ?? "" : name;
    if (!resolvedName) return;
    await upsert.mutateAsync({
      profileKey: mode === "staff" ? profileKey : null,
      name: resolvedName,
      roleTitle,
      bankName,
      bankAccountName,
      bankAccountNumber,
      createdBy: callerKey,
    });
    reset();
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(n) => { setOpen(n); if (!n) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus data-icon="inline-start" />
          Add payee
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a payroll payee</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex gap-2">
            <Button size="sm" variant={mode === "staff" ? "default" : "outline"} onClick={() => setMode("staff")} className="flex-1">
              Real staff member
            </Button>
            <Button size="sm" variant={mode === "other" ? "default" : "outline"} onClick={() => setMode("other")} className="flex-1">
              Someone else
            </Button>
          </div>

          {mode === "staff" ? (
            <div className="flex flex-col gap-1.5">
              <Label>Staff member</Label>
              <Select value={profileKey} onValueChange={setProfileKey}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a staff member" />
                </SelectTrigger>
                <SelectContent>
                  {(profiles ?? []).map((p) => (
                    <SelectItem key={p.agent_key} value={p.agent_key}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payee-name">Full name</Label>
              <Input id="payee-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. a contractor or new hire" />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payee-role">Role / title</Label>
            <Input id="payee-role" value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} placeholder="e.g. Executive Assistant" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payee-bank">Bank</Label>
            <Input id="payee-bank" value={bankName} onChange={(e) => setBankName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payee-bank-acc-name">Account name</Label>
            <Input id="payee-bank-acc-name" value={bankAccountName} onChange={(e) => setBankAccountName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payee-bank-acc-number">Account number</Label>
            <Input id="payee-bank-acc-number" value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <SubmitButton onClick={submit} loading={upsert.isPending} disabled={mode === "staff" ? !profileKey : !name}>
            Add payee
          </SubmitButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ManageSalaryDialog({ staff }: { staff: PayrollStaff }) {
  const [open, setOpen] = useState(false);
  const { data: components } = useSalaryComponents(open ? staff.id : null);
  const add = useAddSalaryComponent();
  const del = useDeleteSalaryComponent();
  const [componentName, setComponentName] = useState("");
  const [componentType, setComponentType] = useState<"earning" | "deduction">("earning");
  const [amount, setAmount] = useState("");

  const earnings = (components ?? []).filter((c) => c.componentType === "earning");
  const deductions = (components ?? []).filter((c) => c.componentType === "deduction");
  const net = earnings.reduce((s, c) => s + c.amount, 0) - deductions.reduce((s, c) => s + c.amount, 0);

  async function submitAdd() {
    const parsed = Number(amount);
    if (!componentName.trim() || !parsed || parsed <= 0) return;
    await add.mutateAsync({ payrollStaffId: staff.id, componentName: componentName.trim(), componentType, amount: parsed });
    setComponentName("");
    setAmount("");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Manage salary
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{staff.name} — salary components</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            {(components ?? []).length === 0 && <p className="text-sm text-muted-foreground">No salary components yet.</p>}
            {(components ?? []).map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                <div>
                  <span className="font-medium">{c.componentName}</span>
                  <Badge variant="outline" className="ml-2">
                    {c.componentType}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="tabular-nums">{money(c.amount)}</span>
                  <Button variant="ghost" size="icon-xs" onClick={() => del.mutate({ id: c.id, payrollStaffId: staff.id })}>
                    <Trash2 className="text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-border pt-2 text-sm font-medium">
              <span>Net pay</span>
              <span className="tabular-nums">{money(net)}</span>
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-md border border-dashed border-border p-3">
            <Label className="text-xs">Add component</Label>
            <Input placeholder="e.g. Basic Salary" value={componentName} onChange={(e) => setComponentName(e.target.value)} />
            <div className="flex gap-2">
              <Select value={componentType} onValueChange={(v) => setComponentType(v as "earning" | "deduction")}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="earning">Earning</SelectItem>
                  <SelectItem value="deduction">Deduction</SelectItem>
                </SelectContent>
              </Select>
              <Input type="number" min="0" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} className="flex-1" />
            </div>
            <Button size="sm" onClick={submitAdd} disabled={add.isPending || !componentName.trim() || !amount}>
              Add
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RunBreakdownDialog({ run, staffBankLookup }: { run: PayrollRun; staffBankLookup: Map<string, string | null> }) {
  const [open, setOpen] = useState(false);
  const { data: lines } = usePayrollRunLines(open ? run.id : null);
  const { data: reportConfig } = useCommissionReportConfig();
  const profile = useAuthStore((s) => s.profile);
  const [downloadingRun, setDownloadingRun] = useState(false);
  const [downloadingSlip, setDownloadingSlip] = useState<string | null>(null);

  const byStaff = new Map<string, { name: string; lines: typeof lines }>();
  for (const l of lines ?? []) {
    const existing = byStaff.get(l.payrollStaffId);
    if (existing) existing.lines?.push(l);
    else byStaff.set(l.payrollStaffId, { name: l.staffName, lines: [l] });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          View breakdown
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{monthLabel(run.period)} payroll</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {reportConfig && (
            <Button
              size="sm"
              disabled={downloadingRun}
              onClick={async () => {
                if (!lines) return;
                setDownloadingRun(true);
                try {
                  const doc = await buildPayrollRunPdf(run.period, lines, reportConfig, profile?.signatureData, profile?.name, staffBankLookup);
                  doc.save(`Payroll_${run.period}.pdf`);
                } finally {
                  setDownloadingRun(false);
                }
              }}
            >
              <Download data-icon="inline-start" />
              Download bank transfer PDF
            </Button>
          )}
          {[...byStaff.entries()].map(([staffId, v]) => {
            const net = (v.lines ?? []).reduce((s, l) => s + (l.componentType === "earning" ? l.amount : -l.amount), 0);
            return (
              <div key={staffId} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                <div>
                  <div className="font-medium">{v.name}</div>
                  <div className="text-muted-foreground text-xs tabular-nums">Net {money(net)}</div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={downloadingSlip === staffId}
                  onClick={async () => {
                    if (!reportConfig) return;
                    setDownloadingSlip(staffId);
                    try {
                      const doc = await buildPayslipPdf(run.period, v.name, staffBankLookup.get(staffId) ?? null, v.lines ?? [], reportConfig.companyName, reportConfig.logoImage);
                      doc.save(`Payslip_${v.name.replace(/\s+/g, "_")}_${run.period}.pdf`);
                    } finally {
                      setDownloadingSlip(null);
                    }
                  }}
                >
                  Payslip
                </Button>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PayrollPanel() {
  const profile = useAuthStore((s) => s.profile);
  const isManager = profile?.role === "manager";
  const { data: staff, isLoading: staffLoading } = usePayrollStaff();
  const { data: runs, isLoading: runsLoading } = usePayrollRuns();
  const setActive = useSetPayrollStaffActive();
  const generate = useGeneratePayrollRun();
  const signOff = useSignOffPayrollRun();
  const [period, setPeriod] = useState(() => today().slice(0, 7));

  const staffBankLookup = new Map<string, string | null>((staff ?? []).map((s) => [s.id, s.bankAccountNumber]));

  if (!isManager) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">Payroll is visible to Management only.</CardContent>
      </Card>
    );
  }

  if (staffLoading || runsLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const existingRun = runs?.find((r) => r.period === period);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium">Payroll</h2>
          <p className="text-sm text-muted-foreground">Manage payees, salary components, and monthly payroll runs.</p>
        </div>
        <AddPayeeDialog callerKey={profile?.key} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="size-4" />
            Roster
          </CardTitle>
          <CardDescription>{(staff ?? []).length} payee(s).</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {(staff ?? []).length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No payees yet — add one above.</p>}
          {(staff ?? []).map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
              <div>
                <div className="font-medium">{s.name}</div>
                <div className="text-muted-foreground text-xs">{s.roleTitle ?? "—"}{s.profileKey ? "" : " · not a Palmstead staff account"}</div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={s.active} onCheckedChange={(v) => setActive.mutate({ id: s.id, active: v })} />
                <ManageSalaryDialog staff={s} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generate payroll</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="w-44" />
          <Button
            onClick={() => generate.mutate(period)}
            disabled={generate.isPending || (existingRun && existingRun.status !== "draft")}
          >
            {existingRun ? "Regenerate (draft)" : "Generate"}
          </Button>
          {existingRun && existingRun.status !== "draft" && <Badge variant={STATUS_VARIANT[existingRun.status]}>Already {existingRun.status.replace("_", " ")}</Badge>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Generated</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(runs ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                    No payroll runs yet.
                  </TableCell>
                </TableRow>
              )}
              {(runs ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{monthLabel(r.period)}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[r.status]}>{r.status.replace("_", " ")}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.generatedBy ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <RunBreakdownDialog run={r} staffBankLookup={staffBankLookup} />
                      {r.status === "draft" && (
                        <Button size="sm" onClick={() => signOff.mutate(r.id)} disabled={signOff.isPending}>
                          <CheckCircle2 data-icon="inline-start" />
                          Sign off
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
