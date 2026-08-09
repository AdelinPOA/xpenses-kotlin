package eu.nt.xpenses.security

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class InMemoryRateLimitStoreTest {

    @Test
    fun enforcesLimitAndResetsAfterWindow() {
        val store = InMemoryRateLimitStore(maxTrackedKeys = 2)

        assertEquals(1, store.record("login:ip", 2, 60_000, 0))
        assertEquals(2, store.record("login:ip", 2, 60_000, 1))
        assertEquals(3, store.record("login:ip", 2, 60_000, 2))
        assertEquals(1, store.record("login:ip", 2, 60_000, 60_001))
    }

    @Test
    fun boundsTrackedIdentities() {
        val store = InMemoryRateLimitStore(maxTrackedKeys = 2)

        repeat(10) { index ->
            store.record("key-$index", 5, 60_000, index.toLong())
        }

        assertEquals(1, store.record("key-10", 5, 60_000, 10))
    }
}
