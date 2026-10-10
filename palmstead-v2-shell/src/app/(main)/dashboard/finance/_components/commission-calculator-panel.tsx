"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Download, Plus, Trash2, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
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

import { buildCommissionCalculatorPdf } from "./commission-calculator-pdf";
import { useCommissionReportConfig } from "./use-finance-commission";
import { type LeadOption, useLeadSearch } from "./use-finance-payments";
import { type PayrollStaff, usePayrollStaff } from "./use-finance-payroll";
import {
  type CalcEntry,
  type CalcSettings,
  useAddCalcEntry,
  useAddParticipant,
  useCalcEntries,
  useCalcParticipants,
  useCalcSessions,
  useCreateCalcSession,
  useDeleteCalcEntry,
  useDeleteCalcSession,
  useRemoveParticipant,
  useSetParticipantEligibility,
  useUpdateCalcSettings,
} from "./use-commission-calculator";

// Real Commission Calculator (Part E.2 -- rebuilt 2026-10-10 against the
// user's own explicit workflow correction): staff-first, not entry-first.
// 1. Select a staff member.
// 2. Add every client they collected from this month -- searched from the
//    real `leads` table (same combobox the Payments screen already uses),
//    falling back to free text only when the client genuinely isn't in
//    the system yet.
// 3. Toggle whether that staff is pool-eligible.
// 4. Move to the next staff.
// 5. "Commission settings" -- the cap/price/pool rate to use for THIS
//    calculation, pre-filled from live rates but overridable.
// 6. Calculate with the identical real formula, allocate, download a PDF
//    with company + bank details and each staff member's own account
//    number (this document's whole purpose is the bank transfer itself).
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
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. October commission run" />
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

function SettingsCard({ sessionId, settings }: { sessionId: string; settings: CalcSettings }) {
  const [form, setForm] = useState(settings);
  const update = useUpdateCalcSettings();

  function field(key: keyof CalcSettings, label: string) {
    return (
      <div className="flex flex-col gap-1.5">
        <Label>{label}</Label>
        <Input type="number" min="0" value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: Number(e.target.value) }))} />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Commission settings</CardTitle>
        <CardDescription>The standard commission and pool rates to use for this calculation — pre-filled from live rates, editable here.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {field("fullCap", "Full plot cap")}
          {field("halfCap", "Half plot cap")}
          {field("fullPrice", "Full plot price")}
          {field("halfPrice", "Half plot price")}
          {field("poolPerPlot", "Pool per plot")}
        </div>
        <div>
          <SubmitButton size="sm" loading={update.isPending} onClick={() => update.mutate({ sessionId, settings: form })}>
            Save settings
          </SubmitButton>
        </div>
      </CardContent>
    </Card>
  );
}

