package eu.nt.xpenses.services.storage

import eu.nt.xpenses.models.LocalStorageConfig
import eu.nt.xpenses.models.StorageConfigDto
import eu.nt.xpenses.services.StorageService
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.api.io.TempDir
import org.mockito.Mockito
import java.nio.file.Files
import java.nio.file.Path
import java.time.Instant

class StorageOrphanServiceTest {
    @TempDir
    lateinit var tempDir: Path

    private val storageService = Mockito.mock(StorageService::class.java)
    private var referencedPaths: MutableList<String> = mutableListOf()
    private var failingSource: StorageReferenceSource? = null
    private lateinit var storageOrphanService: StorageOrphanService

    @BeforeEach
    fun setUp() {
        referencedPaths = mutableListOf()
        failingSource = null
        Mockito.`when`(storageService.getStorageConfig()).thenReturn(
            StorageConfigDto(local = LocalStorageConfig(tempDir.toString())),
        )
        storageOrphanService =
            StorageOrphanService(
                storageService = storageService,
                referenceSources = listOf(
                    StorageReferenceSource { referencedPaths.toList() },
                    StorageReferenceSource { failingSource?.referencedPaths() ?: emptyList() },
                ),
            )
    }

    @Test
    fun `orphan receipt cleanup leaves insurance files untouched`() {
        val insuranceFile = tempDir.resolve("42/insurance/policy.pdf")
        Files.createDirectories(insuranceFile.parent)
        Files.write(insuranceFile, byteArrayOf(1, 2, 3))
        makeStale(insuranceFile)

        assertTrue(storageOrphanService.scanOrphanReceipts().isEmpty())
        assertEquals(0, storageOrphanService.cleanOrphanReceipts())
        assertTrue(Files.exists(insuranceFile))
    }

    @Test
    fun `cleanup preserves stale receipt paths referenced by legacy expenses`() {
        val legacyPath = "2001/02/42_legacy.png"
        val legacyReceipt = createStorageFile(legacyPath)
        referencedPaths.add(legacyPath)

        assertTrue(storageOrphanService.scanOrphanReceipts().isEmpty())
        assertEquals(0, storageOrphanService.cleanOrphanReceipts())
        assertTrue(Files.exists(legacyReceipt))
    }

    @Test
    fun `cleanup deletes stale receipt-shaped orphans`() {
        val orphanPath = "2001/02/42_123e4567-e89b-12d3-a456-426614174000_orphan.png"
        val orphan = createStorageFile(orphanPath)

        assertEquals(listOf(orphanPath), storageOrphanService.scanOrphanReceipts())
        assertEquals(1, storageOrphanService.cleanOrphanReceipts())
        assertTrue(Files.notExists(orphan))
    }

    @Test
    fun `cleanup preserves files referenced by every storage owner`() {
        val ownerPaths =
            listOf(
                "2001/02/1_receipt.png",
                "2001/02/2_insurance.pdf",
                "2001/02/3_ocr.jpg",
                "2001/02/4_signature.png",
            )
        val files = ownerPaths.map(::createStorageFile)
        referencedPaths.addAll(ownerPaths.take(3))
        referencedPaths.add(tempDir.resolve(ownerPaths[3]).toAbsolutePath().toString())

        assertTrue(storageOrphanService.scanOrphanReceipts().isEmpty())
        assertEquals(0, storageOrphanService.cleanOrphanReceipts())
        assertTrue(files.all(Files::exists))
    }

    @Test
    fun `cleanup ignores recent files to avoid racing uploads`() {
        val recent = createStorageFile("2001/02/42_recent.png", stale = false)

        assertTrue(storageOrphanService.scanOrphanReceipts().isEmpty())
        assertEquals(0, storageOrphanService.cleanOrphanReceipts())
        assertTrue(Files.exists(recent))
    }

    @Test
    fun `cleanup does not delete files when a reference lookup fails`() {
        val orphan = createStorageFile("2001/02/42_orphan.png")
        failingSource = StorageReferenceSource { throw IllegalStateException("database unavailable") }

        assertThrows<IllegalStateException> { storageOrphanService.cleanOrphanReceipts() }
        assertTrue(Files.exists(orphan))
    }

    @Test
    fun `cleanup does not follow receipt symlinks outside storage root`() {
        val outside = tempDir.parent.resolve("outside-receipt.png")
        Files.write(outside, byteArrayOf(1, 2, 3))
        makeStale(outside)
        val link = tempDir.resolve("2001/02/42_link.png")
        Files.createDirectories(link.parent)
        Files.createSymbolicLink(link, outside)

        assertTrue(storageOrphanService.scanOrphanReceipts().isEmpty())
        assertEquals(0, storageOrphanService.cleanOrphanReceipts())
        assertTrue(Files.exists(outside))
        Files.deleteIfExists(outside)
    }

    private fun createStorageFile(
        relativePath: String,
        stale: Boolean = true,
    ): Path {
        val file = tempDir.resolve(relativePath)
        Files.createDirectories(file.parent)
        Files.write(file, byteArrayOf(1, 2, 3))
        if (stale) makeStale(file)
        return file
    }

    private fun makeStale(file: Path) {
        Files.setLastModifiedTime(
            file,
            java.nio.file.attribute.FileTime
                .from(Instant.now().minusSeconds(172_800)),
        )
    }
}
