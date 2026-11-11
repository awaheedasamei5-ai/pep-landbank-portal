"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Bell, Compass, MapPin, Route } from "lucide-react";
import {
  BANNER_STATUS,
  BANNER_STATUS_ORDER,
  bannerAreaColor,
  bannerRouteLinks,
  directionsUrl,
  ensureLeafletLoaded,
  validBannerCoordinates,
  type LeafletMapInstance,
  type LeafletMarker,
  type LeafletPolyline,
} from "../lib/bannerLogic";
import { stopLegs, straightLineKm, suggestStopOrder } from "../lib/bannerStopPlanner";
import type { Banner, BannerStatus } from "../../../types/domain";
import styles from "./BannerMapPanel.module.css";

// Keep the existing map filters while letting field staff choose an exact
// stop set. The dashed line and distances are straight-line estimates.
export function BannerMapPanel({ banners }: { banners: Banner[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMapInstance | null>(null);
  const markersRef = useRef<Map<string, { marker: LeafletMarker; color: string }>>(new Map());
  const routeLineRef = useRef<LeafletPolyline | null>(null);
  const selectedRef = useRef<Set<string>>(new Set());
  const [colorMode, setColorMode] = useState<"status" | "area">("status");
  const [areaFilter, setAreaFilter] = useState("All areas");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<BannerStatus | "">("");
  const [mapError, setMapError] = useState<string | null>(null);
  const [routeLinks, setRouteLinks] = useState<{ label: string; url: string }[]>([]);
  const [fieldMode, setFieldMode] = useState(false);
  const [fieldPosition, setFieldPosition] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [radiusMeters, setRadiusMeters] = useState(150);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [deviceAlertMessage, setDeviceAlertMessage] = useState<string | null>(null);
  const [deviceAlerts, setDeviceAlerts] = useState(false);
  const [watchRetry, setWatchRetry] = useState(0);
  const alertedRef = useRef<Set<string>>(new Set());

  const withCoords = banners.filter((b) => validBannerCoordinates(b.lat, b.lng));
  const noCoords = banners.filter((b) => b.lat == null || b.lng == null).length;
  const invalidCoords = banners.length - withCoords.length - noCoords;
  const areas = Array.from(new Set(banners.map((b) => b.area).filter(Boolean))).sort();
  const shown = withCoords.filter(
    (b) => (areaFilter === "All areas" || b.area === areaFilter) && (!statusFilter || b.status === statusFilter),
  );
  const selected = selectedIds
    .map((id) => withCoords.find((banner) => banner.id === id))
    .filter((banner): banner is Banner => !!banner);
  const legs = stopLegs(selected);
  const totalKm = legs.reduce((sum, leg) => sum + (leg.distanceKm ?? 0), 0);
  const distances = fieldPosition
    ? withCoords.map((banner) => ({
        banner,
        meters: Math.round(straightLineKm(fieldPosition, { lat: banner.lat!, lng: banner.lng! }) * 1000),
      }))
    : [];
  const nearby = distances.filter(({ meters }) => meters <= radiusMeters).sort((a, b) => a.meters - b.meters);

  function toggleStop(id: string) {
    setRouteLinks([]);
    setSelectedIds((current) => (current.includes(id) ? current.filter((key) => key !== id) : [...current, id]));
  }

  function moveStop(id: string, direction: -1 | 1) {
    setRouteLinks([]);
    setSelectedIds((current) => {
      const index = current.indexOf(id);
      if (index < 0 || index + direction < 0 || index + direction >= current.length) return current;
      const next = [...current];
      [next[index], next[index + direction]] = [next[index + direction], next[index]];
      return next;
    });
  }

  useEffect(() => {
    if (!fieldMode) return;
    if (!navigator.geolocation) {
      setLocationError("This device does not support location tracking.");
      setFieldMode(false);
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setFieldPosition({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: Math.round(position.coords.accuracy),
        });
        setLocationError(null);
      },
      (error) => {
        setLocationError(error.code === 1 ? "Location permission is off. Allow location to use nearby mode." : `Location unavailable: ${error.message}`);
        if (error.code === 1) setFieldMode(false);
      },
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [fieldMode, watchRetry]);

  useEffect(() => {
    if (!fieldMode || !fieldPosition) return;
    for (const id of alertedRef.current) {
      const distance = distances.find(({ banner }) => banner.id === id)?.meters;
      if (distance == null || distance > radiusMeters * 1.5) alertedRef.current.delete(id);
    }
    const newlyNearby = nearby.filter(({ banner }) => !alertedRef.current.has(banner.id));
    for (const { banner } of newlyNearby) alertedRef.current.add(banner.id);
    if (newlyNearby.length && deviceAlerts && typeof Notification !== "undefined" && Notification.permission === "granted") {
      try {
        const title = newlyNearby.length === 1 ? `${newlyNearby[0].banner.name} is nearby` : `${newlyNearby.length} banners are nearby`;
        new Notification(title, { body: `Open Banner Tracking to check locations within ${radiusMeters} m.` });
      } catch {
        // The in-app nearby list remains available if device alerts fail.
      }
    }
    // Alert only when a new position, radius, or banner data changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldPosition, radiusMeters, banners, deviceAlerts, fieldMode]);

  function stopFieldMode() {
    setFieldMode(false);
    setFieldPosition(null);
    setLocationError(null);
    setDeviceAlertMessage(null);
    alertedRef.current.clear();
  }

  async function enableDeviceAlerts() {
    if (typeof Notification === "undefined") {
      setDeviceAlertMessage("This browser does not support device notifications. Nearby banners will still appear here.");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") alertedRef.current.clear();
      setDeviceAlerts(permission === "granted");
      setDeviceAlertMessage(permission === "granted" ? null : "Device alerts are off. Nearby banners will still appear here.");
    } catch {
      setDeviceAlertMessage("Device alerts could not be enabled. Nearby banners will still appear here.");
    }
  }

  useEffect(() => {
    selectedRef.current = new Set(selectedIds);
    for (const [id, { marker, color }] of markersRef.current) {
      marker.setStyle({
        radius: selectedRef.current.has(id) ? 12 : 8,
        color: selectedRef.current.has(id) ? "#f5b51b" : "#fff",
        weight: selectedRef.current.has(id) ? 4 : 2,
        fillColor: color,
      });
    }
    if (mapRef.current && window.L) {
      if (routeLineRef.current) mapRef.current.removeLayer(routeLineRef.current);
      routeLineRef.current =
        selected.length > 1
          ? window.L.polyline(
              selected.map((banner) => [banner.lat!, banner.lng!] as [number, number]),
              { color: "#f5b51b", weight: 3, dashArray: "7 6" },
            ).addTo(mapRef.current)
          : null;
    }
  }, [selectedIds, banners]);

  useEffect(() => {
    let cancelled = false;
    ensureLeafletLoaded()
      .then(() => {
        if (cancelled || !containerRef.current || !window.L) return;
        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
        }
        markersRef.current.clear();
        routeLineRef.current = null;
        const center: [number, number] = shown.length ? [shown[0].lat!, shown[0].lng!] : [5.6037, -0.187];
        const map = window.L.map(containerRef.current).setView(center, shown.length ? 12 : 11);
        window.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "© OpenStreetMap contributors",
          maxZoom: 19,
        }).addTo(map);
        shown.forEach((b) => {
          const st = BANNER_STATUS[b.status] || BANNER_STATUS.placed;
          const fillColor = colorMode === "area" ? bannerAreaColor(b.area, banners) : st.color;
          const isSelected = selectedRef.current.has(b.id);
          const marker = window
            .L!.circleMarker([b.lat!, b.lng!], {
              radius: isSelected ? 12 : 8,
              color: isSelected ? "#f5b51b" : "#fff",
              weight: isSelected ? 4 : 2,
              fillColor,
              fillOpacity: 0.9,
            })
            .addTo(map);
          marker.bindPopup(
            `<b>${escapeHtml(b.name)}</b><br>${escapeHtml(b.area)}<br>${escapeHtml(st.label)}<br><a href="${directionsUrl(b.lat!, b.lng!)}" target="_blank" rel="noopener">Directions →</a>`,
          );
          marker.on("click", () => toggleStop(b.id));
          markersRef.current.set(b.id, { marker, color: fillColor });
        });
        const selectedPoints = [...selectedRef.current]
          .map((id) => banners.find((banner) => banner.id === id))
          .filter((banner): banner is Banner => !!banner && validBannerCoordinates(banner.lat, banner.lng));
        if (selectedPoints.length > 1) {
          routeLineRef.current = window.L.polyline(
            selectedPoints.map((banner) => [banner.lat!, banner.lng!] as [number, number]),
            { color: "#f5b51b", weight: 3, dashArray: "7 6" },
          ).addTo(map);
        }
        if (shown.length > 1) {
          map.fitBounds(window.L.latLngBounds(shown.map((b) => [b.lat!, b.lng!] as [number, number])), {
            padding: [30, 30],
          });
        }
        mapRef.current = map;
      })
      .catch((e: Error) => setMapError(e.message || "Could not load the map"));
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      markersRef.current.clear();
      routeLineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-runs on banner list, colour mode, or filter changes, not on every render
  }, [banners, colorMode, areaFilter, statusFilter]);

  function getDirections() {
    const links = bannerRouteLinks(selected);
    if (!links.length) return;
    if (links.length === 1) {
      window.open(links[0].url, "_blank", "noopener");
      setRouteLinks([]);
    } else {
      setRouteLinks(links);
    }
  }

  const legendAreas =
    colorMode === "area" && areaFilter === "All areas"
      ? Array.from(new Set(shown.map((b) => b.area).filter(Boolean))).sort()
      : [];

  return (
    <>
      <div className={styles.card}>
        <div className={styles.grid2}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="banner-map-colour">Colour by</label>
            <select
              id="banner-map-colour"
              className={styles.input}
              value={colorMode === "area" ? "Area" : "Status"}
              onChange={(e) => setColorMode(e.target.value === "Area" ? "area" : "status")}
            >
              <option>Status</option>
              <option>Area</option>
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="banner-map-area">Area</label>
            <select id="banner-map-area" className={styles.input} value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)}>
              <option>All areas</option>
              {areas.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </div>
        </div>
        <div className={styles.grid2}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="banner-add-stop">
              Add a banner stop
            </label>
            <select
              id="banner-add-stop"
              className={styles.input}
              value=""
              onChange={(e) => {
                if (e.target.value && !selectedIds.includes(e.target.value)) toggleStop(e.target.value);
              }}
            >
              <option value="">Select a mapped banner…</option>
              {shown
                .filter((banner) => !selectedIds.includes(banner.id))
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} — {b.area}
                  </option>
                ))}
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="banner-map-status">Status filter</label>
            <select
              id="banner-map-status"
              className={styles.input}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as BannerStatus | "")}
            >
              <option value="">All statuses</option>
              {BANNER_STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {BANNER_STATUS[s].label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className={styles.hint}>
          Select exact stops below or click map pins. Area and status change which pins are shown; stops you already
          chose stay in your plan.
        </p>
      </div>
      <div ref={containerRef} className={styles.mapContainer} />
      <section className={styles.card} aria-label="Nearby banner field mode">
        <div className={styles.plannerHeader}>
          <div>
            <h2 className={styles.plannerTitle}><MapPin className="inline size-4" aria-hidden="true" /> Nearby banners</h2>
            <p className={styles.hint}>Your device location stays in this page. Nearby checks run only while this page is open and field mode is on.</p>
          </div>
          <button type="button" className={styles.routeLink} onClick={fieldMode ? stopFieldMode : () => { setLocationError(null); setFieldMode(true); }}>
            {fieldMode ? "Stop nearby mode" : "Start nearby mode"}
          </button>
        </div>
        {fieldMode && (
          <div className={styles.nearbyControls}>
            <label className={styles.label} htmlFor="banner-nearby-radius">Alert radius</label>
            <select id="banner-nearby-radius" className={styles.input} value={radiusMeters} onChange={(event) => setRadiusMeters(Number(event.target.value))}>
              <option value={50}>50 m</option>
              <option value={150}>150 m</option>
              <option value={300}>300 m</option>
              <option value={500}>500 m</option>
            </select>
            {deviceAlerts ? (
              <button type="button" className={styles.routeLink} onClick={() => setDeviceAlerts(false)}>Turn off device alerts</button>
            ) : (
              <button type="button" className={styles.routeLink} onClick={enableDeviceAlerts}><Bell className="inline size-4" aria-hidden="true" /> Enable device alerts</button>
            )}
          </div>
        )}
        {locationError && <p className={styles.errorMsg} role="alert">{locationError}</p>}
        {deviceAlertMessage && <p className={styles.hint} role="status">{deviceAlertMessage}</p>}
        {fieldMode && locationError && (
          <button type="button" className={styles.routeLink} onClick={() => { setLocationError(null); setWatchRetry((count) => count + 1); }}>
            Retry location
          </button>
        )}
        {fieldMode && !fieldPosition && !locationError && <p className={styles.hint} role="status">Waiting for device location…</p>}
        {fieldMode && fieldPosition && (
          <>
            <p className={styles.hint} role="status">{nearby.length} banner{nearby.length === 1 ? "" : "s"} within {radiusMeters} m · Device accuracy about {fieldPosition.accuracy} m.</p>
            {nearby.length ? (
              <ul className={styles.nearbyList}>
                {nearby.map(({ banner, meters }) => (
                  <li key={banner.id} className={styles.nearbyRow}>
                    <span><strong>{banner.name}</strong><br />{banner.area} · about {meters} m away</span>
                    <a className={styles.routeLink} href={directionsUrl(banner.lat!, banner.lng!)} target="_blank" rel="noopener noreferrer">Directions</a>
                  </li>
                ))}
              </ul>
            ) : <p className={styles.hint}>No banner is inside this radius. Keep nearby mode on while you travel.</p>}
          </>
        )}
      </section>
      <section className={styles.card} aria-label="Selected banner stops">
        <div className={styles.plannerHeader}>
          <div>
            <h2 className={styles.plannerTitle}>
              <Route className="inline size-4" aria-hidden="true" /> Field stop plan
            </h2>
            <p className={styles.hint}>
              {selected.length} chosen stop{selected.length === 1 ? "" : "s"} · {totalKm.toFixed(1)} km straight-line
              between stops. Road distance may differ.
            </p>
          </div>
          <div className={styles.plannerActions}>
            <button
              type="button"
              className={styles.routeLink}
              onClick={() => {
                setRouteLinks([]);
                setSelectedIds((current) => [
                  ...current,
                  ...shown.filter((banner) => !current.includes(banner.id)).map((banner) => banner.id),
                ]);
              }}
              disabled={!shown.some((banner) => !selectedIds.includes(banner.id))}
            >
              Add shown
            </button>
            <button
              type="button"
              className={styles.routeLink}
              onClick={() => {
                setRouteLinks([]);
                setSelectedIds([]);
              }}
              disabled={!selected.length}
            >
              Clear
            </button>
          </div>
        </div>
        {selected.length > 1 && (
          <button
            type="button"
            className={styles.routeLink}
            onClick={() => {
              setRouteLinks([]);
              setSelectedIds(suggestStopOrder(selected, fieldPosition ?? undefined).map((banner) => banner.id));
            }}
          >
            Suggest shorter order{fieldPosition ? " from my location" : ""}
          </button>
        )}
        {selected.length ? (
          <ol className={styles.stopList}>
            {legs.map(({ banner, distanceKm }, index) => (
              <li key={banner.id} className={styles.stopRow}>
                <span className={styles.stopNumber}>{index + 1}</span>
                <div className={styles.stopMain}>
                  <strong>{banner.name}</strong>
                  <span>
                    {banner.area} ·{" "}
                    {distanceKm == null ? "Starting stop" : `${distanceKm.toFixed(1)} km straight-line from previous`}
                  </span>
                </div>
                <div className={styles.stopActions}>
                  <button
                    type="button"
                    aria-label={`Move ${banner.name} up`}
                    disabled={!index}
                    onClick={() => moveStop(banner.id, -1)}
                  >
                    <ArrowUp className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${banner.name} down`}
                    disabled={index === selected.length - 1}
                    onClick={() => moveStop(banner.id, 1)}
                  >
                    <ArrowDown className="size-4" />
                  </button>
                  <button type="button" aria-label={`Remove ${banner.name}`} onClick={() => toggleStop(banner.id)}>
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className={styles.emptyStops}>
            <MapPin className="size-4" aria-hidden="true" /> Choose banners on the map or use “Add a banner stop” above.
          </p>
        )}
        <button type="button" className={styles.directionsBtn} disabled={!selected.length} onClick={getDirections}>
          <Compass className="inline size-4" aria-hidden="true" /> Open road directions in Google Maps
        </button>
        {selected.length > 4 && (
          <p className={styles.hint}>
            Large plans are split into mobile-safe linked routes of up to four new stops. Open each part in order.
          </p>
        )}
        {routeLinks.length > 0 && (
          <div className={styles.routeLinks}>
            {routeLinks.map((link) => (
              <a key={link.url} className={styles.routeLink} href={link.url} target="_blank" rel="noopener noreferrer">
                {link.label}
              </a>
            ))}
          </div>
        )}
      </section>
      {(legendAreas.length > 0 || colorMode === "status") && (
        <div className={styles.legend}>
          {colorMode === "status"
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
          {noCoords} {noCoords === 1 ? "entry has" : "entries have"} no coordinates yet and won&apos;t show on the map.
        </p>
      )}
      {invalidCoords > 0 && (
        <p className={styles.errorMsg} role="status">
          {invalidCoords} {invalidCoords === 1 ? "entry has" : "entries have"} invalid coordinates. Correct them in the
          banner details before using directions.
        </p>
      )}
    </>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
