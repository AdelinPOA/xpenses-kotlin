package eu.nt.xpenses.security

import jakarta.servlet.FilterChain
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.Mockito.*
import org.springframework.cache.Cache
import org.springframework.cache.CacheManager
import org.springframework.cache.concurrent.ConcurrentMapCache
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse

class RateLimitingFilterTest {

    private lateinit var cacheManager: CacheManager
    private lateinit var cache: Cache
    private lateinit var filter: RateLimitingFilter

    @BeforeEach
    fun setup() {
        cacheManager = mock(CacheManager::class.java)
        cache = ConcurrentMapCache("rate-limit-cache")
        `when`(cacheManager.getCache("rate-limit-cache")).thenReturn(cache)
        filter = RateLimitingFilter(cacheManager, enabled = true)
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
            val req = MockHttpServletRequest("POST", "/api/auth/login")
            req.remoteAddr = "192.168.1.100"
            val res = MockHttpServletResponse()
            filter.doFilter(req, res, filterChain)
            assertEquals(200, res.status)
        }

        // 6th request should be rate limited (429)
        val blockedReq = MockHttpServletRequest("POST", "/api/auth/login")
        blockedReq.remoteAddr = "192.168.1.100"
        val blockedRes = MockHttpServletResponse()
        filter.doFilter(blockedReq, blockedRes, filterChain)

        assertEquals(429, blockedRes.status)
    }
}
