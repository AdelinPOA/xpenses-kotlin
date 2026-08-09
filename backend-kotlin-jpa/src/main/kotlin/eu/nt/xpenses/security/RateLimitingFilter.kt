package eu.nt.xpenses.security

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter

@Component
class RateLimitingFilter(
    @Value("${rate-limiting.enabled:true}")
    private val enabled: Boolean = true,
    @Value("${rate-limiting.trusted-proxies:}")
    trustedProxyAddresses: String = "",
    @Value("${rate-limiting.max-tracked-keys:10000}")
    maxTrackedKeys: Int = 10_000,
    private val windowMillis: Long = WINDOW_MILLIS,
    private val clock: () -> Long = System::currentTimeMillis,
    private val rateLimitStore: RateLimitStore = InMemoryRateLimitStore(maxTrackedKeys)
) : OncePerRequestFilter() {

    private val log = LoggerFactory.getLogger(RateLimitingFilter::class.java)
    private val trustedProxies = trustedProxyAddresses.split(',')
        .map(String::trim)
        .filter(String::isNotEmpty)
        .toSet()

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
            val count = rateLimitStore.record(cacheKey, limit, windowMillis, clock())

            if (count > limit) {
                log.warn("Rate limit exceeded for client $clientIp on path $path: $count > $limit")
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
