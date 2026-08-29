import { useNavigate } from 'react-router';
import type { Role } from '../types/domain';
import { useSessionStore } from './useSessionStore';
import styles from './LoginScreen.module.css';

// DEMO_MODE-only login (matches index.html's demo login path,
// renderLoginMode()) -- role picker, no real Supabase auth. Live-mode auth
// is explicitly deferred past Phase 1.
export function LoginScreen() {
  const login = useSessionStore((s) => s.login);
  const navigate = useNavigate();

  function pick(role: Role) {
    login(role);
    navigate(role === 'manager' ? '/app/mgr' : '/app/home', { replace: true });
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <h1 className={styles.title}>Palmstead</h1>
        <p className={styles.sub}>Demo data · sign in as</p>
        <button type="button" className={styles.btnAgent} onClick={() => pick('agent')}>
          Elias (Agent)
        </button>
        <button type="button" className={styles.btnManager} onClick={() => pick('manager')}>
          Management (Manager)
        </button>
      </div>
    </div>
  );
}
