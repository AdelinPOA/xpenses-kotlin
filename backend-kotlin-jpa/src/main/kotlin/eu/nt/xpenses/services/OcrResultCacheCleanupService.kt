package eu.nt.xpenses.services

import eu.nt.xpenses.repositories.OcrResultCacheRepository
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.time.temporal.ChronoUnit

@Service
class OcrResultCacheCleanupService(
    private val repository: OcrResultCacheRepository,
    @Value("\${ocr.cache.retention-days:90}") private val retentionDays: Long,
    @Value("\${ocr.cache.cleanup-batch-size:100}") private val batchSize: Int
) {
    private val log = LoggerFactory.getLogger(OcrResultCacheCleanupService::class.java)

    @Scheduled(fixedDelayString = "\${ocr.cache.cleanup-interval:86400000}")
    @Transactional
    fun deleteExpiredEntries() {
        val cutoff = Instant.now().minus(retentionDays, ChronoUnit.DAYS)
        var deleted = 0
        do {
            val batch = repository.deleteExpiredBatch(cutoff, batchSize.coerceAtLeast(1))
            deleted += batch
        } while (batch == batchSize)

        if (deleted > 0) {
            log.info("Deleted {} expired OCR result cache entries", deleted)
        }
    }
}
