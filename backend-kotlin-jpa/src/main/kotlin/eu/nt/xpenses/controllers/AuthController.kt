package eu.nt.xpenses.controllers

import eu.nt.xpenses.models.RefreshToken
import eu.nt.xpenses.models.User
import eu.nt.xpenses.models.UserResponse
import com.fasterxml.jackson.annotation.JsonProperty
import eu.nt.xpenses.repositories.RefreshTokenRepository
import eu.nt.xpenses.repositories.UserRepository
import eu.nt.xpenses.security.JwtTokenProvider
import eu.nt.xpenses.services.LdapService
import eu.nt.xpenses.services.LDAPBindException
import eu.nt.xpenses.services.LDAPUnavailableException
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size
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
    @Value("\${cookie.secure:false}") private val cookieSecure: Boolean
) {

    @PostMapping("/login")
    @Transactional
    fun login(
        @Valid @RequestBody request: LoginRequest,
        response: HttpServletResponse
    ): ResponseEntity<*> {
        val user = userRepository.findByUsername(request.username)
        if (user == null) {
            // Prevent username enumeration timing oracle: always run bcrypt regardless
            passwordEncoder.matches(request.password, "\$2a\$10\$dummyHashThatIsLongEnoughSoBcryptDoesNotCrash")
            return ResponseEntity.status(401).body(mapOf("detail" to "Invalid credentials"))
        }

        if (!user.isActive) {
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
            } catch (e: LDAPUnavailableException) {
                return ResponseEntity.status(503).body(mapOf("detail" to "LDAP server unavailable"))
            } catch (e: LDAPBindException) {
                return ResponseEntity.status(401).body(mapOf("detail" to "Invalid credentials"))
            }
        } else {
            return ResponseEntity.status(400).body(mapOf("detail" to "Unsupported auth source"))
        }

        val accessToken = tokenProvider.createAccessToken(user.id!!, user.username, user.role, user.tokenVersion)
        val rawRefreshToken = tokenProvider.createRefreshToken()
        val hashedRefreshToken = tokenProvider.hashRefreshToken(rawRefreshToken)

        // Invalidate old refresh tokens
        refreshTokenRepository.deleteByUserId(user.id!!)

        // Store new refresh token
        val tokenExpiry = Instant.now().plus(7, ChronoUnit.DAYS)
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

        val rawToken = refreshTokenCookie.value
        val hashedToken = tokenProvider.hashRefreshToken(rawToken)

        val storedToken = refreshTokenRepository.findByTokenHash(hashedToken)
            ?: return ResponseEntity.status(401).body(mapOf("detail" to "Invalid refresh token"))

        if (storedToken.expiresAt.isBefore(Instant.now())) {
            refreshTokenRepository.delete(storedToken)
            clearAuthCookies(response)
            return ResponseEntity.status(401).body(mapOf("detail" to "Refresh token expired"))
        }

        val user = storedToken.user
        if (!user.isActive) {
            refreshTokenRepository.deleteByUserId(user.id!!)
            clearAuthCookies(response)
            return ResponseEntity.status(403).body(mapOf("detail" to "Account deactivated"))
        }

        // Rotate token
        refreshTokenRepository.delete(storedToken)

        val newAccessToken = tokenProvider.createAccessToken(user.id!!, user.username, user.role, user.tokenVersion)
        val newRawRefreshToken = tokenProvider.createRefreshToken()
        val newHashedRefreshToken = tokenProvider.hashRefreshToken(newRawRefreshToken)

        refreshTokenRepository.save(
            RefreshToken(
                user = user,
                tokenHash = newHashedRefreshToken,
                expiresAt = Instant.now().plus(7, ChronoUnit.DAYS)
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
            .maxAge(15 * 60)
            .sameSite("Lax")
            .build()

        val refreshCookie = ResponseCookie.from("refresh_token", refreshToken)
            .httpOnly(true)
            .secure(cookieSecure)
            .path("/")
            .maxAge(7 * 24 * 60 * 60)
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

data class LoginRequest(
    @field:NotBlank val username: String,
    @field:NotBlank val password: String
)

data class ChangePasswordRequest(
    @JsonProperty("old_password") @field:NotBlank val oldPassword: String,
    @JsonProperty("new_password") @field:NotBlank @field:Size(min = 8) val newPassword: String
)
