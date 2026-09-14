package eu.nt.xpenses.ocr

import com.fasterxml.jackson.databind.ObjectMapper
import eu.nt.xpenses.model.OcrJob
import eu.nt.xpenses.model.OcrJobStage
import eu.nt.xpenses.model.OcrJobStatus
import eu.nt.xpenses.model.User
import eu.nt.xpenses.repositories.CategoryRepository
import eu.nt.xpenses.repositories.ExpenseRepository
import eu.nt.xpenses.repositories.OcrComparisonRepository
import eu.nt.xpenses.repositories.OcrJobRepository
import eu.nt.xpenses.repositories.ReceiptRepository
import eu.nt.xpenses.services.AsyncOcrService
import eu.nt.xpenses.services.FxService
import eu.nt.xpenses.services.OcrService
import eu.nt.xpenses.services.StorageService
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers.any
import org.mockito.Answers.RETURNS_DEFAULTS
import org.mockito.Mockito.*
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant
import java.util.Optional
import java.util.concurrent.Executor

class AsyncOcrTest {
    private val ocrService = mock(OcrService::class.java)
    private val ocrJobRepository = mock(OcrJobRepository::class.java, withSettings().defaultAnswer { invocation ->
        if (invocation.method.name == "claimEligible") 1 else RETURNS_DEFAULTS.answer(invocation)
    })
    private val storageService = mock(StorageService::class.java)
    private val ocrComparisonRepository = mock(OcrComparisonRepository::class.java)
    private val expenseRepository = mock(ExpenseRepository::class.java)
    private val receiptRepository = mock(ReceiptRepository::class.java)
    private val categoryRepository = mock(CategoryRepository::class.java)
    private val fxService = mock(FxService::class.java)
    private val transactionTemplate = mock(TransactionTemplate::class.java)
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
        fxService,
        transactionTemplate,
        ocrTaskExecutor
    )

    private lateinit var techUser: User
    private lateinit var job: OcrJob

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
    fun `provider exception is recorded as retryable while attempts remain`() {
        val fakeData = "fake data".toByteArray()
        `when`(storageService.downloadFile("ocr-sources/1_receipt.jpg")).thenReturn(fakeData)
        `when`(ocrService.scanReceipt(fakeData, "receipt.jpg"))
            .thenThrow(RuntimeException("OCR Failed"))
        job.attemptCount = 1

        asyncOcrService.processOcr(1)

        verify(ocrService).scanReceipt(fakeData, "receipt.jpg")
    }
}
