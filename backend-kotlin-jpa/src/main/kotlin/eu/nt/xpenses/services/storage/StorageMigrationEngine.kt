package eu.nt.xpenses.services.storage

import org.slf4j.LoggerFactory
import java.util.concurrent.Executor

class StorageMigrationEngine(
    private val executor: Executor
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
        onProgress: (MigrationResult, isComplete: Boolean) -> Unit
    ) {
        executor.execute {
            val errors = mutableListOf<String>()
            var migrated = 0
            var failed = 0
            val total = filePaths.size

            for (path in filePaths) {
                try {
                    val bytes = oldProvider.download(path)
                    newProvider.upload(path, bytes)
                    migrated++
                } catch (e: Exception) {
                    failed++
                    val errorMsg = "Failed to migrate $path: ${e.message}"
                    logger.error(errorMsg, e)
                    errors.add(errorMsg)
                }

                val currentResult = MigrationResult(
                    totalFiles = total,
                    migratedFiles = migrated,
                    failedFiles = failed,
                    errors = errors.take(50)
                )
                onProgress(currentResult, false)
            }

            val finalResult = MigrationResult(
                totalFiles = total,
                migratedFiles = migrated,
                failedFiles = failed,
                errors = errors.take(50)
            )
            onProgress(finalResult, true)
        }
    }
}
