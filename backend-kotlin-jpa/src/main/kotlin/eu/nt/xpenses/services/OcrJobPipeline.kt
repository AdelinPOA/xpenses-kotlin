package eu.nt.xpenses.services

import eu.nt.xpenses.model.User

/**
 * Durable OCR promotion module. Callers do not coordinate leases or stages;
 * they only dispatch work, recover pending work, or cancel an owned job.
 */
interface OcrJobPipeline {
    fun processOcr(jobId: Int)
    fun recover(batchSize: Int = 3): Int
    fun cancel(jobId: Int, currentUser: User): Boolean
}
