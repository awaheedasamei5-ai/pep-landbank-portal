import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Icon, type IconName } from '../../../shared/ui/Icon';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useDocumentVault } from '../hooks/useDocumentVault';
import styles from './DocumentVaultScreen.module.css';

const KIND_ICON: Record<string, IconName> = { pdf: 'document', excel: 'barChart', csv: 'barChart' };

function fmtDate(iso: string): string {
  return iso.slice(0, 16).replace('T', ' ');
}

function dataUriToBlobUrl(dataUri: string): string {
  const comma = dataUri.indexOf(',');
  const header = dataUri.slice(0, comma);
  const b64 = dataUri.slice(comma + 1);
  const mime = /data:(.*?);base64/.exec(header)?.[1] ?? 'application/octet-stream';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

// Port of index.html's Document Vault (viewDownloads(), index.html:9125-
// 9166) -- "every file you've generated or downloaded." Scoped down from
// the original for this first cut: list + re-download only. "View"
// (an in-app preview modal, openFilePreview()) and "Send" (native share
// sheet) are real, separable features, not built here. The "quick
// access: create a document" shortcuts row is also left out -- every one
// of those destinations is already one tap away from Reports/Insights
// Hub/Office Desk.
//
// Real, honest coverage note: only this session's own report generators
// (Management Report, Staff Report, Commission Report, Company Report
// Excel, Master/Agent Pipeline Excel) log here so far -- Contract of
// Sale, Quotation, Payment Receipt, Technical Quotation, Leave, Fund
// Request, and Site Visit Authorization's PDFs were all built in earlier
// sessions and don't call useLogDownload() yet. Retrofitting those is
// real, deliberately deferred work, not silently dropped.
export function DocumentVaultScreen() {
  const navigate = useNavigate();
  const profile = useSessionStore((s) => s.profile);
  const { data: downloads, isLoading } = useDocumentVault();
  const [kindFilter, setKindFilter] = useState<string | null>(null);

  const all = downloads ?? [];
  const kinds = [...new Set(all.map((d) => d.kind))];
  const list = kindFilter ? all.filter((d) => d.kind === kindFilter) : all;

  function redownload(fileData: string | null, filename: string) {
    if (!fileData) return;
    const url = dataUriToBlobUrl(fileData);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.backBtn} onClick={() => navigate(-1)}>
        ← Back
      </button>
      <div className={styles.eyebrow}>Document Vault</div>
      <h1 className={styles.title}>
        {all.length} file{all.length === 1 ? '' : 's'}
      </h1>
      <p className={styles.sub}>{profile?.role === 'manager' ? 'Every file downloaded by the team' : 'Everything you have downloaded from this account'}</p>

      {isLoading && <p className={styles.emptyMsg}>Loading…</p>}

      {kinds.length > 1 && (
        <div className={styles.filterRow}>
          <button type="button" className={`${styles.chip} ${!kindFilter ? styles.chipOn : ''}`} onClick={() => setKindFilter(null)}>
            All
          </button>
          {kinds.map((k) => (
            <button key={k} type="button" className={`${styles.chip} ${kindFilter === k ? styles.chipOn : ''}`} onClick={() => setKindFilter(k)}>
              {k.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      {!isLoading && list.length === 0 && <p className={styles.emptyMsg}>Nothing here yet — PDFs and Excel exports you generate will show up here.</p>}

      <div className={styles.list}>
        {list.map((d) => (
          <div className={styles.row} key={d.id}>
            <span className={styles.iconBubble}>
              <Icon name={KIND_ICON[d.kind] ?? 'folder'} size={17} />
            </span>
            <div className={styles.rowBody}>
              <div className={styles.filename}>{d.filename}</div>
              <div className={styles.meta}>
                {fmtDate(d.createdAt)}
                {profile?.role === 'manager' ? ` · ${d.userName}` : ''}
              </div>
            </div>
            <div className={styles.rowRight}>
              <span className={styles.kindTag}>{d.kind.toUpperCase()}</span>
              {d.fileData && (
                <button type="button" className={styles.dlBtn} onClick={() => redownload(d.fileData, d.filename)}>
                  ⬇
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
