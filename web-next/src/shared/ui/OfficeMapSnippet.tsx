import { Icon } from './Icon';
import styles from './OfficeMapSnippet.module.css';

interface OfficeMapSnippetProps {
  lat: number | null | undefined;
  lng: number | null | undefined;
  officeName?: string | null;
  distanceMeters?: number | null;
  tall?: boolean;
}

// ATTENDANCE_BLUEPRINT.md §7 -- reusable keyless map embed (same
// no-API-key pattern v1 already used, no billing risk, no key to leak),
// used in the off-site sign-in modal, the office-location admin screen,
// and the per-record detail modal. When no coordinates were ever
// captured (denied/unsupported geolocation), render a muted placeholder
// instead of a broken iframe -- never silently fail.
export function OfficeMapSnippet({ lat, lng, officeName, distanceMeters, tall }: OfficeMapSnippetProps) {
  if (lat == null || lng == null) {
    return <div className={styles.placeholder}>No location captured for this entry.</div>;
  }

  const src = `https://www.google.com/maps?q=${lat},${lng}&z=16&output=embed`;

  return (
    <div>
      <iframe className={`${styles.frame} ${tall ? styles.tall : ''}`} src={src} loading="lazy" title="Location map" />
      {distanceMeters != null && officeName && (
        <div className={styles.caption}>
          <Icon name="pin" size={12} />
          {Math.round(distanceMeters)}m from {officeName}
        </div>
      )}
    </div>
  );
}
