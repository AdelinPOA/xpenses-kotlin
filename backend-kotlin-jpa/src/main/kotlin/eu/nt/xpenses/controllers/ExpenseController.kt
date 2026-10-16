package eu.nt.xpenses.controllers

import eu.nt.xpenses.dto.expense.ExpenseCreate
import eu.nt.xpenses.dto.expense.ExpenseOut
import eu.nt.xpenses.dto.expense.ExpenseUpdate
import eu.nt.xpenses.model.User
import eu.nt.xpenses.models.auth.AuthenticatedActor
import eu.nt.xpenses.services.ExpenseService
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.Valid
import org.springframework.http.ContentDisposition
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*
import org.springframework.web.multipart.MultipartFile
import org.springframework.web.server.ResponseStatusException

@RestController
@RequestMapping("/api/expenses")
class ExpenseController(
    private val expenseService: ExpenseService
) {

    private fun getActor(request: HttpServletRequest): AuthenticatedActor {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")
        return AuthenticatedActor.fromUser(currentUser)
    }

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
        @RequestParam(value = "q", required = false) q: String?,
        request: HttpServletRequest
    ): Any {
        val actor = getActor(request)
        return expenseService.listExpenses(actor, reportId, categoryId, status, fromDate, toDate, all, page, size, q)
    }

    @PostMapping
    fun createExpense(
        @Valid @RequestBody body: ExpenseCreate,
        request: HttpServletRequest
    ): ResponseEntity<ExpenseOut> {
        val actor = getActor(request)
        val savedExpense = expenseService.createExpense(body, actor)
        return ResponseEntity.status(HttpStatus.CREATED).body(savedExpense)
    }

    @GetMapping("/{expenseId}")
    fun getExpense(
        @PathVariable expenseId: Int,
        request: HttpServletRequest
    ): ExpenseOut {
        val actor = getActor(request)
        return expenseService.getExpense(expenseId, actor)
    }

    @PatchMapping("/{expenseId}")
    fun updateExpense(
        @PathVariable expenseId: Int,
        @Valid @RequestBody body: ExpenseUpdate,
        request: HttpServletRequest
    ): ExpenseOut {
        val actor = getActor(request)
        return expenseService.updateExpense(expenseId, body, actor)
    }

    @PostMapping("/{expenseId}/duplicate")
    fun duplicateExpense(
        @PathVariable expenseId: Int,
        request: HttpServletRequest
    ): ResponseEntity<ExpenseOut> {
        val actor = getActor(request)
        val saved = expenseService.duplicateExpense(expenseId, actor)
        return ResponseEntity.status(HttpStatus.CREATED).body(saved)
    }

    @DeleteMapping("/{expenseId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun deleteExpense(
        @PathVariable expenseId: Int,
        request: HttpServletRequest
    ) {
        val actor = getActor(request)
        expenseService.deleteExpense(expenseId, actor)
    }

    @PostMapping("/{expenseId}/receipts")
    fun uploadReceipts(
        @PathVariable expenseId: Int,
        @RequestParam("files") files: List<MultipartFile>,
        request: HttpServletRequest
    ): List<Map<String, Any>> {
        val actor = getActor(request)
        return expenseService.uploadReceipts(expenseId, files, actor)
    }

    @PostMapping("/{expenseId}/receipt")
    fun uploadReceiptCompat(
        @PathVariable expenseId: Int,
        @RequestParam("file") file: MultipartFile,
        request: HttpServletRequest
    ): List<Map<String, Any>> {
        val actor = getActor(request)
        return expenseService.uploadReceipts(expenseId, listOf(file), actor)
    }

    @DeleteMapping("/{expenseId}/receipts/{receiptId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun deleteSingleReceipt(
        @PathVariable expenseId: Int,
        @PathVariable receiptId: Int,
        request: HttpServletRequest
    ) {
        val actor = getActor(request)
        expenseService.deleteSingleReceipt(expenseId, receiptId, actor)
    }

    @GetMapping("/{expenseId}/receipts/{receiptId}")
    fun getSingleReceipt(
        @PathVariable expenseId: Int,
        @PathVariable receiptId: Int,
        request: HttpServletRequest
    ): ResponseEntity<ByteArray> {
        val actor = getActor(request)
        val (bytes, contentType) = expenseService.getReceiptBytes(expenseId, receiptId, actor)
        return ResponseEntity.ok()
            .contentType(MediaType.parseMediaType(contentType))
            .body(bytes)
    }

    @GetMapping("/{expenseId}/receipt")
    fun getReceiptCompat(
        @PathVariable expenseId: Int,
        request: HttpServletRequest
    ): ResponseEntity<ByteArray> {
        val actor = getActor(request)
        val (bytes, contentType) = expenseService.getReceiptBytes(expenseId, null, actor)
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
        val actor = getActor(request)

        val (bytes, contentType, filename) = expenseService.exportExpenses(
            actor, format, reportId, categoryId, status, fromDate, toDate, all, null
        )

        val headers = HttpHeaders().apply {
            set(HttpHeaders.CONTENT_TYPE, contentType)
            contentDisposition = ContentDisposition.attachment().filename(filename).build()
        }
        return ResponseEntity(bytes, headers, HttpStatus.OK)
    }
}
