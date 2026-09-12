package eu.nt.xpenses.ocr

import eu.nt.xpenses.model.OcrJob
import eu.nt.xpenses.model.OcrJobStage
import eu.nt.xpenses.model.OcrJobStatus
import eu.nt.xpenses.model.OcrJobStateMachine
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Instant

class OcrJobStateMachineTest {

    @Test
    fun `pending OCR job can be claimed with a lease`() {
        val now = Instant.parse("2026-09-10T10:00:00Z")
        val leaseUntil = now.plusSeconds(60)
        val job = OcrJob(
            id = 7,
            status = OcrJobStatus.PENDING,
            stage = OcrJobStage.OCR
        )

        assertTrue(OcrJobStateMachine.claim(job, "lease-1", leaseUntil, now))
        assertEquals(OcrJobStatus.PROCESSING, job.status)
        assertEquals("lease-1", job.leaseToken)
        assertEquals(leaseUntil, job.leaseUntil)
    }

    @Test
    fun `claim consumes retry schedule and increments attempt count`() {
        val now = Instant.parse("2026-09-10T10:00:00Z")
        val job = OcrJob(
            id = 6,
            status = OcrJobStatus.RETRY_WAIT,
            stage = OcrJobStage.OCR,
            attemptCount = 2,
            nextAttemptAt = now.minusSeconds(1)
        )

        assertTrue(OcrJobStateMachine.claim(job, "lease-6", now.plusSeconds(60), now))
        assertEquals(OcrJobStatus.PROCESSING, job.status)
        assertEquals(3, job.attemptCount)
        assertEquals(null, job.nextAttemptAt)
    }

    @Test
    fun `successful stages advance without allowing a stale worker to write`() {
        val now = Instant.parse("2026-09-10T10:00:00Z")
        val job = OcrJob(
            id = 9,
            status = OcrJobStatus.PROCESSING,
            stage = OcrJobStage.OCR,
            leaseToken = "lease-9",
            leaseUntil = now.plusSeconds(60)
        )

        assertTrue(OcrJobStateMachine.completeStage(job, "lease-9", now.plusSeconds(1)))
        assertEquals(OcrJobStage.EXPENSE, job.stage)
        assertEquals(OcrJobStatus.PENDING, job.status)
        assertEquals(null, job.leaseToken)

        assertTrue(OcrJobStateMachine.claim(job, "lease-10", now.plusSeconds(61), now.plusSeconds(2)))
        assertTrue(OcrJobStateMachine.recordTransientFailure(
            job,
            "lease-10",
            now.plusSeconds(30),
            "PROVIDER_TIMEOUT",
            "provider timeout",
            now.plusSeconds(3)
        ))
        assertEquals(OcrJobStatus.RETRY_WAIT, job.status)
        assertEquals(OcrJobStage.EXPENSE, job.stage)
        assertEquals(now.plusSeconds(30), job.nextAttemptAt)
    }

    @Test
    fun `expired worker cannot complete a leased stage`() {
        val now = Instant.parse("2026-09-10T10:00:00Z")
        val job = OcrJob(
            id = 10,
            status = OcrJobStatus.PROCESSING,
            stage = OcrJobStage.OCR,
            leaseToken = "expired-lease",
            leaseUntil = now.plusSeconds(1)
        )

        assertTrue(!OcrJobStateMachine.completeStage(job, "expired-lease", now.plusSeconds(2)))
        assertEquals(OcrJobStatus.PROCESSING, job.status)
        assertEquals(OcrJobStage.OCR, job.stage)
    }

    @Test
    fun `stale worker cannot complete a leased stage`() {
        val now = Instant.parse("2026-09-10T10:00:00Z")
        val job = OcrJob(
            id = 8,
            status = OcrJobStatus.PROCESSING,
            stage = OcrJobStage.OCR,
            leaseToken = "current-lease",
            leaseUntil = now.plusSeconds(60)
        )

        assertTrue(!OcrJobStateMachine.completeStage(job, "stale-lease", now.plusSeconds(1)))
        assertEquals(OcrJobStatus.PROCESSING, job.status)
        assertEquals(OcrJobStage.OCR, job.stage)
        assertEquals("current-lease", job.leaseToken)
    }
}
