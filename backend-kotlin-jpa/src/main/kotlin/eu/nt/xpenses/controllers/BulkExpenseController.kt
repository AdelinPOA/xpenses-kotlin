package eu.nt.xpenses.controllers

import eu.nt.xpenses.dto.expense.BulkUploadError
import eu.nt.xpenses.dto.expense.BulkUploadResult
import eu.nt.xpenses.dto.expense.ExpenseCreate
import eu.nt.xpenses.dto.expense.ExpenseOut
import eu.nt.xpenses.model.User
import eu.nt.xpenses.services.ExpenseService
import eu.nt.xpenses.services.OcrService
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
    private val ocrService: OcrService
) {
    private val log = LoggerFactory.getLogger(javaClass)
    private val currencyRegex = Regex("^[A-Z]{3}$")

    @PostMapping("/bulk-upload")
    fun bulkUploadExpenses(
        @RequestParam("files") files: List<MultipartFile>,
        request: HttpServletRequest
    ): ResponseEntity<BulkUploadResult> {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        if (files.size > 20) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Maximum 20 files per bulk upload")
        }

        val created = mutableListOf<ExpenseOut>()
        val errors = mutableListOf<BulkUploadError>()
        val today = LocalDate.now().toString()

        for (file in files) {
            val filename = file.originalFilename ?: "receipt"

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
                ?.takeIf { it.matches(currencyRegex) } ?: "EUR"
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
                reportId = null,
                amount = amount,
                currency = currency,
                taxAmount = taxAmount,
                date = date,
                description = description,
                merchant = merchant,
                rawOcrText = rawOcrText
            )

            val expenseOut = try {
                expenseService.createExpense(dto, currentUser)
            } catch (e: Exception) {
                log.error("Failed to create expense for $filename: ${e.message}")
                errors.add(BulkUploadError(filename, "Could not create expense: ${e.message}"))
                continue
            }

            try {
                expenseService.uploadReceipts(expenseOut.id, listOf(file), currentUser)
            } catch (e: ResponseStatusException) {
                log.warn("Receipt storage failed for expense ${expenseOut.id}: ${e.reason ?: e.message}")
                errors.add(BulkUploadError(filename, e.reason ?: e.message))
            } catch (e: Exception) {
                log.warn("Receipt storage failed for expense ${expenseOut.id}: ${e.message}")
                errors.add(BulkUploadError(filename, e.message ?: "Could not upload receipt"))
            }

            created.add(expenseOut)
        }

        return ResponseEntity.ok(BulkUploadResult(created, errors))
    }
}
