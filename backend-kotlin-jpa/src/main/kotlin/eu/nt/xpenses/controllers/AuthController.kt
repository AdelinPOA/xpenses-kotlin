package eu.nt.xpenses.controllers

import eu.nt.xpenses.dto.auth.ChangePasswordRequest
import eu.nt.xpenses.dto.auth.LoginRequest
import eu.nt.xpenses.dto.user.UserResponse
import eu.nt.xpenses.model.RefreshToken
import eu.nt.xpenses.model.User
import eu.nt.xpenses.repositories.RefreshTokenRepository
import eu.nt.xpenses.repositories.UserRepository
import eu.nt.xpenses.security.InMemoryRateLimitStore
import eu.nt.xpenses.security.JwtTokenProvider
import eu.nt.xpenses.security.RateLimitStore
import eu.nt.xpenses.services.LdapService
import eu.nt.xpenses.services.LDAPBindException
import eu.nt.xpenses.services.LDAPUnavailableException
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import jakarta.validation.Valid
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpHeaders
import org.springframework.http.ResponseCookie
import org.springframework.http.ResponseEntity
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.*
import java.time.Instant
import java.time.temporal.ChronoUnit

@RestController
@RequestMapping("/api/auth")
class AuthController(
    private val userRepository: UserRepository,
    private val passwordEncoder: BCryptPasswordEncoder,
    private val tokenProvider: JwtTokenProvider,
    private val refreshTokenRepository: RefreshTokenRepository,
    private val ldapService: LdapService,
    @Value("\${cookie.secure:false}") private val cookieSecure: Boolean,
    @Value("\${jwt.refresh-expires-days:30}") private val refreshExpiresDays: Long,
    @Value("\${jwt.cookie.access-max-age-seconds:0}") private val accessCookieMaxAgeSeconds: Long,
    @Value("\${rate-limiting.enabled:true}") private val rateLimitingEnabled: Boolean = true,
    private val rateLimitStore: RateLimitStore = InMemoryRateLimitStore()
) {
    companion object {
        private const val REFRESH_ROTATION_GRACE_SECONDS = 30L
        private const val ACCOUNT_LOGIN_LIMIT = 15
        private const val ACCOUNT_LOGIN_WINDOW_MILLIS = 60_000L
        private const val DUMMY_BCRYPT_HASH =
            "\$2a\$10\$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy"
    }

    private val cookieMaxAgeSeconds: Long by lazy {
        if (accessCookieMaxAgeSeconds > 0) accessCookieMaxAgeSeconds else refreshExpiresDays * 86400
    }

    @PostMapping("/login")
    @Transactional
    fun login(
        @Valid @RequestBody request: LoginRequest,
        response: HttpServletResponse
    ): ResponseEntity<*> {
        val trimmedIdentifier = request.username.trim()
        if (rateLimitingEnabled && trimmedIdentifier.isNotEmpty()) {
            val accountKey = "rl:login:user:${trimmedIdentifier.lowercase()}"
            val count = rateLimitStore.record(
                key = accountKey,
                limit = ACCOUNT_LOGIN_LIMIT,
                windowMillis = ACCOUNT_LOGIN_WINDOW_MILLIS,
                nowMillis = System.currentTimeMillis()
            )
            if (count > ACCOUNT_LOGIN_LIMIT) {
                return ResponseEntity.status(429).body(mapOf("detail" to "Rate limit exceeded. Please try again later."))
            }
        }

        val user = userRepository.findByIdentifier(trimmedIdentifier).firstOrNull()
        if (user == null) {
            passwordEncoder.matches(request.password, DUMMY_BCRYPT_HASH)
            return ResponseEntity.status(401).body(mapOf("detail" to "Invalid credentials"))
        }

        if (!user.isActive) {
            passwordEncoder.matches(request.password, user.passwordHash ?: DUMMY_BCRYPT_HASH)
            return ResponseEntity.status(403).body(mapOf("detail" to "Account deactivated"))
        }

        if (user.authSource == "local") {
            if (user.passwordHash == null || !passwordEncoder.matches(request.password, user.passwordHash)) {
                return ResponseEntity.status(401).body(mapOf("detail" to "Invalid credentials"))
            }
        } else if (user.authSource == "ldap") {
            val ldapConfig = ldapService.getLdapConfig()
            if (!ldapConfig.enabled) {
                return ResponseEntity.status(401).body(mapOf("detail" to "LDAP authentication is disabled"))
            }
            try {
                ldapService.authenticateLdap(request.username, request.password, ldapConfig)
            } catch (_: LDAPUnavailableException) {
                return ResponseEntity.status(503).body(mapOf("detail" to "LDAP server unavailable"))
            } catch (_: LDAPBindException) {
                return ResponseEntity.status(401).body(mapOf("detail" to "Invalid credentials"))
            }
        } else {
            return ResponseEntity.status(400).body(mapOf("detail" to "Unsupported auth source"))
        }

        val now = Instant.now()
        val accessToken = tokenProvider.createAccessToken(user.id!!, user.username, user.role, user.tokenVersion)
        val rawRefreshToken = tokenProvider.createRefreshToken()
        val hashedRefreshToken = tokenProvider.hashRefreshToken(rawRefreshToken)

        // Retain active tokens on other devices while pruning expired/past-grace rows.
        refreshTokenRepository.deleteExpiredAndRotated(user.id!!, now, now.minusSeconds(REFRESH_ROTATION_GRACE_SECONDS))

        val tokenExpiry = now.plus(refreshExpiresDays, ChronoUnit.DAYS)
        refreshTokenRepository.save(
            RefreshToken(
                user = user,
                tokenHash = hashedRefreshToken,
                expiresAt = tokenExpiry
            )
        )

        setAuthCookies(response, accessToken, rawRefreshToken)

        return ResponseEntity.ok(UserResponse.fromUser(user))
    }

    @PostMapping("/refresh")
    @Transactional
    fun refresh(
        request: HttpServletRequest,
        response: HttpServletResponse
    ): ResponseEntity<*> {
        val cookies = request.cookies
        val refreshTokenCookie = cookies?.find { it.name == "refresh_token" }
            ?: return ResponseEntity.status(401).body(mapOf("detail" to "No refresh token"))

        val now = Instant.now()
        val rawToken = refreshTokenCookie.value
        val hashedToken = tokenProvider.hashRefreshToken(rawToken)

        val storedToken = refreshTokenRepository.findByTokenHashForUpdate(hashedToken)
        if (storedToken == null) {
            clearAuthCookies(response)
            return ResponseEntity.status(401).body(mapOf("detail" to "Invalid refresh token"))
        }

        if (storedToken.expiresAt.isBefore(now)) {
            refreshTokenRepository.delete(storedToken)
            clearAuthCookies(response)
            return ResponseEntity.status(401).body(mapOf("detail" to "Refresh token expired"))
        }

        val user = storedToken.user
        if (!user.isActive) {
            user.tokenVersion++
            userRepository.save(user)
            refreshTokenRepository.deleteByUserId(user.id!!)
            clearAuthCookies(response)
            return ResponseEntity.status(403).body(mapOf("detail" to "Account deactivated"))
        }

        val rotatedAt = storedToken.rotatedAt
        if (rotatedAt != null) {
            val graceCutoff = now.minusSeconds(REFRESH_ROTATION_GRACE_SECONDS)
            if (rotatedAt.isBefore(graceCutoff)) {
                // Replay of an already-rotated token outside the concurrent race window.
                user.tokenVersion++
                userRepository.save(user)
                refreshTokenRepository.deleteByUserId(user.id!!)
                clearAuthCookies(response)
                return ResponseEntity.status(401).body(mapOf("detail" to "Invalid refresh token"))
            }
        } else {
            storedToken.rotatedAt = now
            refreshTokenRepository.save(storedToken)
        }

        refreshTokenRepository.deleteExpiredAndRotated(user.id!!, now, now.minusSeconds(REFRESH_ROTATION_GRACE_SECONDS))

        val newAccessToken = tokenProvider.createAccessToken(user.id!!, user.username, user.role, user.tokenVersion)
        val newRawRefreshToken = tokenProvider.createRefreshToken()
        val newHashedRefreshToken = tokenProvider.hashRefreshToken(newRawRefreshToken)

        refreshTokenRepository.save(
            RefreshToken(
                user = user,
                tokenHash = newHashedRefreshToken,
                expiresAt = now.plus(refreshExpiresDays, ChronoUnit.DAYS)
            )
        )

        setAuthCookies(response, newAccessToken, newRawRefreshToken)

        return ResponseEntity.ok(mapOf("status" to "refreshed"))
    }

    @PostMapping("/logout")
    @Transactional
    fun logout(
        request: HttpServletRequest,
        response: HttpServletResponse
    ): ResponseEntity<*> {
        val cookies = request.cookies
        val refreshTokenCookie = cookies?.find { it.name == "refresh_token" }
        if (refreshTokenCookie != null) {
            val rawToken = refreshTokenCookie.value
            val hashedToken = tokenProvider.hashRefreshToken(rawToken)
            val storedToken = refreshTokenRepository.findByTokenHash(hashedToken)
            if (storedToken != null) {
                refreshTokenRepository.delete(storedToken)
            }
        }

        clearAuthCookies(response)
        return ResponseEntity.ok(mapOf("status" to "logged out"))
    }

    @PostMapping("/change-password")
    @Transactional
    fun changePassword(
        @Valid @RequestBody body: ChangePasswordRequest,
        request: HttpServletRequest
    ): ResponseEntity<*> {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: return ResponseEntity.status(401).body(mapOf("detail" to "Not authenticated"))

        if (currentUser.authSource != "local") {
            return ResponseEntity.status(400).body(mapOf("detail" to "Password change is only available for local accounts"))
        }
        if (currentUser.passwordHash == null || !passwordEncoder.matches(body.oldPassword, currentUser.passwordHash)) {
            return ResponseEntity.status(400).body(mapOf("detail" to "Current password is incorrect"))
        }
        if (body.newPassword.length < 8) {
            return ResponseEntity.status(400).body(mapOf("detail" to "New password must be at least 8 characters"))
        }

        currentUser.passwordHash = passwordEncoder.encode(body.newPassword)
        currentUser.tokenVersion++
        userRepository.save(currentUser)
        refreshTokenRepository.deleteByUserId(currentUser.id!!)
        return ResponseEntity.ok(mapOf("status" to "password changed"))
    }

    @GetMapping("/me")
    fun getMe(request: HttpServletRequest): ResponseEntity<*> {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: return ResponseEntity.status(401).body(mapOf("detail" to "Not authenticated"))

        return ResponseEntity.ok(UserResponse.fromUser(currentUser))
    }

    private fun setAuthCookies(response: HttpServletResponse, accessToken: String, refreshToken: String) {
        val accessCookie = ResponseCookie.from("access_token", accessToken)
            .httpOnly(true)
            .secure(cookieSecure)
            .path("/")
            .maxAge(cookieMaxAgeSeconds)
            .sameSite("Lax")
            .build()

        val refreshCookie = ResponseCookie.from("refresh_token", refreshToken)
            .httpOnly(true)
            .secure(cookieSecure)
            .path("/")
            .maxAge(cookieMaxAgeSeconds)
            .sameSite("Lax")
            .build()

        response.addHeader(HttpHeaders.SET_COOKIE, accessCookie.toString())
        response.addHeader(HttpHeaders.SET_COOKIE, refreshCookie.toString())
    }

    private fun clearAuthCookies(response: HttpServletResponse) {
        val clearAccess = ResponseCookie.from("access_token", "")
            .httpOnly(true)
            .secure(cookieSecure)
            .path("/")
            .maxAge(0)
            .sameSite("Lax")
            .build()

        val clearRefresh = ResponseCookie.from("refresh_token", "")
            .httpOnly(true)
            .secure(cookieSecure)
            .path("/")
            .maxAge(0)
            .sameSite("Lax")
            .build()

        response.addHeader(HttpHeaders.SET_COOKIE, clearAccess.toString())
        response.addHeader(HttpHeaders.SET_COOKIE, clearRefresh.toString())
    }
}
