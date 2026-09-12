package eu.nt.xpenses.ocr

import com.fasterxml.jackson.databind.ObjectMapper
import eu.nt.xpenses.model.OcrJob
import eu.nt.xpenses.model.OcrJobStatus
import eu.nt.xpenses.model.User
import eu.nt.xpenses.repositories.OcrJobRepository
import eu.nt.xpenses.services.AsyncOcrService
import eu.nt.xpenses.services.OcrService
import eu.nt.xpenses.services.StorageService
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers.any
import org.mockito.Mockito.*
import java.util.Optional

class AsyncOcrTest {

    private val ocrService = mock(OcrService::class.java)
    private val ocrJobRepository = mock(OcrJobRepository::class.java)
    private val storageService = mock(StorageService::class.java)
    private val objectMapper = ObjectMapper()
    
    private val asyncOcrService = AsyncOcrService(ocrService, ocrJobRepository, storageService, objectMapper)

    private lateinit var techUser: User
    private lateinit var job: OcrJob

    @BeforeEach
    fun setup() {
        techUser = User(id = 1, username = "tech", displayName = "Tech", role = "technician")
        job = OcrJob(
            id = 1,
            user = techUser,
            status = OcrJobStatus.PENDING,
            filename = "receipt.jpg",
            sourcePath = "ocr-sources/1_receipt.jpg"
        )
        `when`(ocrJobRepository.save(any(OcrJob::class.java))).thenAnswer { it.arguments[0] }
        `when`(ocrJobRepository.saveAndFlush(any(OcrJob::class.java))).thenAnswer { it.arguments[0] }
    }

    @Test
    fun `processOcr should save result when successful`() {
        val fakeData = "fake data".toByteArray()
        `when`(ocrJobRepository.findById(1)).thenReturn(Optional.of(job))
        `when`(storageService.downloadFile("ocr-sources/1_receipt.jpg")).thenReturn(fakeData)
        `when`(ocrService.scanReceipt(fakeData, "receipt.jpg")).thenReturn(mapOf("amount" to 10.5))

        asyncOcrService.processOcr(1)

        verify(storageService).downloadFile("ocr-sources/1_receipt.jpg")
        verify(ocrJobRepository, atLeastOnce()).save(job)
        assertEquals(OcrJobStatus.COMPLETED, job.status)
        assertTrue(job.resultJson!!.contains("10.5"))
    }

    @Test
    fun `processOcr should save error state on exception`() {
        val fakeData = "fake data".toByteArray()
        `when`(ocrJobRepository.findById(1)).thenReturn(Optional.of(job))
        `when`(storageService.downloadFile("ocr-sources/1_receipt.jpg")).thenReturn(fakeData)
        `when`(ocrService.scanReceipt(fakeData, "receipt.jpg")).thenThrow(RuntimeException("OCR Failed"))

        asyncOcrService.processOcr(1)

        verify(storageService).downloadFile("ocr-sources/1_receipt.jpg")
        verify(ocrJobRepository, atLeastOnce()).save(job)
        assertEquals(OcrJobStatus.PERMANENT_FAILURE, job.status)
        assertEquals("OCR Failed", job.errorMessage)
    }
}
