package eu.nt.xpenses.repositories

import eu.nt.xpenses.model.OcrJob
import jakarta.persistence.LockModeType
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Lock
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional
import java.time.Instant

@Repository
interface OcrJobRepository : JpaRepository<OcrJob, Int> {
    fun findByUser_IdAndAcceptanceKey(userId: Int, acceptanceKey: String): OcrJob?

    fun findFirstByUser_IdAndExpenseIdOrderByCreatedAtDesc(userId: Int, expenseId: Int): OcrJob?

    fun findAllByUser_IdOrderByCreatedAtDesc(userId: Int, pageable: org.springframework.data.domain.Pageable): List<OcrJob>

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT j FROM OcrJob j WHERE j.id = :jobId")
    fun findByIdForUpdate(@Param("jobId") jobId: Int): OcrJob?

    @Query(
        value = """
            SELECT id FROM ocr_jobs
            WHERE source_path IS NOT NULL AND expires_at <= :now
              AND status IN ('COMPLETED', 'CANCELLED', 'PERMANENT_FAILURE', 'UNRECOVERABLE', 'EXPIRED')
              AND (lease_until IS NULL OR lease_until <= :now)
              AND id > :afterId
            ORDER BY id LIMIT :batchSize
        """,
        nativeQuery = true,
    )
    fun findSourceCleanupCandidates(
        @Param("now") now: Instant,
        @Param("batchSize") batchSize: Int,
        @Param("afterId") afterId: Int,
    ): List<Int>

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT j FROM OcrJob j WHERE j.id = :jobId")
    fun lockForSourceCleanup(@Param("jobId") jobId: Int): OcrJob?

    @Query(
        value = """
            SELECT EXISTS (
                SELECT 1 FROM receipts WHERE file_path = :path
                UNION ALL SELECT 1 FROM users WHERE signature_path = :path
                UNION ALL SELECT 1 FROM ocr_jobs WHERE source_path = :path AND id <> :jobId
            )
        """,
        nativeQuery = true,
    )
    fun isSourcePathShared(@Param("path") path: String, @Param("jobId") jobId: Int): Boolean

    @Query("SELECT j.sourcePath FROM OcrJob j WHERE j.sourcePath IS NOT NULL")
    fun findAllSourcePaths(): List<String>

    @Query(
        value = """
            SELECT id FROM ocr_jobs
            WHERE status IN ('PENDING', 'RETRY_WAIT')
              AND (status = 'PENDING' OR next_attempt_at IS NULL OR next_attempt_at <= :now)
            ORDER BY id ASC
            LIMIT :batchSize
            """,
        nativeQuery = true,
    )
    fun findClaimableJobIds(
        @Param("now") now: Instant,
        @Param("batchSize") batchSize: Int,
    ): List<Int>

    @Query(
        value = """
            SELECT id FROM ocr_jobs
            WHERE status = 'PROCESSING'
              AND lease_until IS NOT NULL
              AND lease_until <= :now
            ORDER BY id ASC
            LIMIT :batchSize
            """,
        nativeQuery = true,
    )
    fun findExpiredJobIds(
        @Param("now") now: Instant,
        @Param("batchSize") batchSize: Int,
    ): List<Int>

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Transactional
    @Query(
        value = """
            UPDATE ocr_jobs
            SET result_json = :resultJson,
                stage = 'EXPENSE',
                status = 'PENDING',
                attempt_count = 0,
                next_attempt_at = NULL,
                error_code = COALESCE(:errorCode, error_code),
                lease_token = NULL,
                lease_until = NULL,
                updated_at = :now
            WHERE id = :jobId
              AND stage = 'OCR'
              AND status = 'PROCESSING'
              AND lease_token = :leaseToken
              AND lease_until > :now
            """,
        nativeQuery = true,
    )
    fun completeOcrStage(
        @Param("jobId") jobId: Int,
        @Param("leaseToken") leaseToken: String,
        @Param("resultJson") resultJson: String,
        @Param("errorCode") errorCode: String?,
        @Param("now") now: Instant,
    ): Int

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Transactional
    @Query(
        value = """
            UPDATE ocr_jobs
            SET expense_id = :expenseId,
                stage = 'RECEIPT',
                status = 'PENDING',
                attempt_count = 0,
                next_attempt_at = NULL,
                lease_token = NULL,
                lease_until = NULL,
                error_code = COALESCE(:errorCode, error_code),
                updated_at = :now
            WHERE id = :jobId
              AND stage = 'EXPENSE'
              AND status = 'PROCESSING'
              AND lease_token = :leaseToken
              AND lease_until > :now
            """,
        nativeQuery = true,
    )
    fun completeExpenseStage(
        @Param("jobId") jobId: Int,
        @Param("leaseToken") leaseToken: String,
        @Param("expenseId") expenseId: Int,
        @Param("errorCode") errorCode: String?,
        @Param("now") now: Instant,
    ): Int

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Transactional
    @Query(
        value = """
            UPDATE ocr_jobs
            SET receipt_id = :receiptId,
                status = 'COMPLETED',
                completed_at = :now,
                lease_token = NULL,
                lease_until = NULL,
                updated_at = :now
            WHERE id = :jobId
              AND stage = 'RECEIPT'
              AND status = 'PROCESSING'
              AND lease_token = :leaseToken
              AND lease_until > :now
            """,
        nativeQuery = true,
    )
    fun completeReceiptStage(
        @Param("jobId") jobId: Int,
        @Param("leaseToken") leaseToken: String,
        @Param("receiptId") receiptId: Int,
        @Param("now") now: Instant,
    ): Int

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Transactional
    @Query(
        value = """
            UPDATE ocr_jobs
            SET status = 'CANCELLED',
                lease_token = NULL,
                lease_until = NULL,
                updated_at = :now
            WHERE id = :jobId
              AND user_id = :userId
              AND status IN ('PENDING', 'RETRY_WAIT', 'PROCESSING', 'PAUSED')
            """,
        nativeQuery = true,
    )
    fun cancelClaimed(
        @Param("jobId") jobId: Int,
        @Param("userId") userId: Int,
        @Param("now") now: Instant,
    ): Int

