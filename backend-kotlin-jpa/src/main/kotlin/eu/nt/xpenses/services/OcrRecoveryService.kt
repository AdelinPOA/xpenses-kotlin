package eu.nt.xpenses.services

import tools.jackson.databind.ObjectMapper
import eu.nt.xpenses.dto.ocr.OcrJobRecoveryOut
import eu.nt.xpenses.dto.ocr.OcrManualCompletionRequest
import eu.nt.xpenses.dto.ocr.OcrManualExpenseValues
import eu.nt.xpenses.model.OcrJob
import eu.nt.xpenses.model.OcrJobActionOperation
import eu.nt.xpenses.model.OcrJobStatus
import eu.nt.xpenses.model.User
import eu.nt.xpenses.repositories.CategoryRepository
import eu.nt.xpenses.repositories.ExpenseRepository
import eu.nt.xpenses.repositories.OcrJobActionOperationRepository
import eu.nt.xpenses.repositories.OcrJobRepository
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.data.domain.PageRequest
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.support.TransactionSynchronization
import org.springframework.transaction.support.TransactionSynchronizationManager
import org.springframework.web.server.ResponseStatusException
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.util.concurrent.RejectedExecutionException

@Service
class OcrRecoveryService @Autowired constructor(
    private val ocrJobRepository: OcrJobRepository,
    private val categoryRepository: CategoryRepository,
    private val actionRepository: OcrJobActionOperationRepository,
    private val ocrJobPipeline: OcrJobPipeline,
    private val objectMapper: ObjectMapper,
    private val expenseRepository: ExpenseRepository? = null
) {
    constructor(
        ocrJobRepository: OcrJobRepository,
        categoryRepository: CategoryRepository,
        actionRepository: OcrJobActionOperationRepository,
        ocrJobPipeline: OcrJobPipeline,
        objectMapper: ObjectMapper
    ) : this(ocrJobRepository, categoryRepository, actionRepository, ocrJobPipeline, objectMapper, null)
    private val log = LoggerFactory.getLogger(OcrRecoveryService::class.java)

    @Transactional(readOnly = true)
    fun listJobs(userId: Int, limit: Int): List<OcrJobRecoveryOut> =
        ocrJobRepository.findAllByUser_IdOrderByCreatedAtDesc(userId, PageRequest.of(0, limit))
            .map(::toRecoveryOut)

    @Transactional(readOnly = true)
    fun getJob(jobId: Int, currentUser: User): OcrJobRecoveryOut {
        val job = ocrJobRepository.findById(jobId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Job not found")
        }
        requireOwner(job, currentUser)
        return toRecoveryOut(job)
    }

    @Transactional
    fun retry(
        jobId: Int,
        currentUser: User,
        requestKey: String,
        requestHash: String
    ): OcrJobRecoveryOut {
        val userId = requireUserId(currentUser)
        val job = findForOwnerUpdate(jobId, currentUser)
        replayIfPresent(job, userId, ACTION_RETRY, requestKey, requestHash)?.let { replay ->
            if (job.status == OcrJobStatus.PENDING) dispatchAfterCommit(job.id!!)
            return replay
        }
        requireRecoverableSource(job)
        if (job.status != OcrJobStatus.PERMANENT_FAILURE) {
            throw ResponseStatusException(HttpStatus.CONFLICT, "Only a permanently failed OCR job can be retried")
        }

        val now = Instant.now()
        job.status = OcrJobStatus.PENDING
        job.attemptCount = 0
        job.errorCode = null
        job.errorMessage = null
        job.leaseToken = null
        job.leaseUntil = null
        job.nextAttemptAt = null
        job.updatedAt = now
        ocrJobRepository.saveAndFlush(job)
        saveAction(job, currentUser, ACTION_RETRY, requestKey, requestHash, now)
        dispatchAfterCommit(requireNotNull(job.id))
        return toRecoveryOut(job)
    }

    @Transactional
    fun completeManually(
        jobId: Int,
        body: OcrManualCompletionRequest,
        currentUser: User,
        requestKey: String,
        requestHash: String
    ): OcrJobRecoveryOut {
        val userId = requireUserId(currentUser)
        val job = findForOwnerUpdate(jobId, currentUser)
        replayIfPresent(job, userId, ACTION_MANUAL, requestKey, requestHash)?.let { replay ->
            if (job.status == OcrJobStatus.PENDING) dispatchAfterCommit(job.id!!)
            return replay
        }
        requireRecoverableSource(job)
        if (job.status != OcrJobStatus.PERMANENT_FAILURE) {
            throw ResponseStatusException(HttpStatus.CONFLICT, "Only a permanently failed OCR job can be completed manually")
        }

        val values = body.values
        val activeExpenseId = job.expenseId?.takeIf { expenseRepository?.existsById(it) ?: true }
        if (activeExpenseId != null) {
            if (values?.hasValues() == true) {
                throw ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "This OCR job already has an Expense; review that Expense instead of creating a replacement"
                )
            }
            if (job.receiptId != null) {
                job.status = OcrJobStatus.COMPLETED
                job.completedAt = Instant.now()
                job.attemptCount = 0
                job.errorCode = null
                job.errorMessage = null
                job.leaseToken = null
                job.leaseUntil = null
                job.nextAttemptAt = null
                job.updatedAt = job.completedAt!!
                ocrJobRepository.saveAndFlush(job)
                saveAction(job, currentUser, ACTION_MANUAL, requestKey, requestHash, job.updatedAt)
                return toRecoveryOut(job)
            }
            job.stage = "RECEIPT"
        } else {
            val manualValues = values
                ?: throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Manual Expense values are required")
            job.expenseId = null
            job.receiptId = null
            job.resultJson = objectMapper.writeValueAsString(toOcrResult(manualValues))
            job.stage = "EXPENSE"
        }

        val now = Instant.now()
        job.status = OcrJobStatus.PENDING
        job.attemptCount = 0
        job.errorCode = null
        job.errorMessage = null
        job.leaseToken = null
        job.leaseUntil = null
        job.nextAttemptAt = null
        job.updatedAt = now
        ocrJobRepository.saveAndFlush(job)
        saveAction(job, currentUser, ACTION_MANUAL, requestKey, requestHash, now)
        dispatchAfterCommit(requireNotNull(job.id))
        return toRecoveryOut(job)
    }

    private fun toOcrResult(values: OcrManualExpenseValues): Map<String, Any?> {
        val amount = values.amount
            ?: throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Manual amount is required")
        val currency = values.currency
            ?: throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Manual currency is required")
        val dateText = values.date
            ?: throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Manual date is required")
        val date = try {
            LocalDate.parse(dateText).toString()
        } catch (_: Exception) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Manual date must use YYYY-MM-DD")
        }
        if (values.fxRate != null && values.fxRateManual == false) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "A supplied FX rate must be marked manual")
        }
        if (values.fxRateManual == true && values.fxRate == null) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "A manual FX rate is required")
        }

        val categoryId = values.categoryId?.let { id ->
            val category = categoryRepository.findById(id).orElseThrow {
                ResponseStatusException(HttpStatus.NOT_FOUND, "Category not found")
            }
            if (!category.isActive) {
                throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Category is deactivated")
            }
            id
        }

        return mapOf(
            "amount" to amount,
            "currency" to currency,
            "date" to date,
            "tax_amount" to (values.taxAmount ?: BigDecimal.ZERO),
            "tax_rate" to values.taxRate,
            "merchant" to values.merchant,
            "description" to values.description,
            "category_id" to categoryId,
            "manual_completion" to true,
            "fx_rate" to values.fxRate,
            "fx_rate_manual" to (values.fxRate != null)
        )
    }

    private fun findForOwnerUpdate(jobId: Int, currentUser: User): OcrJob {
        val job = ocrJobRepository.findByIdForUpdate(jobId)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Job not found")
        requireOwner(job, currentUser)
        return job
    }

    private fun replayIfPresent(
        job: OcrJob,
        userId: Int,
        action: String,
        requestKey: String,
        requestHash: String
    ): OcrJobRecoveryOut? {
        val previous = actionRepository.findByUser_IdAndJob_IdAndActionAndRequestKey(
            userId, requireNotNull(job.id), action, requestKey
        ) ?: return null
        if (previous.requestHash != requestHash) {
            throw ResponseStatusException(HttpStatus.CONFLICT, "Idempotency-Key was already used with different action data")
        }
        return toRecoveryOut(job)
    }

    private fun saveAction(
        job: OcrJob,
        user: User,
        action: String,
        requestKey: String,
        requestHash: String,
        now: Instant
    ) {
        actionRepository.saveAndFlush(
            OcrJobActionOperation(
                user = user,
                job = job,
                action = action,
                requestKey = requestKey,
                requestHash = requestHash,
                createdAt = now
            )
        )
    }

    private fun requireRecoverableSource(job: OcrJob) {
        val sourceIsAvailable = !job.sourcePath.isNullOrBlank() &&
            job.errorCode != "OCR_SOURCE_MISSING" &&
            job.expiresAt?.isAfter(Instant.now()) == true
        if (!sourceIsAvailable) {
            throw ResponseStatusException(HttpStatus.CONFLICT, "OCR source is not available for recovery")
        }
    }

    private fun requireOwner(job: OcrJob, currentUser: User) {
        if (job.user?.id != currentUser.id) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Not your job")
        }
    }

    private fun requireUserId(currentUser: User): Int = currentUser.id
        ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

    private fun dispatchAfterCommit(jobId: Int) {
        val dispatch = {
            try {
                ocrJobPipeline.processOcr(jobId)
            } catch (_: RejectedExecutionException) {
                log.info("OCR executor is full; leaving job {} pending for a later recovery pass", jobId)
            }
        }
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(object : TransactionSynchronization {
                override fun afterCommit() = dispatch()
            })
        } else {
            dispatch()
        }
    }

    private fun toRecoveryOut(job: OcrJob): OcrJobRecoveryOut {
        val now = Instant.now()
        val hasSource = !job.sourcePath.isNullOrBlank() &&
            job.errorCode != "OCR_SOURCE_MISSING" &&
            job.expiresAt?.isAfter(now) == true
        val canRecover = job.status == OcrJobStatus.PERMANENT_FAILURE && hasSource
        val activeExpenseId = job.expenseId?.takeIf { expenseRepository?.existsById(it) ?: true }
        val actions = buildList {
            if (job.status in ACTIVE_STATUSES) add("cancel")
            if (canRecover) {
                add("retry")
                add("complete_manually")
            }
            if (activeExpenseId != null) add("view_expense")
        }

        return OcrJobRecoveryOut(
            jobId = requireNotNull(job.id),
            status = job.status,
            stage = job.stage,
            errorCode = job.errorCode,
            errorMessage = safeErrorMessage(job),
            retryable = canRecover,
            allowedActions = actions,
            expiresAt = job.expiresAt,
            expenseId = activeExpenseId,
            receiptId = if (activeExpenseId != null) job.receiptId else null,
            reportId = job.requestedReportId,
            reportLinkStatus = job.reportLinkStatus
        )
    }

    private fun safeErrorMessage(job: OcrJob): String? = when (job.errorCode) {
        "OCR_PARTIAL" -> "OCR could not identify all receipt fields."
        "OCR_SOURCE_MISSING" -> "The saved receipt source is unavailable."
        "OCR_SOURCE_STORE_FAILED" -> "The receipt could not be saved for OCR."
        "OCR_PROCESSING_RETRY" -> "OCR processing failed and will be retried."
        "OCR_PROCESSING_FAILED" -> "OCR processing failed. You can retry or enter the Expense manually."
        "FX_LOOKUP_FAILED" -> "Exchange-rate lookup failed; review the Expense before confirming."
        "MANUAL_CATEGORY_INVALID" -> "The selected category is no longer available. Choose another category and complete manually."
        else -> if (job.reportLinkStatus == "CONFLICT") {
            "The requested report is no longer attachable; the Expense was saved without it."
        } else {
            null
        }
    }

    private companion object {
        const val ACTION_RETRY = "RETRY"
        const val ACTION_MANUAL = "COMPLETE_MANUALLY"
        val ACTIVE_STATUSES = setOf(OcrJobStatus.PENDING, OcrJobStatus.PROCESSING, OcrJobStatus.RETRY_WAIT)
    }
}
