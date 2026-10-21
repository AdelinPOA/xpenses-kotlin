package eu.nt.xpenses.ocr

import tools.jackson.databind.ObjectMapper
import eu.nt.xpenses.controllers.OcrController
import eu.nt.xpenses.model.ExpenseReport
import eu.nt.xpenses.model.OcrJob
import eu.nt.xpenses.model.OcrJobStatus
import eu.nt.xpenses.model.User
import eu.nt.xpenses.repositories.AppSettingRepository
import eu.nt.xpenses.repositories.ExpenseReportRepository
import eu.nt.xpenses.repositories.OcrComparisonRepository
import eu.nt.xpenses.repositories.OcrJobRepository
import eu.nt.xpenses.security.RateLimitStore
import eu.nt.xpenses.services.AsyncOcrService
import eu.nt.xpenses.services.OCRConfig
import eu.nt.xpenses.services.OcrService
import eu.nt.xpenses.services.CryptoService
import eu.nt.xpenses.services.OcrRecoveryService
import eu.nt.xpenses.services.SaveIdempotencyService
import eu.nt.xpenses.services.StorageService
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.ArgumentCaptor
import org.mockito.Mockito.*
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockMultipartFile
import org.springframework.http.HttpStatus
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Path
import java.time.Instant
import java.util.Optional
import java.util.concurrent.Executors
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate

class OcrControllerSourceStorageTest {
    private val ocrService = mock(OcrService::class.java)
    private val asyncOcrService = mock(AsyncOcrService::class.java)
    private val comparisonRepository = mock(OcrComparisonRepository::class.java)
    private val jobRepository = mock(OcrJobRepository::class.java)
    private val appSettingRepository = mock(AppSettingRepository::class.java)
    private val cryptoService = mock(CryptoService::class.java)
    private val rateLimitStore = mock(RateLimitStore::class.java)
    private val expenseReportRepository = mock(ExpenseReportRepository::class.java)
    private val ocrRecoveryService = mock(OcrRecoveryService::class.java)
    private val objectMapper = ObjectMapper()
    private val idempotency = SaveIdempotencyService(
        mock(JdbcTemplate::class.java), objectMapper, mock(PlatformTransactionManager::class.java)
    )
    @TempDir
    lateinit var tempDir: Path
    private lateinit var storageService: StorageService
    private lateinit var controller: OcrController
    private lateinit var technician: User

    private val pngBytes = byteArrayOf(
        0x89.toByte(), 0x50.toByte(), 0x4E.toByte(), 0x47.toByte(),
        0x0D.toByte(), 0x0A.toByte(), 0x1A.toByte(), 0x0A.toByte()
    )

    @BeforeEach
    fun setUp() {
        `when`(appSettingRepository.findById("storage_config")).thenReturn(Optional.empty())
        storageService = StorageService(
            appSettingRepository = appSettingRepository,
            cryptoService = cryptoService,
            objectMapper = objectMapper,
            executor = Executors.newSingleThreadExecutor(),
            transactionTemplate = mock(TransactionTemplate::class.java),
            defaultReceiptsDir = tempDir.toString()
        )
        controller = OcrController(
            ocrService,
            asyncOcrService,
            comparisonRepository,
            jobRepository,
            storageService,
            objectMapper,
            rateLimitStore,
            expenseReportRepository,
            idempotency,
            ocrRecoveryService
        )
        technician = User(id = 7, username = "tech", displayName = "Tech")
        `when`(rateLimitStore.record(anyString(), anyInt(), anyLong(), anyLong())).thenReturn(1)
        `when`(ocrService.getOcrConfig()).thenReturn(OCRConfig())
        `when`(jobRepository.save(any(OcrJob::class.java))).thenAnswer {
            (it.arguments[0] as OcrJob).apply { id = 42 }
        }
    }

    @Test
    fun `async scan stores source metadata before dispatching only the job id`() {
        val acceptanceKey = "client-source-uuid"
        val request = MockHttpServletRequest().apply {
            setAttribute("currentUser", technician)
            addHeader("Idempotency-Key", acceptanceKey)
        }
        val file = MockMultipartFile("file", "receipt.png", "image/png", pngBytes)

        val response = controller.scanReceipt(file, sync = false, request)

        assertEquals(HttpStatus.ACCEPTED, response.statusCode)
        verify(asyncOcrService).processOcr(42)

        val savedJob = ArgumentCaptor.forClass(OcrJob::class.java)
        verify(jobRepository).saveAndFlush(savedJob.capture())
        assertEquals("ocr-sources/42_receipt.png", savedJob.value.sourcePath)
        assertEquals("image/png", savedJob.value.sourceContentType)
        assertEquals(acceptanceKey, savedJob.value.acceptanceKey)
        assertEquals(
            idempotency.hash(mapOf("sha256" to savedJob.value.sourceSha256, "size_bytes" to pngBytes.size, "filename" to "receipt.png", "content_type" to "image/png", "report_id" to null)),
            savedJob.value.acceptanceFingerprint
        )
        assertEquals("NOT_REQUESTED", savedJob.value.reportLinkStatus)
        assertEquals(pngBytes.size.toLong(), savedJob.value.sourceSizeBytes)
        assertEquals(
            "4c4b6a3be1314ab86138bef4314dde022e600960d8689a2c8f8631802d20dab6",
            savedJob.value.sourceSha256
        )
        assertNotNull(savedJob.value.expiresAt)
    }

