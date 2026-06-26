package eu.nt.xpenses.controllers

import com.fasterxml.jackson.annotation.JsonProperty
import eu.nt.xpenses.models.*
import eu.nt.xpenses.repositories.*
import eu.nt.xpenses.services.ExpenseMapper
import eu.nt.xpenses.services.ExportService
import eu.nt.xpenses.services.FxService
import eu.nt.xpenses.services.ExpenseService
import eu.nt.xpenses.services.OcrService
import eu.nt.xpenses.services.StorageService
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import jakarta.validation.Valid
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Pattern
import org.springframework.http.ContentDisposition
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.support.TransactionTemplate
import org.springframework.web.bind.annotation.*
import org.springframework.web.multipart.MultipartFile
import org.springframework.web.server.ResponseStatusException
import java.io.File
import java.math.BigDecimal
import java.math.RoundingMode
import org.slf4j.LoggerFactory
import java.net.URLConnection
import java.time.Instant
import java.time.LocalDate

@RestController
@RequestMapping("/api/expenses")
class ExpenseController(
    private val expenseRepository: ExpenseRepository,
    private val categoryRepository: CategoryRepository,
    private val expenseReportRepository: ExpenseReportRepository,
    private val receiptRepository: ReceiptRepository,
    private val ocrComparisonRepository: OcrComparisonRepository,
    private val fxService: FxService,
    private val storageService: StorageService,
    private val exportService: ExportService,
    private val expenseMapper: ExpenseMapper,
    private val transactionTemplate: TransactionTemplate,
    private val expenseService: ExpenseService,
    private val ocrService: OcrService
) {
    private val log = LoggerFactory.getLogger(ExpenseController::class.java)

    @GetMapping
    fun listExpenses(
        @RequestParam(value = "report_id", required = false) reportId: Int?,
        @RequestParam(value = "category_id", required = false) categoryId: Int?,
        @RequestParam(value = "status", required = false) status: String?,
        @RequestParam(value = "from", required = false) fromDate: String?,
        @RequestParam(value = "to", required = false) toDate: String?,
        @RequestParam(value = "all", required = false, defaultValue = "false") all: Boolean,
        @RequestParam(value = "page", required = false) page: Int?,
        @RequestParam(value = "size", required = false, defaultValue = "20") size: Int,
        request: HttpServletRequest
    ): Any {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        val uid = if (all && currentUser.role in listOf("chef_finance", "mod", "manager")) null else currentUser.id!!

        return if (page != null) {
            val pageable = org.springframework.data.domain.PageRequest.of(page, size)
            val result = expenseRepository.findAllWithFiltersPaged(uid, status, reportId, categoryId, fromDate, toDate, pageable)
            eu.nt.xpenses.models.PagedResponse(
                data = result.content.map { expenseMapper.toExpenseOut(it) },
                page = result.number,
                size = result.size,
                totalElements = result.totalElements,
                totalPages = result.totalPages
            )
        } else {
            expenseRepository.findAllWithFilters(uid, status, reportId, categoryId, fromDate, toDate)
                .map { expenseMapper.toExpenseOut(it) }
        }
    }

    @PostMapping
    @Transactional
    fun createExpense(
        @Valid @RequestBody body: ExpenseCreate,
        request: HttpServletRequest
    ): ResponseEntity<ExpenseOut> {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")
        val savedExpense = expenseService.createExpense(body, currentUser)
        return ResponseEntity.status(HttpStatus.CREATED).body(expenseMapper.toExpenseOut(savedExpense))
    }

    // ── Bulk upload ──────────────────────────────────────────────────────────
    // POST /api/expenses/bulk-upload
    // Accepts up to 20 receipt images/PDFs. Per file: runs OCR synchronously,
    // creates a draft expense, attaches the receipt. Returns all created expenses
    // plus a per-file error list for files that failed validation or OCR.
    @PostMapping("/bulk-upload", consumes = ["multipart/form-data"])
    fun bulkUploadExpenses(
        @RequestParam("files") files: List<MultipartFile>,
        request: HttpServletRequest
    ): ResponseEntity<BulkUploadResult> {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        if (files.size > 20) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Maximum 20 files per bulk upload")
        }

        val allowedExt = setOf("jpg", "jpeg", "png", "webp", "pdf")
        val created = mutableListOf<ExpenseOut>()
        val errors = mutableListOf<BulkUploadError>()
        val today = LocalDate.now().toString()

        for (file in files) {
            val filename = file.originalFilename ?: "receipt"
            val ext = filename.substringAfterLast('.', "").lowercase()

            // Client-side-style validation — keep going for other files on error
            if (ext !in allowedExt) {
                errors.add(BulkUploadError(filename, "File type .$ext not supported"))
                continue
            }
            if (file.size > 10 * 1024 * 1024) {
                errors.add(BulkUploadError(filename, "File exceeds 10 MB limit"))
                continue
            }

            // Run OCR synchronously — never let a single OCR failure abort the batch
            val ocrResult: Map<String, Any?> = try {
                ocrService.scanReceipt(file.bytes, filename)
            } catch (e: Exception) {
                log.warn("OCR failed for $filename: ${e.message}")
                emptyMap()
            }

            val amount = (ocrResult["amount"] as? Number)
                ?.let { BigDecimal.valueOf(it.toDouble()) }
                ?: BigDecimal.ZERO
            val currency = (ocrResult["currency"] as? String)
                ?.takeIf { it.matches(Regex("^[A-Z]{3}$")) } ?: "EUR"
            val date = (ocrResult["date"] as? String) ?: today
            val merchant = ocrResult["merchant"] as? String
            val description = (ocrResult["description"] as? String)
                ?: if (ocrResult.isEmpty()) "OCR failed — please fill manually" else null
            val categoryId = ocrResult["category_id"] as? Int
            val rawOcrText = ocrResult["raw_text"] as? String
            val taxAmount = (ocrResult["tax_amount"] as? Number)
                ?.let { BigDecimal.valueOf(it.toDouble()) } ?: BigDecimal.ZERO

            val dto = ExpenseCreate(
                categoryId = categoryId,
                reportId = null,           // always unattached — user assigns to report later
                amount = amount,
                currency = currency,
                taxAmount = taxAmount,
                date = date,
                description = description,
                merchant = merchant,
                rawOcrText = rawOcrText
            )

            val expense = try {
                expenseService.createExpense(dto, currentUser)
            } catch (e: Exception) {
                log.error("Failed to create expense for $filename: ${e.message}")
                errors.add(BulkUploadError(filename, "Could not create expense: ${e.message}"))
                continue
            }

            // Attach receipt to the just-created expense
            try {
                val relativePath = saveReceiptLocal(expense.id!!, filename, file.bytes)
                val receipt = Receipt(
                    expense = expense,
                    filePath = relativePath,
                    originalName = filename,
                    createdAt = Instant.now()
                )
                receiptRepository.save(receipt)
                expense.updatedAt = Instant.now()
                expenseRepository.save(expense)
            } catch (e: Exception) {
                log.warn("Receipt storage failed for expense ${expense.id}: ${e.message}")
                // Expense still usable without receipt; don't fail the whole entry
            }

            created.add(expenseMapper.toExpenseOut(expense))
        }

        return ResponseEntity.ok(BulkUploadResult(created, errors))
    }

    @GetMapping("/{expenseId}")
    fun getExpense(
        @PathVariable expenseId: Int,
        request: HttpServletRequest
    ): ExpenseOut {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        val expense = expenseRepository.findById(expenseId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Expense not found")
        }

        if (currentUser.role !in listOf("chef_finance", "mod") && expense.user?.id != currentUser.id) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Not your expense")
        }

        return expenseMapper.toExpenseOut(expense)
    }

    @PatchMapping("/{expenseId}")
    @Transactional
    fun updateExpense(
        @PathVariable expenseId: Int,
        @Valid @RequestBody body: ExpenseUpdate,
        request: HttpServletRequest
    ): ExpenseOut {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")
        val saved = expenseService.updateExpense(expenseId, body, currentUser)
        return expenseMapper.toExpenseOut(saved)
    }

    @PostMapping("/{expenseId}/duplicate")
    @Transactional
    fun duplicateExpense(
        @PathVariable expenseId: Int,
        request: HttpServletRequest
    ): ResponseEntity<ExpenseOut> {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")
        val saved = expenseService.duplicateExpense(expenseId, currentUser)
        return ResponseEntity.status(HttpStatus.CREATED).body(expenseMapper.toExpenseOut(saved))
    }

    @DeleteMapping("/{expenseId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun deleteExpense(
        @PathVariable expenseId: Int,
        request: HttpServletRequest
    ) {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")
        expenseService.deleteExpense(expenseId, currentUser)
    }

    @PostMapping("/{expenseId}/receipts")
    fun uploadReceipts(
        @PathVariable expenseId: Int,
        @RequestParam("files") files: List<MultipartFile>,
        request: HttpServletRequest
    ): List<Map<String, Any>> {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        val expense = expenseRepository.findById(expenseId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Expense not found")
        }

        if (expense.user?.id != currentUser.id) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only the owner can perform this action")
        }

        val saved = transactionTemplate.execute {
            val txExpense = expenseRepository.findById(expenseId).orElseThrow {
                ResponseStatusException(HttpStatus.NOT_FOUND, "Expense not found")
            }
            val now = Instant.now()
            val savedReceiptsList = mutableListOf<Map<String, Any>>()
            for (file in files) {
                val originalName = file.originalFilename ?: "receipt"
                val content = file.bytes
                val relativePath = try {
                    saveReceiptLocal(expenseId, originalName, content)
                } catch (e: IllegalArgumentException) {
                    throw ResponseStatusException(HttpStatus.BAD_REQUEST, e.message)
                }
                val receipt = Receipt(
                    expense = txExpense,
                    filePath = relativePath,
                    originalName = originalName,
                    createdAt = now
                )
                val savedReceipt = receiptRepository.save(receipt)
                savedReceiptsList.add(mapOf(
                    "id" to savedReceipt.id!!,
                    "file_path" to relativePath,
                    "original_name" to originalName
                ))
            }
            txExpense.updatedAt = now
            expenseRepository.save(txExpense)
            savedReceiptsList
        } ?: throw ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Transaction failed")

        return saved
    }

    @PostMapping("/{expenseId}/receipt")
    @Transactional
    fun uploadReceiptCompat(
        @PathVariable expenseId: Int,
        @RequestParam("file") file: MultipartFile,
        request: HttpServletRequest
    ): List<Map<String, Any>> {
        return uploadReceipts(expenseId, listOf(file), request)
    }

    @DeleteMapping("/{expenseId}/receipts/{receiptId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun deleteSingleReceipt(
        @PathVariable expenseId: Int,
        @PathVariable receiptId: Int,
        request: HttpServletRequest
    ) {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        val filePath = transactionTemplate.execute {
            val expense = expenseRepository.findById(expenseId).orElseThrow {
                ResponseStatusException(HttpStatus.NOT_FOUND, "Expense not found")
            }

            if (expense.user?.id != currentUser.id) {
                throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only the owner can delete receipts")
            }

            val receipt = receiptRepository.findById(receiptId).orElseThrow {
                ResponseStatusException(HttpStatus.NOT_FOUND, "Receipt not found")
            }

            if (receipt.expense.id != expenseId) {
                throw ResponseStatusException(HttpStatus.NOT_FOUND, "Receipt not associated with this expense")
            }

            val path = receipt.filePath
            receiptRepository.delete(receipt)

            expense.updatedAt = Instant.now()
            expenseRepository.save(expense)
            path
        } ?: throw ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Transaction failed")

        try {
            storageService.deleteFile(filePath)
        } catch (e: Exception) {
            log.warn("Failed to delete receipt file '{}': {}", filePath, e.message)
        }
    }

    @GetMapping("/{expenseId}/receipts/{receiptId}")
    fun getSingleReceipt(
        @PathVariable expenseId: Int,
        @PathVariable receiptId: Int,
        request: HttpServletRequest,
        response: HttpServletResponse
    ): ResponseEntity<ByteArray> {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        val expense = expenseRepository.findById(expenseId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Expense not found")
        }

        if (currentUser.role !in listOf("chef_finance", "mod") && expense.user?.id != currentUser.id) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Not your expense")
        }

        val receipt = receiptRepository.findById(receiptId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Receipt not found")
        }

        if (receipt.expense.id != expenseId) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "Receipt not associated with this expense")
        }

        val bytes = try {
            storageService.downloadFile(receipt.filePath)
        } catch (e: Exception) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "Receipt file not found")
        }

        val contentType = URLConnection.guessContentTypeFromName(receipt.originalName ?: receipt.filePath)
            ?: "application/octet-stream"

        return ResponseEntity.ok()
            .contentType(MediaType.parseMediaType(contentType))
            .body(bytes)
    }

    @GetMapping("/{expenseId}/receipt")
    fun getReceiptCompat(
        @PathVariable expenseId: Int,
        request: HttpServletRequest,
        response: HttpServletResponse
    ): ResponseEntity<ByteArray> {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        val expense = expenseRepository.findById(expenseId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Expense not found")
        }

        if (currentUser.role !in listOf("chef_finance", "mod") && expense.user?.id != currentUser.id) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Not your expense")
        }

        // Get first receipt sorted by created_at
        val receipt = expense.receipts.minByOrNull { it.createdAt }
        if (receipt != null) {
            return getSingleReceipt(expenseId, receipt.id!!, request, response)
        }

        // Fallback to receiptPath column
        val rPath = expense.receiptPath ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "No receipt found")
        val bytes = try {
            storageService.downloadFile(rPath)
        } catch (e: Exception) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "Receipt file not found")
        }

        val contentType = URLConnection.guessContentTypeFromName(rPath) ?: "application/octet-stream"
        return ResponseEntity.ok()
            .contentType(MediaType.parseMediaType(contentType))
            .body(bytes)
    }

    private fun saveReceiptLocal(expenseId: Int, filename: String, content: ByteArray): String {
        val allowedExtensions = setOf("jpg", "jpeg", "png", "gif", "pdf", "webp")
        val rawFilename = File(filename).name
        val ext = rawFilename.substringAfterLast(".", "").lowercase()
        if (ext !in allowedExtensions) {
            throw IllegalArgumentException("File type .$ext not allowed")
        }
        validateMagicBytes(content, ext)
        if (content.size > 10 * 1024 * 1024) {
            throw IllegalArgumentException("File exceeds 10MB limit")
        }

        val now = java.time.LocalDate.now()
        val year = now.year
        val month = String.format("%02d", now.monthValue)
        val subdir = "$year/$month"
        val safeName = "${expenseId}_${rawFilename}".replace(" ", "_")
        val relativePath = "$subdir/$safeName"

        storageService.uploadFile(relativePath, content)
        return relativePath
    }

    private fun validateMagicBytes(content: ByteArray, ext: String) {
        val signatures = mapOf(
            "jpg" to byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte()),
            "jpeg" to byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte()),
            "png" to byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A),
            "gif" to byteArrayOf(0x47, 0x49, 0x46, 0x38),
            "pdf" to byteArrayOf(0x25, 0x50, 0x44, 0x46),
            "webp" to byteArrayOf(0x52, 0x49, 0x46, 0x46)
        )
        val expected = signatures[ext] ?: return
        if (content.size < expected.size || !content.copyOfRange(0, expected.size).contentEquals(expected)) {
            throw IllegalArgumentException("File content does not match .$ext format")
        }
        // Additional sub-signature check for WebP (RIFF header alone matches WAV/AVI too)
        if (ext == "webp") {
            val webpSignature = byteArrayOf(0x57, 0x45, 0x42, 0x50) // "WEBP"
            if (content.size < 12 || !content.copyOfRange(8, 12).contentEquals(webpSignature)) {
                throw IllegalArgumentException("File content does not match .webp format")
            }
        }
    }

    @GetMapping("/export")
    fun exportExpenses(
        @RequestParam(value = "format", required = false, defaultValue = "csv") format: String,
        @RequestParam(value = "report_id", required = false) reportId: Int?,
        @RequestParam(value = "category_id", required = false) categoryId: Int?,
        @RequestParam(value = "status", required = false) status: String?,
        @RequestParam(value = "from", required = false) fromDate: String?,
        @RequestParam(value = "to", required = false) toDate: String?,
        @RequestParam(value = "all", required = false, defaultValue = "false") all: Boolean,
        request: HttpServletRequest
    ): ResponseEntity<ByteArray> {
        if (format !in listOf("csv", "xlsx")) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported format '$format'. Use 'csv' or 'xlsx'.")
        }

        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        val uid = if (all && currentUser.role in listOf("chef_finance", "mod", "manager")) null else currentUser.id!!
        val expenses = expenseRepository.findAllWithFilters(uid, status, reportId, categoryId, fromDate, toDate)

        val includeUser = all && currentUser.role in listOf("chef_finance", "mod", "manager")
        val columns = listOfNotNull(
            "id", "date", "merchant", "description", "category",
            "amount_original", "currency", "amount_eur", "fx_rate",
            "tax_amount", "tax_rate", "tax_amount_eur", "status", "report_id",
            if (includeUser) "user" else null
        )

        val rows = expenses.map { e ->
            buildMap {
                put("id", e.id)
                put("date", e.date)
                put("merchant", e.merchant ?: "")
                put("description", e.description ?: "")
                put("category", e.category?.name ?: "")
                put("amount_original", e.amountOriginal)
                put("currency", e.currencyOriginal)
                put("amount_eur", e.amountEur)
                put("fx_rate", e.fxRate)
                put("tax_amount", e.taxAmount)
                put("tax_rate", e.taxRate ?: "")
                put("tax_amount_eur", e.taxAmountEur)
                put("status", e.status)
                put("report_id", e.report?.id ?: "")
                if (includeUser) put("user", e.user?.displayName ?: "")
            }
        }

        val today = LocalDate.now()
        val (bytes, contentType, ext) = when (format) {
            "xlsx" -> Triple(
                exportService.buildXlsx(rows, columns),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "xlsx"
            )
            else -> Triple(exportService.buildCsv(rows, columns), "text/csv", "csv")
        }

        val headers = HttpHeaders().apply {
            set(HttpHeaders.CONTENT_TYPE, contentType)
            contentDisposition = ContentDisposition.attachment()
                .filename("expenses_$today.$ext").build()
        }
        return ResponseEntity(bytes, headers, HttpStatus.OK)
    }

}

