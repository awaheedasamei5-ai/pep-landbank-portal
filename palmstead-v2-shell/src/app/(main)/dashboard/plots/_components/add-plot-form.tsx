"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useCreatePlot } from "@/lib/palmstead/use-plots";

const inputClass =
  "h-9 w-full rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

// Real port of web-next's PlotInventoryScreen AddPlotForm -- new plots
// always start Available, matching production.
export function AddPlotForm({ defaultSite, onDone }: { defaultSite: string; onDone: () => void }) {
  const create = useCreatePlot();
  const [plotNumber, setPlotNumber] = useState("");
  const [section, setSection] = useState("");
  const [plotType, setPlotType] = useState<"Full Plot" | "Half Plot" | "Partial Plot">("Full Plot");
  const [price, setPrice] = useState("");
  const [widthFt, setWidthFt] = useState("");
  const [lengthFt, setLengthFt] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!plotNumber.trim()) {
      setError("Enter a plot number");
      return;
    }
    setError(null);
    try {
      await create.mutateAsync({
        site: defaultSite,
        section: section.trim() || null,
        plotNumber: plotNumber.trim(),
        plotType,
        status: "Available",
        price: price ? Number(price) : null,
        widthFt: widthFt ? Number(widthFt) : null,
        lengthFt: lengthFt ? Number(lengthFt) : null,
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add plot");
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-6">
        <div className="grid grid-cols-2 gap-3">
          <input
            className={inputClass}
            placeholder="Plot number, e.g. B14"
            value={plotNumber}
            onChange={(e) => setPlotNumber(e.target.value)}
          />
          <input
            className={inputClass}
            placeholder="Section/block, e.g. B"
            value={section}
            onChange={(e) => setSection(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <select
            className={inputClass}
            value={plotType}
            onChange={(e) => setPlotType(e.target.value as typeof plotType)}
          >
            <option>Full Plot</option>
            <option>Half Plot</option>
            <option>Partial Plot</option>
          </select>
          <input
            className={inputClass}
            type="number"
            placeholder="Price (GHS, optional)"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input
            className={inputClass}
            type="number"
            placeholder="Width (ft, optional)"
            value={widthFt}
            onChange={(e) => setWidthFt(e.target.value)}
          />
          <input
            className={inputClass}
            type="number"
            placeholder="Length (ft, optional)"
            value={lengthFt}
            onChange={(e) => setLengthFt(e.target.value)}
          />
        </div>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <Button type="button" disabled={create.isPending} onClick={submit}>
          {create.isPending ? "Adding…" : "Add plot"}
        </Button>
      </CardContent>
    </Card>
  );
}
