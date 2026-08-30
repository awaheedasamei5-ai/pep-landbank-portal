import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { Role } from '../types/domain';
import { useSessionStore } from './useSessionStore';
import { useLiveLogin } from './useLiveLogin';
import { isConfigured } from '../shared/lib/env';
import styles from './LoginScreen.module.css';

// Demo path matches index.html's demo login (renderLoginMode(), role
// picker, no real auth). Live path is real Supabase Auth -- see
// useLiveLogin.ts's own comment for exactly what's ported vs deferred
// from index.html's fuller doLogin(). The toggle only shows when
// VITE_SUPABASE_URL/ANON_KEY are actually configured -- an unconfigured
// build (no .env.local) has no live backend to sign in against, so
// showing the option there would just be a guaranteed-broken button.
export function LoginScreen() {
  const login = useSessionStore((s) => s.login);
  const navigate = useNavigate();
  const liveLogin = useLiveLogin();
  const [mode, setMode] = useState<'demo' | 'live'>('demo');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const liveAvailable = isConfigured('supabaseUrl') && isConfigured('supabaseAnonKey');

  function pickDemo(role: Role) {
    login(role);
    navigate(role === 'manager' ? '/app/mgr' : '/app/home', { replace: true });
  }

  async function submitLive(e: React.FormEvent) {
    e.preventDefault();
    const profile = await liveLogin.mutateAsync({ email: email.trim(), password }).catch(() => null);
    if (profile) navigate(profile.role === 'manager' ? '/app/mgr' : '/app/home', { replace: true });
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

        {mode === 'live' && (
          <form onSubmit={submitLive}>
            <p className={styles.sub}>Sign in</p>
            <input className={styles.input} type="email" placeholder="Work email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <input className={styles.input} type="password" placeholder="Password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            {liveLogin.isError && <p className={styles.error}>{(liveLogin.error as Error).message}</p>}
            <button type="submit" className={styles.btnAgent} disabled={liveLogin.isPending}>
              {liveLogin.isPending ? 'Signing in…' : 'Sign in'}
            </button>
            <button type="button" className={styles.modeLink} onClick={() => setMode('demo')}>
              ← Back to demo data
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
