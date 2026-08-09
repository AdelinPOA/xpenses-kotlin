package eu.nt.xpenses.security

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter
import java.util.ArrayDeque
import java.util.concurrent.ConcurrentHashMap

@Component
class RateLimitingFilter(
    @Value("\${rate-limiting.enabled:true}")
    private val enabled: Boolean = true,
    @Value("\${rate-limiting.trusted-proxies:}")
    trustedProxyAddresses: String = "",
    @Value("\${rate-limiting.max-tracked-keys:10000}")
    maxTrackedKeys: Int = 10_000,
    private val windowMillis: Long = WINDOW_MILLIS,
    private val clock: () -> Long = System::currentTimeMillis
) : OncePerRequestFilter() {

    private val log = LoggerFactory.getLogger(RateLimitingFilter::class.java)
    private val trustedProxies = trustedProxyAddresses.split(',')
        .map(String::trim)
        .filter(String::isNotEmpty)
        .toSet()
    private val maxKeys = maxTrackedKeys.coerceAtLeast(1)

    companion object {
        private val EXPORT_REPORT_PATH = Regex("^/api/reports/\\d+/(pdf|receipts-zip)$")
        private const val WINDOW_MILLIS = 60_000L
    }

    // Rate limits (requests per 60-second window per client identity).
    private val limits = mapOf(
        "/api/auth/login" to 5,
        "/api/ocr/scan" to 10,
        "/api/expenses/scan" to 10
    )

    /*
     * This is a bounded fallback limiter. Production deployments with multiple
     * backend replicas should use the distributed Bucket4j cache configuration;
     * this map must never become an unbounded process-wide identity store.
     */
    private val requestTimes = ConcurrentHashMap<String, ArrayDeque<Long>>()

    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain
    ) {
        if (!enabled ||
            request.method.equals("OPTIONS", ignoreCase = true) ||
            request.method.equals("HEAD", ignoreCase = true)
        ) {
            filterChain.doFilter(request, response)
            return
        }

        val path = request.requestURI
        val clientIp = extractClientIp(request)
        val matchedLimitKey = limits.keys.find { matchesPath(path, it) }
            ?: if (path.matches(EXPORT_REPORT_PATH)) "/api/reports/export" else null
        val limit = matchedLimitKey?.let { limits[it] ?: 15 }

        if (limit != null) {
            val cacheKey = "rl:$matchedLimitKey:$clientIp"
            val count = recordRequest(cacheKey, limit)

            if (count > limit) {
                log.warn("Rate limit exceeded for client {} on path {}: {} > {}", clientIp, path, count, limit)
                response.status = HttpStatus.TOO_MANY_REQUESTS.value()
                response.contentType = "application/json"
                response.writer.write("""{"detail":"Rate limit exceeded. Please try again later."}""")
                return
            }
        }

        filterChain.doFilter(request, response)
    }

    private fun matchesPath(path: String, configuredPath: String): Boolean =
        path == configuredPath || path.startsWith("$configuredPath/")

    private fun recordRequest(cacheKey: String, limit: Int): Int {
        val now = clock()
        evictExpiredAndOverflowingEntries(now)
        val windowStart = now - windowMillis
        val timestamps = requestTimes.computeIfAbsent(cacheKey) { ArrayDeque() }

        synchronized(timestamps) {
            while (timestamps.isNotEmpty() && timestamps.peekFirst() <= windowStart) {
                timestamps.removeFirst()
            }
            if (timestamps.size >= limit) {
                return timestamps.size + 1
            }
            timestamps.addLast(now)
            return timestamps.size
        }
    }

    private fun evictExpiredAndOverflowingEntries(now: Long) {
        val cutoff = now - windowMillis
        requestTimes.entries.forEach { entry ->
            val expired = synchronized(entry.value) {
                entry.value.isEmpty() || entry.value.peekLast() <= cutoff
            }
            if (expired) {
                requestTimes.remove(entry.key, entry.value)
            }
        }

        val overflow = requestTimes.size - maxKeys
        if (overflow > 0) {
            requestTimes.keys.take(overflow).forEach(requestTimes::remove)
        }
    }

    private fun extractClientIp(request: HttpServletRequest): String {
        val remoteAddress = request.remoteAddr?.trim().orEmpty().ifBlank { "unknown" }
        if (remoteAddress !in trustedProxies) {
            // Forwarded headers are client-controlled unless the immediate peer is trusted.
            return remoteAddress
        }

        val forwardedAddress = request.getHeader("X-Forwarded-For")
            ?.split(',')
            ?.asSequence()
            ?.map(String::trim)
            ?.firstOrNull(String::isNotEmpty)
        if (!forwardedAddress.isNullOrBlank()) {
            return forwardedAddress
        }

        return request.getHeader("X-Real-IP")?.trim().takeUnless { it.isNullOrBlank() } ?: remoteAddress
    }
}
