# Security

## Overview
Implements stateless JWT access/refresh token primitives, cookie-based request authentication with user/token-version validation, and IP-aware rate limiting backed by either Redis or an in-memory sliding-window store.

## Interface
- `[JwtTokenProvider.kt:JwtTokenProvider]` — `@Component` with `@PostConstruct validateSecret()`, `createAccessToken(userId, username, role, tokenVersion = 0): String`, `decodeAccessToken(token: String): ClaimsData?`, `createRefreshToken(): String`, `hashRefreshToken(token: String): String`, and `[JwtTokenProvider.kt:ClaimsData]`.
- `[JwtAuthenticationFilter.kt:JwtAuthenticationFilter]` — `@Component` extending `OncePerRequestFilter` with `doFilterInternal(...)`.
- `[RateLimitStore.kt:RateLimitStore]` — Public interface exposing `record(key: String, limit: Int, windowMillis: Long, nowMillis: Long): Int`.
- `[InMemoryRateLimitStore.kt:InMemoryRateLimitStore]` — `RateLimitStore` implementation bounded by `maxTrackedKeys: Int = 10_000`.
- `[RedisRateLimitStore.kt:RedisRateLimitStore]` — `@Component` (`@ConditionalOnProperty(prefix = "rate-limiting", name = ["store"], havingValue = "redis")`) implementing `RateLimitStore` with `failClosed: Boolean`.
- `[RateLimitStoreConfiguration.kt:RateLimitStoreConfiguration]` — `@Configuration` registering `@ConditionalOnMissingBean(RateLimitStore::class)` `inMemoryRateLimitStore(...)`.
- `[RateLimitingFilter.kt:RateLimitingFilter]` — `@Component` extending `OncePerRequestFilter` with `doFilterInternal(...)`.

## Invariants
- `[JwtTokenProvider.kt:JwtTokenProvider.validateSecret]` & `[JwtTokenProvider.kt:JwtTokenProvider.key]` — Startup fails via `IllegalStateException` if `jwt.secret` is blank; derives a 256-bit HMAC `SecretKey` lazily via `PBKDF2WithHmacSHA256` (65,536 iterations) using `jwt.secret` and `jwt.salt` (default `"xpenses-jwt-salt"`).
- `[JwtTokenProvider.kt:JwtTokenProvider.decodeAccessToken]` & `[JwtTokenProvider.kt:JwtTokenProvider.createRefreshToken]` — Access tokens expire in `jwt.access-expires-minutes` (default 15m) and return `null` on any verification/parsing error; refresh tokens use 48 `SecureRandom` bytes encoded as unpadded URL-safe Base64 and hashed with SHA-256 lowercase hex.
- `[JwtAuthenticationFilter.kt:JwtAuthenticationFilter.doFilterInternal]` — Reads JWT from the `"access_token"` cookie; authenticates only when `decodeAccessToken` succeeds and `user.isActive == true`; aborts with HTTP `401` if `claims.tokenVersion < user.tokenVersion`.
- `[RateLimitingFilter.kt:RateLimitingFilter]` — Enforces per-IP 60s (`WINDOW_MILLIS = 60_000L`) limits (`/api/auth/login`: 15, `/api/auth/refresh`: 20, `/api/ocr/scan`: 10, `/api/expenses/scan`: 10, `/api/expenses/bulk-upload`: 5, `/api/reports/import-order`: 10, `^/api/reports/\d+/(export|export-csv|pdf|receipts-zip)$`: 15); skips when `!enabled` or method is `OPTIONS`/`HEAD`; trusts `CF-Connecting-IP`/`X-Forwarded-For`/`X-Real-IP` only when `request.remoteAddr` matches `rate-limiting.trusted-proxies`.
- `[InMemoryRateLimitStore.kt:InMemoryRateLimitStore.record]` & `[RedisRateLimitStore.kt:RedisRateLimitStore.record]` — In-memory uses a sliding window with expired/overflow eviction above `maxTrackedKeys.coerceAtLeast(1)`; Redis uses a fixed-window Lua `INCR`/`PEXPIRE` on `"xpenses:rate-limit:$key:$bucket"`, returning `limit + 1` on Redis failure if `failClosed == true` or falling back to `InMemoryRateLimitStore` if `failClosed == false`.

## Side Effects
- `[JwtAuthenticationFilter.kt:JwtAuthenticationFilter.doFilterInternal]` — Queries `userRepository.findById(claims.userId)`, populates `SecurityContextHolder` with `ROLE_${user.role}` and sets request attribute `"currentUser"`, or clears `SecurityContextHolder` and writes HTTP `401` on `tokenVersion` mismatch.
- `[RateLimitingFilter.kt:RateLimitingFilter.doFilterInternal]` — Logs warnings and writes HTTP `429` JSON `{"detail":"Rate limit exceeded. Please try again later."}` when rate limit is exceeded.
- `[InMemoryRateLimitStore.kt:InMemoryRateLimitStore.record]` — Mutates in-memory `ConcurrentHashMap` and per-key `ArrayDeque<Long>` timestamps.
- `[RedisRateLimitStore.kt:RedisRateLimitStore.record]` — Executes Lua script against Redis (`INCR` / `PEXPIRE`) and logs errors (mutating fallback in-memory store on failure when `!failClosed`).

## Verification
- Run: `cd backend-kotlin-jpa && ./gradlew test --tests '<ClassName>' --no-daemon` (targeted test per `AGENTS.md`) or `cd backend-kotlin-jpa && ./gradlew test --no-daemon` (full backend suite in isolated/CI env).
