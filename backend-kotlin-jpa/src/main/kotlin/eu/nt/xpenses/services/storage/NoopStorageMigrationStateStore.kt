package eu.nt.xpenses.services.storage

object NoopStorageMigrationStateStore : StorageMigrationStateStore {
    override fun claim(jobId: String, path: String, maxAttempts: Int) = true
    override fun markCompleted(jobId: String, path: String) = Unit
    override fun markFailed(jobId: String, path: String, error: Throwable) = Unit
}
