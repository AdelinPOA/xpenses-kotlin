import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTH_MARKER_FIELD,
  cachesToPurgeOnLogout,
  classifyAuthEndpointFailure,
  GENERIC_OFFLINE_SHELL_CACHE,
  getAuthFailureKind,
  storedIdentityMatches,
  USER_STORAGE_KEY,
} from "../../lib/authSession.ts";

test("only the auth endpoint's documented rejection statuses are terminal", () => {
  assert.equal(classifyAuthEndpointFailure("/auth/me", 401), "terminal");
  assert.equal(
    classifyAuthEndpointFailure("/api/auth/refresh", 401),
    "terminal",
  );
  assert.equal(
    classifyAuthEndpointFailure("/api/auth/refresh", 403),
    "terminal",
  );
  assert.equal(classifyAuthEndpointFailure("/auth/me", 403), null);
  assert.equal(classifyAuthEndpointFailure("/expenses", 403), null);
});

test("refresh network, timeout, and server failures are transient, not original 401s", () => {
  assert.equal(
    classifyAuthEndpointFailure("/auth/refresh", undefined),
    "transient",
  );
  assert.equal(classifyAuthEndpointFailure("/auth/refresh", 500), "transient");
  assert.equal(classifyAuthEndpointFailure("/auth/refresh", 503), "transient");

  const failedRefreshAfterUnauthorizedMe = {
    authFailureKind: "transient",
    response: { status: 401 },
  };
  assert.equal(
    getAuthFailureKind(failedRefreshAfterUnauthorizedMe),
    "transient",
  );
  assert.equal(
    getAuthFailureKind(failedRefreshAfterUnauthorizedMe),
    "transient",
  );
});

test("session proofs compare against the live shared owner marker", () => {
  let profile = JSON.stringify({ id: 4, [AUTH_MARKER_FIELD]: "session-a" });
  const storage = {
    getItem: (key) => (key === USER_STORAGE_KEY ? profile : null),
  };

  assert.equal(storedIdentityMatches(storage, 4, "session-a"), true);
  profile = JSON.stringify({ id: 2, [AUTH_MARKER_FIELD]: "session-b" });
  assert.equal(storedIdentityMatches(storage, 4, "session-a"), false);
  profile = "null";
  assert.equal(storedIdentityMatches(storage, 4, "session-a"), false);
});

test("logout preserves only the exact generic workspace cache", () => {
  assert.deepEqual(
    cachesToPurgeOnLogout([
      GENERIC_OFFLINE_SHELL_CACHE,
      "xpenses-v7",
      "xpenses-private",
      "xpenses-v8-private",
    ]),
    ["xpenses-v7", "xpenses-private", "xpenses-v8-private"],
  );
});

test("direct network, timeout, and 5xx auth-check failures remain transient", () => {
  assert.equal(classifyAuthEndpointFailure("/auth/me", undefined), "transient");
  assert.equal(classifyAuthEndpointFailure("/auth/me", 408), "transient");
  assert.equal(classifyAuthEndpointFailure("/auth/me", 500), "transient");
  assert.equal(classifyAuthEndpointFailure("/auth/me", 503), "transient");
  assert.equal(classifyAuthEndpointFailure("/auth/me", 401), "terminal");
});
