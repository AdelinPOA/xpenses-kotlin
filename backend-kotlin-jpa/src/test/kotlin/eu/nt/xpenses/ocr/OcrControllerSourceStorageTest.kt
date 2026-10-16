package eu.nt.xpenses.ocr

import com.fasterxml.jackson.databind.ObjectMapper
import eu.nt.xpenses.controllers.OcrController
import eu.nt.xpenses.model.OcrJob
import eu.nt.xpenses.model.OcrJobStatus
import eu.nt.xpenses.model.User
import eu.nt.xpenses.repositories.AppSettingRepository
import eu.nt.xpenses.repositories.OcrComparisonRepository
import eu.nt.xpenses.repositories.OcrJobRepository
import eu.nt.xpenses.security.RateLimitStore
import eu.nt.xpenses.services.OcrJobPipeline
import eu.nt.xpenses.services.OCRConfig
import eu.nt.xpenses.services.OcrService
import eu.nt.xpenses.services.CryptoService
import eu.nt.xpenses.services.StorageService
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
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
import java.util.Optional
import java.util.concurrent.Executors
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant

class OcrControllerSourceStorageTest {
    private val ocrService = mock(OcrService::class.java)
    private val ocrJobPipeline = mock(OcrJobPipeline::class.java)
    private val comparisonRepository = mock(OcrComparisonRepository::class.java)
    private val jobRepository = mock(OcrJobRepository::class.java)
    private val appSettingRepository = mock(AppSettingRepository::class.java)
    private val cryptoService = mock(CryptoService::class.java)
    private val rateLimitStore = mock(RateLimitStore::class.java)
    @TempDir
    lateinit var tempDir: Path
    private lateinit var storageService: StorageService
    private val objectMapper = ObjectMapper()
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
            ocrJobPipeline,
            comparisonRepository,
            jobRepository,
            storageService,
            objectMapper,
            rateLimitStore
        )
        technician = User(id = 7, username = "tech", displayName = "Tech")
        `when`(rateLimitStore.record(anyString(), anyInt(), anyLong(), anyLong())).thenReturn(1)
        `when`(ocrService.getOcrConfig()).thenReturn(OCRConfig())
        `when`(jobRepository.save(any(OcrJob::class.java))).thenAnswer {
            (it.arguments[0] as OcrJob).apply { id = 42 }
        }
        doReturn(1).`when`(jobRepository).persistSourceCapture(
            anyInt(), anyString(), nullable(String::class.java), anyLong(), anyString(), anyObject(Instant.EPOCH)
        )
    }

    @Test
    fun `expired job status is exposed as a failed polling result`() {
        val expiredJob = OcrJob(
            id = 42,
            user = technician,
            status = OcrJobStatus.EXPIRED,
            filename = "receipt.png"
        ).apply {
            errorCode = "OCR_JOB_EXPIRED"
            errorMessage = "OCR job exceeded its retention window"
        }
        doReturn(Optional.of(expiredJob)).`when`(jobRepository).findById(42)
        val request = MockHttpServletRequest().apply {
            setAttribute("currentUser", technician)
        }

        val response = controller.getJobStatus(42, request)

        @Suppress("UNCHECKED_CAST")
        val body = response.body as Map<String, Any?>
        assertEquals("failed", body["status"])
        assertEquals("OCR_JOB_EXPIRED", body["error_code"])
        assertEquals("OCR job exceeded its retention window", body["error"])
    }

    @Test
    fun `source capture CAS prevents a quarantined job from being revived`() {
        doReturn(0).`when`(jobRepository).persistSourceCapture(
            anyInt(), anyString(), nullable(String::class.java), anyLong(), anyString(), anyObject(Instant.EPOCH)
        )
        val request = MockHttpServletRequest().apply {
            setAttribute("currentUser", technician)
        }
        val file = MockMultipartFile("file", "receipt.png", "image/png", pngBytes)

        val response = controller.scanReceipt(file, sync = false, request)

        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, response.statusCode)
        verify(ocrJobPipeline, never()).processOcr(anyInt())
        verify(jobRepository, never()).markSourceCaptureFailed(anyInt(), anyObject(Instant.EPOCH))
        assertFalse(java.nio.file.Files.exists(tempDir.resolve("ocr-sources/42_receipt.png")))
    }

    @Test
    fun `async scan stores source metadata before dispatching only the job id`() {
        val request = MockHttpServletRequest().apply {
            setAttribute("currentUser", technician)
        }
        val file = MockMultipartFile("file", "receipt.png", "image/png", pngBytes)

        val response = controller.scanReceipt(file, sync = false, request)

        assertEquals(HttpStatus.ACCEPTED, response.statusCode)
        verify(ocrJobPipeline).processOcr(42)

        val savedJob = ArgumentCaptor.forClass(OcrJob::class.java)
        verify(jobRepository).save(savedJob.capture())
        assertNotNull(savedJob.value.expiresAt)
        verify(jobRepository).persistSourceCapture(
            eqNonNull(42),
            eqNonNull("ocr-sources/42_receipt.png"),
            eqNonNull("image/png"),
            eqNonNull(pngBytes.size.toLong()),
            eqNonNull("4c4b6a3be1314ab86138bef4314dde022e600960d8689a2c8f8631802d20dab6"),
            anyObject(Instant.EPOCH)
        )
    }

    private fun <T : Any> eqNonNull(value: T): T {
        eq(value)
        return value
    }

    private fun <T : Any> anyObject(example: T): T {
        any(example::class.java)
        return example
    }
}
