package eu.nt.xpenses.services

import com.fasterxml.jackson.databind.ObjectMapper
import eu.nt.xpenses.models.LocalStorageConfig
import eu.nt.xpenses.models.StorageConfigDto
import eu.nt.xpenses.repositories.AppSettingRepository
import eu.nt.xpenses.repositories.ExpenseRepository
import eu.nt.xpenses.repositories.InsuranceFileRepository
import eu.nt.xpenses.repositories.OcrJobRepository
import eu.nt.xpenses.repositories.ReceiptRepository
import eu.nt.xpenses.repositories.UserRepository
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

class AppSettingsServiceTest {
    @TempDir
    lateinit var tempDir: Path

    private val appSettingRepository = Mockito.mock(AppSettingRepository::class.java)
    private val receiptRepository = Mockito.mock(ReceiptRepository::class.java)
    private val expenseRepository = Mockito.mock(ExpenseRepository::class.java)
    private val insuranceFileRepository = Mockito.mock(InsuranceFileRepository::class.java)
    private val ocrJobRepository = Mockito.mock(OcrJobRepository::class.java)
    private val userRepository = Mockito.mock(UserRepository::class.java)
    private val storageService = Mockito.mock(StorageService::class.java)
    private lateinit var appSettingsService: AppSettingsService

    @BeforeEach
    fun setUp() {
        Mockito.`when`(storageService.getStorageConfig()).thenReturn(
            StorageConfigDto(local = LocalStorageConfig(tempDir.toString())),
        )
        Mockito.`when`(receiptRepository.findAllFilePaths()).thenReturn(emptyList())
        Mockito.`when`(expenseRepository.findAllLegacyReceiptPaths()).thenReturn(emptyList())
        Mockito.`when`(insuranceFileRepository.findAllFilePaths()).thenReturn(emptyList())
        Mockito.`when`(ocrJobRepository.findAllSourcePaths()).thenReturn(emptyList())
        Mockito.`when`(userRepository.findAllSignaturePaths()).thenReturn(emptyList())
        appSettingsService =
            AppSettingsService(
                appSettingRepository,
                receiptRepository,
                expenseRepository,
                insuranceFileRepository,
                ocrJobRepository,
                userRepository,
                storageService,
                ObjectMapper(),
            )
    }

    @Test
    fun `orphan receipt cleanup leaves insurance files untouched`() {
        val insuranceFile = tempDir.resolve("42/insurance/policy.pdf")
        Files.createDirectories(insuranceFile.parent)
        Files.write(insuranceFile, byteArrayOf(1, 2, 3))
        makeStale(insuranceFile)

        assertTrue(appSettingsService.scanOrphanReceipts().isEmpty())
        assertEquals(0, appSettingsService.cleanOrphanReceipts())
        assertTrue(Files.exists(insuranceFile))
    }

    @Test
    fun `cleanup preserves stale receipt paths referenced by legacy expenses`() {
        val legacyPath = "2001/02/42_legacy.png"
        val legacyReceipt = createStorageFile(legacyPath)
        Mockito.`when`(expenseRepository.findAllLegacyReceiptPaths()).thenReturn(listOf(legacyPath))

        assertTrue(appSettingsService.scanOrphanReceipts().isEmpty())
        assertEquals(0, appSettingsService.cleanOrphanReceipts())
        assertTrue(Files.exists(legacyReceipt))
    }

    @Test
    fun `cleanup deletes stale receipt-shaped orphans`() {
        val orphanPath = "2001/02/42_123e4567-e89b-12d3-a456-426614174000_orphan.png"
        val orphan = createStorageFile(orphanPath)

        assertEquals(listOf(orphanPath), appSettingsService.scanOrphanReceipts())
        assertEquals(1, appSettingsService.cleanOrphanReceipts())
        assertTrue(Files.notExists(orphan))
    }

    @Test
    fun `cleanup preserves files referenced by every storage owner`() {
        val referencedPaths =
            listOf(
                "2001/02/1_receipt.png",
                "2001/02/2_insurance.pdf",
                "2001/02/3_ocr.jpg",
                "2001/02/4_signature.png",
            )
        val files = referencedPaths.map(::createStorageFile)
        Mockito.`when`(receiptRepository.findAllFilePaths()).thenReturn(listOf(referencedPaths[0]))
        Mockito.`when`(insuranceFileRepository.findAllFilePaths()).thenReturn(listOf(referencedPaths[1]))
        Mockito.`when`(ocrJobRepository.findAllSourcePaths()).thenReturn(listOf(referencedPaths[2]))
        Mockito.`when`(userRepository.findAllSignaturePaths()).thenReturn(
            listOf(tempDir.resolve(referencedPaths[3]).toAbsolutePath().toString()),
        )

        assertTrue(appSettingsService.scanOrphanReceipts().isEmpty())
        assertEquals(0, appSettingsService.cleanOrphanReceipts())
        assertTrue(files.all(Files::exists))
    }

    @Test
    fun `cleanup ignores recent files to avoid racing uploads`() {
        val recent = createStorageFile("2001/02/42_recent.png", stale = false)

        assertTrue(appSettingsService.scanOrphanReceipts().isEmpty())
        assertEquals(0, appSettingsService.cleanOrphanReceipts())
        assertTrue(Files.exists(recent))
    }

    @Test
    fun `cleanup does not delete files when a reference lookup fails`() {
        val orphan = createStorageFile("2001/02/42_orphan.png")
        Mockito.`when`(insuranceFileRepository.findAllFilePaths()).thenThrow(IllegalStateException("database unavailable"))

        assertThrows<IllegalStateException> { appSettingsService.cleanOrphanReceipts() }
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

        assertTrue(appSettingsService.scanOrphanReceipts().isEmpty())
        assertEquals(0, appSettingsService.cleanOrphanReceipts())
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
