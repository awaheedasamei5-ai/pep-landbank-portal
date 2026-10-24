"use client";

import { CalendarDays } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DateRangePicker } from "@/components/date-range-picker";
import type { DateRange as PickerDateRange } from "react-day-picker";
import { availableYears, type Granularity, type PeriodFilter } from "../lib/periodFilter";
import { isoDateOnly } from "../../../shared/lib/format";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const GRANULARITIES: { value: Granularity; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];

// docs/plans/29-company-leads-full-system-blueprint.md Section 7.1 -- one
// real filter bar shared by the Dashboard, Analytics and Call Log screens,
// translating UNIFIED_CUSTOMER_ENGAGEMENT_SYSTEM.xlsx's own Year + Month
// (0 = all) selector into a real Year/Month/Granularity/custom-range control.
export function PeriodFilterBar({
  filter,
  onChange,
  activityDates,
  className,
  showGranularityTabs = true,
}: {
  filter: PeriodFilter;
  onChange: (next: PeriodFilter) => void;
  activityDates: (string | null | undefined)[];
  className?: string;
  // Dashboard shows a fixed pair of charts (day-by-day + calls-by-month,
  // matching the workbook's own Dashboard tab) rather than a single
  // breakdown chart whose granularity the viewer picks -- so it only needs
  // the Year/Month(=all) pair, not the Day/Week/Month/Year/Custom tabs
  // Analytics and Call Log use to pick which breakdown they're looking at.
  showGranularityTabs?: boolean;
}) {
  const years = availableYears(activityDates);

  function pickerValue(): PickerDateRange | undefined {
    if (filter.granularity !== "custom" || !filter.from) return undefined;
    return { from: new Date(filter.from + "T00:00:00"), to: filter.to ? new Date(filter.to + "T00:00:00") : undefined };
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className ?? ""}`}>
      <CalendarDays className="size-4 text-muted-foreground" aria-hidden="true" />
      {showGranularityTabs && (
        <Tabs value={filter.granularity} onValueChange={(v) => onChange({ ...filter, granularity: v as Granularity })}>
          <TabsList>
            {GRANULARITIES.map((g) => (
              <TabsTrigger key={g.value} value={g.value}>
                {g.label}
              </TabsTrigger>
            ))}
            <TabsTrigger value="custom">Custom</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {filter.granularity !== "custom" && (
        <>
          <Select value={String(filter.year)} onValueChange={(v) => onChange({ ...filter, year: Number(v) })}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {filter.granularity !== "year" && (
            <Select value={String(filter.month)} onValueChange={(v) => onChange({ ...filter, month: v === "all" ? "all" : Number(v) })}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All months</SelectItem>
                {MONTH_NAMES.map((name, i) => (
                  <SelectItem key={name} value={String(i + 1)}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </>
      )}

      {filter.granularity === "custom" && (
        <DateRangePicker
          value={pickerValue()}
          onChange={(range) =>
            onChange({
              ...filter,
              from: range?.from ? isoDateOnly(range.from) : undefined,
              to: range?.to ? isoDateOnly(range.to) : range?.from ? isoDateOnly(range.from) : undefined,
            })
          }
        />
      )}
    </div>
  );
}
