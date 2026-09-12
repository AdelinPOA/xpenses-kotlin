package eu.nt.xpenses.repositories

import eu.nt.xpenses.IntegrationTestBase
import eu.nt.xpenses.model.OcrJob
import eu.nt.xpenses.model.OcrJobStage
import eu.nt.xpenses.model.OcrJobStatus
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import java.time.Instant

class OcrJobRepositoryTest : IntegrationTestBase() {
    @Autowired
    lateinit var ocrJobRepository: OcrJobRepository

    @Test
    fun `expired lease is reclaimed with a new token and stale worker cannot complete`() {
        val user = userRepository.findByUsername("tech1")!!
        val now = Instant.parse("2026-09-10T10:00:00Z")
        val job = ocrJobRepository.saveAndFlush(
            OcrJob(
                user = user,
                status = OcrJobStatus.PENDING,
                stage = OcrJobStage.OCR,
                filename = "reclaim.jpg"
            )
        )

        assertEquals(1, ocrJobRepository.claimEligible(job.id!!, OcrJobStage.OCR, "lease-1", now.plusSeconds(60), now))
        assertEquals(
            1,
            ocrJobRepository.reclaimExpired(
                job.id!!,
                OcrJobStage.OCR,
                "lease-2",
                now.plusSeconds(120),
                now.plusSeconds(61)
            )
        )
        assertEquals(0, ocrJobRepository.completeClaimedStage(job.id!!, "lease-1", now.plusSeconds(62)))
        assertEquals(1, ocrJobRepository.completeClaimedStage(job.id!!, "lease-2", now.plusSeconds(62)))

        val reloaded = ocrJobRepository.findById(job.id!!).orElseThrow()
        assertEquals(OcrJobStage.EXPENSE, reloaded.stage)
        assertEquals(OcrJobStatus.PENDING, reloaded.status)
        assertEquals(2, reloaded.attemptCount)
    }

    @Test
    fun `claim is compare and set and stale lease cannot complete`() {
        val user = userRepository.findByUsername("tech1")!!
        val now = Instant.parse("2026-09-10T10:00:00Z")
        val job = ocrJobRepository.saveAndFlush(
            OcrJob(
                user = user,
                status = OcrJobStatus.PENDING,
                stage = OcrJobStage.OCR,
                filename = "lease.jpg"
            )
        )

        assertEquals(1, ocrJobRepository.claimEligible(job.id!!, OcrJobStage.OCR, "lease-1", now.plusSeconds(60), now))
        assertEquals(0, ocrJobRepository.claimEligible(job.id!!, OcrJobStage.OCR, "lease-2", now.plusSeconds(120), now))
        assertEquals(0, ocrJobRepository.completeClaimedStage(job.id!!, "stale-lease", now.plusSeconds(1)))
        assertEquals(1, ocrJobRepository.completeClaimedStage(job.id!!, "lease-1", now.plusSeconds(2)))

        val reloaded = ocrJobRepository.findById(job.id!!).orElseThrow()
        assertEquals(OcrJobStage.EXPENSE, reloaded.stage)
        assertEquals(OcrJobStatus.PENDING, reloaded.status)
        assertTrue(reloaded.leaseToken == null)
        assertEquals(1, reloaded.attemptCount)
    }
}
