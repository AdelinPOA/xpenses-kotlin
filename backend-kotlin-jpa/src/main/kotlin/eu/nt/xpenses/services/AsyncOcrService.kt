package eu.nt.xpenses.services

import tools.jackson.databind.ObjectMapper
import eu.nt.xpenses.model.Expense
import eu.nt.xpenses.model.ExpenseVerificationState
import eu.nt.xpenses.model.OcrJob
import eu.nt.xpenses.model.OcrJobStage
import eu.nt.xpenses.model.OcrJobStatus
import eu.nt.xpenses.model.Receipt
import eu.nt.xpenses.model.User
import eu.nt.xpenses.models.RawUpload
import eu.nt.xpenses.repositories.CategoryRepository
import eu.nt.xpenses.repositories.ExpenseRepository
import eu.nt.xpenses.repositories.ExpenseReportRepository
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
import java.math.BigDecimal
import java.math.RoundingMode
import java.nio.file.NoSuchFileException
import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import java.util.concurrent.Executor
import java.util.concurrent.RejectedExecutionException

@Service
class AsyncOcrService(
    private val ocrService: OcrService,
    private val ocrJobRepository: OcrJobRepository,
    private val ocrComparisonRepository: OcrComparisonRepository,
    private val storageService: StorageService,
    private val objectMapper: ObjectMapper,
    private val expenseRepository: ExpenseRepository,
    private val receiptRepository: ReceiptRepository,
    private val categoryRepository: CategoryRepository,
    private val expenseReportRepository: ExpenseReportRepository,
    private val fxService: FxService,
    private val transactionTemplate: TransactionTemplate,
    @Qualifier("ocrTaskExecutor") private val ocrTaskExecutor: Executor
) : OcrJobPipeline {
    private val log = LoggerFactory.getLogger(AsyncOcrService::class.java)

    @Async("ocrTaskExecutor")
    override fun processOcr(jobId: Int) {
        processJob(jobId)
    }

    override fun recover(batchSize: Int): Int {
        val now = Instant.now()
        val ids = (ocrJobRepository.findExpiredJobIds(now, batchSize) +
            ocrJobRepository.findClaimableJobIds(now, batchSize)).distinct().take(batchSize)

        ids.forEach { id ->
            try {
                ocrTaskExecutor.execute { processJob(id) }
            } catch (_: RejectedExecutionException) {
                log.info("OCR executor is full; leaving job {} pending for a later recovery pass", id)
            }
        }
        return ids.size
    }

    override fun cancel(jobId: Int, currentUser: User): Boolean {
        var sourcePath: String? = null
        val receiptPaths = mutableListOf<String>()
        val cancelled = transactionTemplate.execute {
            val initial = ocrJobRepository.findById(jobId).orElse(null) ?: return@execute false
            if (initial.user?.id != currentUser.id) return@execute false
            sourcePath = initial.sourcePath

            if (ocrJobRepository.cancelClaimed(jobId, currentUser.id!!, Instant.now()) != 1) {
                return@execute false
            }

            val job = ocrJobRepository.findById(jobId).orElse(null) ?: return@execute false
            job.expenseId?.let { expenseId ->
                val expense = expenseRepository.findById(expenseId).orElse(null)
                if (expense != null && expense.status == "draft" && expense.report == null) {
                    val receipts = expense.receipts.toList()
                    receiptPaths += receipts.map { it.filePath }
                    receiptRepository.deleteAll(receipts)
                    expenseRepository.delete(expense)
                }
            }

            TransactionSynchronizationManager.registerSynchronization(object : TransactionSynchronization {
                override fun afterCommit() {
                    sourcePath?.let { deleteQuietly(it) }
                    receiptPaths.forEach { deleteQuietly(it) }
                }
            })
            true
        } ?: false
        return cancelled
    }

    private fun processJob(jobId: Int) {
        while (true) {
            val snapshot = ocrJobRepository.findById(jobId).orElse(null) ?: return
            if (snapshot.status in setOf(
                    OcrJobStatus.COMPLETED,
                    OcrJobStatus.CANCELLED,
                    OcrJobStatus.PERMANENT_FAILURE,
                    OcrJobStatus.UNRECOVERABLE,
                    OcrJobStatus.EXPIRED
                )) return

            val leaseToken = UUID.randomUUID().toString()
            val now = Instant.now()
            val leaseUntil = now.plusSeconds(60)
            val claimed = when {
                snapshot.status == OcrJobStatus.PROCESSING &&
                    snapshot.leaseUntil != null && !snapshot.leaseUntil!!.isAfter(now) ->
                    ocrJobRepository.reclaimExpired(
                        jobId, snapshot.stage, leaseToken, leaseUntil, now
                    ) == 1
                snapshot.status == OcrJobStatus.PENDING || snapshot.status == OcrJobStatus.RETRY_WAIT ->
                    ocrJobRepository.claimEligible(
                        jobId, snapshot.stage, leaseToken, leaseUntil, now
                    ) == 1
                else -> false
            }
            if (!claimed) return

            val completed = try {
                when (snapshot.stage) {
                    OcrJobStage.OCR -> processOcrStage(jobId, leaseToken)
                    OcrJobStage.EXPENSE -> processExpenseStage(jobId, leaseToken)
                    OcrJobStage.RECEIPT -> processReceiptStage(jobId, leaseToken)
                    else -> false
                }
            } catch (_: ManualCategoryUnavailableException) {
                ocrJobRepository.recordPermanentFailure(
                    jobId, leaseToken, "MANUAL_CATEGORY_INVALID", "Selected category is unavailable", Instant.now()
                )
                false
            } catch (exception: Exception) {
                recordFailure(jobId, leaseToken, exception)
                false
            }
            if (!completed) return
        }
    }

    private fun processOcrStage(jobId: Int, leaseToken: String): Boolean {
        val job = ocrJobRepository.findById(jobId).orElse(null) ?: return false
        val sourcePath = job.sourcePath
        if (sourcePath.isNullOrBlank()) {
            ocrJobRepository.recordPermanentFailure(
                jobId, leaseToken, "OCR_SOURCE_MISSING", "OCR source is not durably stored", Instant.now()
            )
            return false
        }

        return try {
            val bytes = storageService.downloadFile(sourcePath)
            val result = ocrService.scanReceipt(bytes, job.filename)
            val errorCode = if (result["amount"] == null) "OCR_PARTIAL" else null
            ocrJobRepository.completeOcrStage(
                jobId,
                leaseToken,
                objectMapper.writeValueAsString(result),
                errorCode,
                Instant.now()
            ) == 1
        } catch (exception: NoSuchFileException) {
            ocrJobRepository.recordPermanentFailure(
                jobId, leaseToken, "OCR_SOURCE_MISSING", exception.message, Instant.now()
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
        var errorCode = job.errorCode
        val suppliedFxRate = decimal(result["fx_rate"])?.takeIf { it > BigDecimal.ZERO }
        if (suppliedFxRate != null) {
            fxRate = suppliedFxRate
            fxRateManual = true
        } else if (currency != "EUR") {
            try {
                fxRate = fxService.getRate(currency, date)
            } catch (exception: Exception) {
                fxRateManual = true
                errorCode = "FX_LOOKUP_FAILED"
                log.warn("FX lookup failed for OCR job {}: {}", jobId, exception.message)
            }
        }

        val user = job.user ?: return false
        val expenseId = transactionTemplate.execute {
            val current = ocrJobRepository.findById(jobId).orElse(null) ?: return@execute null
            if (current.status != OcrJobStatus.PROCESSING || current.leaseToken != leaseToken) return@execute null

            val manualCompletion = result["manual_completion"] == true
            val category = decimal(result["category_id"])?.toInt()?.let { categoryId ->
                val found = categoryRepository.findById(categoryId).orElse(null)
                if (manualCompletion && (found == null || !found.isActive)) {
                    throw ManualCategoryUnavailableException()
                }
                found?.takeIf { it.isActive }
            }
            val requestedReportId = current.requestedReportId
            val report = requestedReportId?.let { reportId ->
                expenseReportRepository.findByIdForOcrPromotion(reportId).orElse(null)
                    ?.takeIf { it.user?.id == user.id && it.status == "draft" }
            }
            current.reportLinkStatus = when {
                requestedReportId == null -> "NOT_REQUESTED"
                report != null -> "LINKED"
                else -> "CONFLICT"
            }
            val expense = Expense(
                user = user,
                category = category,
                report = report,
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
                status = "draft",
                verificationState = ExpenseVerificationState.PENDING
            )
            val saved = expenseRepository.saveAndFlush(expense)
            decimal(result["comparison_id"])?.toInt()?.let { comparisonId ->
                ocrComparisonRepository.findById(comparisonId).orElse(null)?.let { comparison ->
                    comparison.expense = saved
                    ocrComparisonRepository.save(comparison)
                }
            }
            val updated = ocrJobRepository.completeExpenseStage(
                jobId, leaseToken, saved.id!!, errorCode, Instant.now()
            )
            if (updated != 1) throw LeaseLostException()
            saved.id
        }
        return expenseId != null
    }

    private fun processReceiptStage(jobId: Int, leaseToken: String): Boolean {
        val job = ocrJobRepository.findById(jobId).orElse(null) ?: return false
        val sourcePath = job.sourcePath ?: return false
        val expenseId = job.expenseId ?: return false
        val bytes = storageService.downloadFile(sourcePath)
        val receiptPath = try {
            storageService.storeFile(
                StorageContext.RECEIPT,
                RawUpload(bytes, job.filename, job.sourceContentType),
                expenseId
            )
        } catch (exception: Exception) {
            throw exception
        }

        try {
            val promotedReceiptId = transactionTemplate.execute {
                val current = ocrJobRepository.findById(jobId).orElse(null)
                    ?: throw LeaseLostException()
                if (current.status != OcrJobStatus.PROCESSING || current.leaseToken != leaseToken) {
                    throw LeaseLostException()
                }
                val expense = expenseRepository.findById(expenseId).orElseThrow()
                val now = Instant.now()
                val receipt = receiptRepository.saveAndFlush(
                    Receipt(
                        expense = expense,
                        filePath = receiptPath,
                        originalName = job.filename
                    )
                )
                if (ocrJobRepository.completeReceiptStage(jobId, leaseToken, receipt.id!!, now) != 1) {
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

    private fun recordFailure(jobId: Int, leaseToken: String, exception: Exception) {
        val now = Instant.now()
        val job = ocrJobRepository.findById(jobId).orElse(null) ?: return
        if (job.attemptCount >= MAX_ATTEMPTS) {
            ocrJobRepository.recordPermanentFailure(
                jobId, leaseToken, "OCR_PROCESSING_FAILED", exception.message, now
            )
        } else {
            ocrJobRepository.recordTransientFailure(
                jobId,
                leaseToken,
                now.plusSeconds(30L * job.attemptCount.coerceAtLeast(1)),
                "OCR_PROCESSING_RETRY",
                exception.message,
                now
            )
        }
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

    private fun deleteQuietly(path: String) {
        runCatching { storageService.deleteFile(path) }
            .onFailure { log.warn("Failed to delete staged OCR file {}: {}", path, it.message) }
    }

    private class LeaseLostException : IllegalStateException("OCR lease was lost")
    private class ManualCategoryUnavailableException : IllegalStateException()

    companion object {
        private const val MAX_ATTEMPTS = 3
    }
}