function AddParticipantDialog({ sessionId, excludeIds }: { sessionId: string; excludeIds: Set<string> }) {
  const [open, setOpen] = useState(false);
  const { data: staff } = usePayrollStaff();
  const add = useAddParticipant();
  const available = (staff ?? []).filter((s) => !excludeIds.has(s.id));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus data-icon="inline-start" />
          Add staff
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add a staff member</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {available.length === 0 && <p className="text-sm text-muted-foreground">Every payee is already part of this calculation.</p>}
          {available.map((s) => (
            <Button
              key={s.id}
              variant="outline"
              className="justify-start"
              onClick={async () => {
                await add.mutateAsync({ sessionId, payrollStaffId: s.id });
                setOpen(false);
              }}
            >
              {s.name}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddClientEntryDialog({ sessionId, payrollStaffId }: { sessionId: string; payrollStaffId: string }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"search" | "manual">("search");
  const [search, setSearch] = useState("");
  const [selectedLead, setSelectedLead] = useState<LeadOption | null>(null);
  const [manualName, setManualName] = useState("");
  const [plotType, setPlotType] = useState<"Full Plot" | "Half Plot">("Full Plot");
  const [amount, setAmount] = useState("");
  const [isNewSale, setIsNewSale] = useState(false);
  const [noPlots, setNoPlots] = useState("1");
  const { data: leads, isFetching: searching } = useLeadSearch(search);
  const add = useAddCalcEntry();

  function reset() {
    setMode("search");
    setSearch("");
    setSelectedLead(null);
    setManualName("");
    setPlotType("Full Plot");
    setAmount("");
    setIsNewSale(false);
    setNoPlots("1");
  }

  async function submit() {
    const clientName = mode === "search" ? selectedLead?.name : manualName.trim();
    const parsed = Number(amount);
    if (!clientName || !parsed || parsed <= 0) return;
    await add.mutateAsync({
      sessionId,
      payrollStaffId,
      clientName,
      plotType,
      amount: parsed,
      noPlots: Number(noPlots) || 1,
      isNewSale,
    });
    reset();
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(n) => { setOpen(n); if (!n) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus data-icon="inline-start" />
          Add client
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add a client payment</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <Button size="sm" variant={mode === "search" ? "default" : "outline"} className="flex-1" onClick={() => setMode("search")}>
              Search real client
            </Button>
            <Button size="sm" variant={mode === "manual" ? "default" : "outline"} className="flex-1" onClick={() => setMode("manual")}>
              Not in the system
            </Button>
          </div>

          {mode === "search" ? (
            <div className="flex flex-col gap-1.5">
              <Label>Client</Label>
              {selectedLead ? (
                <div className="flex items-center justify-between rounded-md border border-input px-3 py-2 text-sm">
                  <div>
                    <div className="font-medium">{selectedLead.name}</div>
                    <div className="text-muted-foreground text-xs">{selectedLead.plotType ?? "—"}</div>
                  </div>
                  <Button variant="ghost" size="icon-xs" onClick={() => setSelectedLead(null)}>
                    ×
                  </Button>
                </div>
              ) : (
                <Combobox
                  items={leads ?? []}
                  itemToStringLabel={(l: LeadOption) => l.name}
                  isItemEqualToValue={(a: LeadOption, b: LeadOption) => a.id === b.id}
                  inputValue={search}
                  onInputValueChange={setSearch}
                  onValueChange={(v) => {
                    const lead = v as LeadOption | null;
                    setSelectedLead(lead);
                    if (lead?.plotType === "Half Plot" || lead?.plotType === "Full Plot") setPlotType(lead.plotType);
                  }}
                >
                  <ComboboxInput placeholder="Search client by name…" showTrigger={false} />
                  <ComboboxContent>
                    <ComboboxEmpty>{searching ? "Searching…" : "No leads found"}</ComboboxEmpty>
                    <ComboboxList>
                      {(item: LeadOption) => (
                        <ComboboxItem key={item.id} value={item}>
                          <div>
                            <div>{item.name}</div>
                            <div className="text-muted-foreground text-xs">{item.plotType ?? "—"}</div>
                          </div>
                        </ComboboxItem>
                      )}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label>Client name</Label>
              <Input value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="Full name" />
            </div>
          )}

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
              <Input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Full or installment amount" />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <div>
              <Label className="text-sm">New plot sale this month</Label>
              <p className="text-xs text-muted-foreground">Counts toward the newcomer pool</p>
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
          <SubmitButton onClick={submit} loading={add.isPending} disabled={(mode === "search" ? !selectedLead : !manualName.trim()) || !amount}>
            Add
          </SubmitButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ParticipantCard({
  sessionId,
  staff,
  eligible,
  participantId,
  entries,
  personal,
  poolShare,
  total,
}: {
  sessionId: string;
  staff: PayrollStaff;
  eligible: boolean;
  participantId: string;
  entries: CalcEntry[];
  personal: number;
  poolShare: number;
  total: number;
}) {
  const [open, setOpen] = useState(true);
  const setEligible = useSetParticipantEligibility();
  const removeParticipant = useRemoveParticipant();
  const delEntry = useDeleteCalcEntry();

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <CollapsibleTrigger asChild>
            <button type="button" className="flex flex-1 items-center gap-2 text-left">
              <ChevronDown className={`size-4 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`} />
              <div>
                <CardTitle className="text-base">{staff.name}</CardTitle>
                <CardDescription>
                  {entries.length} client(s) · {money(total)} total
                </CardDescription>
              </div>
            </button>
          </CollapsibleTrigger>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Switch checked={eligible} onCheckedChange={(v) => setEligible.mutate({ sessionId, payrollStaffId: staff.id, poolEligible: v })} />
              Pool eligible
            </div>
            <Button variant="ghost" size="icon-xs" onClick={() => removeParticipant.mutate({ id: participantId, sessionId, payrollStaffId: staff.id })}>
              <Trash2 className="text-destructive" />
            </Button>
          </div>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex gap-2 text-sm">
                <Badge variant="outline">Personal {money(personal)}</Badge>
                {eligible && <Badge>Pool {money(poolShare)}</Badge>}
              </div>
              <AddClientEntryDialog sessionId={sessionId} payrollStaffId={staff.id} />
            </div>
            {entries.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No clients added yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Plot</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>New sale</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{e.clientName}</TableCell>
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
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function SessionWorkspace({ sessionId, period, sessionName, settings }: { sessionId: string; period: string; sessionName: string | null; settings: CalcSettings }) {
  const profile = useAuthStore((s) => s.profile);
  const { data: participants, isLoading: pLoading } = useCalcParticipants(sessionId);
  const { data: entries, isLoading: eLoading } = useCalcEntries(sessionId);
  const { data: staff } = usePayrollStaff();
  const { data: reportConfig } = useCommissionReportConfig();
  const [downloading, setDownloading] = useState(false);

  const staffById = useMemo(() => new Map((staff ?? []).map((s) => [s.id, s])), [staff]);

  const computed = useMemo(() => {
    if (!entries || !participants) return null;
    const personalByStaff = new Map<string, number>();
    for (const e of entries) {
      const cap = e.plotType === "Half Plot" ? settings.halfCap : settings.fullCap;
      const price = e.plotType === "Half Plot" ? settings.halfPrice : settings.fullPrice;
      const contribution = price > 0 ? cap * (e.amount / price) : 0;
      personalByStaff.set(e.payrollStaffId, (personalByStaff.get(e.payrollStaffId) ?? 0) + contribution);
    }
    const newPlotsTotal = entries.filter((e) => e.isNewSale).reduce((s, e) => s + e.noPlots, 0);
    const poolTotal = newPlotsTotal * settings.poolPerPlot;
    const eligibleIds = new Set(participants.filter((p) => p.poolEligible).map((p) => p.payrollStaffId));
    const poolShare = eligibleIds.size > 0 ? poolTotal / eligibleIds.size : 0;

    const rows = participants.map((p) => {
      const personal = personalByStaff.get(p.payrollStaffId) ?? 0;
      const eligible = eligibleIds.has(p.payrollStaffId);
      return { payrollStaffId: p.payrollStaffId, personal, poolShare: eligible ? poolShare : 0, eligible, total: personal + (eligible ? poolShare : 0) };
    });
    rows.sort((a, b) => b.total - a.total);
    return { rows, poolTotal, newPlotsTotal, eligibleCount: eligibleIds.size };
  }, [entries, participants, settings]);

  if (pLoading || eLoading) return <Skeleton className="h-64 w-full" />;

  const excludeIds = new Set((participants ?? []).map((p) => p.payrollStaffId));

  async function downloadPdf() {
    if (!reportConfig || !computed || !entries) return;
    setDownloading(true);
    try {
      const rows = computed.rows.map((r) => {
        const s = staffById.get(r.payrollStaffId);
        return {
          payrollStaffId: r.payrollStaffId,
          staffName: s?.name ?? "—",
          bankAccountNumber: s?.bankAccountNumber ?? null,
          entries: entries.filter((e) => e.payrollStaffId === r.payrollStaffId),
          personal: r.personal,
          poolShare: r.poolShare,
          eligible: r.eligible,
          total: r.total,
        };
      });
      const doc = await buildCommissionCalculatorPdf(period, sessionName, settings, rows, computed.poolTotal, reportConfig, profile?.signatureData, profile?.name);
      doc.save(`Commission_Calculation_${period}.pdf`);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <SettingsCard sessionId={sessionId} settings={settings} />

      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Users className="size-4" />
          Staff & monthly collected
        </h3>
        <AddParticipantDialog sessionId={sessionId} excludeIds={excludeIds} />
      </div>

      {(participants ?? []).length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">Add a staff member above to start entering their monthly collections.</CardContent>
        </Card>
      )}

      {computed?.rows.map((r) => {
        const staffMember = staffById.get(r.payrollStaffId);
        const participant = (participants ?? []).find((p) => p.payrollStaffId === r.payrollStaffId);
        if (!staffMember || !participant) return null;
        return (
          <ParticipantCard
            key={r.payrollStaffId}
            sessionId={sessionId}
            staff={staffMember}
            eligible={r.eligible}
            participantId={participant.id}
            entries={(entries ?? []).filter((e) => e.payrollStaffId === r.payrollStaffId)}
            personal={r.personal}
            poolShare={r.poolShare}
            total={r.total}
          />
        );
      })}

      {computed && computed.rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Allocation summary</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-md border border-border p-3">
                <div className="text-xs text-muted-foreground">New plots sold</div>
                <div className="font-medium tabular-nums">{computed.newPlotsTotal}</div>
              </div>
              <div className="rounded-md border border-border p-3">
                <div className="text-xs text-muted-foreground">Pool total</div>
                <div className="font-medium tabular-nums">{money(computed.poolTotal)}</div>
              </div>
              <div className="rounded-md border border-border p-3">
                <div className="text-xs text-muted-foreground">Total payable</div>
                <div className="font-medium tabular-nums">{money(computed.rows.reduce((s, r) => s + r.total, 0))}</div>
              </div>
            </div>
            <Button onClick={downloadPdf} disabled={downloading || !reportConfig}>
              <Download data-icon="inline-start" />
              {downloading ? "Preparing…" : "Download PDF for the bank"}
            </Button>
          </CardContent>
        </Card>
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
          <p className="text-sm text-muted-foreground">Select a staff member, add their monthly collections, then set the rates and allocate.</p>
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

      {active && <SessionWorkspace sessionId={active.id} period={active.period} sessionName={active.name} settings={active.settings} />}
    </div>
  );
}
