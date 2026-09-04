import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useSessionStore } from '../../../auth/useSessionStore';
import { demoReset } from '../../../data/demo/store';
import { getSupabaseClient } from '../../../data/client';
import { pinLockExists, removePinLock, savePinLock } from '../../../shared/lib/pinLock';
import { useUpdateSignature } from '../hooks/useSignature';
import { useEnablePushNotifications, getPushSupportState, type PushSupportState } from '../hooks/usePushNotifications';
import styles from './MoreScreen.module.css';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

// A genuine gap this fills, not a cosmetic add: useSessionStore.logout()
// has existed since Phase 1 but nothing in the app ever called it -- there
// was no way to actually sign out. Demo data reset was similarly only
// reachable via clearing localStorage by hand.
export function MoreScreen() {
  const navigate = useNavigate();
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const logout = useSessionStore((s) => s.logout);
  const updateSignature = useUpdateSignature();
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [pushState, setPushState] = useState<PushSupportState>(() => getPushSupportState());
  const enablePush = useEnablePushNotifications();
  const [pinOn, setPinOn] = useState(() => (profile ? pinLockExists(profile.key) : false));
  const [showPinForm, setShowPinForm] = useState(false);
  const [pin1, setPin1] = useState('');
  const [pin2, setPin2] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSaving, setPinSaving] = useState(false);

  // Ported from index.html's saveAccountPin() (17098-17109) -- encrypts
  // the CURRENT real session's tokens with a PIN-derived key, stored only
  // on this device (shared/lib/pinLock.ts). Only meaningful in live mode
  // -- demo mode has no real Supabase session for a PIN to unlock later.
  async function handleSavePin() {
    setPinError(null);
    if (!/^\d{4,6}$/.test(pin1)) {
      setPinError('PIN must be 4-6 digits');
      return;
    }
    if (pin1 !== pin2) {
      setPinError('PINs do not match');
      return;
    }
    if (!profile) return;
    setPinSaving(true);
    try {
      const client = getSupabaseClient();
      const { data, error } = (await client?.auth.getSession()) ?? { data: null, error: new Error('Not configured') };
      if (error || !data?.session) {
        setPinError('Could not read your session -- try signing out and back in.');
        return;
      }
      await savePinLock(profile.key, pin1, data.session);
      setPinOn(true);
      setShowPinForm(false);
      setPin1('');
      setPin2('');
    } catch {
      setPinError('Could not save a PIN on this device/browser.');
    } finally {
      setPinSaving(false);
    }
  }

  function handleTurnOffPin() {
    if (!profile) return;
    removePinLock(profile.key);
    setPinOn(false);
  }

  async function handleEnablePush() {
    try {
      await enablePush.mutateAsync();
      setPushState(getPushSupportState());
    } catch {
      setPushState(getPushSupportState());
    }
  }

  async function handleSignatureFile(file: File | null) {
    try {
      await updateSignature.mutateAsync(file);
    } catch {
      // A failed upload leaves the previous signature (or lack of one)
      // untouched -- nothing further to reconcile client-side.
    }
  }

  function handleResetClick() {
    if (!confirmingReset) {
      setConfirmingReset(true);
      return;
    }
    demoReset();
    // A full reload is the simplest reliable way to reflect a reset that
    // touches every resource at once -- reaching into every feature's
    // TanStack Query cache to invalidate it individually would be far
    // more fragile than just reloading, for an action this rare.
    window.location.reload();
  }

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  if (!profile) return null;

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>More</h1>

      <div className={styles.profileCard}>
        <div className={styles.avatar}>{initials(profile.name)}</div>
        <div>
          <div className={styles.name}>{profile.name}</div>
          <div className={styles.meta}>{profile.key}</div>
          <span className={styles.roleBadge}>{profile.role === 'manager' ? 'Management' : 'Agent'}</span>
        </div>
      </div>

      <div className={styles.sectionTitle}>App</div>
      <div className={styles.card}>
        <div className={styles.row}>
          <div>
            <div className={styles.rowLabel}>Data source</div>
            <div className={styles.rowSub}>Where this app is reading and writing</div>
          </div>
          {demoMode && <span className={`${styles.pill} ${styles.pillDemo}`}>Demo mode</span>}
        </div>
        {demoMode && (
          <div className={styles.row}>
            <div>
              <div className={styles.rowLabel}>Reset demo data</div>
              <div className={styles.rowSub}>Wipes your local demo changes, reseeds the sample data</div>
            </div>
            <button type="button" className={`${styles.actionBtn} ${confirmingReset ? styles.warn : ''}`} onClick={handleResetClick}>
              {confirmingReset ? 'Confirm reset' : 'Reset'}
            </button>
          </div>
        )}
        {pushState !== 'unsupported' && (
          <div className={styles.row}>
            <div>
              <div className={styles.rowLabel}>Push notifications</div>
              <div className={styles.rowSub}>
                {pushState === 'granted'
                  ? 'Enabled on this device'
                  : pushState === 'denied'
                    ? 'Blocked -- enable notifications for this site in your browser settings'
                    : 'Get alerted here even when the app is closed'}
              </div>
            </div>
            {pushState === 'granted' ? (
              <span className={styles.pill}>On</span>
            ) : (
              <button type="button" className={styles.actionBtn} disabled={pushState === 'denied' || enablePush.isPending} onClick={handleEnablePush}>
                {enablePush.isPending ? 'Enabling...' : 'Enable'}
              </button>
            )}
          </div>
        )}
      </div>

      <div className={styles.sectionTitle}>Tools</div>
      <div className={styles.card}>
        <div className={styles.row}>
          <div>
            <div className={styles.rowLabel}>My Portfolio</div>
            <div className={styles.rowSub}>Your rank, gap to the next spot, and every achievement badge earned</div>
          </div>
          <button type="button" className={styles.actionBtn} onClick={() => navigate('/app/portfolio')}>
            Open
          </button>
        </div>
        <div className={styles.row}>
          <div>
            <div className={styles.rowLabel}>Smart Insights</div>
            <div className={styles.rowSub}>Proactive nudges auto-generated from {profile.role === 'manager' ? 'company-wide' : 'your'} live data</div>
          </div>
          <button type="button" className={styles.actionBtn} onClick={() => navigate('/app/insights')}>
            Open
          </button>
        </div>
        <div className={styles.row}>
          <div>
            <div className={styles.rowLabel}>Data Check</div>
            <div className={styles.rowSub}>Scan {profile.role === 'manager' ? 'the company' : 'your pipeline'} for pricing/payment inconsistencies</div>
          </div>
          <button type="button" className={styles.actionBtn} onClick={() => navigate('/app/data-check')}>
            Open
          </button>
        </div>
        <div className={styles.row}>
          <div>
            <div className={styles.rowLabel}>Document Vault</div>
            <div className={styles.rowSub}>{profile.role === 'manager' ? 'Every file downloaded by the team' : "Everything you've downloaded from this account"}</div>
          </div>
          <button type="button" className={styles.actionBtn} onClick={() => navigate('/app/vault')}>
            Open
          </button>
        </div>
      </div>

      <div className={styles.sectionTitle}>E-signature</div>
      <div className={styles.card}>
        <div className={styles.sigRow}>
          <div className={styles.sigPreview}>{profile.signatureData ? <img src={profile.signatureData} alt="Your saved signature" /> : 'No signature yet'}</div>
          <div className={styles.sigCol}>
            <input className={styles.sigFileInput} type="file" accept="image/png,image/jpeg" disabled={updateSignature.isPending} onChange={(e) => handleSignatureFile(e.target.files?.[0] ?? null)} />
            <div className={styles.sigHint}>PNG/JPEG, white or transparent background. Auto-signs your receipts, quotations &amp; approvals.</div>
          </div>
        </div>
        {profile.signatureData && (
          <div className={styles.sigRemoveRow}>
            <button type="button" className={styles.sigRemoveBtn} disabled={updateSignature.isPending} onClick={() => handleSignatureFile(null)}>
              Remove signature
            </button>
          </div>
        )}
      </div>

      <div className={styles.sectionTitle}>Account</div>
      <div className={styles.card}>
        {!demoMode && (
          <div className={styles.row}>
            <div>
              <div className={styles.rowLabel}>PIN sign-in</div>
              <div className={styles.rowSub}>{pinOn ? 'On for this device -- skip typing your password next time' : 'Skip your password on this device with a 4-6 digit PIN'}</div>
            </div>
            {pinOn ? (
              <button type="button" className={styles.actionBtn} onClick={handleTurnOffPin}>
                Turn off
              </button>
            ) : (
              <button type="button" className={styles.actionBtn} onClick={() => setShowPinForm((v) => !v)}>
                {showPinForm ? 'Cancel' : 'Turn on'}
              </button>
            )}
          </div>
        )}
        {!demoMode && showPinForm && !pinOn && (
          <div className={styles.row} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
            <input className={styles.sigFileInput} style={{ padding: '10px 12px', border: '1px solid var(--c-line)', borderRadius: 10 }} type="password" inputMode="numeric" placeholder="New PIN (4-6 digits)" value={pin1} onChange={(e) => setPin1(e.target.value.replace(/\D/g, '').slice(0, 6))} />
            <input className={styles.sigFileInput} style={{ padding: '10px 12px', border: '1px solid var(--c-line)', borderRadius: 10 }} type="password" inputMode="numeric" placeholder="Confirm PIN" value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, '').slice(0, 6))} />
            {pinError && <div className={styles.sigHint} style={{ color: 'var(--c-danger)' }}>{pinError}</div>}
            <button type="button" className={styles.actionBtn} disabled={pinSaving} onClick={handleSavePin}>
              {pinSaving ? 'Saving…' : 'Save PIN'}
            </button>
          </div>
        )}
        <div className={styles.row}>
          <div>
            <div className={styles.rowLabel}>Sign out</div>
            <div className={styles.rowSub}>You'll need to pick a role again to sign back in</div>
          </div>
          <button type="button" className={`${styles.actionBtn} ${styles.danger}`} onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </div>

      <div className={styles.version}>Palmstead V2 -- web-next preview build</div>
    </div>
  );
}
