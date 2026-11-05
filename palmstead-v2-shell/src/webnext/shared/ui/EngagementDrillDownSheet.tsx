"use client";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { EngagementDrillDownEntry } from "../hooks/useEngagementDashboard";
import { fmtLongDate, ghs } from "../lib/format";
import styles from "./EngagementDrillDownSheet.module.css";

// Phase A, docs/plans/43-site-manager-report-and-client-id-integration-master-plan.md
// -- a real tile click now opens the actual underlying rows for that metric
// within the currently-selected period (present or past, whatever the panel's
// own EngagementPeriodFilterBar has set). Shared across Pipeline/Client
// Database/Company Leads since they all render the same EngagementDashboardPanel.
export function EngagementDrillDownSheet({
  entry,
  periodLabel,
  onOpenChange,
}: {
  entry: EngagementDrillDownEntry | null;
  periodLabel: string;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={entry !== null} onOpenChange={onOpenChange}>
      <SheetContent side="right" className={styles.content}>
        <SheetHeader>
          <SheetTitle>{entry?.label ?? ""}</SheetTitle>
          <SheetDescription>
            {periodLabel} · {entry?.rows.length ?? 0} {entry?.rows.length === 1 ? "record" : "records"}
          </SheetDescription>
        </SheetHeader>
        <div className={styles.list}>
          {entry && entry.rows.length === 0 && <p className={styles.empty}>No records for this period.</p>}
          {entry?.kind === "activity" &&
            entry.rows.map((r) => (
              <div key={r.id} className={styles.row}>
                <div className={styles.rowTitle}>{r.client}</div>
                <div className={styles.rowMeta}>
                  {r.action}
                  {r.outcome ? ` — ${r.outcome}` : ""}
                </div>
                <div className={styles.rowDate}>{fmtLongDate(r.createdAt)}</div>
              </div>
            ))}
          {entry?.kind === "visits" &&
            entry.rows.map((r) => (
              <div key={r.id} className={styles.row}>
                <div className={styles.rowTitle}>{r.name}</div>
                <div className={styles.rowMeta}>
                  {r.site}
                  {r.plot ? ` · ${r.plot}` : ""}
                </div>
                <div className={styles.rowDate}>{fmtLongDate(r.visitDate)}</div>
              </div>
            ))}
          {entry?.kind === "leads" &&
            entry.rows.map((r) => (
              <div key={r.id} className={styles.row}>
                <div className={styles.rowTitle}>{r.name}</div>
                <div className={styles.rowMeta}>
                  {r.stage} · {ghs(r.amtPaid)} / {ghs(r.grandTotal)}
                </div>
                <div className={styles.rowDate}>{fmtLongDate(r.date)}</div>
              </div>
            ))}
          {entry?.kind === "payments" &&
            entry.rows.map((r) => (
              <div key={r.id} className={styles.row}>
                <div className={styles.rowTitle}>{r.clientName ?? "—"}</div>
                <div className={styles.rowMeta}>
                  {ghs(r.amount)}
                  {r.paymentMethod ? ` · ${r.paymentMethod}` : ""}
                </div>
                <div className={styles.rowDate}>{fmtLongDate(r.date)}</div>
              </div>
            ))}
          {entry?.kind === "followUps" &&
            entry.rows.map((r) => (
              <div key={r.leadId} className={styles.row}>
                <div className={styles.rowTitle}>{r.client}</div>
                <div className={`${styles.rowMeta} ${r.overdue ? styles.rowMetaWarn : ""}`}>{r.overdue ? "Overdue" : "Due"}</div>
                <div className={styles.rowDate}>{fmtLongDate(r.follow)}</div>
              </div>
            ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
