package eu.nt.xpenses.services.storage

interface StorageMigrationStateStore {
    fun claim(jobId: String, path: String, maxAttempts: Int): Boolean
    fun markCompleted(jobId: String, path: String)
    fun markFailed(jobId: String, path: String, error: Throwable)
}
