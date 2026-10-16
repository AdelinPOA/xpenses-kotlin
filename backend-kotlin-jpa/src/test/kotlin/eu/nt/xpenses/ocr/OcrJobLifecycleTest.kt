package eu.nt.xpenses.ocr

import com.fasterxml.jackson.databind.ObjectMapper
import eu.nt.xpenses.model.Expense
import eu.nt.xpenses.model.OcrJob
import eu.nt.xpenses.model.OcrJobStage
import eu.nt.xpenses.model.OcrJobStatus
import eu.nt.xpenses.model.Receipt
import eu.nt.xpenses.model.User
import eu.nt.xpenses.models.RawUpload
import eu.nt.xpenses.repositories.CategoryRepository
import eu.nt.xpenses.repositories.ExpenseRepository
import eu.nt.xpenses.repositories.OcrComparisonRepository
import eu.nt.xpenses.repositories.OcrJobRepository
import eu.nt.xpenses.repositories.ReceiptRepository
import eu.nt.xpenses.services.FxService
import eu.nt.xpenses.services.OcrJobLifecycle
import eu.nt.xpenses.services.OcrJobPipeline
import eu.nt.xpenses.services.OcrService
import eu.nt.xpenses.services.StorageContext
import eu.nt.xpenses.services.StorageService
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.ArgumentCaptor
import org.mockito.ArgumentMatchers.*
import org.mockito.Mockito.*
import org.springframework.transaction.TransactionStatus
import org.springframework.transaction.support.TransactionCallback
import org.springframework.transaction.support.TransactionSynchronizationManager
import org.springframework.transaction.support.TransactionTemplate
import java.math.BigDecimal
import java.time.Instant
import java.util.Optional
import java.util.concurrent.Executor

class OcrJobLifecycleTest {
    private val ocrService = mock(OcrService::class.java)
    private val ocrJobRepository = mock(OcrJobRepository::class.java)
    private val storageService = mock(StorageService::class.java)
    private val ocrComparisonRepository = mock(OcrComparisonRepository::class.java)
    private val expenseRepository = mock(ExpenseRepository::class.java)
    private val receiptRepository = mock(ReceiptRepository::class.java)
    private val categoryRepository = mock(CategoryRepository::class.java)
    private val fxService = mock(FxService::class.java)
    private val transactionTemplate = mock(TransactionTemplate::class.java)
    private val ocrTaskExecutor = mock(Executor::class.java)

    private lateinit var pipeline: OcrJobPipeline
    private lateinit var techUser: User
    private lateinit var otherUser: User
    private lateinit var job: OcrJob
    private lateinit var persistedExpense: Expense

    @BeforeEach
    fun setup() {
        techUser = User(id = 1, username = "tech", displayName = "Tech", role = "technician")
        otherUser = User(id = 2, username = "other", displayName = "Other", role = "technician")
        job = OcrJob(
            id = 1,
            user = techUser,
            status = OcrJobStatus.PENDING,
            stage = OcrJobStage.OCR,
            filename = "receipt.jpg",
            sourcePath = "ocr-sources/1_receipt.jpg",
            sourceContentType = "image/jpeg"
        )
        persistedExpense = Expense(
            id = 77,
            user = techUser,
            amountOriginal = BigDecimal("10.50"),
            amountEur = BigDecimal("10.50"),
            date = "2026-09-10"
        )

        pipeline = OcrJobLifecycle(
            ocrService,
            ocrJobRepository,
            ocrComparisonRepository,
            storageService,
            ObjectMapper(),
            expenseRepository,
            receiptRepository,
            categoryRepository,
            fxService,
            transactionTemplate,
            ocrTaskExecutor
        )

        doReturn(Optional.of(job)).`when`(ocrJobRepository).findById(1)
        doReturn(Optional.of(persistedExpense)).`when`(expenseRepository).findById(77)
        doReturn("fake data".toByteArray()).`when`(storageService).downloadFile(anyString())
        doReturn("receipts/77_receipt.jpg").`when`(storageService).storeFileAtPath(
            eqNonNull(StorageContext.RECEIPT),
            anyObject(RawUpload(ByteArray(0), "receipt.jpg", "image/jpeg")),
            anyString()
        )
        doAnswer {
            job.receiptStagingPath = it.getArgument(2)
            1
        }.`when`(ocrJobRepository).setReceiptStagingPath(
            anyInt(), anyString(), anyString(), anyObject(Instant.EPOCH)
        )
        doAnswer {
            job.receiptStagingPath = null
            1
        }.`when`(ocrJobRepository).clearReceiptStagingPath(
            anyInt(), anyString(), anyObject(Instant.EPOCH)
        )
        doReturn(persistedExpense).`when`(expenseRepository).saveAndFlush(any(Expense::class.java))
        doAnswer {
            val receipt = it.arguments[0] as Receipt
            receipt.id = 88
            receipt
        }.`when`(receiptRepository).saveAndFlush(any(Receipt::class.java))
        doReturn(Optional.empty<eu.nt.xpenses.model.Category>()).`when`(categoryRepository).findById(anyInt())
        doReturn(Optional.empty<eu.nt.xpenses.model.OcrComparison>()).`when`(ocrComparisonRepository).findById(anyInt())

        installStatefulClaims()
        installStatefulCompletions()
        installStatefulFailures()
        installTransactionCallback()
    }

