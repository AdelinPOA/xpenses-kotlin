package eu.nt.xpenses.services.storage

import eu.nt.xpenses.repositories.ExpenseRepository
import eu.nt.xpenses.repositories.InsuranceFileRepository
import eu.nt.xpenses.repositories.OcrJobRepository
import eu.nt.xpenses.repositories.ReceiptRepository
import eu.nt.xpenses.repositories.UserRepository
import eu.nt.xpenses.services.StorageService
import org.springframework.stereotype.Component
import org.springframework.stereotype.Service
import java.io.File
import java.nio.file.Files
import java.nio.file.LinkOption
import java.nio.file.Path
import java.time.Duration
import java.time.Instant

/**
 * Seam through which domain modules report stored file paths still referenced in persistence,
 * keeping [StorageOrphanService] decoupled from domain repositories.
 */
fun interface StorageReferenceSource {
    fun referencedPaths(): List<String>
}

@Component
class StorageReferenceAdapters(
    private val receiptRepository: ReceiptRepository,
    private val expenseRepository: ExpenseRepository,
    private val insuranceFileRepository: InsuranceFileRepository,
    private val ocrJobRepository: OcrJobRepository,
    private val userRepository: UserRepository,
) {
    @Component
    class ReceiptPaths(private val repo: ReceiptRepository) : StorageReferenceSource {
        override fun referencedPaths(): List<String> = repo.findAllFilePaths()
    }

    @Component
    class LegacyExpenseReceiptPaths(private val repo: ExpenseRepository) : StorageReferenceSource {
        override fun referencedPaths(): List<String> = repo.findAllLegacyReceiptPaths()
    }

    @Component
    class InsurancePaths(private val repo: InsuranceFileRepository) : StorageReferenceSource {
        override fun referencedPaths(): List<String> = repo.findAllFilePaths()
    }

    @Component
    class OcrSourcePaths(private val repo: OcrJobRepository) : StorageReferenceSource {
        override fun referencedPaths(): List<String> = repo.findAllSourcePaths()
    }

    @Component
    class SignaturePaths(private val repo: UserRepository) : StorageReferenceSource {
        override fun referencedPaths(): List<String> = repo.findAllSignaturePaths()
    }
}

/**
 * Scans and removes stale unreferenced receipt files from local storage while preserving
 * paths referenced by any registered [StorageReferenceSource].
 */
@Service
class StorageOrphanService(
    private val storageService: StorageService,
    private val referenceSources: List<StorageReferenceSource>,
) {
    companion object {
        private const val DEFAULT_LOCAL_RECEIPTS_PATH = "/app/data/receipts"
        private const val ORPHAN_RECEIPT_MIN_AGE_HOURS = 24L
        private val RECEIPT_STORAGE_PATH =
            Regex(
                """^\d{4}/(?:0[1-9]|1[0-2])/\d+_[^/]+\.(?:jpg|jpeg|png|gif|pdf|webp)$""",
                RegexOption.IGNORE_CASE,
            )
    }

    private fun localStorageRoot(): Path {
        val config = storageService.getStorageConfig()
        val localPath = config.local?.path ?: DEFAULT_LOCAL_RECEIPTS_PATH
        return File(localPath).canonicalFile.toPath()
    }

    private fun listLocalFiles(baseDir: Path): List<String> {
        if (!Files.isDirectory(baseDir, LinkOption.NOFOLLOW_LINKS)) return emptyList()

        return Files.walk(baseDir).use { paths ->
            paths
                .iterator()
                .asSequence()
                .filter { it != baseDir }
                .filter { path -> baseDir.relativize(path).none { it.toString() == "cache" } }
                .filter { Files.isRegularFile(it, LinkOption.NOFOLLOW_LINKS) }
                .map { baseDir.relativize(it).toString().replace(File.separatorChar, '/') }
                .toList()
        }
    }

    private fun referencedStoragePaths(baseDir: Path): Set<Path> {
        val references = referenceSources.flatMap { it.referencedPaths() }
        return references
            .mapNotNull { reference ->
                runCatching {
                    val path = Path.of(reference)
                    if (path.isAbsolute) {
                        path.toFile().canonicalFile.toPath()
                    } else {
                        StoragePathResolver.resolve(baseDir.toFile(), reference).toPath()
                    }
                }.getOrNull()
            }.toSet()
    }

    private fun isOldEnoughToDelete(
        path: Path,
        cutoff: Instant,
    ): Boolean =
        runCatching {
            Files.getLastModifiedTime(path, LinkOption.NOFOLLOW_LINKS).toInstant().isBefore(cutoff)
        }.getOrDefault(false)

    private fun findOrphanReceiptFiles(
        baseDir: Path,
        precomputedReferences: Set<Path>? = null,
    ): List<String> {
        if (!Files.isDirectory(baseDir, LinkOption.NOFOLLOW_LINKS)) return emptyList()

        val cutoff = Instant.now().minus(Duration.ofHours(ORPHAN_RECEIPT_MIN_AGE_HOURS))
        val referencedPaths = precomputedReferences ?: referencedStoragePaths(baseDir)
        return listLocalFiles(baseDir)
            .filter { RECEIPT_STORAGE_PATH.matches(it) }
            .filter { relativePath ->
                val file =
                    runCatching {
                        StoragePathResolver.resolve(baseDir.toFile(), relativePath).toPath()
                    }.getOrNull() ?: return@filter false
                val realFile =
                    runCatching { file.toRealPath(LinkOption.NOFOLLOW_LINKS) }.getOrNull()
                        ?: return@filter false
                realFile.startsWith(baseDir) &&
                    Files.isRegularFile(realFile, LinkOption.NOFOLLOW_LINKS) &&
                    realFile !in referencedPaths &&
                    isOldEnoughToDelete(realFile, cutoff)
            }.sorted()
    }

    fun scanOrphanReceipts(): List<String> = findOrphanReceiptFiles(localStorageRoot())

    fun cleanOrphanReceipts(): Int {
        val baseDir = localStorageRoot()
        if (!Files.isDirectory(baseDir, LinkOption.NOFOLLOW_LINKS)) return 0
        val referencedPaths = referencedStoragePaths(baseDir)
        val orphans = findOrphanReceiptFiles(baseDir, referencedPaths)
        val cutoff = Instant.now().minus(Duration.ofHours(ORPHAN_RECEIPT_MIN_AGE_HOURS))

        val cleanedFiles = mutableListOf<Path>()
        for (orphan in orphans) {
            val file =
                runCatching {
                    StoragePathResolver.resolve(baseDir.toFile(), orphan).toPath()
                }.getOrNull() ?: continue
            val realFile = runCatching { file.toRealPath(LinkOption.NOFOLLOW_LINKS) }.getOrNull() ?: continue
            if (
                realFile.startsWith(baseDir) &&
                Files.isRegularFile(realFile, LinkOption.NOFOLLOW_LINKS) &&
                realFile !in referencedPaths &&
                isOldEnoughToDelete(realFile, cutoff) &&
                Files.deleteIfExists(realFile)
            ) {
                cleanedFiles.add(realFile)
            }
        }
        return cleanedFiles.size
    }
}
