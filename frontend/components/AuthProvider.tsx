"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { User } from "@/lib/api";
import { getMe, logout as apiLogout, refreshTokens } from "@/lib/auth";
import { writeLangCookie } from "@/i18n/LocaleProvider";
import { useQueryClient } from "@tanstack/react-query";
import { clearPersistedQueryCache } from "@/lib/queryPersister";

const USER_STORAGE_KEY = "xpenses_user_profile";

function getStoredUser(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
  setUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  logout: async () => {},
  setUser: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

// Access token TTL (matches backend jwt.access-expires-minutes default).
// Proactively refresh 10 minutes before expiry so API calls never see a 401.
const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;
const PROACTIVE_REFRESH_MS = ACCESS_TOKEN_TTL_MS - 10 * 60 * 1000;

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(getStoredUser);
  const [loading, setLoading] = useState(() => !getStoredUser());
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const proactiveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleProactiveRefresh = useCallback(() => {
    if (proactiveTimer.current) return;
    proactiveTimer.current = setTimeout(async () => {
      proactiveTimer.current = null;
      try {
        await refreshTokens();
        scheduleProactiveRefresh();
      } catch {
        // Reactive 401 interceptor handles it as fallback
      }
    }, PROACTIVE_REFRESH_MS);
  }, []);

  const clearProactiveRefresh = useCallback(() => {
    if (proactiveTimer.current) {
      clearTimeout(proactiveTimer.current);
      proactiveTimer.current = null;
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    let interval: ReturnType<typeof setInterval>;

    const checkAuth = () => {
      getMe()
        .then((u) => {
          if (!mounted) return;
          setUser(u);
          try {
            localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(u));
          } catch {}
          writeLangCookie(u.language || "en");
          scheduleProactiveRefresh();
        })
        .catch((err: any) => {
          if (!mounted) return;
          const isOffline =
            (typeof navigator !== "undefined" && !navigator.onLine) ||
            err?.code === "ERR_NETWORK" ||
            err?.message === "Network Error" ||
            (!err?.response && !err?.status);

          if (isOffline && getStoredUser()) {
            return;
          }

          try {
            localStorage.removeItem(USER_STORAGE_KEY);
          } catch {}
          setUser(null);
          clearProactiveRefresh();
          if (window.location.pathname !== "/login") {
            router.replace("/login");
          }
        })
        .finally(() => {
          if (mounted) setLoading(false);
        });
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        checkAuth();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    checkAuth();
    interval = setInterval(checkAuth, 5 * 60 * 1000);

    return () => {
      mounted = false;
      clearInterval(interval);
      clearProactiveRefresh();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [router, scheduleProactiveRefresh, clearProactiveRefresh]);

  const logout = useCallback(async () => {
    clearProactiveRefresh();
    try {
      localStorage.removeItem(USER_STORAGE_KEY);
    } catch {}
    void clearPersistedQueryCache();
    try {
      await apiLogout();
    } catch {
      // Continue client cleanup even if network logout request fails
    }
    queryClient.clear();
    if (typeof window !== "undefined") {
      if ("caches" in window) {
        try {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        } catch {
          // Ignore cache deletion errors
        }
      }
      if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage({ type: "CLEAR_CACHE" });
      }
    }
    setUser(null);
    router.push("/login");
  }, [router, clearProactiveRefresh, queryClient]);

  // Neutral loading state while the initial session check runs — prevents
  // rendering the shell with user=null (logged-out flash) on PWA cold start.
  if (loading && pathname !== "/login") {
    return (
      <div className="min-h-screen min-h-dvh flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, loading, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}