data class ReceiptOut(
    val id: Int,
    @JsonProperty("expense_id") val expenseId: Int,
    @JsonProperty("file_path") val filePath: String,
    @JsonProperty("original_name") val originalName: String?,
    @JsonProperty("created_at") val createdAt: Instant
)

data class ExpenseOut(
    val id: Int,
    @JsonProperty("user_id") val userId: Int?,
    @JsonProperty("user_display_name") val userDisplayName: String?,
    @JsonProperty("category_id") val categoryId: Int?,
    @JsonProperty("comparison_id") val comparisonId: Int? = null,
    @JsonProperty("category_name") val categoryName: String?,
    @JsonProperty("report_id") val reportId: Int?,
    @JsonProperty("amount_original") val amountOriginal: BigDecimal,
    @JsonProperty("currency_original") val currencyOriginal: String,
    @JsonProperty("amount_eur") val amountEur: BigDecimal,
    @JsonProperty("fx_rate") val fxRate: BigDecimal,
    @JsonProperty("tax_amount") val taxAmount: BigDecimal,
    @JsonProperty("tax_rate") val taxRate: BigDecimal?,
    @JsonProperty("tax_amount_eur") val taxAmountEur: BigDecimal,
    val date: String,
    val description: String?,
    val merchant: String?,
    @JsonProperty("receipt_path") val receiptPath: String?,
    val receipts: List<ReceiptOut>,
    val status: String,
    @JsonProperty("raw_ocr_text") val rawOcrText: String?,
    @JsonProperty("created_at") val createdAt: Instant,
    @JsonProperty("updated_at") val updatedAt: Instant
)