    /**
     * Claims one stage only if the persisted snapshot is still eligible. The
     * affected-row count is the fencing result: exactly one means ownership;
     * zero means another worker won or the job is no longer eligible.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Transactional
    @Query(
        value = """
            UPDATE ocr_jobs
            SET status = 'PROCESSING',
                lease_token = :leaseToken,
                lease_until = :leaseUntil,
                attempt_count = attempt_count + 1,
                next_attempt_at = NULL,
                updated_at = :now
            WHERE id = :jobId
              AND stage = :stage
              AND (
                    status = 'PENDING'
                    OR (status = 'RETRY_WAIT' AND (next_attempt_at IS NULL OR next_attempt_at <= :now))
                  )
            """,
        nativeQuery = true,
    )
    fun claimEligible(
        @Param("jobId") jobId: Int,
        @Param("stage") stage: String,
        @Param("leaseToken") leaseToken: String,
        @Param("leaseUntil") leaseUntil: Instant,
        @Param("now") now: Instant,
    ): Int

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Transactional
    @Query(
        value = """
            UPDATE ocr_jobs
            SET stage = CASE stage
                            WHEN 'OCR' THEN 'EXPENSE'
                            WHEN 'EXPENSE' THEN 'RECEIPT'
                            ELSE stage
                        END,
                status = CASE WHEN stage = 'RECEIPT' THEN 'COMPLETED' ELSE 'PENDING' END,
                completed_at = CASE WHEN stage = 'RECEIPT' THEN :now ELSE completed_at END,
                lease_token = NULL,
                lease_until = NULL,
                updated_at = :now
            WHERE id = :jobId
              AND stage IN ('OCR', 'EXPENSE', 'RECEIPT')
              AND status = 'PROCESSING'
              AND lease_token = :leaseToken
              AND lease_until > :now
            """,
        nativeQuery = true,
    )
    fun completeClaimedStage(
        @Param("jobId") jobId: Int,
        @Param("leaseToken") leaseToken: String,
        @Param("now") now: Instant,
    ): Int

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Transactional
    @Query(
        value = """
            UPDATE ocr_jobs
            SET status = 'PERMANENT_FAILURE',
                error_code = :errorCode,
                error_message = :errorMessage,
                lease_token = NULL,
                lease_until = NULL,
                updated_at = :now
            WHERE id = :jobId
              AND status = 'PROCESSING'
              AND lease_token = :leaseToken
            """,
        nativeQuery = true,
    )
    fun recordPermanentFailure(
        @Param("jobId") jobId: Int,
        @Param("leaseToken") leaseToken: String,
        @Param("errorCode") errorCode: String,
        @Param("errorMessage") errorMessage: String?,
        @Param("now") now: Instant,
    ): Int

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Transactional
    @Query(
        value = """
            UPDATE ocr_jobs
            SET status = 'PERMANENT_FAILURE',
                error_code = :errorCode,
                error_message = :errorMessage,
                lease_token = NULL,
                lease_until = NULL,
                updated_at = :now
            WHERE id = :jobId
              AND status = 'PROCESSING'
              AND (lease_token = :leaseToken OR lease_until <= :now)
            """,
        nativeQuery = true,
    )
    fun recordExpiredLeasePermanentFailure(
        @Param("jobId") jobId: Int,
        @Param("leaseToken") leaseToken: String,
        @Param("errorCode") errorCode: String,
        @Param("errorMessage") errorMessage: String?,
        @Param("now") now: Instant,
    ): Int

    /** Replaces an expired lease in one compare-and-set operation. */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Transactional
    @Query(
        value = """
            UPDATE ocr_jobs
            SET lease_token = :leaseToken,
                lease_until = :leaseUntil,
                attempt_count = attempt_count + 1,
                next_attempt_at = NULL,
                updated_at = :now
            WHERE id = :jobId
              AND stage = :stage
              AND status = 'PROCESSING'
              AND lease_until IS NOT NULL
              AND lease_until <= :now
            """,
        nativeQuery = true,
    )
    fun reclaimExpired(
        @Param("jobId") jobId: Int,
        @Param("stage") stage: String,
        @Param("leaseToken") leaseToken: String,
        @Param("leaseUntil") leaseUntil: Instant,
        @Param("now") now: Instant,
    ): Int

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Transactional
    @Query(
        value = """
            UPDATE ocr_jobs
            SET status = 'RETRY_WAIT',
                next_attempt_at = :nextAttemptAt,
                error_code = :errorCode,
                error_message = :errorMessage,
                lease_token = NULL,
                lease_until = NULL,
                updated_at = :now
            WHERE id = :jobId
              AND status = 'PROCESSING'
              AND lease_token = :leaseToken
            """,
        nativeQuery = true,
    )
    fun recordTransientFailure(
        @Param("jobId") jobId: Int,
        @Param("leaseToken") leaseToken: String,
        @Param("nextAttemptAt") nextAttemptAt: Instant,
        @Param("errorCode") errorCode: String,
        @Param("errorMessage") errorMessage: String?,
        @Param("now") now: Instant,
    ): Int
}
