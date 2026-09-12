"use client";

import { useEffect, useRef, useState } from 'react';
import { BANNER_STATUS, BANNER_STATUS_ORDER, bannerAreaColor, bannerRouteLinks, directionsUrl, ensureLeafletLoaded, type LeafletMapInstance } from '../lib/bannerLogic';
import type { Banner, BannerStatus } from '../../../types/domain';
import styles from './BannerMapPanel.module.css';

// Real user ask (2026-09-12): "duplicate the version we are currently
// using in production at the office." Literal port of that real app's
// bannerMapHtml/bindBannerMapCtrls -- a Colour-by toggle (Status, the
// original palette, or Area, a stable per-area colour so picking one
// area shows just that colour and "All areas" shows every colour with a
// legend), an independent status filter that narrows the pin set AND
// its own route (combinable with the area filter, not exclusive to it),
// and routing generalized to the full filtered set -- chunked into
// multiple Google Maps links past the real 10-stop waypoint cap instead
// of silently dropping banners past #10.
export function BannerMapPanel({ banners }: { banners: Banner[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMapInstance | null>(null);
  const [colorMode, setColorMode] = useState<'status' | 'area'>('status');
  const [areaFilter, setAreaFilter] = useState('All areas');
  const [pickBanner, setPickBanner] = useState('');
  const [statusFilter, setStatusFilter] = useState<BannerStatus | ''>('');
  const [mapError, setMapError] = useState<string | null>(null);
  const [routeLinks, setRouteLinks] = useState<{ label: string; url: string }[]>([]);

  const withCoords = banners.filter((b) => b.lat != null && b.lng != null);
  const noCoords = banners.length - withCoords.length;
  const areas = Array.from(new Set(banners.map((b) => b.area).filter(Boolean))).sort();
  const shown = withCoords.filter((b) => (areaFilter === 'All areas' || b.area === areaFilter) && (!statusFilter || b.status === statusFilter));

  useEffect(() => {
    let cancelled = false;
    ensureLeafletLoaded()
      .then(() => {
        if (cancelled || !containerRef.current || !window.L) return;
        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
        }
        const center: [number, number] = shown.length ? [shown[0].lat!, shown[0].lng!] : [5.6037, -0.187];
        const map = window.L.map(containerRef.current).setView(center, shown.length ? 12 : 11);
        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors', maxZoom: 19 }).addTo(map);
        shown.forEach((b) => {
          const st = BANNER_STATUS[b.status] || BANNER_STATUS.placed;
          const fillColor = colorMode === 'area' ? bannerAreaColor(b.area, banners) : st.color;
          const marker = window.L!.circleMarker([b.lat!, b.lng!], { radius: 8, color: '#fff', weight: 2, fillColor, fillOpacity: 0.9 }).addTo(map);
          marker.bindPopup(`<b>${escapeHtml(b.name)}</b><br>${escapeHtml(b.area)}<br>${escapeHtml(st.label)}<br><a href="${directionsUrl(b.lat!, b.lng!)}" target="_blank" rel="noopener">Directions →</a>`);
        });
        if (shown.length > 1) {
          map.fitBounds(
            window.L.latLngBounds(shown.map((b) => [b.lat!, b.lng!] as [number, number])),
            { padding: [30, 30] },
          );
        }
        mapRef.current = map;
      })
      .catch((e: Error) => setMapError(e.message || 'Could not load the map'));
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-runs on banner list, colour mode, or filter changes, not on every render
  }, [banners, colorMode, areaFilter, statusFilter]);

  function getDirections() {
    if (pickBanner) {
      const b = withCoords.find((x) => `${x.name} — ${x.area}` === pickBanner);
      if (!b || b.lat == null) return;
      window.open(directionsUrl(b.lat, b.lng!), '_blank', 'noopener');
      setRouteLinks([]);
      return;
    }
    const links = bannerRouteLinks(shown);
    if (!links.length) return;
    if (links.length === 1) {
      window.open(links[0].url, '_blank', 'noopener');
      setRouteLinks([]);
    } else {
      setRouteLinks(links);
    }
  }

  const legendAreas = colorMode === 'area' && areaFilter === 'All areas' ? Array.from(new Set(shown.map((b) => b.area).filter(Boolean))).sort() : [];

  return (
    <>
      <div className={styles.card}>
        <div className={styles.grid2}>
          <div className={styles.field}>
            <label className={styles.label}>Colour by</label>
            <select className={styles.input} value={colorMode === 'area' ? 'Area' : 'Status'} onChange={(e) => setColorMode(e.target.value === 'Area' ? 'area' : 'status')}>
              <option>Status</option>
              <option>Area</option>
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Area</label>
            <select className={styles.input} value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)}>
              <option>All areas</option>
              {areas.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </div>
        </div>
        <div className={styles.grid2}>
          <div className={styles.field}>
            <label className={styles.label}>Find by name</label>
            <select className={styles.input} value={pickBanner} onChange={(e) => setPickBanner(e.target.value)}>
              <option value="">Select a banner…</option>
              {withCoords.map((b) => (
                <option key={b.id} value={`${b.name} — ${b.area}`}>
                  {b.name} — {b.area}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Status filter</label>
            <select className={styles.input} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as BannerStatus | '')}>
              <option value="">All statuses</option>
              {BANNER_STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {BANNER_STATUS[s].label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button type="button" className={styles.directionsBtn} onClick={getDirections}>
          🧭 Get directions (opens Google Maps)
        </button>
        <p className={styles.hint}>Picking a single banner routes straight there. Otherwise the route covers every mapped banner matching your Area + Status filter, in stops of up to 10 (Google Maps&apos; own limit) -- more than 10 opens as multiple route links.</p>
        {routeLinks.length > 0 && (
          <div className={styles.routeLinks}>
            {routeLinks.map((l) => (
              <a key={l.url} className={styles.routeLink} href={l.url} target="_blank" rel="noopener noreferrer">
                {l.label}
              </a>
            ))}
          </div>
        )}
      </div>
      <div ref={containerRef} className={styles.mapContainer} />
      {(legendAreas.length > 0 || colorMode === 'status') && (
        <div className={styles.legend}>
          {colorMode === 'status'
            ? BANNER_STATUS_ORDER.map((s) => (
                <span key={s} className={styles.legendItem}>
                  <span className={styles.legendDot} style={{ background: BANNER_STATUS[s].color }} />
                  {BANNER_STATUS[s].label}
                </span>
              ))
            : legendAreas.map((a) => (
                <span key={a} className={styles.legendItem}>
                  <span className={styles.legendDot} style={{ background: bannerAreaColor(a, banners) }} />
                  {a}
                </span>
              ))}
        </div>
      )}
      {mapError && <p className={styles.errorMsg}>{mapError}</p>}
      {noCoords > 0 && (
        <p className={styles.hint} style={{ marginTop: 10 }}>
          {noCoords} {noCoords === 1 ? 'entry has' : 'entries have'} no coordinates yet and won&apos;t show on the map.
        </p>
      )}
    </>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
