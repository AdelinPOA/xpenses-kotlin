package eu.nt.xpenses.security

import jakarta.servlet.FilterChain
import org.junit.jupiter.api.Assertions.assertEquals
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
    fun `should bypass OPTIONS and HEAD requests`() {
        val optionsReq = MockHttpServletRequest("OPTIONS", "/api/auth/login")
        val optionsRes = MockHttpServletResponse()
        val filterChain = mock(FilterChain::class.java)

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
    fun `should rate limit login requests after limit exceeded`() {
        val filterChain = mock(FilterChain::class.java)

        // /api/auth/login has limit of 5
        for (i in 1..5) {
            val (req, res) = login()
            filter.doFilter(req, res, filterChain)
            assertEquals(200, res.status)
        }

        // 6th request should be rate limited (429)
        val (blockedReq, blockedRes) = login()
        filter.doFilter(blockedReq, blockedRes, filterChain)

        assertEquals(429, blockedRes.status)
    }

    @Test
    fun `should allow requests again after the window expires`() {
        val filterChain = mock(FilterChain::class.java)

        repeat(5) {
            val (req, res) = login()
            filter.doFilter(req, res, filterChain)
            assertEquals(200, res.status)
        }

        val (blockedReq, blockedRes) = login()
        filter.doFilter(blockedReq, blockedRes, filterChain)
        assertEquals(429, blockedRes.status)

        // Advance past the 60-second window: the same IP must be allowed again
        clock.set(60_001)

        val (newReq, newRes) = login()
        filter.doFilter(newReq, newRes, filterChain)
        assertEquals(200, newRes.status)
    }

    @Test
    fun `should rate limit each IP independently`() {
        val filterChain = mock(FilterChain::class.java)

        repeat(5) {
            val (req, res) = login("192.168.1.100")
            filter.doFilter(req, res, filterChain)
            assertEquals(200, res.status)
        }

        // A different IP is not affected
        val (otherReq, otherRes) = login("192.168.1.200")
        filter.doFilter(otherReq, otherRes, filterChain)
        assertEquals(200, otherRes.status)

        // Original IP is still blocked
        val (blockedReq, blockedRes) = login("192.168.1.100")
        filter.doFilter(blockedReq, blockedRes, filterChain)
        assertEquals(429, blockedRes.status)
    }
}