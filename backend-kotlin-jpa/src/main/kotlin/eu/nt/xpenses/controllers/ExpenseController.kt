package eu.nt.xpenses.controllers

import eu.nt.xpenses.config.SafeMediaType
import eu.nt.xpenses.dto.expense.ExpenseCreate
import eu.nt.xpenses.dto.expense.ExpenseOut
import eu.nt.xpenses.dto.expense.ExpenseReviewRequest
import eu.nt.xpenses.dto.expense.ExpenseUpdate
import eu.nt.xpenses.model.ExpenseVerificationState
import eu.nt.xpenses.model.User
import eu.nt.xpenses.services.ExpenseService
import eu.nt.xpenses.services.ExpenseVersionConflict
import eu.nt.xpenses.services.IdempotentExpenseSaving
import eu.nt.xpenses.services.SaveIdempotencyService
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
    private val expenseService: ExpenseService,
    private val saving: IdempotentExpenseSaving,
    private val idempotency: SaveIdempotencyService,
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
        val currentUser =
            request.getAttribute("currentUser") as? User
                ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")
        return expenseService.listExpenses(currentUser, reportId, categoryId, status, fromDate, toDate, all, page, size, q, verificationState)
    }

    @PostMapping
    fun createExpense(
        @Valid @RequestBody body: ExpenseCreate,
        request: HttpServletRequest,
    ): ResponseEntity<ExpenseOut> {
        val currentUser =
            request.getAttribute("currentUser") as? User
                ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")
        val savedExpense = saving.create(body, currentUser, idempotency.validateKey(request.getHeader("Idempotency-Key")))
        return ResponseEntity.status(HttpStatus.CREATED).body(savedExpense)
    }

    @GetMapping("/{expenseId}")
    fun getExpense(
        @PathVariable expenseId: Int,
        request: HttpServletRequest,
    ): ExpenseOut {
        val currentUser =
            request.getAttribute("currentUser") as? User
                ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")
        return expenseService.getExpense(expenseId, currentUser)
    }

    @PatchMapping("/{expenseId}")
    fun updateExpense(
        @PathVariable expenseId: Int,
        @Valid @RequestBody body: ExpenseUpdate,
        request: HttpServletRequest,
    ): ExpenseOut {
        val currentUser =
            request.getAttribute("currentUser") as? User
                ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")
        return expenseService.updateExpense(expenseId, body, currentUser)
    }

    @PutMapping("/{expenseId}/review")
    fun reviewExpense(
        @PathVariable expenseId: Int,
        @Valid @RequestBody body: ExpenseReviewRequest,
        request: HttpServletRequest,
    ): ResponseEntity<Any> {
        val currentUser =
            request.getAttribute("currentUser") as? User
                ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")
        val requestKey = idempotency.validateKey(request.getHeader("Idempotency-Key"))
            ?: throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Idempotency-Key is required")

        return try {
            ResponseEntity.ok(expenseService.reviewExpense(expenseId, body, currentUser, requestKey, idempotency.hash(body)))
        } catch (conflict: ExpenseVersionConflict) {
            ResponseEntity.status(HttpStatus.CONFLICT).body(
                mapOf("detail" to conflict.message, "current" to conflict.current)
            )
        } catch (conflict: OptimisticLockingFailureException) {
            ResponseEntity.status(HttpStatus.CONFLICT).body(
                mapOf("detail" to "Expense changed during review; reload before continuing", "current" to expenseService.getExpense(expenseId, currentUser))
            )
        }
    }

    @PostMapping("/{expenseId}/duplicate")
    fun duplicateExpense(
        @PathVariable expenseId: Int,
        request: HttpServletRequest,
    ): ResponseEntity<ExpenseOut> {
        val currentUser =
            request.getAttribute("currentUser") as? User
                ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")
        val saved = expenseService.duplicateExpense(expenseId, currentUser)
        return ResponseEntity.status(HttpStatus.CREATED).body(saved)
    }

    @DeleteMapping("/{expenseId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun deleteExpense(
        @PathVariable expenseId: Int,
        request: HttpServletRequest,
    ) {
        val currentUser =
            request.getAttribute("currentUser") as? User
                ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")
        expenseService.deleteExpense(expenseId, currentUser)
    }

    @PostMapping("/{expenseId}/receipts")
    fun uploadReceipts(
        @PathVariable expenseId: Int,
        @RequestParam("files") files: List<MultipartFile>,
        request: HttpServletRequest,
    ): List<Map<String, Any>> {
        val currentUser =
            request.getAttribute("currentUser") as? User
                ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")
        return saving.upload(expenseId, files, currentUser, idempotency.validateKey(request.getHeader("Idempotency-Key")))
    }

    @PostMapping("/{expenseId}/receipt")
    fun uploadReceiptCompat(
        @PathVariable expenseId: Int,
        @RequestParam("file") file: MultipartFile,
        request: HttpServletRequest,
    ): List<Map<String, Any>> {
        val currentUser =
            request.getAttribute("currentUser") as? User
                ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")
        return saving.upload(expenseId, listOf(file), currentUser, idempotency.validateKey(request.getHeader("Idempotency-Key")))
    }

    @DeleteMapping("/{expenseId}/receipts/{receiptId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun deleteSingleReceipt(
        @PathVariable expenseId: Int,
        @PathVariable receiptId: Int,
        request: HttpServletRequest,
    ) {
        val currentUser =
            request.getAttribute("currentUser") as? User
                ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")
        expenseService.deleteSingleReceipt(expenseId, receiptId, currentUser)
    }

    @GetMapping("/{expenseId}/receipts/{receiptId}")
    fun getSingleReceipt(
        @PathVariable expenseId: Int,
        @PathVariable receiptId: Int,
        request: HttpServletRequest,
    ): ResponseEntity<ByteArray> {
        val currentUser =
            request.getAttribute("currentUser") as? User
                ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")
        val (bytes, contentType, filename) = expenseService.getReceiptDownload(expenseId, receiptId, currentUser)
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
        val currentUser =
            request.getAttribute("currentUser") as? User
                ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")
        val (bytes, contentType, filename) = expenseService.getReceiptDownload(expenseId, null, currentUser)
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
        val currentUser =
            request.getAttribute("currentUser") as? User
                ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        val (bytes, contentType, filename) =
            expenseService.exportExpenses(
                currentUser,
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
}
