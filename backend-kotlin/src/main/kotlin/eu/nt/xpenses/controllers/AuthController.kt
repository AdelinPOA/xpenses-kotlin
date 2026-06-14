package eu.nt.xpenses.controllers

import eu.nt.xpenses.models.RefreshToken
import eu.nt.xpenses.repositories.RefreshTokenRepository
import eu.nt.xpenses.repositories.UserRepository
import eu.nt.xpenses.security.JwtTokenProvider
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.ResponseCookie
import org.springframework.http.ResponseEntity
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.web.bind.annotation.*
import org.springframework.web.server.ServerWebExchange
import java.time.Duration
import java.time.Instant

@RestController
@RequestMapping("/api/auth")
class AuthController(
    private val userRepository: UserRepository,
    private val passwordEncoder: PasswordEncoder,
    private val tokenProvider: JwtTokenProvider,
    private val refreshTokenRepository: RefreshTokenRepository,
    @Value("\${cookie.secure:false}") private val cookieSecure: Boolean
) {

    @PostMapping("/login")
    suspend fun login(
        @RequestBody request: LoginRequest,
        exchange: ServerWebExchange
    ): ResponseEntity<UserResponse> {
        val user = userRepository.findByUsername(request.username)
            ?: return ResponseEntity.status(401).build()

        if (!user.isActive) {
            return ResponseEntity.status(403).build()
        }

        if (user.authSource == "local") {
            if (user.passwordHash == null || !passwordEncoder.matches(request.password, user.passwordHash)) {
                return ResponseEntity.status(401).build()
            }
        } else {
            // Placeholder for LDAP authentication - will be hooked in
            return ResponseEntity.status(501).build()
        }

        val accessToken = tokenProvider.createAccessToken(user.id!!, user.username, user.role)
        val rawRefreshToken = tokenProvider.createRefreshToken()
        val hashedRefreshToken = tokenProvider.hashRefreshToken(rawRefreshToken)

        // Invalidate old refresh tokens for safety
        refreshTokenRepository.deleteByUserId(user.id)

        // Store new refresh token
        val tokenExpiry = Instant.now().plus(Duration.ofDays(7))
        refreshTokenRepository.save(
            RefreshToken(
                userId = user.id,
                tokenHash = hashedRefreshToken,
                expiresAt = tokenExpiry
            )
        )

        setAuthCookies(exchange, accessToken, rawRefreshToken)

        return ResponseEntity.ok(
            UserResponse(
                id = user.id,
                username = user.username,
                displayName = user.displayName,
                email = user.email,
                role = user.role
            )
        )
    }

    @PostMapping("/refresh")
    suspend fun refresh(
        exchange: ServerWebExchange
    ): ResponseEntity<Void> {
        val refreshTokenCookie = exchange.request.cookies.getFirst("refresh_token")
            ?: return ResponseEntity.status(401).build()

        val rawToken = refreshTokenCookie.value
        val hashedToken = tokenProvider.hashRefreshToken(rawToken)

        val storedToken = refreshTokenRepository.findByTokenHash(hashedToken)
            ?: return ResponseEntity.status(401).build()

        if (storedToken.expiresAt.isBefore(Instant.now())) {
            refreshTokenRepository.delete(storedToken)
            clearAuthCookies(exchange)
            return ResponseEntity.status(401).build()
        }

        val user = userRepository.findById(storedToken.userId)
            ?: return ResponseEntity.status(401).build()

        if (!user.isActive) {
            return ResponseEntity.status(403).build()
        }

        // Generate new access token
        val newAccessToken = tokenProvider.createAccessToken(user.id!!, user.username, user.role)
        
        // Refresh cookie
        val accessCookie = ResponseCookie.from("access_token", newAccessToken)
            .httpOnly(true)
            .secure(cookieSecure)
            .path("/")
            .maxAge(Duration.ofMinutes(15))
            .sameSite("Lax")
            .build()
            
        exchange.response.cookies.add("access_token", accessCookie)

        return ResponseEntity.ok().build()
    }

    @PostMapping("/logout")
    suspend fun logout(
        exchange: ServerWebExchange
    ): ResponseEntity<Void> {
        val refreshTokenCookie = exchange.request.cookies.getFirst("refresh_token")
        if (refreshTokenCookie != null) {
            val rawToken = refreshTokenCookie.value
            val hashedToken = tokenProvider.hashRefreshToken(rawToken)
            val storedToken = refreshTokenRepository.findByTokenHash(hashedToken)
            if (storedToken != null) {
                refreshTokenRepository.delete(storedToken)
            }
        }
        
        clearAuthCookies(exchange)
        return ResponseEntity.ok().build()
    }

    private fun setAuthCookies(exchange: ServerWebExchange, accessToken: String, refreshToken: String) {
        val accessCookie = ResponseCookie.from("access_token", accessToken)
            .httpOnly(true)
            .secure(cookieSecure)
            .path("/")
            .maxAge(Duration.ofMinutes(15))
            .sameSite("Lax")
            .build()

        val refreshCookie = ResponseCookie.from("refresh_token", refreshToken)
            .httpOnly(true)
            .secure(cookieSecure)
            .path("/")
            .maxAge(Duration.ofDays(7))
            .sameSite("Lax")
            .build()

        exchange.response.cookies.add("access_token", accessCookie)
        exchange.response.cookies.add("refresh_token", refreshCookie)
    }

    private fun clearAuthCookies(exchange: ServerWebExchange) {
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

        exchange.response.cookies.add("access_token", clearAccess)
        exchange.response.cookies.add("refresh_token", clearRefresh)
    }
}

data class LoginRequest(
    val username: String,
    val password: String
)

data class UserResponse(
    val id: Int,
    val username: String,
    val displayName: String,
    val email: String?,
    val role: String
)
