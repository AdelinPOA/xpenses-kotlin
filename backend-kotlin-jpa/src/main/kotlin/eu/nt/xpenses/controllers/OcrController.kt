package eu.nt.xpenses.controllers

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.annotation.JsonProperty
import eu.nt.xpenses.model.OcrComparison
import eu.nt.xpenses.model.OcrJob
import eu.nt.xpenses.model.OcrJobStatus
import eu.nt.xpenses.model.User
import eu.nt.xpenses.models.RawUpload
import eu.nt.xpenses.repositories.OcrComparisonRepository
import eu.nt.xpenses.repositories.OcrJobRepository
import eu.nt.xpenses.services.OcrJobPipeline
import eu.nt.xpenses.services.OcrService
import eu.nt.xpenses.services.StorageContext
import eu.nt.xpenses.services.StorageService
import jakarta.servlet.http.HttpServletRequest
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
    private val rateLimitStore: RateLimitStore
) {

    @PostMapping("/scan")
    fun scanReceipt(
        @RequestParam("file") file: MultipartFile,
        @RequestParam(value = "sync", required = false, defaultValue = "false") sync: Boolean,
        request: HttpServletRequest
    ): ResponseEntity<*> {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        val userQuotaCount = rateLimitStore.record(
            "rl:ocr_quota:user:${currentUser.id}", 30, 60_000L, System.currentTimeMillis()
        )
        if (userQuotaCount > 30) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .body(mapOf("detail" to "OCR rate limit exceeded. Please try again later."))
        }

        val config = ocrService.getOcrConfig()
        if (!config.ocrEnabled) {
            return ResponseEntity.status(503).body(mapOf("detail" to "OCR is disabled"))
        }

        val filename = file.originalFilename ?: "unknown"
        val ext = filename.substringAfterLast('.', "").lowercase()
        val allowedExtensions = setOf("jpg", "jpeg", "png", "pdf", "webp")
        if (ext !in allowedExtensions) {
            return ResponseEntity.status(400).body(mapOf("detail" to "File type not supported for OCR"))
        }

        if (file.size > 10 * 1024 * 1024) {
            return ResponseEntity.status(400).body(mapOf("detail" to "File exceeds 10MB limit"))
        }

        val fileBytes = file.bytes
        if (!OcrService.isValidOcrContent(fileBytes)) {
            return ResponseEntity.status(400).body(mapOf("detail" to "Unsupported or invalid file format detected via magic bytes"))
        }

        if (sync) {
            val result = ocrService.scanReceipt(fileBytes, filename)
            return ResponseEntity.ok(result)
        }

        // Create OCR Job
        val job = OcrJob(
            user = currentUser,
            filename = filename,
            // Keep the job invisible to recovery until the OCR source is durable.
            status = OcrJobStatus.PAUSED
        )
        val savedJob = ocrJobRepository.save(job)
        val jobId = savedJob.id!!
        var sourcePath: String? = null

        try {
            sourcePath = storageService.storeFile(
                StorageContext.OCR_SOURCE,
                RawUpload(fileBytes, filename, file.contentType),
                jobId
            )
            savedJob.sourcePath = sourcePath
            savedJob.sourceContentType = file.contentType
            savedJob.sourceSizeBytes = fileBytes.size.toLong()
            savedJob.sourceSha256 = sha256Hex(fileBytes)
            savedJob.expiresAt = Instant.now().plus(30, ChronoUnit.DAYS)
            savedJob.status = OcrJobStatus.PENDING
            ocrJobRepository.saveAndFlush(savedJob)
        } catch (e: Exception) {
            if (sourcePath != null) {
                runCatching { storageService.deleteFile(sourcePath) }
            }
            savedJob.status = OcrJobStatus.PERMANENT_FAILURE
            savedJob.errorCode = "OCR_SOURCE_STORE_FAILED"
            savedJob.errorMessage = "OCR source could not be durably stored"
            ocrJobRepository.save(savedJob)
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(mapOf("detail" to "OCR source could not be stored"))
        }

        try {
            ocrJobPipeline.processOcr(jobId)
        } catch (e: java.util.concurrent.RejectedExecutionException) {
            // The durable job remains PENDING; the scheduled recovery worker will retry it.
            return ResponseEntity.status(HttpStatus.ACCEPTED).body(mapOf(
                "job_id" to savedJob.id,
                "status" to "pending",
                "status_url" to "/ocr/status/${savedJob.id}"
            ))
        }

        return ResponseEntity.status(HttpStatus.ACCEPTED).body(mapOf(
            "job_id" to savedJob.id,
            "status" to "pending",
            "status_url" to "/ocr/status/${savedJob.id}"
        ))
    }

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
                OcrJobStatus.PERMANENT_FAILURE, OcrJobStatus.UNRECOVERABLE -> "failed"
                else -> job.status.lowercase()
            },
            "stage" to job.stage,
            "expense_id" to job.expenseId,
            "receipt_id" to job.receiptId,
            "error_code" to job.errorCode
        )

        if (job.status == OcrJobStatus.COMPLETED && job.resultJson != null) {
            response["result"] = objectMapper.readValue(job.resultJson, Map::class.java)
        } else if (job.status == OcrJobStatus.PERMANENT_FAILURE || job.status == OcrJobStatus.UNRECOVERABLE) {
            response["error"] = job.errorMessage ?: job.unrecoverableReason
        }

        return ResponseEntity.ok(response)
    }

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
