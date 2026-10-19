package eu.nt.xpenses.controllers

import eu.nt.xpenses.dto.expense.BulkUploadError
import eu.nt.xpenses.dto.expense.BulkUploadResult
import eu.nt.xpenses.dto.expense.ExpenseCreate
import eu.nt.xpenses.dto.expense.ExpenseOut
import eu.nt.xpenses.model.User
import eu.nt.xpenses.security.RateLimitStore
import eu.nt.xpenses.services.ExpenseService
import eu.nt.xpenses.services.IdempotentExpenseSaving
import eu.nt.xpenses.services.OcrService
import eu.nt.xpenses.services.SaveIdempotencyService
import jakarta.servlet.http.HttpServletRequest
import org.slf4j.LoggerFactory
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.multipart.MultipartFile
import org.springframework.web.server.ResponseStatusException
import java.math.BigDecimal
import java.time.LocalDate

@RestController
@RequestMapping("/api/expenses")
class BulkExpenseController(
    private val expenseService: ExpenseService,
    private val ocrService: OcrService,
    private val rateLimitStore: RateLimitStore,
    private val saving: IdempotentExpenseSaving,
    private val idempotency: SaveIdempotencyService,
) {
    private val log = LoggerFactory.getLogger(javaClass)
    private val currencyRegex = Regex("^[A-Z]{3}$")
    private val allowedExtensions = setOf("jpg", "jpeg", "png", "pdf", "webp")

    @PostMapping("/bulk-upload")
    fun bulkUploadExpenses(
        @RequestParam("files") files: List<MultipartFile>,
        request: HttpServletRequest,
    ): ResponseEntity<BulkUploadResult> {
        val currentUser =
            request.getAttribute("currentUser") as? User
                ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")
        val key = idempotency.validateKey(request.getHeader("Idempotency-Key"))
        // Reserve room for the public known-ID retry suffix :receipt:<index>.
        if (key != null && key.length > 200) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Bulk Idempotency-Key must not exceed 200 characters")
        }

        if (files.size > 20) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Maximum 20 files per bulk upload")
        }

        val userQuotaCount =
            rateLimitStore.record(
                "rl:ocr_quota:user:${currentUser.id}",
                30,
                60_000L,
                System.currentTimeMillis(),
            )
        if (userQuotaCount > 30) {
            throw ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "OCR rate limit exceeded. Please try again later.")
        }
        val sources = if (key != null) saving.manifest(files) else null
        if (key != null && sources != null) saving.bindManifest(currentUser, "bulk-manifest", key, sources)

        val created = mutableListOf<ExpenseOut>()
        val errors = mutableListOf<BulkUploadError>()
        val today = LocalDate.now().toString()

        for ((index, file) in files.withIndex()) {
            val filename = file.originalFilename ?: "receipt"
            val ext = filename.substringAfterLast('.', "").lowercase()
            if (ext !in allowedExtensions) {
                errors.add(BulkUploadError(filename, "File type not supported for OCR", fileIndex = index))
                continue
            }
            if (file.size > 10 * 1024 * 1024) {
                errors.add(BulkUploadError(filename, "File exceeds 10MB limit", fileIndex = index))
                continue
            }
            val fileBytes = file.bytes
            if (!OcrService.isValidOcrContent(fileBytes)) {
                errors.add(BulkUploadError(filename, "Unsupported or invalid file format detected via magic bytes", fileIndex = index))
                continue
            }

            val expenseOut =
                try {
                    saving.bulkCreate(index, sources?.get(index) ?: saving.manifest(listOf(file)).single(), currentUser, key) {
                        val ocrResult: Map<String, Any?> =
                            try {
                                ocrService.scanReceipt(fileBytes, filename)
                            } catch (e: Exception) {
                                log.warn("OCR failed for $filename: ${e.message}")
                                emptyMap()
                            }
                        val amount =
                            (ocrResult["amount"] as? Number)
                                ?.let { BigDecimal.valueOf(it.toDouble()) } ?: BigDecimal.ZERO
                        val currency =
                            (ocrResult["currency"] as? String)
                                ?.takeIf { it.matches(currencyRegex) } ?: "EUR"
                        ExpenseCreate(
                            categoryId = ocrResult["category_id"] as? Int,
                            reportId = null,
                            amount = amount,
                            currency = currency,
                            taxAmount =
                                (ocrResult["tax_amount"] as? Number)
                                    ?.let { BigDecimal.valueOf(it.toDouble()) } ?: BigDecimal.ZERO,
                            date = (ocrResult["date"] as? String) ?: today,
                            description =
                                (ocrResult["description"] as? String)
                                    ?: if (ocrResult.isEmpty()) "OCR failed — please fill manually" else null,
                            merchant = ocrResult["merchant"] as? String,
                            rawOcrText = ocrResult["raw_text"] as? String,
                        )
                    }
                } catch (e: ResponseStatusException) {
                    if (e.statusCode == HttpStatus.CONFLICT) throw e
                    log.error("Failed to create expense for $filename: ${e.message}")
                    errors.add(BulkUploadError(filename, "Could not create expense: ${e.reason}", fileIndex = index))
                    continue
                } catch (e: Exception) {
                    log.error("Failed to create expense for $filename: ${e.message}")
                    errors.add(BulkUploadError(filename, "Could not create expense: ${e.message}", fileIndex = index))
                    continue
                }

            try {
                // Same key used by the known-ID frontend attachment retry.
                saving.upload(expenseOut.id, listOf(file), currentUser, key?.let { "$it:receipt:$index" })
            } catch (e: ResponseStatusException) {
                if (e.statusCode == HttpStatus.CONFLICT) throw e
                log.warn("Receipt storage failed for expense ${expenseOut.id}: ${e.reason ?: e.message}")
                errors.add(BulkUploadError(filename, e.reason ?: e.message, expenseOut.id, index))
                // A retained creation identity may point at an intentionally deleted
                // Expense. Report that file, never recreate it or block later sources.
                if (e.statusCode == HttpStatus.NOT_FOUND || e.statusCode == HttpStatus.GONE) continue
            } catch (e: Exception) {
                log.warn("Receipt storage failed for expense ${expenseOut.id}: ${e.message}")
                errors.add(BulkUploadError(filename, e.message ?: "Could not upload receipt", expenseOut.id, index))
            }
            // Reload instead of returning the pre-upload DTO with no Receipt metadata.
            // Deletion can also race the upload/reload boundary.
            try {
                created.add(expenseService.getExpense(expenseOut.id, currentUser))
            } catch (e: ResponseStatusException) {
                if (e.statusCode != HttpStatus.NOT_FOUND && e.statusCode != HttpStatus.GONE) throw e
                if (errors.none { it.fileIndex == index }) {
                    errors.add(BulkUploadError(filename, e.reason ?: e.message, expenseOut.id, index))
                }
            }
        }

        return ResponseEntity.ok(BulkUploadResult(created, errors))
    }
}
