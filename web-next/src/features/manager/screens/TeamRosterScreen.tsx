import { useState } from 'react';
import { useSetStaffActive, useTeamRoster } from '../hooks/useTeamRoster';
import type { Profile } from '../../../types/domain';
import styles from './TeamRosterScreen.module.css';

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

// Real `profiles.active` column + p_profiles_upd RLS (manager or own row
// only, confirmed live). Deactivating blocks sign-in but keeps historical
// leads/stats intact everywhere, including the Leaderboard -- matches
// index.html's own documented behavior for this exact toggle. Account
// CREATION (index.html's create-employee Edge Function, which provisions
// a real Supabase Auth user) is deliberately out of scope -- not something
// to wire up and exercise in a demo/testing pass. Position/address/ID/
// birthday and the per-tool access matrix (mgrStaffSettingsHtml's other
// two sections) are also out of scope for this first cut.
export function TeamRosterScreen() {
  const { data: roster, isLoading } = useTeamRoster();
  const activeCount = roster?.filter((r) => r.active).length ?? 0;

  return (
    <div className={styles.wrap}>
      <div className={styles.eyebrow}>Management</div>
      <h1 className={styles.title}>Team</h1>
      <p className={styles.sub}>{roster ? `${activeCount} active of ${roster.length}` : 'Deactivating blocks sign-in but keeps historical leads & stats intact everywhere.'}</p>

      {isLoading && <p style={{ color: 'var(--c-muted)' }}>Loading…</p>}

      {/* Employee-card grid, adapted from the HR-admin-panel pattern studied
          on Dribbble/Figma this session (avatar + status badge + role +
          contact + action buttons in a card, not a plain row list) --
          using only fields this app's real Profile actually has (name,
          role, email, active). No department/join-date/etc invented. */}
      <div className={styles.grid}>
        {roster?.map((s) => (
          <StaffCard key={s.key} staff={s} />
        ))}
      </div>
    </div>
  );
}

function StaffCard({ staff }: { staff: Profile }) {
  const setActive = useSetStaffActive();
  const [confirming, setConfirming] = useState(false);

  return (
    <div className={styles.card}>
      <div className={styles.cardTop}>
        <span className={`${styles.avatar} ${!staff.active ? styles.avatarDim : ''}`}>{initials(staff.name)}</span>
        <span className={`${styles.statusPill} ${staff.active ? styles.statusActive : styles.statusInactive}`}>{staff.active ? 'Active' : 'Deactivated'}</span>
      </div>
      <div className={styles.name}>{staff.name}</div>
      <div className={styles.role}>{staff.role === 'manager' ? 'Manager' : 'Sales Agent'}</div>
      {staff.email && <div className={styles.email}>{staff.email}</div>}

      {!confirming ? (
        <button type="button" className={staff.active ? styles.deactivateBtn : styles.reactivateBtn} disabled={setActive.isPending} onClick={() => setConfirming(true)}>
          {staff.active ? 'Deactivate' : 'Reactivate'}
        </button>
      ) : (
        <div className={styles.confirmBox}>
          <span className={styles.confirmText}>{staff.active ? `Deactivate ${staff.name.split(' ')[0]}? They won't be able to sign in.` : `Reactivate ${staff.name.split(' ')[0]}?`}</span>
          <div className={styles.confirmActions}>
            <button
              type="button"
              className={staff.active ? styles.deactivateBtn : styles.reactivateBtn}
              disabled={setActive.isPending}
              onClick={() => setActive.mutate({ key: staff.key, active: !staff.active }, { onSuccess: () => setConfirming(false) })}
            >
              {setActive.isPending ? '…' : 'Confirm'}
            </button>
            <button type="button" className={styles.cancelBtn} onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
