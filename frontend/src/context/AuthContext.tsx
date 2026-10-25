import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  clearSession,
  endpoints,
  getStoredSession,
  loginRequest,
  storeSession,
} from "../lib/api";
import type { Role, User } from "../types";

interface AuthContextValue {
  user: User | null;
  token: string | null;
  initializing: boolean;
  login: (username: string, password: string) => Promise<User>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  hasRole: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const stored = useMemo(() => getStoredSession(), []);
  const [user, setUser] = useState<User | null>(stored?.user ?? null);
  const [token, setToken] = useState<string | null>(stored?.token ?? null);
  const [initializing, setInitializing] = useState(Boolean(stored?.token));

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
    setToken(null);
    setInitializing(false);
  }, []);

  const refreshUser = useCallback(async () => {
    const fresh = await endpoints.me();
    setUser(fresh);
    const session = getStoredSession();
    if (session) {
      storeSession(session.token, fresh, 60 * 60);
    }
  }, []);

  useEffect(() => {
    if (!token) {
      setInitializing(false);
      return;
    }
    let active = true;
    endpoints
      .me()
      .then((fresh) => {
        if (!active) return;
        setUser(fresh);
        const session = getStoredSession();
        if (session) {
          // Keep the original token and just refresh the cached profile copy.
          localStorage.setItem(
            "worksphere.auth",
            JSON.stringify({
              token: session.token,
              user: fresh,
              expiresAt:
                (JSON.parse(localStorage.getItem("worksphere.auth") || "{}") as {
                  expiresAt?: number;
                }).expiresAt ?? Date.now() + 3600_000,
            }),
          );
        }
      })
      .catch(() => {
        if (active) logout();
      })
      .finally(() => {
        if (active) setInitializing(false);
      });
    return () => {
      active = false;
    };
    // Run once on mount for the stored session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleUnauthorized = () => logout();
    window.addEventListener("worksphere:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("worksphere:unauthorized", handleUnauthorized);
  }, [logout]);

  const login = useCallback(async (username: string, password: string) => {
    const response = await loginRequest(username.trim(), password);
    storeSession(response.access_token, response.user, response.expires_in);
    setToken(response.access_token);
    setUser(response.user);
    setInitializing(false);
    return response.user;
  }, []);

  const hasRole = useCallback(
    (...roles: Role[]) => Boolean(user && roles.includes(user.role)),
    [user],
  );

  const value = useMemo(
    () => ({
      user,
      token,
      initializing,
      login,
      logout,
      refreshUser,
      hasRole,
    }),
    [user, token, initializing, login, logout, refreshUser, hasRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
