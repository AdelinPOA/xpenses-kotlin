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
 * Pure state transitions for one OcrJob. Database compare-and-set belongs to
 * the repository seam; this module only permits transitions for the snapshot
 * that the caller already owns.
 */
object OcrJobStateMachine {
    fun claim(job: OcrJob, leaseToken: String, leaseUntil: Instant, now: Instant): Boolean {
        val eligible = when (job.status) {
            OcrJobStatus.PENDING -> true
            OcrJobStatus.RETRY_WAIT -> job.nextAttemptAt == null || !job.nextAttemptAt!!.isAfter(now)
            else -> false
        }
        if (!eligible) return false

        job.status = OcrJobStatus.PROCESSING
        job.leaseToken = leaseToken
        job.leaseUntil = leaseUntil
        job.attemptCount += 1
        job.nextAttemptAt = null
        job.updatedAt = now
        return true
    }

    fun completeStage(job: OcrJob, leaseToken: String, now: Instant): Boolean {
        if (!ownsActiveLease(job, leaseToken, now)) return false

        when (job.stage) {
            OcrJobStage.OCR -> {
                job.stage = OcrJobStage.EXPENSE
                job.status = OcrJobStatus.PENDING
            }
            OcrJobStage.EXPENSE -> {
                job.stage = OcrJobStage.RECEIPT
                job.status = OcrJobStatus.PENDING
            }
            OcrJobStage.RECEIPT -> {
                job.status = OcrJobStatus.COMPLETED
                job.completedAt = now
            }
            else -> return false
        }
        clearLease(job, now)
        return true
    }

    fun recordTransientFailure(
        job: OcrJob,
        leaseToken: String,
        nextAttemptAt: Instant,
        errorCode: String,
        errorMessage: String?,
        now: Instant
    ): Boolean {
        if (!ownsActiveLease(job, leaseToken, now)) return false

        job.status = OcrJobStatus.RETRY_WAIT
        job.nextAttemptAt = nextAttemptAt
        job.errorCode = errorCode
        job.errorMessage = errorMessage
        clearLease(job, now)
        return true
    }

    private fun ownsActiveLease(job: OcrJob, leaseToken: String, now: Instant): Boolean =
        job.status == OcrJobStatus.PROCESSING &&
            job.leaseToken == leaseToken &&
            job.leaseUntil != null &&
            job.leaseUntil!!.isAfter(now)

    private fun clearLease(job: OcrJob, now: Instant) {
        job.leaseToken = null
        job.leaseUntil = null
        job.updatedAt = now
    }
}