    @AfterEach
    fun clearTransactionSynchronization() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization()
        }
    }

    @Test
    fun `processOcr advances the durable job through every OCR stage`() {
        val fakeData = "fake data".toByteArray()
        `when`(storageService.downloadFile("ocr-sources/1_receipt.jpg")).thenReturn(fakeData)
        `when`(ocrService.scanReceipt(fakeData, "receipt.jpg")).thenReturn(
            mapOf("amount" to 10.5, "currency" to "EUR", "date" to "2026-09-10")
        )
        TransactionSynchronizationManager.initSynchronization()

        pipeline.processOcr(1)

        verify(ocrJobRepository, times(3)).claimEligible(
            eq(1), anyString(), anyString(), anyObject(Instant.EPOCH), anyObject(Instant.EPOCH)
        )
        verify(ocrJobRepository).completeOcrStage(
            eq(1), anyString(), anyString(), eqNonNull(OcrJobStage.EXPENSE), eqNonNull(OcrJobStatus.PENDING),
            isNull(), anyObject(Instant.EPOCH)
        )
        verify(ocrJobRepository).completeExpenseStage(
            eq(1), anyString(), eq(77), eqNonNull(OcrJobStage.RECEIPT), eqNonNull(OcrJobStatus.PENDING),
            isNull(), anyObject(Instant.EPOCH)
        )
        verify(ocrJobRepository).completeReceiptStage(
            eq(1), anyString(), eq(88), eqNonNull(OcrJobStatus.COMPLETED), anyObject(Instant.EPOCH)
        )
        verify(expenseRepository).saveAndFlush(any(Expense::class.java))
        verify(receiptRepository).saveAndFlush(any(Receipt::class.java))
        assertEquals(OcrJobStatus.COMPLETED, job.status)
        assertEquals(OcrJobStage.RECEIPT, job.stage)

        TransactionSynchronizationManager.getSynchronizations().forEach { it.afterCommit() }
        verify(storageService).deleteFile("ocr-sources/1_receipt.jpg")
    }

    @Test
    fun `storage exception is recorded as retryable while attempts remain`() {
        `when`(storageService.downloadFile("ocr-sources/1_receipt.jpg"))
            .thenThrow(RuntimeException("Storage unavailable"))
        job.attemptCount = 1

        pipeline.processOcr(1)

        verify(ocrJobRepository).recordTransientFailure(
            eq(1), anyString(), anyObject(Instant.EPOCH), eqNonNull("OCR_PROCESSING_RETRY"),
            eqNonNull("Storage unavailable"), anyObject(Instant.EPOCH)
        )
        verify(ocrJobRepository, never()).completeOcrStage(
            anyInt(), anyString(), anyString(), anyString(), anyString(), nullable(String::class.java),
            anyObject(Instant.EPOCH)
        )
    }

    @Test
    fun `successful retry clears transient error metadata`() {
        val fakeData = "fake data".toByteArray()
        `when`(storageService.downloadFile("ocr-sources/1_receipt.jpg"))
            .thenThrow(RuntimeException("Storage unavailable"))
            .thenReturn(fakeData)
        `when`(ocrService.scanReceipt(fakeData, "receipt.jpg")).thenReturn(
            mapOf("amount" to 10.5, "currency" to "EUR", "date" to "2026-09-10")
        )
        job.attemptCount = 1

        pipeline.processOcr(1)
        assertEquals(OcrJobStatus.RETRY_WAIT, job.status)
        job.nextAttemptAt = Instant.EPOCH
        TransactionSynchronizationManager.initSynchronization()

        pipeline.processOcr(1)

        assertEquals(OcrJobStatus.COMPLETED, job.status)
        assertEquals(null, job.errorCode)
        TransactionSynchronizationManager.getSynchronizations().forEach { it.afterCommit() }
    }

    @Test
    fun `unexpected OCR service exception is retried instead of creating a false draft`() {
        val fakeData = "fake data".toByteArray()
        `when`(storageService.downloadFile("ocr-sources/1_receipt.jpg")).thenReturn(fakeData)
        `when`(ocrService.scanReceipt(fakeData, "receipt.jpg"))
            .thenThrow(RuntimeException("OCR service unavailable"))
        job.attemptCount = 1

        pipeline.processOcr(1)

        verify(ocrJobRepository).recordTransientFailure(
            eq(1), anyString(), anyObject(Instant.EPOCH), eqNonNull("OCR_PROCESSING_RETRY"),
            eqNonNull("OCR service unavailable"), anyObject(Instant.EPOCH)
        )
        verify(ocrJobRepository, never()).completeOcrStage(
            anyInt(), anyString(), anyString(), anyString(), anyString(), nullable(String::class.java),
            anyObject(Instant.EPOCH)
        )
        verify(receiptRepository, never()).saveAndFlush(any(Receipt::class.java))
    }

    @Test
    fun `low confidence OCR becomes a photo-only draft with the source Receipt attached`() {
        val fakeData = "fake data".toByteArray()
        `when`(storageService.downloadFile("ocr-sources/1_receipt.jpg")).thenReturn(fakeData)
        `when`(ocrService.scanReceipt(fakeData, "receipt.jpg")).thenReturn(
            mapOf(
                "amount" to 42.0,
                "currency" to "EUR",
                "date" to "2026-09-10",
                "merchant" to "Uncertain merchant",
                "confidence" to 0.2,
                "raw_text" to "uncertain text",
                "warnings" to listOf("Low confidence")
            )
        )
        TransactionSynchronizationManager.initSynchronization()

        pipeline.processOcr(1)

        val savedExpense = ArgumentCaptor.forClass(Expense::class.java)
        verify(expenseRepository).saveAndFlush(savedExpense.capture())
        assertEquals(BigDecimal.ZERO, savedExpense.value.amountOriginal)
        assertEquals(BigDecimal("0.00"), savedExpense.value.amountEur)
        assertEquals("EUR", savedExpense.value.currencyOriginal)
        assertEquals(null, savedExpense.value.merchant)
        assertEquals("uncertain text", savedExpense.value.rawOcrText)
        assertEquals("OCR_LOW_CONFIDENCE", job.errorCode)
        verify(receiptRepository).saveAndFlush(any(Receipt::class.java))
    }

    @Test
    fun `provider error result becomes a photo-only draft`() {
        val fakeData = "fake data".toByteArray()
        `when`(storageService.downloadFile("ocr-sources/1_receipt.jpg")).thenReturn(fakeData)
        `when`(ocrService.scanReceipt(fakeData, "receipt.jpg")).thenReturn(
            mapOf(
                "amount" to null,
                "confidence" to 0.0,
                "provider_error" to "Gemini failed",
                "warnings" to listOf("Gemini failed")
            )
        )
        TransactionSynchronizationManager.initSynchronization()

        pipeline.processOcr(1)

        verify(ocrJobRepository).completeOcrStage(
            eq(1), anyString(), anyString(), eqNonNull(OcrJobStage.EXPENSE), eqNonNull(OcrJobStatus.PENDING),
            eqNonNull("OCR_PROVIDER_FAILED"), anyObject(Instant.EPOCH)
        )
        verify(receiptRepository).saveAndFlush(any(Receipt::class.java))
    }

    @Test
    fun `missing currency becomes photo-only instead of assuming EUR`() {
        val fakeData = "fake data".toByteArray()
        `when`(storageService.downloadFile("ocr-sources/1_receipt.jpg")).thenReturn(fakeData)
        `when`(ocrService.scanReceipt(fakeData, "receipt.jpg")).thenReturn(
            mapOf("amount" to 10.5, "confidence" to 0.9, "warnings" to emptyList<String>())
        )
        TransactionSynchronizationManager.initSynchronization()

        pipeline.processOcr(1)

        verify(ocrJobRepository).completeOcrStage(
            eq(1), anyString(), anyString(), eqNonNull(OcrJobStage.EXPENSE), eqNonNull(OcrJobStatus.PENDING),
            eqNonNull("OCR_PHOTO_ONLY"), anyObject(Instant.EPOCH)
        )
    }

    @Test
    fun `missing OCR source is permanently failed without invoking the provider`() {
        job.sourcePath = null

        pipeline.processOcr(1)

        verify(ocrJobRepository).recordPermanentFailure(
            eq(1), anyString(), eqNonNull("OCR_SOURCE_MISSING"), eqNonNull("OCR source is not durably stored"),
            anyObject(Instant.EPOCH)
        )
        verifyNoInteractions(ocrService)
    }

    @Test
    fun `non-due retry and terminal jobs are not dispatched`() {
        job.status = OcrJobStatus.RETRY_WAIT
        job.nextAttemptAt = Instant.now().plusSeconds(60)
        pipeline.processOcr(1)

        job.status = OcrJobStatus.COMPLETED
        pipeline.processOcr(1)

        verify(ocrJobRepository, never()).claimEligible(
            anyInt(), anyString(), anyString(), anyObject(Instant.EPOCH), anyObject(Instant.EPOCH)
        )
        verify(ocrJobRepository, never()).reclaimExpired(
            anyInt(), anyString(), anyString(), anyObject(Instant.EPOCH), anyObject(Instant.EPOCH)
        )
        verifyNoInteractions(ocrService)
        verifyNoInteractions(storageService)
    }

    @Test
    fun `receipt file is deleted when receipt completion loses its lease`() {
        job.stage = OcrJobStage.RECEIPT
        job.expenseId = 77
        doReturn(0).`when`(ocrJobRepository).completeReceiptStage(
            anyInt(), anyString(), anyInt(), anyString(), anyObject(Instant.EPOCH)
        )

        pipeline.processOcr(1)

        verify(storageService).deleteFile("receipts/77_receipt.jpg")
    }

    @Test
    fun `terminal receipt-stage failure preserves the draft Expense and cleans source`() {
        job.stage = OcrJobStage.RECEIPT
        job.expenseId = 77
        job.attemptCount = 2
        `when`(storageService.downloadFile("ocr-sources/1_receipt.jpg"))
            .thenThrow(RuntimeException("Storage unavailable"))
        TransactionSynchronizationManager.initSynchronization()

        pipeline.processOcr(1)

        verify(ocrJobRepository).recordPermanentFailure(
            eq(1), anyString(), eqNonNull("OCR_PROCESSING_FAILED"), eqNonNull("Storage unavailable"),
            anyObject(Instant.EPOCH)
        )
        verify(expenseRepository, never()).delete(any(Expense::class.java))
        TransactionSynchronizationManager.getSynchronizations().forEach { it.afterCommit() }
        verify(storageService).deleteFile("ocr-sources/1_receipt.jpg")
    }

    @Test
    fun `expired processing lease is reclaimed before retrying the current stage`() {
        job.status = OcrJobStatus.PROCESSING
        job.leaseToken = "stale-lease"
        job.leaseUntil = Instant.now().minusSeconds(1)
        job.attemptCount = 1
        `when`(storageService.downloadFile("ocr-sources/1_receipt.jpg"))
            .thenThrow(RuntimeException("Storage unavailable"))

        pipeline.processOcr(1)

        verify(ocrJobRepository).reclaimExpired(
            eq(1), eqNonNull(OcrJobStage.OCR), anyString(), anyObject(Instant.EPOCH), anyObject(Instant.EPOCH)
        )
        verify(ocrJobRepository).recordTransientFailure(
            eq(1), anyString(), anyObject(Instant.EPOCH), eqNonNull("OCR_PROCESSING_RETRY"),
            eqNonNull("Storage unavailable"), anyObject(Instant.EPOCH)
        )
    }

    @Test
    fun `processing job without a lease is reclaimed instead of remaining stuck`() {
        job.status = OcrJobStatus.PROCESSING
        job.leaseToken = null
        job.leaseUntil = null
        `when`(storageService.downloadFile("ocr-sources/1_receipt.jpg"))
            .thenThrow(RuntimeException("Storage unavailable"))

        pipeline.processOcr(1)

        verify(ocrJobRepository).reclaimExpired(
            eq(1), eqNonNull(OcrJobStage.OCR), anyString(), anyObject(Instant.EPOCH), anyObject(Instant.EPOCH)
        )
        verify(ocrJobRepository).recordTransientFailure(
            eq(1), anyString(), anyObject(Instant.EPOCH), eqNonNull("OCR_PROCESSING_RETRY"),
            eqNonNull("Storage unavailable"), anyObject(Instant.EPOCH)
        )
    }

    @Test
    fun `reclaim cleans the previous receipt staging path before retrying`() {
        job.status = OcrJobStatus.PROCESSING
        job.stage = OcrJobStage.RECEIPT
        job.leaseToken = "stale-lease"
        job.leaseUntil = Instant.now().minusSeconds(1)
        job.receiptStagingPath = "2026/09/77_stale-receipt.jpg"
        job.expenseId = null

        pipeline.processOcr(1)

        verify(ocrJobRepository).reclaimExpired(
            eq(1), eqNonNull(OcrJobStage.RECEIPT), anyString(), anyObject(Instant.EPOCH), anyObject(Instant.EPOCH)
        )
        verify(ocrJobRepository).clearReceiptStagingPath(
            eq(1), anyString(), anyObject(Instant.EPOCH)
        )
        verify(storageService).deleteFile("2026/09/77_stale-receipt.jpg")
    }

    @Test
    fun `cancel rejects a job owned by another Technician`() {
        assertFalse(pipeline.cancel(1, otherUser))

        verify(ocrJobRepository, never()).cancelClaimed(anyInt(), anyInt(), anyObject(Instant.EPOCH))
    }

    @Test
    fun `cancel rejects a retention-expired job`() {
        job.expiresAt = Instant.now().minusSeconds(1)

        assertFalse(pipeline.cancel(1, techUser))

        verify(ocrJobRepository, never()).cancelClaimed(anyInt(), anyInt(), anyObject(Instant.EPOCH))
    }

    @Test
    fun `cancelled processing job deletes its OCR source and draft Receipt after commit`() {
        job.status = OcrJobStatus.PROCESSING
        job.leaseToken = "active-lease"
        job.leaseUntil = Instant.now().plusSeconds(60)
        job.expenseId = 77
        val receipt = Receipt(
            id = 88,
            expense = persistedExpense,
            filePath = "receipts/77_receipt.jpg",
            originalName = "receipt.jpg"
        )
        persistedExpense.receipts += receipt
        doAnswer {
            job.status = OcrJobStatus.CANCELLED
            job.leaseToken = null
            job.leaseUntil = null
            1
        }.`when`(ocrJobRepository).cancelClaimed(eq(1), eq(1), anyObject(Instant.EPOCH))
        TransactionSynchronizationManager.initSynchronization()

        assertTrue(pipeline.cancel(1, techUser))

        TransactionSynchronizationManager.getSynchronizations().forEach { it.afterCommit() }
        verify(receiptRepository).deleteAll(listOf(receipt))
        verify(expenseRepository).delete(persistedExpense)
        verify(storageService).deleteFile("ocr-sources/1_receipt.jpg")
        verify(storageService).deleteFile("receipts/77_receipt.jpg")
    }

    @Test
    fun `receipt stage with missing source is marked permanently failed`() {
        job.stage = OcrJobStage.RECEIPT
        job.expenseId = 77
        job.sourcePath = null

        pipeline.processOcr(1)

        verify(ocrJobRepository).recordPermanentFailure(
            eq(1), anyString(), eqNonNull("OCR_SOURCE_MISSING"), anyString(), anyObject(Instant.EPOCH)
        )
        verifyNoInteractions(storageService)
    }

    @Test
    fun `receipt stage with missing expense is marked permanently failed`() {
        job.stage = OcrJobStage.RECEIPT
        job.expenseId = null

        pipeline.processOcr(1)

        verify(ocrJobRepository).recordPermanentFailure(
            eq(1), anyString(), eqNonNull("OCR_EXPENSE_MISSING"), anyString(), anyObject(Instant.EPOCH)
        )
        verify(storageService).deleteFile("ocr-sources/1_receipt.jpg")
    }

    @Test
    fun `expired job is terminalized and its draft artifacts are cleaned after commit`() {
        job.expiresAt = Instant.now().minusSeconds(1)
        job.expenseId = 77
        val receipt = Receipt(
            id = 88,
            expense = persistedExpense,
            filePath = "receipts/77_receipt.jpg",
            originalName = "receipt.jpg"
        )
        persistedExpense.receipts += receipt
        doAnswer {
            job.status = OcrJobStatus.EXPIRED
            job.leaseToken = null
            job.leaseUntil = null
            1
        }.`when`(ocrJobRepository).expireIfDue(eq(1), anyObject(Instant.EPOCH))
        TransactionSynchronizationManager.initSynchronization()

        pipeline.processOcr(1)

        verify(ocrJobRepository).expireIfDue(eq(1), anyObject(Instant.EPOCH))
        verify(ocrJobRepository, never()).claimEligible(
            anyInt(), anyString(), anyString(), anyObject(Instant.EPOCH), anyObject(Instant.EPOCH)
        )
        verify(receiptRepository).deleteAll(listOf(receipt))
        verify(expenseRepository).delete(persistedExpense)
        TransactionSynchronizationManager.getSynchronizations().forEach { it.afterCommit() }
        verify(storageService).deleteFile("ocr-sources/1_receipt.jpg")
        verify(storageService).deleteFile("receipts/77_receipt.jpg")
    }

    @Test
    fun `recovery resumes paused jobs once their source metadata is durable`() {
        job.status = OcrJobStatus.PAUSED
        doReturn(1).`when`(ocrJobRepository).resumePausedWithSource(anyObject(Instant.EPOCH))
        doReturn(listOf(1)).`when`(ocrJobRepository).findClaimableJobIds(anyObject(Instant.EPOCH), eq(3))

        val recovered = pipeline.recover(3)

        assertEquals(1, recovered)
        verify(ocrJobRepository).resumePausedWithSource(anyObject(Instant.EPOCH))
        verify(ocrTaskExecutor).execute(any(Runnable::class.java))
    }

    @Test
    fun `expired paused jobs are expired before quarantine and clean probable source`() {
        job.status = OcrJobStatus.PAUSED
        job.sourcePath = null
        job.expiresAt = Instant.now().minusSeconds(1)
        doReturn(listOf(1)).`when`(ocrJobRepository).findRetentionExpiredJobIds(anyObject(Instant.EPOCH), eq(3))
        doAnswer {
            job.status = OcrJobStatus.EXPIRED
            1
        }.`when`(ocrJobRepository).expireIfDue(eq(1), anyObject(Instant.EPOCH))
        TransactionSynchronizationManager.initSynchronization()

        pipeline.recover(3)

        verify(ocrJobRepository).expireIfDue(eq(1), anyObject(Instant.EPOCH))
        verify(ocrJobRepository, never()).markPausedUnrecoverable(
            anyInt(), anyObject(Instant.EPOCH), anyObject(Instant.EPOCH)
        )
        TransactionSynchronizationManager.getSynchronizations().forEach { it.afterCommit() }
        verify(storageService).deleteFile("ocr-sources/1_receipt.jpg")
    }

    @Test
    fun `stale paused jobs without a source become unrecoverable and clean orphan storage`() {
        job.status = OcrJobStatus.PAUSED
        job.sourcePath = null
        job.createdAt = Instant.now().minusSeconds(3600)
        job.updatedAt = Instant.now().minusSeconds(3600)
        doReturn(listOf(1)).`when`(ocrJobRepository).findStalePausedJobIds(anyObject(Instant.EPOCH), eq(3))
        doAnswer {
            job.status = OcrJobStatus.UNRECOVERABLE
            1
        }.`when`(ocrJobRepository).markPausedUnrecoverable(eq(1), anyObject(Instant.EPOCH), anyObject(Instant.EPOCH))
        TransactionSynchronizationManager.initSynchronization()

        val recovered = pipeline.recover(3)

        assertEquals(0, recovered)
        verify(ocrJobRepository).markPausedUnrecoverable(
            eq(1), anyObject(Instant.EPOCH), anyObject(Instant.EPOCH)
        )
        TransactionSynchronizationManager.getSynchronizations().forEach { it.afterCommit() }
        verify(storageService).deleteFile("ocr-sources/1_receipt.jpg")
    }

    @Test
    fun `recover counts only executor submissions accepted by the queue`() {
        doReturn(listOf(1, 2)).`when`(ocrJobRepository).findClaimableJobIds(anyObject(Instant.EPOCH), eq(3))
        doAnswer {
            if (it.getArgument<Runnable>(0) != null) {
                throw java.util.concurrent.RejectedExecutionException("full")
            }
            Unit
        }.`when`(ocrTaskExecutor).execute(any(Runnable::class.java))

        assertEquals(0, pipeline.recover(3))
    }

    private fun <T : Any> anyObject(example: T): T {
        any(example::class.java)
        return example
    }

    private fun <T : Any> eqNonNull(value: T): T {
        eq(value)
        return value
    }

    private fun installStatefulClaims() {
        doAnswer {
            val leaseToken = it.getArgument<String>(2)
            job.status = OcrJobStatus.PROCESSING
            job.leaseToken = leaseToken
            job.leaseUntil = it.getArgument(3)
            job.attemptCount += 1
            job.nextAttemptAt = null
            1
        }.`when`(ocrJobRepository).claimEligible(
            anyInt(), anyString(), anyString(), anyObject(Instant.EPOCH), anyObject(Instant.EPOCH)
        )
        doAnswer {
            val leaseToken = it.getArgument<String>(2)
            job.status = OcrJobStatus.PROCESSING
            job.leaseToken = leaseToken
            job.leaseUntil = it.getArgument(3)
            job.attemptCount += 1
            job.nextAttemptAt = null
            1
        }.`when`(ocrJobRepository).reclaimExpired(
            anyInt(), anyString(), anyString(), anyObject(Instant.EPOCH), anyObject(Instant.EPOCH)
        )
    }

    private fun installStatefulCompletions() {
        doAnswer {
            job.resultJson = it.getArgument(2)
            job.stage = it.getArgument(3)
            job.status = it.getArgument(4)
            job.attemptCount = 0
            job.errorCode = it.getArgument(5)
            job.leaseToken = null
            job.leaseUntil = null
            1
        }.`when`(ocrJobRepository).completeOcrStage(
            anyInt(), anyString(), anyString(), anyString(), anyString(), nullable(String::class.java),
            anyObject(Instant.EPOCH)
        )
        doAnswer {
            job.expenseId = it.getArgument(2)
            job.stage = it.getArgument(3)
            job.status = it.getArgument(4)
            job.attemptCount = 0
            job.errorCode = it.getArgument(5)
            job.leaseToken = null
            job.leaseUntil = null
            1
        }.`when`(ocrJobRepository).completeExpenseStage(
            anyInt(), anyString(), anyInt(), anyString(), anyString(), nullable(String::class.java),
            anyObject(Instant.EPOCH)
        )
        doAnswer {
            job.receiptId = it.getArgument(2)
            job.status = it.getArgument(3)
            job.receiptStagingPath = null
            if (job.errorCode == "OCR_PROCESSING_RETRY") job.errorCode = null
            job.leaseToken = null
            job.leaseUntil = null
            1
        }.`when`(ocrJobRepository).completeReceiptStage(
            anyInt(), anyString(), anyInt(), anyString(), anyObject(Instant.EPOCH)
        )
    }

    private fun installStatefulFailures() {
        doAnswer {
            job.status = OcrJobStatus.RETRY_WAIT
            job.nextAttemptAt = it.getArgument(2)
            if (job.errorCode == null || job.errorCode == "OCR_PROCESSING_RETRY") {
                job.errorCode = it.getArgument(3)
                job.errorMessage = it.getArgument(4)
            }
            job.leaseToken = null
            job.leaseUntil = null
            1
        }.`when`(ocrJobRepository).recordTransientFailure(
            anyInt(), anyString(), anyObject(Instant.EPOCH), anyString(), nullable(String::class.java),
            anyObject(Instant.EPOCH)
        )
        doAnswer {
            job.status = OcrJobStatus.PERMANENT_FAILURE
            job.errorCode = it.getArgument(2)
            job.errorMessage = it.getArgument(3)
            job.leaseToken = null
            job.leaseUntil = null
            1
        }.`when`(ocrJobRepository).recordPermanentFailure(
            anyInt(), anyString(), anyString(), nullable(String::class.java), anyObject(Instant.EPOCH)
        )
    }

    private fun installTransactionCallback() {
        doAnswer {
            @Suppress("UNCHECKED_CAST")
            val callback = it.arguments[0] as TransactionCallback<Any?>
            callback.doInTransaction(mock(TransactionStatus::class.java))
        }.`when`(transactionTemplate).execute(any(TransactionCallback::class.java))
    }
}
