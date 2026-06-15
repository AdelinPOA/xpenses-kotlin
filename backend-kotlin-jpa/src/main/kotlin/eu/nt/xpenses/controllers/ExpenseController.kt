package eu.nt.xpenses.controllers

import com.fasterxml.jackson.annotation.JsonProperty
import eu.nt.xpenses.models.*
import eu.nt.xpenses.repositories.*
import eu.nt.xpenses.services.ExportService
import eu.nt.xpenses.services.FxService
import eu.nt.xpenses.services.StorageService
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.http.ContentDisposition
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*
import org.springframework.web.multipart.MultipartFile
import org.springframework.web.server.ResponseStatusException
import java.io.File
import java.math.BigDecimal
import java.math.RoundingMode
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
    private val exportService: ExportService
) {

    @GetMapping
    fun listExpenses(
        @RequestParam(value = "report_id", required = false) reportId: Int?,
        @RequestParam(value = "category_id", required = false) categoryId: Int?,
        @RequestParam(value = "status", required = false) status: String?,
        @RequestParam(value = "from", required = false) fromDate: String?,
        @RequestParam(value = "to", required = false) toDate: String?,
        @RequestParam(value = "all", required = false, defaultValue = "false") all: Boolean,
        request: HttpServletRequest
    ): List<ExpenseOut> {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        var expenses = if (all && currentUser.role in listOf("chef_finance", "mod", "manager")) {
            expenseRepository.findAll()
        } else {
            expenseRepository.findAllByUserId(currentUser.id!!)
        }

        // Apply filters in-memory
        if (reportId != null) {
            expenses = expenses.filter { it.report?.id == reportId }
        }
        if (categoryId != null) {
            expenses = expenses.filter { it.category?.id == categoryId }
        }
        if (status != null) {
            expenses = expenses.filter { it.status == status }
        }
        if (fromDate != null) {
            expenses = expenses.filter { it.date >= fromDate }
        }
        if (toDate != null) {
            expenses = expenses.filter { it.date <= toDate }
        }

        // Sort by date DESC
        expenses = expenses.sortedByDescending { it.date }

        return expenses.map { mapExpenseToOut(it) }
    }

    @PostMapping
    fun createExpense(
        @RequestBody body: ExpenseCreate,
        request: HttpServletRequest
    ): ResponseEntity<ExpenseOut> {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        val fxRate = try {
            fxService.getRate(body.currency, body.date)
        } catch (e: Exception) {
            throw ResponseStatusException(HttpStatus.BAD_GATEWAY, "Failed to fetch exchange rate: ${e.message}")
        }

        val amountEur = BigDecimal(body.amount * fxRate).setScale(2, RoundingMode.HALF_UP).toDouble()
        val taxAmountEur = BigDecimal(body.taxAmount * fxRate).setScale(2, RoundingMode.HALF_UP)

        val category = body.categoryId?.let {
            categoryRepository.findById(it).orElseThrow {
                ResponseStatusException(HttpStatus.NOT_FOUND, "Category not found")
            }
        }

        val report = body.reportId?.let {
            val rep = expenseReportRepository.findById(it).orElseThrow {
                ResponseStatusException(HttpStatus.NOT_FOUND, "Report not found")
            }
            if (rep.user?.id != currentUser.id) {
                throw ResponseStatusException(HttpStatus.FORBIDDEN, "Cannot attach to another user's report")
            }
            if (rep.status != "draft") {
                throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Can only attach expenses to draft reports")
            }
            rep
        }

        val expense = Expense(
            user = currentUser,
            category = category,
            report = report,
            amountOriginal = body.amount,
            currencyOriginal = body.currency.uppercase(),
            amountEur = amountEur,
            fxRate = fxRate,
            taxAmount = BigDecimal(body.taxAmount),
            taxRate = body.taxRate?.let { BigDecimal(it) },
            taxAmountEur = taxAmountEur,
            date = body.date,
            description = body.description,
            merchant = body.merchant,
            rawOcrText = body.rawOcrText,
            status = "draft",
            createdAt = Instant.now(),
            updatedAt = Instant.now()
        )

        val savedExpense = expenseRepository.save(expense)

        if (body.comparisonId != null) {
            val comp = ocrComparisonRepository.findById(body.comparisonId).orElse(null)
            if (comp != null) {
                comp.expense = savedExpense
                ocrComparisonRepository.save(comp)
            }
        }

        return ResponseEntity.status(HttpStatus.CREATED).body(mapExpenseToOut(savedExpense))
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

        return mapExpenseToOut(expense)
    }

    @PatchMapping("/{expenseId}")
    fun updateExpense(
        @PathVariable expenseId: Int,
        @RequestBody body: ExpenseUpdate,
        request: HttpServletRequest
    ): ExpenseOut {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        val expense = expenseRepository.findById(expenseId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Expense not found")
        }

        if (expense.user?.id != currentUser.id) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only the owner can perform this action")
        }
        if (expense.status != "draft") {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Only draft expenses can be edited")
        }

        val needFxRecalc = body.amount != null || body.currency != null || body.date != null || body.taxAmount != null || body.taxRate != null

        if (needFxRecalc) {
            val effAmount = body.amount ?: expense.amountOriginal
            val effCurrency = (body.currency ?: expense.currencyOriginal).uppercase()
            val effDate = body.date ?: expense.date
            val effTaxAmount = body.taxAmount ?: expense.taxAmount.toDouble()
            val effTaxRate = body.taxRate ?: expense.taxRate?.toDouble()

            val fxRate = try {
                fxService.getRate(effCurrency, effDate)
            } catch (e: Exception) {
                throw ResponseStatusException(HttpStatus.BAD_GATEWAY, "Failed to fetch exchange rate: ${e.message}")
            }

            expense.amountOriginal = effAmount
            expense.currencyOriginal = effCurrency
            expense.fxRate = fxRate
            expense.amountEur = BigDecimal(effAmount * fxRate).setScale(2, RoundingMode.HALF_UP).toDouble()
            expense.taxAmount = BigDecimal(effTaxAmount)
            expense.taxRate = effTaxRate?.let { BigDecimal(it) }
            expense.taxAmountEur = BigDecimal(effTaxAmount * fxRate).setScale(2, RoundingMode.HALF_UP)
        }

        if (body.date != null) expense.date = body.date
        if (body.description != null) expense.description = body.description
        if (body.merchant != null) expense.merchant = body.merchant
        if (body.rawOcrText != null) expense.rawOcrText = body.rawOcrText

        if (body.categoryId != null) {
            expense.category = categoryRepository.findById(body.categoryId).orElseThrow {
                ResponseStatusException(HttpStatus.NOT_FOUND, "Category not found")
            }
        }

        if (body.reportId != null) {
            val rep = expenseReportRepository.findById(body.reportId).orElseThrow {
                ResponseStatusException(HttpStatus.NOT_FOUND, "Report not found")
            }
            if (rep.user?.id != currentUser.id) {
                throw ResponseStatusException(HttpStatus.FORBIDDEN, "Cannot attach to another user's report")
            }
            if (rep.status != "draft") {
                throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Can only attach expenses to draft reports")
            }
            expense.report = rep
        } else if (body.reportId == null && body.categoryId == null) {
            // report_id was explicitly set to null or not passed.
            expense.report = null
        }

        expense.updatedAt = Instant.now()
        val saved = expenseRepository.save(expense)

        if (body.comparisonId != null) {
            val comp = ocrComparisonRepository.findById(body.comparisonId).orElse(null)
            if (comp != null) {
                comp.expense = saved
                ocrComparisonRepository.save(comp)
            }
        }

        return mapExpenseToOut(saved)
    }

    @PostMapping("/{expenseId}/duplicate")
    fun duplicateExpense(
        @PathVariable expenseId: Int,
        request: HttpServletRequest
    ): ResponseEntity<ExpenseOut> {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        val expense = expenseRepository.findById(expenseId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Expense not found")
        }

        if (expense.user?.id != currentUser.id) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only the owner can perform this action")
        }

        val fxRate = try {
            fxService.getRate(expense.currencyOriginal, expense.date)
        } catch (e: Exception) {
            throw ResponseStatusException(HttpStatus.BAD_GATEWAY, "Failed to fetch exchange rate: ${e.message}")
        }

        val amountEur = BigDecimal(expense.amountOriginal * fxRate).setScale(2, RoundingMode.HALF_UP).toDouble()
        val taxAmountEur = BigDecimal(expense.taxAmount.toDouble() * fxRate).setScale(2, RoundingMode.HALF_UP)

        val newExpense = Expense(
            user = currentUser,
            category = expense.category,
            report = null,
            amountOriginal = expense.amountOriginal,
            currencyOriginal = expense.currencyOriginal,
            amountEur = amountEur,
            fxRate = fxRate,
            taxAmount = expense.taxAmount,
            taxRate = expense.taxRate,
            taxAmountEur = taxAmountEur,
            date = expense.date,
            description = expense.description,
            merchant = expense.merchant,
            status = "draft",
            createdAt = Instant.now(),
            updatedAt = Instant.now()
        )

        val saved = expenseRepository.save(newExpense)
        return ResponseEntity.status(HttpStatus.CREATED).body(mapExpenseToOut(saved))
    }

    @DeleteMapping("/{expenseId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun deleteExpense(
        @PathVariable expenseId: Int,
        request: HttpServletRequest
    ) {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        val expense = expenseRepository.findById(expenseId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Expense not found")
        }

        if (expense.user?.id != currentUser.id) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only the owner can perform this action")
        }
        if (expense.status != "draft") {
            throw ResponseStatusException(HttpStatus.BAD_GATEWAY, "Only draft expenses can be deleted")
        }

        // Delete all receipts from storage
        for (receipt in expense.receipts) {
            try {
                storageService.deleteFile(receipt.filePath)
            } catch (e: Exception) {
                // ignore or log
            }
        }

        expenseRepository.delete(expense)
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

        val saved = mutableListOf<Map<String, Any>>()
        val now = Instant.now()

        for (file in files) {
            val originalName = file.originalFilename ?: "receipt"
            val content = file.bytes
            
            val relativePath = try {
                saveReceiptLocal(expenseId, originalName, content)
            } catch (e: IllegalArgumentException) {
                throw ResponseStatusException(HttpStatus.BAD_REQUEST, e.message)
            }

            val receipt = Receipt(
                expense = expense,
                filePath = relativePath,
                originalName = originalName,
                createdAt = now
            )
            val savedReceipt = receiptRepository.save(receipt)
            saved.add(mapOf(
                "id" to savedReceipt.id!!,
                "file_path" to relativePath,
                "original_name" to originalName
            ))
        }

        expense.updatedAt = now
        expenseRepository.save(expense)

        return saved
    }

    @PostMapping("/{expenseId}/receipt")
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

        try {
            storageService.deleteFile(receipt.filePath)
        } catch (e: Exception) {
            // ignore
        }

        receiptRepository.delete(receipt)

        expense.updatedAt = Instant.now()
        expenseRepository.save(expense)
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

        var expenses = if (all && currentUser.role in listOf("chef_finance", "mod", "manager")) {
            expenseRepository.findAll()
        } else {
            expenseRepository.findAllByUserId(currentUser.id!!)
        }

        if (reportId != null) expenses = expenses.filter { it.report?.id == reportId }
        if (categoryId != null) expenses = expenses.filter { it.category?.id == categoryId }
        if (status != null) expenses = expenses.filter { it.status == status }
        if (fromDate != null) expenses = expenses.filter { it.date >= fromDate }
        if (toDate != null) expenses = expenses.filter { it.date <= toDate }
        expenses = expenses.sortedByDescending { it.date }

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
                put("tax_amount", e.taxAmount.toDouble())
                put("tax_rate", e.taxRate?.toDouble() ?: "")
                put("tax_amount_eur", e.taxAmountEur.toDouble())
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

    private fun mapReceiptToOut(receipt: Receipt): ReceiptOut {
        return ReceiptOut(
            id = receipt.id!!,
            expenseId = receipt.expense.id!!,
            filePath = receipt.filePath,
            originalName = receipt.originalName,
            createdAt = receipt.createdAt
        )
    }

    private fun mapExpenseToOut(expense: Expense): ExpenseOut {
        val receipts = expense.receipts.map { mapReceiptToOut(it) }
        val receiptPath = if (receipts.isNotEmpty()) receipts[0].filePath else expense.receiptPath
        return ExpenseOut(
            id = expense.id!!,
            userId = expense.user?.id,
            userDisplayName = expense.user?.displayName,
            categoryId = expense.category?.id,
            categoryName = expense.category?.name,
            reportId = expense.report?.id,
            amountOriginal = expense.amountOriginal,
            currencyOriginal = expense.currencyOriginal,
            amountEur = expense.amountEur,
            fxRate = expense.fxRate,
            taxAmount = expense.taxAmount.toDouble(),
            taxRate = expense.taxRate?.toDouble(),
            taxAmountEur = expense.taxAmountEur.toDouble(),
            date = expense.date,
            description = expense.description,
            merchant = expense.merchant,
            receiptPath = receiptPath,
            receipts = receipts,
            status = expense.status,
            rawOcrText = expense.rawOcrText,
            createdAt = expense.createdAt,
            updatedAt = expense.updatedAt
        )
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
    @JsonProperty("category_name") val categoryName: String?,
    @JsonProperty("report_id") val reportId: Int?,
    @JsonProperty("amount_original") val amountOriginal: Double,
    @JsonProperty("currency_original") val currencyOriginal: String,
    @JsonProperty("amount_eur") val amountEur: Double,
    @JsonProperty("fx_rate") val fxRate: Double,
    @JsonProperty("tax_amount") val taxAmount: Double,
    @JsonProperty("tax_rate") val taxRate: Double?,
    @JsonProperty("tax_amount_eur") val taxAmountEur: Double,
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
    val amount: Double,
    val currency: String = "EUR",
    @JsonProperty("tax_amount") val taxAmount: Double = 0.0,
    @JsonProperty("tax_rate") val taxRate: Double? = null,
    val date: String,
    val description: String? = null,
    val merchant: String? = null,
    @JsonProperty("raw_ocr_text") val rawOcrText: String? = null,
    @JsonProperty("comparison_id") val comparisonId: Int? = null
)

data class ExpenseUpdate(
    @JsonProperty("category_id") val categoryId: Int? = null,
    @JsonProperty("report_id") val reportId: Int? = null,
    val amount: Double? = null,
    val currency: String? = null,
    @JsonProperty("tax_amount") val taxAmount: Double? = null,
    @JsonProperty("tax_rate") val taxRate: Double? = null,
    val date: String? = null,
    val description: String? = null,
    val merchant: String? = null,
    @JsonProperty("raw_ocr_text") val rawOcrText: String? = null,
    @JsonProperty("comparison_id") val comparisonId: Int? = null
)
