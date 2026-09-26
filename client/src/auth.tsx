import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { PublicUser } from "../../shared/types";
import { apiGet, apiPost } from "./api";

interface AuthState {
  user: PublicUser | null;
  hasProfile: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ hasProfile: boolean }>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setHasProfile: (v: boolean) => void;
}

interface MeResponse {
  user: PublicUser;
  hasProfile: boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [hasProfile, setHasProfile] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<MeResponse>("/api/auth/me")
      .then((me) => {
        setUser(me.user);
        setHasProfile(me.hasProfile);
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const me = await apiPost<MeResponse>("/api/auth/login", { email, password });
    setUser(me.user);
    setHasProfile(me.hasProfile);
    return { hasProfile: me.hasProfile };
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const me = await apiPost<MeResponse>("/api/auth/register", { name, email, password });
    setUser(me.user);
    setHasProfile(false);
  }, []);

  const logout = useCallback(async () => {
    await apiPost("/api/auth/logout").catch(() => {});
    setUser(null);
    setHasProfile(false);
  }, []);

  return (
    <AuthContext.Provider value={{ user, hasProfile, loading, login, register, logout, setHasProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
