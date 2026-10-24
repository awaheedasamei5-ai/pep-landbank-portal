"use client";

import { useMemo, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Check, Info, Pause, Play, Plus, ShieldCheck } from "lucide-react";

import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSupabase } from "@/lib/supabase.client";
import { useAuthStore } from "@/stores/auth/auth-store";

type ApprovedPaymentDate = { payment_date: string; status: string };
type CandidateRaw = {
  id: string;
  name: string;
  contact: string | null;
  agent_key: string;
  payment_plan: string | null;
  grand_total: number | null;
  net_total: number | null;
  deposit_target: number | null;
  amt_paid: number | null;
  balance: number | null;
  payments: ApprovedPaymentDate[] | null;
};
type InstallmentRaw = {
  installment_no: number;
  due_date: string;
  due_amount: number;
  paid_amount: number;
  status: "scheduled" | "part_paid" | "paid" | "cancelled";
};
type ScheduleRaw = {
  id: string;
  lead_id: string;
  plan_months: number;
  first_payment_date: string;
  sms_reminders_enabled: boolean;
  sms_consent_recorded_at: string | null;
  sms_consent_revoked_at: string | null;
  sms_consent_phone: string | null;
  status: "active" | "paused" | "completed" | "review_required" | "superseded";
  created_at: string;
  leads:
    | { name: string; agent_key: string; contact: string | null }
    | { name: string; agent_key: string; contact: string | null }[]
    | null;
  finance_monthly_payment_installments: InstallmentRaw[] | null;
  finance_monthly_payment_reminder_outbox:
    | { status: string; created_at: string; provider_accepted_at: string | null }[]
    | null;
};
type ScheduleView = ScheduleRaw & {
  clientName: string;
  agentKey: string;
  contact: string | null;
  next: InstallmentRaw | null;
  latestReminder: { status: string; created_at: string; provider_accepted_at: string | null } | null;
};

const PLAN_MONTHS: Record<string, number> = { "3 Months": 3, "6 Months": 6, "9 Months": 9, "12 Months": 12 };

