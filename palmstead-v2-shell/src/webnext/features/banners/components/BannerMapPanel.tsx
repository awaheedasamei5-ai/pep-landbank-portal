"use client";

import { useEffect, useRef, useState } from 'react';
import { areaDirectionsUrl, BANNER_STATUS, directionsUrl, ensureLeafletLoaded, type LeafletMapInstance } from '../lib/bannerLogic';
import type { Banner } from '../../../types/domain';
import styles from './BannerMapPanel.module.css';

// Real user ask (2026-09-11): literal port of v1's real bannerMapHtml/
// bindBannerMapCtrls (index.html:18539-18583) -- a real Leaflet map
// (loaded from the same CDN v1 itself uses, ensureLeafletLoaded, not an
// npm dependency -- see bannerLogic.ts's own comment) with one marker
// per banner that has coordinates, plus a directions picker above it:
// route straight to one named banner, or through every mapped banner in
// an area in order (both open a real Google Maps directions link, same
// as v1's own window.open calls).
export function BannerMapPanel({ banners }: { banners: Banner[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMapInstance | null>(null);
  const [pickBanner, setPickBanner] = useState('');
  const [pickArea, setPickArea] = useState('All areas');
  const [mapError, setMapError] = useState<string | null>(null);

  const withCoords = banners.filter((b) => b.lat != null && b.lng != null);
  const noCoords = banners.length - withCoords.length;
  const areas = Array.from(new Set(banners.map((b) => b.area).filter(Boolean))).sort();

  useEffect(() => {
    let cancelled = false;
    ensureLeafletLoaded()
      .then(() => {
        if (cancelled || !containerRef.current || !window.L) return;
        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
        }
        const center: [number, number] = withCoords.length ? [withCoords[0].lat!, withCoords[0].lng!] : [5.6037, -0.187];
        const map = window.L.map(containerRef.current).setView(center, withCoords.length ? 12 : 11);
        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors', maxZoom: 19 }).addTo(map);
        withCoords.forEach((b) => {
          const st = BANNER_STATUS[b.status] || BANNER_STATUS.placed;
          const marker = window.L!.circleMarker([b.lat!, b.lng!], { radius: 8, color: '#fff', weight: 2, fillColor: st.color, fillOpacity: 0.9 }).addTo(map);
          marker.bindPopup(`<b>${escapeHtml(b.name)}</b><br>${escapeHtml(b.area)}<br>${escapeHtml(st.label)}<br><a href="${directionsUrl(b.lat!, b.lng!)}" target="_blank" rel="noopener">Directions →</a>`);
        });
        if (withCoords.length > 1) {
          map.fitBounds(
            window.L.latLngBounds(withCoords.map((b) => [b.lat!, b.lng!] as [number, number])),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-runs only when the banner list itself changes, not on every render
  }, [banners]);

  function getDirections() {
    if (pickBanner) {
      const b = withCoords.find((x) => `${x.name} — ${x.area}` === pickBanner);
      if (!b || b.lat == null) return;
      window.open(directionsUrl(b.lat, b.lng!), '_blank', 'noopener');
      return;
    }
    const url = areaDirectionsUrl(banners, pickArea as 'All areas');
    if (!url) return;
    window.open(url, '_blank', 'noopener');
  }

  return (
    <>
      <div className={styles.card}>
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
            <label className={styles.label}>Or by area</label>
            <select className={styles.input} value={pickArea} onChange={(e) => setPickArea(e.target.value)}>
              <option>All areas</option>
              {areas.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </div>
        </div>
        <button type="button" className={styles.directionsBtn} onClick={getDirections}>
          🧭 Get directions (opens Google Maps)
        </button>
        <p className={styles.hint}>Picking a single banner routes straight there. Picking an area routes through every mapped banner in it, in order.</p>
      </div>
      <div ref={containerRef} className={styles.mapContainer} />
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
