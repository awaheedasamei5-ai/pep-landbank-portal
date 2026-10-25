"use client";

import Link from "next/link";

import { AlertTriangle, ArrowUpRight } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { clientKey } from "../../clients/lib/groupClients";
import type { PaymentReconciliationItem } from "../hooks/useDataCheck";

const money = (value: number) =>
  `GHS ${value.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function PaymentReconciliation({
  items,
  loading,
  error,
}: {
  items: PaymentReconciliationItem[];
  loading: boolean;
  error: Error | null;
}) {
  return (
    <section aria-labelledby="payment-reconciliation-title" className="mb-6 flex flex-col gap-4">
      <div>
        <h2 id="payment-reconciliation-title" className="font-heading text-lg font-semibold">
          Payment balance review
        </h2>
        <p className="text-sm text-muted-foreground">
          Compare each pipeline balance with approved payment entries before correcting a record or issuing a receipt.
        </p>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Payment records could not be loaded</AlertTitle>
          <AlertDescription>
            Refresh this page before reviewing balances. An empty list here would be incomplete.
          </AlertDescription>
        </Alert>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">Checking approved payments…</p>
      ) : items.length === 0 ? (
        <Card size="sm">
          <CardContent>
            <p className="text-sm text-muted-foreground">No balance differences found in the visible pipeline.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-sm font-medium">
            {items.length} {items.length === 1 ? "lead needs" : "leads need"} review
          </p>
          <div className="flex flex-col gap-3">
            {items.map((item) => (
              <ReconciliationRecord key={item.lead.id} item={item} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function ReconciliationRecord({ item }: { item: PaymentReconciliationItem }) {
  const { lead, ownerName, approvedPayments, approvedTotal, difference } = item;
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{lead.name}</CardTitle>
        <CardDescription>
          Pipeline owner: {ownerName} · Lead {lead.id}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <dl className="grid gap-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Recorded paid</dt>
            <dd className="font-medium tabular-nums">{money(lead.amtPaid)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Approved entries</dt>
            <dd className="font-medium tabular-nums">{money(approvedTotal)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Difference</dt>
            <dd className="font-medium tabular-nums text-destructive">
              {money(Math.abs(difference))} {difference > 0 ? "higher on lead" : "higher in entries"}
            </dd>
          </div>
        </dl>
        <details className="rounded-md border px-3 py-2 text-sm">
          <summary className="cursor-pointer font-medium">
            Review {approvedPayments.length} approved {approvedPayments.length === 1 ? "entry" : "entries"}
          </summary>
          {approvedPayments.length === 0 ? (
            <p className="mt-2 text-muted-foreground">
              No approved payment entries are linked to this lead. Check legacy opening balances and the source records.
            </p>
          ) : (
            <ul className="mt-2 divide-y">
              {approvedPayments.map((payment) => (
                <li key={payment.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p>
                      {payment.date} · {payment.paymentMethod ?? "Method not recorded"}
                    </p>
                    <p className="break-all text-xs text-muted-foreground">
                      {payment.referenceNumber
                        ? `Reference ${payment.referenceNumber}`
                        : payment.receiptNumber
                          ? `Receipt ${payment.receiptNumber}`
                          : "No reference on file"}
                      {payment.approvalSnapshotIsLegacy ? " · Legacy entry" : ""}
                    </p>
                  </div>
                  <span className="font-medium tabular-nums">{money(payment.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </details>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Review source before adjustment</Badge>
          <Button asChild variant="outline" size="sm">
            <Link href={`/dashboard/clients/${encodeURIComponent(clientKey(lead.name, lead.contact))}`}>
              Client history <ArrowUpRight data-icon="inline-end" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/dashboard/pipeline/${lead.id}`}>
              Pipeline record <ArrowUpRight data-icon="inline-end" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
