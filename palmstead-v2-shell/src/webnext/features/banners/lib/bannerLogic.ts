"use client";

import type { Banner, BannerStatus } from '../../../types/domain';

// Real user ask (2026-09-12): "duplicate the version we are currently
// using in production at the office." That real production app is a
// SEPARATE single-page app (this same repo's own `main` branch, deployed
// at github.io/pep-landbank-portal, connected to the legacy lrahgcnftetnyxunaljs
// project) -- an earlier pass here ported PALMSTEAD's own real source
// instead, which turned out to be an older iteration missing this app's
// "Premium UI rebuild" pass (Banner Health gauge, Colour-by map mode,
// Reports period filters). Exact port of that real BANNER_STATUS map.
export const BANNER_STATUS: Record<BannerStatus, { label: string; color: string; bg: string }> = {
  placed: { label: 'Perfect condition', color: '#65A30D', bg: '#ECFCCB' },
  needs_maintenance: { label: 'Needs maintenance', color: '#7C3AED', bg: '#EDE9FE' },
  location_only: { label: 'Scouted location', color: '#2563EB', bg: '#DBEAFE' },
  being_replaced: { label: 'Being replaced', color: '#DC2626', bg: '#FEE2E2' },
};
export const BANNER_STATUS_ORDER: BannerStatus[] = ['placed', 'needs_maintenance', 'location_only', 'being_replaced'];

// Exact port of the real BANNER_AREA_PALETTE + bannerAreaColor -- colours
// assigned by each area's position in the full sorted/deduped area list
// (not a hash of the name), which is what makes it collision-free and
// stable across reloads instead of two areas landing on the same colour.
export const BANNER_AREA_PALETTE = ['#DC2626', '#2563EB', '#65A30D', '#7C3AED', '#EA580C', '#0891B2', '#DB2777', '#CA8A04', '#059669', '#4F46E5', '#9333EA', '#0D9488'];
export function bannerAreaColor(area: string, allBanners: Banner[]): string {
  const areas = Array.from(new Set(allBanners.map((b) => b.area).filter(Boolean))).sort();
  const idx = areas.indexOf(area);
  return BANNER_AREA_PALETTE[(idx < 0 ? 0 : idx) % BANNER_AREA_PALETTE.length];
}

// Exact port of v1's real parseGoogleMapsLatLng() (index.html:18375-
// 18386) -- pulls lat/lng out of whatever Google Maps URL format someone
// pastes. Tries the !3d..!4d.. pair first (the actual pinned place on a
// /maps/place/ link, which can differ slightly from the @lat,lng
// viewport-center coords that follow it), then falls back to @lat,lng
// and ?q=lat,lng for simpler share-link formats. Shortened
// maps.app.goo.gl links can't be resolved client-side (no server to
// follow the redirect), so those correctly fall through to null and the
// caller explains why.
export function parseGoogleMapsLatLng(text: string): { lat: number; lng: number } | null {
  const s = String(text || '');
  let m = s.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
  m = s.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
  m = s.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
  m = s.match(/^\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*$/);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
  return null;
}

export function directionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

// Real production fix (comment there: "chunked into multiple Google Maps
// deep-links past the real 10-stop waypoint cap ... instead of silently
// dropping banners past #10 the way the old single-route version did").
// One link per chunk of up to 10 stops, each a real usable Google Maps
// route -- replaces the earlier areaDirectionsUrl, which truncated
// silently instead of covering every matched banner.
export function bannerRouteLinks(banners: Banner[]): { label: string; url: string }[] {
  const mapped = banners.filter((b) => b.lat != null && b.lng != null);
  if (!mapped.length) return [];
  const chunks: Banner[][] = [];
  for (let i = 0; i < mapped.length; i += 10) chunks.push(mapped.slice(i, i + 10));
  return chunks.map((chunk, i) => {
    const destination = chunk[chunk.length - 1];
    const waypoints = chunk
      .slice(0, -1)
      .map((b) => `${b.lat},${b.lng}`)
      .join('|');
    let url = `https://www.google.com/maps/dir/?api=1&destination=${destination.lat},${destination.lng}`;
    if (waypoints) url += `&waypoints=${encodeURIComponent(waypoints)}`;
    const label = chunks.length > 1 ? `Stops ${i * 10 + 1}-${i * 10 + chunk.length} →` : `Open route (${chunk.length} stop${chunk.length === 1 ? '' : 's'}) →`;
    return { label, url };
  });
}

