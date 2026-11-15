/**
 * InfraScan Authentication Context & Session Management
 * 
 * Complies with Section S.5 & 0.1 (No direct login, no hardcoded personas):
 * - In-memory access token storage (no localStorage for JWTs)
 * - Rotating HttpOnly refresh cookie via /api/v1/auth/refresh
 * - Idle timeout monitoring (28m warning, 30m logout, 12h absolute limit)
 * - Cross-tab logout synchronization via BroadcastChannel
 * - Database-backed authentication and role checks
 */

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { type RoleType } from "@/lib/rules";
import { setAuthToken } from "@/lib/api";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: RoleType;
  organizationName: string;
  organizationId: string;
  status: "active" | "pending_approval" | "deactivated" | "locked";
  mfaEnabled?: boolean;
}

export interface AuthContextType {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, pass: string, rememberDevice?: boolean) => Promise<{ success: boolean; mfaRequired?: boolean; mfaTicket?: string; error?: string }>;
  loginWithGoogle: (code: string, redirectUri: string) => Promise<{ success: boolean; error?: string }>;
  verifyMfa: (code: string, mfaTicket: string) => Promise<{ success: boolean; error?: string }>;
  logout: (reason?: string) => Promise<void>;
  // Session timeout state
  showTimeoutWarning: boolean;
  timeoutCountdownSeconds: number;
  staySignedIn: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const IDLE_WARNING_MS = 28 * 60 * 1000; // 28 minutes (2 min countdown)
const ABSOLUTE_TIMEOUT_MS = 12 * 60 * 60 * 1000; // 12 hours

