package eu.nt.xpenses.controllers

import tools.jackson.databind.ObjectMapper
import com.fasterxml.jackson.annotation.JsonProperty
import eu.nt.xpenses.dto.ocr.OcrJobRecoveryOut
import eu.nt.xpenses.dto.ocr.OcrManualCompletionRequest
import eu.nt.xpenses.model.OcrComparison
import eu.nt.xpenses.model.OcrJob
import eu.nt.xpenses.model.OcrJobStatus
import eu.nt.xpenses.model.User
import eu.nt.xpenses.models.RawUpload
import eu.nt.xpenses.repositories.ExpenseReportRepository
import eu.nt.xpenses.repositories.OcrComparisonRepository
import eu.nt.xpenses.repositories.OcrJobRepository
import eu.nt.xpenses.services.OcrJobPipeline
import eu.nt.xpenses.services.OcrRecoveryService
import eu.nt.xpenses.services.OcrService
import eu.nt.xpenses.services.SaveIdempotencyService
import eu.nt.xpenses.services.StorageContext
import eu.nt.xpenses.services.StorageService
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.Valid
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.web.bind.annotation.*
import org.springframework.web.multipart.MultipartFile
import org.springframework.web.server.ResponseStatusException
import java.math.BigDecimal
import eu.nt.xpenses.security.RateLimitStore
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.security.MessageDigest

