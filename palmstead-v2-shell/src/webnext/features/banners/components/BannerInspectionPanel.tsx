"use client";

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Images, LocateFixed, ShieldCheck } from 'lucide-react';
import type { BannerStatus } from '../../../types/domain';
import { BANNER_STATUS, BANNER_STATUS_ORDER } from '../lib/bannerLogic';
import { bannerInspectorName, listBannerInspections, submitBannerInspection, viewInspectionPhoto } from '../lib/bannerInspections';
import styles from '../screens/BannerDetailScreen.module.css';

export function BannerInspectionPanel({ bannerId }: { bannerId: string }) {
  const qc = useQueryClient();
  const { data: inspections, isLoading, error: listError } = useQuery({
    queryKey: ['bannerInspections', bannerId], queryFn: () => listBannerInspections(bannerId),
  });
  const mutation = useMutation({
    mutationFn: submitBannerInspection,
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['bannerInspections', bannerId] }),
        qc.invalidateQueries({ queryKey: ['bannerStatusLog', bannerId] }),
        qc.invalidateQueries({ queryKey: ['banners'] }),
      ]);
    },
  });
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [condition, setCondition] = useState<BannerStatus>('placed');
  const [finding, setFinding] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [position, setPosition] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsMessage, setGpsMessage] = useState('No device position attached');
  const [gpsPending, setGpsPending] = useState(false);
  const [draftId, setDraftId] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [viewedPhoto, setViewedPhoto] = useState<{ path: string; url: string } | null>(null);

  function choosePhoto(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Choose an image file.'); return; }
    if (preview) URL.revokeObjectURL(preview);
    setPhoto(file);
    setPreview(URL.createObjectURL(file));
    setDraftId(crypto.randomUUID());
    setError(null);
  }

  function locate() {
    if (!navigator.geolocation) { setGpsMessage('This device does not provide location. You can still submit.'); return; }
    setGpsPending(true);
    navigator.geolocation.getCurrentPosition(
      (result) => {
        setPosition({ lat: result.coords.latitude, lng: result.coords.longitude, accuracy: result.coords.accuracy });
        setGpsMessage(`Device position attached · approximately ${Math.round(result.coords.accuracy)} m accuracy`);
        setGpsPending(false);
      },
      () => { setPosition(null); setGpsMessage('Location unavailable. You can still submit.'); setGpsPending(false); },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  }

  async function submit() {
    setError(null);
    if (!photo) { setError('Add a photo from the site.'); return; }
    if (['needs_maintenance', 'being_replaced'].includes(condition) && finding.trim().length < 5) {
      setError('Describe the maintenance or replacement finding.'); return;
    }
    try {
      await mutation.mutateAsync({ id: draftId, bannerId, condition, finding, file: photo, position });
      if (preview) URL.revokeObjectURL(preview);
      setPhoto(null); setPreview(null); setFinding(''); setPosition(null);
      setGpsMessage('No device position attached'); setDraftId(crypto.randomUUID());
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save inspection. Retry with this photo.'); }
  }

  async function openPhoto(path: string) {
    if (viewedPhoto?.path === path) { setViewedPhoto(null); return; }
    setViewing(path);
    try {
      const url = await viewInspectionPhoto(path);
      setViewedPhoto({ path, url });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Photo unavailable.'); }
    finally { setViewing(null); }
  }

  return <section aria-labelledby="inspection-title">
    <h2 id="inspection-title" className={styles.sectitle}>Inspect on site <span className={styles.cnt}>{inspections?.length ?? 0}</span></h2>
    <div className={styles.card}>
      <p className={styles.inspectionIntro}><ShieldCheck size={18} aria-hidden="true" /> Physical visit record. A photo is required; your account and submission time are recorded automatically.</p>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="inspection-condition">Observed condition</label>
        <select id="inspection-condition" className={styles.input} value={condition} onChange={(e) => setCondition(e.target.value as BannerStatus)}>
          {BANNER_STATUS_ORDER.map((item) => <option key={item} value={item}>{BANNER_STATUS[item].label}</option>)}
        </select>
      </div>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="inspection-finding">Finding {condition === 'needs_maintenance' || condition === 'being_replaced' ? '(required)' : '(optional)'}</label>
        <textarea id="inspection-finding" className={styles.input} rows={3} maxLength={2000} value={finding} onChange={(e) => setFinding(e.target.value)} placeholder="Describe what you observed and any action needed" />
      </div>
      <div className={styles.photoRow}>
        <button type="button" className={styles.ghostBtn} onClick={() => cameraRef.current?.click()}><Camera size={16} aria-hidden="true" /> Take photo</button>
        <button type="button" className={styles.ghostBtn} onClick={() => galleryRef.current?.click()}><Images size={16} aria-hidden="true" /> Choose photo</button>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { choosePhoto(e.target.files?.[0]); e.target.value = ''; }} />
        <input ref={galleryRef} type="file" accept="image/*" hidden onChange={(e) => { choosePhoto(e.target.files?.[0]); e.target.value = ''; }} />
      </div>
      {preview && <div className={styles.inspectionPreview}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={preview} alt="Selected inspection evidence" /><button type="button" className={styles.ghostBtn} onClick={() => { URL.revokeObjectURL(preview); setPreview(null); setPhoto(null); setDraftId(crypto.randomUUID()); }}>Remove</button></div>}
      <div className={styles.inspectionLocation}><button type="button" className={styles.ghostBtn} disabled={gpsPending} onClick={locate}><LocateFixed size={16} aria-hidden="true" /> {gpsPending ? 'Finding device position…' : 'Add device position'}</button><span>{gpsMessage}</span></div>
      <p className={styles.hint}>Device position is optional and its accuracy varies. This record cannot be edited after submission.</p>
      {error && <p role="alert" className={styles.errorMsg}>{error}</p>}
      <button type="button" className={styles.saveBtn} disabled={mutation.isPending} onClick={submit}>{mutation.isPending ? 'Saving inspection…' : 'Save inspection'}</button>
    </div>
    {isLoading && <p className={styles.emptyMsg}>Loading inspections…</p>}
    {listError && <p role="alert" className={styles.errorMsg}>Could not load inspections.</p>}
    {!isLoading && !listError && !inspections?.length && <p className={styles.emptyMsg}>No physical inspections recorded yet.</p>}
    <div className={styles.list}>
      {(inspections ?? []).map((item) => <article key={item.id} className={styles.logRow} style={{ borderLeftColor: BANNER_STATUS[item.observed_condition].color }}>
        <div className={styles.logTop}><strong className={styles.logStatus}>{BANNER_STATUS[item.observed_condition].label} · {bannerInspectorName(item)}</strong><time className={styles.logDate} dateTime={item.recorded_at}>{new Date(item.recorded_at).toLocaleString()}</time></div>
        {item.finding && <p className={styles.logNote}>{item.finding}</p>}
        <div className={styles.inspectionMeta}><span>{item.observed_lat == null ? 'No device position' : `Device position · ±${Math.round(item.gps_accuracy_m ?? 0)} m`}</span><button type="button" className={styles.inspectionPhotoButton} onClick={() => openPhoto(item.photo_path)} disabled={viewing === item.photo_path}>{viewing === item.photo_path ? 'Opening…' : viewedPhoto?.path === item.photo_path ? 'Hide photo' : 'View private photo'}</button></div>
        {viewedPhoto?.path === item.photo_path && <div className={styles.inspectionPreview}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={viewedPhoto.url} alt={`Evidence for ${BANNER_STATUS[item.observed_condition].label}`} /></div>}
      </article>)}
    </div>
  </section>;
}

