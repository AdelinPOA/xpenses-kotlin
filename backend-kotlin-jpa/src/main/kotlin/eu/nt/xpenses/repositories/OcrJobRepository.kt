package eu.nt.xpenses.repositories

import eu.nt.xpenses.model.OcrJob
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional
import java.time.Instant

@Repository
interface OcrJobRepository : JpaRepository<OcrJob, Int> {
    @Query(
        value = """
            SELECT id FROM ocr_jobs
            WHERE status IN ('PENDING', 'RETRY_WAIT')
              AND (status = 'PENDING' OR next_attempt_at IS NULL OR next_attempt_at <= :now)
              AND (expires_at IS NULL OR expires_at > :now)
            ORDER BY id ASC
            LIMIT :batchSize
            """,
        nativeQuery = true
    )
    fun findClaimableJobIds(
        @Param("now") now: Instant,
        @Param("batchSize") batchSize: Int
    ): List<Int>

    @Query(
        value = """
            SELECT id FROM ocr_jobs
            WHERE status = 'PROCESSING'
              AND (lease_token IS NULL OR lease_until IS NULL OR lease_until <= :now)
              AND (expires_at IS NULL OR expires_at > :now)
            ORDER BY id ASC
            LIMIT :batchSize
            """,
        nativeQuery = true
    )
    fun findExpiredJobIds(
        @Param("now") now: Instant,
        @Param("batchSize") batchSize: Int
    ): List<Int>

    @Query(
        value = """
            SELECT id FROM ocr_jobs
            WHERE expires_at IS NOT NULL
              AND expires_at <= :now
              AND status IN ('PAUSED', 'PENDING', 'RETRY_WAIT', 'PROCESSING')
            ORDER BY expires_at ASC, id ASC
            LIMIT :batchSize
            """,
        nativeQuery = true
    )
    fun findRetentionExpiredJobIds(
        @Param("now") now: Instant,
        @Param("batchSize") batchSize: Int
    ): List<Int>

