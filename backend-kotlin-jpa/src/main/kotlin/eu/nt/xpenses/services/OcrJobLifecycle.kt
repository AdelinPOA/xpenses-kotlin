package eu.nt.xpenses.services

import com.fasterxml.jackson.databind.ObjectMapper
import eu.nt.xpenses.model.Expense
import eu.nt.xpenses.model.OcrJob
import eu.nt.xpenses.model.OcrJobStage
import eu.nt.xpenses.model.OcrJobStateMachine
import eu.nt.xpenses.model.OcrJobStatus
import eu.nt.xpenses.model.Receipt
import eu.nt.xpenses.model.User
import eu.nt.xpenses.models.RawUpload
import eu.nt.xpenses.repositories.CategoryRepository
import eu.nt.xpenses.repositories.ExpenseRepository
import eu.nt.xpenses.repositories.OcrComparisonRepository
import eu.nt.xpenses.repositories.OcrJobRepository
import eu.nt.xpenses.repositories.ReceiptRepository
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.scheduling.annotation.Async
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionSynchronization
import org.springframework.transaction.support.TransactionSynchronizationManager
import org.springframework.transaction.support.TransactionTemplate
import java.io.File
import java.math.BigDecimal
import java.math.RoundingMode
import java.nio.file.NoSuchFileException
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import java.util.concurrent.Executor
import java.util.concurrent.RejectedExecutionException

