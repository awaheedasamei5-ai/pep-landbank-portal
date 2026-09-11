"use client";

import { useEffect, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ghs, today } from "@/lib/palmstead/format";
import { type PaymentPlan, type PlotType, previewGrandTotal } from "@/lib/palmstead/pipeline-pricing-logic";
import { useAppConfig } from "@/lib/palmstead/use-app-config";
import { useCreateLead } from "@/lib/palmstead/use-create-lead";
import { useAuthStore } from "@/stores/auth/auth-store";

import { PartialPlotAdder } from "./partial-plot-adder";

// Real port of web-next's AddLeadScreen -- same real pricing engine
// (previewGrandTotal, live Net/+Interest/Grand breakdown), same real
// auto-fill-unit-price-until-overridden behavior, same real amt_paid ->
// opening-deposit-payment split, same real partial/irregular-plot
// calculator. Honestly not ported (flagged, not silently dropped): promo
// pricing windows and the banner/referral source sub-flows -- separable
// enhancements on top of the same core create path.
const PRIORITIES = ["High", "Medium", "Low"] as const;
const LEAD_SOURCES = [
  "Banner",
  "Referral",
  "Facebook",
  "Instagram",
  "TikTok",
  "Google",
  "Website",
  "Radio",
  "TV",
  "Other",
] as const;
const inputClass =
  "h-9 w-full rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
const labelClass = "text-xs font-medium text-muted-foreground";

