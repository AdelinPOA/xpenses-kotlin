package eu.nt.xpenses.services

import eu.nt.xpenses.model.OcrJobStatus
import eu.nt.xpenses.repositories.OcrJobRepository
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant

/** Bounded retention of terminal OCR sources; never expires active/recoverable jobs. */
@Service
class OcrSourceCleanupService(
    private val repository: OcrJobRepository,
    private val storage: StorageService,
    private val transactions: TransactionTemplate,
    @Value("\${ocr.source.cleanup-batch-size:25}") private val batchSize: Int = 25,
    @Value("\${ocr.source.cleanup-enabled:true}") private val enabled: Boolean = true,
) {
    private val log = LoggerFactory.getLogger(OcrSourceCleanupService::class.java)
    // A cyclic keyset cursor gives protected or repeatedly failing rows another
    // chance without letting them monopolize every bounded scheduled pass.
    private var afterId = 0

    @Synchronized
    @Scheduled(fixedDelayString = "\${ocr.source.cleanup-interval:3600000}")
    fun cleanup() {
        if (!enabled) return
        val now = Instant.now()
        // One bounded pass, not a loop holding every expired source in memory.
        val candidates = repository.findSourceCleanupCandidates(now, batchSize.coerceIn(1, 100), afterId)
        if (candidates.isEmpty()) {
            afterId = 0
            return
        }
        // Advance even when every candidate is protected or storage is failing.
        // After reaching the end, a later scheduled pass restarts at zero.
        afterId = candidates.last()
        candidates.forEach { id ->
            runCatching {
                transactions.execute {
                    val job = repository.lockForSourceCleanup(id) ?: return@execute
                    val path = job.sourcePath ?: return@execute
                    if (job.status !in TERMINAL || job.expiresAt?.isAfter(now) != false ||
                        job.leaseUntil?.isAfter(now) == true || !path.startsWith("ocr-sources/") ||
                        repository.isSourcePathShared(path, id)
                    ) {
                        return@execute
                    }

                    // The terminal row stays locked until deletion and pointer clearing
                    // commit. On deletion failure its pointer remains available for retry.
                    storage.deleteOcrSource(path)
                    job.sourcePath = null
                    job.sourceContentType = null
                    job.sourceSizeBytes = null
                    job.sourceSha256 = null
                    if (job.status == OcrJobStatus.PERMANENT_FAILURE || job.status == OcrJobStatus.UNRECOVERABLE) {
                        job.status = OcrJobStatus.EXPIRED
                        job.unrecoverableReason = "OCR_SOURCE_RETENTION_EXPIRED"
                    }
                    job.updatedAt = now
                    repository.save(job)
                }
            }.onFailure { log.warn("OCR source retention failed for job {}: {}", id, it.message) }
        }
    }

    companion object {
        private val TERMINAL =
            setOf(
                OcrJobStatus.COMPLETED,
                OcrJobStatus.CANCELLED,
                OcrJobStatus.PERMANENT_FAILURE,
                OcrJobStatus.UNRECOVERABLE,
                OcrJobStatus.EXPIRED,
            )
    }
}
