package eu.nt.xpenses.services.storage

import org.slf4j.LoggerFactory
import java.util.UUID
import java.util.concurrent.Executor

class StorageMigrationEngine(
    private val executor: Executor,
    private val stateStore: StorageMigrationStateStore = NoopStorageMigrationStateStore
) {
    private val logger = LoggerFactory.getLogger(StorageMigrationEngine::class.java)

    data class MigrationResult(
        val totalFiles: Int,
        val migratedFiles: Int,
        val failedFiles: Int,
        val errors: List<String>
    )

    fun executeMigrationAsync(
        oldProvider: StorageProvider,
        newProvider: StorageProvider,
        filePaths: List<String>,
        jobId: String = UUID.randomUUID().toString(),
        maxAttempts: Int = DEFAULT_MAX_ATTEMPTS,
        onProgress: (MigrationResult, isComplete: Boolean) -> Unit
    ) {
        executor.execute {
            val errors = mutableListOf<String>()
            var migrated = 0
            var failed = 0

            for (path in filePaths.distinct()) {
                if (!stateStore.claim(jobId, path, maxAttempts)) {
                    continue
                }

                try {
                    val bytes = oldProvider.download(path)
                    newProvider.upload(path, bytes)
                    stateStore.markCompleted(jobId, path)
                    migrated++
                } catch (e: Exception) {
                    stateStore.markFailed(jobId, path, e)
                    failed++
                    val safeError = e.message?.take(500).orEmpty()
                    logger.error("Failed to migrate storage object {}", path, e)
                    errors.add("Failed to migrate $path: $safeError")
                }

                onProgress(
                    MigrationResult(
                        totalFiles = filePaths.distinct().size,
                        migratedFiles = migrated,
                        failedFiles = failed,
                        errors = errors.take(MAX_REPORTED_ERRORS)
                    ),
                    false
                )
            }

            onProgress(
                MigrationResult(
                    totalFiles = filePaths.distinct().size,
                    migratedFiles = migrated,
                    failedFiles = failed,
                    errors = errors.take(MAX_REPORTED_ERRORS)
                ),
                true
            )
        }
    }

    private companion object {
        const val DEFAULT_MAX_ATTEMPTS = 5
        const val MAX_REPORTED_ERRORS = 50
    }
}