    @Query(
        value = """
            SELECT id FROM ocr_jobs
            WHERE status = 'PAUSED'
              AND COALESCE(source_path, '') = ''
              AND updated_at <= :cutoff
            ORDER BY updated_at ASC, id ASC
            LIMIT :batchSize
            """,
        nativeQuery = true
    )
    fun findStalePausedJobIds(
        @Param("cutoff") cutoff: Instant,
        @Param("batchSize") batchSize: Int
    ): List<Int>

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Transactional
    @Query(
        value = """
            UPDATE ocr_jobs
            SET result_json = :resultJson,
                stage = :nextStage,
                status = :nextStatus,
                attempt_count = 0,
                error_code = :errorCode,
                error_message = NULL,
                lease_token = NULL,
                lease_until = NULL,
                updated_at = :now
            WHERE id = :jobId
              AND stage = 'OCR'
              AND status = 'PROCESSING'
              AND lease_token = :leaseToken
              AND lease_until > :now
              AND (expires_at IS NULL OR expires_at > :now)
              AND :nextStage = 'EXPENSE'
              AND :nextStatus = 'PENDING'
            """,
        nativeQuery = true
    )
    fun completeOcrStage(
        @Param("jobId") jobId: Int,
        @Param("leaseToken") leaseToken: String,
        @Param("resultJson") resultJson: String,
        @Param("nextStage") nextStage: String,
        @Param("nextStatus") nextStatus: String,
        @Param("errorCode") errorCode: String?,
        @Param("now") now: Instant
    ): Int

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Transactional
    @Query(
        value = """
            UPDATE ocr_jobs
            SET expense_id = :expenseId,
                stage = :nextStage,
                status = :nextStatus,
                attempt_count = 0,
                lease_token = NULL,
                lease_until = NULL,
                error_code = :errorCode,
                error_message = NULL,
                updated_at = :now
            WHERE id = :jobId
              AND stage = 'EXPENSE'
              AND status = 'PROCESSING'
              AND lease_token = :leaseToken
              AND lease_until > :now
              AND (expires_at IS NULL OR expires_at > :now)
              AND :nextStage = 'RECEIPT'
              AND :nextStatus = 'PENDING'
            """,
        nativeQuery = true
    )
    fun completeExpenseStage(
        @Param("jobId") jobId: Int,
        @Param("leaseToken") leaseToken: String,
        @Param("expenseId") expenseId: Int,
        @Param("nextStage") nextStage: String,
        @Param("nextStatus") nextStatus: String,
        @Param("errorCode") errorCode: String?,
        @Param("now") now: Instant
    ): Int

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Transactional
    @Query(
        value = """
            UPDATE ocr_jobs
            SET receipt_staging_path = :receiptStagingPath,
                updated_at = :now
            WHERE id = :jobId
              AND stage = 'RECEIPT'
              AND status = 'PROCESSING'
              AND lease_token = :leaseToken
              AND lease_until > :now
              AND (expires_at IS NULL OR expires_at > :now)
            """,
        nativeQuery = true
    )
    fun setReceiptStagingPath(
        @Param("jobId") jobId: Int,
        @Param("leaseToken") leaseToken: String,
        @Param("receiptStagingPath") receiptStagingPath: String,
        @Param("now") now: Instant
    ): Int

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Transactional
    @Query(
        value = """
            UPDATE ocr_jobs
            SET receipt_staging_path = NULL,
                updated_at = :now
            WHERE id = :jobId
              AND stage = 'RECEIPT'
              AND status = 'PROCESSING'
              AND lease_token = :leaseToken
            """,
        nativeQuery = true
    )
    fun clearReceiptStagingPath(
        @Param("jobId") jobId: Int,
        @Param("leaseToken") leaseToken: String,
        @Param("now") now: Instant
    ): Int

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Transactional
    @Query(
        value = """
            UPDATE ocr_jobs
            SET receipt_id = :receiptId,
                receipt_staging_path = NULL,
                status = :nextStatus,
                completed_at = :now,
                error_code = CASE WHEN error_code = 'OCR_PROCESSING_RETRY' THEN NULL ELSE error_code END,
                error_message = CASE WHEN error_code = 'OCR_PROCESSING_RETRY' THEN NULL ELSE error_message END,
                lease_token = NULL,
                lease_until = NULL,
                updated_at = :now
            WHERE id = :jobId
              AND stage = 'RECEIPT'
              AND status = 'PROCESSING'
              AND lease_token = :leaseToken
              AND lease_until > :now
              AND (expires_at IS NULL OR expires_at > :now)
              AND :nextStatus = 'COMPLETED'
            """,
        nativeQuery = true
    )
    fun completeReceiptStage(
        @Param("jobId") jobId: Int,
        @Param("leaseToken") leaseToken: String,
        @Param("receiptId") receiptId: Int,
        @Param("nextStatus") nextStatus: String,
        @Param("now") now: Instant
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
              AND status IN ('PENDING', 'RETRY_WAIT', 'PROCESSING')
              AND (expires_at IS NULL OR expires_at > :now)
            """,
        nativeQuery = true
    )
    fun cancelClaimed(
        @Param("jobId") jobId: Int,
        @Param("userId") userId: Int,
        @Param("now") now: Instant
    ): Int

    /** Publishes source metadata only if capture is still in the PAUSED state. */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Transactional
    @Query(
        value = """
            UPDATE ocr_jobs
            SET source_path = :sourcePath,
                source_content_type = :sourceContentType,
                source_size_bytes = :sourceSizeBytes,
                source_sha256 = :sourceSha256,
                status = 'PENDING',
                next_attempt_at = NULL,
                updated_at = :now
            WHERE id = :jobId
              AND status = 'PAUSED'
              AND (expires_at IS NULL OR expires_at > :now)
            """,
        nativeQuery = true
    )
    fun persistSourceCapture(
        @Param("jobId") jobId: Int,
        @Param("sourcePath") sourcePath: String,
        @Param("sourceContentType") sourceContentType: String?,
        @Param("sourceSizeBytes") sourceSizeBytes: Long,
        @Param("sourceSha256") sourceSha256: String,
        @Param("now") now: Instant
    ): Int

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Transactional
    @Query(
        value = """
            UPDATE ocr_jobs
            SET status = 'PERMANENT_FAILURE',
                error_code = 'OCR_SOURCE_STORE_FAILED',
                error_message = 'OCR source could not be durably stored',
                updated_at = :now
            WHERE id = :jobId
              AND status = 'PAUSED'
            """,
        nativeQuery = true
    )
    fun markSourceCaptureFailed(@Param("jobId") jobId: Int, @Param("now") now: Instant): Int

    /** Makes a source-backed PAUSED job visible to the normal claim path. */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Transactional
    @Query(
        value = """
            UPDATE ocr_jobs
            SET status = 'PENDING',
                next_attempt_at = NULL,
                updated_at = :now
            WHERE status = 'PAUSED'
              AND source_path IS NOT NULL
              AND source_path <> ''
              AND (expires_at IS NULL OR expires_at > :now)
            """,
        nativeQuery = true
    )
    fun resumePausedWithSource(@Param("now") now: Instant): Int

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Transactional
    @Query(
        value = """
            UPDATE ocr_jobs
            SET status = 'UNRECOVERABLE',
                error_code = 'OCR_SOURCE_STORE_INCOMPLETE',
                error_message = 'OCR source was not durably persisted before capture stopped',
                unrecoverable_reason = 'paused_without_source',
                lease_token = NULL,
                lease_until = NULL,
                updated_at = :now
            WHERE id = :jobId
              AND status = 'PAUSED'
              AND COALESCE(source_path, '') = ''
              AND updated_at <= :cutoff
              AND (expires_at IS NULL OR expires_at > :now)
            """,
        nativeQuery = true
    )
    fun markPausedUnrecoverable(
        @Param("jobId") jobId: Int,
        @Param("cutoff") cutoff: Instant,
        @Param("now") now: Instant
    ): Int

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Transactional
    @Query(
        value = """
            UPDATE ocr_jobs
            SET status = 'EXPIRED',
                error_code = 'OCR_JOB_EXPIRED',
                error_message = 'OCR job exceeded its retention window',
                lease_token = NULL,
                lease_until = NULL,
                next_attempt_at = NULL,
                updated_at = :now
            WHERE id = :jobId
              AND expires_at IS NOT NULL
              AND expires_at <= :now
              AND status IN ('PAUSED', 'PENDING', 'RETRY_WAIT', 'PROCESSING')
            """,
        nativeQuery = true
    )
    fun expireIfDue(@Param("jobId") jobId: Int, @Param("now") now: Instant): Int

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
              AND (expires_at IS NULL OR expires_at > :now)
            """,
        nativeQuery = true
    )
    fun claimEligible(
        @Param("jobId") jobId: Int,
        @Param("stage") stage: String,
        @Param("leaseToken") leaseToken: String,
        @Param("leaseUntil") leaseUntil: Instant,
        @Param("now") now: Instant
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
              AND lease_until > :now
              AND (expires_at IS NULL OR expires_at > :now)
            """,
        nativeQuery = true
    )
    fun recordPermanentFailure(
        @Param("jobId") jobId: Int,
        @Param("leaseToken") leaseToken: String,
        @Param("errorCode") errorCode: String,
        @Param("errorMessage") errorMessage: String?,
        @Param("now") now: Instant
    ): Int

    /** Replaces an expired or incomplete lease in one compare-and-set operation. */
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
              AND (lease_token IS NULL OR lease_until IS NULL OR lease_until <= :now)
              AND (expires_at IS NULL OR expires_at > :now)
            """,
        nativeQuery = true
    )
    fun reclaimExpired(
        @Param("jobId") jobId: Int,
        @Param("stage") stage: String,
        @Param("leaseToken") leaseToken: String,
        @Param("leaseUntil") leaseUntil: Instant,
        @Param("now") now: Instant
    ): Int

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Transactional
    @Query(
        value = """
            UPDATE ocr_jobs
            SET status = 'RETRY_WAIT',
                next_attempt_at = :nextAttemptAt,
                error_code = CASE
                    WHEN error_code IS NULL OR error_code = 'OCR_PROCESSING_RETRY' THEN :errorCode
                    ELSE error_code
                END,
                error_message = CASE
                    WHEN error_code IS NULL OR error_code = 'OCR_PROCESSING_RETRY' THEN :errorMessage
                    ELSE error_message
                END,
                lease_token = NULL,
                lease_until = NULL,
                updated_at = :now
            WHERE id = :jobId
              AND status = 'PROCESSING'
              AND lease_token = :leaseToken
              AND lease_until > :now
              AND (expires_at IS NULL OR expires_at > :now)
            """,
        nativeQuery = true
    )
    fun recordTransientFailure(
        @Param("jobId") jobId: Int,
        @Param("leaseToken") leaseToken: String,
        @Param("nextAttemptAt") nextAttemptAt: Instant,
        @Param("errorCode") errorCode: String,
        @Param("errorMessage") errorMessage: String?,
        @Param("now") now: Instant
    ): Int
}