@RestController
@RequestMapping("/api/ocr")
class OcrController(
    private val ocrService: OcrService,
    private val ocrJobPipeline: OcrJobPipeline,
    private val ocrComparisonRepository: OcrComparisonRepository,
    private val ocrJobRepository: OcrJobRepository,
    private val storageService: StorageService,
    private val objectMapper: ObjectMapper,
    private val rateLimitStore: RateLimitStore,
    private val expenseReportRepository: ExpenseReportRepository,
    private val idempotency: SaveIdempotencyService,
    private val ocrRecoveryService: OcrRecoveryService
) {

    @PostMapping("/scan")
    fun scanReceipt(
        @RequestParam("file") file: MultipartFile,
        @RequestParam(value = "sync", required = false, defaultValue = "false") sync: Boolean,
        request: HttpServletRequest,
        @RequestParam(value = "report_id", required = false) reportId: Int? = null
    ): ResponseEntity<*> {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")
        val userId = currentUser.id
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")
        val acceptanceKey = idempotency.validateKey(request.getHeader("Idempotency-Key"))

        val filename = file.originalFilename ?: "unknown"
        val ext = filename.substringAfterLast('.', "").lowercase()
        val allowedExtensions = setOf("jpg", "jpeg", "png", "pdf", "webp")
        if (ext !in allowedExtensions) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(mapOf("detail" to "File type not supported for OCR"))
        }
        if (file.size > 10 * 1024 * 1024) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(mapOf("detail" to "File exceeds 10MB limit"))
        }

        val fileBytes = file.bytes
        if (!OcrService.isValidOcrContent(fileBytes)) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(mapOf("detail" to "Unsupported or invalid file format detected via magic bytes"))
        }
        if (sync && (acceptanceKey != null || reportId != null)) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(mapOf("detail" to "Idempotency keys and report context require async OCR"))
        }

        val sourceSha256 = sha256Hex(fileBytes)
        val fingerprint = idempotency.hash(
            mapOf(
                "sha256" to sourceSha256,
                "size_bytes" to fileBytes.size,
                "filename" to filename,
                "content_type" to file.contentType,
                "report_id" to reportId
            )
        )
        if (acceptanceKey != null) {
            val existing = ocrJobRepository.findByUser_IdAndAcceptanceKey(userId, acceptanceKey)
            if (existing != null) {
                return acceptExisting(existing, fingerprint, fileBytes, filename, file.contentType, sourceSha256)
            }
        }

        validateReportContext(currentUser, reportId)

        val userQuotaCount = rateLimitStore.record(
            "rl:ocr_quota:user:$userId", 30, 60_000L, System.currentTimeMillis()
        )
        if (userQuotaCount > 30) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .body(mapOf("detail" to "OCR rate limit exceeded. Please try again later."))
        }

        val config = ocrService.getOcrConfig()
        if (!config.ocrEnabled) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(mapOf("detail" to "OCR is disabled"))
        }
        if (sync) {
            return ResponseEntity.ok(ocrService.scanReceipt(fileBytes, filename))
        }

        val job = OcrJob(
            user = currentUser,
            filename = filename,
            status = OcrJobStatus.PAUSED,
            acceptanceKey = acceptanceKey,
            acceptanceFingerprint = acceptanceKey?.let { fingerprint },
            requestedReportId = reportId,
            reportLinkStatus = if (reportId == null) "NOT_REQUESTED" else "PENDING"
        )
        val savedJob = try {
            ocrJobRepository.save(job)
        } catch (exception: DataIntegrityViolationException) {
            val winner = acceptanceKey?.let { ocrJobRepository.findByUser_IdAndAcceptanceKey(userId, it) }
            if (winner != null) {
                return acceptExisting(winner, fingerprint, fileBytes, filename, file.contentType, sourceSha256)
            }
            throw exception
        }

        return persistSourceAndDispatch(savedJob, fileBytes, filename, file.contentType, sourceSha256)
    }

    private fun validateReportContext(currentUser: User, reportId: Int?) {
        if (reportId == null) return
        val report = expenseReportRepository.findById(reportId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Report not found")
        }
        if (report.user?.id != currentUser.id) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Cannot attach OCR Expense to another user's report")
        }
        if (report.status != "draft") {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Can only capture into a draft report")
        }
    }

    private fun acceptExisting(
        job: OcrJob,
        fingerprint: String,
        fileBytes: ByteArray,
        filename: String,
        contentType: String?,
        sourceSha256: String
    ): ResponseEntity<*> {
        if (job.acceptanceFingerprint != fingerprint) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(mapOf("detail" to "Idempotency-Key was already used with different OCR input"))
        }
        if (job.sourcePath.isNullOrBlank()) {
            return persistSourceAndDispatch(job, fileBytes, filename, contentType, sourceSha256)
        }
        if (job.status == OcrJobStatus.PAUSED) {
            job.status = OcrJobStatus.PENDING
            ocrJobRepository.saveAndFlush(job)
        }
        if (job.status == OcrJobStatus.PENDING) dispatch(job.id!!)
        return acceptedJob(job)
    }

    private fun persistSourceAndDispatch(
        job: OcrJob,
        fileBytes: ByteArray,
        filename: String,
        contentType: String?,
        sourceSha256: String
    ): ResponseEntity<*> {
        var sourcePath: String? = null
        try {
            val jobId = requireNotNull(job.id) { "OCR job id must be persisted before source storage" }
            sourcePath = storageService.storeFile(
                StorageContext.OCR_SOURCE,
                RawUpload(fileBytes, filename, contentType),
                jobId
            )
            job.sourcePath = sourcePath
            job.sourceContentType = contentType
            job.sourceSizeBytes = fileBytes.size.toLong()
            job.sourceSha256 = sourceSha256
            job.expiresAt = Instant.now().plus(30, ChronoUnit.DAYS)
            job.status = OcrJobStatus.PENDING
            job.errorCode = null
            job.errorMessage = null
            ocrJobRepository.saveAndFlush(job)
        } catch (exception: Exception) {
            sourcePath?.let { runCatching { storageService.deleteFile(it) } }
            job.sourcePath = null
            job.status = OcrJobStatus.PERMANENT_FAILURE
            job.errorCode = "OCR_SOURCE_STORE_FAILED"
            job.errorMessage = "OCR source could not be durably stored"
            ocrJobRepository.save(job)
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(mapOf("detail" to "OCR source could not be stored"))
        }

        dispatch(requireNotNull(job.id))
        return acceptedJob(job)
    }

    private fun dispatch(jobId: Int) {
        try {
            ocrJobPipeline.processOcr(jobId)
        } catch (_: java.util.concurrent.RejectedExecutionException) {
            // The durable job remains PENDING; the scheduled recovery worker will retry it.
        }
    }

    private fun acceptedJob(job: OcrJob): ResponseEntity<*> = ResponseEntity.status(HttpStatus.ACCEPTED).body(
        mapOf(
            "job_id" to job.id,
            "status" to when (job.status) {
                OcrJobStatus.COMPLETED -> "completed"
                OcrJobStatus.PERMANENT_FAILURE, OcrJobStatus.UNRECOVERABLE,
                OcrJobStatus.CANCELLED, OcrJobStatus.EXPIRED -> "failed"
                else -> job.status.lowercase()
            },
            "status_url" to "/ocr/status/${job.id}"
        )
    )

    private fun sha256Hex(bytes: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(bytes)
            .joinToString("") { "%02x".format(it.toInt() and 0xff) }

    @GetMapping("/status/{jobId}")
    fun getJobStatus(
        @PathVariable jobId: Int,
        request: HttpServletRequest
    ): ResponseEntity<*> {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        val job = ocrJobRepository.findById(jobId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Job not found")
        }

        if (job.user?.id != currentUser.id) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Not your job")
        }

        val response = mutableMapOf<String, Any?>(
            "job_id" to job.id,
            // Keep the polling response compatible with the current capture flow;
            // the recovery API will expose the canonical persisted vocabulary.
            "status" to when (job.status) {
                OcrJobStatus.COMPLETED -> "completed"
                OcrJobStatus.PERMANENT_FAILURE, OcrJobStatus.UNRECOVERABLE,
                OcrJobStatus.CANCELLED, OcrJobStatus.EXPIRED -> "failed"
                else -> job.status.lowercase()
            },
            "stage" to job.stage,
            "expense_id" to job.expenseId,
            "receipt_id" to job.receiptId,
            "error_code" to job.errorCode
        )

        if (job.status == OcrJobStatus.COMPLETED && job.resultJson != null) {
            response["result"] = objectMapper.readValue(job.resultJson, Map::class.java)
        } else if (job.status in setOf(
                OcrJobStatus.PERMANENT_FAILURE, OcrJobStatus.UNRECOVERABLE,
                OcrJobStatus.CANCELLED, OcrJobStatus.EXPIRED
            )) {
            response["error"] = job.unrecoverableReason ?: job.errorMessage ?: job.status
        }

        return ResponseEntity.ok(response)
    }

    @GetMapping("/jobs")
    fun listRecoverableJobs(
        @RequestParam(value = "limit", required = false, defaultValue = "50") limit: Int,
        request: HttpServletRequest
    ): List<OcrJobRecoveryOut> {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")
        val userId = currentUser.id
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")
        if (limit !in 1..100) throw ResponseStatusException(HttpStatus.BAD_REQUEST, "limit must be between 1 and 100")
        return ocrRecoveryService.listJobs(userId, limit)
    }

    @GetMapping("/jobs/{jobId}")
    fun getRecoverableJob(
        @PathVariable jobId: Int,
        request: HttpServletRequest
    ): OcrJobRecoveryOut {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")
        return ocrRecoveryService.getJob(jobId, currentUser)
    }

    @PostMapping("/jobs/{jobId}/retry")
    fun retryJob(
        @PathVariable jobId: Int,
        request: HttpServletRequest
    ): ResponseEntity<OcrJobRecoveryOut> {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")
        val requestKey = requiredActionKey(request)
        val requestHash = idempotency.hash(mapOf("job_id" to jobId, "action" to "retry"))
        return ResponseEntity.status(HttpStatus.ACCEPTED)
            .body(ocrRecoveryService.retry(jobId, currentUser, requestKey, requestHash))
    }

    @PostMapping("/jobs/{jobId}/complete-manually")
    fun completeJobManually(
        @PathVariable jobId: Int,
        @Valid @RequestBody body: OcrManualCompletionRequest,
        request: HttpServletRequest
    ): ResponseEntity<OcrJobRecoveryOut> {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")
        val requestKey = requiredActionKey(request)
        val requestHash = idempotency.hash(mapOf("job_id" to jobId, "action" to "complete_manually", "body" to body))
        return ResponseEntity.status(HttpStatus.ACCEPTED)
            .body(ocrRecoveryService.completeManually(jobId, body, currentUser, requestKey, requestHash))
    }

    private fun requiredActionKey(request: HttpServletRequest): String =
        idempotency.validateKey(request.getHeader("Idempotency-Key"))
            ?: throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Idempotency-Key is required")

    @DeleteMapping("/jobs/{jobId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun cancelJob(
        @PathVariable jobId: Int,
        request: HttpServletRequest
    ) {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")
        if (!ocrJobPipeline.cancel(jobId, currentUser)) {
            throw ResponseStatusException(HttpStatus.CONFLICT, "OCR job cannot be cancelled")
        }
    }

    @GetMapping("/comparison")
    @PreAuthorize("hasRole('mod')")
    fun getOcrComparisons(): ResponseEntity<*> {
        val history = ocrComparisonRepository.findAllOrdered().take(100)

        var geminiAmtOk = 0
        var geminiDateOk = 0
        var geminiMerchantOk = 0
        var geminiCatOk = 0

        var geminiCount = 0

        // Per-field denominators for accurate per-field accuracy calculation
        var geminiAmtDenom = 0
        var geminiDateDenom = 0
        var geminiMerchantDenom = 0
        var geminiCatDenom = 0

        val responseHistory = history.map { r ->
            val expense = r.expense
            val hasFinal = expense != null
            val finalAmount = expense?.amountOriginal
            val finalDate = expense?.date
            val finalMerchant = expense?.merchant
            val finalCategoryId = expense?.category?.id

            // Per-field existence checks
            val hasGeminiAmount = r.geminiAmount != null
            val hasGeminiDate = r.geminiDate != null
            val hasGeminiMerchant = r.geminiMerchant != null
            val hasGeminiCategory = r.geminiCategoryId != null
            val hasGemini = hasGeminiAmount || hasGeminiDate || hasGeminiMerchant || hasGeminiCategory

            // Gemini accuracy
            if (hasGemini && hasFinal) {
                geminiCount++
                if (hasGeminiAmount && finalAmount != null) {
                    geminiAmtDenom++
                    if (r.geminiAmount!!.subtract(finalAmount).abs().compareTo(BigDecimal("0.01")) < 0) geminiAmtOk++
                }
                if (hasGeminiDate && finalDate != null) {
                    geminiDateDenom++
                    if (r.geminiDate == finalDate) geminiDateOk++
                }
                if (hasGeminiMerchant) {
                    geminiMerchantDenom++
                    if (!r.geminiMerchant.isNullOrEmpty() && !finalMerchant.isNullOrEmpty()) {
                        if (r.geminiMerchant!!.trim().lowercase() == finalMerchant.trim().lowercase()) geminiMerchantOk++
                    } else if (r.geminiMerchant.isNullOrEmpty() && finalMerchant.isNullOrEmpty()) {
                        geminiMerchantOk++
                    }
                }
                if (hasGeminiCategory && finalCategoryId != null) {
                    geminiCatDenom++
                    if (r.geminiCategoryId == finalCategoryId) geminiCatOk++
                }
            }

            OcrComparisonRow(
                id = r.id!!,
                receiptFilename = r.receiptFilename,
                createdAt = r.createdAt,
                geminiAmount = r.geminiAmount,
                geminiDate = r.geminiDate,
                geminiMerchant = r.geminiMerchant,
                geminiCategoryId = r.geminiCategoryId,
                geminiError = r.geminiError,
                provider = r.provider,
                finalAmount = finalAmount,
                finalDate = finalDate,
                finalMerchant = finalMerchant,
                finalCategoryId = finalCategoryId
            )
        }

        val stats = mapOf(
            "total_scanned" to history.size,
            "gemini_amount_accuracy" to if (geminiAmtDenom > 0) Math.round((geminiAmtOk.toDouble() / geminiAmtDenom) * 10000.0) / 100.0 else 0.0,
            "gemini_date_accuracy" to if (geminiDateDenom > 0) Math.round((geminiDateOk.toDouble() / geminiDateDenom) * 10000.0) / 100.0 else 0.0,
            "gemini_merchant_accuracy" to if (geminiMerchantDenom > 0) Math.round((geminiMerchantOk.toDouble() / geminiMerchantDenom) * 10000.0) / 100.0 else 0.0,
            "gemini_category_accuracy" to if (geminiCatDenom > 0) Math.round((geminiCatOk.toDouble() / geminiCatDenom) * 10000.0) / 100.0 else 0.0
        )

        return ResponseEntity.ok(mapOf(
            "stats" to stats,
            "history" to responseHistory
        ))
    }
}

data class OcrComparisonRow(
    val id: Int,
    @JsonProperty("receipt_filename") val receiptFilename: String?,
    @JsonProperty("created_at") val createdAt: Instant,
    @JsonProperty("gemini_amount") val geminiAmount: BigDecimal?,
    @JsonProperty("gemini_date") val geminiDate: String?,
    @JsonProperty("gemini_merchant") val geminiMerchant: String?,
    @JsonProperty("gemini_category_id") val geminiCategoryId: Int?,
    @JsonProperty("gemini_error") val geminiError: String?,
    val provider: String,
    @JsonProperty("final_amount") val finalAmount: BigDecimal?,
    @JsonProperty("final_date") val finalDate: String?,
    @JsonProperty("final_merchant") val finalMerchant: String?,
    @JsonProperty("final_category_id") val finalCategoryId: Int?
)
