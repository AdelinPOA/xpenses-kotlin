package eu.nt.xpenses.ocr

import com.fasterxml.jackson.databind.ObjectMapper
import eu.nt.xpenses.model.OcrJob
import eu.nt.xpenses.model.OcrJobStatus
import eu.nt.xpenses.repositories.AppSettingRepository
import eu.nt.xpenses.repositories.OcrJobRepository
import eu.nt.xpenses.services.CryptoService
import eu.nt.xpenses.services.OcrSourceCleanupService
import eu.nt.xpenses.services.StorageService
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.api.io.TempDir
import org.mockito.Mockito.*
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.SimpleTransactionStatus
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant
import java.nio.file.DirectoryNotEmptyException
import java.nio.file.Files
import java.nio.file.Path
import java.util.Optional
import java.util.concurrent.Executor

class OcrSourceCleanupServiceTest {
    @TempDir lateinit var tempDir: Path
    private var candidates: (Int, Int) -> List<Int> = { _, _ -> listOf(1) }
    private val repository = mock(OcrJobRepository::class.java, withSettings().defaultAnswer { invocation ->
        if (invocation.method.name == "findSourceCleanupCandidates") candidates(invocation.arguments[1] as Int, invocation.arguments[2] as Int)
        else org.mockito.Answers.RETURNS_DEFAULTS.answer(invocation)
    })
    private val storage = mock(StorageService::class.java)
    private val manager = mock(PlatformTransactionManager::class.java)
    private val cleanup = OcrSourceCleanupService(repository, storage, TransactionTemplate(manager))
    private val path = "ocr-sources/1_receipt.jpg"
    private lateinit var job: OcrJob

    @BeforeEach
    fun setup() {
        `when`(manager.getTransaction(any())).thenReturn(SimpleTransactionStatus())
        job =
            OcrJob(
                id = 1,
                status = OcrJobStatus.PERMANENT_FAILURE,
                sourcePath = path,
                expiresAt = Instant.now().minusSeconds(1),
            )
        `when`(repository.lockForSourceCleanup(1)).thenReturn(job)
    }

    @Test
    fun `expired permanent failure clears source metadata only after deletion`() {
        cleanup.cleanup()
        verify(storage).deleteOcrSource(path)
        assertNull(job.sourcePath)
        assertEquals(OcrJobStatus.EXPIRED, job.status)
        assertEquals("OCR_SOURCE_RETENTION_EXPIRED", job.unrecoverableReason)
        verify(repository).save(job)
    }

    @Test
    fun `active and recoverable jobs remain protected even past retention deadline`() {
        listOf(OcrJobStatus.PENDING, OcrJobStatus.PROCESSING, OcrJobStatus.RETRY_WAIT, OcrJobStatus.PAUSED).forEach {
            job.status = it
            cleanup.cleanup()
        }
        verifyNoInteractions(storage)
        assertEquals(path, job.sourcePath)
    }

    @Test
    fun `unexpired and actively leased terminal sources are not removed`() {
        job.expiresAt = Instant.now().plusSeconds(3600)
        cleanup.cleanup()
        job.expiresAt = Instant.now().minusSeconds(1)
        job.leaseUntil = Instant.now().plusSeconds(3600)
        cleanup.cleanup()
        verifyNoInteractions(storage)
    }

    @Test
    fun `source also referenced by a receipt signature or other job is protected`() {
        `when`(repository.isSourcePathShared(path, 1)).thenReturn(true)
        cleanup.cleanup()
        verifyNoInteractions(storage)
        assertEquals(path, job.sourcePath)
    }

    @Test
    fun `storage failure retains source pointer for next bounded pass`() {
        doThrow(IllegalStateException("remote unavailable")).`when`(storage).deleteOcrSource(path)
        cleanup.cleanup()
        assertEquals(path, job.sourcePath)
        assertEquals(OcrJobStatus.PERMANENT_FAILURE, job.status)
        verify(repository, never()).save(job)
    }

    @Test
    fun `full protected batch does not starve a later eligible source`() {
        candidates = { limit, afterId -> (1..26).filter { it > afterId }.take(limit) }
        (1..25).forEach { id ->
            val protectedPath = "ocr-sources/${id}_protected.jpg"
            `when`(repository.lockForSourceCleanup(id)).thenReturn(
                OcrJob(id = id, status = OcrJobStatus.COMPLETED, sourcePath = protectedPath,
                    expiresAt = Instant.now().minusSeconds(1)),
            )
            `when`(repository.isSourcePathShared(protectedPath, id)).thenReturn(true)
        }
        val eligible = OcrJob(id = 26, status = OcrJobStatus.COMPLETED,
            sourcePath = "ocr-sources/26_receipt.jpg", expiresAt = Instant.now().minusSeconds(1))
        `when`(repository.lockForSourceCleanup(26)).thenReturn(eligible)

        cleanup.cleanup()
        verifyNoInteractions(storage)
        cleanup.cleanup()
        verify(storage).deleteOcrSource("ocr-sources/26_receipt.jpg")
        assertNull(eligible.sourcePath)
    }

