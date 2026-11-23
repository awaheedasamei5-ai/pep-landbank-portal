"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, MapPinned } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useBanners } from "@/webnext/features/banners/hooks/useBanners";
import { BANNER_STATUS, ensureLeafletLoaded, validBannerCoordinates, type LeafletMapInstance } from "@/webnext/features/banners/lib/bannerLogic";
import type { Banner } from "@/webnext/types/domain";

type Filter = "all" | "attention" | "placed";

function matchesFilter(banner: Banner, filter: Filter): boolean {
  if (filter === "attention") return banner.status === "needs_maintenance" || banner.status === "being_replaced";
  if (filter === "placed") return banner.status === "placed";
  return true;
}

function MiniMap({ banners, filter }: { banners: Banner[]; filter: Filter }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMapInstance | null>(null);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const plotted = useMemo(() => banners.filter((banner) => matchesFilter(banner, filter) && validBannerCoordinates(banner.lat, banner.lng)), [banners, filter]);

  useEffect(() => {
    let disposed = false;
    if (!plotted.length) return;
    ensureLeafletLoaded().then(() => {
      if (disposed || !container.current || !window.L) return;
      const leaflet = window.L;
      const instance = leaflet.map(container.current).setView([plotted[0].lat!, plotted[0].lng!], 11);
      map.current = instance;
      leaflet.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(instance);
      for (const banner of plotted) {
        leaflet.circleMarker([banner.lat!, banner.lng!], {
          radius: banner.status === "needs_maintenance" || banner.status === "being_replaced" ? 8 : 6,
          color: "#fff",
          weight: 2,
          fillColor: BANNER_STATUS[banner.status].color,
          fillOpacity: 0.95,
        }).addTo(instance).on("click", () => router.push(`/dashboard/banners/${banner.id}`));
      }
      if (plotted.length > 1) {
        instance.fitBounds(leaflet.latLngBounds(plotted.map((banner) => [banner.lat!, banner.lng!] as [number, number])), { padding: [28, 28] });
      }
    }).catch(() => { if (!disposed) setError("Map tiles are unavailable. Open Banner Tracker to view the records."); });
    return () => { disposed = true; map.current?.remove(); map.current = null; };
  }, [plotted, router]);

  if (!plotted.length) return <div className="flex aspect-square items-center justify-center rounded-lg border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">No mapped banners match this view.</div>;
  return <div className="relative aspect-square overflow-hidden rounded-lg border bg-muted/30">
    <div ref={container} className="absolute inset-0" role="region" aria-label={`Map of ${plotted.length} banner locations. Use the full tracker link for the accessible register.`} />
    {error && <p role="alert" className="absolute inset-x-3 top-3 rounded-md bg-card p-3 text-sm text-destructive shadow-sm">{error}</p>}
  </div>;
}

export function BannerOverview() {
  const banners = useBanners();
  const [filter, setFilter] = useState<Filter>("all");
  const all = banners.data ?? [];
  const attention = all.filter((banner) => matchesFilter(banner, "attention")).length;
  const withLocation = all.filter((banner) => validBannerCoordinates(banner.lat, banner.lng)).length;

  return <Card className="min-w-0">
    <CardHeader>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0"><CardTitle className="flex items-center gap-2"><MapPinned className="size-4 text-primary" aria-hidden="true" /> Banner footprint</CardTitle><CardDescription>Live locations and condition across the network</CardDescription></div>
        <Button asChild size="sm" variant="ghost"><Link href="/dashboard/banners?tab=map" aria-label="Open the full banner map"><ArrowUpRight aria-hidden="true" /></Link></Button>
      </div>
    </CardHeader>
    <CardContent className="grid gap-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-muted/50 p-2"><p className="text-lg font-semibold tabular-nums">{banners.isLoading ? "…" : all.length}</p><p className="text-xs text-muted-foreground">Tracked</p></div>
        <div className="rounded-lg bg-muted/50 p-2"><p className="text-lg font-semibold tabular-nums">{banners.isLoading ? "…" : withLocation}</p><p className="text-xs text-muted-foreground">On map</p></div>
        <div className="rounded-lg bg-muted/50 p-2"><p className="text-lg font-semibold tabular-nums">{banners.isLoading ? "…" : attention}</p><p className="text-xs text-muted-foreground">Attention</p></div>
      </div>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Filter banner map">
        {([ ["all", "All"], ["attention", "Attention"], ["placed", "Placed"] ] as const).map(([value, label]) => <Button key={value} type="button" size="sm" variant={filter === value ? "secondary" : "ghost"} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</Button>)}
      </div>
      {banners.isLoading && <div className="flex aspect-square items-center justify-center rounded-lg bg-muted/30 text-sm text-muted-foreground">Loading map…</div>}
      {banners.isError && <p role="alert" className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive">Banner locations could not load.</p>}
      {banners.data && <MiniMap banners={all} filter={filter} />}
    </CardContent>
    <CardFooter><Link href="/dashboard/banners?tab=map" className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">Plan a route or inspect a banner <ArrowUpRight className="size-4" aria-hidden="true" /></Link></CardFooter>
  </Card>;
}
