package eu.nt.xpenses.ingestion

import eu.nt.xpenses.IntegrationTestBase
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import java.time.Instant

class ImapIngestionLedgerTest : IntegrationTestBase() {

    @Autowired
    private lateinit var ledger: ImapIngestionLedger

    @Test
    fun `claim returns a token for new key and skips duplicate or processed claim`() {
        val key = "msg-unique-test-1"
        val first = ledger.claim(key)
        assertTrue(first is ClaimDecision.Process)

        assertTrue(ledger.claim(key) is ClaimDecision.Skip)
        val claim = first as ClaimDecision.Process
        ledger.markProcessed(claim.claim, 101)

        assertTrue(ledger.claim(key) is ClaimDecision.Acknowledge)
        assertTrue(ledger.listRecovery().single { it.messageKey == key }.expenseReportId == 101)
    }

    @Test
    fun `stale worker cannot complete a claim reclaimed by another worker`() {
        val key = "msg-lease-test-3"
        val first = ledger.claim(key, Instant.parse("2026-09-07T00:00:00Z")) as ClaimDecision.Process
        val second = ledger.claim(key, Instant.parse("2026-09-07T00:16:00Z")) as ClaimDecision.Process

        val staleError = assertThrows(Exception::class.java) {
            ledger.markProcessed(first.claim, 201)
        }
        assertTrue(generateSequence<Throwable>(staleError) { it.cause }.any { it is IngestionLeaseLostException })
        ledger.markProcessed(second.claim, 202)
        assertTrue(ledger.listRecovery().single { it.messageKey == key }.expenseReportId == 202)
    }

    @Test
    fun `active acknowledgement claim is not overwritten before lease expiry`() {
        val key = "msg-ack-lease-test-4"
        val processing = ledger.claim(key) as ClaimDecision.Process
        ledger.markProcessed(processing.claim, 301)

        val firstAcknowledgement = ledger.claim(key) as ClaimDecision.Acknowledge
        assertTrue(ledger.claim(key) is ClaimDecision.Skip)
        val staleAcknowledgement = ledger.claim(key, Instant.now().plusSeconds(16 * 60)) as ClaimDecision.Acknowledge

        val staleError = assertThrows(Exception::class.java) {
            ledger.markAcknowledged(firstAcknowledgement.claim)
        }
        assertTrue(generateSequence<Throwable>(staleError) { it.cause }.any { it is IngestionLeaseLostException })
        ledger.markAcknowledged(staleAcknowledgement.claim)
    }

    @Test
    fun `failed message remains retryable after repeated transient failures`() {
        val key = "msg-retry-test-2"
        var decision = ledger.claim(key) as ClaimDecision.Process
        repeat(8) { attempt ->
            ledger.markFailed(decision.claim, RuntimeException("Provider timed out"), Instant.now())
            decision = ledger.claim(key) as ClaimDecision.Process
            assertNotNull(decision.claim.token)
            assertTrue(decision.claim.attempt == attempt + 2)
        }
        ledger.markFailed(decision.claim, RuntimeException("final transient failure"), Instant.now())
        assertTrue(ledger.listRecovery().single { it.messageKey == key }.status == IngestionStatus.FAILED)
    }
}