    @Test
    fun `acceptance validates and persists owner draft report context`() {
        val report = ExpenseReport(id = 23, user = technician, title = "Draft report")
        `when`(expenseReportRepository.findById(23)).thenReturn(Optional.of(report))
        val request = MockHttpServletRequest().apply {
            setAttribute("currentUser", technician)
            addHeader("Idempotency-Key", "source-with-report")
        }
        val file = MockMultipartFile("file", "receipt.png", "image/png", pngBytes)

        val response = controller.scanReceipt(file, sync = false, request, reportId = 23)

        assertEquals(HttpStatus.ACCEPTED, response.statusCode)
        val savedJob = ArgumentCaptor.forClass(OcrJob::class.java)
        verify(jobRepository).saveAndFlush(savedJob.capture())
        assertEquals(23, savedJob.value.requestedReportId)
        assertEquals("PENDING", savedJob.value.reportLinkStatus)
        assertEquals("source-with-report", savedJob.value.acceptanceKey)
        assertEquals(
            idempotency.hash(mapOf("sha256" to savedJob.value.sourceSha256, "size_bytes" to pngBytes.size, "filename" to "receipt.png", "content_type" to "image/png", "report_id" to 23)),
            savedJob.value.acceptanceFingerprint
        )
    }

    @Test
    fun `same acceptance key and fingerprint returns the existing OCR job`() {
        val key = "stable-source-key"
        val file = MockMultipartFile("file", "receipt.png", "image/png", pngBytes)
        val fingerprint = idempotency.hash(
            mapOf(
                "sha256" to "4c4b6a3be1314ab86138bef4314dde022e600960d8689a2c8f8631802d20dab6",
                "size_bytes" to pngBytes.size,
                "filename" to "receipt.png",
                "content_type" to "image/png",
                "report_id" to null
            )
        )
        val existing = OcrJob(
            id = 84,
            user = technician,
            filename = "receipt.png",
            status = OcrJobStatus.PENDING,
            sourcePath = "ocr-sources/84_receipt.png",
            acceptanceKey = key,
            acceptanceFingerprint = fingerprint,
            expiresAt = Instant.now().plusSeconds(3600)
        )
        `when`(jobRepository.findByUser_IdAndAcceptanceKey(7, key)).thenReturn(existing)
        val request = MockHttpServletRequest().apply {
            setAttribute("currentUser", technician)
            addHeader("Idempotency-Key", key)
        }

        val response = controller.scanReceipt(file, sync = false, request)

        assertEquals(HttpStatus.ACCEPTED, response.statusCode)
        assertEquals(84, (response.body as Map<*, *>)["job_id"])
        verify(asyncOcrService).processOcr(84)
        verify(jobRepository).findByUser_IdAndAcceptanceKey(7, key)
        verifyNoMoreInteractions(jobRepository)
        verifyNoInteractions(rateLimitStore)
    }

    @Test
    fun `same acceptance key with changed fingerprint returns conflict`() {
        val key = "stable-source-key"
        val file = MockMultipartFile("file", "receipt.png", "image/png", pngBytes)
        val existing = OcrJob(
            id = 85,
            user = technician,
            filename = "receipt.png",
            status = OcrJobStatus.PENDING,
            sourcePath = "ocr-sources/85_receipt.png",
            acceptanceKey = key,
            acceptanceFingerprint = "different-fingerprint",
            expiresAt = Instant.now().plusSeconds(3600)
        )
        `when`(jobRepository.findByUser_IdAndAcceptanceKey(7, key)).thenReturn(existing)
        val request = MockHttpServletRequest().apply {
            setAttribute("currentUser", technician)
            addHeader("Idempotency-Key", key)
        }

        val response = controller.scanReceipt(file, sync = false, request)

        assertEquals(HttpStatus.CONFLICT, response.statusCode)
        verify(jobRepository).findByUser_IdAndAcceptanceKey(7, key)
        verifyNoMoreInteractions(jobRepository)
        verifyNoInteractions(rateLimitStore)
    }
}
