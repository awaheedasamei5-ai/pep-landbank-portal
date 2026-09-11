"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  emptyTechLot,
  type TechLot,
  type TechLotShape,
  techBaseAreaSqft,
  techCustomLotArea,
} from "@/lib/palmstead/partial-plot-logic";
import type { AppConfigSubset } from "@/lib/palmstead/use-app-config";

const inputClass =
  "h-9 w-full rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

function sqft(x: number): string {
  return `${x.toLocaleString("en-US", { maximumFractionDigits: 0 })} sq ft`;
}

// Real port of web-next's PartialPlotAdder -- a client standing in front
// of an irregular/partial lot shouldn't have a guessed decimal typed into
// "No. of plots"; this reuses Technical Quotation's own area math
// (techBaseAreaSqft/techCustomLotArea) to turn real dimensions into an
// exact plot-equivalent, then adds it into noPlots. Used by both Add Lead
// and the lead detail Plot & Pricing edit, same as web-next.
export function PartialPlotAdder({
  config,
  plotType,
  onAdd,
}: {
  config: AppConfigSubset;
  plotType: "Full Plot" | "Half Plot";
  onAdd: (equivalentPlots: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [lots, setLots] = useState<TechLot[]>([emptyTechLot()]);

  const baseArea = techBaseAreaSqft(config);
  const combinedArea = lots.reduce((s, l) => s + techCustomLotArea(l), 0);
  const equivalent = baseArea > 0 ? combinedArea / baseArea : 0;

  function updateLot(i: number, patch: Partial<TechLot>) {
    setLots((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  if (!open) {
    return (
      <button
        type="button"
        className="w-fit text-primary text-xs underline-offset-2 hover:underline"
        onClick={() => setOpen(true)}
      >
        + Partial / irregular plot in front of them?
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border bg-muted/40 p-3">
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm">Partial plot calculator</span>
        <button type="button" className="text-muted-foreground text-xs hover:underline" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      <p className="text-muted-foreground text-xs">
        Enter the actual dimensions in front of the client — this works out how much of a standard Full Plot (
        {sqft(baseArea)}) that is, so the plot count stays exact
        {plotType === "Half Plot" ? " (a Half Plot is 0.5 of that)" : ""}.
      </p>
      {lots.map((lot, i) => (
        <PartialLotRow
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-position calculator rows, never reordered -- only appended/removed from the end.
          key={i}
          lot={lot}
          onChange={(patch) => updateLot(i, patch)}
          onRemove={lots.length > 1 ? () => setLots((prev) => prev.filter((_, idx) => idx !== i)) : undefined}
        />
      ))}
      <button
        type="button"
        className="w-fit text-primary text-xs underline-offset-2 hover:underline"
        onClick={() => setLots((prev) => [...prev, emptyTechLot()])}
      >
        + Add another lot
      </button>
      <div className="flex items-center justify-between gap-3 border-t pt-2">
        <span className="text-sm">
          {sqft(combinedArea)} total &asymp; <strong>{equivalent.toFixed(2)}</strong> plot-equivalents
        </span>
        <Button
          type="button"
          size="sm"
          disabled={equivalent <= 0}
          onClick={() => {
            onAdd(Math.round(equivalent * 100) / 100);
            setLots([emptyTechLot()]);
            setOpen(false);
          }}
        >
          Add to plot count
        </Button>
      </div>
    </div>
  );
}

function PartialLotRow({
  lot,
  onChange,
  onRemove,
}: {
  lot: TechLot;
  onChange: (patch: Partial<TechLot>) => void;
  onRemove?: () => void;
}) {
  const isTrap = lot.shape === "trapezoidal";
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <select
          className={`${inputClass} w-auto`}
          value={lot.shape}
          onChange={(e) => onChange({ shape: e.target.value as TechLotShape })}
        >
          <option value="rectangular">Rectangular</option>
          <option value="trapezoidal">Trapezoidal</option>
        </select>
        {isTrap ? (
          <>
            <input
              className={`${inputClass} w-28`}
              type="number"
              min={0}
              placeholder="Side A (ft)"
              value={lot.a}
              onChange={(e) => onChange({ a: e.target.value === "" ? "" : Number(e.target.value) })}
            />
            <input
              className={`${inputClass} w-28`}
              type="number"
              min={0}
              placeholder="Side B (ft)"
              value={lot.b}
              onChange={(e) => onChange({ b: e.target.value === "" ? "" : Number(e.target.value) })}
            />
            <input
              className={`${inputClass} w-28`}
              type="number"
              min={0}
              placeholder="Height (ft)"
              value={lot.h}
              onChange={(e) => onChange({ h: e.target.value === "" ? "" : Number(e.target.value) })}
            />
          </>
        ) : (
          <>
            <input
              className={`${inputClass} w-28`}
              type="number"
              min={0}
              placeholder="Length (ft)"
              value={lot.len}
              onChange={(e) => onChange({ len: e.target.value === "" ? "" : Number(e.target.value) })}
            />
            <input
              className={`${inputClass} w-28`}
              type="number"
              min={0}
              placeholder="Width (ft)"
              value={lot.wid}
              onChange={(e) => onChange({ wid: e.target.value === "" ? "" : Number(e.target.value) })}
            />
          </>
        )}
        {onRemove && (
          <button
            type="button"
            className="text-muted-foreground text-xs hover:text-destructive"
            onClick={onRemove}
            aria-label="Remove lot"
          >
            ✕
          </button>
        )}
      </div>
      <div className="text-muted-foreground text-xs">{sqft(techCustomLotArea(lot))}</div>
    </div>
  );
}
