package eu.nt.xpenses.services

import com.fasterxml.jackson.databind.ObjectMapper
import eu.nt.xpenses.models.RawUpload
import eu.nt.xpenses.repositories.AppSettingRepository
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.api.io.TempDir
import org.mockito.Mockito.mock
import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException
import java.nio.file.Path
import java.time.LocalDate
import java.util.concurrent.Executors

class StorageServiceTest {

    @TempDir
    lateinit var tempDir: Path

    private val appSettingRepository = mock(AppSettingRepository::class.java)
    private val cryptoService = mock(CryptoService::class.java)
    private val objectMapper = ObjectMapper()

    private lateinit var storageService: StorageService

    // Valid PNG magic bytes header (8 bytes)
    private val pngBytes = byteArrayOf(
        0x89.toByte(), 0x50.toByte(), 0x4E.toByte(), 0x47.toByte(),
        0x0D.toByte(), 0x0A.toByte(), 0x1A.toByte(), 0x0A.toByte()
    )

    // Valid JPEG magic bytes header (4 bytes)
    private val jpegBytes = byteArrayOf(
        0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte(), 0xE0.toByte()
    )

    @BeforeEach
    fun setUp() {
        storageService = StorageService(
            appSettingRepository = appSettingRepository,
            cryptoService = cryptoService,
            objectMapper = objectMapper,
            executor = Executors.newSingleThreadExecutor(),
            transactionTemplate = mock(org.springframework.transaction.support.TransactionTemplate::class.java),
            defaultReceiptsDir = tempDir.toString()
        )
    }

    @Test
    fun `storeFile RECEIPT context accepts png and builds year month path`() {
        val upload = RawUpload(pngBytes, "test_receipt.png", "image/png")
        val path = storageService.storeFile(StorageContext.RECEIPT, upload, entityId = 42)

        val now = LocalDate.now()
        val expectedPrefix = "${now.year}/${String.format("%02d", now.monthValue)}/42_test_receipt.png"
        assertEquals(expectedPrefix, path)
    }

    @Test
    fun `storeFile OCR_SOURCE context stores a durable job-scoped path`() {
        val upload = RawUpload(pngBytes, "scan.png", "image/png")

        val path = storageService.storeFile(StorageContext.OCR_SOURCE, upload, entityId = 42)

        assertEquals("ocr-sources/42_scan.png", path)
        assertArrayEquals(pngBytes, storageService.downloadFile(path))
    }

    @Test
    fun `storeFile RECEIPT context rejects disallowed extension`() {
        val upload = RawUpload("some text file content".toByteArray(), "test.txt", "text/plain")
        val ex = assertThrows<IllegalArgumentException> {
            storageService.storeFile(StorageContext.RECEIPT, upload, entityId = 42)
        }
        assertTrue(ex.message?.contains("File type .txt not allowed") == true)
    }

    @Test
    fun `storeFile RECEIPT context rejects payload larger than 10MB`() {
        val largeBytes = ByteArray(10 * 1024 * 1024 + 1)
        val upload = RawUpload(largeBytes, "large.png", "image/png")
        val ex = assertThrows<ResponseStatusException> {
            storageService.storeFile(StorageContext.RECEIPT, upload, entityId = 42)
        }
        assertEquals(HttpStatus.PAYLOAD_TOO_LARGE, ex.statusCode)
    }

    @Test
    fun `storeFile SIGNATURE context accepts png and builds signatures path`() {
        val upload = RawUpload(pngBytes, "my_signature.png", "image/png")
        val path = storageService.storeFile(StorageContext.SIGNATURE, upload, entityId = 99)

        assertEquals("signatures/99_my_signature.png", path)
    }

    @Test
    fun `storeFile SIGNATURE context rejects non-png file`() {
        val upload = RawUpload(jpegBytes, "sig.jpg", "image/jpeg")
        val ex = assertThrows<IllegalArgumentException> {
            storageService.storeFile(StorageContext.SIGNATURE, upload, entityId = 99)
        }
        assertTrue(ex.message?.contains("File type .jpg not allowed") == true)
    }

    @Test
    fun `storeFile SIGNATURE context rejects payload larger than 2MB`() {
        val largeBytes = ByteArray(2 * 1024 * 1024 + 1)
        val upload = RawUpload(largeBytes, "sig.png", "image/png")
        val ex = assertThrows<ResponseStatusException> {
            storageService.storeFile(StorageContext.SIGNATURE, upload, entityId = 99)
        }
        assertEquals(HttpStatus.PAYLOAD_TOO_LARGE, ex.statusCode)
    }

