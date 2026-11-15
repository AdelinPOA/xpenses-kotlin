"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { User } from "@/lib/api";
import { getMe, logout as apiLogout, refreshTokens } from "@/lib/auth";
import {
  AUTH_MARKER_FIELD,
  cachesToPurgeOnLogout,
  getAuthFailureKind,
  readStoredIdentityMarker,
  storedIdentityMatches,
  TERMINAL_AUTH_FAILURE_EVENT,
  USER_STORAGE_KEY,
} from "@/lib/authSession";
import { writeLangCookie } from "@/i18n/LocaleProvider";
import { useQueryClient } from "@tanstack/react-query";
import type { QueryPersistence } from "@/lib/queryPersister";

function getStoredUser(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    const user = raw ? JSON.parse(raw) : null;
    if (!user || !Number.isSafeInteger(user.id) || user.id <= 0) return null;
    delete user[AUTH_MARKER_FIELD];
    return user;
  } catch {
    return null;
  }
}

export interface VerifiedSession {
  user: User;
  /** Changes whenever verification or the local auth identity is invalidated. */
  generation: number;
  /** Snapshot of the shared local owner marker at successful verification. */
  identityMarker: string | null;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  /** True only after the current server /auth/me response has been accepted. */
  sessionVerified: boolean;
  /** Freshly verifies the current cookie-backed server identity; never uses cached identity as proof. */
  verifySession: () => Promise<VerifiedSession | null>;
  /** Checks that a previously verified identity still belongs to the current auth generation. */
  isSessionCurrent: (session: VerifiedSession) => boolean;
  logout: () => Promise<void>;
  setUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  sessionVerified: false,
  verifySession: async () => null,
  isSessionCurrent: () => false,
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

function createIdentityMarker(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

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
  const [sessionVerified, setSessionVerifiedState] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const proactiveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentUserId = useRef<number | null | undefined>(undefined);
  const localIdentityMarker = useRef<string | null | undefined>(undefined);
  const authRequestId = useRef(0);
  const authGeneration = useRef(0);
  const sessionVerifiedRef = useRef(false);
  const authDisabled = useRef(false);

  const setSessionVerified = useCallback((verified: boolean) => {
    sessionVerifiedRef.current = verified;
    setSessionVerifiedState(verified);
  }, []);

  const commitUser = useCallback(
    (
      nextUser: User | null,
      options: {
        persistProfile?: boolean;
        identityMarker?: string | null;
        expectedIdentity?: { ownerId: number | null; marker: string | null };
      } = {},
    ): Promise<void> => {
      const nextId = nextUser?.id ?? null;
      const persistProfile = options.persistProfile !== false;
      if (options.expectedIdentity && typeof window !== "undefined") {
        const current = readStoredIdentityMarker(localStorage);
        if (
          current.ownerId !== options.expectedIdentity.ownerId ||
          current.marker !== options.expectedIdentity.marker
        )
          return persistence.whenReady();
      }
      const storedIdentity =
        typeof window === "undefined"
          ? { ownerId: null, marker: null }
          : readStoredIdentityMarker(localStorage);
      const identityMarker = nextUser
        ? persistProfile
          ? storedIdentity.ownerId === nextId && storedIdentity.marker
            ? storedIdentity.marker
            : createIdentityMarker()
          : (options.identityMarker ?? null)
        : null;
      const identityChanged =
        currentUserId.current !== nextId ||
        localIdentityMarker.current !== identityMarker;
      let ready: Promise<void>;
      if (identityChanged) {
        currentUserId.current = nextId;
        localIdentityMarker.current = identityMarker;
        authGeneration.current++;
        setSessionVerified(false);
        queryClient.clear();
        ready = persistence.setOwner(nextId);
      } else {
        ready = persistence.whenReady();
      }
      try {
        if (persistProfile && nextUser) {
          const current = readStoredIdentityMarker(localStorage);
          if (
            !options.expectedIdentity ||
            (current.ownerId === options.expectedIdentity.ownerId &&
              current.marker === options.expectedIdentity.marker)
          )
            localStorage.setItem(
              USER_STORAGE_KEY,
              JSON.stringify({
                ...nextUser,
                [AUTH_MARKER_FIELD]: identityMarker,
              }),
            );
        } else if (persistProfile) {
          const current = readStoredIdentityMarker(localStorage);
          if (
            !options.expectedIdentity ||
            (current.ownerId === options.expectedIdentity.ownerId &&
              current.marker === options.expectedIdentity.marker)
          )
            localStorage.removeItem(USER_STORAGE_KEY);
        }
      } catch {
        // Local profile persistence is best-effort; IndexedDB remains owner-scoped.
      }
      if (nextUser) writeLangCookie(nextUser.language || "en");
      setUserState(nextUser);
      return ready;
    },
    [persistence, queryClient, setSessionVerified],
  );

  const clearProactiveRefresh = useCallback(() => {
    if (proactiveTimer.current) {
      clearTimeout(proactiveTimer.current);
      proactiveTimer.current = null;
    }
  }, []);

  const rejectSession = useCallback(
    async (
      requestId: number,
      expectedIdentity?: { ownerId: number | null; marker: string | null },
    ) => {
      if (requestId !== authRequestId.current || authDisabled.current) return;
      const expected = expectedIdentity ?? {
        ownerId: currentUserId.current ?? null,
        marker: localIdentityMarker.current ?? null,
      };
      if (typeof window !== "undefined") {
        const current = readStoredIdentityMarker(localStorage);
        if (
          current.ownerId !== expected.ownerId ||
          current.marker !== expected.marker
        )
          return;
      }
      authRequestId.current++;
      authGeneration.current++;
      authDisabled.current = true;
      setSessionVerified(false);
      clearProactiveRefresh();
      await commitUser(null, { expectedIdentity: expected });
      setLoading(false);
      if (
        typeof window !== "undefined" &&
        window.location.pathname !== "/login"
      ) {
        const next = window.location.pathname + window.location.search;
        router.replace(`/login?next=${encodeURIComponent(next)}`);
      }
    },
    [clearProactiveRefresh, commitUser, router, setSessionVerified],
  );

  const scheduleProactiveRefresh = useCallback(() => {
    if (proactiveTimer.current) return;
    proactiveTimer.current = setTimeout(async () => {
      proactiveTimer.current = null;
      try {
        await refreshTokens();
        scheduleProactiveRefresh();
      } catch (error) {
        if (getAuthFailureKind(error) === "terminal") {
          await rejectSession(authRequestId.current);
        } else {
          setSessionVerified(false);
        }
        // A network/timeout/5xx refresh failure leaves local state intact. A
        // later online check will verify identity before any queued replay.
      }
    }, PROACTIVE_REFRESH_MS);
  }, [rejectSession, setSessionVerified]);

  const verifySession =
    useCallback(async (): Promise<VerifiedSession | null> => {
      if (authDisabled.current) return null;

      const requestId = ++authRequestId.current;
      const verificationGeneration = ++authGeneration.current;
      const identityAtStart =
        typeof window === "undefined"
          ? { ownerId: null, marker: null }
          : readStoredIdentityMarker(localStorage);
      const identityUnchanged = () => {
        if (typeof window === "undefined") return true;
        const current = readStoredIdentityMarker(localStorage);
        return (
          current.ownerId === identityAtStart.ownerId &&
          current.marker === identityAtStart.marker
        );
      };
      setSessionVerified(false);

      try {
        const verifiedUser = await getMe();
        if (
          requestId !== authRequestId.current ||
          verificationGeneration !== authGeneration.current ||
          authDisabled.current ||
          !identityUnchanged()
        )
          return null;

        const commitReady = commitUser(verifiedUser, {
          expectedIdentity: identityAtStart,
        });
        const committedGeneration = authGeneration.current;
        await commitReady;
        const committedIdentity = readStoredIdentityMarker(localStorage);
        if (
          requestId !== authRequestId.current ||
          authGeneration.current !== committedGeneration ||
          authDisabled.current ||
          committedIdentity.ownerId !== verifiedUser.id ||
          committedIdentity.marker !== localIdentityMarker.current ||
          !storedIdentityMatches(
            localStorage,
            verifiedUser.id,
            committedIdentity.marker,
          )
        )
          return null;

        setSessionVerified(true);
        scheduleProactiveRefresh();
        return {
          user: verifiedUser,
          generation: authGeneration.current,
          identityMarker: committedIdentity.marker,
        };
      } catch (error) {
        if (
          requestId !== authRequestId.current ||
          verificationGeneration !== authGeneration.current ||
          authDisabled.current ||
          !identityUnchanged()
        )
          return null;

        if (getAuthFailureKind(error) === "terminal") {
          await rejectSession(requestId, identityAtStart);
        } else {
          // No response, timeout, server failure, or an endpoint response that
          // does not prove invalid credentials is not grounds to erase the owner.
          setSessionVerified(false);
          if (currentUserId.current != null) await persistence.whenReady();
        }
        return null;
      } finally {
        if (requestId === authRequestId.current) setLoading(false);
      }
    }, [
      commitUser,
      persistence,
      rejectSession,
      scheduleProactiveRefresh,
      setSessionVerified,
    ]);

  const isSessionCurrent = useCallback(
    (session: VerifiedSession): boolean =>
      sessionVerifiedRef.current &&
      !authDisabled.current &&
      session.generation === authGeneration.current &&
      session.user.id === currentUserId.current &&
      localIdentityMarker.current === session.identityMarker &&
      typeof window !== "undefined" &&
      storedIdentityMatches(
        localStorage,
        session.user.id,
        session.identityMarker,
      ),
    [],
  );

  const setUser = useCallback(
    (nextUser: User | null) => {
      // A manual login/profile update supersedes any older session check. The
      // supplied profile is local display state until a fresh /auth/me succeeds.
      const requestId = ++authRequestId.current;
      authGeneration.current++;
      authDisabled.current = nextUser === null;
      setSessionVerified(false);
      clearProactiveRefresh();
      void commitUser(nextUser).then(() => {
        if (requestId !== authRequestId.current) return;
        setLoading(false);
        if (nextUser) void verifySession();
      });
    },
    [clearProactiveRefresh, commitUser, setSessionVerified, verifySession],
  );

  useEffect(() => {
    let mounted = true;

    const checkAuth = () => {
      if (!mounted || authDisabled.current) return;
      void verifySession();
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") checkAuth();
    };
    const handleOffline = () => {
      authGeneration.current++;
      setSessionVerified(false);
    };
    const handleOnline = () => checkAuth();

    const handleTerminalAuthFailure = () => {
      if (mounted) void rejectSession(authRequestId.current);
    };

    const handleStorage = (event: StorageEvent) => {
      if (!mounted || event.key !== USER_STORAGE_KEY) return;

      // Use the current value, not event.newValue: queued events can arrive
      // after a later tab has already established a different owner.
      const nextIdentity = readStoredIdentityMarker(localStorage);
      const storedUser = getStoredUser();
      const nextUserId = storedUser?.id ?? null;
      if (
        nextUserId === currentUserId.current &&
        nextIdentity.marker === localIdentityMarker.current
      ) {
        if (storedUser) setUserState(storedUser);
        return;
      }

      const invalidationRequestId = ++authRequestId.current;
      authGeneration.current++;
      authDisabled.current = !storedUser;
      setSessionVerified(false);
      clearProactiveRefresh();
      void commitUser(storedUser, {
        persistProfile: false,
        identityMarker: nextIdentity.marker,
      }).then(() => {
        if (!mounted || invalidationRequestId !== authRequestId.current) return;
        setLoading(false);
        if (storedUser) {
          // The cross-tab profile is only a namespace hint. Freshly verify the
          // cookie-backed server identity before enabling replay.
          void verifySession();
        } else if (window.location.pathname !== "/login") {
          const next = window.location.pathname + window.location.search;
          router.replace(`/login?next=${encodeURIComponent(next)}`);
        }
      });
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    window.addEventListener(
      TERMINAL_AUTH_FAILURE_EVENT,
      handleTerminalAuthFailure,
    );
    window.addEventListener("storage", handleStorage);

    // Browser storage is only read after hydration so the initial tree stays
    // deterministic. It supplies a local owner namespace, never server auth.
    const storedUser = getStoredUser();
    if (storedUser) void commitUser(storedUser);

    checkAuth();
    const interval = setInterval(checkAuth, 5 * 60 * 1000);

    return () => {
      mounted = false;
      authRequestId.current++;
      authGeneration.current++;
      clearInterval(interval);
      clearProactiveRefresh();
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener(
        TERMINAL_AUTH_FAILURE_EVENT,
        handleTerminalAuthFailure,
      );
      window.removeEventListener("storage", handleStorage);
    };
  }, [
    clearProactiveRefresh,
    commitUser,
    rejectSession,
    router,
    setSessionVerified,
    verifySession,
  ]);

  const logout = useCallback(async () => {
    try {
      clearProactiveRefresh();
      authDisabled.current = true;
      authRequestId.current++;
      authGeneration.current++;
      setSessionVerified(false);
      const localOwnerId = currentUserId.current ?? null;
      const sharedIdentity =
        typeof window === "undefined"
          ? { ownerId: null, marker: null }
          : readStoredIdentityMarker(localStorage);
      const stillOwnsSharedIdentity = sharedIdentity.ownerId === localOwnerId;
      const expectedIdentity = stillOwnsSharedIdentity
        ? sharedIdentity
        : {
            ownerId: localOwnerId,
            marker: localIdentityMarker.current ?? null,
          };
      const purge = commitUser(null, { expectedIdentity });
      await Promise.all([
        purge,
        stillOwnsSharedIdentity
          ? apiLogout().catch(() => {
              // Continue client cleanup even if network logout fails.
            })
          : Promise.resolve(),
      ]);
      if (typeof window !== "undefined") {
        if ("caches" in window) {
          try {
            const keys = await caches.keys();
            await Promise.all(
              cachesToPurgeOnLogout(keys).map((key) => caches.delete(key)),
            );
          } catch {
            // Ignore cache deletion errors
          }
        }
        if (navigator.serviceWorker?.controller) {
          navigator.serviceWorker.controller.postMessage({ type: "CLEAR_CACHE" });
        }
      }
      router.push("/login");
    } finally {
      if (typeof window !== "undefined") {
        try {
          localStorage.removeItem("xpenses_offline_sync_status");
        } catch {
          // Ignore storage removal errors
        }
        if (typeof indexedDB !== "undefined") {
          indexedDB.deleteDatabase("xpenses-offline");
          indexedDB.deleteDatabase("xpenses-ocr-sources");
        }
      }
    }
  }, [router, clearProactiveRefresh, commitUser, setSessionVerified]);

  // Neutral loading state while the initial session check runs. If a cached
  // owner is available offline, the failed check settles and exposes that local
  // workspace without treating it as a server-authenticated session.
  if (loading && pathname !== "/login") {
    return (
      <div className="min-h-screen min-h-dvh flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        sessionVerified,
        verifySession,
        isSessionCurrent,
        logout,
        setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