@Service
class OcrJobLifecycle(
    private val ocrService: OcrService,
    private val ocrJobRepository: OcrJobRepository,
    private val ocrComparisonRepository: OcrComparisonRepository,
    private val storageService: StorageService,
    private val objectMapper: ObjectMapper,
    private val expenseRepository: ExpenseRepository,
    private val receiptRepository: ReceiptRepository,
    private val categoryRepository: CategoryRepository,
    private val fxService: FxService,
    private val transactionTemplate: TransactionTemplate,
    @Qualifier("ocrTaskExecutor") private val ocrTaskExecutor: Executor
) : OcrJobPipeline {
    private val log = LoggerFactory.getLogger(OcrJobLifecycle::class.java)

    @Async("ocrTaskExecutor")
    override fun processOcr(jobId: Int) {
        processJob(jobId)
    }

    override fun recover(batchSize: Int): Int {
        if (batchSize <= 0) return 0

        val now = Instant.now()
        expireDueJobs(now, batchSize)
        quarantineStalePausedJobs(now, batchSize)
        ocrJobRepository.resumePausedWithSource(now)

        val ids = (ocrJobRepository.findExpiredJobIds(now, batchSize) +
            ocrJobRepository.findClaimableJobIds(now, batchSize)).distinct().take(batchSize)
        var dispatched = 0

        ids.forEach { id ->
            try {
                ocrTaskExecutor.execute { processJob(id) }
                dispatched++
            } catch (_: RejectedExecutionException) {
                log.info("OCR executor is full; leaving job {} pending for a later recovery pass", id)
            }
        }
        return dispatched
    }

    override fun cancel(jobId: Int, currentUser: User): Boolean {
        val userId = currentUser.id ?: return false
        var sourcePath: String? = null
        val receiptPaths = mutableListOf<String>()
        val cancelled = transactionTemplate.execute {
            val initial = ocrJobRepository.findById(jobId).orElse(null) ?: return@execute false
            val now = Instant.now()
            if (!OcrJobStateMachine.canCancel(initial, userId, now)) return@execute false
            sourcePath = initial.sourcePath

            if (ocrJobRepository.cancelClaimed(jobId, userId, Instant.now()) != 1) {
                return@execute false
            }

            val job = ocrJobRepository.findById(jobId).orElse(null) ?: return@execute false
            deleteDraftArtifacts(job, receiptPaths)
            registerCleanup(sourcePath, receiptPaths)
            true
        } ?: false
        return cancelled
    }

    private fun processJob(jobId: Int) {
        while (true) {
            val snapshot = ocrJobRepository.findById(jobId).orElse(null) ?: return
            val now = Instant.now()
            if (snapshot.expiresAt?.let { !it.isAfter(now) } == true) {
                expireJob(jobId, now)
                return
            }
            if (OcrJobStateMachine.isTerminal(snapshot.status)) return
            if (snapshot.status == OcrJobStatus.PAUSED) {
                if (snapshot.sourcePath.isNullOrBlank()) return
                ocrJobRepository.resumePausedWithSource(now)
                continue
            }

            val leaseToken = UUID.randomUUID().toString()
            // The OCR service may walk four provider tiers, each with a
            // bounded 60-second read timeout. Keep the lease longer than
            // that chain so a healthy worker is not reclaimed mid-call.
            val leaseUntil = now.plus(LEASE_DURATION)
            val decision = OcrJobStateMachine.claimDecision(snapshot, now)
            val claimed = when {
                decision == null -> false
                decision.mode == OcrJobStateMachine.ClaimMode.RECLAIM_EXPIRED ->
                    ocrJobRepository.reclaimExpired(
                        jobId, decision.stage, leaseToken, leaseUntil, now
                    ) == 1

                else ->
                    ocrJobRepository.claimEligible(
                        jobId, decision.stage, leaseToken, leaseUntil, now
                    ) == 1
            }
            if (!claimed) return
            if (decision?.mode == OcrJobStateMachine.ClaimMode.RECLAIM_EXPIRED &&
                !cleanupReclaimedReceipt(snapshot, leaseToken)
            ) {
                return
            }

            val completed = try {
                when (snapshot.stage) {
                    OcrJobStage.OCR -> processOcrStage(jobId, leaseToken)
                    OcrJobStage.EXPENSE -> processExpenseStage(jobId, leaseToken)
                    OcrJobStage.RECEIPT -> processReceiptStage(jobId, leaseToken)
                    else -> false
                }
            } catch (exception: Exception) {
                recordFailure(jobId, leaseToken, exception)
            }
            if (!completed) return
        }
    }

    private fun processOcrStage(jobId: Int, leaseToken: String): Boolean {
        val job = ocrJobRepository.findById(jobId).orElse(null) ?: return false
        val sourcePath = job.sourcePath
        if (sourcePath.isNullOrBlank()) {
            recordPermanentFailureForLease(
                job,
                jobId,
                leaseToken,
                "OCR_SOURCE_MISSING",
                "OCR source is not durably stored"
            )
            return false
        }

        return try {
            val bytes = storageService.downloadFile(sourcePath)
            // OcrService turns provider failures into a structured result so
            // they can become a photo-only draft. Thrown exceptions here are
            // infrastructure failures and must use the normal retry policy.
            val result = ocrService.scanReceipt(bytes, job.filename)
            val fallback = photoOnlyFallback(result)
            val effectiveResult = fallback?.result ?: result
            val errorCode = fallback?.errorCode
                ?: if ((result["warnings"] as? Collection<*>)?.isNotEmpty() == true) "OCR_PARTIAL" else null
            val transition = OcrJobStateMachine.completeStage(job, leaseToken, Instant.now())
            if (transition?.nextStage != OcrJobStage.EXPENSE) return false

            ocrJobRepository.completeOcrStage(
                jobId,
                leaseToken,
                objectMapper.writeValueAsString(effectiveResult),
                transition.nextStage,
                transition.nextStatus,
                errorCode,
                Instant.now()
            ) == 1
        } catch (exception: NoSuchFileException) {
            recordPermanentFailureForLease(
                job,
                jobId,
                leaseToken,
                "OCR_SOURCE_MISSING",
                exception.message ?: "OCR source is not available"
            )
            false
        }
    }

    private fun processExpenseStage(jobId: Int, leaseToken: String): Boolean {
        val job = ocrJobRepository.findById(jobId).orElse(null) ?: return false
        val result = parseResult(job.resultJson)
        val amount = decimal(result["amount"])?.coerceAtLeast(BigDecimal.ZERO) ?: BigDecimal.ZERO
        val currency = result["currency"]?.toString()?.uppercase()?.takeIf { it.matches(Regex("[A-Z]{3}")) } ?: "EUR"
        val date = result["date"]?.toString()?.takeIf { isDate(it) } ?: LocalDate.now().toString()
        val taxAmount = decimal(result["tax_amount"])?.coerceAtLeast(BigDecimal.ZERO) ?: BigDecimal.ZERO

        var fxRate = BigDecimal.ONE
        var fxRateManual = false
        var errorCode = job.errorCode?.takeUnless { it == "OCR_PROCESSING_RETRY" }
        if (currency != "EUR") {
            try {
                fxRate = fxService.getRate(currency, date)
            } catch (exception: Exception) {
                fxRateManual = true
                errorCode = "FX_LOOKUP_FAILED"
                log.warn("FX lookup failed for OCR job {}: {}", jobId, exception.message)
            }
        }

        val user = job.user ?: run {
            recordPermanentFailureForLease(
                job,
                jobId,
                leaseToken,
                "OCR_USER_MISSING",
                "Technician is missing for the OCR job"
            )
            return false
        }
        val expenseId = transactionTemplate.execute {
            val current = ocrJobRepository.findById(jobId).orElse(null) ?: return@execute null
            val transition = OcrJobStateMachine.completeStage(current, leaseToken, Instant.now())
            if (transition?.nextStage != OcrJobStage.RECEIPT) return@execute null

            val category = decimal(result["category_id"])?.toInt()?.let { categoryId ->
                categoryRepository.findById(categoryId).orElse(null)?.takeIf { it.isActive }
            }
            val expense = Expense(
                user = user,
                category = category,
                amountOriginal = amount,
                currencyOriginal = currency,
                amountEur = amount.multiply(fxRate).setScale(2, RoundingMode.HALF_UP),
                fxRate = fxRate,
                fxRateManual = fxRateManual,
                taxAmount = taxAmount,
                taxRate = decimal(result["tax_rate"]),
                taxAmountEur = taxAmount.multiply(fxRate).setScale(2, RoundingMode.HALF_UP),
                date = date,
                description = result["description"]?.toString(),
                merchant = result["merchant"]?.toString(),
                rawOcrText = result["raw_text"]?.toString(),
                status = "draft"
            )
            val saved = expenseRepository.saveAndFlush(expense)
            decimal(result["comparison_id"])?.toInt()?.let { comparisonId ->
                ocrComparisonRepository.findById(comparisonId).orElse(null)?.let { comparison ->
                    comparison.expense = saved
                    ocrComparisonRepository.save(comparison)
                }
            }
            val updated = ocrJobRepository.completeExpenseStage(
                jobId,
                leaseToken,
                saved.id!!,
                transition.nextStage,
                transition.nextStatus,
                errorCode,
                Instant.now()
            )
            if (updated != 1) throw LeaseLostException()
            saved.id
        }
        return expenseId != null
    }

    private fun processReceiptStage(jobId: Int, leaseToken: String): Boolean {
        val job = ocrJobRepository.findById(jobId).orElse(null) ?: return false
        val sourcePath = job.sourcePath
        if (sourcePath.isNullOrBlank()) {
            recordPermanentFailureForLease(
                job,
                jobId,
                leaseToken,
                "OCR_SOURCE_MISSING",
                "OCR source is not durably stored"
            )
            return false
        }
        val expenseId = job.expenseId
        if (expenseId == null) {
            recordPermanentFailureForLease(
                job,
                jobId,
                leaseToken,
                "OCR_EXPENSE_MISSING",
                "Draft Expense is missing for the Receipt stage"
            )
            return false
        }
        if (expenseRepository.findById(expenseId).isEmpty) {
            recordPermanentFailureForLease(
                job,
                jobId,
                leaseToken,
                "OCR_EXPENSE_MISSING",
                "Draft Expense is missing for the Receipt stage"
            )
            return false
        }
        val bytes = try {
            storageService.downloadFile(sourcePath)
        } catch (exception: NoSuchFileException) {
            recordPermanentFailureForLease(
                job,
                jobId,
                leaseToken,
                "OCR_SOURCE_MISSING",
                exception.message ?: "OCR source is not available"
            )
            return false
        }
        // A reclaimed worker can overlap a stale worker. Make each staged
        // Receipt path attempt-specific so one worker cannot delete another
        // worker's bytes after losing its lease. Persist the path before
        // writing so recovery can clean it after a process crash.
        val stagedFilename = "${jobId}_${leaseToken}_${File(job.filename).name}".replace(" ", "_")
        val stagingPath = StorageContext.RECEIPT.buildPath(expenseId, stagedFilename)
        if (ocrJobRepository.setReceiptStagingPath(jobId, leaseToken, stagingPath, Instant.now()) != 1) {
            return false
        }
        val receiptPath = try {
            storageService.storeFileAtPath(
                StorageContext.RECEIPT,
                RawUpload(bytes, stagedFilename, job.sourceContentType),
                stagingPath
            )
        } catch (exception: Exception) {
            deleteQuietly(stagingPath)
            throw exception
        }

        try {
            val promotedReceiptId = transactionTemplate.execute {
                val current = ocrJobRepository.findById(jobId).orElse(null)
                    ?: throw LeaseLostException()
                val transition = OcrJobStateMachine.completeStage(current, leaseToken, Instant.now())
                if (transition?.nextStatus != OcrJobStatus.COMPLETED) throw LeaseLostException()

                val expense = expenseRepository.findById(expenseId).orElseThrow()
                val receipt = receiptRepository.saveAndFlush(
                    Receipt(
                        expense = expense,
                        filePath = receiptPath,
                        originalName = job.filename
                    )
                )
                if (ocrJobRepository.completeReceiptStage(
                        jobId,
                        leaseToken,
                        receipt.id!!,
                        transition.nextStatus,
                        Instant.now()
                    ) != 1
                ) {
                    throw LeaseLostException()
                }
                TransactionSynchronizationManager.registerSynchronization(object : TransactionSynchronization {
                    override fun afterCommit() {
                        deleteQuietly(sourcePath)
                    }
                })
                receipt.id
            }
            if (promotedReceiptId == null) throw LeaseLostException()
            return true
        } catch (exception: Exception) {
            deleteQuietly(receiptPath)
            throw exception
        }
    }

    private fun recordFailure(jobId: Int, leaseToken: String, exception: Exception): Boolean {
        val now = Instant.now()
        val job = ocrJobRepository.findById(jobId).orElse(null) ?: return false
        return when (val transition = OcrJobStateMachine.failure(job, leaseToken, now, exception.message)) {
            null -> false
            is OcrJobStateMachine.FailureTransition.Permanent -> {
                failPermanently(job, jobId, leaseToken, transition)
                false
            }

            is OcrJobStateMachine.FailureTransition.Retry -> {
                ocrJobRepository.recordTransientFailure(
                    jobId,
                    leaseToken,
                    transition.nextAttemptAt,
                    transition.errorCode,
                    transition.errorMessage,
                    now
                )
                false
            }
        }
    }

    private data class PhotoOnlyFallback(
        val result: Map<String, Any?>,
        val errorCode: String
    )

    private fun photoOnlyFallback(result: Map<String, Any?>): PhotoOnlyFallback? {
        val confidence = decimal(result["confidence"])
        val warnings = (result["warnings"] as? Collection<*>).orEmpty()
        val confidenceInvalid = result.containsKey("confidence") && confidence == null
        val confidenceMissingWithWarnings = confidence == null && warnings.isNotEmpty()
        val currency = result["currency"]?.toString()?.uppercase()?.trim()
        val currencyInvalid = currency.isNullOrBlank() || !currency.matches(Regex("[A-Z]{3}"))
        val errorCode = when {
            result["provider_error"] != null -> "OCR_PROVIDER_FAILED"
            confidenceInvalid || confidenceMissingWithWarnings ||
                (confidence != null && confidence < PHOTO_ONLY_CONFIDENCE_THRESHOLD) -> "OCR_LOW_CONFIDENCE"
            result["amount"] == null || currencyInvalid -> "OCR_PHOTO_ONLY"
            else -> null
        } ?: return null

        return PhotoOnlyFallback(
            result = photoOnlyResult(
                original = result,
                errorCode = errorCode,
                detail = result["provider_error"]?.toString()
                    ?: "OCR could not reliably extract receipt details"
            ),
            errorCode = errorCode
        )
    }

    private fun photoOnlyResult(
        original: Map<String, Any?>,
        errorCode: String,
        detail: String?
    ): Map<String, Any?> {
        val existingWarnings = (original["warnings"] as? Collection<*>)
            ?.mapNotNull { it?.toString() }
            .orEmpty()
        val message = detail ?: "OCR could not reliably extract receipt details"
        return mapOf(
            "amount" to null,
            "currency" to null,
            "tax_amount" to null,
            "tax_rate" to null,
            "date" to null,
            "merchant" to null,
            "category_id" to null,
            "description" to null,
            "raw_text" to (original["raw_text"]?.toString() ?: ""),
            "confidence" to 0.0,
            "warnings" to (existingWarnings + message).distinct(),
            "provider_error" to detail,
            "error_code" to errorCode,
            "fallback" to "photo_only",
            "fallback_reason" to errorCode,
            "comparison_id" to original["comparison_id"]
        )
    }

    private fun cleanupReclaimedReceipt(previousJob: OcrJob, newLeaseToken: String): Boolean {
        val stagingPath = previousJob.receiptStagingPath ?: return true
        if (!deleteQuietly(stagingPath)) return false
        val jobId = previousJob.id ?: return false
        return ocrJobRepository.clearReceiptStagingPath(jobId, newLeaseToken, Instant.now()) == 1
    }

    private fun expireDueJobs(now: Instant, batchSize: Int) {
        ocrJobRepository.findRetentionExpiredJobIds(now, batchSize)
            .forEach { expireJob(it, now) }
    }

    private fun expireJob(jobId: Int, now: Instant): Boolean {
        var sourcePath: String? = null
        val receiptPaths = mutableListOf<String>()
        return transactionTemplate.execute {
            val job = ocrJobRepository.findById(jobId).orElse(null) ?: return@execute false
            if (job.expiresAt == null || job.expiresAt!!.isAfter(now)) return@execute false

            sourcePath = job.sourcePath?.takeIf { it.isNotBlank() }
                ?: if (job.status == OcrJobStatus.PAUSED) probableSourcePath(job) else null
            if (ocrJobRepository.expireIfDue(jobId, now) != 1) return@execute false
            deleteDraftArtifacts(job, receiptPaths)
            registerCleanup(sourcePath, receiptPaths)
            true
        } ?: false
    }

    private fun quarantineStalePausedJobs(now: Instant, batchSize: Int) {
        val cutoff = now.minus(PAUSED_RECOVERY_GRACE)
        ocrJobRepository.findStalePausedJobIds(cutoff, batchSize)
            .forEach { quarantinePausedJob(it, cutoff, now) }
    }

    private fun quarantinePausedJob(jobId: Int, cutoff: Instant, now: Instant): Boolean {
        var orphanPath: String? = null
        return transactionTemplate.execute {
            val job = ocrJobRepository.findById(jobId).orElse(null) ?: return@execute false
            if (job.status != OcrJobStatus.PAUSED || !job.sourcePath.isNullOrBlank() ||
                job.updatedAt.isAfter(cutoff)
            ) {
                return@execute false
            }

            orphanPath = probableSourcePath(job)
            if (ocrJobRepository.markPausedUnrecoverable(jobId, cutoff, now) != 1) return@execute false
            registerCleanup(orphanPath, emptyList())
            true
        } ?: false
    }

    private fun deleteDraftArtifacts(job: OcrJob, receiptPaths: MutableList<String>) {
        job.receiptStagingPath?.let { stagingPath ->
            if (stagingPath !in receiptPaths) receiptPaths += stagingPath
        }
        job.expenseId?.let { expenseId ->
            val expense = expenseRepository.findById(expenseId).orElse(null)
            if (expense != null && expense.status == "draft" && expense.report == null) {
                val receipts = expense.receipts.toList()
                receiptPaths += receipts.map { it.filePath }
                receiptRepository.deleteAll(receipts)
                expenseRepository.delete(expense)
            }
        }
    }

    private fun registerCleanup(sourcePath: String?, receiptPaths: List<String>) {
        val paths = (listOfNotNull(sourcePath) + receiptPaths).distinct()
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(object : TransactionSynchronization {
                override fun afterCommit() {
                    paths.forEach { deleteQuietly(it) }
                }
            })
        } else {
            paths.forEach { deleteQuietly(it) }
        }
    }

    private fun probableSourcePath(job: OcrJob): String =
        StorageContext.OCR_SOURCE.buildPath(
            job.id!!,
            File(job.filename).name.replace(" ", "_")
        )

    private fun recordPermanentFailureForLease(
        job: OcrJob,
        jobId: Int,
        leaseToken: String,
        errorCode: String,
        errorMessage: String
    ): Boolean {
        val now = Instant.now()
        val transition = OcrJobStateMachine.permanentFailure(
            job,
            leaseToken,
            now,
            errorCode,
            errorMessage
        ) ?: return false
        return failPermanently(job, jobId, leaseToken, transition)
    }

    private fun failPermanently(
        job: OcrJob,
        jobId: Int,
        leaseToken: String,
        transition: OcrJobStateMachine.FailureTransition.Permanent
    ): Boolean {
        var sourcePath: String? = null
        val receiptPaths = mutableListOf<String>()
        return transactionTemplate.execute {
            if (ocrJobRepository.recordPermanentFailure(
                    jobId,
                    leaseToken,
                    transition.errorCode,
                    transition.errorMessage,
                    Instant.now()
                ) != 1
            ) {
                return@execute false
            }

            val current = ocrJobRepository.findById(jobId).orElse(job)
            sourcePath = current.sourcePath
            current.receiptStagingPath?.let { stagingPath -> receiptPaths += stagingPath }
            // A terminal processing failure must not delete a draft that a
            // Technician may already be editing; expiry and explicit cancel
            // own destructive draft cleanup.
            registerCleanup(sourcePath, receiptPaths)
            true
        } ?: false
    }

    private fun parseResult(resultJson: String?): Map<String, Any?> =
        if (resultJson.isNullOrBlank()) emptyMap()
        else objectMapper.readValue(resultJson, Map::class.java).entries.associate { it.key.toString() to it.value }

    private fun decimal(value: Any?): BigDecimal? = when (value) {
        null -> null
        is BigDecimal -> value
        is Number -> BigDecimal(value.toString())
        else -> value.toString().toBigDecimalOrNull()
    }

    private fun isDate(value: String): Boolean = runCatching { LocalDate.parse(value) }.isSuccess

    private fun deleteQuietly(path: String): Boolean =
        runCatching {
            storageService.deleteFile(path)
            true
        }.getOrElse {
            log.warn("Failed to delete staged OCR file {}: {}", path, it.message)
            false
        }

    private class LeaseLostException : IllegalStateException("OCR lease was lost")

    companion object {
        private val LEASE_DURATION = Duration.ofMinutes(5)
        private val PHOTO_ONLY_CONFIDENCE_THRESHOLD = BigDecimal("0.5")
        // Source persistence is synchronous and may include a remote upload of
        // a 10 MiB file; do not quarantine a slow request after only a few minutes.
        private val PAUSED_RECOVERY_GRACE = Duration.ofMinutes(15)
    }
}