    @Test
    fun `validateMagicBytes detects corrupted or invalid headers`() {
        val badBytes = byteArrayOf(0x00, 0x00, 0x00, 0x00)
        val ex = assertThrows<ResponseStatusException> {
            storageService.validateMagicBytes(badBytes, setOf("image/png"))
        }
        assertEquals(HttpStatus.BAD_REQUEST, ex.statusCode)
    }

    @Test
    fun `ReceiptArchive append and open roundtrip calculates SHA-256 and verifies content`() {
        val archive: eu.nt.xpenses.services.storage.ReceiptArchive = storageService
        val content = java.io.ByteArrayInputStream(pngBytes)
        val stored = archive.append(101, content, "image/png", "receipt.png")

        assertEquals("image/png", stored.contentType)
        assertEquals("receipt.png", stored.filename)
        assertTrue(stored.relativePath.endsWith("101_receipt.png"))
        assertEquals(pngBytes.size.toLong(), stored.sizeBytes)
        assertTrue(stored.sha256.isNotBlank())

        archive.open(stored.relativePath).use { stream ->
            assertArrayEquals(pngBytes, stream.readAllBytes())
        }

        val verified = archive.verify(stored.relativePath)
        assertEquals("101_receipt.png", verified.filename)
        assertEquals(stored.sha256, verified.sha256)
        assertEquals(stored.sizeBytes, verified.sizeBytes)
    }

    @Test
    fun `ReceiptArchive append rejects invalid format or disallowed extension`() {
        val archive: eu.nt.xpenses.services.storage.ReceiptArchive = storageService
        assertThrows<IllegalArgumentException> {
            archive.append(101, java.io.ByteArrayInputStream("test".toByteArray()), "text/plain", "receipt.txt")
        }

        assertThrows<ResponseStatusException> {
            archive.append(101, java.io.ByteArrayInputStream(byteArrayOf(0, 1, 2, 3)), "image/png", "receipt.png")
        }
    }

    @Test
    fun `TransientStorage stage, open and release lifecycle`() {
        val transient: eu.nt.xpenses.services.storage.TransientStorage = storageService
        val now = java.time.Instant.now()
        val expiresAt = now.plus(1, java.time.temporal.ChronoUnit.HOURS)

        val staged = transient.stage(202, java.io.ByteArrayInputStream(pngBytes), "image/png", "scan.png", expiresAt)
        assertEquals(202, staged.sourceId)
        assertEquals("ocr-sources/202_scan.png", staged.relativePath)
        assertEquals(pngBytes.size.toLong(), staged.sizeBytes)
        assertTrue(staged.sha256.isNotBlank())
        assertEquals(expiresAt, staged.expiresAt)

        transient.open(staged.relativePath).use { stream ->
            assertArrayEquals(pngBytes, stream.readAllBytes())
        }

        transient.release(staged.relativePath, "test cleanup")
        assertThrows<java.nio.file.NoSuchFileException> {
            transient.open(staged.relativePath)
        }
    }

    @Test
    fun `TransientStorage reapExpired removes only files older than cutoff`() {
        val transient: eu.nt.xpenses.services.storage.TransientStorage = storageService
        val now = java.time.Instant.now()

        val stagedOld = transient.stage(301, java.io.ByteArrayInputStream(pngBytes), "image/png", "f1.png", now)
        val fileOld = java.io.File(tempDir.toFile(), stagedOld.relativePath)
        fileOld.setLastModified(now.minus(2, java.time.temporal.ChronoUnit.DAYS).toEpochMilli())

        val stagedNew = transient.stage(302, java.io.ByteArrayInputStream(pngBytes), "image/png", "f2.png", now)
        val fileNew = java.io.File(tempDir.toFile(), stagedNew.relativePath)
        fileNew.setLastModified(now.plus(1, java.time.temporal.ChronoUnit.DAYS).toEpochMilli())

        val reaped = transient.reapExpired(now.minus(1, java.time.temporal.ChronoUnit.DAYS))
        assertEquals(1, reaped)
        assertFalse(fileOld.exists())
        assertTrue(fileNew.exists())
    }
}
