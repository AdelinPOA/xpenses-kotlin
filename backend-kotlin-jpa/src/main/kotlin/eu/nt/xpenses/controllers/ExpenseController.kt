package eu.nt.xpenses.controllers

import eu.nt.xpenses.dto.expense.ExpenseCreate
import eu.nt.xpenses.dto.expense.ExpenseOut
import eu.nt.xpenses.dto.expense.ExpenseUpdate
import eu.nt.xpenses.model.*
import eu.nt.xpenses.models.PagedResponse
import eu.nt.xpenses.repositories.*
import eu.nt.xpenses.services.ExpenseService
import eu.nt.xpenses.services.ExportService
import eu.nt.xpenses.services.FxService
import eu.nt.xpenses.services.StorageService
import eu.nt.xpenses.services.mapper.ExpenseMapper
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import jakarta.validation.Valid
import org.springframework.http.ContentDisposition
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.*
import org.springframework.web.multipart.MultipartFile
import org.springframework.web.server.ResponseStatusException
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
    private val expenseService: ExpenseService,
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
            PagedResponse(
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

        if (currentUser.role !in listOf("chef_finance", "mod", "manager") && expense.user?.id != currentUser.id) {
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
        return expenseService.uploadReceipts(expenseId, files, currentUser)
    }

    @PostMapping("/{expenseId}/receipt")
    fun uploadReceiptCompat(
        @PathVariable expenseId: Int,
        @RequestParam("file") file: MultipartFile,
        request: HttpServletRequest
    ): List<Map<String, Any>> {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")
        return expenseService.uploadReceipts(expenseId, listOf(file), currentUser)
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
        expenseService.deleteSingleReceipt(expenseId, receiptId, currentUser)
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

        if (currentUser.role !in listOf("chef_finance", "mod", "manager") && expense.user?.id != currentUser.id) {
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

        if (currentUser.role !in listOf("chef_finance", "mod", "manager") && expense.user?.id != currentUser.id) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Not your expense")
        }

        val receipt = expense.receipts.minByOrNull { it.createdAt }
        if (receipt != null) {
            return getSingleReceipt(expenseId, receipt.id!!, request, response)
        }

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