function ghs(value: number): string {
  return `GHS ${value.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dateLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(`${value}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function anchoredDueDate(firstPaymentDate: string, offset: number): string {
  const [year, month, day] = firstPaymentDate.split("-").map(Number);
  const targetMonth = month - 1 + offset;
  const targetYear = year + Math.floor(targetMonth / 12);
  const normalizedMonth = targetMonth % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  return `${targetYear}-${String(normalizedMonth + 1).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

function firstApprovedDate(row: CandidateRaw): string | null {
  return (
    (row.payments ?? [])
      .filter((payment) => payment.status === "approved")
      .map((payment) => payment.payment_date)
      .sort()[0] ?? null
  );
}

function monthlyAmount(row: CandidateRaw): number {
  const months = PLAN_MONTHS[row.payment_plan ?? ""] ?? 0;
  if (!months || row.grand_total == null) return 0;
  const fallbackDeposit = Math.round((row.net_total ?? row.grand_total) * 0.3);
  const deposit = Math.min(row.grand_total, Math.max(0, row.deposit_target ?? fallbackDeposit));
  return Math.round((row.grand_total - deposit) / months);
}

function friendlyError(error: unknown): string {
  return error instanceof Error ? error.message : "The schedule could not be saved. Try again.";
}

function LatestReminder({ schedule }: { schedule: ScheduleView }) {
  const validPhone = /^0\d{9}$|^233\d{9}$/.test((schedule.contact ?? "").replace(/\D/g, ""));
  const digits = (schedule.contact ?? "").replace(/\D/g, "");
  const normalized = digits.startsWith("0") ? `233${digits.slice(1)}` : digits;
  if (schedule.sms_reminders_enabled && (!validPhone || normalized !== schedule.sms_consent_phone)) {
    return <span className="text-destructive text-xs">Phone needs review</span>;
  }
  if (!schedule.latestReminder) return <span className="text-muted-foreground text-xs">None yet</span>;
  if (schedule.latestReminder.status === "accepted") {
    return <span className="text-emerald-700 text-xs dark:text-emerald-400">Accepted by provider</span>;
  }
  if (schedule.latestReminder.status === "needs_review") {
    return <span className="text-destructive text-xs">Needs review</span>;
  }
  return <span className="text-muted-foreground text-xs">{schedule.latestReminder.status.replaceAll("_", " ")}</span>;
}

function useMonthlySchedules() {
  return useQuery({
    queryKey: ["finance-monthly-schedules"],
    queryFn: async (): Promise<ScheduleView[]> => {
      const { data, error } = await requireSupabase()
        .from("finance_monthly_payment_schedules")
        .select(
          "id,lead_id,plan_months,first_payment_date,sms_reminders_enabled,sms_consent_recorded_at,sms_consent_revoked_at,sms_consent_phone,status,created_at,leads(name,agent_key,contact),finance_monthly_payment_installments(installment_no,due_date,due_amount,paid_amount,status),finance_monthly_payment_reminder_outbox(status,created_at,provider_accepted_at)",
        )
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return ((data ?? []) as unknown as ScheduleRaw[]).map((row) => {
        const lead = Array.isArray(row.leads) ? row.leads[0] : row.leads;
        const installments = row.finance_monthly_payment_installments ?? [];
        const deliveries = row.finance_monthly_payment_reminder_outbox ?? [];
        const next =
          installments
            .filter((item) => item.status === "scheduled" || item.status === "part_paid")
            .sort((a, b) => a.due_date.localeCompare(b.due_date))[0] ?? null;
        const latestReminder = deliveries.sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
        return {
          ...row,
          clientName: lead?.name ?? "Client",
          agentKey: lead?.agent_key ?? "—",
          contact: lead?.contact ?? null,
          next,
          latestReminder,
        };
      });
    },
  });
}

function useMonthlyCandidates(enabled: boolean) {
  return useQuery({
    queryKey: ["finance-monthly-plan-candidates"],
    enabled,
    queryFn: async (): Promise<CandidateRaw[]> => {
      const { data, error } = await requireSupabase()
        .from("leads")
        .select(
          "id,name,contact,agent_key,payment_plan,grand_total,net_total,deposit_target,amt_paid,balance,payments(payment_date,status)",
        )
        .is("deleted_at", null)
        .in("payment_plan", Object.keys(PLAN_MONTHS))
        .order("name", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as CandidateRaw[];
    },
  });
}

export function MonthlyPlansPanel() {
  const profile = useAuthStore((state) => state.profile);
  const manager = profile?.role === "manager";
  const queryClient = useQueryClient();
  const schedules = useMonthlySchedules();
  const candidates = useMonthlyCandidates(manager);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState("");
  const [contractVerified, setContractVerified] = useState(false);
  const [smsConsent, setSmsConsent] = useState(false);
  const [consentTarget, setConsentTarget] = useState<ScheduleView | null>(null);
  const [enableConsentConfirmed, setEnableConsentConfirmed] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const createSchedule = useMutation({
    mutationFn: async () => {
      const { data, error } = await requireSupabase().rpc("create_finance_monthly_payment_schedule", {
        p_lead_id: selectedLeadId,
        p_sms_consent: smsConsent,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      setCreateOpen(false);
      setSelectedLeadId("");
      setContractVerified(false);
      setSmsConsent(false);
      setErrorText(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["finance-monthly-schedules"] }),
        queryClient.invalidateQueries({ queryKey: ["finance-monthly-plan-candidates"] }),
      ]);
    },
    onError: (error) => setErrorText(friendlyError(error)),
  });

  const updateReminder = useMutation({
    mutationFn: async ({ scheduleId, enabled }: { scheduleId: string; enabled: boolean }) => {
      const { error } = await requireSupabase().rpc("set_finance_monthly_payment_reminders", {
        p_schedule_id: scheduleId,
        p_enabled: enabled,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setConsentTarget(null);
      setEnableConsentConfirmed(false);
      setErrorText(null);
      await queryClient.invalidateQueries({ queryKey: ["finance-monthly-schedules"] });
    },
    onError: (error) => setErrorText(friendlyError(error)),
  });

  const eligible = useMemo(() => {
    const existing = new Map((schedules.data ?? []).map((schedule) => [schedule.lead_id, schedule.status]));
    return (candidates.data ?? []).filter((row) => {
      const scheduleState = existing.get(row.id);
      return (
        (!scheduleState || scheduleState === "review_required") &&
        Boolean(firstApprovedDate(row)) &&
        Number(row.grand_total) > Number(row.amt_paid ?? 0) &&
        monthlyAmount(row) > 0
      );
    });
  }, [candidates.data, schedules.data]);
  const selectedLead = eligible.find((lead) => lead.id === selectedLeadId) ?? null;
  const anchor = selectedLead ? firstApprovedDate(selectedLead) : null;
  const planMonths = selectedLead ? PLAN_MONTHS[selectedLead.payment_plan ?? ""] : 0;
  const firstDue = anchor && planMonths ? anchoredDueDate(anchor, 1) : null;
  const monthlyDue = selectedLead ? monthlyAmount(selectedLead) : 0;

  if (schedules.isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (schedules.error) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-destructive text-sm">
          Monthly schedules could not be loaded. {friendlyError(schedules.error)}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex items-start gap-3 p-4">
          <Info className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="min-w-0 text-sm">
            <p className="font-medium">Dates follow the client’s first approved payment.</p>
            <p className="mt-1 text-muted-foreground">
              The next instalment is due on that same calendar day each month. In shorter months it falls on the final
              day. SMS reminders are sent seven days before the due date in Ghana time, only when Management has
              recorded the client’s permission.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="size-4" /> Monthly instalments
            </CardTitle>
            <CardDescription>
              Contract-based schedules, upcoming due dates and consent-controlled reminders.
            </CardDescription>
          </div>
          {manager && (
            <Dialog
              open={createOpen}
              onOpenChange={(open) => {
                setCreateOpen(open);
                if (!open) {
                  setErrorText(null);
                  setContractVerified(false);
                  setSmsConsent(false);
                }
              }}
            >
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus data-icon="inline-start" /> Add schedule
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Set up a monthly payment schedule</DialogTitle>
                </DialogHeader>
                {(() => {
                  if (candidates.isLoading) return <Skeleton className="h-10 w-full" />;
                  if (candidates.error) {
                    return (
                      <p className="text-destructive text-sm">
                        Client list could not be loaded. {friendlyError(candidates.error)}
                      </p>
                    );
                  }
                  if (eligible.length === 0) {
                    return (
                      <p className="rounded-md bg-muted p-3 text-muted-foreground text-sm">
                        No unscheduled clients with a clear monthly plan, an approved first payment and an outstanding
                        balance were found.
                      </p>
                    );
                  }
                  return (
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="monthly-plan-client">Client</Label>
                        <Select
                          value={selectedLeadId}
                          onValueChange={(value) => {
                            setSelectedLeadId(value);
                            setErrorText(null);
                          }}
                        >
                          <SelectTrigger id="monthly-plan-client">
                            <SelectValue placeholder="Choose a client" />
                          </SelectTrigger>
                          <SelectContent>
                            {eligible.map((lead) => (
                              <SelectItem key={lead.id} value={lead.id}>
                                {lead.name} · {lead.payment_plan}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {selectedLead && anchor && firstDue && (
                        <div className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-muted/30 p-3 text-sm sm:grid-cols-2">
                          <div>
                            <span className="text-muted-foreground">Plan</span>
                            <div className="font-medium">{selectedLead.payment_plan}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Contract total</span>
                            <div className="font-medium">{ghs(Number(selectedLead.grand_total))}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">First approved payment</span>
                            <div className="font-medium">{dateLabel(anchor)}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">First due date</span>
                            <div className="font-medium">{dateLabel(firstDue)}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Estimated monthly amount</span>
                            <div className="font-medium">{ghs(monthlyDue)} · last payment adjusts rounding</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Balance</span>
                            <div className="font-medium">
                              {ghs(
                                Number(
                                  selectedLead.balance ??
                                    Number(selectedLead.grand_total) - Number(selectedLead.amt_paid ?? 0),
                                ),
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                      <div className="flex items-start gap-2 text-sm leading-5">
                        <Checkbox
                          id="monthly-plan-contract-verified"
                          checked={contractVerified}
                          onCheckedChange={(value) => setContractVerified(value === true)}
                          className="mt-0.5"
                        />
                        <Label htmlFor="monthly-plan-contract-verified" className="font-normal leading-5">
                          I checked this schedule against the signed agreement and the recorded Finance terms.
                        </Label>
                      </div>
                      <div className="flex items-start gap-2 text-sm leading-5">
                        <Checkbox
                          id="monthly-plan-sms-consent"
                          checked={smsConsent}
                          onCheckedChange={(value) => setSmsConsent(value === true)}
                          className="mt-0.5"
                        />
                        <Label htmlFor="monthly-plan-sms-consent" className="font-normal leading-5">
                          The client has agreed to receive an SMS seven days before each unpaid monthly instalment.
                        </Label>
                      </div>
                      {errorText && (
                        <p role="alert" className="text-destructive text-sm">
                          {errorText}
                        </p>
                      )}
                    </div>
                  );
                })()}
                <DialogFooter>
                  <SubmitButton
                    onClick={() => createSchedule.mutate()}
                    loading={createSchedule.isPending}
                    disabled={!selectedLead || !contractVerified || eligible.length === 0}
                  >
                    Save schedule
                  </SubmitButton>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {(schedules.data ?? []).length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <CalendarClock className="size-8 text-muted-foreground" />
              <p className="font-medium">No monthly schedules yet</p>
              <p className="max-w-md text-muted-foreground text-sm">
                {manager
                  ? "Enroll a client after checking the signed payment terms. Legacy or unclear plan values are left for manual review."
                  : "Your assigned clients’ monthly schedules will appear here when Management sets them up."}
              </p>
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>First payment</TableHead>
                    <TableHead>Next instalment</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>SMS reminder</TableHead>
                    {manager && <TableHead>Latest delivery</TableHead>}
                    {manager && <TableHead className="text-right">Action</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(schedules.data ?? []).map((row) => {
                    const installments = row.finance_monthly_payment_installments ?? [];
                    const paidCount = installments.filter((item) => item.status === "paid").length;
                    const smsLabel = row.sms_reminders_enabled ? "On" : "Off";
                    return (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div className="font-medium">{row.clientName}</div>
                          <div className="text-muted-foreground text-xs">Salesperson: {row.agentKey}</div>
                        </TableCell>
                        <TableCell>{row.plan_months} months</TableCell>
                        <TableCell>{dateLabel(row.first_payment_date)}</TableCell>
                        <TableCell>
                          {row.next ? (
                            <>
                              <div className="flex flex-wrap items-center gap-1.5 font-medium">
                                {dateLabel(row.next.due_date)}
                                {row.next.due_date < new Date().toISOString().slice(0, 10) && (
                                  <Badge variant="destructive">Overdue</Badge>
                                )}
                              </div>
                              <div className="text-muted-foreground text-xs">
                                {ghs(Math.max(0, Number(row.next.due_amount) - Number(row.next.paid_amount)))} remaining
                              </div>
                            </>
                          ) : (
                            <span className="text-muted-foreground">No remaining instalments</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {row.status === "completed" && <Badge>Complete</Badge>}
                          {row.status === "superseded" && <Badge variant="outline">Replaced</Badge>}
                          {row.status !== "completed" && row.status !== "superseded" && (
                            <span>
                              {paidCount} / {row.plan_months} paid
                            </span>
                          )}
                          {row.status === "review_required" && (
                            <Badge variant="destructive" className="ml-1">
                              Review
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={row.sms_reminders_enabled ? "default" : "outline"}>{smsLabel}</Badge>
                          {row.sms_consent_revoked_at && (
                            <div className="mt-1 text-muted-foreground text-xs">
                              Permission withdrawn {dateLabel(row.sms_consent_revoked_at.slice(0, 10))}
                            </div>
                          )}
                        </TableCell>
                        {manager && (
                          <TableCell>
                            <LatestReminder schedule={row} />
                          </TableCell>
                        )}
                        {manager && (
                          <TableCell className="text-right">
                            {row.status === "active" &&
                              (row.sms_reminders_enabled ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={updateReminder.isPending}
                                  onClick={() => updateReminder.mutate({ scheduleId: row.id, enabled: false })}
                                >
                                  <Pause data-icon="inline-start" /> Turn off
                                </Button>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={updateReminder.isPending}
                                  onClick={() => {
                                    setConsentTarget(row);
                                    setEnableConsentConfirmed(false);
                                  }}
                                >
                                  <Play data-icon="inline-start" /> Enable SMS
                                </Button>
                              ))}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-start gap-2 text-muted-foreground text-xs">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
        {manager
          ? "Approved payments are matched against unpaid instalments in due-date order. A correction to a posted payment pauses reminders and flags the schedule for review."
          : "Only schedules for your assigned clients are visible."}
      </div>
      {errorText && !createOpen && (
        <p role="alert" className="text-destructive text-sm">
          {errorText}
        </p>
      )}

      <Dialog
        open={Boolean(consentTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setConsentTarget(null);
            setEnableConsentConfirmed(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enable client SMS reminders</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            A reminder will be sent to the mobile number on the client record seven days before each unpaid instalment.
            Confirm permission before enabling.
          </p>
          <div className="flex items-start gap-2 text-sm leading-5">
            <Checkbox
              id="monthly-plan-enable-sms-consent"
              checked={enableConsentConfirmed}
              onCheckedChange={(value) => setEnableConsentConfirmed(value === true)}
              className="mt-0.5"
            />
            <Label htmlFor="monthly-plan-enable-sms-consent" className="font-normal leading-5">
              I confirm the client has agreed to these payment reminder texts.
            </Label>
          </div>
          {errorText && (
            <p role="alert" className="text-destructive text-sm">
              {errorText}
            </p>
          )}
          <DialogFooter>
            <SubmitButton
              loading={updateReminder.isPending}
              disabled={!enableConsentConfirmed || !consentTarget}
              onClick={() => consentTarget && updateReminder.mutate({ scheduleId: consentTarget.id, enabled: true })}
            >
              <Check data-icon="inline-start" /> Enable reminders
            </SubmitButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