data class ExpenseCreate(
    @JsonProperty("category_id") val categoryId: Int? = null,
    @JsonProperty("report_id") val reportId: Int? = null,
    @field:Min(0) val amount: BigDecimal,
    @field:NotBlank @field:Pattern(regexp = "^[A-Z]{3}$") val currency: String = "EUR",
    @JsonProperty("tax_amount") val taxAmount: BigDecimal = BigDecimal.ZERO,
    @JsonProperty("tax_rate") val taxRate: BigDecimal? = null,
    @field:NotBlank val date: String,
    val description: String? = null,
    val merchant: String? = null,
    @JsonProperty("raw_ocr_text") val rawOcrText: String? = null,
    @JsonProperty("comparison_id") val comparisonId: Int? = null
)

data class ExpenseUpdate(
    @JsonProperty("category_id") val categoryId: Int? = null,
    @JsonProperty("report_id") val reportId: Int? = null,
    @field:Min(0) val amount: BigDecimal? = null,
    @field:Pattern(regexp = "^[A-Z]{3}$") val currency: String? = null,
    @JsonProperty("tax_amount") val taxAmount: BigDecimal? = null,
    @JsonProperty("tax_rate") val taxRate: BigDecimal? = null,
    val date: String? = null,
    val description: String? = null,
    val merchant: String? = null,
    @JsonProperty("raw_ocr_text") val rawOcrText: String? = null,
    @JsonProperty("comparison_id") val comparisonId: Int? = null
)

data class BulkUploadError(
    val filename: String,
    val reason: String
)

data class BulkUploadResult(
    val created: List<ExpenseOut>,
    val errors: List<BulkUploadError>
)
