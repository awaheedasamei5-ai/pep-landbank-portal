import { useNavigate } from 'react-router';
import { usePermissions } from '../hooks/usePermissions';
import styles from './PermissionsScreen.module.css';

// New surface this session: a grant/revoke matrix over the permission-
// record model built to replace hardcoded staff-key arrays in RLS (see
// PHASE0_INVENTORY.md §4). No equivalent screen exists in index.html --
// that app has no permission-record model at all, only the hardcoded
// arrays this one is meant to eventually fully replace.
export function PermissionsScreen() {
  const navigate = useNavigate();
  const { isLoading, defs, staff, isGranted, toggle, isPending } = usePermissions();

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.backBtn} onClick={() => navigate(-1)}>
        ← Back
      </button>
      <div className={styles.eyebrow}>System Health</div>
      <h1 className={styles.title}>Permissions</h1>
      <p className={styles.sub}>Who can do what, beyond the default agent/manager split. Tap a cell to grant or revoke.</p>

      {isLoading && <p className={styles.emptyMsg}>Loading…</p>}

      {!isLoading && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.permHeader}>Permission</th>
                {staff.map((s) => (
                  <th key={s.key} className={styles.staffHeader}>
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {defs.map((def) => (
                <tr key={def.key}>
                  <td className={styles.permCell}>
                    <div className={styles.permLabel}>{def.label}</div>
                    {def.description && <div className={styles.permDesc}>{def.description}</div>}
                  </td>
                  {staff.map((s) => {
                    const granted = isGranted(s.key, def.key);
                    return (
                      <td key={s.key} className={styles.toggleCell}>
                        <button
                          type="button"
                          className={`${styles.toggle} ${granted ? styles.toggleOn : ''}`}
                          disabled={isPending}
                          aria-pressed={granted}
                          aria-label={`${granted ? 'Revoke' : 'Grant'} ${def.label} for ${s.name}`}
                          onClick={() => toggle(s.key, def.key)}
                        >
                          {granted ? '✓' : ''}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className={styles.note}>Every change here is recorded in the Audit Log. Manager always has every permission — not shown as a column.</p>
    </div>
  );
}
