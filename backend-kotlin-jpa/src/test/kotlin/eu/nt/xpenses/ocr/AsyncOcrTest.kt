package eu.nt.xpenses.ocr

import tools.jackson.databind.ObjectMapper
import eu.nt.xpenses.model.Expense
import eu.nt.xpenses.model.ExpenseVerificationState
import eu.nt.xpenses.model.ExpenseReport
import eu.nt.xpenses.model.OcrJob
import eu.nt.xpenses.model.OcrJobStage
import eu.nt.xpenses.model.OcrJobStatus
import eu.nt.xpenses.model.Receipt
import eu.nt.xpenses.model.User
import eu.nt.xpenses.repositories.CategoryRepository
import eu.nt.xpenses.repositories.ExpenseRepository
import eu.nt.xpenses.repositories.ExpenseReportRepository
import eu.nt.xpenses.repositories.OcrComparisonRepository
import eu.nt.xpenses.repositories.OcrJobRepository
import eu.nt.xpenses.repositories.ReceiptRepository
import eu.nt.xpenses.services.AsyncOcrService
import eu.nt.xpenses.services.FxService
import eu.nt.xpenses.services.OcrService
import eu.nt.xpenses.models.RawUpload
import eu.nt.xpenses.services.StorageContext
import eu.nt.xpenses.services.StorageService
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.Answers.RETURNS_DEFAULTS
import org.mockito.Mockito.*
import org.springframework.transaction.TransactionStatus
import org.springframework.transaction.support.TransactionCallback
import org.springframework.transaction.support.TransactionTemplate
import java.math.BigDecimal
import java.time.Instant
import java.util.Optional
import java.util.concurrent.Executor

class AsyncOcrTest {
    private val ocrService = mock(OcrService::class.java)
    private val ocrJobRepository = mock(OcrJobRepository::class.java, withSettings().defaultAnswer { invocation ->
        when (invocation.method.name) {
            "claimEligible" -> {
                job.status = OcrJobStatus.PROCESSING
                job.leaseToken = invocation.getArgument(2)
                job.leaseUntil = invocation.getArgument(3)
                1
            }
            "completeExpenseStage" -> 1
            "completeReceiptStage" -> 1
            "recordPermanentFailure" -> {
                job.status = OcrJobStatus.PERMANENT_FAILURE
                job.errorCode = invocation.getArgument(2)
                1
            }
            else -> RETURNS_DEFAULTS.answer(invocation)
        }
    })
    private val storageService = mock(StorageService::class.java)
    private val ocrComparisonRepository = mock(OcrComparisonRepository::class.java)
    private val expenseRepository = mock(ExpenseRepository::class.java, withSettings().defaultAnswer { invocation ->
        if (invocation.method.name == "saveAndFlush") {
            (invocation.arguments[0] as Expense).apply { id = 99 }
        } else {
            RETURNS_DEFAULTS.answer(invocation)
        }
    })
    private val receiptRepository = mock(ReceiptRepository::class.java)
    private val categoryRepository = mock(CategoryRepository::class.java)
    private val expenseReportRepository = mock(ExpenseReportRepository::class.java)
    private val fxService = mock(FxService::class.java)
    private val transactionTemplate = mock(TransactionTemplate::class.java, withSettings().defaultAnswer { invocation ->
        if (invocation.method.name == "execute") {
            val callback = invocation.getArgument<TransactionCallback<Any?>>(0)
            callback.doInTransaction(mock(TransactionStatus::class.java))
        } else {
            RETURNS_DEFAULTS.answer(invocation)
        }
    })
    private val ocrTaskExecutor = mock(Executor::class.java)

    private val asyncOcrService = AsyncOcrService(
        ocrService,
        ocrJobRepository,
        ocrComparisonRepository,
        storageService,
        ObjectMapper(),
        expenseRepository,
        receiptRepository,
        categoryRepository,
        expenseReportRepository,
        fxService,
        transactionTemplate,
        ocrTaskExecutor
    )

    private lateinit var techUser: User
    private lateinit var job: OcrJob

    private fun <T : Any> anyObject(dummy: T): T {
        any(dummy::class.java)
        return dummy
    }

    private fun <T : Any> eqNonNull(value: T): T {
        eq(value)
        return value
    }

    @BeforeEach
    fun setup() {
        techUser = User(id = 1, username = "tech", displayName = "Tech", role = "technician")
        job = OcrJob(
            id = 1,
            user = techUser,
            status = OcrJobStatus.PENDING,
            stage = OcrJobStage.OCR,
            filename = "receipt.jpg",
            sourcePath = "ocr-sources/1_receipt.jpg"
        )
        `when`(ocrJobRepository.findById(1)).thenReturn(Optional.of(job))
    }

    @Test
    fun `processOcr scans the durable source and fences the OCR result`() {
        val fakeData = "fake data".toByteArray()
        `when`(storageService.downloadFile("ocr-sources/1_receipt.jpg")).thenReturn(fakeData)
        `when`(ocrService.scanReceipt(fakeData, "receipt.jpg")).thenReturn(mapOf("amount" to 10.5))
        asyncOcrService.processOcr(1)

        verify(storageService).downloadFile("ocr-sources/1_receipt.jpg")
        verify(ocrService).scanReceipt(fakeData, "receipt.jpg")
    }

    @Test
    fun `OCR Expense promotion starts pending verification`() {
        job.stage = OcrJobStage.EXPENSE
        job.resultJson = """{"amount":10.0,"currency":"EUR","date":"2024-01-01"}"""

        asyncOcrService.processOcr(1)

        val promoted = org.mockito.ArgumentCaptor.forClass(Expense::class.java)
        verify(expenseRepository).saveAndFlush(promoted.capture())
        assertEquals(ExpenseVerificationState.PENDING, promoted.value.verificationState)
    }

