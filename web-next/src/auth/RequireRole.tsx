import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import type { Role } from '../types/domain';
import { useSessionStore } from './useSessionStore';

// Route guard -- replaces scattered `if(PROFILE.role==='manager')` checks
// inside render functions (e.g. index.html:8273) with one wrapper element.
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const profile = useSessionStore((s) => s.profile);
  if (!profile) return <Navigate to="/login" replace />;
  if (profile.role !== role) return <Navigate to={profile.role === 'manager' ? '/app/mgr' : '/app/home'} replace />;
  return <>{children}</>;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const profile = useSessionStore((s) => s.profile);
  if (!profile) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