export function AddLeadForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const profile = useAuthStore((s) => s.profile);
  const { data: config } = useAppConfig();
  const createLead = useCreateLead();

  // Client Database's own "+ New deal for this client" row action lands
  // here with the client's name/contact pre-filled via query params --
  // same real intent as web-next's router-state prefill (Master Rebuild
  // Spec 17.2's "new deal" affordance on Customer 360).
  const [name, setName] = useState(searchParams.get("name") ?? "");
  const [contact, setContact] = useState(searchParams.get("contact") ?? "");
  const [date, setDate] = useState(today());
  const [address, setAddress] = useState("");
  const [plotType, setPlotType] = useState<PlotType>("Full Plot");
  const [noPlots, setNoPlots] = useState("1");
  const [noPlotsManuallyEdited, setNoPlotsManuallyEdited] = useState(false);
  const [unitPrice, setUnitPrice] = useState("");
  const [unitPriceManuallyEdited, setUnitPriceManuallyEdited] = useState(false);
  const [discount, setDiscount] = useState("");
  const [paymentPlan, setPaymentPlan] = useState<PaymentPlan>("Full Payment");
  const [depositTarget, setDepositTarget] = useState("");
  const [leadSource, setLeadSource] = useState("");
  const [priority, setPriority] = useState<string>("Low");
  const [nextAction, setNextAction] = useState("");
  const [amtPaid, setAmtPaid] = useState("0");
  const [notes, setNotes] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [depositNotice, setDepositNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!config || unitPriceManuallyEdited) return;
    setUnitPrice(String(plotType === "Half Plot" ? config.halfPrice : config.fullPrice));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, plotType, unitPriceManuallyEdited]);

  useEffect(() => {
    if (noPlotsManuallyEdited) return;
    setNoPlots(plotType === "Half Plot" ? "0.5" : "1");
  }, [plotType, noPlotsManuallyEdited]);

  const canLogDeposit = profile?.role === "manager" || profile?.key === "elias";
  const preview = config
    ? previewGrandTotal(
        config,
        plotType,
        Number(noPlots) || 1,
        Number(unitPrice) || 0,
        discount.trim() ? Number(discount) : null,
        paymentPlan,
      )
    : { net: 0, interest: 0, grand: 0, disc: 0, listPrice: 0 };
  const depositTargetPreview = depositTarget.trim() ? Number(depositTarget) : Math.round(preview.net * 0.3);
  const balanceAfter = Math.max(preview.grand - (Number(amtPaid) || 0), 0);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(null);
    if (!name.trim() || !contact.trim() || !unitPrice) {
      setSaveError("Lead name, contact, and unit price are required.");
      return;
    }
    try {
      const { id, depositError } = await createLead.mutateAsync({
        name: name.trim(),
        contact: contact.trim(),
        date,
        address: address.trim() || undefined,
        plotType,
        noPlots: Number(noPlots) || 1,
        unitPrice: Number(unitPrice) || 0,
        discount: discount.trim() ? Number(discount) : undefined,
        paymentPlan,
        priority: priority || undefined,
        nextAction: nextAction.trim() || undefined,
        notes: notes.trim() || undefined,
        leadSource: leadSource || undefined,
        amtPaid: Number(amtPaid) || 0,
        netTotal: preview.net,
        grandTotal: preview.grand,
        depositTarget: depositTarget.trim() ? Number(depositTarget) : undefined,
      });
      if (depositError) {
        setDepositNotice(depositError);
        return;
      }
      router.push(`/dashboard/pipeline/${id}`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save this lead");
    }
  }

  if (depositNotice) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Lead saved</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-amber-600">{depositNotice}</p>
          <Button onClick={() => router.push("/dashboard/pipeline")}>Back to pipeline</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 md:gap-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Add to pipeline</h1>
        <p className="text-muted-foreground text-sm">Saved straight into the pipeline.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Client</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <span className={labelClass}>Lead name *</span>
                <input
                  className={inputClass}
                  placeholder="e.g. Kwame Mensah"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className={labelClass}>Contact *</span>
                <input
                  className={inputClass}
                  placeholder="e.g. +233 24 400 1234"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className={labelClass}>Date added</span>
                <input className={inputClass} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className={labelClass}>Address</span>
                <input
                  className={inputClass}
                  placeholder="Client's physical address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Plot &amp; pricing</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <span className={labelClass}>Plot type</span>
                <select
                  className={inputClass}
                  value={plotType}
                  onChange={(e) => setPlotType(e.target.value as PlotType)}
                >
                  <option>Full Plot</option>
                  <option>Half Plot</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className={labelClass}>No. of plots</span>
                <input
                  className={inputClass}
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={noPlots}
                  onChange={(e) => {
                    setNoPlotsManuallyEdited(true);
                    setNoPlots(e.target.value);
                  }}
                />
              </div>
              {config && (
                <div className="sm:col-span-2">
                  <PartialPlotAdder
                    config={config}
                    plotType={plotType}
                    onAdd={(eq) => {
                      setNoPlotsManuallyEdited(true);
                      setNoPlots(String(Math.round((Number(noPlots || 0) + eq) * 100) / 100));
                    }}
                  />
                </div>
              )}
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <span className={labelClass}>Unit price (GHS) *</span>
                <input
                  className={inputClass}
                  type="number"
                  value={unitPrice}
                  onChange={(e) => {
                    setUnitPriceManuallyEdited(true);
                    setUnitPrice(e.target.value);
                  }}
                />
                {config && (
                  <p className="text-xs text-muted-foreground">
                    Standard rate: Full Plot {ghs(config.fullPrice)} · Half Plot {ghs(config.halfPrice)}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <span className={labelClass}>Discount (GHS)</span>
                <input
                  className={inputClass}
                  type="number"
                  placeholder="Leave blank to use standard rate"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className={labelClass}>Payment plan</span>
                <select
                  className={inputClass}
                  value={paymentPlan}
                  onChange={(e) => setPaymentPlan(e.target.value as PaymentPlan)}
                >
                  <option>Full Payment</option>
                  <option>3 Months</option>
                  <option>6 Months</option>
                  <option>9 Months</option>
                  <option>12 Months</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <span className={labelClass}>Deposit target (GHS)</span>
                <input
                  className={inputClass}
                  type="number"
                  placeholder={`auto = 30% (${ghs(depositTargetPreview)})`}
                  value={depositTarget}
                  onChange={(e) => setDepositTarget(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Only matters on an installment plan — the monthly schedule begins once this is fully paid.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Where did they hear about us?</CardTitle>
            </CardHeader>
            <CardContent>
              <select className={inputClass} value={leadSource} onChange={(e) => setLeadSource(e.target.value)}>
                <option value="">Select…</option>
                {LEAD_SOURCES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Total</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Net total</span>
                <span className="tabular-nums">{ghs(preview.net)}</span>
              </div>
              {preview.interest > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">+ Interest ({paymentPlan})</span>
                  <span className="tabular-nums">{ghs(preview.interest)}</span>
                </div>
              )}
              <div className="mt-1 border-t pt-2">
                <div className="text-xs text-muted-foreground">Grand total</div>
                <div className="font-semibold text-2xl tabular-nums">{ghs(preview.grand)}</div>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Deposit target</span>
                <span className="tabular-nums">{ghs(depositTargetPreview)}</span>
              </div>
              {canLogDeposit && Number(amtPaid) > 0 && (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Paid now</span>
                    <span className="tabular-nums">{ghs(Number(amtPaid))}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Balance</span>
                    <span className="tabular-nums">{ghs(balanceAfter)}</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <span className={labelClass}>Priority</span>
                <select className={inputClass} value={priority} onChange={(e) => setPriority(e.target.value)}>
                  <option value="">Not set</option>
                  {PRIORITIES.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className={labelClass}>Next action</span>
                <input
                  className={inputClass}
                  placeholder="e.g. Follow up Monday"
                  value={nextAction}
                  onChange={(e) => setNextAction(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {canLogDeposit && (
            <Card>
              <CardHeader>
                <CardTitle>Deposit</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1.5">
                <span className={labelClass}>Amount already paid</span>
                <input
                  className={inputClass}
                  type="number"
                  value={amtPaid}
                  onChange={(e) => setAmtPaid(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Recorded as a real payment against this lead.</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="Context, preferences, history…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {saveError && <p className="text-sm text-destructive">{saveError}</p>}
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" onClick={() => router.push("/dashboard/pipeline")}>
          Cancel
        </Button>
        <Button type="submit" disabled={createLead.isPending}>
          {createLead.isPending ? "Saving…" : "Save lead"}
        </Button>
      </div>
    </form>
  );
}
