package eu.nt.xpenses.security

import jakarta.servlet.http.HttpServletResponse
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.Mockito.*
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse
import java.util.concurrent.atomic.AtomicLong

class RateLimitingFilterTest {

    private lateinit var clock: AtomicLong
    private lateinit var filter: RateLimitingFilter

    @BeforeEach
    fun setup() {
        clock = AtomicLong(0)
        filter = RateLimitingFilter(enabled = true, windowMillis = 60_000L, clock = { clock.get() })
    }

    private fun login(ip: String = "192.168.1.100"): Pair<MockHttpServletRequest, MockHttpServletResponse> {
        val req = MockHttpServletRequest("POST", "/api/auth/login")
        req.remoteAddr = ip
        return req to MockHttpServletResponse()
    }

    @Test
    fun shouldBypassOptionsAndHeadRequests() {
        val optionsReq = MockHttpServletRequest("OPTIONS", "/api/auth/login")
        val optionsRes = MockHttpServletResponse()
        val filterChain = mock(jakarta.servlet.FilterChain::class.java)

        filter.doFilter(optionsReq, optionsRes, filterChain)

        verify(filterChain).doFilter(optionsReq, optionsRes)
        assertEquals(200, optionsRes.status)

        val headReq = MockHttpServletRequest("HEAD", "/api/auth/login")
        val headRes = MockHttpServletResponse()

        filter.doFilter(headReq, headRes, filterChain)

        verify(filterChain).doFilter(headReq, headRes)
        assertEquals(200, headRes.status)
    }

    @Test
    fun shouldRateLimitLoginRequestsAfterLimitExceeded() {
        val filterChain = mock(jakarta.servlet.FilterChain::class.java)

        repeat(5) {
            val (req, res) = login()
            filter.doFilter(req, res, filterChain)
            assertEquals(200, res.status)
        }

        val (blockedReq, blockedRes) = login()
        filter.doFilter(blockedReq, blockedRes, filterChain)

        assertEquals(429, blockedRes.status)
    }

    @Test
    fun shouldAllowRequestsAgainAfterTheWindowExpires() {
        val filterChain = mock(jakarta.servlet.FilterChain::class.java)

        repeat(5) {
            val (req, res) = login()
            filter.doFilter(req, res, filterChain)
            assertEquals(200, res.status)
        }

        val (blockedReq, blockedRes) = login()
        filter.doFilter(blockedReq, blockedRes, filterChain)
        assertEquals(429, blockedRes.status)

        clock.set(60_001)

        val (newReq, newRes) = login()
        filter.doFilter(newReq, newRes, filterChain)
        assertEquals(200, newRes.status)
    }

    @Test
    fun shouldRateLimitEachIpIndependently() {
        val filterChain = mock(jakarta.servlet.FilterChain::class.java)

        repeat(5) {
            val (req, res) = login("192.168.1.100")
            filter.doFilter(req, res, filterChain)
            assertEquals(200, res.status)
        }

        val (otherReq, otherRes) = login("192.168.1.200")
        filter.doFilter(otherReq, otherRes, filterChain)
        assertEquals(200, otherRes.status)

        val (blockedReq, blockedRes) = login("192.168.1.100")
        filter.doFilter(blockedReq, blockedRes, filterChain)
        assertEquals(429, blockedRes.status)
    }

    @Test
    fun forwardedHeadersAreIgnoredWhenImmediatePeerIsNotTrusted() {
        val untrustedFilter = RateLimitingFilter(true, "", 100)

        repeat(5) {
            assertNotEquals(
                429,
                request(untrustedFilter, "10.0.0.9", "198.51.100.$it").status
            )
        }
        assertEquals(
            429,
            request(untrustedFilter, "10.0.0.9", "203.0.113.1").status
        )
    }

    @Test
    fun trustedProxyMayProvideTheClientAddress() {
        val trustedFilter = RateLimitingFilter(true, "10.0.0.9", 100)

        repeat(5) {
            request(trustedFilter, "10.0.0.9", "198.51.100.1")
        }
        assertNotEquals(
            429,
            request(trustedFilter, "10.0.0.9", "198.51.100.2").status
        )
    }

    @Test
    fun similarPrefixesDoNotMatchAProtectedEndpoint() {
        val filterWithExactMatching = RateLimitingFilter(true, "", 100)

        repeat(6) {
            assertNotEquals(
                429,
                request(filterWithExactMatching, "198.51.100.9", null, "/api/auth/login-extra").status
            )
        }
    }

    private fun request(
        filter: RateLimitingFilter,
        remoteAddress: String,
        forwardedFor: String?,
        path: String = "/api/auth/login"
    ): MockHttpServletResponse {
        val request = MockHttpServletRequest("POST", path)
        request.remoteAddr = remoteAddress
        forwardedFor?.let { request.addHeader("X-Forwarded-For", it) }

        val response = MockHttpServletResponse()
        filter.doFilter(request, response, mock(jakarta.servlet.FilterChain::class.java))
        return response
    }
}
