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
            return ResponseEntity.status(503).body(mapOf("detail" to "OCR queue is full or rejected"))
        }

        return ResponseEntity.status(HttpStatus.ACCEPTED).body(mapOf(
            "job_id" to savedJob.id,
            "status" to "pending",
            "status_url" to "/api/ocr/status/${savedJob.id}"
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

        val responseHistory = history.map { r ->
            val expense = r.expense
            val hasFinal = expense != null
            val finalAmount = expense?.amountOriginal
            val finalDate = expense?.date
            val finalMerchant = expense?.merchant
            val finalCategoryId = expense?.category?.id

            // EasyOCR accuracy
            val hasEasy = r.easyocrAmount != null || r.easyocrDate != null || r.easyocrMerchant != null || r.easyocrCategoryId != null
            if (hasEasy && hasFinal) {
                easyocrCount++
                if (r.easyocrAmount != null && finalAmount != null) {
                    if (Math.abs(r.easyocrAmount!!.toDouble() - finalAmount) < 0.01) easyocrAmtOk++
                }
                if (r.easyocrDate != null && r.easyocrDate == finalDate) easyocrDateOk++
                if (!r.easyocrMerchant.isNullOrEmpty() && !finalMerchant.isNullOrEmpty()) {
                    if (r.easyocrMerchant!!.trim().lowercase() == finalMerchant.trim().lowercase()) easyocrMerchantOk++
                } else if (r.easyocrMerchant.isNullOrEmpty() && finalMerchant.isNullOrEmpty()) {
                    easyocrMerchantOk++
                }
                if (r.easyocrCategoryId == finalCategoryId) easyocrCatOk++
            }

            // Gemini accuracy
            val hasGemini = r.geminiAmount != null || r.geminiDate != null || r.geminiMerchant != null || r.geminiCategoryId != null
            if (hasGemini && hasFinal) {
                geminiCount++
                if (r.geminiAmount != null && finalAmount != null) {
                    if (Math.abs(r.geminiAmount!!.toDouble() - finalAmount) < 0.01) geminiAmtOk++
                }
                if (r.geminiDate != null && r.geminiDate == finalDate) geminiDateOk++
                if (!r.geminiMerchant.isNullOrEmpty() && !finalMerchant.isNullOrEmpty()) {
                    if (r.geminiMerchant!!.trim().lowercase() == finalMerchant.trim().lowercase()) geminiMerchantOk++
                } else if (r.geminiMerchant.isNullOrEmpty() && finalMerchant.isNullOrEmpty()) {
                    geminiMerchantOk++
                }
                if (r.geminiCategoryId == finalCategoryId) geminiCatOk++
            }

            // MinerU accuracy
            val hasMineru = r.mineruAmount != null || r.mineruDate != null || r.mineruMerchant != null || r.mineruCategoryId != null
            if (hasMineru && hasFinal) {
                mineruCount++
                if (r.mineruAmount != null && finalAmount != null) {
                    if (Math.abs(r.mineruAmount!!.toDouble() - finalAmount) < 0.01) mineruAmtOk++
                }
                if (r.mineruDate != null && r.mineruDate == finalDate) mineruDateOk++
                if (!r.mineruMerchant.isNullOrEmpty() && !finalMerchant.isNullOrEmpty()) {
                    if (r.mineruMerchant!!.trim().lowercase() == finalMerchant.trim().lowercase()) mineruMerchantOk++
                } else if (r.mineruMerchant.isNullOrEmpty() && finalMerchant.isNullOrEmpty()) {
                    mineruMerchantOk++
                }
                if (r.mineruCategoryId == finalCategoryId) mineruCatOk++
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
                provider = r.provider,
                finalAmount = finalAmount,
                finalDate = finalDate,
                finalMerchant = finalMerchant,
                finalCategoryId = finalCategoryId
            )
        }

        val stats = mapOf(
            "total_scanned" to history.size,
            "easyocr_amount_accuracy" to if (easyocrCount > 0) Math.round((easyocrAmtOk.toDouble() / easyocrCount) * 10000.0) / 100.0 else 0.0,
            "easyocr_date_accuracy" to if (easyocrCount > 0) Math.round((easyocrDateOk.toDouble() / easyocrCount) * 10000.0) / 100.0 else 0.0,
            "easyocr_merchant_accuracy" to if (easyocrCount > 0) Math.round((easyocrMerchantOk.toDouble() / easyocrCount) * 10000.0) / 100.0 else 0.0,
            "easyocr_category_accuracy" to if (easyocrCount > 0) Math.round((easyocrCatOk.toDouble() / easyocrCount) * 10000.0) / 100.0 else 0.0,
            "gemini_amount_accuracy" to if (geminiCount > 0) Math.round((geminiAmtOk.toDouble() / geminiCount) * 10000.0) / 100.0 else 0.0,
            "gemini_date_accuracy" to if (geminiCount > 0) Math.round((geminiDateOk.toDouble() / geminiCount) * 10000.0) / 100.0 else 0.0,
            "gemini_merchant_accuracy" to if (geminiCount > 0) Math.round((geminiMerchantOk.toDouble() / geminiCount) * 10000.0) / 100.0 else 0.0,
            "gemini_category_accuracy" to if (geminiCount > 0) Math.round((geminiCatOk.toDouble() / geminiCount) * 10000.0) / 100.0 else 0.0,
            "mineru_amount_accuracy" to if (mineruCount > 0) Math.round((mineruAmtOk.toDouble() / mineruCount) * 10000.0) / 100.0 else 0.0,
            "mineru_date_accuracy" to if (mineruCount > 0) Math.round((mineruDateOk.toDouble() / mineruCount) * 10000.0) / 100.0 else 0.0,
            "mineru_merchant_accuracy" to if (mineruCount > 0) Math.round((mineruMerchantOk.toDouble() / mineruCount) * 10000.0) / 100.0 else 0.0,
            "mineru_category_accuracy" to if (mineruCount > 0) Math.round((mineruCatOk.toDouble() / mineruCount) * 10000.0) / 100.0 else 0.0
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
    val provider: String,
    @JsonProperty("final_amount") val finalAmount: Double?,
    @JsonProperty("final_date") val finalDate: String?,
    @JsonProperty("final_merchant") val finalMerchant: String?,
    @JsonProperty("final_category_id") val finalCategoryId: Int?
)
