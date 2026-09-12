"use client";

import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { resizeImageToDataUri } from '../../../shared/lib/image';
import { BANNER_STATUS, BANNER_STATUS_ORDER, directionsUrl } from '../lib/bannerLogic';
import { useBannerStatusLog, useBanners, useDeleteBanner, useLogBannerStatusUpdate, useUpdateBannerArea } from '../hooks/useBanners';
import { friendlyError } from '../../../shared/lib/friendlyError';
import type { BannerStatus } from '../../../types/domain';
import styles from './BannerDetailScreen.module.css';

// Real user ask (2026-09-11): literal port of v1's real viewBannerDetail/
// bindBannerDetailCtrls/loadBannerTimeline (index.html:18468-18538) --
// "modeled directly on the Task-detail audit-trail pattern," per its own
// comment: the banner's photo + directions link, a "Log a status
// update" form (new status, any number of photos, an optional note),
// and a full History timeline of every logged update underneath.
export function BannerDetailScreen() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { data: banners } = useBanners();
  const { data: log, isLoading: logLoading } = useBannerStatusLog(id ?? '');
  const logUpdate = useLogBannerStatusUpdate();
  const updateArea = useUpdateBannerArea();
  const deleteBanner = useDeleteBanner();

  const banner = (banners ?? []).find((b) => b.id === id) ?? null;

  const [status, setStatus] = useState<BannerStatus | null>(null);
  const [areaDraft, setAreaDraft] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const captureRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  if (!banner) {
    return (
      <div className={styles.wrap}>
        <button type="button" className={styles.backBtn} onClick={() => navigate('/dashboard/banners')}>
          ← Back
        </button>
        <p className={styles.emptyMsg}>This banner may have been deleted.</p>
      </div>
    );
  }

  const st = BANNER_STATUS[banner.status] || BANNER_STATUS.placed;
  const currentStatus = status ?? banner.status;
  const currentArea = areaDraft ?? banner.area ?? '';

  async function handlePhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    try {
      const added = await Promise.all(files.map((f) => resizeImageToDataUri(f, 900, 900, 0.8)));
      setImages((prev) => [...prev, ...added]);
    } catch {
      setError('Could not read one of those images');
    }
  }

  async function save() {
    setError(null);
    if (!currentArea.trim()) {
      setError('Area is required');
      return;
    }
    try {
      // Area is a plain field on the banner itself, not part of the
      // append-only status-log history (unlike status/photos/note) --
      // real production fix: saved separately, alongside (not instead
      // of) the status-log write, since the two are independent.
      if (currentArea.trim() !== (banner!.area ?? '')) await updateArea.mutateAsync({ id: banner!.id, area: currentArea.trim() });
      await logUpdate.mutateAsync({ bannerId: banner!.id, status: currentStatus, note: note.trim(), images });
      setStatus(null);
      setAreaDraft(null);
      setNote('');
      setImages([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to log update');
    }
  }

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.backBtn} onClick={() => navigate('/dashboard/banners')}>
        ← Back
      </button>
      <div className={styles.head}>
        <div>
          <div className={styles.eyebrow}>{banner.area || ''}</div>
          <h1 className={styles.title}>{banner.name}</h1>
        </div>
        <span className={styles.tag} style={{ background: st.bg, color: st.color }}>
          {st.label}
        </span>
      </div>

      <div className={styles.card}>
        {banner.image && (
          // eslint-disable-next-line @next/next/no-img-element -- a stored data URI / remote photo, not worth next/image's remote-loader config for this
          <img src={banner.image} alt="" className={styles.bannerPhoto} />
        )}
        {banner.lat != null && banner.lng != null && (
          <a className={styles.directionsChip} href={directionsUrl(banner.lat, banner.lng)} target="_blank" rel="noopener noreferrer">
            📍 Directions
          </a>
        )}
        {banner.notes && <p className={styles.notes}>{banner.notes}</p>}
      </div>

      <div className={styles.sectitle}>Log a status update</div>
      <div className={styles.card}>
        <div className={styles.field}>
          <label className={styles.label}>Area</label>
          <input className={styles.input} placeholder="e.g. Spintex" value={currentArea} onChange={(e) => setAreaDraft(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>New status</label>
          <select className={styles.input} value={currentStatus} onChange={(e) => setStatus(e.target.value as BannerStatus)}>
            {BANNER_STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {BANNER_STATUS[s].label}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Photos</label>
          <div className={styles.photoRow}>
            <button type="button" className={styles.ghostBtn} onClick={() => captureRef.current?.click()}>
              📷 Take photo
            </button>
            <button type="button" className={styles.ghostBtn} onClick={() => galleryRef.current?.click()}>
              🖼️ Choose photos
            </button>
          </div>
          <input ref={captureRef} type="file" accept="image/*" capture="environment" hidden onChange={handlePhotos} />
          <input ref={galleryRef} type="file" accept="image/*" multiple hidden onChange={handlePhotos} />
          <p className={styles.hint}>add as many as support the current state</p>
          {images.length > 0 && (
            <div className={styles.photoPreviewRow}>
              {images.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element -- a locally-resized data URI preview, not worth next/image's remote-loader config
                <img key={i} src={src} alt="" className={styles.photoPreview} />
              ))}
            </div>
          )}
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Note</label>
          <textarea className={styles.input} placeholder="What changed, what you saw…" value={note} onChange={(e) => setNote(e.target.value)} style={{ minHeight: 60 }} />
        </div>
        {error && <p className={styles.errorMsg}>{error}</p>}
        <button type="button" className={styles.saveBtn} disabled={logUpdate.isPending} onClick={save}>
          {logUpdate.isPending ? 'Saving…' : 'Log update'}
        </button>
      </div>

      <div className={styles.sectitle}>
        History
        <span className={styles.cnt}>{log?.length ?? 0}</span>
      </div>
      {logLoading && <p className={styles.emptyMsg}>Loading…</p>}
      {!logLoading && (log ?? []).length === 0 && <p className={styles.emptyMsg}>No history yet</p>}
      <div className={styles.list}>
        {(log ?? []).map((entry) => {
          const entrySt = BANNER_STATUS[entry.status] || BANNER_STATUS.placed;
          return (
            <div key={entry.id} className={styles.logRow} style={{ borderLeftColor: entrySt.color }}>
              <div className={styles.logTop}>
                <div className={styles.logStatus}>
                  {entrySt.label}
                  {entry.changedByName ? ` · ${entry.changedByName}` : ''}
                </div>
                <div className={styles.logDate}>{(entry.createdAt || '').slice(0, 16).replace('T', ' ')}</div>
              </div>
              {entry.note && <div className={styles.logNote}>{entry.note}</div>}
              {entry.images.length > 0 && (
                <div className={styles.photoPreviewRow}>
                  {entry.images.map((src, i) => (
                    // eslint-disable-next-line @next/next/no-img-element -- a stored data URI photo, not worth next/image's remote-loader config
                    <img key={i} src={src} alt="" className={styles.logPhoto} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!confirmingDelete ? (
        <button type="button" className={styles.deleteBtn} onClick={() => setConfirmingDelete(true)}>
          Delete this banner
        </button>
      ) : (
        <div className={styles.card}>
          <p className={styles.hint}>
            Delete &quot;{banner.name}&quot;? This removes the banner and its whole status history — this can&apos;t be undone.
          </p>
          <div className={styles.confirmRow}>
            <button type="button" className={styles.ghostBtn} onClick={() => setConfirmingDelete(false)}>
              Cancel
            </button>
            <button
              type="button"
              className={styles.deleteBtn}
              style={{ flex: 1 }}
              disabled={deleting}
              onClick={async () => {
                setDeleting(true);
                try {
                  await deleteBanner.mutateAsync(banner!.id);
                  navigate('/dashboard/banners');
                } catch (e) {
                  setError(friendlyError(e, 'Failed to delete this banner'));
                  setDeleting(false);
                }
              }}
            >
              {deleting ? 'Deleting…' : 'Yes, delete'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