// Exact port of last6MonthKeys() -- the same 6-month window every trend
// chart in the real app uses ('YYYY-MM' keys, oldest first).
export function last6MonthKeys(): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}
export function monthShortLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'short' });
}

export type ReportPeriod = 'all' | 'week' | 'month' | 'lastmonth' | 'year' | 'lastyear' | 'custom';
export const REPORT_PERIODS: { key: ReportPeriod; label: string }[] = [
  { key: 'all', label: 'All time' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'lastmonth', label: 'Last month' },
  { key: 'year', label: 'This year' },
  { key: 'lastyear', label: 'Last year' },
  { key: 'custom', label: 'Custom range' },
];
// Exact port of reportPeriodRange() -- the same period-filter primitive
// the real app's Reports tabs all share (isoPlusDays here mirrors the
// real one: a plain day-count offset against a 'YYYY-MM-DD' string).
function isoPlusDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
export function reportPeriodRange(key: ReportPeriod, customFrom: string, customTo: string): { from: string; to: string } | null {
  const now = new Date();
  const t = now.toISOString().slice(0, 10);
  if (key === 'all') return null;
  if (key === 'week') {
    const dow = (now.getDay() + 6) % 7;
    return { from: isoPlusDays(t, -dow), to: t };
  }
  if (key === 'month') return { from: `${t.slice(0, 7)}-01`, to: t };
  if (key === 'lastmonth') {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthEnd = new Date(first.getTime() - 86400000);
    return { from: `${lastMonthEnd.toISOString().slice(0, 7)}-01`, to: lastMonthEnd.toISOString().slice(0, 10) };
  }
  if (key === 'year') return { from: `${t.slice(0, 4)}-01-01`, to: t };
  if (key === 'lastyear') {
    const y = now.getFullYear() - 1;
    return { from: `${y}-01-01`, to: `${y}-12-31` };
  }
  return { from: customFrom || t, to: customTo || t };
}

// Real v1 pattern (ensureLeafletLoaded, index.html:18243-18254): Leaflet
// is loaded from a CDN at runtime, on demand, rather than an npm
// dependency -- this is the exact same technique, not a substitute.
// Cached on `window` so opening the Map tab twice doesn't re-inject the
// script/stylesheet.
// Loaded from a CDN, not an npm dependency -- no @types/leaflet
// available, so this is a deliberately loose shape covering only what
// BannerMapPanel.tsx actually calls.
export interface LeafletGlobal {
  map(el: HTMLElement): LeafletMapInstance;
  tileLayer(url: string, opts: Record<string, unknown>): { addTo(map: LeafletMapInstance): void };
  circleMarker(latlng: [number, number], opts: Record<string, unknown>): LeafletMarker;
  latLngBounds(points: [number, number][]): unknown;
}
export interface LeafletMapInstance {
  setView(center: [number, number], zoom: number): LeafletMapInstance;
  fitBounds(bounds: unknown, opts: Record<string, unknown>): void;
  remove(): void;
}
export interface LeafletMarker {
  addTo(map: LeafletMapInstance): LeafletMarker;
  bindPopup(html: string): void;
}
declare global {
  interface Window {
    L?: LeafletGlobal;
    __leafletLoading?: Promise<void>;
  }
}
export function ensureLeafletLoaded(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Not in a browser'));
  if (window.L) return Promise.resolve();
  if (window.__leafletLoading) return window.__leafletLoading;
  window.__leafletLoading = new Promise<void>((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load the map library — check your connection.'));
    document.head.appendChild(script);
  });
  return window.__leafletLoading;
}
