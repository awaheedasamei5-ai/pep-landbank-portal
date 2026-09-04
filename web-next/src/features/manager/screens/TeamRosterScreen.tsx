import { useState } from 'react';
import { useCreateStaffInvite, useRemoveStaffInvite, useSetStaffActive, useStaffInvites, useTeamRoster } from '../hooks/useTeamRoster';
import type { Profile, StaffInvite } from '../../../types/domain';
import { friendlyError } from '../../../shared/lib/friendlyError';
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
// index.html's own documented behavior for this exact toggle.
//
// New-staff invites (2026-09-04): closes a real security gap found while
// scoping this -- handle_new_auth_user() used to create a real 'agent'
// profile for ANY email that called supabase.auth.signUp(), with
// allowed_emails never actually checked despite existing. Fixed at the
// trigger level (rejects an uninvited sign-up outright); this screen is
// the manager side of that gate. The actual account-creation step (a new
// hire filling in name/email/password) is the public join screen
// (auth/useJoinPortal.ts), reached from the login screen's staff picker.
// Position/address/ID/birthday and the per-tool access matrix
// (mgrStaffSettingsHtml's other two sections) stay out of scope.
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

      <InviteSection />
    </div>
  );
}

function InviteSection() {
  const { data: invites, isLoading } = useStaffInvites();
  const create = useCreateStaffInvite();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    setError(null);
    try {
      await create.mutateAsync({ email, name });
      setName('');
      setEmail('');
      setShowForm(false);
    } catch (err) {
      setError(friendlyError(err, 'Could not send the invite'));
    }
  }

  return (
    <div className={styles.inviteSection}>
      <div className={styles.inviteHead}>
        <div className={styles.eyebrow}>Invites</div>
        <button type="button" className={styles.inviteToggleBtn} onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancel' : '+ Invite new staff'}
        </button>
      </div>
      <p className={styles.sub} style={{ marginTop: 4 }}>
        Only invited emails can create an account -- anyone else who tries is rejected automatically.
      </p>

      {showForm && (
        <form className={styles.inviteForm} onSubmit={submit}>
          <input className={styles.inviteInput} placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className={styles.inviteInput} type="email" placeholder="Work email" value={email} onChange={(e) => setEmail(e.target.value)} />
          {error && <p className={styles.inviteError}>{error}</p>}
          <button type="submit" className={styles.inviteSubmitBtn} disabled={create.isPending || !name.trim() || !email.trim()}>
            {create.isPending ? 'Sending…' : 'Send invite'}
          </button>
        </form>
      )}

      {isLoading && <p style={{ color: 'var(--c-muted)', fontSize: 13 }}>Loading…</p>}
      {!isLoading && invites && invites.length === 0 && <p style={{ color: 'var(--c-muted)', fontSize: 13 }}>No pending invites.</p>}
      {invites && invites.length > 0 && (
        <div className={styles.inviteList}>
          {invites.map((inv) => (
            <InviteRow key={inv.email} invite={inv} />
          ))}
        </div>
      )}
    </div>
  );
}

function InviteRow({ invite }: { invite: StaffInvite }) {
  const remove = useRemoveStaffInvite();
  return (
    <div className={styles.inviteRow}>
      <div>
        <div className={styles.inviteName}>{invite.name}</div>
        <div className={styles.inviteEmail}>{invite.email}</div>
      </div>
      <button type="button" className={styles.inviteRemoveBtn} disabled={remove.isPending} onClick={() => remove.mutate(invite.email)}>
        {remove.isPending ? '…' : 'Revoke'}
      </button>
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