export function AuthProvider({ children }: { children: ReactNode }) {
  // In-memory token storage (never localStorage for tokens per security rules)
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Session timeout state
  const [showTimeoutWarning, setShowTimeoutWarning] = useState<boolean>(false);
  const [timeoutCountdownSeconds, setTimeoutCountdownSeconds] = useState<number>(120);

  const lastActivityRef = useRef<number>(Date.now());
  const sessionStartRef = useRef<number>(Date.now());
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  // BroadcastChannel for cross-tab sign-out
  useEffect(() => {
    try {
      const channel = new BroadcastChannel("infrascan_auth_channel");
      broadcastChannelRef.current = channel;
      channel.onmessage = (event) => {
        if (event.data === "SIGNOUT") {
          setUser(null);
          setAccessToken(null);
          setAuthToken(null);
          try {
            localStorage.removeItem("infrascan_state");
          } catch {
            // ignore
          }
        }
      };
      return () => {
        channel.close();
      };
    } catch {
      // Fallback if BroadcastChannel unavailable
    }
  }, []);

  // Attempt session restoration via HttpOnly refresh cookie on application startup
  useEffect(() => {
    async function restoreSession() {
      try {
        const refreshRes = await fetch("/api/v1/auth/refresh", {
          method: "POST",
          credentials: "include",
        });

        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          const token = refreshData.accessToken;
          setAccessToken(token);
          setAuthToken(token);

          // Fetch user profile using new access token
          const userRes = await fetch("/api/v1/me", {
            headers: { Authorization: `Bearer ${token}` },
            credentials: "include",
          });

          if (userRes.ok) {
            const userData = await userRes.json();
            setUser({
              id: userData.id,
              name: userData.name,
              email: userData.email,
              role: (userData.role || "inspector") as RoleType,
              organizationName: userData.organizationName || "InfraScan Authority",
              organizationId: userData.organizationId || "",
              status: userData.status || "active",
            });
            sessionStartRef.current = Date.now();
            lastActivityRef.current = Date.now();
          } else {
            setUser(null);
            setAccessToken(null);
            setAuthToken(null);
          }
        } else {
          setUser(null);
          setAccessToken(null);
          setAuthToken(null);
        }
      } catch {
        setUser(null);
        setAccessToken(null);
        setAuthToken(null);
      } finally {
        setIsLoading(false);
      }
    }

    restoreSession();
  }, []);

  // User activity listeners for idle session management
  useEffect(() => {
    if (!user) return;

    const handleActivity = () => {
      lastActivityRef.current = Date.now();
      if (showTimeoutWarning) {
        setShowTimeoutWarning(false);
      }
    };

    window.addEventListener("mousemove", handleActivity);
    window.addEventListener("keydown", handleActivity);
    window.addEventListener("click", handleActivity);
    window.addEventListener("scroll", handleActivity);

    // Periodic check every 5 seconds
    const interval = setInterval(() => {
      const now = Date.now();
      // Absolute limit (12 hours)
      if (now - sessionStartRef.current > ABSOLUTE_TIMEOUT_MS) {
        logout("Absolute session limit reached (12 hours). Please sign in again.");
        return;
      }

      // Idle timeout warning at 28 mins
      const idleTime = now - lastActivityRef.current;
      if (idleTime >= IDLE_TIMEOUT_MS) {
        logout("Your session ended due to inactivity.");
      } else if (idleTime >= IDLE_WARNING_MS) {
        setShowTimeoutWarning(true);
        const remaining = Math.max(0, Math.floor((IDLE_TIMEOUT_MS - idleTime) / 1000));
        setTimeoutCountdownSeconds(remaining);
      } else {
        setShowTimeoutWarning(false);
      }
    }, 5000);

    return () => {
      window.removeEventListener("mousemove", handleActivity);
      window.removeEventListener("keydown", handleActivity);
      window.removeEventListener("click", handleActivity);
      window.removeEventListener("scroll", handleActivity);
      clearInterval(interval);
    };
  }, [user, showTimeoutWarning]);

  const staySignedIn = () => {
    lastActivityRef.current = Date.now();
    setShowTimeoutWarning(false);
  };

  const logout = async (reason?: string) => {
    try {
      await fetch("/api/v1/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Best-effort logout API call
    }

    setUser(null);
    setAccessToken(null);
    setAuthToken(null);
    try {
      localStorage.removeItem("infrascan_state");
      localStorage.removeItem("infrascan-session");
    } catch {
      // ignore
    }
    setShowTimeoutWarning(false);
    broadcastChannelRef.current?.postMessage("SIGNOUT");
    if (reason) {
      sessionStorage.setItem("infrascan_signout_reason", reason);
    }
  };

  const login = async (
    email: string,
    pass: string,
    rememberDevice = false
  ): Promise<{ success: boolean; mfaRequired?: boolean; mfaTicket?: string; error?: string }> => {
    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password: pass,
          rememberDevice,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const message = data?.detail?.message || "E-mail or password is incorrect.";
        return { success: false, error: message };
      }

      setAccessToken(data.accessToken);
      setAuthToken(data.accessToken);
      setUser({
        id: data.user.id,
        name: data.user.name,
        email: data.user.email,
        role: (data.user.role || "inspector") as RoleType,
        organizationName: data.user.organizationName || "InfraScan Authority",
        organizationId: data.user.organizationId || "",
        status: data.user.status || "active",
      });

      lastActivityRef.current = Date.now();
      sessionStartRef.current = Date.now();
      return { success: true };
    } catch {
      return { success: false, error: "Network error connecting to authentication service." };
    }
  };

  const loginWithGoogle = async (
    code: string,
    redirectUri: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch("/api/v1/auth/google/callback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code, redirectUri }),
      });

      const data = await res.json();
      if (!res.ok) {
        const message = data?.detail?.message || "Google authentication failed.";
        return { success: false, error: message };
      }

      setAccessToken(data.accessToken);
      setAuthToken(data.accessToken);
      setUser({
        id: data.user.id,
        name: data.user.name,
        email: data.user.email,
        role: (data.user.role || "inspector") as RoleType,
        organizationName: data.user.organizationName || "InfraScan Authority",
        organizationId: data.user.organizationId || "",
        status: data.user.status || "active",
      });

      lastActivityRef.current = Date.now();
      sessionStartRef.current = Date.now();
      return { success: true };
    } catch {
      return { success: false, error: "Network error connecting to authentication service." };
    }
  };

  const verifyMfa = async (
    _code: string,
    _mfaTicket: string
  ): Promise<{ success: boolean; error?: string }> => {
    return { success: false, error: "Two-factor verification not configured on this account." };
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isAuthenticated: !!user,
        isLoading,
        login,
        loginWithGoogle,
        verifyMfa,
        logout,
        showTimeoutWarning,
        timeoutCountdownSeconds,
        staySignedIn,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
