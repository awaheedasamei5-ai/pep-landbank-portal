"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

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
import { today } from "@/lib/palmstead/format";
import { useAuthStore } from "@/stores/auth/auth-store";

import { usePayrollStaff } from "./use-finance-payroll";
import {
  type CalcEntry,
  useAddCalcEntry,
  useCalcEntries,
  useCalcParticipants,
  useCalcSessions,
  useCommissionRates,
  useCreateCalcSession,
  useDeleteCalcEntry,
  useDeleteCalcSession,
  useSetParticipantEligibility,
} from "./use-commission-calculator";

// Real Commission Calculator (Part B.9). Same cap/price formula
// get_commission_breakdown() already runs in production, applied here to
// manually-entered what-if data. Pool eligibility and "new plot sale" are
// both manual flags -- a hand-entered payment has no real lead history
// for the automated 3-month rule to check, per the user's own explicit
// design ("a section where we click to indicate if a staff is entitled
// to pool using the 3-months rule").
function money(n: number): string {
  return `GHS ${n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function NewSessionDialog({ callerKey }: { callerKey: string | undefined }) {
  const [open, setOpen] = useState(false);
  const create = useCreateCalcSession();
  const [name, setName] = useState("");
  const [period, setPeriod] = useState(() => today().slice(0, 7));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus data-icon="inline-start" />
          New session
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New calculator session</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Month</Label>
            <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Name (optional)</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. What-if with Adams eligible" />
          </div>
        </div>
        <DialogFooter>
          <SubmitButton
            loading={create.isPending}
            onClick={async () => {
              await create.mutateAsync({ period, name, createdBy: callerKey });
              setName("");
              setOpen(false);
            }}
          >
            Create
          </SubmitButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddEntryDialog({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = useState(false);
  const { data: staff } = usePayrollStaff();
  const add = useAddCalcEntry();
  const [payrollStaffId, setPayrollStaffId] = useState("");
  const [clientName, setClientName] = useState("");
  const [plotType, setPlotType] = useState<"Full Plot" | "Half Plot">("Full Plot");
  const [amount, setAmount] = useState("");
  const [noPlots, setNoPlots] = useState("1");
  const [isNewSale, setIsNewSale] = useState(false);

  function reset() {
    setPayrollStaffId("");
    setClientName("");
    setPlotType("Full Plot");
    setAmount("");
    setNoPlots("1");
    setIsNewSale(false);
  }

  async function submit() {
    const parsed = Number(amount);
    const parsedPlots = Number(noPlots) || 1;
    if (!payrollStaffId || !clientName.trim() || !parsed || parsed <= 0) return;
    await add.mutateAsync({ sessionId, payrollStaffId, clientName: clientName.trim(), plotType, amount: parsed, noPlots: parsedPlots, isNewSale });
    reset();
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(n) => { setOpen(n); if (!n) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus data-icon="inline-start" />
          Add payment
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add a payment</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Client name</Label>
            <Input value={clientName} onChange={(e) => setClientName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Staff member</Label>
            <Select value={payrollStaffId} onValueChange={setPayrollStaffId}>
              <SelectTrigger>
                <SelectValue placeholder="Select who gets credit" />
              </SelectTrigger>
              <SelectContent>
                {(staff ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label>Plot type</Label>
              <Select value={plotType} onValueChange={(v) => setPlotType(v as "Full Plot" | "Half Plot")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Full Plot">Full Plot</SelectItem>
                  <SelectItem value="Half Plot">Half Plot</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label>Amount paid</Label>
              <Input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <div>
              <Label className="text-sm">New plot sale this month</Label>
              <p className="text-xs text-muted-foreground">Counts toward the newcomer pool ({noPlots} plot(s))</p>
            </div>
            <Switch checked={isNewSale} onCheckedChange={setIsNewSale} />
          </div>
          {isNewSale && (
            <div className="flex flex-col gap-1.5">
              <Label>Number of plots sold</Label>
              <Input type="number" min="0.5" step="0.5" value={noPlots} onChange={(e) => setNoPlots(e.target.value)} />
            </div>
          )}
        </div>
        <DialogFooter>
          <SubmitButton onClick={submit} loading={add.isPending} disabled={!payrollStaffId || !clientName.trim() || !amount}>
            Add
          </SubmitButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SessionWorkspace({ sessionId }: { sessionId: string }) {
  const { data: entries, isLoading: entriesLoading } = useCalcEntries(sessionId);
  const { data: participants } = useCalcParticipants(sessionId);
  const { data: staff } = usePayrollStaff();
  const { data: rates } = useCommissionRates();
  const delEntry = useDeleteCalcEntry();
  const setEligible = useSetParticipantEligibility();

  const staffName = (id: string) => (staff ?? []).find((s) => s.id === id)?.name ?? "—";

  const results = useMemo(() => {
    if (!entries || !rates || !participants) return null;
    const personalByStaff = new Map<string, number>();
    for (const e of entries) {
      const cap = e.plotType === "Half Plot" ? rates.halfCap : rates.fullCap;
      const price = e.plotType === "Half Plot" ? rates.halfPrice : rates.fullPrice;
      const contribution = price > 0 ? cap * (e.amount / price) : 0;
      personalByStaff.set(e.payrollStaffId, (personalByStaff.get(e.payrollStaffId) ?? 0) + contribution);
    }
    const newPlotsTotal = entries.filter((e) => e.isNewSale).reduce((s, e) => s + e.noPlots, 0);
    const poolTotal = newPlotsTotal * rates.poolPerPlot;
    const eligibleIds = new Set(participants.filter((p) => p.poolEligible).map((p) => p.payrollStaffId));
    const poolShare = eligibleIds.size > 0 ? poolTotal / eligibleIds.size : 0;

    const staffIds = new Set([...personalByStaff.keys(), ...participants.map((p) => p.payrollStaffId)]);
    const rows = [...staffIds].map((id) => {
      const personal = personalByStaff.get(id) ?? 0;
      const eligible = eligibleIds.has(id);
      return { payrollStaffId: id, personal, poolShare: eligible ? poolShare : 0, eligible, total: personal + (eligible ? poolShare : 0) };
    });
    rows.sort((a, b) => b.total - a.total);
    return { rows, poolTotal, newPlotsTotal, eligibleCount: eligibleIds.size };
  }, [entries, rates, participants]);

  if (entriesLoading || !rates) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">Payments entered</h3>
        <AddEntryDialog sessionId={sessionId} />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Staff</TableHead>
                <TableHead>Plot</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>New sale</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(entries ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    No payments entered yet.
                  </TableCell>
                </TableRow>
              )}
              {(entries ?? []).map((e: CalcEntry) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">{e.clientName}</TableCell>
                  <TableCell>{staffName(e.payrollStaffId)}</TableCell>
                  <TableCell>{e.plotType}</TableCell>
                  <TableCell className="tabular-nums">{money(e.amount)}</TableCell>
                  <TableCell>{e.isNewSale ? <Badge variant="outline">{e.noPlots} plot(s)</Badge> : "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon-xs" onClick={() => delEntry.mutate({ id: e.id, sessionId })}>
                      <Trash2 className="text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {results && results.rows.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader>
                <CardDescription>New plots sold</CardDescription>
                <CardTitle className="text-2xl tabular-nums">{results.newPlotsTotal}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Pool total</CardDescription>
                <CardTitle className="text-2xl tabular-nums">{money(results.poolTotal)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Eligible for pool</CardDescription>
                <CardTitle className="text-2xl tabular-nums">{results.eligibleCount}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Allocation — toggle pool eligibility per person</CardTitle>
              <CardDescription>The 3-month rule can't be auto-checked against manually-entered data — set it here.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {results.rows.map((r) => (
                <div key={r.payrollStaffId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
                  <div className="font-medium">{staffName(r.payrollStaffId)}</div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">Personal {money(r.personal)}</Badge>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Switch
                        checked={r.eligible}
                        onCheckedChange={(v) => setEligible.mutate({ sessionId, payrollStaffId: r.payrollStaffId, poolEligible: v })}
                      />
                      Pool eligible
                    </div>
                    {r.eligible && <Badge>Pool {money(r.poolShare)}</Badge>}
                    <span className="font-medium tabular-nums">{money(r.total)}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

export function CommissionCalculatorPanel() {
  const profile = useAuthStore((s) => s.profile);
  const { data: sessions, isLoading } = useCalcSessions();
  const delSession = useDeleteCalcSession();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  const active = (sessions ?? []).find((s) => s.id === activeSessionId) ?? sessions?.[0] ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium">Commission Calculator</h2>
          <p className="text-sm text-muted-foreground">Manually enter payments and see personal + pool commission allocate automatically.</p>
        </div>
        <NewSessionDialog callerKey={profile?.key} />
      </div>

      {(sessions ?? []).length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">No calculator sessions yet — create one above.</CardContent>
        </Card>
      ) : (
        <div className="flex flex-wrap gap-2">
          {(sessions ?? []).map((s) => (
            <div key={s.id} className="flex items-center gap-1">
              <Button size="sm" variant={active?.id === s.id ? "default" : "outline"} onClick={() => setActiveSessionId(s.id)}>
                {s.name || s.period}
              </Button>
              <Button variant="ghost" size="icon-xs" onClick={() => delSession.mutate(s.id)}>
                <Trash2 className="size-3 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {active && <SessionWorkspace sessionId={active.id} />}
    </div>
  );
}