    @Test
    fun `OCR promotion links the requested draft report and records the result`() {
        job.stage = OcrJobStage.EXPENSE
        job.requestedReportId = 77
        job.reportLinkStatus = "PENDING"
        job.resultJson = """{"amount":10.0,"currency":"EUR","date":"2024-01-01"}"""
        val report = ExpenseReport(id = 77, user = techUser, title = "Draft report")
        `when`(expenseReportRepository.findByIdForOcrPromotion(77)).thenReturn(Optional.of(report))

        asyncOcrService.processOcr(1)

        val promoted = org.mockito.ArgumentCaptor.forClass(Expense::class.java)
        verify(expenseRepository).saveAndFlush(promoted.capture())
        assertEquals(report, promoted.value.report)
        assertEquals("LINKED", job.reportLinkStatus)
        assertEquals(ExpenseVerificationState.PENDING, promoted.value.verificationState)
    }

    @Test
    fun `OCR promotion preserves an unattached Expense when the requested report is no longer draft`() {
        job.stage = OcrJobStage.EXPENSE
        job.requestedReportId = 77
        job.reportLinkStatus = "PENDING"
        job.resultJson = """{"amount":10.0,"currency":"EUR","date":"2024-01-01"}"""
        val report = ExpenseReport(id = 77, user = techUser, title = "Submitted report", status = "submitted")
        `when`(expenseReportRepository.findByIdForOcrPromotion(77)).thenReturn(Optional.of(report))

        asyncOcrService.processOcr(1)

        val promoted = org.mockito.ArgumentCaptor.forClass(Expense::class.java)
        verify(expenseRepository).saveAndFlush(promoted.capture())
        assertEquals(null, promoted.value.report)
        assertEquals("CONFLICT", job.reportLinkStatus)
        assertEquals(ExpenseVerificationState.PENDING, promoted.value.verificationState)
    }

    @Test
    fun `OCR receipt promotion preserves a previously verified Expense`() {
        job.stage = OcrJobStage.RECEIPT
        job.expenseId = 99
        job.sourcePath = "ocr-sources/1_receipt.jpg"
        val expense = Expense(
            id = 99,
            user = techUser,
            amountOriginal = BigDecimal.ONE,
            amountEur = BigDecimal.ONE,
            date = "2026-10-20",
            verificationState = ExpenseVerificationState.VERIFIED,
        )
        `when`(expenseRepository.findById(99)).thenReturn(Optional.of(expense))
        `when`(storageService.downloadFile(job.sourcePath!!)).thenReturn(byteArrayOf(1, 2, 3, 4))
        doReturn("receipts/99_receipt.jpg").`when`(storageService)
            .storeFile(eqNonNull(StorageContext.RECEIPT), anyObject(RawUpload(byteArrayOf(1, 2, 3, 4), "receipt.jpg", "image/jpeg")), eq(99))
        doAnswer { invocation ->
            (invocation.arguments[0] as Receipt).apply { id = 100 }
        }.`when`(receiptRepository).saveAndFlush(anyObject(Receipt(expense = expense, filePath = "dummy", originalName = "dummy")))
        org.springframework.transaction.support.TransactionSynchronizationManager.initSynchronization()

        try {
            asyncOcrService.processOcr(1)
        } finally {
            org.springframework.transaction.support.TransactionSynchronizationManager.clearSynchronization()
        }

        assertEquals(ExpenseVerificationState.VERIFIED, expense.verificationState)
        verify(expenseRepository, never()).saveAndFlush(expense)
    }

    @Test
    fun `manual completion does not silently discard a category that became unavailable`() {
        job.stage = OcrJobStage.EXPENSE
        job.resultJson = """{"amount":10.0,"currency":"EUR","date":"2024-01-01","category_id":99,"manual_completion":true}"""

        asyncOcrService.processOcr(1)

        verifyNoInteractions(expenseRepository)
        assertEquals(OcrJobStatus.PERMANENT_FAILURE, job.status)
        assertEquals("MANUAL_CATEGORY_INVALID", job.errorCode)
    }

    @Test
    fun `provider exception is recorded as retryable while attempts remain`() {
        val fakeData = "fake data".toByteArray()
        `when`(storageService.downloadFile("ocr-sources/1_receipt.jpg")).thenReturn(fakeData)
        `when`(ocrService.scanReceipt(fakeData, "receipt.jpg"))
            .thenThrow(RuntimeException("OCR Failed"))
        job.attemptCount = 1

        asyncOcrService.processOcr(1)

        verify(ocrService).scanReceipt(fakeData, "receipt.jpg")
    }

    @Test
    fun `transient_failure result triggers retry instead of promoting zero-amount expense`() {
        val fakeData = "fake data".toByteArray()
        `when`(storageService.downloadFile("ocr-sources/1_receipt.jpg")).thenReturn(fakeData)
        `when`(ocrService.scanReceipt(fakeData, "receipt.jpg")).thenReturn(
            mapOf(
                "amount" to null,
                "currency" to null,
                "provider_error" to "AI provider returned HTTP 503",
                "transient_failure" to true,
            ),
        )
        job.attemptCount = 1

        asyncOcrService.processOcr(1)

        verify(ocrJobRepository).recordTransientFailure(
            eq(1),
            anyString(),
            anyObject(Instant.now()),
            eq("OCR_PROCESSING_RETRY") ?: "OCR_PROCESSING_RETRY",
            anyString(),
            anyObject(Instant.now()),
        )
        verify(ocrJobRepository, never()).completeOcrStage(
            anyInt(),
            anyString(),
            anyString(),
            any(),
            anyObject(Instant.now()),
        )
        verifyNoInteractions(expenseRepository)
    }
}
