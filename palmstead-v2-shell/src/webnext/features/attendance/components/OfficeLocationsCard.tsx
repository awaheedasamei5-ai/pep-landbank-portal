"use client";

import { useState } from 'react';
import type { NewOfficeLocation, OfficeLocation } from '../../../types/domain';
import styles from './OfficeLocationsCard.module.css';

// Attendance plan Part 7's open question resolved structurally: real
// office_locations is empty in production, so this is the real Settings
// UI Management uses to add the actual offices themselves, rather than
// this app guessing coordinates on their behalf. Every active row here
// is one real geofence the staff check-in screen's own haversine match
// (attendanceGeo.ts) checks against.
export function OfficeLocationsCard({
  locations,
  onCreate,
  onUpdate,
  onRemove,
}: {
  locations: OfficeLocation[];
  onCreate: (input: NewOfficeLocation) => Promise<void>;
  onUpdate: (id: string, patch: Partial<NewOfficeLocation & { isActive: boolean }>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [radius, setRadius] = useState('150');
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);

  function useCurrentLocation() {
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function handleAdd() {
    const latNum = Number(lat);
    const lngNum = Number(lng);
    const radiusNum = Number(radius);
    if (!name.trim() || !Number.isFinite(latNum) || !Number.isFinite(lngNum) || radiusNum <= 0) return;
    setBusy(true);
    try {
      await onCreate({ name: name.trim(), lat: latNum, lng: lngNum, radiusMeters: radiusNum });
      setName('');
      setLat('');
      setLng('');
      setRadius('150');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <h3>Office locations</h3>
      <p className={styles.sub}>Every active location here is a real geofence — a staff sign-in inside its radius counts as "at the office", outside it requires a reason.</p>

      {locations.length > 0 && (
        <div className={styles.list}>
          {locations.map((loc) => (
            <div key={loc.id} className={styles.row}>
              <div className={styles.info}>
                <strong>{loc.name}</strong>
                <span className={styles.coords}>
                  {loc.lat.toFixed(5)}, {loc.lng.toFixed(5)} · {loc.radiusMeters}m radius
                </span>
              </div>
              <div className={styles.rowActions}>
                <button type="button" className={styles.toggleBtn} onClick={() => onUpdate(loc.id, { isActive: !loc.isActive })}>
                  {loc.isActive ? 'Active' : 'Inactive'}
                </button>
                <button type="button" className={styles.removeBtn} onClick={() => onRemove(loc.id)}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={styles.addRow}>
        <input className={styles.nameInput} placeholder="Office name (e.g. Head Office)" value={name} onChange={(e) => setName(e.target.value)} />
        <input className={styles.coordInput} placeholder="Latitude" value={lat} onChange={(e) => setLat(e.target.value)} />
        <input className={styles.coordInput} placeholder="Longitude" value={lng} onChange={(e) => setLng(e.target.value)} />
        <input className={styles.radiusInput} placeholder="Radius (m)" value={radius} onChange={(e) => setRadius(e.target.value)} />
        <button type="button" className={styles.locateBtn} onClick={useCurrentLocation} disabled={locating}>
          {locating ? 'Locating…' : 'Use my location'}
        </button>
        <button type="button" className={styles.addBtn} onClick={handleAdd} disabled={busy}>
          {busy ? 'Adding…' : 'Add location'}
        </button>
      </div>
    </div>
  );
}
