package eu.nt.xpenses.repositories

import eu.nt.xpenses.model.OcrResultCache
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.util.Optional

@Repository
interface OcrResultCacheRepository : JpaRepository<OcrResultCache, Int> {
    fun findBySha256AndProviderAndModelAndContractVersion(
        sha256: String,
        provider: String,
        model: String,
        contractVersion: String
    ): Optional<OcrResultCache>

    @Query(value = "SELECT pg_advisory_xact_lock(hashtextextended(:lockKey, 0))", nativeQuery = true)
    fun acquireScanLock(@Param("lockKey") lockKey: String)

    @Modifying
    @Transactional
    @Query(
        value = """
            DELETE FROM ocr_result_cache
            WHERE id IN (
                SELECT id FROM ocr_result_cache
                WHERE last_used_at < :cutoff
                ORDER BY last_used_at
                LIMIT :batchSize
            )
        """,
        nativeQuery = true
    )
    fun deleteExpiredBatch(@Param("cutoff") cutoff: Instant, @Param("batchSize") batchSize: Int): Int
}
