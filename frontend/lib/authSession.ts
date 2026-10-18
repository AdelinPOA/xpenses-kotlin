export type AuthFailureKind = "terminal" | "transient";
export const TERMINAL_AUTH_FAILURE_EVENT = "xpenses:terminal-auth-failure";
export const USER_STORAGE_KEY = "xpenses_user_profile";
export const AUTH_MARKER_FIELD = "__xpenses_auth_marker";
/** Must exactly match the active public shell cache in frontend/public/sw.js. */
export const GENERIC_OFFLINE_SHELL_CACHE = "xpenses-v9";

export function cachesToPurgeOnLogout(cacheNames: string[]): string[] {
  return cacheNames.filter((name) => name !== GENERIC_OFFLINE_SHELL_CACHE);
}

export interface StoredIdentityMarker {
  ownerId: number | null;
  marker: string | null;
}

export interface AuthProfileStorage {
  getItem(key: string): string | null;
}

/** Read the current shared owner/session marker without trusting it as auth. */
export function readStoredIdentityMarker(
  storage: AuthProfileStorage,
): StoredIdentityMarker {
  try {
    const raw = storage.getItem(USER_STORAGE_KEY);
    if (!raw) return { ownerId: null, marker: null };
    const profile = JSON.parse(raw) as Record<string, unknown> | null;
    const ownerId = profile?.id;
    return {
      ownerId:
        Number.isSafeInteger(ownerId) && (ownerId as number) > 0
          ? (ownerId as number)
          : null,
      marker:
        typeof profile?.[AUTH_MARKER_FIELD] === "string"
          ? (profile[AUTH_MARKER_FIELD] as string)
          : null,
    };
  } catch {
    return { ownerId: null, marker: null };
  }
}

export function storedIdentityMatches(
  storage: AuthProfileStorage,
  ownerId: number,
  marker: string | null,
): boolean {
  const current = readStoredIdentityMarker(storage);
  return current.ownerId === ownerId && current.marker === marker;
}

function requestPath(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url, "http://local.invalid").pathname.replace(/\/+$/, "");
  } catch {
    return undefined;
  }
}

function endpointFor(url: string | undefined): "me" | "refresh" | null {
  const path = requestPath(url);
  if (path === "/auth/me" || path?.endsWith("/api/auth/me")) return "me";
  if (path === "/auth/refresh" || path?.endsWith("/api/auth/refresh"))
    return "refresh";
  return null;
}

/**
 * Auth endpoint status contract: /auth/me rejects an absent/invalid access
 * identity with 401; /auth/refresh rejects invalid credentials with 401 and
 * deactivated accounts with 403. Other endpoints/statuses do not prove expiry.
 */
export function classifyAuthEndpointFailure(
  url: string | undefined,
  status: number | undefined,
): AuthFailureKind | null {
  const endpoint = endpointFor(url);
  if (endpoint === "me") {
    if (status === 401) return "terminal";
    if (
      status === undefined ||
      status === 408 ||
      status === 425 ||
      status === 429 ||
      status >= 500
    ) {
      return "transient";
    }
    return null;
  }

  if (endpoint === "refresh") {
    return status === 401 || status === 403 ? "terminal" : "transient";
  }

  return null;
}

export function isAuthMeRequest(url: string | undefined): boolean {
  return endpointFor(url) === "me";
}

export function isAuthRefreshRequest(url: string | undefined): boolean {
  return endpointFor(url) === "refresh";
}

export function isAuthLoginRequest(url: string | undefined): boolean {
  return (
    requestPath(url) === "/auth/login" ||
    requestPath(url)?.endsWith("/api/auth/login") === true
  );
}

export function markAuthFailure(error: unknown, kind: AuthFailureKind): void {
  if (error && typeof error === "object") {
    (error as { authFailureKind?: AuthFailureKind }).authFailureKind = kind;
  }
}

export function getAuthFailureKind(error: unknown): AuthFailureKind | null {
  if (!error || typeof error !== "object") return null;
  const kind = (error as { authFailureKind?: unknown }).authFailureKind;
  return kind === "terminal" || kind === "transient" ? kind : null;
}
