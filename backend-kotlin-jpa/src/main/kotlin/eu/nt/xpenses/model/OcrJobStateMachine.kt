package eu.nt.xpenses.model

import java.time.Instant

object OcrJobStage {
    const val OCR = "OCR"
    const val EXPENSE = "EXPENSE"
    const val RECEIPT = "RECEIPT"
}

object OcrJobStatus {
    const val PENDING = "PENDING"
    const val PROCESSING = "PROCESSING"
    const val RETRY_WAIT = "RETRY_WAIT"
    const val PAUSED = "PAUSED"
    const val PERMANENT_FAILURE = "PERMANENT_FAILURE"
    const val CANCELLED = "CANCELLED"
    const val COMPLETED = "COMPLETED"
    const val EXPIRED = "EXPIRED"
    const val UNRECOVERABLE = "UNRECOVERABLE"
}

/**
 * Pure worker-lifecycle policy for one OcrJob snapshot. Database compare-and-set
 * belongs to the repository seam; this module only decides which transition a
 * caller holding a snapshot may attempt.
 */
object OcrJobStateMachine {
    enum class ClaimMode {
        CLAIM,
        RECLAIM_EXPIRED
    }

    data class ClaimDecision(
        val mode: ClaimMode,
        val stage: String
    )

    data class StageTransition(
        val fromStage: String,
        val nextStage: String?,
        val nextStatus: String
    )

    sealed interface FailureTransition {
        data class Retry(
            val nextAttemptAt: Instant,
            val errorCode: String,
            val errorMessage: String?
        ) : FailureTransition

        data class Permanent(
            val errorCode: String,
            val errorMessage: String?
        ) : FailureTransition
    }

    fun claimDecision(job: OcrJob, now: Instant): ClaimDecision? {
        if (isExpired(job, now)) return null

        return when (job.status) {
            OcrJobStatus.PENDING -> ClaimDecision(ClaimMode.CLAIM, job.stage)
            OcrJobStatus.RETRY_WAIT ->
                if (job.nextAttemptAt == null || !job.nextAttemptAt!!.isAfter(now)) {
                    ClaimDecision(ClaimMode.CLAIM, job.stage)
                } else {
                    null
                }

            OcrJobStatus.PROCESSING ->
                if (job.leaseToken == null || job.leaseUntil == null || !job.leaseUntil!!.isAfter(now)) {
                    ClaimDecision(ClaimMode.RECLAIM_EXPIRED, job.stage)
                } else {
                    null
                }

            else -> null
        }
    }

    fun completeStage(job: OcrJob, leaseToken: String, now: Instant): StageTransition? {
        if (!ownsActiveLease(job, leaseToken, now)) return null

        return when (job.stage) {
            OcrJobStage.OCR -> StageTransition(
                fromStage = OcrJobStage.OCR,
                nextStage = OcrJobStage.EXPENSE,
                nextStatus = OcrJobStatus.PENDING
            )

            OcrJobStage.EXPENSE -> StageTransition(
                fromStage = OcrJobStage.EXPENSE,
                nextStage = OcrJobStage.RECEIPT,
                nextStatus = OcrJobStatus.PENDING
            )

            OcrJobStage.RECEIPT -> StageTransition(
                fromStage = OcrJobStage.RECEIPT,
                nextStage = null,
                nextStatus = OcrJobStatus.COMPLETED
            )

            else -> null
        }
    }

    fun failure(
        job: OcrJob,
        leaseToken: String,
        now: Instant,
        errorMessage: String?
    ): FailureTransition? {
        if (!ownsActiveLease(job, leaseToken, now)) return null

        return if (job.attemptCount >= MAX_ATTEMPTS) {
            FailureTransition.Permanent(
                errorCode = "OCR_PROCESSING_FAILED",
                errorMessage = errorMessage
            )
        } else {
            FailureTransition.Retry(
                nextAttemptAt = now.plusSeconds(RETRY_DELAY_SECONDS * job.attemptCount.coerceAtLeast(1)),
                errorCode = "OCR_PROCESSING_RETRY",
                errorMessage = errorMessage
            )
        }
    }

    fun permanentFailure(
        job: OcrJob,
        leaseToken: String,
        now: Instant,
        errorCode: String,
        errorMessage: String?
    ): FailureTransition.Permanent? =
        if (ownsActiveLease(job, leaseToken, now)) {
            FailureTransition.Permanent(errorCode, errorMessage)
        } else {
            null
        }

    fun canCancel(job: OcrJob, userId: Int, now: Instant = Instant.now()): Boolean =
        job.user?.id == userId &&
            !isExpired(job, now) &&
            job.status in setOf(
                OcrJobStatus.PENDING,
                OcrJobStatus.RETRY_WAIT,
                OcrJobStatus.PROCESSING
            )

    fun isTerminal(status: String): Boolean = status in setOf(
        OcrJobStatus.COMPLETED,
        OcrJobStatus.CANCELLED,
        OcrJobStatus.PERMANENT_FAILURE,
        OcrJobStatus.UNRECOVERABLE,
        OcrJobStatus.EXPIRED
    )

    private fun ownsActiveLease(job: OcrJob, leaseToken: String, now: Instant): Boolean =
        job.status == OcrJobStatus.PROCESSING &&
            job.leaseToken == leaseToken &&
            job.leaseUntil != null &&
            job.leaseUntil!!.isAfter(now) &&
            !isExpired(job, now)

    private fun isExpired(job: OcrJob, now: Instant): Boolean =
        job.expiresAt != null && !job.expiresAt!!.isAfter(now)

    private const val MAX_ATTEMPTS = 3
    private const val RETRY_DELAY_SECONDS = 30L
}
