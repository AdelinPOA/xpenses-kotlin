package eu.nt.xpenses.security

import io.jsonwebtoken.Jwts
import io.jsonwebtoken.security.Keys
import jakarta.annotation.PostConstruct
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import java.security.MessageDigest
import java.security.SecureRandom
import java.time.Instant
import java.util.*
import javax.crypto.SecretKey
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

@Component
class JwtTokenProvider(
    @Value("\${jwt.secret:}")
    private val jwtSecret: String,
    @Value("\${jwt.access-expires-minutes:15}")
    private val accessExpiresMinutes: Long
) {

    @PostConstruct
    fun validateSecret() {
        if (jwtSecret.isBlank()) {
            throw IllegalStateException("JWT_SECRET environment variable must be set — refusing to start with an empty secret")
        }
    }

    private val key: SecretKey by lazy {
        // Derive a proper 256-bit HMAC key using PBKDF2 instead of zero-padding short secrets
        val spec = PBEKeySpec(jwtSecret.toCharArray(), "xpenses-jwt-salt".toByteArray(), 65536, 256)
        val factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
        val derived = factory.generateSecret(spec).encoded
        Keys.hmacShaKeyFor(derived)
    }

    private val secureRandom = SecureRandom()

    fun createAccessToken(userId: Int, username: String, role: String): String {
        val now = Instant.now()
        val expiry = now.plusSeconds(accessExpiresMinutes * 60)
        
        return Jwts.builder()
            .subject(userId.toString())
            .claim("username", username)
            .claim("role", role)
            .issuedAt(Date.from(now))
            .expiration(Date.from(expiry))
            .signWith(key)
            .compact()
    }

    fun decodeAccessToken(token: String): ClaimsData? {
        return try {
            val claims = Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .payload
                
            ClaimsData(
                userId = claims.subject.toInt(),
                username = claims["username"] as String,
                role = claims["role"] as String
            )
        } catch (e: Exception) {
            null
        }
    }
    
    fun createRefreshToken(): String {
        val bytes = ByteArray(48)
        secureRandom.nextBytes(bytes)
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
    }
    
    fun hashRefreshToken(token: String): String {
        val bytes = MessageDigest.getInstance("SHA-256").digest(token.toByteArray())
        return bytes.joinToString("") { "%02x".format(it) }
    }
}

data class ClaimsData(
    val userId: Int,
    val username: String,
    val role: String
)
