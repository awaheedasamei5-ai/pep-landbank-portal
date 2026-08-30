import { useEffect, useState, type ReactNode } from 'react';
import { getSupabaseClient } from '../data/client';
import { mapProfileRow } from '../data/mappers';
import { useSessionStore } from './useSessionStore';

// Restores (or invalidates) a live session on every fresh app load.
// useSessionStore persists `profile`/`demoMode` to localStorage, but the
// actual thing that authorizes every RLS-gated query is Supabase's OWN
// session (a separate token it manages in its own localStorage key) --
// those two can drift apart (a token expires, a device is shared, a
// manager deactivates the account mid-session). This is the one place
// that reconciles them, checked once per app boot before any route
// renders, so RequireAuth never trusts a stale persisted profile that no
// longer has a real session behind it.
//
// Demo sessions skip this entirely -- no Supabase session ever exists
// for demo mode, so there's nothing to verify and no reason to make a
// network call before the app can render.
export function LiveSessionGate({ children }: { children: ReactNode }) {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  const loginLive = useSessionStore((s) => s.loginLive);
  const [ready, setReady] = useState(demoMode || !profile);

  useEffect(() => {
    if (demoMode || !profile) {
      setReady(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const client = getSupabaseClient();
      const {
        data: { session },
      } = (await client?.auth.getSession()) ?? { data: { session: null } };
      if (cancelled) return;
      if (!session) {
        // Persisted store says "live", but the real session is gone --
        // clear the stale profile so RequireAuth sends them to /login
        // instead of rendering an authenticated shell that every query
        // inside will immediately fail RLS on.
        useSessionStore.setState({ profile: null });
        setReady(true);
        return;
      }
      const { data: row } = (await client?.from('profiles').select('*').eq('id', session.user.id).maybeSingle()) ?? { data: null };
      if (cancelled) return;
      if (!row || row.active === false) {
        await client?.auth.signOut();
        useSessionStore.setState({ profile: null });
        setReady(true);
        return;
      }
      // Re-fetched rather than trusting the persisted copy -- picks up
      // any role/active change a manager made since this device's last
      // visit (e.g. a promotion, or a deactivation that should sign them
      // out here rather than silently keep working off a stale profile).
      loginLive(mapProfileRow(row));
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // Deliberately runs once per app boot (mount), not on every profile/
    // demoMode change -- loginLive() below updates those, which must not
    // re-trigger this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ready) return null;
  return <>{children}</>;
}
