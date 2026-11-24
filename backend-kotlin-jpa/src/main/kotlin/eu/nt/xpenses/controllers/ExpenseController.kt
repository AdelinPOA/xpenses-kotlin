package eu.nt.xpenses.controllers

import eu.nt.xpenses.config.SafeMediaType
import eu.nt.xpenses.dto.expense.ExpenseCreate
import eu.nt.xpenses.dto.expense.ExpenseOut
import eu.nt.xpenses.dto.expense.ExpenseReviewRequest
import eu.nt.xpenses.dto.expense.ExpenseUpdate
import eu.nt.xpenses.expense.ExpenseVersionConflict
import eu.nt.xpenses.expense.Expenses
import eu.nt.xpenses.model.ExpenseVerificationState
import eu.nt.xpenses.model.User
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.Valid
import org.springframework.dao.OptimisticLockingFailureException
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
    private val expenses: Expenses,
) {
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
        @RequestParam(value = "verification_state", required = false) verificationState: ExpenseVerificationState?,
        request: HttpServletRequest,
    ): Any {
        val currentUser = requireUser(request)
        return expenses.listExpenses(currentUser, reportId, categoryId, status, fromDate, toDate, all, page, size, q, verificationState)
    }

    @PostMapping
    fun createExpense(
        @Valid @RequestBody body: ExpenseCreate,
        request: HttpServletRequest,
    ): ResponseEntity<ExpenseOut> {
        val currentUser = requireUser(request)
        val savedExpense = expenses.createExpense(body, currentUser, request.getHeader("Idempotency-Key"))
        return ResponseEntity.status(HttpStatus.CREATED).body(savedExpense)
    }

    @GetMapping("/{expenseId}")
    fun getExpense(
        @PathVariable expenseId: Int,
        request: HttpServletRequest,
    ): ExpenseOut {
        return expenses.getExpense(expenseId, requireUser(request))
    }

    @PatchMapping("/{expenseId}")
    fun updateExpense(
        @PathVariable expenseId: Int,
        @Valid @RequestBody body: ExpenseUpdate,
        request: HttpServletRequest,
    ): ExpenseOut {
        return expenses.updateExpense(expenseId, body, requireUser(request))
    }

    @PutMapping("/{expenseId}/review")
    fun reviewExpense(
        @PathVariable expenseId: Int,
        @Valid @RequestBody body: ExpenseReviewRequest,
        request: HttpServletRequest,
    ): ResponseEntity<Any> {
        val currentUser = requireUser(request)
        return try {
            ResponseEntity.ok(
                expenses.verifyExpense(expenseId, body, currentUser, request.getHeader("Idempotency-Key"))
            )
        } catch (conflict: ExpenseVersionConflict) {
            ResponseEntity.status(HttpStatus.CONFLICT).body(
                mapOf("detail" to conflict.message, "current" to conflict.current)
            )
        } catch (conflict: OptimisticLockingFailureException) {
            ResponseEntity.status(HttpStatus.CONFLICT).body(
                mapOf("detail" to "Expense changed during review; reload before continuing", "current" to expenses.getExpense(expenseId, currentUser))
            )
        }
    }

    @PostMapping("/{expenseId}/duplicate")
    fun duplicateExpense(
        @PathVariable expenseId: Int,
        request: HttpServletRequest,
    ): ResponseEntity<ExpenseOut> {
        val saved = expenses.duplicateExpense(expenseId, requireUser(request))
        return ResponseEntity.status(HttpStatus.CREATED).body(saved)
    }

    @DeleteMapping("/{expenseId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun deleteExpense(
        @PathVariable expenseId: Int,
        request: HttpServletRequest,
    ) {
        expenses.deleteExpense(expenseId, requireUser(request))
    }

    @PostMapping("/{expenseId}/receipts")
    fun uploadReceipts(
        @PathVariable expenseId: Int,
        @RequestParam("files") files: List<MultipartFile>,
        request: HttpServletRequest,
    ): List<Map<String, Any>> {
        return expenses.uploadReceipts(expenseId, files, requireUser(request), request.getHeader("Idempotency-Key"))
    }

    @PostMapping("/{expenseId}/receipt")
    fun uploadReceiptCompat(
        @PathVariable expenseId: Int,
        @RequestParam("file") file: MultipartFile,
        request: HttpServletRequest,
    ): List<Map<String, Any>> {
        return expenses.uploadReceipts(expenseId, listOf(file), requireUser(request), request.getHeader("Idempotency-Key"))
    }

    @DeleteMapping("/{expenseId}/receipts/{receiptId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun deleteSingleReceipt(
        @PathVariable expenseId: Int,
        @PathVariable receiptId: Int,
        request: HttpServletRequest,
    ) {
        expenses.deleteSingleReceipt(expenseId, receiptId, requireUser(request))
    }

    @GetMapping("/{expenseId}/receipts/{receiptId}")
    fun getSingleReceipt(
        @PathVariable expenseId: Int,
        @PathVariable receiptId: Int,
        request: HttpServletRequest,
    ): ResponseEntity<ByteArray> {
        val (bytes, contentType, filename) = expenses.getReceiptDownload(expenseId, receiptId, requireUser(request))
        return ResponseEntity
            .ok()
            .header(HttpHeaders.CONTENT_DISPOSITION, SafeMediaType.safeDisposition(filename, contentType).toString())
            .header("X-Content-Type-Options", "nosniff")
            .contentType(MediaType.parseMediaType(contentType))
            .body(bytes)
    }

    @GetMapping("/{expenseId}/receipt")
    fun getReceiptCompat(
        @PathVariable expenseId: Int,
        request: HttpServletRequest,
    ): ResponseEntity<ByteArray> {
        val (bytes, contentType, filename) = expenses.getReceiptDownload(expenseId, null, requireUser(request))
        return ResponseEntity
            .ok()
            .header(HttpHeaders.CONTENT_DISPOSITION, SafeMediaType.safeDisposition(filename, contentType).toString())
            .header("X-Content-Type-Options", "nosniff")
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
        @RequestParam(value = "q", required = false) q: String?,
        @RequestParam(value = "verification_state", required = false) verificationState: ExpenseVerificationState?,
        request: HttpServletRequest,
    ): ResponseEntity<ByteArray> {
        val (bytes, contentType, filename) =
            expenses.exportExpenses(
                requireUser(request),
                format,
                reportId,
                categoryId,
                status,
                fromDate,
                toDate,
                all,
                q,
                verificationState,
            )

        val headers =
            HttpHeaders().apply {
                set(HttpHeaders.CONTENT_TYPE, contentType)
                contentDisposition = ContentDisposition.attachment().filename(filename).build()
            }
        return ResponseEntity(bytes, headers, HttpStatus.OK)
    }

    private fun requireUser(request: HttpServletRequest): User =
        request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")
}
