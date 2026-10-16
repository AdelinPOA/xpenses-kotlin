package eu.nt.xpenses.repositories

import eu.nt.xpenses.IntegrationTestBase
import eu.nt.xpenses.model.Expense
import eu.nt.xpenses.model.OcrJob
import eu.nt.xpenses.model.Receipt
import eu.nt.xpenses.model.OcrJobStage
import eu.nt.xpenses.model.OcrJobStatus
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import java.math.BigDecimal
import java.time.Instant

class OcrJobRepositoryTest : IntegrationTestBase() {
    @Autowired
    lateinit var ocrJobRepository: OcrJobRepository

    @Autowired
    lateinit var receiptRepository: ReceiptRepository

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
        assertEquals(0, ocrJobRepository.completeOcrStage(job.id!!, "lease-1", "{}", OcrJobStage.EXPENSE, OcrJobStatus.PENDING, null, now.plusSeconds(62)))
        assertEquals(1, ocrJobRepository.completeOcrStage(job.id!!, "lease-2", "{}", OcrJobStage.EXPENSE, OcrJobStatus.PENDING, null, now.plusSeconds(62)))

        val reloaded = ocrJobRepository.findById(job.id!!).orElseThrow()
        assertEquals(OcrJobStage.EXPENSE, reloaded.stage)
        assertEquals(OcrJobStatus.PENDING, reloaded.status)
        assertEquals(0, reloaded.attemptCount)
    }

    @Test
    fun `processing job without a lease is recoverable`() {
        val user = userRepository.findByUsername("tech1")!!
        val now = Instant.parse("2026-09-10T10:00:00Z")
        val job = ocrJobRepository.saveAndFlush(
            OcrJob(
                user = user,
                status = OcrJobStatus.PROCESSING,
                stage = OcrJobStage.OCR,
                filename = "missing-lease.jpg",
                leaseToken = null,
                leaseUntil = now.plusSeconds(120)
            )
        )

        assertEquals(listOf(job.id!!), ocrJobRepository.findExpiredJobIds(now, 10))
        assertEquals(
            1,
            ocrJobRepository.reclaimExpired(
                job.id!!,
                OcrJobStage.OCR,
                "reclaimed-lease",
                now.plusSeconds(60),
                now
            )
        )

        val reclaimed = ocrJobRepository.findById(job.id!!).orElseThrow()
        assertEquals("reclaimed-lease", reclaimed.leaseToken)
        assertEquals(now.plusSeconds(60), reclaimed.leaseUntil)
    }

    @Test
    fun `OCR completion persists the result while advancing the fenced stage`() {
        val user = userRepository.findByUsername("tech1")!!
        val now = Instant.parse("2026-09-10T10:00:00Z")
        val job = ocrJobRepository.saveAndFlush(
            OcrJob(
                user = user,
                status = OcrJobStatus.PENDING,
                stage = OcrJobStage.OCR,
                filename = "result.jpg"
            )
        )

        assertEquals(1, ocrJobRepository.claimEligible(job.id!!, OcrJobStage.OCR, "lease-result", now.plusSeconds(60), now))
        assertEquals(
            1,
            ocrJobRepository.completeOcrStage(
                job.id!!,
                "lease-result",
                "{\"amount\":12.50}",
                OcrJobStage.EXPENSE,
                OcrJobStatus.PENDING,
                "OCR_PARTIAL",
                now.plusSeconds(1)
            )
        )

        val reloaded = ocrJobRepository.findById(job.id!!).orElseThrow()
        assertEquals(OcrJobStage.EXPENSE, reloaded.stage)
        assertEquals(OcrJobStatus.PENDING, reloaded.status)
        assertEquals("{\"amount\":12.50}", reloaded.resultJson)
        assertEquals("OCR_PARTIAL", reloaded.errorCode)
    }

    @Test
    fun `retention expiry is compare and set and fences later claims`() {
        val user = userRepository.findByUsername("tech1")!!
        val now = Instant.parse("2026-09-10T10:00:00Z")
        val job = ocrJobRepository.saveAndFlush(
            OcrJob(
                user = user,
                status = OcrJobStatus.PENDING,
                stage = OcrJobStage.OCR,
                filename = "expired.jpg",
                expiresAt = now.minusSeconds(1)
            )
        )

        assertEquals(listOf(job.id), ocrJobRepository.findRetentionExpiredJobIds(now, 10))
        assertEquals(1, ocrJobRepository.expireIfDue(job.id!!, now))
        assertEquals(0, ocrJobRepository.claimEligible(job.id!!, OcrJobStage.OCR, "late-lease", now.plusSeconds(60), now))

        val expired = ocrJobRepository.findById(job.id!!).orElseThrow()
        assertEquals(OcrJobStatus.EXPIRED, expired.status)
        assertEquals("OCR_JOB_EXPIRED", expired.errorCode)
        assertEquals(null, expired.leaseToken)
    }

    @Test
    fun `paused jobs resume only with source and stale source-less jobs are quarantined`() {
        val user = userRepository.findByUsername("tech1")!!
        val now = Instant.parse("2026-09-10T10:00:00Z")
        val sourceBacked = ocrJobRepository.saveAndFlush(
            OcrJob(
                user = user,
                status = OcrJobStatus.PAUSED,
                filename = "source.jpg",
                sourcePath = "ocr-sources/source.jpg",
                expiresAt = now.plusSeconds(60)
            )
        )
        val sourceLess = ocrJobRepository.saveAndFlush(
            OcrJob(
                user = user,
                status = OcrJobStatus.PAUSED,
                filename = "lost.jpg",
                createdAt = now.minusSeconds(600),
                updatedAt = now.minusSeconds(600)
            )
        )

        assertEquals(1, ocrJobRepository.resumePausedWithSource(now))
        assertEquals(
            listOf(sourceLess.id),
            ocrJobRepository.findStalePausedJobIds(now.minusSeconds(300), 10)
        )
        assertEquals(1, ocrJobRepository.markPausedUnrecoverable(sourceLess.id!!, now.minusSeconds(300), now))

        assertEquals(OcrJobStatus.PENDING, ocrJobRepository.findById(sourceBacked.id!!).orElseThrow().status)
        val quarantined = ocrJobRepository.findById(sourceLess.id!!).orElseThrow()
        assertEquals(OcrJobStatus.UNRECOVERABLE, quarantined.status)
        assertEquals("OCR_SOURCE_STORE_INCOMPLETE", quarantined.errorCode)
    }

    @Test
    fun `source publication is compare and set against PAUSED state`() {
        val user = userRepository.findByUsername("tech1")!!
        val now = Instant.parse("2026-09-10T10:00:00Z")
        val job = ocrJobRepository.saveAndFlush(
            OcrJob(user = user, status = OcrJobStatus.PAUSED, filename = "capture.jpg")
        )

        assertEquals(
            1,
            ocrJobRepository.persistSourceCapture(
                job.id!!,
                "ocr-sources/${job.id}_capture.jpg",
                "image/jpeg",
                128,
                "a".repeat(64),
                now
            )
        )
        assertEquals(
            0,
            ocrJobRepository.persistSourceCapture(
                job.id!!,
                "ocr-sources/${job.id}_capture.jpg",
                "image/jpeg",
                128,
                "a".repeat(64),
                now.plusSeconds(1)
            )
        )

        val published = ocrJobRepository.findById(job.id!!).orElseThrow()
        assertEquals(OcrJobStatus.PENDING, published.status)
        assertEquals("ocr-sources/${job.id}_capture.jpg", published.sourcePath)
        assertEquals(128L, published.sourceSizeBytes)
    }

    @Test
    fun `successful OCR completion clears transient failure metadata`() {
        val user = userRepository.findByUsername("tech1")!!
        val now = Instant.parse("2026-09-10T10:00:00Z")
        val job = ocrJobRepository.saveAndFlush(
            OcrJob(
                user = user,
                status = OcrJobStatus.PENDING,
                stage = OcrJobStage.OCR,
                filename = "retry-success.jpg",
                errorCode = "OCR_PROCESSING_RETRY",
                errorMessage = "previous attempt failed"
            )
        )

        assertEquals(1, ocrJobRepository.claimEligible(job.id!!, OcrJobStage.OCR, "lease-success", now.plusSeconds(60), now))
        assertEquals(
            1,
            ocrJobRepository.completeOcrStage(
                job.id!!,
                "lease-success",
                "{\"amount\":12.50}",
                OcrJobStage.EXPENSE,
                OcrJobStatus.PENDING,
                null,
                now.plusSeconds(1)
            )
        )

        val reloaded = ocrJobRepository.findById(job.id!!).orElseThrow()
        assertEquals(null, reloaded.errorCode)
        assertEquals(null, reloaded.errorMessage)
    }

    @Test
    fun `stage completion persists the state machine target through all stages`() {
        val user = userRepository.findByUsername("tech1")!!
        val expense = expenseRepository.saveAndFlush(
            Expense(
                user = user,
                amountOriginal = BigDecimal("12.50"),
                amountEur = BigDecimal("12.50"),
                date = "2026-09-10"
            )
        )
        val receipt = receiptRepository.saveAndFlush(
            Receipt(expense = expense, filePath = "receipts/transition.jpg", originalName = "transition.jpg")
        )
        val now = Instant.parse("2026-09-10T10:00:00Z")
        val job = ocrJobRepository.saveAndFlush(
            OcrJob(user = user, status = OcrJobStatus.PENDING, stage = OcrJobStage.OCR, filename = "transition.jpg")
        )

        assertEquals(1, ocrJobRepository.claimEligible(job.id!!, OcrJobStage.OCR, "lease-ocr", now.plusSeconds(60), now))
        assertEquals(
            1,
            ocrJobRepository.completeOcrStage(
                job.id!!,
                "lease-ocr",
                "{\"amount\":12.50}",
                OcrJobStage.EXPENSE,
                OcrJobStatus.PENDING,
                null,
                now.plusSeconds(1)
            )
        )
        assertEquals(1, ocrJobRepository.claimEligible(job.id!!, OcrJobStage.EXPENSE, "lease-expense", now.plusSeconds(120), now.plusSeconds(2)))
        assertEquals(
            1,
            ocrJobRepository.completeExpenseStage(
                job.id!!,
                "lease-expense",
                expense.id!!,
                OcrJobStage.RECEIPT,
                OcrJobStatus.PENDING,
                null,
                now.plusSeconds(3)
            )
        )
        assertEquals(1, ocrJobRepository.claimEligible(job.id!!, OcrJobStage.RECEIPT, "lease-receipt", now.plusSeconds(180), now.plusSeconds(4)))
        assertEquals(
            1,
            ocrJobRepository.setReceiptStagingPath(
                job.id!!,
                "lease-receipt",
                "2026/09/77_staging.jpg",
                now.plusSeconds(4)
            )
        )
        assertEquals(
            1,
            ocrJobRepository.completeReceiptStage(
                job.id!!,
                "lease-receipt",
                receipt.id!!,
                OcrJobStatus.COMPLETED,
                now.plusSeconds(5)
            )
        )

        val completed = ocrJobRepository.findById(job.id!!).orElseThrow()
        assertEquals(OcrJobStage.RECEIPT, completed.stage)
        assertEquals(OcrJobStatus.COMPLETED, completed.status)
        assertEquals(expense.id, completed.expenseId)
        assertEquals(receipt.id, completed.receiptId)
        assertEquals(null, completed.receiptStagingPath)
    }

    @Test
    fun `claimable finder returns pending jobs in bounded order`() {
        val user = userRepository.findByUsername("tech1")!!
        val now = Instant.parse("2026-09-10T10:00:00Z")
        ocrJobRepository.saveAllAndFlush(listOf(
            OcrJob(user = user, status = OcrJobStatus.PENDING, filename = "one.jpg"),
            OcrJob(user = user, status = OcrJobStatus.PENDING, filename = "two.jpg")
        ))

        val ids = ocrJobRepository.findClaimableJobIds(now, 1)

        assertEquals(1, ids.size)
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
        assertEquals(0, ocrJobRepository.completeOcrStage(job.id!!, "stale-lease", "{}", OcrJobStage.EXPENSE, OcrJobStatus.PENDING, null, now.plusSeconds(1)))
        assertEquals(1, ocrJobRepository.completeOcrStage(job.id!!, "lease-1", "{}", OcrJobStage.EXPENSE, OcrJobStatus.PENDING, null, now.plusSeconds(2)))

        val reloaded = ocrJobRepository.findById(job.id!!).orElseThrow()
        assertEquals(OcrJobStage.EXPENSE, reloaded.stage)
        assertEquals(OcrJobStatus.PENDING, reloaded.status)
        assertTrue(reloaded.leaseToken == null)
        assertEquals(0, reloaded.attemptCount)
    }
}