    @Test
    fun `failing full batch advances then wraps so failures remain retryable`() {
        val cursors = mutableListOf<Int>()
        candidates = { limit, afterId ->
            cursors.add(afterId)
            (1..3).filter { it > afterId }.take(limit)
        }
        (1..3).forEach { id ->
            `when`(repository.lockForSourceCleanup(id)).thenReturn(
                OcrJob(id = id, status = OcrJobStatus.PERMANENT_FAILURE,
                    sourcePath = "ocr-sources/${id}_receipt.jpg", expiresAt = Instant.now().minusSeconds(1)),
            )
        }
        doThrow(IllegalStateException("storage unavailable")).`when`(storage).deleteOcrSource("ocr-sources/1_receipt.jpg")
        doThrow(IllegalStateException("storage unavailable")).`when`(storage).deleteOcrSource("ocr-sources/2_receipt.jpg")
        val smallBatch = OcrSourceCleanupService(repository, storage, TransactionTemplate(manager), batchSize = 2)

        smallBatch.cleanup()
        smallBatch.cleanup()
        verify(storage).deleteOcrSource("ocr-sources/3_receipt.jpg")
        smallBatch.cleanup() // End of keyset; reset the cursor without an unbounded scan.
        smallBatch.cleanup()
        assertEquals(listOf(0, 2, 3, 0), cursors)
        verify(storage, times(2)).deleteOcrSource("ocr-sources/1_receipt.jpg")
        verify(storage, times(2)).deleteOcrSource("ocr-sources/2_receipt.jpg")
    }

    private fun realLocalStorage(): StorageService {
        val settings = mock(AppSettingRepository::class.java)
        `when`(settings.findById("storage_config")).thenReturn(Optional.empty())
        return StorageService(settings, mock(CryptoService::class.java), ObjectMapper(),
            Executor { it.run() }, TransactionTemplate(manager), defaultReceiptsDir = tempDir.toString())
    }

    @Test
    fun `real local deletion failure preserves source pointer and metadata`() {
        // A nonempty directory makes deletion fail deterministically even as root;
        // permission-bit tests would falsely pass on this production host.
        val target = tempDir.resolve(path)
        Files.createDirectories(target)
        Files.writeString(target.resolve("blocker"), "still present")
        job.sourceSizeBytes = 42
        job.sourceContentType = "image/jpeg"
        val localStorage = realLocalStorage()
        assertThrows<DirectoryNotEmptyException> { localStorage.deleteOcrSource(path) }

        OcrSourceCleanupService(repository, localStorage, TransactionTemplate(manager)).cleanup()
        assertTrue(Files.exists(target.resolve("blocker")))
        assertEquals(path, job.sourcePath)
        assertEquals(42L, job.sourceSizeBytes)
        assertEquals("image/jpeg", job.sourceContentType)
        verify(repository, never()).save(job)
    }

    @Test
    fun `strict local deletion removes source and tolerates already absent bytes`() {
        val target = tempDir.resolve(path)
        Files.createDirectories(target.parent)
        Files.writeString(target, "source")
        val localStorage = realLocalStorage()
        localStorage.deleteOcrSource(path)
        assertFalse(Files.exists(target))
        localStorage.deleteOcrSource(path)
    }

    @Test
    fun `strict local deletion refuses a source symlink to another stored file`() {
        val retained = tempDir.resolve("retained.jpg")
        Files.writeString(retained, "receipt")
        val target = tempDir.resolve(path)
        Files.createDirectories(target.parent)
        Files.createSymbolicLink(target, retained)
        assertThrows<IllegalArgumentException> { realLocalStorage().deleteOcrSource(path) }
        assertEquals("receipt", Files.readString(retained))
    }

    @Test
    fun `strict local deletion refuses a source directory symlink inside the storage root`() {
        val receiptDir = tempDir.resolve("receipts")
        Files.createDirectories(receiptDir)
        val retained = receiptDir.resolve("1_receipt.jpg")
        Files.writeString(retained, "receipt")
        Files.createSymbolicLink(tempDir.resolve("ocr-sources"), receiptDir)
        assertThrows<IllegalArgumentException> { realLocalStorage().deleteOcrSource(path) }
        assertEquals("receipt", Files.readString(retained))
    }

    @Test
    fun `completed job keeps its authoritative IDs and successful state`() {
        job.status = OcrJobStatus.COMPLETED
        job.expenseId = 41
        job.receiptId = 42
        cleanup.cleanup()
        assertNull(job.sourcePath)
        assertEquals(OcrJobStatus.COMPLETED, job.status)
        assertEquals(41, job.expenseId)
        assertEquals(42, job.receiptId)
    }
}
