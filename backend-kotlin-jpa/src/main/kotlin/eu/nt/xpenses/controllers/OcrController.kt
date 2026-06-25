package eu.nt.xpenses.controllers

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.annotation.JsonProperty
import eu.nt.xpenses.models.OcrComparison
import eu.nt.xpenses.models.OcrJob
import eu.nt.xpenses.models.User
import eu.nt.xpenses.repositories.OcrComparisonRepository
import eu.nt.xpenses.repositories.OcrJobRepository
import eu.nt.xpenses.services.AsyncOcrService
import eu.nt.xpenses.services.OcrService
import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.web.bind.annotation.*
import org.springframework.web.multipart.MultipartFile
import org.springframework.web.server.ResponseStatusException
import java.math.BigDecimal
import java.time.Instant

@RestController
@RequestMapping("/api/ocr")
class OcrController(
    private val ocrService: OcrService,
    private val asyncOcrService: AsyncOcrService,
    private val ocrComparisonRepository: OcrComparisonRepository,
    private val ocrJobRepository: OcrJobRepository,
    private val objectMapper: ObjectMapper
) {

    @PostMapping("/scan")
    fun scanReceipt(
        @RequestParam("file") file: MultipartFile,
        @RequestParam(value = "sync", required = false, defaultValue = "false") sync: Boolean,
        request: HttpServletRequest
    ): ResponseEntity<*> {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

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

        if (sync) {
            val result = ocrService.scanReceipt(file.bytes, filename)
            return ResponseEntity.ok(result)
        }

        // Create OCR Job
        val job = OcrJob(
            user = currentUser,
            filename = filename,
            status = "pending"
        )
        val savedJob = ocrJobRepository.save(job)

        try {
            asyncOcrService.processOcr(savedJob.id!!, file.bytes, filename)
        } catch (e: Exception) {
            // Async dispatch was rejected (e.g. the executor queue is full). Mark the job
            // failed so it doesn't sit in 'pending' forever with clients polling indefinitely.
            savedJob.status = "failed"
            savedJob.errorMessage = "OCR queue is full or rejected"
            ocrJobRepository.save(savedJob)
            return ResponseEntity.status(503).body(mapOf("detail" to "OCR queue is full or rejected"))
        }

        return ResponseEntity.status(HttpStatus.ACCEPTED).body(mapOf(
            "job_id" to savedJob.id,
            "status" to "pending",
            "status_url" to "/ocr/status/${savedJob.id}"
        ))
    }

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
            "status" to job.status
        )

        if (job.status == "completed" && job.resultJson != null) {
            response["result"] = objectMapper.readValue(job.resultJson, Map::class.java)
        } else if (job.status == "failed") {
            response["error"] = job.errorMessage
        }

        return ResponseEntity.ok(response)
    }

    @GetMapping("/comparison")
    @PreAuthorize("hasRole('mod')")
    fun getOcrComparisons(): ResponseEntity<*> {
        val history = ocrComparisonRepository.findAllOrdered().take(100)
        
        var easyocrAmtOk = 0
        var easyocrDateOk = 0
        var easyocrMerchantOk = 0
        var easyocrCatOk = 0

        var geminiAmtOk = 0
        var geminiDateOk = 0
        var geminiMerchantOk = 0
        var geminiCatOk = 0

        var mineruAmtOk = 0
        var mineruDateOk = 0
        var mineruMerchantOk = 0
        var mineruCatOk = 0

        var easyocrCount = 0
        var geminiCount = 0
        var mineruCount = 0

        // Per-field denominators for accurate per-field accuracy calculation
        var easyocrAmtDenom = 0
        var easyocrDateDenom = 0
        var easyocrMerchantDenom = 0
        var easyocrCatDenom = 0
        var geminiAmtDenom = 0
        var geminiDateDenom = 0
        var geminiMerchantDenom = 0
        var geminiCatDenom = 0
        var mineruAmtDenom = 0
        var mineruDateDenom = 0
        var mineruMerchantDenom = 0
        var mineruCatDenom = 0

        val responseHistory = history.map { r ->
            val expense = r.expense
            val hasFinal = expense != null
            val finalAmount = expense?.amountOriginal
            val finalDate = expense?.date
            val finalMerchant = expense?.merchant
            val finalCategoryId = expense?.category?.id

            // Per-field existence checks
            val hasEasyAmount = r.easyocrAmount != null
            val hasEasyDate = r.easyocrDate != null
            val hasEasyMerchant = r.easyocrMerchant != null
            val hasEasyCategory = r.easyocrCategoryId != null
            val hasEasy = hasEasyAmount || hasEasyDate || hasEasyMerchant || hasEasyCategory

            val hasGeminiAmount = r.geminiAmount != null
            val hasGeminiDate = r.geminiDate != null
            val hasGeminiMerchant = r.geminiMerchant != null
            val hasGeminiCategory = r.geminiCategoryId != null
            val hasGemini = hasGeminiAmount || hasGeminiDate || hasGeminiMerchant || hasGeminiCategory

            val hasMineruAmount = r.mineruAmount != null
            val hasMineruDate = r.mineruDate != null
            val hasMineruMerchant = r.mineruMerchant != null
            val hasMineruCategory = r.mineruCategoryId != null
            val hasMineru = hasMineruAmount || hasMineruDate || hasMineruMerchant || hasMineruCategory

            // EasyOCR accuracy
            if (hasEasy && hasFinal) {
                easyocrCount++
                // Per-field: only count if THIS specific field exists
                if (hasEasyAmount && finalAmount != null) {
                    easyocrAmtDenom++
                    if (r.easyocrAmount!!.subtract(finalAmount).abs().compareTo(BigDecimal("0.01")) < 0) easyocrAmtOk++
                }
                if (hasEasyDate && finalDate != null) {
                    easyocrDateDenom++
                    if (r.easyocrDate == finalDate) easyocrDateOk++
                }
                if (hasEasyMerchant) {
                    easyocrMerchantDenom++
                    if (!r.easyocrMerchant.isNullOrEmpty() && !finalMerchant.isNullOrEmpty()) {
                        if (r.easyocrMerchant!!.trim().lowercase() == finalMerchant.trim().lowercase()) easyocrMerchantOk++
                    } else if (r.easyocrMerchant.isNullOrEmpty() && finalMerchant.isNullOrEmpty()) {
                        easyocrMerchantOk++
                    }
                }
                if (hasEasyCategory && finalCategoryId != null) {
                    easyocrCatDenom++
                    if (r.easyocrCategoryId == finalCategoryId) easyocrCatOk++
                }
            }

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

            // MinerU accuracy
            if (hasMineru && hasFinal) {
                mineruCount++
                if (hasMineruAmount && finalAmount != null) {
                    mineruAmtDenom++
                    if (r.mineruAmount!!.subtract(finalAmount).abs().compareTo(BigDecimal("0.01")) < 0) mineruAmtOk++
                }
                if (hasMineruDate && finalDate != null) {
                    mineruDateDenom++
                    if (r.mineruDate == finalDate) mineruDateOk++
                }
                if (hasMineruMerchant) {
                    mineruMerchantDenom++
                    if (!r.mineruMerchant.isNullOrEmpty() && !finalMerchant.isNullOrEmpty()) {
                        if (r.mineruMerchant!!.trim().lowercase() == finalMerchant.trim().lowercase()) mineruMerchantOk++
                    } else if (r.mineruMerchant.isNullOrEmpty() && finalMerchant.isNullOrEmpty()) {
                        mineruMerchantOk++
                    }
                }
                if (hasMineruCategory && finalCategoryId != null) {
                    mineruCatDenom++
                    if (r.mineruCategoryId == finalCategoryId) mineruCatOk++
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
                easyocrAmount = r.easyocrAmount,
                easyocrDate = r.easyocrDate,
                easyocrMerchant = r.easyocrMerchant,
                easyocrCategoryId = r.easyocrCategoryId,
                mineruAmount = r.mineruAmount,
                mineruDate = r.mineruDate,
                mineruMerchant = r.mineruMerchant,
                mineruCategoryId = r.mineruCategoryId,
                easyocrError = r.easyocrError,
                geminiError = r.geminiError,
                mineruError = r.mineruError,
                provider = r.provider,
                finalAmount = finalAmount,
                finalDate = finalDate,
                finalMerchant = finalMerchant,
                finalCategoryId = finalCategoryId
            )
        }

        val stats = mapOf(
            "total_scanned" to history.size,
            "easyocr_amount_accuracy" to if (easyocrAmtDenom > 0) Math.round((easyocrAmtOk.toDouble() / easyocrAmtDenom) * 10000.0) / 100.0 else 0.0,
            "easyocr_date_accuracy" to if (easyocrDateDenom > 0) Math.round((easyocrDateOk.toDouble() / easyocrDateDenom) * 10000.0) / 100.0 else 0.0,
            "easyocr_merchant_accuracy" to if (easyocrMerchantDenom > 0) Math.round((easyocrMerchantOk.toDouble() / easyocrMerchantDenom) * 10000.0) / 100.0 else 0.0,
            "easyocr_category_accuracy" to if (easyocrCatDenom > 0) Math.round((easyocrCatOk.toDouble() / easyocrCatDenom) * 10000.0) / 100.0 else 0.0,
            "gemini_amount_accuracy" to if (geminiAmtDenom > 0) Math.round((geminiAmtOk.toDouble() / geminiAmtDenom) * 10000.0) / 100.0 else 0.0,
            "gemini_date_accuracy" to if (geminiDateDenom > 0) Math.round((geminiDateOk.toDouble() / geminiDateDenom) * 10000.0) / 100.0 else 0.0,
            "gemini_merchant_accuracy" to if (geminiMerchantDenom > 0) Math.round((geminiMerchantOk.toDouble() / geminiMerchantDenom) * 10000.0) / 100.0 else 0.0,
            "gemini_category_accuracy" to if (geminiCatDenom > 0) Math.round((geminiCatOk.toDouble() / geminiCatDenom) * 10000.0) / 100.0 else 0.0,
            "mineru_amount_accuracy" to if (mineruAmtDenom > 0) Math.round((mineruAmtOk.toDouble() / mineruAmtDenom) * 10000.0) / 100.0 else 0.0,
            "mineru_date_accuracy" to if (mineruDateDenom > 0) Math.round((mineruDateOk.toDouble() / mineruDateDenom) * 10000.0) / 100.0 else 0.0,
            "mineru_merchant_accuracy" to if (mineruMerchantDenom > 0) Math.round((mineruMerchantOk.toDouble() / mineruMerchantDenom) * 10000.0) / 100.0 else 0.0,
            "mineru_category_accuracy" to if (mineruCatDenom > 0) Math.round((mineruCatOk.toDouble() / mineruCatDenom) * 10000.0) / 100.0 else 0.0
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
    @JsonProperty("easyocr_amount") val easyocrAmount: BigDecimal?,
    @JsonProperty("easyocr_date") val easyocrDate: String?,
    @JsonProperty("easyocr_merchant") val easyocrMerchant: String?,
    @JsonProperty("easyocr_category_id") val easyocrCategoryId: Int?,
    @JsonProperty("mineru_amount") val mineruAmount: BigDecimal?,
    @JsonProperty("mineru_date") val mineruDate: String?,
    @JsonProperty("mineru_merchant") val mineruMerchant: String?,
    @JsonProperty("mineru_category_id") val mineruCategoryId: Int?,
    @JsonProperty("easyocr_error") val easyocrError: String?,
    @JsonProperty("gemini_error") val geminiError: String?,
    @JsonProperty("mineru_error") val mineruError: String?,
    val provider: String,
    @JsonProperty("final_amount") val finalAmount: BigDecimal?,
    @JsonProperty("final_date") val finalDate: String?,
    @JsonProperty("final_merchant") val finalMerchant: String?,
    @JsonProperty("final_category_id") val finalCategoryId: Int?
)
