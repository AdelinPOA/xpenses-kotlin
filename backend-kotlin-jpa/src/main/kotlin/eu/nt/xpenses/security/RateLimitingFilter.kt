package eu.nt.xpenses.security

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.slf4j.LoggerFactory
import org.springframework.cache.CacheManager
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

import org.springframework.beans.factory.annotation.Value

@Component
class RateLimitingFilter(
    private val cacheManager: CacheManager,
    @Value("\${rate-limiting.enabled:true}")
    private val enabled: Boolean = true
) : OncePerRequestFilter() {

    private val log = LoggerFactory.getLogger(RateLimitingFilter::class.java)

    // Rate limits (requests per 60-second window per IP)
    private val limits = mapOf(
        "/api/auth/login" to 5,
        "/api/expenses/scan" to 10
    )

    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain
    ) {
        if (!enabled) {
            filterChain.doFilter(request, response)
            return
        }
        val path = request.requestURI
        val clientIp = extractClientIp(request)

        val matchedLimitKey = limits.keys.find { path.startsWith(it) }
            ?: if (path.matches(Regex("^/api/reports/\\d+/(pdf|receipts-zip)$"))) "/api/reports/export" else null

        val limit = matchedLimitKey?.let { limits[it] ?: 15 }

        if (limit != null) {
            val cacheKey = "rl:${matchedLimitKey}:${clientIp}"
            val cache = cacheManager.getCache("rate-limit-cache")
            
            val count = if (cache != null) {
                val current = (cache.get(cacheKey)?.get() as? Number)?.toInt() ?: 0
                val newCount = current + 1
                cache.put(cacheKey, newCount)
                newCount
            } else {
                1
            }

            if (count > limit) {
                log.warn("Rate limit exceeded for IP {} on path {}: {} > {}", clientIp, path, count, limit)
                response.status = HttpStatus.TOO_MANY_REQUESTS.value()
                response.contentType = "application/json"
                response.writer.write("""{"detail":"Rate limit exceeded. Please try again later."}""")
                return
            }
        }

        filterChain.doFilter(request, response)
    }

    private fun extractClientIp(request: HttpServletRequest): String {
        val xForwardedFor = request.getHeader("X-Forwarded-For")
        if (!xForwardedFor.isNullOrBlank()) {
            val firstIp = xForwardedFor.split(",")[0].trim()
            if (!isPrivateIp(firstIp)) {
                return firstIp
            }
        }

        val xRealIp = request.getHeader("X-Real-IP")
        if (!xRealIp.isNullOrBlank()) {
            return xRealIp.trim()
        }

        return request.remoteAddr ?: "unknown"
    }

    private fun isPrivateIp(ip: String): Boolean {
        val parts = ip.split(".").mapNotNull { it.toIntOrNull() }
        if (parts.size != 4) return false
        return when (parts[0]) {
            10 -> true
            172 -> parts[1] in 16..31
            192 -> parts[1] == 168
            127 -> true
            169 -> parts[1] == 254
            else -> false
        }
    }
}
