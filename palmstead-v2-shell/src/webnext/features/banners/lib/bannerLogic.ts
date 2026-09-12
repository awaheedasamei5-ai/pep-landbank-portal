"use client";

import type { Banner, BannerStatus } from '../../../types/domain';

// Exact port of v1's real BANNER_STATUS map (index.html:18237-18242) --
// same 4 statuses, same colors/labels, used for every status pill/dot/
// row-rail across the app.
export const BANNER_STATUS: Record<BannerStatus, { label: string; color: string; bg: string }> = {
  placed: { label: 'Perfect condition', color: '#1E7A56', bg: '#DCEEE4' },
  needs_maintenance: { label: 'Needs maintenance', color: '#8A6E12', bg: '#F6EBD3' },
  location_only: { label: 'Scouted location', color: '#2E6E8E', bg: '#DCEAF0' },
  being_replaced: { label: 'Being replaced', color: '#B4472F', bg: '#F5DCD5' },
};
export const BANNER_STATUS_ORDER: BannerStatus[] = ['placed', 'needs_maintenance', 'location_only', 'being_replaced'];

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

// Exact port of v1's real bindBannerMapCtrls's "get directions" handler
// (index.html:18552-18568) -- a single banner routes straight there; an
// area routes through every mapped banner in it, in order (Google Maps
// caps a real directions URL at ~10 waypoints, matching v1's own
// `.slice(0,10)`).
export function areaDirectionsUrl(banners: Banner[], area: string | 'All areas'): string | null {
  const mapped = banners.filter((b) => b.lat != null && b.lng != null && (area === 'All areas' || b.area === area));
  if (!mapped.length) return null;
  const stops = mapped.slice(0, 10);
  const destination = stops[stops.length - 1];
  const waypoints = stops
    .slice(0, -1)
    .map((b) => `${b.lat},${b.lng}`)
    .join('|');
  let url = `https://www.google.com/maps/dir/?api=1&destination=${destination.lat},${destination.lng}`;
  if (waypoints) url += `&waypoints=${encodeURIComponent(waypoints)}`;
  return url;
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
