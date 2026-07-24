package eu.nt.xpenses.controllers

import eu.nt.xpenses.dto.expense.BulkUploadError
import eu.nt.xpenses.dto.expense.BulkUploadResult
import eu.nt.xpenses.dto.expense.ExpenseCreate
import eu.nt.xpenses.dto.expense.ExpenseOut
import eu.nt.xpenses.model.*
import eu.nt.xpenses.repositories.*
import eu.nt.xpenses.services.ExpenseService
import eu.nt.xpenses.services.OcrService
import eu.nt.xpenses.services.StorageService
import eu.nt.xpenses.services.mapper.ExpenseMapper
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
import java.io.File
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate

@RestController
@RequestMapping("/api/expenses")
class BulkExpenseController(
    private val expenseService: ExpenseService,
    private val expenseRepository: ExpenseRepository,
    private val receiptRepository: ReceiptRepository,
    private val ocrService: OcrService,
    private val expenseMapper: ExpenseMapper,
    private val storageService: StorageService,
) {
    private val log = LoggerFactory.getLogger(javaClass)

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

        val allowedExt = setOf("jpg", "jpeg", "png", "webp", "pdf")
        val created = mutableListOf<ExpenseOut>()
        val errors = mutableListOf<BulkUploadError>()
        val today = LocalDate.now().toString()

        for (file in files) {
            val filename = file.originalFilename ?: "receipt"
            val ext = filename.substringAfterLast('.', "").lowercase()

            if (ext !in allowedExt) {
                errors.add(BulkUploadError(filename, "File type .$ext not supported"))
                continue
            }
            if (file.size > 10 * 1024 * 1024) {
                errors.add(BulkUploadError(filename, "File exceeds 10 MB limit"))
                continue
            }
            try {
                validateMagicBytes(file.bytes, ext)
            } catch (e: Exception) {
                errors.add(BulkUploadError(filename, e.message ?: "Invalid file format"))
                continue
            }

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
                reportId = null,
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

            try {
                val relativePath = saveReceipt(expense.id!!, filename, file.bytes)
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
            }

            created.add(expenseMapper.toExpenseOut(expense))
        }

        return ResponseEntity.ok(BulkUploadResult(created, errors))
    }

    private fun saveReceipt(expenseId: Int, filename: String, content: ByteArray): String {
        val rawFilename = File(filename).name
        val ext = rawFilename.substringAfterLast(".", "").lowercase()
        val now = LocalDate.now()
        val subdir = "${now.year}/${String.format("%02d", now.monthValue)}"
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
        if (ext == "webp") {
            val webpSignature = byteArrayOf(0x57, 0x45, 0x42, 0x50)
            if (content.size < 12 || !content.copyOfRange(8, 12).contentEquals(webpSignature)) {
                throw IllegalArgumentException("File content does not match .webp format")
            }
        }
    }
}
