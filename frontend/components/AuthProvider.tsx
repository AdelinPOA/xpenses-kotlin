"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { User } from "@/lib/api";
import { getMe, logout as apiLogout } from "@/lib/auth";

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

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let mounted = true;
    let interval: ReturnType<typeof setInterval>;

    const checkAuth = () => {
      getMe()
        .then((u) => {
          if (mounted) setUser(u);
        })
        .catch(() => {
          if (!mounted) return;
          setUser(null);
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
    interval = setInterval(checkAuth, CHECK_INTERVAL_MS);

    return () => {
      mounted = false;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [router]);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
    router.push("/login");
  }, [router]);

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
