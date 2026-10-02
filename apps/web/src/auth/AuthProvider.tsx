import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { hasPermission, type Permission, type Role } from '@campus/shared';
import { api, setUnauthorizedHandler } from '../api/client';

export interface SessionUser {
  user_id: string;
  name: string;
  email: string;
  role: Role;
}

interface AuthCtx {
  user: SessionUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<SessionUser>;
  register: (name: string, email: string, password: string) => Promise<SessionUser>;
  logout: () => Promise<void>;
  can: (p: Permission) => boolean;
}

const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();

  useEffect(() => {
    api<{ user: SessionUser | null }>('/auth/session')
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
    setUnauthorizedHandler(() => {
      setUser(null);
      qc.clear();
    });
  }, [qc]);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api<{ user: SessionUser }>('/auth/login', { method: 'POST', json: { email, password } });
    qc.clear();
    setUser(r.user);
    return r.user;
  }, [qc]);
  const register = useCallback(async (name: string, email: string, password: string) => {
    const r = await api<{ user: SessionUser }>('/auth/register', { method: 'POST', json: { name, email, password } });
    qc.clear();
    setUser(r.user);
    return r.user;
  }, [qc]);
  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    setUser(null);
    qc.clear();
  }, [qc]);
  const can = useCallback((p: Permission) => !!user && hasPermission(user.role, p), [user]);

  const value = useMemo(() => ({ user, loading, login, register, logout, can }), [user, loading, login, register, logout, can]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const landingFor = (role: Role) => (role === 'user' ? '/' : '/it');

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="grid h-screen place-items-center text-ink-3">Loading…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return <>{children}</>;
}

export function RequireRole({ perm, children }: { perm: Permission; children: ReactNode }) {
  const { can } = useAuth();
  if (!can(perm)) return <Navigate to="/" replace />;
  return <>{children}</>;
}
