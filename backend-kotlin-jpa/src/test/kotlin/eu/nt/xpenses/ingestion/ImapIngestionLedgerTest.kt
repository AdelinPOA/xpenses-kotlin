package eu.nt.xpenses.ingestion

import eu.nt.xpenses.IntegrationTestBase
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired

class ImapIngestionLedgerTest : IntegrationTestBase() {

    @Autowired
    private lateinit var ledger: ImapIngestionLedger

    @Test
    fun `claim returns true for new key and false for duplicate claim`() {
        val key = "msg-unique-test-1"
        assertTrue(ledger.claim(key))
        // Immediate second claim should return false because it is already CLAIMED
        assertFalse(ledger.claim(key))

        ledger.markProcessed(key)
        // Claiming an already PROCESSED message must return false
        assertFalse(ledger.claim(key))
    }

    @Test
    fun `failed message can be reclaimed up to max attempts`() {
        val key = "msg-retry-test-2"
        assertTrue(ledger.claim(key, maxAttempts = 2))

        ledger.markFailed(key, RuntimeException("Provider timed out"))
        // First retry (attempt 2) succeeds
        assertTrue(ledger.claim(key, maxAttempts = 2))

        ledger.markFailed(key, RuntimeException("Provider timed out again"))
        // Reaching maxAttempts (2) rejects further claims
        assertFalse(ledger.claim(key, maxAttempts = 2))
    }
}
