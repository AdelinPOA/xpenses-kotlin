"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { User } from "@/lib/api";
import { getMe, logout as apiLogout, refreshTokens } from "@/lib/auth";
import { writeLangCookie } from "@/i18n/LocaleProvider";
import { useQueryClient } from "@tanstack/react-query";
import type { QueryPersistence } from "@/lib/queryPersister";

const USER_STORAGE_KEY = "xpenses_user_profile";

function getStoredUser(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    const user = raw ? JSON.parse(raw) : null;
    return user && Number.isSafeInteger(user.id) && user.id > 0 ? user : null;
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

export default function AuthProvider({
  children,
  persistence,
}: {
  children: React.ReactNode;
  persistence: QueryPersistence;
}) {
  // Keep the first render identical on the server and client. Reading
  // localStorage in a state initializer makes the client render a different
  // tree when a cached session exists, which causes hydration to fail.
  const [user, setUserState] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const proactiveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentUserId = useRef<number | null | undefined>(undefined);
  const authRequestId = useRef(0);
  const authDisabled = useRef(false);

  const commitUser = useCallback((nextUser: User | null): Promise<void> => {
    const nextId = nextUser?.id ?? null;
    let ready: Promise<void>;
    if (currentUserId.current !== nextId) {
      currentUserId.current = nextId;
      queryClient.clear();
      ready = persistence.setOwner(nextId);
    } else {
      ready = persistence.whenReady();
    }
    try {
      if (nextUser) localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(nextUser));
      else localStorage.removeItem(USER_STORAGE_KEY);
    } catch {}
    if (nextUser) writeLangCookie(nextUser.language || "en");
    setUserState(nextUser);
    return ready;
  }, [persistence, queryClient]);

  const setUser = useCallback((nextUser: User | null) => {
    // A manual login/profile update supersedes any older session check.
    const requestId = ++authRequestId.current;
    authDisabled.current = nextUser === null;
    void commitUser(nextUser).then(() => {
      if (requestId === authRequestId.current) setLoading(false);
    });
  }, [commitUser]);

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
      if (authDisabled.current) return;
      const requestId = ++authRequestId.current;
      getMe()
        .then(async (u) => {
          if (!mounted || requestId !== authRequestId.current) return;
          await commitUser(u);
          if (!mounted || requestId !== authRequestId.current) return;
          scheduleProactiveRefresh();
        })
        .catch(async (err: any) => {
          if (!mounted || requestId !== authRequestId.current) return;
          const isOffline =
            (typeof navigator !== "undefined" && !navigator.onLine) ||
            err?.code === "ERR_NETWORK" ||
            err?.message === "Network Error" ||
            (!err?.response && !err?.status);

          if (isOffline && getStoredUser()) {
            await persistence.whenReady();
            return;
          }

          // Session is no longer valid — purge cached data at rest and in memory.
          commitUser(null);
          clearProactiveRefresh();
          if (window.location.pathname !== "/login") {
            router.replace("/login");
          }
        })
        .finally(() => {
          if (mounted && requestId === authRequestId.current) setLoading(false);
        });
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        checkAuth();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    // Browser storage is only read after hydration so the initial tree stays
    // deterministic. This also preserves cached sessions while offline.
    const storedUser = getStoredUser();
    if (storedUser) commitUser(storedUser);

    checkAuth();
    interval = setInterval(checkAuth, 5 * 60 * 1000);

    return () => {
      mounted = false;
      authRequestId.current++;
      clearInterval(interval);
      clearProactiveRefresh();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [router, scheduleProactiveRefresh, clearProactiveRefresh, commitUser, persistence]);

  const logout = useCallback(async () => {
    clearProactiveRefresh();
    authDisabled.current = true;
    authRequestId.current++;
    const purge = commitUser(null);
    await Promise.all([
      purge,
      apiLogout().catch(() => {
        // Continue client cleanup even if network logout request fails.
      }),
    ]);
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
    router.push("/login");
  }, [router, clearProactiveRefresh, commitUser]);

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
