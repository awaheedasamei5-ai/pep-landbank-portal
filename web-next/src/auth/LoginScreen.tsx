import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import type { Role } from '../types/domain';
import { useSessionStore } from './useSessionStore';
import { useLiveLogin } from './useLiveLogin';
import { usePinLogin } from './usePinLogin';
import { useSendResetCode, useConfirmReset } from './usePasswordReset';
import { isConfigured } from '../shared/lib/env';
import { fetchStaffDirectory, type StaffDirectoryEntry } from '../data/staffDirectoryClient';
import { pinLockExists } from '../shared/lib/pinLock';
import styles from './LoginScreen.module.css';

// Demo path matches index.html's demo login (renderLoginMode(), role
// picker, no real auth). Live path is real Supabase Auth -- see
// useLiveLogin.ts's own comment for exactly what's ported vs deferred
// from index.html's fuller doLogin(). The toggle only shows when
// VITE_SUPABASE_URL/ANON_KEY are actually configured -- an unconfigured
// build (no .env.local) has no live backend to sign in against, so
// showing the option there would just be a guaranteed-broken button.
//
// Live mode includes the real staff-picker-before-password step
// (index.html's refreshStaffList()/selectStaff()), PIN quick-unlock
// (usePinLogin.ts/shared/lib/pinLock.ts), and in-app password reset
// (usePasswordReset.ts -- email -> 6-digit code -> new password, no
// redirect link) -- all ported 2026-09-04. If this device has a PIN
// saved for the selected staff member (turned on from More > Account),
// the PIN input replaces the password field by default, with a plain
// toggle back to password. Deliberately still NOT ported: a manager-
// facing new-staff-invite flow -- a real, separable feature.
export function LoginScreen() {
  const login = useSessionStore((s) => s.login);
  const navigate = useNavigate();
  const liveLogin = useLiveLogin();
  const pinLogin = usePinLogin();
  const sendResetCode = useSendResetCode();
  const confirmReset = useConfirmReset();
  const [mode, setMode] = useState<'demo' | 'live' | 'reset'>('demo');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<StaffDirectoryEntry | null>(null);
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [useLoginMode, setUseLoginMode] = useState<'pin' | 'password'>('password');
  const [resetStep, setResetStep] = useState<'email' | 'code'>('email');
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetPw1, setResetPw1] = useState('');
  const [resetPw2, setResetPw2] = useState('');
  const [resetPwMismatch, setResetPwMismatch] = useState<string | null>(null);
  const [resetDone, setResetDone] = useState(false);
  const liveAvailable = isConfigured('supabaseUrl') && isConfigured('supabaseAnonKey');

  const { data: staff } = useQuery({ queryKey: ['staffDirectory'], queryFn: fetchStaffDirectory, enabled: mode === 'live' });
  const q = query.trim().toLowerCase();
  const matches = (staff ?? []).filter((s) => s.name.toLowerCase().includes(q));

  function pickDemo(role: Role) {
    login(role);
    navigate(role === 'manager' ? '/app/mgr' : '/app/home', { replace: true });
  }

  function pickStaff(s: StaffDirectoryEntry) {
    setSelected(s);
    setQuery('');
    setUseLoginMode(pinLockExists(s.key) ? 'pin' : 'password');
  }

  async function submitLive(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    if (useLoginMode === 'pin') {
      const profile = await pinLogin.mutateAsync({ agentKey: selected.key, pin }).catch(() => null);
      if (profile) navigate(profile.role === 'manager' ? '/app/mgr' : '/app/home', { replace: true });
      else if (!pinLockExists(selected.key)) setUseLoginMode('password');
      return;
    }
    const profile = await liveLogin.mutateAsync({ email: selected.email, password }).catch(() => null);
    if (profile) navigate(profile.role === 'manager' ? '/app/mgr' : '/app/home', { replace: true });
  }

  const activeError = useLoginMode === 'pin' ? pinLogin.error : liveLogin.error;
  const isPending = useLoginMode === 'pin' ? pinLogin.isPending : liveLogin.isPending;

  function openReset() {
    setResetEmail(selected?.email ?? '');
    setResetStep('email');
    setResetCode('');
    setResetPw1('');
    setResetPw2('');
    setResetPwMismatch(null);
    setResetDone(false);
    setMode('reset');
  }

  function backFromReset() {
    setMode('live');
  }

  async function submitSendCode(e: React.FormEvent) {
    e.preventDefault();
    if (!resetEmail.trim()) return;
    await sendResetCode.mutateAsync(resetEmail.trim()).then(
      () => setResetStep('code'),
      () => {},
    );
  }

  async function submitConfirmReset(e: React.FormEvent) {
    e.preventDefault();
    setResetPwMismatch(null);
    if (!/^\d{4,10}$/.test(resetCode.trim())) {
      setResetPwMismatch('Enter the code from your email.');
      return;
    }
    if (resetPw1.length < 6) {
      setResetPwMismatch('Password must be at least 6 characters.');
      return;
    }
    if (resetPw1 !== resetPw2) {
      setResetPwMismatch('Passwords do not match.');
      return;
    }
    await confirmReset.mutateAsync({ email: resetEmail.trim(), code: resetCode.trim(), password: resetPw1 }).then(
      () => setResetDone(true),
      () => {},
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <h1 className={styles.title}>Palmstead</h1>

        {mode === 'demo' && (
          <>
            <p className={styles.sub}>Demo data · sign in as</p>
            <button type="button" className={styles.btnAgent} onClick={() => pickDemo('agent')}>
              Elias (Agent)
            </button>
            <button type="button" className={styles.btnManager} onClick={() => pickDemo('manager')}>
              Management (Manager)
            </button>
            {liveAvailable && (
              <button type="button" className={styles.modeLink} onClick={() => setMode('live')}>
                Sign in with a real account →
              </button>
            )}
          </>
        )}

        {mode === 'live' && !selected && (
          <>
            <p className={styles.sub}>Sign in · who are you?</p>
            <input className={styles.input} placeholder="Search your name…" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
            <div className={styles.staffList}>
              {matches.map((s) => (
                <button key={s.key} type="button" className={styles.staffItem} onClick={() => pickStaff(s)}>
                  {s.name}
                </button>
              ))}
              {staff && matches.length === 0 && <p className={styles.noMatch}>No staff match &quot;{query}&quot;.</p>}
            </div>
            <button type="button" className={styles.modeLink} onClick={() => setMode('demo')}>
              ← Back to demo data
            </button>
          </>
        )}

        {mode === 'live' && selected && (
          <form onSubmit={submitLive}>
            <p className={styles.sub}>Sign in</p>
            <button type="button" className={styles.selectedStaff} onClick={() => setSelected(null)}>
              {selected.name} <span className={styles.changeLink}>Change</span>
            </button>
            {useLoginMode === 'pin' ? (
              <input
                className={styles.input}
                type="password"
                inputMode="numeric"
                placeholder="PIN"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                autoFocus
              />
            ) : (
              <input className={styles.input} type="password" placeholder="Password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
            )}
            {activeError && <p className={styles.error}>{(activeError as Error).message}</p>}
            <button type="submit" className={styles.btnAgent} disabled={isPending}>
              {isPending ? (useLoginMode === 'pin' ? 'Unlocking…' : 'Signing in…') : 'Sign in'}
            </button>
            {pinLockExists(selected.key) && (
              <button type="button" className={styles.modeLink} onClick={() => setUseLoginMode((m) => (m === 'pin' ? 'password' : 'pin'))}>
                {useLoginMode === 'pin' ? 'Use password instead' : 'Use PIN instead'}
              </button>
            )}
            {useLoginMode === 'password' && (
              <button type="button" className={styles.modeLink} onClick={openReset}>
                Forgot password?
              </button>
            )}
            <button type="button" className={styles.modeLink} onClick={() => setSelected(null)}>
              ← Not you?
            </button>
          </form>
        )}

        {mode === 'reset' && (
          <>
            <p className={styles.sub}>Reset your password</p>
            {resetDone ? (
              <>
                <p className={styles.resetDoneMsg}>Password updated — sign in with your new password.</p>
                <button type="button" className={styles.btnAgent} onClick={backFromReset}>
                  Back to sign in
                </button>
              </>
            ) : resetStep === 'email' ? (
              <form onSubmit={submitSendCode}>
                <input className={styles.input} type="email" placeholder="Your work email" autoComplete="username" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} required autoFocus />
                {sendResetCode.isError && <p className={styles.error}>{(sendResetCode.error as Error).message}</p>}
                <button type="submit" className={styles.btnAgent} disabled={sendResetCode.isPending}>
                  {sendResetCode.isPending ? 'Sending…' : 'Send code'}
                </button>
                <button type="button" className={styles.modeLink} onClick={backFromReset}>
                  ← Back
                </button>
              </form>
            ) : (
              <form onSubmit={submitConfirmReset}>
                <p className={styles.resetSentMsg}>Code sent to {resetEmail}</p>
                <input className={styles.input} placeholder="6-digit code" inputMode="numeric" value={resetCode} onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 10))} required autoFocus />
                <input className={styles.input} type="password" placeholder="New password" autoComplete="new-password" value={resetPw1} onChange={(e) => setResetPw1(e.target.value)} required />
                <input className={styles.input} type="password" placeholder="Confirm new password" autoComplete="new-password" value={resetPw2} onChange={(e) => setResetPw2(e.target.value)} required />
                {(resetPwMismatch || confirmReset.isError) && <p className={styles.error}>{resetPwMismatch ?? (confirmReset.error as Error).message}</p>}
                <button type="submit" className={styles.btnAgent} disabled={confirmReset.isPending}>
                  {confirmReset.isPending ? 'Setting password…' : 'Set new password'}
                </button>
                <button type="button" className={styles.modeLink} onClick={backFromReset}>
                  ← Back
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
