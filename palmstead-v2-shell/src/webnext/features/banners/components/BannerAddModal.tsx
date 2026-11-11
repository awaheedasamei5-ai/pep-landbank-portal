"use client";

import { useRef, useState } from 'react';
import { Camera, Images, MapPin, X } from 'lucide-react';
import { useSessionStore } from '../../../auth/useSessionStore';
import { getDataSource } from '../../../data/source';
import { resizeImageToDataUri } from '../../../shared/lib/image';
import { parseGoogleMapsLatLng, validBannerCoordinates } from '../lib/bannerLogic';
import { useCreateBanner, useLogBannerStatusUpdate } from '../hooks/useBanners';
import type { BannerStatus, NewBanner } from '../../../types/domain';
import styles from './BannerAddModal.module.css';

const STATUS_OPTIONS: { value: BannerStatus; label: string }[] = [
  { value: 'placed', label: 'Perfect condition' },
  { value: 'needs_maintenance', label: 'Needs maintenance' },
  { value: 'location_only', label: 'New location (no banner yet)' },
];

// Real user ask (2026-09-11): "copy (duplicate) the SAME app in v1
// production version ... exactly as it is dont change any detail."
// Literal port of v1's real openBannerModal() (index.html:18390-18465):
// name/area (with an area suggestion list), status, a real photo
// (camera capture OR gallery pick, resized client-side the same way),
// a Google Maps link that auto-fills lat/lng on paste, a "use my
// current location" geolocation button, and notes. Saving both inserts
// the banner row AND logs the very first banner_status_log entry for
// it ("Initial entry"). If the second write fails, keep the saved banner
// ID so retrying the initial history cannot create another banner.
export function BannerAddModal({ areas, onDone, onClose }: { areas: string[]; onDone: () => void; onClose: () => void }) {
  const create = useCreateBanner();
  const logUpdate = useLogBannerStatusUpdate();
  const demoMode = useSessionStore((s) => s.demoMode);
  const [name, setName] = useState('');
  const [area, setArea] = useState('');
  const [status, setStatus] = useState<BannerStatus>('placed');
  const [imageDataUri, setImageDataUri] = useState<string | null>(null);
  const [mapsLink, setMapsLink] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedBannerId, setSavedBannerId] = useState<string | null>(null);
  const savedBannerIdRef = useRef<string | null>(null);
  const captureRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const saveLabel = savedBannerId ? 'Retry initial history' : 'Add entry';

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setImageDataUri(await resizeImageToDataUri(file, 900, 900, 0.8));
    } catch {
      setError('Could not read that image');
    }
  }

  function handleMapsLinkChange(value: string) {
    setMapsLink(value);
    const coords = parseGoogleMapsLatLng(value);
    if (coords) {
      setError(null);
      setLat(coords.lat.toFixed(6));
      setLng(coords.lng.toFixed(6));
    }
  }

  function parseMapsLink() {
    const link = mapsLink.trim();
    if (!link) return;
    const coords = parseGoogleMapsLatLng(link);
    if (!coords) {
      setError(/goo\.gl|maps\.app/i.test(link) ? "That's a shortened link — open it and paste the full address bar URL instead" : "Couldn't find coordinates in that link");
      return;
    }
    setError(null);
    setLat(coords.lat.toFixed(6));
    setLng(coords.lng.toFixed(6));
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setError('Geolocation not available on this device');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setLocating(false);
      },
      (err) => {
        setError(`Could not get your location: ${err.message}`);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function save() {
    setError(null);
    if (!savedBannerIdRef.current && !name.trim()) {
      setError('Add a name');
      return;
    }
    if (!savedBannerIdRef.current && !area.trim()) {
      setError('Add an area');
      return;
    }
    if (!savedBannerIdRef.current && ((lat === '') !== (lng === '') || (lat !== '' && !validBannerCoordinates(Number(lat), Number(lng))))) {
      setError('Enter both coordinates in their valid ranges, or leave both blank.');
      return;
    }
    setSaving(true);
    const input: NewBanner = {
      name: name.trim(),
      area: area.trim(),
      status,
      notes: notes.trim() || undefined,
      lat: lat ? Number(lat) : null,
      lng: lng ? Number(lng) : null,
      image: imageDataUri,
    };
    try {
      let bannerId = savedBannerIdRef.current;
      if (!bannerId) {
        const rec = await create.mutateAsync(input);
        bannerId = rec.id;
        savedBannerIdRef.current = bannerId;
        setSavedBannerId(bannerId);
      }
      // A previous attempt may have written the log but lost its response.
      // Check first so retrying this form cannot create duplicate entries.
      if (savedBannerId && (await getDataSource(demoMode).banners.statusLog(bannerId)).some((entry) => entry.note === 'Initial entry')) {
        onDone();
        return;
      }
      try {
        await logUpdate.mutateAsync({ bannerId, status, note: 'Initial entry', images: imageDataUri ? [imageDataUri] : [] });
      } catch (logError) {
        const existing = await getDataSource(demoMode).banners.statusLog(bannerId);
        if (!existing.some((entry) => entry.note === 'Initial entry')) throw logError;
      }
      onDone();
    } catch (e) {
      if (savedBannerIdRef.current) {
        setError('Banner saved, but its initial history could not be confirmed. Retry here; this will not add another banner. You can also close and inspect the saved banner.');
      } else {
        setError(e instanceof Error ? e.message : 'Failed to save');
      }
      setSaving(false);
    }
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.head}>
          <div className={styles.title}>Add banner / location</div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <fieldset className={styles.fields} disabled={Boolean(savedBannerId)}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="banner-name">Name *</label>
          <input id="banner-name" className={styles.input} placeholder="e.g. Spintex Road – near GOIL" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="banner-area">Area *</label>
          <input id="banner-area" className={styles.input} list="bannerAreaList" placeholder="e.g. Spintex" value={area} onChange={(e) => setArea(e.target.value)} />
          <datalist id="bannerAreaList">
            {areas.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="banner-status">Status</label>
          <select id="banner-status" className={styles.input} value={status} onChange={(e) => setStatus(e.target.value as BannerStatus)}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <span className={styles.label}>Banner photo</span>
          <div className={styles.photoRow}>
            <button type="button" className={styles.ghostBtn} onClick={() => captureRef.current?.click()}>
              <Camera className="inline size-4" aria-hidden="true" /> Take photo
            </button>
            <button type="button" className={styles.ghostBtn} onClick={() => galleryRef.current?.click()}>
              <Images className="inline size-4" aria-hidden="true" /> Choose from gallery
            </button>
          </div>
          <input ref={captureRef} type="file" accept="image/*" capture="environment" hidden onChange={handlePhoto} />
          <input ref={galleryRef} type="file" accept="image/*" hidden onChange={handlePhoto} />
          <p className={styles.hint}>optional — skip for a scouted location with no banner yet</p>
          {imageDataUri && (
            // eslint-disable-next-line @next/next/no-img-element -- a locally-resized data URI preview, not worth next/image's remote-loader config
            <img src={imageDataUri} alt="" className={styles.photoPreview} />
          )}
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="banner-maps-link">Paste a Google Maps link</label>
          <input
            id="banner-maps-link"
            className={styles.input}
            placeholder="https://maps.google.com/…"
            value={mapsLink}
            onChange={(e) => handleMapsLinkChange(e.target.value)}
            onBlur={parseMapsLink}
          />
          <p className={styles.hint}>pulls the coordinates out automatically — use the full link from the address bar, not a shortened maps.app.goo.gl one</p>
        </div>
        <div className={styles.grid2}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="banner-latitude">Latitude</label>
            <input id="banner-latitude" className={styles.input} type="number" step="any" value={lat} onChange={(e) => setLat(e.target.value)} />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="banner-longitude">Longitude</label>
            <input id="banner-longitude" className={styles.input} type="number" step="any" value={lng} onChange={(e) => setLng(e.target.value)} />
          </div>
        </div>
        <button type="button" className={styles.ghostBtnFull} onClick={useCurrentLocation} disabled={locating}>
          {locating ? 'Locating…' : (<span className="inline-flex items-center gap-1"><MapPin className="size-4" aria-hidden="true" /> Use my current location</span>)}
        </button>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="banner-notes">Notes</label>
          <textarea id="banner-notes" className={styles.input} value={notes} onChange={(e) => setNotes(e.target.value)} style={{ minHeight: 60 }} />
        </div>
        </fieldset>

        {error && <p className={styles.errorMsg} role="alert">{error}</p>}
        <button type="button" className={styles.saveBtn} disabled={saving} onClick={save}>
          {saving ? 'Saving…' : saveLabel}
        </button>
      </div>
    </div>
  );
}
